import { escapeHTML, money, registerRouteCleanup, showToast } from "../../app.js";
import { MapService } from "../../services/mapService.js";
import { MediaService } from "../../services/mediaService.js";
import { NotificationService } from "../../services/notificationService.js";
import { OrderService } from "../../services/orderService.js";
import { ReviewService } from "../../services/reviewService.js";

const defaultStages = [
  ["PENDING", "Menunggu"],
  ["ACCEPTED", "Diterima driver"],
  ["PROCESSING", "Diproses toko"],
  ["ON_THE_WAY", "Diantar"],
  ["COMPLETED", "Selesai"]
];

const validPoint = point => Number.isFinite(point?.lat) && Number.isFinite(point?.lng)
  && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;

function renderReviewForm(order, user, targetType, review, appeal) {
  const targetName = targetType === "driver" ? "Kurir" : "Toko";
  if (review) {
    return `<div class="card review-card"><strong>${targetName} · ${"★".repeat(review.stars)}${"☆".repeat(5 - review.stars)}</strong>
      <p>${escapeHTML(review.comment || "Tanpa ulasan")}</p>${review.imageUrl ? `<img class="review-photo" src="${escapeHTML(review.imageUrl)}" alt="Foto ulasan">` : ""}
      ${review.status === "HIDDEN" ? `<span class="badge badge-danger">Ulasan disembunyikan setelah banding</span>` : ""}
      ${review.stars <= 2 ? appeal
        ? `<span class="badge">${escapeHTML(appeal.status === "PENDING" ? "Banding sedang ditinjau" : "Banding: " + appeal.status)}</span>`
        : `<form class="appeal-form stack" data-appeal="${targetType}" data-order="${escapeHTML(order.id)}">
          <strong>Ajukan banding</strong><p class="muted">Banding tersedia untuk penilaian bintang 1 atau 2. Sertakan alasan dan bukti yang valid.</p>
          <label class="field">Alasan banding<textarea name="details" maxlength="1000" required></textarea></label>
          <label class="field">Foto bukti pendukung<input name="evidence" type="file" accept="image/*" required></label>
          <button class="btn btn-secondary" type="submit">Kirim banding</button></form>`
        : ""}
    </div>`;
  }
  return `<form class="card stack review-form" data-review="${targetType}" data-order="${escapeHTML(order.id)}">
    <strong>Beri penilaian untuk ${targetName}</strong>
    <fieldset class="star-rating"><legend>Pilih bintang</legend><div>${[1, 2, 3, 4, 5].map(value => `<label><input type="radio" name="stars" value="${value}" required><span aria-hidden="true">★</span><span class="sr-only">${value} bintang</span></label>`).join("")}</div></fieldset>
    <label class="field">Ulasan<textarea name="comment" maxlength="500" placeholder="Ceritakan pengalaman Anda"></textarea></label>
    <label class="field">Foto (opsional)<input name="photo" type="file" accept="image/*"></label>
    <button class="btn btn-primary" type="submit">Kirim penilaian</button>
  </form>`;
}

