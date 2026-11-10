import { initializeFirebase } from "../config/firebase-config.js";

const APPLICATIONS_KEY = "sjek.partnerApplications.v1";
const CHANGE_KEY = "sjek.businessRuleChanges.v1";

function localRead(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch (error) {
    console.error(`Data ${key} tidak dapat dibaca.`, error);
    throw new Error("Data lokal tidak dapat dibaca.");
  }
}

export class PartnerService {
  static async apply(user, application) {
    if (!user?.uid || !["driver", "merchant"].includes(application.partnerType)) {
      throw new Error("Pendaftaran mitra tidak valid.");
    }
    const required = application.partnerType === "driver"
      ? ["legalName", "nik", "address", "vehiclePlate", "vehicleType", "payoutProvider", "payoutAccount", "vehiclePhotoUrl", "vehiclePhotoPublicId"]
      : ["legalName", "nik", "businessName", "businessAddress", "businessCategory", "businessLat", "businessLng", "payoutProvider", "payoutAccount", "openingHours", "storefrontPhotoUrl", "storefrontPhotoPublicId"];
    const requiredText = required.filter(field => field !== "businessLat" && field !== "businessLng");
    if (requiredText.some(field => !String(application[field] ?? "").trim())) {
      throw new Error("Lengkapi semua data wajib pada formulir mitra.");
    }
    if (!/^\d{16}$/.test(String(application.nik))) throw new Error("NIK harus terdiri dari 16 angka.");
    if (application.partnerType === "merchant"
      && (!Number.isFinite(application.businessLat) || Math.abs(application.businessLat) > 90
        || !Number.isFinite(application.businessLng) || Math.abs(application.businessLng) > 180)) {
      throw new Error("Tentukan pin lokasi toko yang valid pada peta.");
    }
    const imageFields = application.partnerType === "driver"
      ? ["vehiclePhotoUrl"]
      : ["storefrontPhotoUrl"];
    for (const field of imageFields) {
      if (!/^https:\/\/res\.cloudinary\.com\/ks6vgjfn\/image\/upload\/.+\.webp$/i.test(application[field])) {
        throw new Error("Foto wajib berupa hasil kompresi WebP yang sudah diunggah ke Cloudinary.");
      }
    }
    if (!application.agreementAccepted || application.agreementVersion !== "1.1") {
      throw new Error("Perjanjian mitra harus disetujui sebelum pendaftaran.");
    }
    const firebase = await initializeFirebase();
    if (!firebase || firebase.auth.currentUser?.uid !== user.uid) {
      throw new Error("Firebase belum siap atau sesi pengguna tidak cocok.");
    }
    const record = {
      ...application,
      applicantUid: user.uid,
      email: user.email,
      phone: user.phone,
      status: "PENDING",
      agreementAcceptedAt: new Date().toISOString(),
      submittedAt: new Date().toISOString()
    };
    const { doc, getDoc, setDoc } = firebase.firestoreSdk;
    const reference = doc(firebase.db, "partnerApplications", `${user.uid}_${application.partnerType}`);
    const existing = await getDoc(reference);
    const canReplaceLegacyApplication = existing.exists()
      && existing.data().status === "PENDING"
      && existing.data().agreementVersion === "1.0";
    if (existing.exists() && existing.data().status !== "REJECTED" && !canReplaceLegacyApplication) {
      throw new Error("Pendaftaran untuk kategori mitra ini sudah ada dan sedang diproses/aktif.");
    }
    await setDoc(reference, record);
    return record;
  }

