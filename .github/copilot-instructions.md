DOKUMEN SPESIFIKASI MASTER PROMPT AI DEVELOPER: SJEK PLATFORMProyek: SJek On-Demand Multi-Portal Web System (SFood & SSend)Target Eksekusi: GitHub Copilot / Cursor / Claude Code di VS CodeArsitektur: Vanilla HTML5, CSS3 Kustom Modern, Vanilla JavaScript (ES6+ Modules), Leaflet.js (OpenStreetMap + OSRM), Firebase Firestore & Authentication (Client-Driven via Service Abstraction Layer).1. What it is & Core RulesA fully functional, multi-portal on-demand web application named SJek delivering two core services: SFood (food delivery) and SSend (point-to-point package courier). The application runs as a responsive Single Page Application (SPA) designed with a mobile-first philosophy for Customer and Driver portals, and a clean data-dense dashboard layout for Merchant and Owner/Admin portals.Aturan Disiplin AI Coding:Verbatim Fidelity: Semua nama file, struktur state, skema kalkulasi ongkir, rumus pembagian komisi 3 pihak, dan nama fungsi service layer di dokumen ini bersifat mengikat dan wajib diimplementasikan persis sesuai spesifikasi.Service Abstraction Mandate: Komponen tampilan (views/) DILARANG memanggil SDK Firebase secara langsung. Semua operasi baca/tulis/query database wajib melalui fungsi wrapper di /js/services/ agar memudahkan migrasi ke REST API / backend server mandiri di kemudian hari.No External Paid APIs: Integrasi peta dan rute sepenuhnya menggunakan Leaflet.js, OpenStreetMap tiles, dan Open Source Routing Machine (OSRM) API publik. Bebas API key berbayar.Zero CSS Framework: Tidak menggunakan Bootstrap atau Tailwind. Seluruh tampilan dibangun dengan CSS kustom murni menggunakan CSS Variables, CSS Grid, dan Flexbox.2. Struktur Direktori ProyekPastikan pohon direktori proyek dibuat persis seperti berikut:Plaintextsjek-workspace/
├── index.html
├── package.json
├── css/
│   ├── main.css
│   ├── components.css
│   ├── maps.css
│   └── dashboard.css
├── js/
│   ├── app.js
│   ├── config/
│   │   └── firebase-config.js
│   ├── services/
│   │   ├── authService.js
│   │   ├── mapService.js
│   │   ├── pricingService.js
│   │   ├── financeService.js
│   │   ├── orderService.js
│   │   └── merchantService.js
│   └── views/
│       ├── customer/
│       │   ├── customerHomeView.js
│       │   ├── sfoodView.js
│       │   ├── ssendView.js
│       │   └── orderTrackingView.js
│       ├── driver/
│       │   ├── driverOrdersView.js
│       │   └── driverFinanceView.js
│       ├── merchant/
│       │   ├── merchantOrdersView.js
│       │   ├── menuManagementView.js
│       │   └── merchantFinanceView.js
│       └── admin/
│           ├── adminDashboardView.js
│           ├── tariffManagementView.js
│           ├── voucherManagementView.js
│           └── ownerFinanceView.js
└── assets/
    └── img/
        └── sjek-logo.svg
3. Config & Shell Files (Verbatim)package.jsonJSON{
  "name": "sjek-platform-core",
  "version": "1.0.0",
  "private": true,
  "description": "SJek On-Demand Multi-Portal Web App: SFood, SSend, Tariffs & 3-Party Financial Ledger",
  "scripts": {
    "start": "npx serve -s . -l 3000"
  },
  "dependencies": {
    "firebase-admin": "^14.5.0",
    "leaflet": "^1.9.4"
  }
}
Firebase Web SDK dimuat dari CDN versi 13.2.0 melalui js/config/firebase-config.js dan firebase-messaging-sw.js. Firebase Admin SDK hanya digunakan oleh Netlify Functions pada Node.js 22.
index.htmlHTML<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#00880C" />
  <title>SJek | Solusi Cepat SFood & SSend</title>
  
  <!-- Leaflet CSS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  
  <!-- Stylesheets -->
  <link rel="stylesheet" href="css/main.css" />
  <link rel="stylesheet" href="css/components.css" />
  <link rel="stylesheet" href="css/maps.css" />
  <link rel="stylesheet" href="css/dashboard.css" />
