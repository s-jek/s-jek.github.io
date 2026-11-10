import { initializeFirebase } from "../config/firebase-config.js";

export const DEFAULT_COIN_SETTINGS = {
  dailyRewards: [10, 15, 20, 25, 30, 40, 75],
  updatedAt: ""
};

function requireUser(firebase) {
  const user = firebase?.auth.currentUser;
  if (!user) throw new Error("Masuk untuk menggunakan fitur koin.");
  return user;
}

export class CoinService {
  static async getSettings() {
    const firebase = await initializeFirebase();
    if (!firebase) return { ...DEFAULT_COIN_SETTINGS };
    const reference = firebase.firestoreSdk.doc(firebase.db, "coinSettings", "global");
    const snapshot = await firebase.firestoreSdk.getDoc(reference);
    return snapshot.exists()
      ? { ...DEFAULT_COIN_SETTINGS, ...snapshot.data(), configured: true }
      : { ...DEFAULT_COIN_SETTINGS, configured: false };
  }

  static async getWallet() {
    const firebase = await initializeFirebase();
    const user = requireUser(firebase);
    const snapshot = await firebase.firestoreSdk.getDoc(firebase.firestoreSdk.doc(firebase.db, "users", user.uid));
    if (!snapshot.exists()) throw new Error("Profil akun belum tersedia.");
    return { coins: Number(snapshot.data().coins) || 0, ...snapshot.data() };
  }

