import { escapeHTML, money } from "../../app.js";
import { OrderService } from "../../services/orderService.js";
import { MerchantService } from "../../services/merchantService.js";
import { PartnerService } from "../../services/partnerService.js";
import { BannerService } from "../../services/bannerService.js";

const shortcuts = [
  { title: "Makanan", category: "Nasi", icon: "🍲" },
  { title: "Minuman", category: "Minuman", icon: "🧋" },
  { title: "Cepat saji", category: "Cepat Saji", icon: "🍔" },
  { title: "Camilan", category: "Camilan", icon: "🍟" }
];

export async function render(container, { user }) {
  const results = await Promise.allSettled([
    user ? OrderService.listOrders({ customerId: user.uid }) : Promise.resolve([]),
    MerchantService.listMerchants(),
    user ? PartnerService.listMyApplications(user.uid) : Promise.resolve([]),
    BannerService.listActive()
  ]);
  const [ordersResult, merchantsResult, applicationsResult, bannersResult] = results;
  results.forEach((result, index) => {
    if (result.status === "rejected") console.error(`Konten beranda bagian ${index + 1} gagal dimuat.`, result.reason);
  });
  const orders = ordersResult.status === "fulfilled" ? ordersResult.value : [];
  const merchants = merchantsResult.status === "fulfilled" ? merchantsResult.value : [];
  const applications = applicationsResult.status === "fulfilled" ? applicationsResult.value : [];
  const banners = bannersResult.status === "fulfilled" ? bannersResult.value : [];
  const hasLoadError = results.some(result => result.status === "rejected");
  const activeOrders = orders.filter(order => !["COMPLETED", "CANCELLED"].includes(order.orderStatus));
  const available = merchants.filter(merchant => merchant.isOpen);
  const pendingDriverApplication = applications.find(item => item.partnerType === "driver" && item.status === "PENDING");
  const pendingMerchantApplication = applications.find(item => item.partnerType === "merchant" && item.status === "PENDING");
  const needsDriverApplicationUpdate = pendingDriverApplication && pendingDriverApplication.agreementVersion !== "1.1";
  const needsMerchantApplicationUpdate = pendingMerchantApplication && pendingMerchantApplication.agreementVersion !== "1.1";
  const partnerOptions = user ? [
    !user.partnerRoles?.includes("driver") && (!pendingDriverApplication || needsDriverApplicationUpdate)
      ? `<a class="btn btn-primary" href="#/partner/driver">${needsDriverApplicationUpdate ? "Lengkapi data mitra kurir" : "Mitra kurir"}</a>` : "",
    !user.partnerRoles?.includes("merchant") && (!pendingMerchantApplication || needsMerchantApplicationUpdate)
      ? `<a class="btn btn-secondary" href="#/partner/merchant">${needsMerchantApplicationUpdate ? "Lengkapi data mitra food" : "Mitra food"}</a>` : ""
  ].filter(Boolean) : [];
  const partnerLinks = user && (partnerOptions.length || user.partnerRoles?.length || applications.length)
    ? `<section class="stack partner-invite"><div><span class="eyebrow">TUMBUH BERSAMA SJek</span><h2>Perjalanan kemitraan</h2><p class="muted">Akun pelanggan tetap dapat memakai layanan reguler SJek.</p></div>
      ${applications.filter(item => item.status === "PENDING").map(item => `<p class="badge badge-warning">${item.agreementVersion === "1.1" ? `Permohonan ${item.partnerType === "driver" ? "mitra kurir" : "mitra food"} sedang ditinjau.` : `Permohonan ${item.partnerType === "driver" ? "mitra kurir" : "mitra food"} perlu dilengkapi dengan formulir terbaru.`}</p>`).join("")}
      ${applications.filter(item => item.status === "REJECTED").map(item => `<p class="badge badge-danger">Permohonan ${item.partnerType === "driver" ? "mitra kurir" : "mitra food"} ditolak. Anda dapat mengajukan kembali.</p>`).join("")}
      ${user.partnerRoles?.length ? `<div class="row">${user.partnerRoles.includes("driver") ? `<a class="btn btn-primary" href="#/driver/orders">Buka portal kurir</a>` : ""}${user.partnerRoles.includes("merchant") ? `<a class="btn btn-secondary" href="#/merchant/orders">Buka portal food</a>` : ""}</div>` : ""}
      ${partnerOptions.length ? `<div class="row">${partnerOptions.join("")}</div>` : ""}
    </section>` : "";
  container.innerHTML = `
    ${user ? "" : `<div class="customer-welcome"><a href="#/auth" class="btn btn-primary">Masuk untuk memesan</a></div>`}
    <section class="customer-hero">
      <div class="hero-copy"><span class="eyebrow">SJek · layanan harianmu</span><h1>${user ? `Hai, ${escapeHTML(user.name || "Teman")} 👋<br>Hari ini mau apa?` : "Satu aplikasi,<br>semua beres."}</h1>
      <p>Ojek online, makanan favorit, dan pengiriman barang bersama mitra sekitar.</p>
      <div class="hero-actions"><a class="btn btn-primary" href="#/customer/ojek">🏍️ Pesan Ojek</a><a class="btn btn-hero-outline" href="#/customer/sfood">🍜 SFood</a><a class="btn btn-hero-outline" href="#/customer/ssend">📦 SSend</a></div></div>
      <div class="hero-art" aria-hidden="true"><img class="hero-circle hero-logo" src="assets/img/sjek-mark.png" alt=""><span class="hero-spark spark-one">✦</span><span class="hero-spark spark-two">✦</span><span class="hero-orbit">Ojek<br>SFood · SSend</span></div>
    </section>
    ${banners.length ? `<section class="banner-carousel customer-section" aria-label="Promosi SJek"><div class="banner-stage"></div><div class="banner-dots" role="tablist" aria-label="Pilih banner">${banners.map((banner, index) => `<button class="banner-dot ${index === 0 ? "active" : ""}" type="button" data-banner="${index}" aria-label="Banner ${index + 1}" aria-selected="${index === 0}"></button>`).join("")}</div></section>` : ""}
    ${user ? `<section class="coin-summary"><div><span class="eyebrow">SJek KOIN</span><h2>🪙 ${Number(user.coins || 0).toLocaleString("id-ID")} koin</h2><p class="muted">Check-in harian dan tukarkan koin dengan hadiah.</p></div><a class="btn btn-secondary" href="#/customer/rewards">Lihat hadiah</a></section>` : ""}
    <section class="customer-search card"><label class="sr-only" for="home-search">Cari layanan atau makanan</label><span aria-hidden="true">⌕</span><input id="home-search" placeholder="Cari makanan, restoran, atau layanan"><button class="btn btn-primary" id="search-food">Cari</button></section>
    <section class="stack customer-section"><div class="split"><div><span class="eyebrow">PILIHAN CEPAT</span><h2>Jelajahi kategori</h2></div><a class="text-link" href="#/customer/sfood">Semua restoran →</a></div>
      <div class="shortcut-grid"><a class="shortcut-card primary-service" href="#/customer/ojek"><span>🏍️</span><strong>Ojek Online</strong></a>${shortcuts.map(item => `<a class="shortcut-card" href="#/customer/sfood" data-search="${escapeHTML(item.category)}"><span>${item.icon}</span><strong>${item.title}</strong></a>`).join("")}<a class="shortcut-card" href="#/customer/ssend"><span>📦</span><strong>Kirim paket</strong></a></div>
    </section>
    ${activeOrders.length ? `<section class="stack customer-section"><div class="split"><div><span class="eyebrow">PANTAU PESANAN</span><h2>Pesanan aktif</h2></div><a class="text-link" href="#/customer/tracking">Lihat semua →</a></div><div class="grid grid-2">${activeOrders.map(order => `<a class="card active-order-card" href="#/customer/tracking"><div class="split"><span class="service-icon">${order.serviceType === "OJEK" ? "🏍️" : order.serviceType === "SFOOD" ? "🍜" : "📦"}</span><span class="badge badge-warning">${escapeHTML(order.orderStatus)}</span></div><strong>${escapeHTML(order.id)}</strong><span class="muted">${order.serviceType === "OJEK" ? "Ojek Online" : order.serviceType === "SFOOD" ? "SFood" : "SSend"} · ${escapeHTML(order.dropoff?.address || "")}</span><strong class="price">${money(order.pricingBreakdown?.totalCustomerPay)}</strong></a>`).join("")}</div></section>` : ""}
    <section class="stack customer-section"><div class="split"><div><span class="eyebrow">DEKAT DENGANMU</span><h2>Restoran pilihan</h2></div><a class="text-link" href="#/customer/sfood">Jelajahi →</a></div>
      <div class="grid grid-3 restaurant-preview">${available.length ? available.slice(0, 3).map(merchant => `<a class="card restaurant-preview-card" href="#/customer/sfood"><img src="${escapeHTML(merchant.bannerUrl || "")}" alt=""><div><div class="split"><strong>${escapeHTML(merchant.name)}</strong><span>★ ${Number(merchant.rating || 0).toFixed(1)}</span></div><p class="muted">${escapeHTML(merchant.category || "Makanan")} · ${escapeHTML(merchant.address)}</p></div></a>`).join("") : `<div class="empty-state">${hasLoadError ? "Pilihan restoran belum dapat dimuat. Silakan coba lagi." : "Belum ada restoran yang buka saat ini."}</div>`}</div>
    </section>${partnerLinks}`;
  if (hasLoadError) {
    const notice = document.createElement("p");
    notice.className = "muted";
    notice.setAttribute("role", "status");
    notice.textContent = "Sebagian informasi belum tersedia. Silakan coba lagi.";
    container.prepend(notice);
  }
  const search = container.querySelector("#home-search");
  container.querySelector("#search-food").addEventListener("click", () => {
    sessionStorage.setItem("sjek.foodSearch", search.value.trim());
    location.hash = "#/customer/sfood";
  });
  search.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      container.querySelector("#search-food").click();
    }
  });
  container.querySelectorAll("[data-search]").forEach(link => link.addEventListener("click", () => sessionStorage.setItem("sjek.foodSearch", link.dataset.search)));
  if (banners.length) {
    const stage = container.querySelector(".banner-stage");
    const dots = [...container.querySelectorAll("[data-banner]")];
    let activeIndex = 0;
    const showBanner = index => {
      activeIndex = index;
      const banner = banners[index];
      stage.innerHTML = `<a class="banner-slide" href="#${escapeHTML(banner.ctaPath)}" aria-label="${escapeHTML(banner.title)}"><img class="banner-image" src="${escapeHTML(banner.imageUrl)}" alt=""><div class="banner-copy"><span class="eyebrow">PROMO SJek</span><h2>${escapeHTML(banner.title)}</h2><p>${escapeHTML(banner.subtitle || "")}</p><span class="btn btn-primary">${escapeHTML(banner.ctaLabel || "Jelajahi")}</span></div></a>`;
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("active", dotIndex === index);
        dot.setAttribute("aria-selected", String(dotIndex === index));
      });
    };
    dots.forEach((dot, index) => dot.addEventListener("click", () => showBanner(index)));
    showBanner(0);
    if (banners.length > 1) {
      const timer = window.setInterval(() => showBanner((activeIndex + 1) % banners.length), 5000);
      container.addEventListener("DOMNodeRemoved", () => window.clearInterval(timer), { once: true });
    }
  }
}
