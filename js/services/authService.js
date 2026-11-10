import { initializeFirebase } from "../config/firebase-config.js";

const SESSION_KEY = "sjek.session.v1";
const GMAIL_PATTERN = /^[a-z0-9._%+-]+@gmail\.com$/i;
let profileUnsubscribe = null;
let authStatePromise = null;

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (error) {
    console.error("Sesi SJek lokal tidak dapat dibaca.", error);
    return null;
  }
}

function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  const normalized = raw.startsWith("+")
    ? `+${digits}`
    : digits.startsWith("0")
      ? `+62${digits.slice(1)}`
      : digits.startsWith("62")
        ? `+${digits}`
        : "";
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("Masukkan nomor ponsel yang valid, misalnya 08123456789.");
  }
  return normalized;
}

function toProfile(firebaseUser, profile = {}, claims = {}) {
  return {
    uid: firebaseUser.uid,
    name: profile.name || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Pengguna",
    email: firebaseUser.email || "",
    phone: profile.phone || firebaseUser.phoneNumber || "",
    phoneVerified: Boolean(firebaseUser.phoneNumber || profile.phoneVerified),
    role: claims.superAdmin ? "superadmin" : claims.admin ? "admin" : "customer",
    driverAccountStatus: profile.driverAccountStatus || "ACTIVE",
    merchantAccountStatus: profile.merchantAccountStatus || "ACTIVE",
    partnerRoles: Array.isArray(profile.partnerRoles) ? profile.partnerRoles : [],
    partnerStatus: profile.partnerStatus || {},
    partnerMerchantId: profile.partnerMerchantId || "",
    coins: Number(profile.coins) || 0,
    coinCheckInStreak: Number(profile.coinCheckInStreak) || 0,
    lastCoinCheckInAt: profile.lastCoinCheckInAt || null
  };
}

function getInitialFirebaseUser(firebase) {
  if (firebase.auth.currentUser) return Promise.resolve(firebase.auth.currentUser);
  if (!authStatePromise) {
    authStatePromise = new Promise((resolve, reject) => {
      let unsubscribe;
      unsubscribe = firebase.authSdk.onAuthStateChanged(firebase.auth, user => {
        unsubscribe?.();
        authStatePromise = null;
        resolve(user);
      }, error => {
        unsubscribe?.();
        authStatePromise = null;
        reject(error);
      });
    });
  }
  return authStatePromise;
}

export class AuthService {
  static getCurrentUser() {
    return readSession();
  }

  static async getPhoneSetupState() {
    const firebase = await initializeFirebase();
    if (!firebase) return null;
    const currentUser = await getInitialFirebaseUser(firebase);
    if (!currentUser || !currentUser.emailVerified || !GMAIL_PATTERN.test(currentUser.email || "")) return null;
    const reference = firebase.firestoreSdk.doc(firebase.db, "users", currentUser.uid);
    const snapshot = await firebase.firestoreSdk.getDoc(reference);
    if (snapshot.data()?.phone || currentUser.phoneNumber) return null;
    return {
      name: currentUser.displayName || "",
      email: currentUser.email
    };
  }

  static async hydrateSession() {
    const firebase = await initializeFirebase();
    if (!firebase) return null;
    const currentUser = await getInitialFirebaseUser(firebase);
    if (!currentUser || !currentUser.emailVerified || !GMAIL_PATTERN.test(currentUser.email || "")) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const reference = firebase.firestoreSdk.doc(firebase.db, "users", currentUser.uid);
    const snapshot = await firebase.firestoreSdk.getDoc(reference);
    const existing = snapshot.exists() ? snapshot.data() : {};
    const phone = existing.phone || currentUser.phoneNumber;
    if (!phone) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const profileData = snapshot.exists()
      ? existing
      : {
          name: currentUser.displayName || currentUser.email.split("@")[0],
          email: currentUser.email,
          phone,
          phoneVerified: Boolean(currentUser.phoneNumber),
          role: "customer",
          partnerRoles: [],
          coins: 0,
          coinCheckInStreak: 0,
          createdAt: new Date().toISOString()
        };
    if (!snapshot.exists()) await firebase.firestoreSdk.setDoc(reference, profileData);
    const token = await currentUser.getIdTokenResult();
    const profile = toProfile(currentUser, profileData, token.claims);
    localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    this.watchProfile(firebase, reference, currentUser, token.claims);
    return profile;
  }

  static watchProfile(firebase, reference, firebaseUser, claims) {
    profileUnsubscribe?.();
    profileUnsubscribe = firebase.firestoreSdk.onSnapshot(reference, snapshot => {
      if (!snapshot.exists() || firebase.auth.currentUser?.uid !== firebaseUser.uid) return;
      const profile = toProfile(firebaseUser, snapshot.data(), claims);
      localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
      window.dispatchEvent(new CustomEvent("sjek:profile-changed"));
    }, error => console.error("Sinkronisasi profil SJek gagal.", error));
  }

  static async signInWithGoogle() {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Firebase belum siap. Periksa konfigurasi dan koneksi internet.");
    const provider = new firebase.authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const credential = await firebase.authSdk.signInWithPopup(firebase.auth, provider);
    if (!credential.user.emailVerified || !GMAIL_PATTERN.test(credential.user.email || "")) {
      await firebase.authSdk.signOut(firebase.auth);
      throw new Error("Gunakan akun Google dengan alamat Gmail.");
    }
    const profile = await this.hydrateSession();
    return profile ? { profile } : { needsPhone: true };
  }

  static async completePhoneSetup(phone) {
    const firebase = await initializeFirebase();
    const currentUser = firebase?.auth.currentUser;
    if (!currentUser || !currentUser.emailVerified || !GMAIL_PATTERN.test(currentUser.email || "")) {
      throw new Error("Masuk menggunakan Google terlebih dahulu.");
    }
    const normalizedPhone = normalizePhone(phone);
    const reference = firebase.firestoreSdk.doc(firebase.db, "users", currentUser.uid);
    const snapshot = await firebase.firestoreSdk.getDoc(reference);
    const profile = {
      name: currentUser.displayName || currentUser.email.split("@")[0],
      phone: normalizedPhone,
      phoneVerified: false,
      updatedAt: new Date().toISOString()
    };
    if (snapshot.exists()) {
      await firebase.firestoreSdk.updateDoc(reference, profile);
    } else {
      await firebase.firestoreSdk.setDoc(reference, {
        ...profile,
        email: currentUser.email,
        role: "customer",
        partnerRoles: [],
        coins: 0,
        coinCheckInStreak: 0,
        createdAt: new Date().toISOString()
      });
    }
    const hydrated = await this.hydrateSession();
    if (!hydrated) throw new Error("Profil akun belum dapat dimuat.");
    return hydrated;
  }

  static async signOut() {
    const firebase = await initializeFirebase();
    if (firebase?.auth.currentUser) await firebase.authSdk.signOut(firebase.auth);
    authStatePromise = null;
    profileUnsubscribe?.();
    profileUnsubscribe = null;
    localStorage.removeItem(SESSION_KEY);
  }
}