export async function render(container, { user }) {
  const focusedOrderId = new URLSearchParams(location.hash.split("?")[1] || "").get("order");
  const orders = await OrderService.listOrders({ customerId: user.uid });
  if (focusedOrderId) orders.sort((a, b) => Number(b.id === focusedOrderId) - Number(a.id === focusedOrderId));
  const driverRatings = new Map(await Promise.all([...new Set(orders.map(order => order.driverId).filter(Boolean))]
    .map(async driverId => {
      try {
        return [driverId, await ReviewService.getRating(driverId, "driver")];
      } catch (error) {
        console.error("Rating kurir tidak dapat dimuat.", error);
        return [driverId, { average: 0, count: 0 }];
      }
    })));
  const orderData = await Promise.all(orders.map(async order => ({
    order,
    reviews: order.orderStatus === "COMPLETED" ? await ReviewService.listForOrder(order.id) : [],
    appeals: order.orderStatus === "COMPLETED" ? await ReviewService.listAppealsForOrder(order.id, user.uid) : []
  })));
  const mapInstances = [];
  const liveSubscriptions = [];
  let disposed = false;
  registerRouteCleanup(() => {
    disposed = true;
    liveSubscriptions.forEach(unsubscribe => unsubscribe());
    mapInstances.forEach(map => map.destroy());
  });
  container.innerHTML = `<section class="page-heading"><a href="#/customer" class="muted">‹ Beranda</a><h1>Pesanan saya</h1><p>Pantau status pesanan SFood dan SSend.</p></section>
    ${orderData.length ? `<div class="stack">${orderData.map(({ order, reviews, appeals }) => {
      const stages = order.serviceType === "OJEK" ? [
        ["PENDING", "Mencari driver"],
        ["ACCEPTED", "Driver menuju jemput"],
        ["PROCESSING", "Driver tiba"],
        ["ON_THE_WAY", "Dalam perjalanan"],
        ["COMPLETED", "Selesai"]
      ] : defaultStages;
      const current = stages.findIndex(([status]) => status === order.orderStatus);
      const phone = order.driverPhone || "";
      const serviceName = order.serviceType === "OJEK" ? "Ojek Online" : order.serviceType === "SFOOD" ? "SFood" : "SSend";
      const driverReview = reviews.find(review => review.targetType === "driver");
      const merchantReview = reviews.find(review => review.targetType === "merchant");
      const driverRating = driverRatings.get(order.driverId);
      const driverAppeal = appeals.find(appeal => appeal.targetType === "driver");
      const merchantAppeal = appeals.find(appeal => appeal.targetType === "merchant");
      return `<article class="card stack tracking-order ${order.id === focusedOrderId ? "order-focus" : ""}" data-order-id="${escapeHTML(order.id)}"><div class="split"><div><strong>${escapeHTML(order.id)}</strong><p class="muted">${serviceName} · ${new Date(order.createdAt).toLocaleString("id-ID")}</p></div><span class="badge ${order.orderStatus === "COMPLETED" ? "badge-success" : "badge-warning"}" data-order-status>${escapeHTML(order.orderStatus)}</span></div>
        ${order.merchantStatus === "ACCEPTED" ? `<span class="badge badge-success">Toko mulai menyiapkan pesanan</span>` : ""}
        <div class="progress-track">${stages.map(([status, title], index) => `<div class="progress-step ${index <= current ? "done" : ""}" data-stage="${status}">${title}</div>`).join("")}</div>
        <div class="split"><span>${escapeHTML(order.pickup?.address || "")} → ${escapeHTML(order.dropoff?.address || "")}</span><strong>${money(order.pricingBreakdown?.totalCustomerPay)}${order.pricingBreakdown?.isEstimate ? " · estimasi" : ""}</strong></div>
        ${order.serviceType === "OJEK" && validPoint(order.pickup) && validPoint(order.dropoff) && order.orderStatus !== "CANCELLED"
          ? `<div class="tracking-map" id="tracking-map-${escapeHTML(order.id)}" aria-label="Peta rute pesanan"></div><p class="muted" data-location-status>${order.driverLocation ? "Lokasi kurir diperbarui langsung." : "Lokasi kurir akan tampil saat perjalanan dimulai."}</p>`
          : ""}
        ${order.orderStatus === "CANCELLED" ? `<p class="badge badge-danger">Pesanan dibatalkan</p>` : ""}
        ${driverRating ? `<p class="muted">${driverRating.count ? `Rating kurir: ★ ${driverRating.average.toFixed(1)} dari ${driverRating.count} ulasan` : driverRating.available === false ? "Rating kurir sementara tidak tersedia" : "Kurir belum memiliki ulasan"}</p>` : ""}
        ${phone ? `<a class="btn btn-secondary" href="https://wa.me/${encodeURIComponent(phone.replace(/\D/g, ""))}" target="_blank" rel="noopener">Hubungi Driver via WhatsApp</a>` : `<span class="muted">Driver belum ditugaskan.</span>`}
        ${order.orderStatus === "COMPLETED" ? `<section class="stack"><h3>Penilaian pesanan</h3>${order.driverId ? renderReviewForm(order, user, "driver", driverReview, driverAppeal) : ""}${order.merchantId ? renderReviewForm(order, user, "merchant", merchantReview, merchantAppeal) : ""}</section>` : ""}
      </article>`;
    }).join("")}</div>` : `<div class="empty-state">Belum ada pesanan. <a href="#/customer/ojek"><strong>Pesan sekarang</strong></a></div>`}`;

  for (const { order } of orderData) {
    const mapElement = container.querySelector(`#tracking-map-${CSS.escape(order.id)}`);
    let map = null;
    let driverMarker = null;
    try {
      if (mapElement && validPoint(order.pickup) && validPoint(order.dropoff)) {
        map = new MapService(mapElement.id, [order.pickup.lat, order.pickup.lng], 13);
        mapInstances.push(map);
        map.setPickupLocation(order.pickup.lat, order.pickup.lng, "Jemput");
        map.setDropoffLocation(order.dropoff.lat, order.dropoff.lng, "Tujuan");
        await map.calculateRealRoute(order.pickup.lat, order.pickup.lng, order.dropoff.lat, order.dropoff.lng);
      }
    } catch (error) {
      console.error("Peta pelacakan pesanan tidak dapat ditampilkan.", error);
    }
    let completedRefreshStarted = false;
    let lastOrderStatus = order.orderStatus;
    let lastMerchantStatus = order.merchantStatus;
    const unsubscribe = await OrderService.watchOrder(order.id, current => {
      const card = container.querySelector(`[data-order-id="${CSS.escape(order.id)}"]`);
      if (!card || disposed) return;
      if (current.orderStatus === "ACCEPTED" && lastOrderStatus !== "ACCEPTED") {
        NotificationService.dispatchOrderEvent(order.id, "order-accepted");
      }
      if (current.merchantStatus === "ACCEPTED" && lastMerchantStatus !== "ACCEPTED") {
        NotificationService.dispatchOrderEvent(order.id, "merchant-accepted");
      }
      if (order.orderStatus !== "COMPLETED" && current.orderStatus === "COMPLETED" && !completedRefreshStarted) {
        completedRefreshStarted = true;
        NotificationService.dispatchOrderEvent(order.id, "order-completed");
        render(container, { user });
        return;
      }
      lastOrderStatus = current.orderStatus;
      lastMerchantStatus = current.merchantStatus;
      const status = card.querySelector("[data-order-status]");
      status.textContent = current.orderStatus;
      status.className = `badge ${current.orderStatus === "COMPLETED" ? "badge-success" : "badge-warning"}`;
      const stageIndexes = new Map((order.serviceType === "OJEK" ? [
        ["PENDING", "Mencari driver"], ["ACCEPTED", "Driver menuju jemput"],
        ["PROCESSING", "Driver tiba"], ["ON_THE_WAY", "Dalam perjalanan"], ["COMPLETED", "Selesai"]
      ] : defaultStages).map(([stage], index) => [stage, index]));
      const activeIndex = stageIndexes.get(current.orderStatus) ?? -1;
      card.querySelectorAll("[data-stage]").forEach((step, index) => step.classList.toggle("done", index <= activeIndex));
      if (current.merchantStatus === "ACCEPTED" && !card.querySelector("[data-merchant-status]")) {
        status.insertAdjacentHTML("afterend", `<span class="badge badge-success" data-merchant-status>Toko mulai menyiapkan pesanan</span>`);
      }
      if (validPoint(current.driverLocation) && map) {
        if (!driverMarker) driverMarker = L.marker([current.driverLocation.lat, current.driverLocation.lng]).addTo(map.map).bindPopup("Kurir");
        else driverMarker.setLatLng([current.driverLocation.lat, current.driverLocation.lng]);
        map.map.panInside(driverMarker.getLatLng(), { padding: [48, 48], animate: false });
        const label = card.querySelector("[data-location-status]");
        if (label) label.textContent = `Lokasi kurir diperbarui ${current.driverLocationUpdatedAt ? new Date(current.driverLocationUpdatedAt).toLocaleTimeString("id-ID") : "langsung"}.`;
      }
    }, error => console.error("Pembaruan pesanan tidak dapat diterima.", error));
    if (disposed) unsubscribe();
    else liveSubscriptions.push(unsubscribe);
  }

  container.querySelectorAll('a[href^="https://wa.me/"]').forEach(link => link.addEventListener("click", event => {
    if (!link.href.endsWith("/")) return;
    event.preventDefault();
    showToast("Nomor WhatsApp driver belum tersedia.");
  }));
  container.querySelectorAll("[data-review]").forEach(form => form.addEventListener("submit", async event => {
    event.preventDefault();
    const order = orders.find(item => item.id === form.dataset.order);
    if (!order) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const photo = form.elements.photo.files?.[0];
      const uploaded = photo ? await MediaService.uploadPublicImage(photo, `sjek/reviews/${order.id}`) : null;
      const selectedStars = form.querySelector('input[name="stars"]:checked')?.value;
      await ReviewService.submitReview(order, user, form.dataset.review, Number(selectedStars), form.elements.comment.value, uploaded?.url || "");
      showToast("Penilaian berhasil dikirim.");
      await render(container, { user });
    } catch (error) {
      console.error("Penilaian gagal dikirim.", error);
      showToast(error.message || "Penilaian belum dapat dikirim. Silakan coba lagi.", "error");
      submit.disabled = false;
    }
  }));
  container.querySelectorAll("[data-appeal]").forEach(form => form.addEventListener("submit", async event => {
    event.preventDefault();
    const order = orders.find(item => item.id === form.dataset.order);
    if (!order) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const evidence = form.elements.evidence.files?.[0];
      if (!evidence) throw new Error("Pilih foto bukti pendukung.");
      const uploaded = await MediaService.uploadPublicImage(evidence, `sjek/review-appeals/${order.id}`);
      await ReviewService.submitAppeal(order, user, form.dataset.appeal, form.elements.details.value, uploaded.url);
      showToast("Banding berhasil diajukan untuk ditinjau.");
      await render(container, { user });
    } catch (error) {
      console.error("Banding penilaian gagal dikirim.", error);
      showToast(error.message || "Banding belum dapat dikirim. Silakan coba lagi.", "error");
      submit.disabled = false;
    }
  }));
}
