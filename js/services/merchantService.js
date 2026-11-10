import { initializeFirebase } from "../config/firebase-config.js";

const MERCHANT_KEY = "sjek.merchants.v1";
const DEMO_MERCHANTS = [
  {
    id: "merchant-nusantara", name: "Dapur Nusantara", ownerUid: "demo-merchant", address: "Jl. Sudirman No. 12",
    lat: 3.5852, lng: 98.6756, isOpen: true, rating: 4.8, category: "Nasi",
    bannerUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80",
    menu: [
      { id: "menu-nasi-ayam", name: "Nasi Ayam Sambal", price: 25000, description: "Nasi hangat, ayam berbumbu, sambal pilihan.", isAvailable: true, category: "Nasi", variants: ["Pedas 1", "Pedas 3", "Pedas 5"] },
      { id: "menu-es-teh", name: "Es Teh Nusantara", price: 7000, description: "Teh melati dingin.", isAvailable: true, category: "Minuman", variants: ["Kurang manis", "Normal"] },
      { id: "menu-pisang", name: "Pisang Crispy", price: 18000, description: "Pisang goreng renyah dengan topping.", isAvailable: true, category: "Camilan", variants: ["Cokelat", "Keju"] }
    ]
  },
  {
    id: "merchant-burger", name: "Burger Sudut", ownerUid: "demo-merchant", address: "Jl. Iskandar Muda No. 8",
    lat: 3.5774, lng: 98.6618, isOpen: true, rating: 4.6, category: "Cepat Saji",
    bannerUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
    menu: [{ id: "menu-burger", name: "Burger Sapi SJek", price: 32000, description: "Burger sapi dengan sayuran segar.", isAvailable: true, category: "Cepat Saji", variants: ["Original", "Tambah keju"] }]
  },
  {
    id: "merchant-kopi", name: "Kopi Pagi", ownerUid: "demo-merchant", address: "Jl. Gatot Subroto No. 21",
    lat: 3.5901, lng: 98.6682, isOpen: true, rating: 4.7, category: "Minuman",
    bannerUrl: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80",
    menu: [{ id: "menu-kopi-susu", name: "Kopi Susu Gula Aren", price: 22000, description: "Espresso, susu, dan gula aren.", isAvailable: true, category: "Minuman", variants: ["Dingin", "Panas"] }]
  }
];

function readMerchants() {
  try {
    const stored = localStorage.getItem(MERCHANT_KEY);
    return stored ? JSON.parse(stored) : DEMO_MERCHANTS;
  } catch (error) {
    console.error("Data toko lokal tidak dapat dibaca.", error);
    throw new Error("Penyimpanan data toko rusak; periksa data browser sebelum melanjutkan.");
  }
}

function writeMerchants(merchants) {
  localStorage.setItem(MERCHANT_KEY, JSON.stringify(merchants));
  window.dispatchEvent(new CustomEvent("sjek:data-changed", { detail: { key: MERCHANT_KEY } }));
}

async function getRemoteMerchants() {
  const firebase = await initializeFirebase();
  if (!firebase) return null;
  const { collection, getDocs } = firebase.firestoreSdk;
  const snapshot = await getDocs(collection(firebase.db, "merchants"));
  return { firebase, merchants: snapshot.docs.map(item => ({ id: item.id, ...item.data() })) };
}

export class MerchantService {
  static async listMerchants() {
    const remote = await getRemoteMerchants();
    return (remote ? remote.merchants : readMerchants()).map(({ menu, ...merchant }) => merchant);
  }

  static async getMerchant(merchantId) {
    const remote = await getRemoteMerchants();
    const merchant = (remote ? remote.merchants : readMerchants()).find(item => item.id === merchantId);
    if (!merchant) throw new Error("Toko tidak ditemukan.");
    return merchant;
  }

  static async listMenu(merchantId) {
    const remote = await getRemoteMerchants();
    if (!remote) return readMerchants().find(item => item.id === merchantId)?.menu || [];
    const { collection, getDocs } = remote.firebase.firestoreSdk;
    const snapshot = await getDocs(collection(remote.firebase.db, "merchants", merchantId, "menu"));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  }

  static async saveMenuItem(merchantId, item) {
    if (!item.name?.trim() || !Number.isFinite(Number(item.price)) || Number(item.price) < 0) {
      throw new Error("Nama hidangan dan harga yang valid wajib diisi.");
    }
    if (!/^https:\/\/res\.cloudinary\.com\/ks6vgjfn\/image\/upload\/.+\.webp$/i.test(item.imageUrl || "")) {
      throw new Error("Foto hidangan wajib dikompres ke WebP dan diunggah ke Cloudinary.");
    }
    const menuItem = { ...item, id: item.id || `menu-${Date.now()}`, price: Number(item.price), isAvailable: item.isAvailable !== false };
    const remote = await getRemoteMerchants();
    if (remote) {
      const { collection, doc, setDoc } = remote.firebase.firestoreSdk;
      await setDoc(doc(collection(remote.firebase.db, "merchants", merchantId, "menu"), menuItem.id), menuItem);
    } else {
      const merchants = readMerchants();
      const merchant = merchants.find(entry => entry.id === merchantId);
      if (!merchant) throw new Error("Toko tidak ditemukan.");
      const index = merchant.menu.findIndex(entry => entry.id === menuItem.id);
      if (index < 0) merchant.menu.push(menuItem);
      else merchant.menu[index] = menuItem;
      writeMerchants(merchants);
    }
    return menuItem;
  }

  static async deleteMenuItem(merchantId, menuId) {
    const firebase = await initializeFirebase();
    if (firebase) {
      const { deleteDoc, doc } = firebase.firestoreSdk;
      await deleteDoc(doc(firebase.db, "merchants", merchantId, "menu", menuId));
    } else {
      const merchants = readMerchants();
      const merchant = merchants.find(entry => entry.id === merchantId);
      if (merchant) merchant.menu = merchant.menu.filter(item => item.id !== menuId);
      writeMerchants(merchants);
    }
  }

  static async updateMenuAvailability(merchantId, menuId, isAvailable) {
    const menu = await this.listMenu(merchantId);
    const item = menu.find(entry => entry.id === menuId);
    if (!item) throw new Error("Hidangan tidak ditemukan.");
    return this.saveMenuItem(merchantId, { ...item, isAvailable });
  }

  static async setMerchantOpen(merchantId, isOpen) {
    const firebase = await initializeFirebase();
    if (firebase) {
      const { doc, updateDoc } = firebase.firestoreSdk;
      await updateDoc(doc(firebase.db, "merchants", merchantId), { isOpen: Boolean(isOpen) });
      return;
    }
    const merchants = readMerchants();
    const merchant = merchants.find(entry => entry.id === merchantId);
    if (!merchant) throw new Error("Toko tidak ditemukan.");
    merchant.isOpen = Boolean(isOpen);
    writeMerchants(merchants);
  }
}
