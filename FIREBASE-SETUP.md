# Panduan Firebase SJek — tanpa Firebase Cloud Functions

Mode ini memakai Google Sign-In, Firestore Rules, dan layanan gratis dalam batas kuota. Pengiriman push memakai Netlify Functions (bukan Firebase Cloud Functions). Tidak ada SMS OTP atau unggahan dokumen identitas ke Firebase Storage.

## 1. Autentikasi Google

1. Firebase Console → **Authentication → Sign-in method** → aktifkan **Google**.
2. Pastikan email dukungan proyek dipilih, lalu tambahkan domain produksi dan domain pengembangan ke **Authorized domains**.
3. Pengguna masuk dengan akun Google beralamat Gmail. Setelah login, aplikasi meminta nomor ponsel dan menyimpannya sebagai **belum diverifikasi**; mode tanpa biaya tidak mengirim SMS.
4. Firebase Phone Auth mengenakan biaya per SMS. Jangan aktifkan atau menambahkan OTP jika proyek harus tetap pada Spark tanpa biaya. Nomor yang diketik pengguna bukan bukti kepemilikan nomor.
5. Akun lama yang dibuat dengan email/kata sandi harus menautkan provider Google terlebih dahulu melalui proses migrasi tepercaya; setelah provider ditautkan, gunakan Google Sign-In.

## 2. Firestore, RTDB, dan deployment

- `firestore.rules` — profil, permohonan mitra, katalog, aturan bisnis, koin, banner, token notifikasi, ulasan, banding, lokasi kurir, dan transisi status pesanan.
- `database.rules.json` — RTDB default-deny; aplikasi tidak menggunakannya.
- `firestore.indexes.json` — indeks komposit aplikasi.
- `storage.rules` — default-deny untuk bucket lama; aplikasi tidak memakai Firebase Storage.
- Aplikasi tidak menggunakan Firebase Cloud Functions atau Firebase Storage. Dokumen mitra harus diperiksa secara langsung; jangan mengunggah KTP/SIM/STNK ke Cloudinary publik.

Pasang rules melalui Firebase Console, atau dengan Firebase CLI:

```powershell
firebase login
firebase use sjek-4ebc0
firebase deploy --only firestore:rules,database
firebase deploy --only firestore:indexes
```

Jangan memakai rules test/trial. Rules hanya mengizinkan permintaan Ojek Online dengan estimasi tarif dan pembayaran tunai; harga final harus dikonfirmasi pelanggan dengan driver. Pesanan SFood/SSend tetap ditolak karena harga, voucher, dan ledger tidak dapat dipercaya jika dihitung oleh browser. Status pesanan diubah melalui transisi yang dibatasi Rules. Admin yang memiliki custom claims dapat meninjau mitra dan mengubah tarif/voucher; perubahan aturan dicatat bersama dalam batch Firestore dan dapat dibaca mitra.

Beranda dan informasi toko/banner aktif dapat dibaca tanpa login. Akses ke pemesanan, akun, dan portal tetap dibatasi sesuai peran. Terbitkan `firestore.rules` sebelum mengaktifkan fitur baru.

## 3. Push notification melalui Netlify

1. Pastikan situs utama berjalan melalui HTTPS. Daftarkan web app pada Firebase Console → **Project settings → Cloud Messaging → Web configuration**, buat Web Push certificate, lalu salin VAPID public key ke `vapidPublicKey` pada `js/config/firebase-config.js`.
2. Buat situs Netlify yang menaut ke repositori ini dan deploy dengan Node.js 22. `netlify.toml` menerbitkan fungsi pada `netlify/functions`; situs utama tetap dapat di-host di GitHub Pages.
3. Buat service account khusus pengirim notifikasi di Google Cloud IAM. Simpan seluruh JSON key sebagai secret Netlify `FIREBASE_SERVICE_ACCOUNT_JSON`; jangan menaruhnya di repositori atau konfigurasi browser.
4. Di pengaturan Environment variables Netlify, set `ALLOWED_ORIGINS` ke origin situs produksi dan origin lokal yang benar-benar dipakai (contoh: `https://contoh.github.io`). Nilai ini berupa origin saja, tanpa path atau garis miring di akhir.
5. Salin alamat dasar situs Netlify ke `notificationApiBaseUrl` di `js/config/firebase-config.js`, misalnya `https://nama-situs.netlify.app` (tanpa path fungsi).
6. Deploy ulang Netlify dan situs web. Di browser HTTPS, masuk lalu buka **Izin perangkat → Aktifkan notifikasi**. Token perangkat akan disimpan di `users/{uid}/pushTokens`.