</head>
<body>
  <!-- Header / Top Bar -->
  <header class="sjek-header">
    <div class="header-container">
      <div class="brand-area" onclick="location.hash='#/'">
        <span class="brand-text">S<span>Jek</span></span>
      </div>
      <div class="portal-selector" id="portal-selector">
        <select id="role-switcher" aria-label="Ganti Portal">
          <option value="customer">Portal Pelanggan</option>
          <option value="driver">Portal Driver</option>
          <option value="merchant">Portal Toko SFood</option>
          <option value="admin">Portal Owner & Admin</option>
        </select>
      </div>
    </div>
  </header>

  <!-- Main View Mount Point -->
  <main id="app-viewport"></main>

  <!-- Global Modal & Toast Container -->
  <div id="modal-container" class="modal-overlay hidden"></div>
  <div id="toast-container" class="toast-container"></div>

  <!-- Leaflet JS & App Bootstrapper -->
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
css/main.cssCSS@charset "UTF-8";
:root {
  --sjek-green: #00880C;
  --sjek-green-dark: #006609;
  --sjek-green-light: #E8F5E9;
  --sjek-red: #EE2737;
  --sjek-dark: #1C1C1C;
  --sjek-gray-bg: #F6F7F8;
  --sjek-border: #E0E0E0;
  --sjek-text-muted: #6E6E6E;
  --sjek-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --sjek-radius: 12px;
  --sjek-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--sjek-font);
  background-color: var(--sjek-gray-bg);
  color: var(--sjek-dark);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.sjek-header {
  position: sticky;
  top: 0;
  background: #ffffff;
  border-bottom: 1px solid var(--sjek-border);
  z-index: 1000;
  padding: 0 16px;
  height: 56px;
  display: flex;
  align-items: center;
}

.header-container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-text {
  font-size: 24px;
  font-weight: 800;
  color: var(--sjek-green);
  cursor: pointer;
  letter-spacing: -0.5px;
}

.brand-text span {
  color: var(--sjek-dark);
}

#role-switcher {
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid var(--sjek-border);
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  color: var(--sjek-dark);
  cursor: pointer;
}

#app-viewport {
  min-height: calc(100vh - 56px);
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 60px;
}
4. Core Business Logic & Financial Formulas (Verbatim)js/services/pricingService.jsFile ini mengatur kalkulasi jarak, tarif, dan pemotongan voucher secara matematis dan deterministik:JavaScriptexport const DEFAULT_TARIFFS = {
  ssend: {
    baseKm: 2,
    baseFare: 8000,
    perKm: 2500
  },
  sfood: {
    baseKm: 2,
    baseFare: 7000,
    perKm: 2000
  },
  platformFee: 1000,
  driverCommissionPct: 15,   // 15% dari ongkir masuk ke Owner
  merchantCommissionPct: 20  // 20% dari subtotal makanan masuk ke Owner
};

export class PricingService {
  /**
   * Menghitung ongkir kotor sebelum voucher
   */
  static calculateDeliveryFare(serviceType, distanceKm, tariffRules = DEFAULT_TARIFFS) {
    const rules = serviceType === 'SSEND' ? tariffRules.ssend : tariffRules.sfood;
    const distance = Math.max(0, distanceKm);

    if (distance <= rules.baseKm) {
      return rules.baseFare;
    }
    const extraKm = Math.ceil(distance - rules.baseKm);
    return rules.baseFare + (extraKm * rules.perKm);
  }

