import { initializeFirebase } from "../config/firebase-config.js";
import { DEFAULT_TARIFFS } from "./pricingService.js";
import { NotificationService } from "./notificationService.js";
import { FinanceService } from "./financeService.js";

const ORDER_KEY = "sjek.orders.v1";
const TARIFF_KEY = "sjek.tariffs.v1";
const VOUCHER_KEY = "sjek.vouchers.v1";
const DEMO_VOUCHERS = [{
  code: "SJEKHEMAT", type: "PERCENT", value: 50, maxDiscount: 10000,
  minSpend: 20000, quota: 100, usedCount: 0, isActive: true, target: "SUBTOTAL", validUntil: "2099-12-31"
}];

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Data lokal ${key} tidak dapat dibaca.`, error);
    throw new Error("Penyimpanan lokal SJek rusak; periksa data browser sebelum melanjutkan.");
  }
}

async function remoteCollection(name) {
  const firebase = await initializeFirebase();
  if (!firebase) return null;
  const { collection, getDocs } = firebase.firestoreSdk;
  const snapshot = await getDocs(collection(firebase.db, name));
  return { firebase, collection, snapshot, docs: snapshot.docs.map(item => ({ id: item.id, ...item.data() })) };
}

export class OrderService {
  static async notifyOrderEvent(orderId, eventType) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const sent = await NotificationService.sendOrderEvent(orderId, eventType);
        if (!sent) console.warn(`Notifikasi ${eventType} dilewati: notificationApiBaseUrl belum dikonfigurasi.`);
        return;
      } catch (error) {
        if (!error.retryable || attempt === 2) {
          console.error(`Notifikasi ${eventType} gagal dikirim.`, error);
          return;
        }
        await new Promise(resolve => window.setTimeout(resolve, (attempt + 1) * 500));
      }
    }
  }

  static recordBusinessRuleChange(firebase, batch, { title, details, before, after }) {
    const change = {
      title,
      details,
      before,
      after,
      audience: "approved-partners",
      createdAt: new Date().toISOString()
    };
    const changeRef = firebase.firestoreSdk.doc(firebase.firestoreSdk.collection(firebase.db, "businessRuleChanges"));
    batch.set(changeRef, change);
  }

  static async listOrders(filters = {}) {
    const firebase = await initializeFirebase();
    let orders;
    if (firebase) {
      const { collection, getDocs, query, where } = firebase.firestoreSdk;
      const constraints = Object.entries(filters).filter(([, value]) => value).map(([field, value]) => where(field, "==", value));
      if (filters.merchantId) constraints.push(where("driverId", "!=", ""));
      const snapshot = await getDocs(query(collection(firebase.db, "orders"), ...constraints));
      orders = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    } else orders = readLocal(ORDER_KEY, []);
    return orders.filter(order =>
      (!filters.customerId || order.customerId === filters.customerId) &&
      (!filters.driverId || order.driverId === filters.driverId) &&
      (!filters.merchantId || order.merchantId === filters.merchantId) &&
      (!filters.serviceType || order.serviceType === filters.serviceType) &&
      (!filters.orderStatus || order.orderStatus === filters.orderStatus)
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static async subscribeAvailableDriverOrders(driverId, callback, onError = console.error) {
    const firebase = await initializeFirebase();
    if (!firebase) return () => {};
    const { collection, onSnapshot, query, where } = firebase.firestoreSdk;
    const orders = collection(firebase.db, "orders");
    let active = true;
    let refreshing = false;
    let refreshRequested = false;
    const unsubscribe = [
      onSnapshot(query(orders, where("orderStatus", "==", "PENDING"), where("driverId", "==", "")), () => refresh(), onError),
      onSnapshot(query(orders, where("orderStatus", "==", "ACCEPTED"), where("driverId", "==", "")), () => refresh(), onError),
      onSnapshot(query(orders, where("driverId", "==", driverId)), () => refresh(), onError)
    ];
    async function refresh() {
      if (!active) return;
      if (refreshing) {
        refreshRequested = true;
        return;
      }
      refreshing = true;
      try {
        callback(await OrderService.listAvailableDriverOrders(driverId));
      } catch (error) {
        onError(error);
      } finally {
        refreshing = false;
        if (refreshRequested && active) {
          refreshRequested = false;
          refresh();
        }
      }
    }
    await refresh();
    return () => {
      active = false;
      unsubscribe.forEach(stop => stop());
    };
  }

  static async subscribeMerchantOrders(merchantId, callback, onError = console.error) {
    const firebase = await initializeFirebase();
    if (!firebase) return () => {};
    const { collection, onSnapshot, query, where } = firebase.firestoreSdk;
    const orders = collection(firebase.db, "orders");
    const unsubscribe = onSnapshot(query(
      orders,
      where("merchantId", "==", merchantId),
      where("driverId", "!=", "")
    ), snapshot => {
      callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }, onError);
    return unsubscribe;
  }

  static async watchOrder(orderId, callback, onError = console.error) {
    const firebase = await initializeFirebase();
    if (!firebase) return () => {};
    const reference = firebase.firestoreSdk.doc(firebase.db, "orders", orderId);
    return firebase.firestoreSdk.onSnapshot(reference, snapshot => {
      if (snapshot.exists()) callback({ id: snapshot.id, ...snapshot.data() });
    }, onError);
  }

  static async updateDriverLocation(orderId, point) {
    const firebase = await initializeFirebase();
    const user = firebase?.auth.currentUser;
    if (!firebase || !user) throw new Error("Masuk kembali untuk membagikan lokasi.");
    if (!Number.isFinite(point?.lat) || Math.abs(point.lat) > 90
      || !Number.isFinite(point?.lng) || Math.abs(point.lng) > 180) {
      throw new Error("Lokasi saat ini tidak valid.");
    }

    const now = new Date().toISOString();
    await firebase.firestoreSdk.updateDoc(
      firebase.firestoreSdk.doc(firebase.db, "orders", orderId),
      {
        driverLocation: { lat: point.lat, lng: point.lng },
        driverLocationUpdatedAt: now
      }
    );
  }

  static async updateDriverPresence(uid, point, isOnline) {
    const firebase = await initializeFirebase();
    if (!firebase || firebase.auth.currentUser?.uid !== uid) {
      throw new Error("Sesi driver tidak tersedia.");
    }
    if (!Number.isFinite(point?.lat) || Math.abs(point.lat) > 90
      || !Number.isFinite(point?.lng) || Math.abs(point.lng) > 180) {
      throw new Error("Lokasi saat ini tidak valid.");
    }
    const { doc, setDoc } = firebase.firestoreSdk;
    await setDoc(doc(firebase.db, "driverLocations", uid), {
      lat: point.lat,
      lng: point.lng,
      isOnline: Boolean(isOnline),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }

  static async setDriverOffline(uid) {
    const firebase = await initializeFirebase();
    if (!firebase || firebase.auth.currentUser?.uid !== uid) {
      throw new Error("Sesi driver tidak tersedia.");
    }
    const { doc, getDoc, setDoc } = firebase.firestoreSdk;
    const reference = doc(firebase.db, "driverLocations", uid);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) return;
    await setDoc(reference, { isOnline: false, updatedAt: new Date().toISOString() }, { merge: true });
  }

  static async subscribeDriverLocations(callback, onError = console.error) {
    const firebase = await initializeFirebase();
    if (!firebase) return () => {};
    const { collection, onSnapshot } = firebase.firestoreSdk;
    return onSnapshot(collection(firebase.db, "driverLocations"), snapshot => {
      callback(snapshot.docs.map(item => ({ uid: item.id, ...item.data() })));
    }, onError);
  }

  static async updatePartnerAccount(uid, updates) {
    const firebase = await initializeFirebase();
    if (!firebase || !firebase.auth.currentUser) throw new Error("Sesi admin tidak tersedia.");
    const { doc, writeBatch } = firebase.firestoreSdk;
    const batch = writeBatch(firebase.db);
    batch.update(doc(firebase.db, "users", uid), {
      ...updates,
      updatedAt: new Date().toISOString()
    });
    if (updates.driverAccountStatus) {
      batch.set(doc(firebase.db, "driverLocations", uid), {
        accountStatus: updates.driverAccountStatus
      }, { merge: true });
    }
    await batch.commit();
  }

  static async acceptMerchantOrder(orderId, merchantId) {
    const firebase = await initializeFirebase();
    const user = firebase?.auth.currentUser;
    if (!firebase || !user || !merchantId) throw new Error("Sesi toko tidak tersedia.");
    const now = new Date().toISOString();
    await firebase.firestoreSdk.updateDoc(
      firebase.firestoreSdk.doc(firebase.db, "orders", orderId),
      {
        merchantStatus: "ACCEPTED",
        merchantAcceptedAt: now,
        updatedAt: now
      }
    );
    this.notifyOrderEvent(orderId, "merchant-accepted");
  }

  static async listAvailableDriverOrders(driverId) {
    const firebase = await initializeFirebase();
    if (!firebase) {
      return this.listOrders().then(orders => orders.filter(order =>
        order.orderStatus === "PENDING" ||
        (order.orderStatus === "ACCEPTED" && !order.driverId) ||
        (order.driverId === driverId && !["COMPLETED", "CANCELLED"].includes(order.orderStatus))
      ));
    }
    const { collection, getDocs, query, where } = firebase.firestoreSdk;
    const orders = collection(firebase.db, "orders");
    const [pending, accepted, assigned] = await Promise.all([
      getDocs(query(orders, where("orderStatus", "==", "PENDING"), where("driverId", "==", ""))),
      getDocs(query(orders, where("orderStatus", "==", "ACCEPTED"), where("driverId", "==", ""))),
      getDocs(query(orders, where("driverId", "==", driverId)))
    ]);
    const byId = new Map([...pending.docs, ...accepted.docs, ...assigned.docs].map(item => [item.id, { id: item.id, ...item.data() }]));
    return [...byId.values()].filter(order => !["COMPLETED", "CANCELLED"].includes(order.orderStatus))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static async createOrder(input) {
    if (!["OJEK", "SFOOD", "SSEND"].includes(input.serviceType)) throw new Error("Jenis layanan pesanan tidak valid.");
    if (!input.pickup || !input.dropoff) throw new Error("Data pesanan belum lengkap.");
    if (input.serviceType === "OJEK") {
      const firebase = await initializeFirebase();
      const uid = firebase?.auth.currentUser?.uid;
      if (!firebase || !uid || input.customerId !== uid) throw new Error("Masuk kembali sebelum memesan Ojek.");
      const validPoint = point => Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90
        && Number.isFinite(point?.lng) && Math.abs(point.lng) <= 180;
      if (!validPoint(input.pickup) || !validPoint(input.dropoff)) throw new Error("Tentukan titik jemput dan tujuan yang valid pada peta.");
      if (!String(input.pickup.address || "").trim() || !String(input.dropoff.address || "").trim()) {
        throw new Error("Alamat jemput dan tujuan wajib diisi.");
      }
      const passengerName = String(input.passenger?.name || "").trim();
      const passengerPhone = String(input.passenger?.phone || "").trim();
      if (!passengerName || !passengerPhone) throw new Error("Nama dan nomor ponsel penumpang wajib diisi.");
      const pricing = input.pricingBreakdown || {};
      const baseDeliveryFare = pricing.baseDeliveryFare ?? pricing.deliveryFare;
      const driverCommissionPct = pricing.driverCommissionPct ?? DEFAULT_TARIFFS.driverCommissionPct;
      const merchantCommissionPct = pricing.merchantCommissionPct ?? DEFAULT_TARIFFS.merchantCommissionPct;
      if (![pricing.distanceKm, pricing.deliveryFare, pricing.platformFee].every(Number.isFinite)
        || pricing.distanceKm <= 0 || pricing.deliveryFare < 0 || pricing.platformFee < 0
        || !Number.isFinite(baseDeliveryFare) || baseDeliveryFare < 0
        || !Number.isFinite(driverCommissionPct) || driverCommissionPct < 0 || driverCommissionPct > 100
        || !Number.isFinite(merchantCommissionPct) || merchantCommissionPct < 0 || merchantCommissionPct > 100
        || !Number.isFinite(pricing.pickupDistanceKm || 0) || !Number.isFinite(pricing.pickupSurcharge || 0)
        || (pricing.pickupDistanceKm || 0) < 0 || (pricing.pickupSurcharge || 0) < 0
        || pricing.deliveryFare !== baseDeliveryFare + (pricing.pickupSurcharge || 0)) {
        throw new Error("Estimasi perjalanan belum siap. Pilih titik jemput dan tujuan.");
      }
      const orderRef = firebase.firestoreSdk.doc(firebase.firestoreSdk.collection(firebase.db, "orders"));
      const now = new Date().toISOString();
      const order = {
        id: orderRef.id,
        serviceType: "OJEK",
        customerId: uid,
        merchantId: "",
        driverId: "",
        orderStatus: "PENDING",
        pickup: input.pickup,
        dropoff: input.dropoff,
        passenger: { name: passengerName, phone: passengerPhone, count: 1 },
        items: [],
        pricingBreakdown: {
          distanceKm: pricing.distanceKm,
          baseDeliveryFare,
          deliveryFare: pricing.deliveryFare,
          platformFee: pricing.platformFee,
          driverCommissionPct,
          merchantCommissionPct,
          pickupDistanceKm: pricing.pickupDistanceKm || 0,
          pickupSurcharge: pricing.pickupSurcharge || 0,
          voucherDiscount: 0,
          totalCustomerPay: pricing.deliveryFare + pricing.platformFee,
          isEstimate: true
        },
        payment: { method: "COD", status: "UNPAID" },
        createdAt: now,
        updatedAt: now
      };
      await firebase.firestoreSdk.setDoc(orderRef, order);
      this.notifyOrderEvent(orderRef.id, "order-created");
      return order;
    }
    throw new Error("Pembuatan pesanan dinonaktifkan pada mode gratis karena harga dan ledger tidak dapat divalidasi dengan aman tanpa backend tepercaya.");
  }

  static async updateOrderStatus(orderId, orderStatus, actor = {}) {
    const allowed = new Set(["PENDING", "ACCEPTED", "PROCESSING", "ON_THE_WAY", "COMPLETED", "CANCELLED"]);
    if (!allowed.has(orderStatus)) throw new Error("Status pesanan tidak valid.");
    const firebase = await initializeFirebase();
    if (!firebase || !firebase.auth.currentUser) throw new Error("Firebase belum siap atau sesi pengguna telah berakhir.");
    const { doc, runTransaction } = firebase.firestoreSdk;
    const uid = firebase.auth.currentUser.uid;
    if (orderStatus === "ACCEPTED" && actor.driverId === uid) {
      const { getDoc } = firebase.firestoreSdk;
      const [profile, driverOrders, settlements, tariffs] = await Promise.all([
        getDoc(doc(firebase.db, "users", uid)),
        this.listOrders({ driverId: uid }),
        FinanceService.listDriverSettlements(uid),
        this.getTariffs()
      ]);
      if (profile.data()?.driverAccountStatus === "SUSPENDED"
        || FinanceService.calculateDriverSettlementStatus(driverOrders, settlements, tariffs).blockedByFinance) {
        throw new Error("Akun atau setoran driver belum memenuhi syarat untuk menerima order.");
      }
    }
    const orderRef = doc(firebase.db, "orders", orderId);
    let previousStatus = "";
    const order = await runTransaction(firebase.db, async transaction => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists()) throw new Error("Pesanan tidak ditemukan.");
      const current = snapshot.data();
      previousStatus = current.orderStatus;
      const driverAccepting = orderStatus === "ACCEPTED" && actor.driverId === uid
        && ["PENDING", "ACCEPTED"].includes(current.orderStatus)
        && (!current.driverId || current.driverId === uid);
      const next = {
        ...current,
        orderStatus,
        updatedAt: new Date().toISOString(),
        ...(driverAccepting ? { driverId: uid } : {})
      };
      transaction.update(orderRef, {
        orderStatus,
        updatedAt: next.updatedAt,
        ...(driverAccepting ? { driverId: uid } : {})
      });
      return next;
    });
    if (previousStatus !== orderStatus) {
      if (orderStatus === "ACCEPTED" && order.driverId === uid) this.notifyOrderEvent(orderId, "order-accepted");
      if (orderStatus === "COMPLETED" && order.driverId === uid) this.notifyOrderEvent(orderId, "order-completed");
    }
    window.dispatchEvent(new CustomEvent("sjek:data-changed", { detail: { key: ORDER_KEY } }));
    return { ...order, orderStatus };
  }

  static async getTariffs() {
    const firebase = await initializeFirebase();
    if (firebase) {
      const { doc, getDoc } = firebase.firestoreSdk;
      const snapshot = await getDoc(doc(firebase.db, "tariffs", "global_settings"));
      return snapshot.exists() ? { ...DEFAULT_TARIFFS, ...snapshot.data() } : { ...DEFAULT_TARIFFS };
    }
    return { ...DEFAULT_TARIFFS, ...readLocal(TARIFF_KEY, {}) };
  }

  static async saveTariffs(tariffs) {
    const updated = { ...DEFAULT_TARIFFS, ...tariffs };
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Firebase belum siap. Aturan bisnis tidak disimpan secara lokal.");
    const { doc, getDoc, writeBatch } = firebase.firestoreSdk;
    const reference = doc(firebase.db, "tariffs", "global_settings");
    const snapshot = await getDoc(reference);
    const previous = snapshot.exists() ? snapshot.data() : DEFAULT_TARIFFS;
    const batch = writeBatch(firebase.db);
    batch.set(reference, updated, { merge: true });
    this.recordBusinessRuleChange(firebase, batch, {
      title: "Perubahan aturan tarif dan pembagian komisi",
      details: "Tarif layanan, biaya jemput, deposit mitra, biaya layanan, atau komisi platform diperbarui.",
      before: previous,
      after: updated
    });
    await batch.commit();
    return updated;
  }

  static async listVouchers() {
    const remote = await remoteCollection("vouchers");
    return remote ? remote.docs : readLocal(VOUCHER_KEY, DEMO_VOUCHERS);
  }

  static async saveVoucher(voucher) {
    if (!voucher.code || !["PERCENT", "FIXED"].includes(voucher.type)) throw new Error("Kode atau tipe voucher tidak valid.");
    const normalized = { ...voucher, code: voucher.code.trim().toUpperCase(), usedCount: voucher.usedCount || 0 };
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Firebase belum siap. Aturan bisnis tidak disimpan secara lokal.");
    const { doc, getDoc, writeBatch } = firebase.firestoreSdk;
    const reference = doc(firebase.db, "vouchers", normalized.code);
    const snapshot = await getDoc(reference);
    const previous = snapshot.exists() ? snapshot.data() : null;
    const batch = writeBatch(firebase.db);
    batch.set(reference, normalized);
    this.recordBusinessRuleChange(firebase, batch, {
      title: `Aturan voucher ${normalized.code} diperbarui`,
      details: "Perubahan kode promo, diskon, syarat transaksi, kuota, atau masa aktif berlaku untuk pesanan baru.",
      before: previous,
      after: normalized
    });
    await batch.commit();
    return normalized;
  }

  static async deleteVoucher(code) {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Firebase belum siap. Aturan bisnis tidak disimpan secara lokal.");
    const { doc, getDoc, writeBatch } = firebase.firestoreSdk;
    const reference = doc(firebase.db, "vouchers", String(code).trim().toUpperCase());
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) throw new Error("Voucher tidak ditemukan.");
    const batch = writeBatch(firebase.db);
    batch.delete(reference);
    this.recordBusinessRuleChange(firebase, batch, {
      title: `Voucher ${String(code).trim().toUpperCase()} dihapus`,
      details: "Voucher ini tidak lagi tersedia untuk pesanan baru.",
      before: snapshot.data(),
      after: null
    });
    await batch.commit();
  }

}