  static async listRewards({ includeInactive = false } = {}) {
    const firebase = await initializeFirebase();
    if (!firebase) return [];
    const { collection, getDocs, query, where } = firebase.firestoreSdk;
    const reference = collection(firebase.db, "coinRewards");
    const snapshot = await getDocs(includeInactive ? reference : query(reference, where("isActive", "==", true)));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => a.coinCost - b.coinCost);
  }

  static async saveSettings(dailyRewards) {
    if (!Array.isArray(dailyRewards) || dailyRewards.length !== 7
      || dailyRewards.some(value => !Number.isSafeInteger(value) || value < 0 || value > 100000)) {
      throw new Error("Masukkan hadiah koin yang valid untuk setiap hari.");
    }
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Layanan belum tersedia.");
    await firebase.firestoreSdk.setDoc(firebase.firestoreSdk.doc(firebase.db, "coinSettings", "global"), {
      dailyRewards,
      updatedAt: new Date().toISOString()
    });
  }

  static async saveReward(reward, id = "") {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Layanan belum tersedia.");
    const record = {
      name: String(reward.name || "").trim(),
      description: String(reward.description || "").trim(),
      type: reward.type,
      coinCost: Number(reward.coinCost),
      cashAmount: reward.type === "cash" ? Number(reward.cashAmount) : 0,
      voucherCode: reward.type === "voucher" ? String(reward.voucherCode || "").trim().toUpperCase() : "",
      isActive: Boolean(reward.isActive)
    };
    if (!record.name || !["cash", "voucher"].includes(record.type)
      || !Number.isSafeInteger(record.coinCost) || record.coinCost < 1
      || (record.type === "cash" && (!Number.isSafeInteger(record.cashAmount) || record.cashAmount < 1))
      || (record.type === "voucher" && !record.voucherCode)) {
      throw new Error("Lengkapi nama hadiah, biaya koin, dan nilai hadiahnya.");
    }
    const { collection, doc, setDoc } = firebase.firestoreSdk;
    const reference = id ? doc(firebase.db, "coinRewards", id) : doc(collection(firebase.db, "coinRewards"));
    await setDoc(reference, record);
    return reference.id;
  }

  static async removeReward(id) {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Layanan belum tersedia.");
    await firebase.firestoreSdk.deleteDoc(firebase.firestoreSdk.doc(firebase.db, "coinRewards", id));
  }

  static async claimDailyCheckIn() {
    const firebase = await initializeFirebase();
    const user = requireUser(firebase);
    const { doc, runTransaction, serverTimestamp } = firebase.firestoreSdk;
    const userRef = doc(firebase.db, "users", user.uid);
    const settings = await this.getSettings();
    const result = await runTransaction(firebase.db, async transaction => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists()) throw new Error("Profil akun belum tersedia.");
      const profile = snapshot.data();
      const now = Date.now();
      const lastTime = profile.lastCoinCheckInAt?.toMillis?.() || 0;
      if (lastTime && now - lastTime < 24 * 60 * 60 * 1000) {
        throw new Error("Check-in hari ini sudah dilakukan. Kembali lagi besok.");
      }
      const day = lastTime && now - lastTime <= 48 * 60 * 60 * 1000
        ? ((Number(profile.coinCheckInStreak) || 0) % 7) + 1
        : 1;
      const reward = settings.dailyRewards[day - 1];
      transaction.update(userRef, {
        coins: (Number(profile.coins) || 0) + reward,
        coinCheckInStreak: day,
        lastCoinCheckInAt: serverTimestamp()
      });
      return { day, reward, balance: (Number(profile.coins) || 0) + reward };
    });
    window.dispatchEvent(new CustomEvent("sjek:profile-changed"));
    return result;
  }

  static async redeem(rewardId, payout = {}) {
    const firebase = await initializeFirebase();
    const user = requireUser(firebase);
    const { collection, doc, runTransaction } = firebase.firestoreSdk;
    const userRef = doc(firebase.db, "users", user.uid);
    const rewardRef = doc(firebase.db, "coinRewards", rewardId);
    const redemptionRef = doc(collection(firebase.db, "coinRedemptions"));
    return runTransaction(firebase.db, async transaction => {
      const [profileSnapshot, rewardSnapshot] = await Promise.all([
        transaction.get(userRef), transaction.get(rewardRef)
      ]);
      if (!profileSnapshot.exists() || !rewardSnapshot.exists()) throw new Error("Hadiah tidak tersedia.");
      const profile = profileSnapshot.data();
      const reward = rewardSnapshot.data();
      if (!reward.isActive) throw new Error("Hadiah ini sedang tidak tersedia.");
      const balance = Number(profile.coins) || 0;
      if (balance < reward.coinCost) throw new Error("Koin Anda belum mencukupi.");
      const redemption = {
        uid: user.uid,
        rewardId,
        rewardName: reward.name,
        rewardType: reward.type,
        coinCost: reward.coinCost,
        cashAmount: reward.type === "cash" ? reward.cashAmount : 0,
        voucherCode: reward.type === "voucher" ? reward.voucherCode : "",
        status: "PENDING",
        createdAt: firebase.firestoreSdk.serverTimestamp(),
        ...(reward.type === "cash" ? {
          payoutProvider: String(payout.provider || "").trim(),
          payoutAccount: String(payout.account || "").trim()
        } : {})
      };
      if (reward.type === "cash" && (!redemption.payoutProvider || redemption.payoutProvider.length > 80
        || !redemption.payoutAccount || redemption.payoutAccount.length > 40)) {
        throw new Error("Lengkapi tujuan pencairan dengan data yang valid.");
      }
      transaction.set(redemptionRef, redemption);
      transaction.update(userRef, {
        coins: balance - reward.coinCost,
        lastCoinRedemptionId: redemptionRef.id
      });
      return { id: redemptionRef.id, ...redemption };
    });
  }

  static async listRedemptions(uid = "") {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Layanan belum tersedia.");
    const { collection, getDocs, query, where } = firebase.firestoreSdk;
    const reference = collection(firebase.db, "coinRedemptions");
    const snapshot = await getDocs(uid ? query(reference, where("uid", "==", uid)) : reference);
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  }

  static async reviewRedemption(redemptionId, decision, adminUid) {
    if (!["APPROVED", "REJECTED", "PAID"].includes(decision)) throw new Error("Keputusan hadiah tidak valid.");
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Layanan belum tersedia.");
    const { doc, runTransaction } = firebase.firestoreSdk;
    const redemptionRef = doc(firebase.db, "coinRedemptions", redemptionId);
    return runTransaction(firebase.db, async transaction => {
      const snapshot = await transaction.get(redemptionRef);
      if (!snapshot.exists()) throw new Error("Permintaan hadiah tidak ditemukan.");
      const redemption = snapshot.data();
      if (decision === "PAID" && (redemption.status !== "APPROVED" || redemption.rewardType !== "cash")) {
        throw new Error("Permintaan ini belum dapat ditandai selesai.");
      }
      if (decision !== "PAID" && redemption.status !== "PENDING") {
        throw new Error("Permintaan hadiah sudah ditinjau.");
      }
      const update = {
        status: decision,
        reviewedBy: adminUid,
        reviewedAt: new Date().toISOString()
      };
      if (decision === "REJECTED") {
        const userRef = doc(firebase.db, "users", redemption.uid);
        const profileSnapshot = await transaction.get(userRef);
        if (!profileSnapshot.exists()) throw new Error("Profil penerima tidak ditemukan.");
        transaction.update(userRef, { coins: (Number(profileSnapshot.data().coins) || 0) + redemption.coinCost });
      }
      transaction.update(redemptionRef, update);
      return decision;
    });
  }
}
