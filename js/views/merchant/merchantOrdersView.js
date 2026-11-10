import { escapeHTML, money, registerRouteCleanup, showToast } from "../../app.js";
import { OrderService } from "../../services/orderService.js";
import { ReviewService } from "../../services/reviewService.js";

const activeOrderStatuses = new Set(["ACCEPTED", "PROCESSING", "ON_THE_WAY"]);

function visibleOrders(orders) {
  return orders.filter(order => order.driverId && activeOrderStatuses.has(order.orderStatus));
}

export async function render(container, { user, orders: currentOrders } = {}) {
  const merchantId = user.partnerMerchantId;
  if (!merchantId) throw new Error("Profil mitra food belum memiliki toko aktif.");
  const rating = await ReviewService.getRating(merchantId, "merchant").catch(error => {
    console.error("Rating toko tidak dapat dimuat.", error);
    return { average: 0, count: 0, available: false };
  });
  let unsubscribeOrders = null;
  let mounted = true;
  let activeOrders = visibleOrders(currentOrders || await OrderService.listOrders({ merchantId }));
  const signature = list => list.map(order => `${order.id}:${order.orderStatus}:${order.driverId}`).join("|");
  registerRouteCleanup(() => {
    mounted = false;
    unsubscribeOrders?.();
  });
  container.innerHTML = `<section class="page-heading"><a href="#/merchant/menu" class="btn btn-danger">Kelola menu ›</a><h1>Pesanan Toko</h1><p>${rating.count ? `★ ${rating.average.toFixed(1)} (${rating.count} ulasan)` : rating.available === false ? "Rating sementara tidak tersedia" : "Belum ada ulasan"} · Pesanan akan muncul setelah kurir menerimanya.</p></section>
    <button class="btn btn-secondary notification-indicator" type="button" aria-label="Notifikasi pesanan toko">🔔 Pesanan masuk <span class="badge">${activeOrders.length}</span></button>
    ${activeOrders.length ? `<section class="stack">${activeOrders.map(order => {
      const needsAcceptance = order.orderStatus === "ACCEPTED" && order.merchantStatus !== "ACCEPTED";
      const label = "Terima pesanan & mulai siapkan";
      return `<article class="card order-card"><div class="split"><div><strong>${escapeHTML(order.id)}</strong><p class="muted">${new Date(order.createdAt).toLocaleString("id-ID")}</p></div><span class="badge badge-warning">${escapeHTML(order.orderStatus)}</span></div>
        <ul class="order-items">${(order.items || []).map(item => `<li>${item.qty} × ${escapeHTML(item.name)} ${item.selectedVariants?.length ? `(${escapeHTML(item.selectedVariants.join(", "))})` : ""} ${item.notes ? `— ${escapeHTML(item.notes)}` : ""}</li>`).join("")}</ul>
        <div class="split"><span>Subtotal makanan</span><strong>${money(order.pricingBreakdown?.subtotalFood)}</strong></div>
        <div class="split"><span>Alamat antar</span><span>${escapeHTML(order.dropoff?.address || "")}</span></div>
        ${needsAcceptance ? `<button class="btn btn-primary" data-order="${escapeHTML(order.id)}">${label}</button>` : order.merchantStatus === "ACCEPTED" ? `<span class="badge badge-success">Toko mulai menyiapkan pesanan</span>` : ""}
      </article>`;
    }).join("")}</section>` : `<div class="empty-state">Belum ada pesanan yang diterima kurir.</div>`}`;
  container.querySelectorAll("[data-order]").forEach(button => button.addEventListener("click", async () => {
    try {
      button.disabled = true;
      await OrderService.acceptMerchantOrder(button.dataset.order, merchantId);
      showToast("Toko mulai menyiapkan pesanan.");
    } catch (error) {
      console.error("Perubahan status pesanan toko gagal disimpan.", error);
      showToast("Status pesanan belum dapat diperbarui. Silakan coba lagi.", "error");
      button.disabled = false;
    }
  }));
  const initialSignature = signature(activeOrders);
  const stopOrders = await OrderService.subscribeMerchantOrders(merchantId, latest => {
    if (!mounted) return;
    const nextOrders = visibleOrders(latest);
    if (signature(nextOrders) !== initialSignature) render(container, { user, orders: latest });
  }, error => {
    console.error("Pesanan toko tidak dapat diperbarui langsung.", error);
    showToast("Pembaruan pesanan belum tersedia. Muat ulang halaman untuk mencoba lagi.", "error");
  });
  if (mounted) unsubscribeOrders = stopOrders;
  else stopOrders();
}