Firebase Web SDK dimuat dari CDN versi yang dipatok di `js/config/firebase-config.js` dan `firebase-messaging-sw.js`; SDK Admin hanya dipasang di environment server Netlify.

Fungsi memverifikasi Firebase ID token, status pesanan, dan pelaku sebelum mengirim push. Pesanan baru diberitahukan ke semua profil kurir yang disetujui; ketika kurir menerima order, pesanan muncul langsung bagi toko terkait dan pelanggan. Push tetap tunduk pada kuota gratis Netlify/Firebase dan persetujuan browser. Suara harus diaktifkan melalui tombol perangkat, dan pemberitahuan tidak dijamin jika pengguna memblokir izin.

## 4. Ulasan, banding, dan pelacakan

- Pelanggan dapat mengirim satu ulasan untuk kurir dan/atau toko pada tiap pesanan yang selesai. Foto ulasan dan bukti banding dikompres terlebih dahulu sebelum diunggah.
- Banding hanya dapat diajukan pada ulasan bintang 1 atau 2, satu kali untuk setiap target/pesanan, dengan penjelasan dan foto bukti. Admin meninjau di **Banding penilaian**; keputusan menyetujui banding menyembunyikan ulasan.
- Kurir membagikan lokasinya dari tombol **Bagikan lokasi perjalanan**. Pembaruan hanya diizinkan untuk kurir tertugas pada pesanan aktif, dan pelanggan dapat melihat posisi pada peta. Izin lokasi harus disetujui browser.
- Semua pengguna dapat mengatur izin lokasi, kamera, notifikasi, dan suara lewat tombol **Izin perangkat**; browser hanya menampilkan dialog izin setelah tindakan pengguna.

## 5. Koin dan banner

1. Masuk sebagai admin, buka **Koin & hadiah**, lalu simpan hadiah check-in untuk tujuh hari. Check-in pertama belum dapat diklaim sebelum pengaturan ini disimpan.
2. Tambahkan hadiah voucher dan/atau uang tunai beserta biaya koinnya. Penolakan penukaran mengembalikan koin secara otomatis.
3. Permintaan hadiah tunai berstatus menunggu sampai admin menyetujui. Pencairan uang dilakukan secara manual oleh operator; tandai selesai di portal setelah transfer benar-benar dilakukan.
4. Buka **Banner beranda** untuk mengunggah, mengatur urutan, dan menampilkan promosi. Tautan banner hanya dapat menuju layanan SJek.

## 6. Membuat admin dan superadmin

1. Pengguna membuat profil melalui Google dan melengkapi nomor ponsel di aplikasi.
2. Buka **Google Cloud Shell** dengan akun operator tepercaya yang memiliki hak Firebase Authentication Admin dan Firestore. Jangan pernah menaruh service-account key di situs.
3. Jalankan `npm install firebase-admin`, lalu jalankan skrip berikut di Cloud Shell. Ganti alamat Gmail dan set `true` hanya untuk satu superadmin:

