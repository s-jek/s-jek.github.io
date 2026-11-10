import { initializeFirebase } from "../config/firebase-config.js";

const publicPaths = new Set(["/customer/ojek", "/customer/sfood", "/customer/ssend"]);

function validBanner(banner) {
  const ctaPath = publicPaths.has(banner.ctaPath) ? banner.ctaPath : "/customer/ojek";
  return {
    title: String(banner.title || "").trim().slice(0, 80),
    subtitle: String(banner.subtitle || "").trim().slice(0, 180),
    imageUrl: String(banner.imageUrl || ""),
    ctaLabel: String(banner.ctaLabel || "Jelajahi").trim().slice(0, 28),
    ctaPath,
    isActive: Boolean(banner.isActive),
    order: Math.max(0, Math.min(99, Number(banner.order) || 0))
  };
}

export class BannerService {
  static async listActive() {
    const firebase = await initializeFirebase();
    if (!firebase) return [];
    const { collection, getDocs, query, where } = firebase.firestoreSdk;
    const snapshot = await getDocs(query(collection(firebase.db, "banners"), where("isActive", "==", true)));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.isActive)
      .sort((a, b) => a.order - b.order);
  }

  static async listAll() {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Layanan belum tersedia.");
    const snapshot = await firebase.firestoreSdk.getDocs(firebase.firestoreSdk.collection(firebase.db, "banners"));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => a.order - b.order);
  }

  static async save(banner, id = "") {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Layanan belum tersedia.");
    const { collection, doc, setDoc } = firebase.firestoreSdk;
    const reference = id
      ? doc(firebase.db, "banners", id)
      : doc(collection(firebase.db, "banners"));
    await setDoc(reference, { ...validBanner(banner), updatedAt: new Date().toISOString() }, { merge: true });
    return reference.id;
  }

  static async remove(id) {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Layanan belum tersedia.");
    await firebase.firestoreSdk.deleteDoc(firebase.firestoreSdk.doc(firebase.db, "banners", id));
  }
}
