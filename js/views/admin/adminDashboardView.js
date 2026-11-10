import { money, escapeHTML, showToast } from "../../app.js";
import { OrderService } from "../../services/orderService.js";
import { PartnerService } from "../../services/partnerService.js";

const publicPartnerPhoto = url => /^https:\/\/res\.cloudinary\.com\/ks6vgjfn\/image\/upload\/.+\.webp$/i.test(url || "")
  ? escapeHTML(url)
  : "";

export async function render(container, { user }) {
  const [orders, tariffs, vouchers, applications] = await Promise.all([
    OrderService.listOrders(), OrderService.getTariffs(), OrderService.listVouchers(), PartnerService.listPendingApplications()
  ]);
  const completed = orders.filter(order => order.orderStatus === "COMPLETED");
  const gmv = completed.reduce((sum, order) => sum + (order.pricingBreakdown?.totalCustomerPay || 0), 0);
  const ownerNet = completed.reduce((sum, order) => sum + (order.financialLedger?.platformNet || 0), 0);
  container.innerHTML = `<section class="page-heading"><h1>Owner &amp; Admin</h1><p>Ringkasan operasional dan keuangan platform SJek.</p></section>
    <section class="grid grid-3"><article class="card metric"><span>GMV selesai</span><strong>${money(gmv)}</strong></article><article class="card metric"><span>Pendapatan bersih owner</span><strong>${money(ownerNet)}</strong></article><article class="card metric"><span>Trip selesai</span><strong>${completed.length}</strong></article></section>
    <section class="grid grid-2" style="margin-top:20px"><a class="card stack" href="#/admin/tariffs"><h2>Tarif &amp; komisi</h2><p class="muted">Ojek ${money(tariffs.ojek.baseFare)} · SFood ${money(tariffs.sfood.baseFare)} · SSend ${money(tariffs.ssend.baseFare)} · Layanan ${money(tariffs.platformFee)}</p><span class="btn btn-secondary">Atur tarif</span></a>
    <a class="card stack" href="#/admin/vouchers"><h2>Voucher promo</h2><p class="muted">${vouchers.length} kode terdaftar.</p><span class="btn btn-secondary">Kelola voucher</span></a>
    <a class="card stack" href="#/admin/coins"><h2>Koin &amp; hadiah</h2><p class="muted">Atur check-in harian, hadiah, dan penukaran pelanggan.</p><span class="btn btn-secondary">Atur koin</span></a>
    <a class="card stack" href="#/admin/banners"><h2>Banner beranda</h2><p class="muted">Unggah dan atur promosi yang tampil di beranda konsumen.</p><span class="btn btn-secondary">Atur banner</span></a>
    <a class="card stack" href="#/admin/review-appeals"><h2>Banding penilaian</h2><p class="muted">Tinjau bukti dan putuskan banding untuk ulasan bintang satu atau dua.</p><span class="btn btn-secondary">Tinjau banding</span></a>
    <a class="card stack" href="#/admin/finance"><h2>Pembukuan platform</h2><p class="muted">GMV, hak mitra, subsidi dan komisi platform.</p><span class="btn btn-primary">Buka laporan</span></a>
    <article class="card stack"><h2>Model bisnis</h2><p>Komisi driver ${tariffs.driverCommissionPct}% · Komisi toko ${tariffs.merchantCommissionPct}% · Biaya layanan ${money(tariffs.platformFee)}.</p><p class="muted">Tarif Ojek merupakan estimasi tunai. Pemesanan SFood dan SSend belum tersedia.</p></article></section>
    <section class="stack" style="margin-top:24px"><div><span class="eyebrow">VERIFIKASI PARTNER</span><h2>Permohonan mitra (${applications.length})</h2><p class="muted">Periksa data dan dokumen asli secara langsung sebelum memberi keputusan.</p></div>
      ${applications.length ? applications.map(application => {
        const vehiclePhotoUrl = publicPartnerPhoto(application.vehiclePhotoUrl);
        const storefrontPhotoUrl = publicPartnerPhoto(application.storefrontPhotoUrl);
        return `<article class="card stack"><div class="split"><div><strong>${escapeHTML(application.legalName)}</strong><p class="muted">${application.partnerType === "driver" ? "Mitra Kurir" : "Mitra Food"} · ${escapeHTML(application.email || "")} · ${escapeHTML(application.phone || "")}</p></div><span class="badge badge-warning">Menunggu</span></div>
        <p>${escapeHTML(application.businessName || application.vehicleType || "")} · ${escapeHTML(application.businessAddress || application.address || "")}</p>
        <div class="grid grid-2">${vehiclePhotoUrl ? `<div><strong>Foto mitra bersama kendaraan</strong><a href="${vehiclePhotoUrl}" target="_blank" rel="noopener noreferrer"><img class="partner-photo-review" src="${vehiclePhotoUrl}" alt="Mitra bersama kendaraan"></a></div>` : ""}${storefrontPhotoUrl ? `<div><strong>Foto diri di depan toko</strong><a href="${storefrontPhotoUrl}" target="_blank" rel="noopener noreferrer"><img class="partner-photo-review" src="${storefrontPhotoUrl}" alt="Pemohon di depan toko"></a></div>` : ""}</div>
        ${application.businessLat != null && application.businessLng != null ? `<a class="text-link" href="https://www.google.com/maps/dir/?api=1&amp;destination=${application.businessLat},${application.businessLng}" target="_blank" rel="noopener noreferrer">Buka pin toko di Google Maps ↗</a>` : ""}
        <details><summary>Data verifikasi &amp; pencairan</summary><pre class="application-details">${escapeHTML(JSON.stringify({
          NIK: application.nik,
          alamat: application.address,
          kontakDarurat: application.emergencyContact || "Tidak diisi",
          nomorSIMC: application.licenseNumber || "Tidak diisi",
          nomorPolisi: application.vehiclePlate,
          kendaraan: application.vehicleType,
          namaUsaha: application.businessName,
          kategoriUsaha: application.businessCategory,
          NIB: application.businessLicense || "Tidak diisi",
          lokasiToko: application.businessLat != null && application.businessLng != null
            ? `https://www.google.com/maps?q=${application.businessLat},${application.businessLng}`
            : "",
          jamOperasional: application.openingHours,
          bankAtauEWallet: application.payoutProvider,
          rekeningAtauNomorEWallet: application.payoutAccount
        }, null, 2))}</pre><p class="muted">Buka tautan lokasi toko untuk memverifikasi pin. Periksa dokumen identitas asli secara langsung, bukan melalui foto publik.</p></details>
        <div class="row"><button class="btn btn-primary" data-review="APPROVED" data-application="${escapeHTML(application.id)}">Setujui &amp; aktifkan akses</button><button class="btn btn-danger" data-review="REJECTED" data-application="${escapeHTML(application.id)}">Tolak</button></div>
      </article>`;
      }).join("") : `<div class="empty-state">Tidak ada permohonan yang menunggu.</div>`}
    </section>`;
  container.querySelectorAll("[data-review]").forEach(button => button.addEventListener("click", async () => {
    const application = applications.find(item => item.id === button.dataset.application);
    if (!application) return;
    const decision = button.dataset.review;
    const confirmed = window.confirm(`${decision === "APPROVED" ? "Setujui" : "Tolak"} permohonan ${application.legalName}?`);
    if (!confirmed) return;
    try {
      await PartnerService.reviewApplication(application, decision, user.uid);
      showToast(decision === "APPROVED" ? "Mitra disetujui dan akses portal diaktifkan." : "Permohonan mitra ditolak.");
      render(container, { user });
    } catch (error) {
      console.error("Keputusan permohonan mitra gagal disimpan.", error);
      showToast("Perubahan permohonan belum dapat disimpan. Silakan coba lagi.", "error");
    }
  }));
}
