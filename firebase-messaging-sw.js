importScripts("https://www.gstatic.com/firebasejs/13.2.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.2.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAzLaWRjI1rAn1zn4K_jhB5gYU6cNQwphw",
  authDomain: "sjek-4ebc0.firebaseapp.com",
  projectId: "sjek-4ebc0",
  messagingSenderId: "247343071074",
  appId: "1:247343071074:web:6b0063bb910468edb1763b",
  measurementId: "G-XTQ5JH48FP"
});

firebase.messaging().onBackgroundMessage(payload => {
  const { title, body, orderId, url } = payload.data || {};
  return self.registration.showNotification(title || "SJek", {
    body: body || "Ada pembaruan pesanan.",
    icon: "./assets/img/sjek-mark.png",
    badge: "./assets/img/sjek-mark.png",
    tag: orderId || "sjek-order",
    data: { url: url || (orderId ? `#/customer/tracking?order=${encodeURIComponent(orderId)}` : "#/") }
  });
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "#/", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => client.url.startsWith(self.location.origin));
    if (existing) {
      existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  }));
});