  /**
   * Validasi dan kalkulasi potongan voucher promo
   */
  static applyVoucher(voucher, subtotal, deliveryFare) {
    if (!voucher || !voucher.isActive) {
      return { discountAmount: 0, isValid: false, reason: 'Voucher tidak aktif' };
    }

    const targetAmount = voucher.target === 'DELIVERY' ? deliveryFare : subtotal;

    if (targetAmount < voucher.minSpend) {
      return { 
        discountAmount: 0, 
        isValid: false, 
        reason: `Minimal transaksi Rp ${voucher.minSpend.toLocaleString('id-ID')}` 
      };
    }

    let discount = 0;
    if (voucher.type === 'PERCENT') {
      discount = (targetAmount * voucher.value) / 100;
      if (voucher.maxDiscount && discount > voucher.maxDiscount) {
        discount = voucher.maxDiscount;
      }
    } else if (voucher.type === 'FIXED') {
      discount = voucher.value;
    }

    // Diskon tidak boleh melebihi nilai target
    discount = Math.min(discount, targetAmount);

    return {
      discountAmount: Math.round(discount),
      isValid: true,
      reason: 'Voucher berhasil diterapkan'
    };
  }
}
js/services/financeService.jsFile ini membedah setiap transaksi yang selesai (COMPLETED) menjadi 3 pos pembukuan resmi: Owner (Platform), Driver, dan Toko SFood:JavaScriptexport class FinanceService {
  /**
   * Breakdown Pembukuan Finansial 3 Pihak per Transaksi Selesai
   */
  static calculateSplitBreakdown({
    serviceType,       // 'SFOOD' | 'SSEND'
    subtotalFood = 0,  // Nilai kotor belanja makanan
    deliveryFare = 0,  // Ongkir riil
    voucherDiscount = 0, // Subsidi diskon (ditanggung platform)
    tariffs
  }) {
    const driverCommRate = (tariffs.driverCommissionPct || 15) / 100;
    const merchantCommRate = (tariffs.merchantCommissionPct || 20) / 100;
    const platformFee = tariffs.platformFee || 1000;

    // 1. Mitra Driver: Dapat ongkir utuh dikurangi komisi platform
    const platformCutFromDriver = Math.round(deliveryFare * driverCommRate);
    const driverNetEarning = deliveryFare - platformCutFromDriver;

    // 2. Mitra Toko SFood: Dapat penjualan makanan dikurangi komisi platform
    let platformCutFromMerchant = 0;
    let merchantNetEarning = 0;

    if (serviceType === 'SFOOD') {
      platformCutFromMerchant = Math.round(subtotalFood * merchantCommRate);
      merchantNetEarning = subtotalFood - platformCutFromMerchant;
    }

    // 3. Platform / Owner SJek: 
    // Pendapatan kotor = Komisi Driver + Komisi Toko + Biaya Layanan
    // Pendapatan bersih = Pendapatan kotor - Biaya Voucher Promo (jika disubsidi)
    const platformGrossProfit = platformCutFromDriver + platformCutFromMerchant + platformFee;
    const platformNetProfit = platformGrossProfit - voucherDiscount;

    return {
      transactionTotals: {
        customerTotalToPay: (subtotalFood + deliveryFare + platformFee) - voucherDiscount,
        rawSubtotalFood: subtotalFood,
        rawDeliveryFare: deliveryFare,
        platformFee: platformFee,
        voucherDiscountUsed: voucherDiscount
      },
      driverLedger: {
        grossFare: deliveryFare,
        platformFeeDeducted: platformCutFromDriver,
        netDisbursement: driverNetEarning
      },
      merchantLedger: {
        grossSales: subtotalFood,
        platformCommissionDeducted: platformCutFromMerchant,
        netDisbursement: merchantNetEarning
      },
      ownerLedger: {
        fromDriverCommission: platformCutFromDriver,
        fromMerchantCommission: platformCutFromMerchant,
        fromPlatformFee: platformFee,
        voucherSubsidyExpense: voucherDiscount,
        netPlatformProfit: platformNetProfit
      }
    };
  }
}
5. Implementasi Peta Gratis & Routing (Verbatim)js/services/mapService.jsJavaScriptexport class MapService {
  constructor(containerId, defaultCenter = [3.0, 99.6], defaultZoom = 13) {
    this.map = L.map(containerId).setView(defaultCenter, defaultZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.pickupMarker = null;
    this.dropoffMarker = null;
    this.routePolyline = null;
  }

  setPickupLocation(lat, lng, label = 'Titik Jemput') {
    if (this.pickupMarker) this.map.removeLayer(this.pickupMarker);
    this.pickupMarker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
    this.pickupMarker.bindPopup(`<b>${label}</b>`).openPopup();
    return this.pickupMarker;
  }

  setDropoffLocation(lat, lng, label = 'Titik Antar') {
    if (this.dropoffMarker) this.map.removeLayer(this.dropoffMarker);
    this.dropoffMarker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
    this.dropoffMarker.bindPopup(`<b>${label}</b>`).openPopup();
    return this.dropoffMarker;
  }

  /**
   * Mengambil rute dan jarak jalan riil menggunakan OSRM API (Gratis)
   */
  async calculateRealRoute(startLat, startLng, endLat, endLng) {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!data.routes || data.routes.length === 0) {
        throw new Error('Rute tidak ditemukan');
      }

      const route = data.routes[0];
      const distanceKm = +(route.distance / 1000).toFixed(2);
      const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

      // Render rute di peta
      if (this.routePolyline) this.map.removeLayer(this.routePolyline);
      this.routePolyline = L.polyline(coordinates, { color: '#00880C', weight: 5, opacity: 0.8 }).addTo(this.map);
      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [50, 50] });

      return {
        distanceKm,
        durationMinutes: Math.ceil(route.duration / 60)
      };
    } catch (error) {
      console.warn('OSRM Offline / Gagal. Fallback ke kalkulasi garis lurus (Haversine).', error);
      const fallbackKm = this.calculateHaversineDistance(startLat, startLng, endLat, endLng);
      return { distanceKm: fallbackKm, durationMinutes: Math.ceil(fallbackKm * 3) };
    }
  }

  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius bumi dalam KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return +(R * c).toFixed(2);
  }
}
6. Spesifikasi Fitur Tiap PortalA. Portal Pelanggan (/views/customer/)Layanan SFood (sfoodView.js):Direktori resto mitra dengan filter kategori (Nasi, Minuman, Cepat Saji, Camilan).Katalog menu resto dengan modal variasi/opsi (misal: Level Pedas 1-5, Catatan Bebas Bawang).Modul Checkout Keranjang: Otomatis menghitung jarak resto ke pemesan, memilih promo/voucher aktif, menampilkan rincian ongkir + biaya layanan Rp 1.000, serta memilih opsi pembayaran COD / Simulasi QRIS.Layanan SSend (ssendView.js):Integrasi form peta Leaflet dengan 2 marker (Jemput & Antar).Input data: Nama/WhatsApp Pengirim, Nama/WhatsApp Penerima, Kategori Paket (Dokumen, Makanan, Elektronik, Pecah Belah).Rincian ongkir instan berdasarkan jarak OSRM dan input kode voucher.Pelacakan Live (orderTrackingView.js):Indikator status tahapan pesanan: MENUNGGU $\rightarrow$ DITERIMA_DRIVER $\rightarrow$ DIPROSES_TOKO $\rightarrow$ DIANTAR $\rightarrow$ SELESAI.Tombol pintas "Hubungi Driver via WhatsApp".B. Portal Driver (/views/driver/)Penerimaan Order (driverOrdersView.js):Toggle status "Online / Offline".Kotak dialog orderan masuk dengan hitungan mundur 30 detik: menampilkan jenis pesanan (SFood / SSend), estimasi km, alamat jemput & antar, serta pendapatan bersih driver.Manajemen perjalanan: Tombol "Tiba di Lokasi", "Pesanan Diambil", dan "Selesaikan Pengantaran".Laporan Dompet Driver (driverFinanceView.js):Kartu ringkasan: Total penghasilan hari ini, jumlah trip selesai, dan total kilometer tempuh.Riwayat transaksi per trip: Ongkir kotor, potongan komisi platform (15%), dan pendapatan bersih yang masuk ke saku/dompet.C. Portal Toko SFood (/views/merchant/)Operasional Pesanan (merchantOrdersView.js):Notifikasi pesanan SFood baru masuk. Tombol aksi: "Terima & Masak" $\rightarrow$ "Makanan Siap Diambil Driver".Manajemen Menu (menuManagementView.js):Tambah/edit/hapus hidangan, pasang foto via URL, ubah status ketersediaan "Habis / Tersedia", dan kelola opsi varian.Laporan Penjualan Toko (merchantFinanceView.js):Rekap omzet penjualan kotor resto.Potongan komisi platform (20%).Saldo bersih penjualan yang siap dicairkan/ditransfer.D. Portal Owner & Superadmin (/views/admin/)Pengaturan Tarif (tariffManagementView.js):Form dinamis pengubah tarif: Tarif dasar, tarif per km (SFood & SSend), biaya layanan aplikasi, serta persentase potongan komisi driver dan resto.Pengaturan Voucher Promo (voucherManagementView.js):CRUD Voucher: Kode voucher (contoh: SJEKHEMAT), tipe diskon (% atau Rp tetap), batas maksimum diskon, minimum belanja, kuota pemakaian, tanggal kedaluwarsa, dan status aktif/nonaktif.Laporan Finansial Platform (ownerFinanceView.js):Kartu Metrik Utama: Total GMV (Nilai Transaksi Kotor), Pendapatan Bersih Owner, Total Beban Subsidi Voucher, dan Total Trip Selesai.Filter rentang waktu: Hari Ini, 7 Hari Terakhir, Bulan Ini, dan Filter Kalender Kustom.Tabel Pembukuan Lengkap: Kolom ID Order, Layanan, Omzet, Hak Driver, Hak Toko, Komisi Masuk ke Owner, dan Status Pencairan.7. Skema Data Firestore (Collections)Plaintextusers/
  {uid}: { name, email, phone, role: 'customer'|'driver'|'merchant'|'admin' }

