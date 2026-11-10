import { escapeHTML, money, showToast } from "../../app.js";
import { MerchantService } from "../../services/merchantService.js";
import { OrderService } from "../../services/orderService.js";
import { PricingService } from "../../services/pricingService.js";
import { MapService } from "../../services/mapService.js";
import { ReviewService } from "../../services/reviewService.js";

const categories = ["Semua", "Nasi", "Minuman", "Cepat Saji", "Camilan"];

export async function render(container, { user }) {
  const merchants = await MerchantService.listMerchants();
  const ratings = new Map(await Promise.all(merchants.map(async merchant => {
    try {
      return [merchant.id, await ReviewService.getRating(merchant.id, "merchant")];
    } catch (error) {
      console.error(`Rating toko ${merchant.id} tidak dapat dimuat.`, error);
      return [merchant.id, { average: 0, count: 0, available: false }];
    }
  })));
  let selectedMerchant = null;
  let menu = [];
  let cart = [];
  let routePromise = null;
  const initialSearch = sessionStorage.getItem("sjek.foodSearch") || "";
  let category = categories.includes(initialSearch) ? initialSearch : "Semua";
  sessionStorage.removeItem("sjek.foodSearch");
  container.innerHTML = `<section class="page-heading"><a href="#/customer" class="muted">‹ Beranda</a><h1>SFood</h1><p>Pilih restoran dan nikmati hidangan favoritmu.</p></section>
    <label class="field food-search">Cari restoran atau kategori<input id="restaurant-search" value="${escapeHTML(categories.includes(initialSearch) ? "" : initialSearch)}" placeholder="Contoh: Dapur Nusantara"></label>
    <nav class="tabs" aria-label="Kategori">${categories.map((item, index) => `<button class="tab ${index === 0 ? "active" : ""}" data-category="${item}">${item}</button>`).join("")}</nav>
    <section id="restaurant-list" class="grid grid-3">${merchants.map(merchant => `<button class="card restaurant-card" data-merchant="${escapeHTML(merchant.id)}" style="text-align:left"><img src="${escapeHTML(merchant.bannerUrl || "")}" alt=""><div class="restaurant-card-body"><div class="split"><strong>${escapeHTML(merchant.name)}</strong><span>${ratings.get(merchant.id)?.count ? `★ ${ratings.get(merchant.id).average.toFixed(1)} (${ratings.get(merchant.id).count})` : ratings.get(merchant.id)?.available === false ? "Rating tidak tersedia" : "☆ Belum ada ulasan"}</span></div><p class="muted">${escapeHTML(merchant.category || "Makanan")} · ${escapeHTML(merchant.address)}</p><span class="badge ${merchant.isOpen ? "badge-success" : "badge-danger"}">${merchant.isOpen ? "Buka" : "Tutup"}</span></div></button>`).join("")}</section>
    <section id="restaurant-menu" class="stack hidden" style="margin-top:20px"></section>`;
  const list = container.querySelector("#restaurant-list");
  const menuPanel = container.querySelector("#restaurant-menu");

  const showRestaurants = () => {
    const searchTerm = container.querySelector("#restaurant-search")?.value.trim().toLowerCase() || "";
    list.innerHTML = merchants.filter(merchant => category === "Semua" || merchant.category === category)
      .filter(merchant => !searchTerm || `${merchant.name} ${merchant.category} ${merchant.address}`.toLowerCase().includes(searchTerm))
      .map(merchant => `<button class="card restaurant-card" data-merchant="${escapeHTML(merchant.id)}" style="text-align:left"><img src="${escapeHTML(merchant.bannerUrl || "")}" alt=""><div class="restaurant-card-body"><div class="split"><strong>${escapeHTML(merchant.name)}</strong><span>${ratings.get(merchant.id)?.count ? `★ ${ratings.get(merchant.id).average.toFixed(1)} (${ratings.get(merchant.id).count})` : ratings.get(merchant.id)?.available === false ? "Rating tidak tersedia" : "☆ Belum ada ulasan"}</span></div><p class="muted">${escapeHTML(merchant.category || "Makanan")} · ${escapeHTML(merchant.address)}</p><span class="badge ${merchant.isOpen ? "badge-success" : "badge-danger"}">${merchant.isOpen ? "Buka" : "Tutup"}</span></div></button>`).join("") || `<div class="empty-state">Belum ada restoran pada kategori ini.</div>`;
  };
  container.querySelectorAll("[data-category]").forEach(button => button.classList.toggle("active", button.dataset.category === category));
  showRestaurants();
  container.querySelector("#restaurant-search").addEventListener("input", showRestaurants);
  const showMenu = () => {
    menuPanel.classList.remove("hidden");
    menuPanel.innerHTML = `<div class="split"><div><button class="btn btn-ghost" data-back>‹ Restoran</button><h2>${escapeHTML(selectedMerchant.name)}</h2><p class="muted">${escapeHTML(selectedMerchant.address)}</p></div><span class="badge badge-success">SFood</span></div>
      <div class="grid grid-2">${menu.filter(item => item.isAvailable).map(item => `<article class="card item-card"><img src="${escapeHTML(item.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=75")}" alt=""><div class="stack" style="gap:7px"><div class="split"><strong>${escapeHTML(item.name)}</strong><span class="price">${money(item.price)}</span></div><p class="muted">${escapeHTML(item.description || "")}</p><label class="field"><span>Varian</span><select data-variant="${escapeHTML(item.id)}"><option value="">Pilih opsi (opsional)</option>${(item.variants || []).map(variant => `<option>${escapeHTML(variant)}</option>`).join("")}</select></label><label class="field"><span>Catatan</span><input data-note="${escapeHTML(item.id)}" placeholder="Contoh: tanpa bawang"></label><button class="btn btn-primary" data-add="${escapeHTML(item.id)}">Tambah</button></div></article>`).join("")}</div>
      <form class="card stack" id="checkout-form"><div class="split"><h3>Keranjang (${cart.reduce((sum, item) => sum + item.qty, 0)})</h3><button class="btn btn-ghost" type="button" data-clear>Hapus keranjang</button></div>
        ${cart.length ? cart.map(item => `<div class="split"><span>${escapeHTML(item.name)} × ${item.qty}<small class="muted"> ${escapeHTML(item.variant || "")} ${escapeHTML(item.notes || "")}</small></span><strong>${money(item.price * item.qty)}</strong></div>`).join("") : `<p class="muted">Tambahkan hidangan untuk melanjutkan.</p>`}
        <div class="form-grid"><label class="field">Alamat antar<input name="address" required value="Medan, Sumatera Utara"></label><label class="field">Nomor WhatsApp<input name="phone" required value="${escapeHTML(user?.phone || "")}" placeholder="08xxxxxxxxxx"></label>
        <label class="field">Kode voucher<input name="voucher" placeholder="SJEKHEMAT"></label><label class="field">Pembayaran<select name="payment"><option value="COD">Bayar tunai (COD)</option></select></label></div>
        <div id="checkout-summary" class="stack"></div><p class="muted">Pemesanan SFood sedang disiapkan.</p><button class="btn btn-primary" type="submit" disabled>Segera tersedia</button>
      </form>`;
    menuPanel.querySelector("[data-back]").addEventListener("click", () => { menuPanel.classList.add("hidden"); list.classList.remove("hidden"); });
    menuPanel.querySelector("[data-clear]").addEventListener("click", () => { cart = []; showMenu(); });
    menuPanel.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => {
      const item = menu.find(entry => entry.id === button.dataset.add);
      const variant = menuPanel.querySelector(`[data-variant="${CSS.escape(item.id)}"]`).value;
      const notes = menuPanel.querySelector(`[data-note="${CSS.escape(item.id)}"]`).value.trim();
      const existing = cart.find(entry => entry.id === item.id && entry.variant === variant && entry.notes === notes);
      if (existing) existing.qty += 1;
      else cart.push({ ...item, qty: 1, variant, notes, selectedVariants: variant ? [variant] : [] });
      showMenu();
    }));
    updateSummary();
    menuPanel.querySelector("#checkout-form").addEventListener("input", updateSummary);
    menuPanel.querySelector("#checkout-form").addEventListener("submit", placeOrder);
  };
  const updateSummary = async () => {
    const form = menuPanel.querySelector("#checkout-form");
    const summary = menuPanel.querySelector("#checkout-summary");
    if (!form || !summary) return;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const customerLat = 3.584, customerLng = 98.675;
    routePromise ||= MapService.calculateRouteDistance(selectedMerchant.lat, selectedMerchant.lng, customerLat, customerLng);
    const route = await routePromise;
    const distanceKm = route.distanceKm;
    const tariffs = await OrderService.getTariffs();
    const deliveryFare = PricingService.calculateDeliveryFare("SFOOD", distanceKm, tariffs);
    const voucherCode = form.elements.voucher.value.trim().toUpperCase();
    const voucher = voucherCode ? (await OrderService.listVouchers()).find(item => item.code === voucherCode) : null;
    const result = voucherCode ? PricingService.applyVoucher(voucher, subtotal, deliveryFare) : { discountAmount: 0, isValid: false, reason: "" };
    summary.innerHTML = `<div class="split"><span>Subtotal · ${distanceKm} km · Ongkir ${result.isValid ? "" : "(rute)"}</span><strong>${money(subtotal + deliveryFare)}</strong></div><div class="split"><span>Biaya layanan</span><span>${money(tariffs.platformFee)}</span></div><div class="split"><span>Diskon ${result.isValid ? `(${escapeHTML(voucherCode)})` : ""}</span><span>− ${money(result.discountAmount)}</span></div>${voucherCode && !result.isValid ? `<small class="muted">${escapeHTML(result.reason)}</small>` : ""}<div class="split"><strong>Total pembayaran</strong><strong class="price">${money(subtotal + deliveryFare + tariffs.platformFee - result.discountAmount)}</strong></div>`;
    form.dataset.quote = JSON.stringify({ subtotal, distanceKm, deliveryFare, discount: result.discountAmount, voucherCode: result.isValid ? voucherCode : "" });
  };
  const placeOrder = event => {
    event.preventDefault();
    if (!user) {
      sessionStorage.setItem("sjek.afterLoginPath", "/customer/sfood");
      location.hash = "#/auth";
      return;
    }
    showToast("Pemesanan SFood belum tersedia saat ini.", "error");
  };
  container.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => {
    category = button.dataset.category;
    container.querySelectorAll("[data-category]").forEach(tab => tab.classList.toggle("active", tab === button));
    showRestaurants();
  }));
  list.addEventListener("click", async event => {
    const button = event.target.closest("[data-merchant]");
    if (!button) return;
    selectedMerchant = await MerchantService.getMerchant(button.dataset.merchant);
    menu = await MerchantService.listMenu(selectedMerchant.id);
    routePromise = null;
    list.classList.add("hidden");
    showMenu();
  });
}
