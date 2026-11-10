import { escapeHTML, money, registerRouteCleanup, showToast } from "../../app.js";
import { OrderService } from "../../services/orderService.js";
import { NotificationService } from "../../services/notificationService.js";
import { ReviewService } from "../../services/reviewService.js";

export async function render(container, { user, orders: currentOrders } = {}) {
  const driverId = user.uid;
  let online = localStorage.getItem("sjek.driver.online") === "true";
  let unsubscribeOrders = null;
  let mounted = true;
  const locationWatches = new Map();
  const available = currentOrders || await OrderService.listAvailableDriverOrders(driverId);
  const rating = await ReviewService.getRating(driverId, "driver").catch(error => {
    console.error("Rating kurir tidak dapat dimuat.", error);
    return { average: 0, count: 0, available: false };
  });
  const pendingCount = available.filter(order => order.orderStatus === "PENDING" && !order.driverId).length;
  let previousIds = new Set(available.map(order => order.id));
  container.innerHTML = `<section class="page-heading"><a href="#/driver/finance" class="muted">Lihat dompet ›</a><h1>Portal Driver</h1><p>${escapeHTML(user.name || "Mitra driver")} · ${rating.count ? `★ ${rating.average.toFixed(1)} (${rating.count} ulasan)` : rating.available === false ? "Rating sementara tidak tersedia" : "Belum ada ulasan"} · Terima order dan kelola perjalanan.</p></section>
    <div class="dashboard-toolbar"><div><span class="badge ${online ? "badge-success" : "badge-danger"}" id="online-label">${online ? "Online" : "Offline"}</span><p class="muted">Status kesiapan menerima order</p></div><button id="online-toggle" class="btn ${online ? "btn-danger" : "btn-primary"}">${online ? "Jadi Offline" : "Jadi Online"}</button></div>
    <div class="notification-indicator">🔔 Pesanan kurir masuk <span class="badge">${pendingCount}</span></div>
    <section class="stack" id="driver-orders">${available.length ? available.map(order => {
      const [nextStatus, actionLabel] = order.orderStatus === "PENDING"
        ? ["ACCEPTED", "Terima pesanan"]
        : order.orderStatus === "ACCEPTED" && !order.driverId
          ? ["ACCEPTED", "Ambil pesanan"]
          : order.orderStatus === "ACCEPTED"
            ? ["PROCESSING", "Tiba di Lokasi"]
            : order.orderStatus === "PROCESSING"
              ? ["ON_THE_WAY", "Pesanan Diambil"]
              : order.orderStatus === "ON_THE_WAY"
                ? ["COMPLETED", "Selesaikan Pengantaran"]
                : [];
      const target = ["PENDING", "ACCEPTED"].includes(order.orderStatus) && !order.driverId ? Date.now() + 30000 : 0;
      return `<article class="card order-card" data-order="${escapeHTML(order.id)}" ${target ? `data-deadline="${target}"` : ""}><div class="split"><div><strong>${escapeHTML(order.id)}</strong><p class="muted">${order.serviceType === "OJEK" ? "Ojek Online" : order.serviceType === "SFOOD" ? "SFood" : "SSend"} · ${order.pricingBreakdown?.distanceKm || 0} km</p></div><span class="badge ${order.orderStatus === "PENDING" ? "badge-warning" : "badge-success"}">${escapeHTML(order.orderStatus)}</span></div>
        <div class="grid grid-2"><div><small class="muted">Jemput</small><p>${escapeHTML(order.pickup?.address || "Lokasi jemput")}</p></div><div><small class="muted">Antar</small><p>${escapeHTML(order.dropoff?.address || "Lokasi antar")}</p></div></div>
        ${order.serviceType === "OJEK" ? `<div><small class="muted">Penumpang</small><p>${escapeHTML(order.passenger?.name || order.pickup?.contactName || "")} · ${escapeHTML(order.passenger?.phone || order.pickup?.phone || "")}</p></div>` : ""}
        <div class="split"><span>${order.serviceType === "OJEK" ? "Estimasi tarif tunai" : "Pendapatan bersih driver"}</span><strong class="price">${money(order.serviceType === "OJEK" ? order.pricingBreakdown?.totalCustomerPay : order.financialLedger?.driverNet)}</strong></div>
        ${order.orderStatus === "PENDING" ? `<strong class="countdown">Order masuk · <span data-countdown>${Math.max(0, Math.ceil((target - Date.now()) / 1000))}</span> detik</strong>` : ""}
        ${nextStatus ? `<button class="btn btn-primary" data-action="${nextStatus}" ${["PENDING", "ACCEPTED"].includes(order.orderStatus) && !order.driverId && !online ? "disabled" : ""}>${actionLabel}</button>` : ""}
        ${order.driverId === driverId && ["ACCEPTED", "PROCESSING", "ON_THE_WAY"].includes(order.orderStatus)
          ? `<button class="btn btn-secondary" data-location-order="${escapeHTML(order.id)}">${locationWatches.has(order.id) ? "Hentikan berbagi lokasi" : "Bagikan lokasi perjalanan"}</button>` : ""}
      </article>`;
    }).join("") : `<div class="empty-state">Tidak ada order masuk saat ini.</div>`}</section>`;
  const refreshTimer = window.setInterval(() => {
    let expired = false;
    container.querySelectorAll("[data-deadline]").forEach(card => {
      const remaining = Math.max(0, Math.ceil((Number(card.dataset.deadline) - Date.now()) / 1000));
      const label = card.querySelector("[data-countdown]");
      if (label) label.textContent = String(remaining);
      if (remaining === 0) expired = true;
    });
    if (expired) window.clearInterval(refreshTimer);
  }, 1000);
  registerRouteCleanup(() => {
    mounted = false;
    unsubscribeOrders?.();
    locationWatches.forEach(watchId => navigator.geolocation.clearWatch(watchId));
    locationWatches.clear();
    window.clearInterval(refreshTimer);
  });
  container.querySelector("#online-toggle").addEventListener("click", event => {
    online = !online;
    localStorage.setItem("sjek.driver.online", String(online));
    event.currentTarget.textContent = online ? "Jadi Offline" : "Jadi Online";
    event.currentTarget.className = `btn ${online ? "btn-danger" : "btn-primary"}`;
    container.querySelector("#online-label").textContent = online ? "Online" : "Offline";
    container.querySelector("#online-label").className = `badge ${online ? "badge-success" : "badge-danger"}`;
    container.querySelectorAll('[data-action="ACCEPTED"]').forEach(button => {
      const card = button.closest("[data-order]");
      button.disabled = !online && !card.dataset.driver;
    });
  });
  container.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", async () => {
    try {
      const card = button.closest("[data-order]");
      await OrderService.updateOrderStatus(card.dataset.order, button.dataset.action, { driverId });
      showToast("Status perjalanan berhasil diperbarui.");
    } catch (error) {
      console.error("Perubahan status perjalanan gagal disimpan.", error);
      showToast("Status perjalanan belum dapat diperbarui. Silakan coba lagi.", "error");
    }
  }));
  container.querySelectorAll("[data-location-order]").forEach(button => button.addEventListener("click", () => {
    const orderId = button.dataset.locationOrder;
    if (locationWatches.has(orderId)) {
      navigator.geolocation.clearWatch(locationWatches.get(orderId));
      locationWatches.delete(orderId);
      button.textContent = "Bagikan lokasi perjalanan";
      return;
    }
    if (!navigator.geolocation) return showToast("Browser ini belum mendukung berbagi lokasi.", "error");
    const watchId = navigator.geolocation.watchPosition(async position => {
      try {
        await OrderService.updateDriverLocation(orderId, {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      } catch (error) {
        console.error("Lokasi perjalanan tidak dapat diperbarui.", error);
        showToast("Lokasi perjalanan belum dapat diperbarui.", "error");
      }
    }, error => {
      console.error("Browser tidak dapat membaca lokasi perjalanan.", error);
      showToast("Lokasi tidak tersedia. Periksa izin lokasi browser.", "error");
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
    locationWatches.set(orderId, watchId);
    button.textContent = "Hentikan berbagi lokasi";
  }));
  const stopOrders = await OrderService.subscribeAvailableDriverOrders(driverId, latest => {
    if (!mounted) return;
    const nextIds = new Set(latest.map(order => order.id));
    nextIds.forEach(id => {
      if (!previousIds.has(id)) NotificationService.playEventSound("order-created", id);
    });
    previousIds = nextIds;
    const signature = latest.map(order => `${order.id}:${order.orderStatus}:${order.driverId}`).join("|");
    if (signature !== available.map(order => `${order.id}:${order.orderStatus}:${order.driverId}`).join("|")) {
      render(container, { user, orders: latest });
    }
  });
  if (mounted) unsubscribeOrders = stopOrders;
  else stopOrders();
}