merchants/
  {merchantId}: { name, ownerUid, address, lat, lng, isOpen, rating, bannerUrl }
  └── menu/
        {menuId}: { name, price, description, isAvailable, category, variants: [] }

tariffs/
  global_settings: { ssend: {...}, sfood: {...}, platformFee, driverCommissionPct, merchantCommissionPct }

vouchers/
  {voucherCode}: { code, type: 'PERCENT'|'FIXED', value, maxDiscount, minSpend, quota, usedCount, isActive, validUntil }

orders/
  {orderId}: {
    serviceType: 'SFOOD' | 'SSEND',
    orderStatus: 'PENDING' | 'ACCEPTED' | 'PROCESSING' | 'ON_THE_WAY' | 'COMPLETED' | 'CANCELLED',
    customerId, driverId, merchantId,
    pickup: { address, lat, lng, contactName, phone },
    dropoff: { address, lat, lng, contactName, phone },
    items: [ { name, qty, price, selectedVariants, notes } ],
    packageDetails: { category, weightKg, notes },
    pricingBreakdown: { distanceKm, deliveryFare, subtotalFood, platformFee, voucherDiscount, totalCustomerPay },
    financialLedger: { platformGross, platformNet, driverNet, merchantNet, voucherExpense },
    payment: { method: 'COD' | 'QRIS_SIMULATION', status: 'UNPAID' | 'PAID' },
    createdAt, updatedAt
  }
