import { firebaseConfig, initializeFirebase } from "../config/firebase-config.js";

const DEVICE_KEY = "sjek.pushDeviceId.v1";
const activeMessaging = new WeakSet();
const playedSounds = new Map();
const displayedEvents = new Map();
const NOTIFICATION_LABELS = {
  "order-created": ["Pesanan kurir baru", "Ada pesanan baru di sekitar Anda."],
  "order-accepted": ["Pesanan diterima", "Kurir telah menerima pesanan Anda."],
  "merchant-accepted": ["Pesanan diterima toko", "Toko mulai menyiapkan pesanan Anda."],
  "order-completed": ["Pesanan selesai", "Pesanan Anda telah selesai."]
};

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export class NotificationService {
  static async enablePush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      throw new Error("Browser ini belum mendukung notifikasi push.");
    }
    if (!firebaseConfig.vapidPublicKey) throw new Error("VAPID key belum dipasang di konfigurasi aplikasi.");
    const firebase = await initializeFirebase();
    const currentUser = firebase?.auth.currentUser;
    if (!firebase || !currentUser) throw new Error("Masuk untuk mengaktifkan notifikasi.");
    const permission = Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permission !== "granted") throw new Error("Izin notifikasi belum diberikan.");
    const registration = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
    const messagingModule = await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-messaging.js");
    if (!await messagingModule.isSupported()) throw new Error("Push notification tidak didukung pada browser ini.");
    const messaging = messagingModule.getMessaging(firebase.app);
    const token = await messagingModule.getToken(messaging, {
      vapidKey: firebaseConfig.vapidPublicKey,
      serviceWorkerRegistration: registration
    });
    if (!token) throw new Error("Browser belum dapat didaftarkan untuk notifikasi.");
    if (!activeMessaging.has(messaging)) {
      activeMessaging.add(messaging);
      messagingModule.onMessage(messaging, payload => {
        const eventType = payload.data?.eventType;
        const [title, fallbackBody] = this.labelFor(eventType) || ["Pembaruan SJek", "Ada pembaruan pesanan."];
        window.dispatchEvent(new CustomEvent("sjek:push-notification", {
          detail: {
            eventType,
            title: payload.data?.title || title,
            body: payload.data?.body || fallbackBody,
            url: payload.data?.url || "/#/",
            orderId: payload.data?.orderId || ""
          }
        }));
      });
    }
    await firebase.firestoreSdk.setDoc(
      firebase.firestoreSdk.doc(firebase.db, "users", currentUser.uid, "pushTokens", getDeviceId()),
      { token, updatedAt: new Date().toISOString() }
    );
    return messaging;
  }

  static async removePushToken() {
    const firebase = await initializeFirebase();
    const user = firebase?.auth.currentUser;
    if (!firebase || !user) return;
    await firebase.firestoreSdk.deleteDoc(
      firebase.firestoreSdk.doc(firebase.db, "users", user.uid, "pushTokens", getDeviceId())
    );
  }

  static async sendOrderEvent(orderId, eventType) {
    if (!firebaseConfig.notificationApiBaseUrl) return false;
    if (!Object.hasOwn(NOTIFICATION_LABELS, eventType)) throw new Error("Jenis notifikasi tidak valid.");
    const firebase = await initializeFirebase();
    const user = firebase?.auth.currentUser;
    if (!user) throw new Error("Sesi akun sudah berakhir.");
    const token = await user.getIdToken();
    let response;
    try {
      response = await fetch(`${firebaseConfig.notificationApiBaseUrl.replace(/\/$/, "")}/.netlify/functions/send-order-notification`, {
        method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, eventType })
      });
    } catch (cause) {
      const error = new Error("Layanan notifikasi tidak dapat dijangkau.", { cause });
      error.retryable = true;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`Layanan notifikasi merespons HTTP ${response.status}.`);
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    return true;
  }

  static playEventSound(eventType, orderId = "") {
    if (!Object.hasOwn(NOTIFICATION_LABELS, eventType) || localStorage.getItem("sjek.soundEnabled") !== "true") return;
    const soundKey = `${eventType}:${orderId}`;
    const lastPlayed = playedSounds.get(soundKey) || 0;
    if (Date.now() - lastPlayed < 5000) return;
    playedSounds.set(soundKey, Date.now());
    try {
      const context = new AudioContext();
      const frequencies = {
        "order-created": [660, 880],
        "order-accepted": [740, 990, 1175],
        "merchant-accepted": [880, 1175, 1397],
        "order-completed": [523, 659, 784]
      }[eventType];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.13;
        oscillator.frequency.value = frequency;
        oscillator.type = "sine";
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.12);
      });
      window.setTimeout(() => context.close(), frequencies.length * 140 + 150);
    } catch (error) {
      console.error("Suara notifikasi tidak dapat diputar.", error);
    }
  }

  static shouldDisplayEvent(eventType, orderId = "") {
    const key = `${eventType}:${orderId}`;
    const lastDisplayed = displayedEvents.get(key) || 0;
    if (Date.now() - lastDisplayed < 10000) return false;
    displayedEvents.set(key, Date.now());
    return true;
  }

  static dispatchOrderEvent(orderId, eventType) {
    const [title, body] = this.labelFor(eventType) || ["Pembaruan SJek", "Ada pembaruan pesanan."];
    window.dispatchEvent(new CustomEvent("sjek:push-notification", {
      detail: {
        eventType,
        title,
        body,
        orderId,
        url: `#/customer/tracking?order=${encodeURIComponent(orderId)}`
      }
    }));
  }

  static labelFor(eventType) {
    return NOTIFICATION_LABELS[eventType];
  }
}