  static async listBusinessRuleChanges() {
    const firebase = await initializeFirebase();
    if (firebase) {
      const { collection, getDocs, orderBy, query, limit, where } = firebase.firestoreSdk;
      const changes = await getDocs(query(collection(firebase.db, "businessRuleChanges"), where("audience", "==", "approved-partners"), orderBy("createdAt", "desc"), limit(30)));
      return changes.docs.map(item => ({ id: item.id, ...item.data() }));
    }
    return localRead(CHANGE_KEY).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static async watchBusinessRuleChanges(callback) {
    const firebase = await initializeFirebase();
    if (!firebase) return () => {};
    const { collection, limit, onSnapshot, orderBy, query, where } = firebase.firestoreSdk;
    return onSnapshot(
      query(collection(firebase.db, "businessRuleChanges"), where("audience", "==", "approved-partners"), orderBy("createdAt", "desc"), limit(1)),
      snapshot => callback(snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null),
      error => console.error("Notifikasi perubahan aturan SJek gagal dimuat.", error)
    );
  }

  static async listPendingApplications() {
    const firebase = await initializeFirebase();
    if (firebase) {
      const { collection, getDocs, query, where } = firebase.firestoreSdk;
      const snapshot = await getDocs(query(collection(firebase.db, "partnerApplications"), where("status", "==", "PENDING")));
      return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    }
    return localRead(APPLICATIONS_KEY).filter(item => item.status === "PENDING");
  }

  static async listMyApplications(uid) {
    const firebase = await initializeFirebase();
    if (firebase) {
      const { doc, getDoc } = firebase.firestoreSdk;
      const snapshots = await Promise.all(["driver", "merchant"].map(type => getDoc(doc(firebase.db, "partnerApplications", `${uid}_${type}`))));
      return snapshots.filter(snapshot => snapshot.exists()).map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
    }
    return localRead(APPLICATIONS_KEY).filter(item => item.applicantUid === uid);
  }

  static async reviewApplication(application, decision, reviewerUid) {
    if (!["APPROVED", "REJECTED"].includes(decision) || !reviewerUid) {
      throw new Error("Keputusan verifikasi tidak valid.");
    }
    const firebase = await initializeFirebase();
    if (!firebase || firebase.auth.currentUser?.uid !== reviewerUid) throw new Error("Firebase belum siap atau sesi admin tidak cocok.");
    const { doc, getDoc, writeBatch } = firebase.firestoreSdk;
    const applicationRef = doc(firebase.db, "partnerApplications", application.id);
    const profileRef = doc(firebase.db, "users", application.applicantUid);
    const [applicationSnapshot, profileSnapshot] = await Promise.all([getDoc(applicationRef), getDoc(profileRef)]);
    if (!applicationSnapshot.exists() || applicationSnapshot.data().status !== "PENDING") {
      throw new Error("Permohonan tidak ditemukan atau sudah ditinjau.");
    }
    if (!profileSnapshot.exists()) throw new Error("Profil pemohon tidak ditemukan.");
    const currentApplication = applicationSnapshot.data();
    const profile = profileSnapshot.data();
    const partnerRoles = new Set(profile.partnerRoles || []);
    if (decision === "APPROVED") partnerRoles.add(currentApplication.partnerType);
    const now = new Date().toISOString();
    const batch = writeBatch(firebase.db);
    batch.update(applicationRef, { status: decision, reviewedAt: now, reviewedBy: reviewerUid });
    batch.update(profileRef, {
      partnerRoles: [...partnerRoles],
      partnerStatus: { ...(profile.partnerStatus || {}), [currentApplication.partnerType]: decision },
      ...(currentApplication.partnerType === "merchant" && decision === "APPROVED"
        ? { partnerMerchantId: currentApplication.applicantUid }
        : {}),
      updatedAt: now
    });
    if (currentApplication.partnerType === "merchant" && decision === "APPROVED") {
      const merchantRef = doc(firebase.db, "merchants", currentApplication.applicantUid);
      const merchantSnapshot = await getDoc(merchantRef);
      if (!merchantSnapshot.exists()) {
        batch.set(merchantRef, {
          id: currentApplication.applicantUid,
          name: currentApplication.businessName,
          ownerUid: currentApplication.applicantUid,
          address: currentApplication.businessAddress,
          lat: Number(currentApplication.businessLat),
          lng: Number(currentApplication.businessLng),
          isOpen: false,
          rating: 0,
          category: currentApplication.businessCategory,
          bannerUrl: "",
          openingHours: currentApplication.openingHours,
          createdAt: now
        });
      }
    }
    await batch.commit();
  }

}