8. Definition of Done & Checklist VerifikasiSebelum menyatakan kode selesai, Copilot/Developer wajib memvalidasi alur berikut tanpa error:Eksekusi Lokal: Jalankan npm start atau npx serve . — Shell index.html dan CSS termuat sempurna tanpa error font/icon.Peta & Rute: Buka formulir SSend, klik titik jemput dan titik antar pada peta Leaflet. Garis polyline hijau OSRM wajib muncul beserta kalkulasi jarak kilometer dan nominal ongkir yang akurat.Kalkulasi Voucher: Uji kode voucher diskon 50% max Rp 10.000 dengan minimal transaksi Rp 20.000. Pastikan nilai potongan tidak pernah melebihi batas batas maksimum.Alur Transaksi & Finansial 3 Pihak:Buat pesanan SFood senilai Rp 50.000 (ongkir Rp 10.000, biaya layanan Rp 1.000, diskon voucher Rp 5.000).Ubah status order menjadi COMPLETED.Buka Portal Driver: Pastikan penghasilan bersih tercatat Rp 8.500 (ongkir Rp 10.000 dikurangi 15%).Buka Portal Toko: Pastikan saldo tercatat Rp 40.000 (penjualan Rp 50.000 dikurangi 20%).Buka Portal Owner: Pastikan pendapatan bersih tercatat Rp 7.500 (Komisi driver Rp 1.500 + Komisi toko Rp 10.000 + Biaya layanan Rp 1.000 dikurangi beban subsidi voucher Rp 5.000).Responsivitas Layar: Buka tampilan pada lebar 390 px (mobile device) untuk memastikan Portal Pelanggan dan Driver nyaman digunakan dengan satu tangan tanpa horizontal scrollbar.