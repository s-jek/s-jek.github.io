import { escapeHTML, showToast } from "../app.js";
import { MapService } from "../services/mapService.js";
import { MediaService } from "../services/mediaService.js";
import { PartnerService } from "../services/partnerService.js";

const agreementVersion = "1.1";
const photonUrl = "https://photon.komoot.io";
const weekdays = [
  ["monday", "Senin"], ["tuesday", "Selasa"], ["wednesday", "Rabu"], ["thursday", "Kamis"],
  ["friday", "Jumat"], ["saturday", "Sabtu"], ["sunday", "Minggu"]
];

async function lookupAddress(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Pencarian alamat merespons HTTP ${response.status}`);
  return response.json();
}

function formatAddress(feature) {
  const place = feature?.properties || {};
  const street = [place.housenumber, place.street].filter(Boolean).join(" ");
  return [...new Set([place.name, street, place.district, place.suburb, place.city || place.town || place.village, place.state]
    .filter(Boolean))].join(", ");
}

function renderPhotoField({ name, label, instructions, id }) {
  return `<label class="field partner-photo-field">${label}
    <input id="${id}" name="${name}" type="file" accept="image/*" capture="environment" required>
    <small class="muted">${instructions}</small>
    <span class="partner-photo-status" id="${id}-status" aria-live="polite"></span>
    <img id="${id}-preview" class="partner-photo-preview hidden" alt="Pratinjau ${label.toLowerCase()}">
  </label>`;
}

export async function render(container, { user, path }) {
  if (!user) {
    location.hash = "#/auth";
    return;
  }
  const partnerType = path.endsWith("/driver") ? "driver" : "merchant";
  const isDriver = partnerType === "driver";
  container.innerHTML = `<section class="page-heading"><a href="#/customer" class="muted">‹ Kembali ke beranda</a><h1>Daftar Mitra ${isDriver ? "Kurir" : "Food"}</h1><p>Permohonan ditinjau tim SJek. Portal mitra aktif setelah persetujuan dan verifikasi data.</p></section>
    <form id="partner-form" class="stack">
      <section class="card stack"><h2>Data pemohon</h2><div class="form-grid">
        <label class="field">Nama sesuai identitas<input name="legalName" autocomplete="name" value="${escapeHTML(user.name)}" required></label>
        <label class="field">Nomor ponsel<input value="${escapeHTML(user.phone)}" readonly></label>
        <label class="field">NIK<input name="nik" inputmode="numeric" pattern="[0-9]{16}" minlength="16" maxlength="16" placeholder="16 digit" required></label>
        ${isDriver ? `
          <label class="field">Alamat domisili<input name="address" autocomplete="street-address" required></label>
          <label class="field">Kontak darurat (opsional)<input name="emergencyContact" type="tel" autocomplete="tel"></label>
          <label class="field">Nomor SIM C (opsional)<input name="licenseNumber" autocomplete="off"></label>
          <label class="field">Nomor polisi kendaraan<input name="vehiclePlate" required></label>
          <label class="field">Merek / tipe kendaraan<input name="vehicleType" required></label>
          <label class="field">Nama Bank / E-Wallet<input name="payoutProvider" autocomplete="organization" required></label>
          <label class="field">Nomor Rekening / No HP E-Wallet<input name="payoutAccount" inputmode="numeric" autocomplete="off" required></label>
          ${renderPhotoField({ name: "vehiclePhoto", label: "Foto bersama kendaraan", instructions: "Ambil foto yang memperlihatkan mitra dan kendaraan dengan jelas.", id: "vehicle-photo" })}
        ` : `
          <label class="field">Nama usaha / toko<input name="businessName" required></label>
          <label class="field">Alamat usaha<input name="businessAddress" id="business-address" autocomplete="street-address" required></label>
          <label class="field">Kategori utama<select name="businessCategory" required><option value="Nasi">Nasi</option><option value="Minuman">Minuman</option><option value="Cepat Saji">Cepat Saji</option><option value="Camilan">Camilan</option><option value="Lainnya">Lainnya</option></select></label>
          <label class="field">NIB (opsional)<input name="businessLicense" autocomplete="off"></label>
          <label class="field">Nama Bank / E-Wallet<input name="payoutProvider" autocomplete="organization" required></label>
          <label class="field">Nomor Rekening / No HP E-Wallet<input name="payoutAccount" inputmode="numeric" autocomplete="off" required></label>
          <input name="businessLat" id="business-lat" type="hidden" required>
          <input name="businessLng" id="business-lng" type="hidden" required>
          <div class="partner-map-section"><div class="split"><div><h3>Pin lokasi toko</h3><p class="muted">Cari alamat, gunakan lokasi perangkat, atau ketuk/geser pin ke posisi toko.</p></div><button class="btn btn-ghost" id="shop-current-location" type="button">◎ Lokasi saya</button></div>
            <label class="field">Cari alamat toko<input id="shop-location-search" autocomplete="off" placeholder="Nama jalan, toko, atau tempat terdekat" aria-autocomplete="list" aria-controls="shop-suggestions" aria-expanded="false"></label>
            <div class="partner-suggestions hidden" id="shop-suggestions" role="listbox" aria-label="Saran lokasi toko"></div>
            <div id="partner-shop-map" class="map-panel" aria-label="Peta pilih lokasi toko"></div>
            <small class="muted" id="shop-location-status" aria-live="polite">Lokasi belum dipilih.</small>
          </div>
          <fieldset class="partner-hours"><legend>Jam operasional</legend>
            <label class="partner-hours-mode"><input type="radio" name="hoursMode" value="daily" checked> Jam sama setiap hari</label>
            <div class="form-grid partner-daily-hours"><label class="field">Buka<input name="dailyOpen" type="time" value="09:00" required></label><label class="field">Tutup<input name="dailyClose" type="time" value="21:00" required></label></div>
            <label class="partner-hours-mode"><input type="radio" name="hoursMode" value="custom"> Atur jam khusus per hari</label>
            <div class="partner-custom-hours hidden">${weekdays.map(([day, label]) => `<div class="partner-weekday-row" data-day-row="${day}"><strong>${label}</strong><label class="partner-closed-toggle"><input type="checkbox" name="${day}Closed"> Tutup</label><label class="field"><span class="sr-only">${label} buka</span><input name="${day}Open" type="time" value="09:00" aria-label="${label} jam buka"></label><span>—</span><label class="field"><span class="sr-only">${label} tutup</span><input name="${day}Close" type="time" value="21:00" aria-label="${label} jam tutup"></label></div>`).join("")}</div>
          </fieldset>
          ${renderPhotoField({ name: "storefrontPhoto", label: "Foto diri di depan toko", instructions: "Foto harus memperlihatkan pemohon dan bagian depan toko.", id: "storefront-photo" })}
        `}
      </div></section>
      <section class="card stack"><h2>Perjanjian Mitra SJek v${agreementVersion}</h2>
        <div class="agreement-box">
          <p>Dengan mengajukan pendaftaran, pemohon menyatakan bahwa data dan dokumen yang diberikan benar, merupakan pemilik atau pihak yang berwenang, serta bersedia diverifikasi SJek.</p>
          <p>Mitra wajib mematuhi hukum yang berlaku, menjaga keselamatan dan kebersihan, melindungi data pelanggan, tidak melakukan diskriminasi atau penipuan, serta menggunakan akun dan layanan secara bertanggung jawab.</p>
          <p>Untuk kurir: wajib menjaga keselamatan berkendara dan dokumen kendaraan yang berlaku, serta menangani barang dengan wajar. Nomor SIM C dan kontak darurat bersifat opsional pada formulir ini.</p>
          <p>Untuk mitra food: bertanggung jawab atas keamanan pangan, informasi menu dan harga, izin usaha yang diwajibkan, jam operasional, serta ketepatan pesanan.</p>
          <p>Komisi, tarif, biaya, dan kebijakan operasional ditampilkan di aplikasi. SJek akan mengumumkan setiap perubahan aturan bisnis kepada mitra melalui notifikasi dalam aplikasi sebelum atau saat perubahan berlaku.</p>
          <p>SJek dapat menangguhkan akun untuk investigasi pelanggaran, menjaga keselamatan, atau memenuhi kewajiban hukum. Data pribadi digunakan sebatas verifikasi, operasional, pembayaran, keamanan, dan kewajiban hukum sesuai Kebijakan Privasi SJek.</p>
          <p>Perjanjian ini merupakan draf operasional dan perlu ditinjau penasihat hukum sebelum diberlakukan sebagai kontrak final.</p>
        </div>
        <label class="agreement-check"><input name="agreementAccepted" type="checkbox" required> Saya telah membaca dan menyetujui Perjanjian Mitra SJek v${agreementVersion}.</label>
      </section>
      <button class="btn btn-primary" type="submit">Kirim permohonan mitra</button>
    </form>`;

  const form = container.querySelector("#partner-form");
  let mapService = null;
  let shopSearchTimer = 0;
  let shopSearchController = null;
  let shopReverseController = null;
  let destroyed = false;
  let shopPinSet = false;
  if (!isDriver) {
    mapService = new MapService("partner-shop-map", [3.584, 98.675], 13);
    const latitude = form.elements.businessLat;
    const longitude = form.elements.businessLng;
    const address = form.elements.businessAddress;
    const locationStatus = container.querySelector("#shop-location-status");
    const suggestions = container.querySelector("#shop-suggestions");
    const searchInput = container.querySelector("#shop-location-search");
    const setShopPoint = (point, label = "") => {
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      shopPinSet = true;
      latitude.value = String(lat);
      longitude.value = String(lng);
      mapService.setPickupLocation(lat, lng, "Lokasi Toko");
      mapService.centerOn(lat, lng);
      if (label) address.value = label;
      locationStatus.textContent = `Pin toko: ${lat.toFixed(6)}, ${lng.toFixed(6)}${label ? ` · ${label}` : ""}`;
      shopReverseController?.abort();
      const controller = new AbortController();
      shopReverseController = controller;
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: "default" });
      lookupAddress(`${photonUrl}/reverse?${params}`, controller.signal).then(result => {
        if (destroyed || controller.signal.aborted) return;
        const foundAddress = formatAddress(result.features?.[0]);
        if (foundAddress) {
          address.value = foundAddress;
          locationStatus.textContent = `Pin toko siap: ${lat.toFixed(6)}, ${lng.toFixed(6)} · ${foundAddress}`;
        }
      }).catch(error => {
        if (error.name !== "AbortError" && !destroyed) {
          locationStatus.textContent = `Pin tersimpan: ${lat.toFixed(6)}, ${lng.toFixed(6)}. Alamat dapat diisi manual.`;
        }
      });
    };
    mapService.setLocationHandler(point => setShopPoint(point));
    searchInput.addEventListener("input", () => {
      window.clearTimeout(shopSearchTimer);
      shopSearchController?.abort();
      const query = searchInput.value.trim();
      if (query.length < 3) {
        suggestions.innerHTML = "";
        suggestions.classList.add("hidden");
        searchInput.setAttribute("aria-expanded", "false");
        return;
      }
      suggestions.innerHTML = `<div class="partner-suggestion-message">Mencari lokasi…</div>`;
      suggestions.classList.remove("hidden");
      searchInput.setAttribute("aria-expanded", "true");
      shopSearchTimer = window.setTimeout(async () => {
        const controller = new AbortController();
        shopSearchController = controller;
        try {
          const params = new URLSearchParams({ q: query, limit: "5", lang: "default" });
          const result = await lookupAddress(`${photonUrl}/api/?${params}`, controller.signal);
          if (destroyed || controller.signal.aborted || searchInput.value.trim() !== query) return;
          const features = result.features || [];
          if (!features.length) {
            suggestions.innerHTML = `<div class="partner-suggestion-message">Alamat tidak ditemukan. Coba nama jalan atau tempat terdekat.</div>`;
            return;
          }
          suggestions.innerHTML = features.map((feature, index) => `<button class="partner-suggestion" type="button" data-place="${index}">${escapeHTML(formatAddress(feature) || query)}</button>`).join("");
          suggestions.querySelectorAll("[data-place]").forEach(button => button.addEventListener("click", () => {
            const feature = features[Number(button.dataset.place)];
            const [lng, lat] = feature.geometry.coordinates;
            const foundAddress = formatAddress(feature);
            searchInput.value = foundAddress;
            address.value = foundAddress;
            suggestions.classList.add("hidden");
            searchInput.setAttribute("aria-expanded", "false");
            setShopPoint({ lat, lng }, foundAddress);
          }));
        } catch (error) {
          if (error.name !== "AbortError" && !destroyed) {
            suggestions.innerHTML = `<div class="partner-suggestion-message">Pencarian lokasi gagal. Coba lagi atau pilih pin pada peta.</div>`;
          }
        }
      }, 700);
    });
    container.querySelector("#shop-current-location").addEventListener("click", () => {
      if (!navigator.geolocation) {
        locationStatus.textContent = "Browser tidak mendukung lokasi. Cari alamat atau pilih titik pada peta.";
        return;
      }
      locationStatus.textContent = "Mengambil lokasi perangkat…";
      navigator.geolocation.getCurrentPosition(position => {
        if (!destroyed) setShopPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
      }, error => {
        if (!destroyed) locationStatus.textContent = error.code === error.PERMISSION_DENIED
          ? "Izin lokasi ditolak. Cari alamat atau pilih titik pada peta."
          : "Lokasi tidak tersedia. Cari alamat atau pilih titik pada peta.";
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });
    searchInput.addEventListener("focus", () => {
      if (suggestions.childElementCount) suggestions.classList.remove("hidden");
    });
    container.addEventListener("click", event => {
      if (!event.target.closest("#shop-location-search") && !event.target.closest("#shop-suggestions")) {
        suggestions.classList.add("hidden");
        searchInput.setAttribute("aria-expanded", "false");
      }
    });

    const setHoursMode = mode => {
      const custom = mode === "custom";
      container.querySelector(".partner-daily-hours").classList.toggle("hidden", custom);
      container.querySelector(".partner-custom-hours").classList.toggle("hidden", !custom);
      form.elements.dailyOpen.required = !custom;
      form.elements.dailyClose.required = !custom;
      for (const [day] of weekdays) {
        const closed = form.elements[`${day}Closed`].checked;
        form.elements[`${day}Open`].required = custom && !closed;
        form.elements[`${day}Close`].required = custom && !closed;
      }
    };
    form.querySelectorAll('input[name="hoursMode"]').forEach(input => input.addEventListener("change", () => setHoursMode(input.value)));
    for (const [day] of weekdays) {
      form.elements[`${day}Closed`].addEventListener("change", () => {
        const closed = form.elements[`${day}Closed`].checked;
        form.elements[`${day}Open`].disabled = closed;
        form.elements[`${day}Close`].disabled = closed;
        setHoursMode(form.elements.hoursMode.value);
      });
    }
  }

  const photoFiles = isDriver
    ? [{ field: "vehiclePhoto", id: "vehicle-photo" }]
    : [{ field: "storefrontPhoto", id: "storefront-photo" }];
  const photoInputs = photoFiles.map(({ field, id }) => {
    const input = form.elements[field];
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      const preview = container.querySelector(`#${id}-preview`);
      const status = container.querySelector(`#${id}-status`);
      if (!file) {
        preview.classList.add("hidden");
        preview.removeAttribute("src");
        status.textContent = "";
        return;
      }
      if (!file.type.startsWith("image/")) {
        input.setCustomValidity("Pilih file gambar.");
        status.textContent = "File harus berupa gambar.";
        return;
      }
      input.setCustomValidity("");
      const url = URL.createObjectURL(file);
      preview.src = url;
      preview.classList.remove("hidden");
      status.textContent = `Foto dipilih: ${file.name}`;
    });
    return { field, id, input };
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!isDriver && !shopPinSet) {
      showToast("Tentukan pin lokasi toko pada peta sebelum mengirim permohonan.", "error");
      container.querySelector("#partner-shop-map").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Mengirim permohonan…";
    let uploadedPhotos = {};
    try {
      for (const { field, id, input } of photoInputs) {
        const status = container.querySelector(`#${id}-status`);
        status.textContent = "Memproses foto…";
        const folder = isDriver ? "sjek/partners/driver" : "sjek/partners/merchant";
        const uploaded = await MediaService.uploadPublicImage(input.files[0], folder);
        uploadedPhotos = {
          ...uploadedPhotos,
          ...(isDriver
            ? { vehiclePhotoUrl: uploaded.url, vehiclePhotoPublicId: uploaded.publicId }
            : { storefrontPhotoUrl: uploaded.url, storefrontPhotoPublicId: uploaded.publicId })
        };
        status.textContent = "Foto siap digunakan.";
      }
      const values = Object.fromEntries(new FormData(form));
      const application = {
        partnerType,
        legalName: String(values.legalName || "").trim(),
        nik: String(values.nik || "").trim(),
        email: user.email,
        phone: user.phone,
        payoutProvider: String(values.payoutProvider || "").trim(),
        payoutAccount: String(values.payoutAccount || "").trim(),
        ...(isDriver ? {
          address: String(values.address || "").trim(),
          emergencyContact: String(values.emergencyContact || "").trim(),
          licenseNumber: String(values.licenseNumber || "").trim(),
          vehiclePlate: String(values.vehiclePlate || "").trim(),
          vehicleType: String(values.vehicleType || "").trim(),
          ...uploadedPhotos
        } : {
          businessName: String(values.businessName || "").trim(),
          businessAddress: String(values.businessAddress || "").trim(),
          businessCategory: values.businessCategory,
          businessLat: Number(values.businessLat),
          businessLng: Number(values.businessLng),
          businessLicense: String(values.businessLicense || "").trim(),
          openingHours: buildOpeningHours(values, weekdays),
          ...uploadedPhotos
        }),
        agreementVersion,
        agreementAccepted: values.agreementAccepted === "on"
      };
      await PartnerService.apply(user, application);
      showToast("Permohonan mitra berhasil dikirim dan menunggu verifikasi.");
      location.hash = "#/customer";
    } catch (error) {
      console.error("Permohonan mitra gagal dikirim.", error);
      showToast("Permohonan belum dapat dikirim. Periksa kembali data dan coba lagi.", "error");
      submitButton.disabled = false;
      submitButton.textContent = "Kirim permohonan mitra";
    }
  });

  container.addEventListener("DOMNodeRemoved", () => {
    destroyed = true;
    window.clearTimeout(shopSearchTimer);
    shopSearchController?.abort();
    shopReverseController?.abort();
    mapService?.destroy();
    for (const { input } of photoInputs) {
      const preview = container.querySelector(`#${input.name === "vehiclePhoto" ? "vehicle-photo" : "storefront-photo"}-preview`);
      if (preview?.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
    }
  }, { once: true });
}

function buildOpeningHours(values, days) {
  if (values.hoursMode !== "custom") return `Setiap hari ${values.dailyOpen}–${values.dailyClose}`;
  const labels = new Map(days);
  return days.map(([day]) => values[`${day}Closed`] === "on"
    ? `${labels.get(day)} tutup`
    : `${labels.get(day)} ${values[`${day}Open`]}–${values[`${day}Close`]}`).join("; ");
}