```js
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "sjek-4ebc0" });

async function provision(email, isSuperAdmin = false) {
  const auth = getAuth();
  const firestore = getFirestore();
  const user = await auth.getUserByEmail(email.toLowerCase());
  if (!user.emailVerified || !user.email?.toLowerCase().endsWith("@gmail.com")) {
    throw new Error("Akun Google harus menggunakan Gmail terverifikasi.");
  }
  await auth.setCustomUserClaims(user.uid, {
    admin: true,
    superAdmin: isSuperAdmin
  });
  await firestore.doc(`users/${user.uid}`).set({
    email: user.email,
    name: user.displayName || user.email,
    role: isSuperAdmin ? "superadmin" : "admin",
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log(`Hak ${isSuperAdmin ? "superadmin" : "admin"} diberikan kepada ${email}.`);
}

provision("admin@gmail.com", false)
  .then(() => process.exit(0))
  .catch(error => { console.error(error); process.exit(1); });
```

Untuk superadmin jalankan `provision("pemilik@gmail.com", true)`. Setelah claims diperbarui, pengguna perlu keluar lalu masuk kembali. Hak admin diperiksa dari custom claims, bukan dari field profil yang dapat diubah pengguna.

## 7. Mitra, dokumen, dan foto

Pengajuan mitra, NIK, dan data rekening/e-wallet disimpan di Firestore; Firestore Rules membatasi pembacaan ke pemohon dan admin. Dokumen identitas asli tidak diunggah dan tetap harus diperiksa langsung oleh admin. Jangan mengunggah KTP, SIM, STNK, nomor rekening, atau dokumen privat ke Cloudinary.

Pendaftaran driver memiliki foto diri bersama kendaraan; pendaftaran toko memiliki foto diri di depan toko, pin peta, dan jam operasional harian/kustom. Foto mitra dan produk dikompres ke WebP di browser sebelum upload dan disimpan sebagai gambar publik di Cloudinary. Pastikan preset `webapp-sjek` bertipe **Unsigned** dan batasi ukuran serta format ke WebP bila tersedia. Preset unsigned dapat dipakai pihak lain yang mengetahui namanya; pantau penggunaan dan kuota Cloudinary. Jangan letakkan informasi pribadi di dalam foto publik.

Admin meninjau foto toko dari dokumen permohonan; profil toko publik menyimpan lokasi dan jam operasional tanpa menampilkan foto verifikasi tersebut sebagai banner. Setelah disetujui, foto menu baru wajib berupa WebP di Cloudinary; aplikasi menolak URL foto produk yang bukan Cloudinary WebP.

## 8. Batas mode gratis

- Firebase Spark memberi kuota tanpa biaya untuk layanan tertentu, bukan kapasitas tanpa batas. Pantau batas penggunaan Firestore, Authentication, Hosting, dan Cloudinary; fitur dapat terhenti saat kuota tercapai.
- Firebase Phone Auth SMS berbayar dan tidak dipakai di mode ini.
- Permintaan Ojek Online menyimpan estimasi untuk pembayaran tunai yang dikonfirmasi bersama driver; estimasi dari browser bukan harga final atau ledger. Checkout SFood/SSend tetap dinonaktifkan sampai tersedia backend tepercaya untuk memvalidasi harga, voucher, dan pembagian uang.
- Firebase Storage tidak digunakan karena kuota/ketersediaannya bergantung pada bucket dan lokasi proyek. Bucket lama tidak dihapus otomatis; periksa pengaturan billing di Firebase/Google Cloud Console.
- Netlify Functions berjalan dalam kuota/credits paket Netlify. Push dapat berhenti saat kuota tercapai; periksa harga dan batas terbaru sebelum peluncuran.
- Jika bucket lama masih ada, tempel `storage.rules` di Firebase Console → Storage → Rules agar tidak ada akses data lama.
- `database.rules.json` tetap default-deny karena URL dan skema Realtime Database tidak dipakai aplikasi.

Periksa halaman [Firebase Pricing](https://firebase.google.com/pricing) sebelum peluncuran. Tidak ada jaminan semua layanan pihak ketiga tetap gratis bila batas kuota terlampaui.
