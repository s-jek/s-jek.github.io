import { escapeHTML, money, showToast } from "../../app.js";
import { MapService } from "../../services/mapService.js";
import { OrderService } from "../../services/orderService.js";
import { PricingService } from "../../services/pricingService.js";

export async function render(container, { user }) {
  container.innerHTML = `<section class="page-heading"><a href="#/customer" class="muted">‹ Beranda</a><h1>SSend · Kirim paket</h1><p>Tentukan lokasi jemput dan antar dengan mengeklik peta. Seret pin untuk menyesuaikan titik.</p></section>
    <form id="send-form" class="stack">
      <div id="send-map" class="map-panel" aria-label="Peta titik jemput dan antar"></div>
      <p class="map-help">Klik peta untuk memilih titik jemput terlebih dahulu, lalu titik antar. Seret pin untuk menyesuaikan lokasi.</p>
      <section class="card stack"><h2>Kontak &amp; alamat</h2><div class="form-grid">
        <label class="field">Alamat jemput<input name="pickupAddress" required value="Medan, Sumatera Utara"></label>
        <label class="field">Alamat antar<input name="dropoffAddress" required placeholder="Alamat tujuan"></label>
        <label class="field">Nama pengirim<input name="senderName" required value="${escapeHTML(user?.name || "")}"></label>
        <label class="field">WhatsApp pengirim<input name="senderPhone" required value="${escapeHTML(user?.phone || "")}" placeholder="08xxxxxxxxxx"></label>
        <label class="field">Nama penerima<input name="recipientName" required></label>
        <label class="field">WhatsApp penerima<input name="recipientPhone" required placeholder="08xxxxxxxxxx"></label>
        <label class="field">Kategori paket<select name="category"><option>Dokumen</option><option>Makanan</option><option>Elektronik</option><option>Pecah Belah</option></select></label>
        <label class="field">Berat (kg)<input name="weight" type="number" min="0.1" step="0.1" value="1" required></label>
        <label class="field">Kode voucher<input name="voucher" placeholder="SJEKHEMAT"></label>
        <label class="field">Pembayaran<select name="payment"><option value="COD">Bayar tunai (COD)</option></select></label>
        <label class="field" style="grid-column:1/-1">Catatan paket<textarea name="notes" placeholder="Instruksi tambahan untuk driver"></textarea></label>
      </div></section>
      <section class="card stack"><h2>Rincian pengiriman</h2><div id="send-summary" class="muted">Pilih kedua titik pada peta untuk menghitung ongkir.</div><p class="muted">Pemesanan SSend sedang disiapkan.</p><button class="btn btn-primary" type="submit" disabled>Segera tersedia</button></section>
    </form>`;
  const form = container.querySelector("#send-form");
  const summary = container.querySelector("#send-summary");
  const mapService = new MapService("send-map", [3.584, 98.675], 13);
  let pickup = null;
  let dropoff = null;
  let quote = null;
  let routeRequest = 0;
  const refreshQuote = async () => {
    if (!pickup || !dropoff) return;
    const request = ++routeRequest;
    try {
      const route = await mapService.calculateRealRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
      if (request !== routeRequest) return;
      const tariffs = await OrderService.getTariffs();
      const deliveryFare = PricingService.calculateDeliveryFare("SSEND", route.distanceKm, tariffs);
      const code = form.elements.voucher.value.trim().toUpperCase();
      const voucher = code ? (await OrderService.listVouchers()).find(item => item.code === code) : null;
      const discount = code ? PricingService.applyVoucher(voucher, 0, deliveryFare) : { discountAmount: 0, isValid: false, reason: "" };
      quote = { distanceKm: route.distanceKm, deliveryFare, discount: discount.discountAmount, voucherCode: discount.isValid ? code : "", platformFee: tariffs.platformFee };
      summary.innerHTML = `<div class="split"><span>Jarak perjalanan</span><strong>${route.distanceKm} km · ±${route.durationMinutes} menit</strong></div><div class="split"><span>Ongkir</span><strong>${money(deliveryFare)}</strong></div><div class="split"><span>Biaya layanan</span><span>${money(tariffs.platformFee)}</span></div><div class="split"><span>Diskon ${discount.isValid ? `(${escapeHTML(code)})` : ""}</span><span>− ${money(discount.discountAmount)}</span></div>${code && !discount.isValid ? `<small>${escapeHTML(discount.reason)}</small>` : ""}<div class="split"><strong>Total</strong><strong class="price">${money(deliveryFare + tariffs.platformFee - discount.discountAmount)}</strong></div>`;
    } catch (error) {
      console.error("Rute pengiriman gagal dihitung.", error);
      summary.textContent = "Rute tidak dapat dihitung. Periksa titik jemput dan antar, lalu coba lagi.";
      showToast("Rute tidak dapat dihitung. Silakan coba lagi.", "error");
    }
  };
  const setPoint = (kind, point) => {
    const value = { lat: point.lat, lng: point.lng };
    if (kind === "pickup") {
      pickup = value;
      mapService.setPickupLocation(value.lat, value.lng);
    } else {
      dropoff = value;
      mapService.setDropoffLocation(value.lat, value.lng);
    }
    refreshQuote();
  };
  mapService.setLocationHandler((point, kind) => {
    if (kind) setPoint(kind, point);
    else if (!pickup) setPoint("pickup", point);
    else if (!dropoff) setPoint("dropoff", point);
    else setPoint("dropoff", point);
  });
  form.elements.voucher.addEventListener("input", refreshQuote);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!user) {
      sessionStorage.setItem("sjek.afterLoginPath", "/customer/ssend");
      location.hash = "#/auth";
      return;
    }
    showToast("Pemesanan SSend belum tersedia saat ini.", "error");
  });
  container.addEventListener("DOMNodeRemoved", () => mapService.destroy(), { once: true });
}
