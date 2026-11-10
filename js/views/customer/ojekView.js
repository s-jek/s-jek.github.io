import { escapeHTML, money, navigate, registerRouteCleanup, showToast } from "../../app.js";
import { MapService } from "../../services/mapService.js";
import { OrderService } from "../../services/orderService.js";
import { PricingService } from "../../services/pricingService.js";

const PHOTON_URL = "https://photon.komoot.io";
let addressLookupQueue = Promise.resolve();
let lastAddressLookupAt = 0;

async function lookupAddress(url, signal) {
  const previous = addressLookupQueue;
  let release;
  addressLookupQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    if (signal.aborted) {
      const error = new Error("Pencarian alamat dibatalkan.");
      error.name = "AbortError";
      throw error;
    }
    const delay = Math.max(0, lastAddressLookupAt + 1000 - Date.now());
    if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
    if (signal.aborted) {
      const error = new Error("Pencarian alamat dibatalkan.");
      error.name = "AbortError";
      throw error;
    }
    lastAddressLookupAt = Date.now();
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Pencarian alamat merespons HTTP ${response.status}`);
    return response.json();
  } finally {
    release();
  }
}

function formatAddress(feature) {
  const place = feature?.properties || {};
  const street = [place.housenumber, place.street].filter(Boolean).join(" ");
  return [...new Set([
    place.name,
    street,
    place.district,
    place.suburb,
    place.city || place.town || place.village,
    place.state,
    place.country
  ].filter(Boolean))].join(", ");
}

export async function render(container, { user }) {
  const customer = user || {};
  const needsContactDetails = !customer.name?.trim() || !customer.phone?.trim();
  container.innerHTML = `<section class="ojek-heading"><a href="#/customer" class="muted">‹ Beranda</a><span class="badge badge-success">🏍️ Ojek Online</span><h1>Mau ke mana hari ini?</h1><p>Tentukan tujuan, cek estimasi, lalu pesan driver.</p></section>
    <form id="ojek-form" class="ojek-booking-layout">
      <section class="ojek-booking-card card stack">
        <div class="ojek-route-fields">
          <div class="ojek-route-icon" aria-hidden="true"><span class="ojek-pickup-dot"></span><span class="ojek-route-line"></span><span class="ojek-destination-dot"></span></div>
          <div class="ojek-route-inputs">
            <div class="ojek-pickup-wrap">
              <label class="field ojek-location-field">Lokasi jemput
                <span class="ojek-input-row"><input name="pickupAddress" id="pickup-search" autocomplete="off" placeholder="Cari alamat jemput" aria-autocomplete="list" aria-controls="pickup-suggestions" aria-expanded="false" aria-describedby="pickup-feedback"><button class="btn btn-ghost ojek-location-button" type="button" id="current-location" aria-label="Gunakan lokasi saat ini" title="Gunakan lokasi saat ini">◎</button></span>
              </label>
              <div class="ojek-suggestions hidden" id="pickup-suggestions" role="listbox" aria-label="Saran alamat jemput"></div>
            </div>
            <small id="pickup-feedback" class="ojek-field-help" aria-live="polite">Tekan ◎ untuk memakai lokasi sekarang atau cari alamat.</small>
            <div class="ojek-destination-wrap">
              <label class="field ojek-location-field">Mau diantar ke mana?
                <input name="dropoffAddress" id="dropoff-search" autocomplete="off" placeholder="Cari alamat atau tempat tujuan" aria-autocomplete="list" aria-controls="dropoff-suggestions" aria-expanded="false">
              </label>
              <div class="ojek-suggestions hidden" id="dropoff-suggestions" role="listbox" aria-label="Saran alamat tujuan"></div>
            </div>
            <small class="ojek-field-help">Pilih salah satu saran agar titik tujuan di peta akurat.</small>
          </div>
        </div>
        <details class="ojek-contact-details"${needsContactDetails ? " open" : ""}>
          <summary>👤 Penumpang: ${escapeHTML(customer.name || "Lengkapi nama")} · ${escapeHTML(customer.phone || "Lengkapi nomor ponsel")}</summary>
          <div class="ojek-contact-fields">
            <label class="field">Nama penumpang<input name="passengerName" autocomplete="name" value="${escapeHTML(customer.name || "")}" placeholder="Nama yang dapat dihubungi"></label>
            <label class="field">Nomor ponsel<input name="passengerPhone" type="tel" autocomplete="tel" value="${escapeHTML(customer.phone || "")}" placeholder="+628xxxxxxxxxx"></label>
          </div>
        </details>
        <div class="ojek-order-summary" id="ojek-summary" aria-live="polite">
          <div class="ojek-service-meta"><span>👤 1 penumpang</span><span>💵 Tunai ke driver</span></div>
          <div class="split"><span>Estimasi tarif</span><strong id="ojek-total">Menunggu tujuan</strong></div>
          <small class="muted">Tarif estimasi. Harga akhir dikonfirmasi bersama driver.</small>
        </div>
        <button class="btn btn-primary ojek-submit-button" type="submit" disabled>${user ? "Pesan Ojek" : "Masuk untuk memesan"}</button>
      </section>
      <section class="ojek-map-card" aria-label="Peta perjalanan">
        <div id="ojek-map" class="map-panel" aria-label="Peta titik jemput dan tujuan"></div>
        <div class="ojek-map-footer"><span class="ojek-map-legend"><i class="ojek-pickup-dot"></i> Jemput <i class="ojek-destination-dot"></i> Tujuan <span>🏍 Aktif</span><span>Abu-abu: lokasi terakhir</span><span>Merah: akun nonaktif</span></span><div class="ojek-map-actions"><button class="btn btn-ghost" type="button" data-map-target="pickup">Pilih jemput</button><button class="btn btn-ghost" type="button" data-map-target="dropoff">Pilih tujuan</button></div></div>
        <p class="ojek-map-help" id="map-help" aria-live="polite">Lokasi dan tujuan akan muncul di peta.</p>
      </section>
    </form>`;

  const form = container.querySelector("#ojek-form");
  const pickupAddress = form.elements.pickupAddress;
  const dropoffAddress = form.elements.dropoffAddress;
  const pickupFeedback = container.querySelector("#pickup-feedback");
  const suggestions = {
    pickup: container.querySelector("#pickup-suggestions"),
    dropoff: container.querySelector("#dropoff-suggestions")
  };
  const addressFields = { pickup: pickupAddress, dropoff: dropoffAddress };
  const total = container.querySelector("#ojek-total");
  const submitButton = container.querySelector(".ojek-submit-button");
  const mapHelp = container.querySelector("#map-help");
  const mapService = new MapService("ojek-map", [3.584, 98.675], 13);
  let driverLocations = [];
  let stopDriverLocations = () => {};
  let pickup = null;
  let dropoff = null;
  let quote = null;
  let quoteRequest = 0;
  let activeMapTarget = "pickup";
  const searchTimers = { pickup: 0, dropoff: 0 };
  let pickupRefreshTimer = 0;
  const searchControllers = { pickup: null, dropoff: null };
  const lookupControllers = { pickup: null, dropoff: null };
  let destroyed = false;

  const updateSubmitButton = () => {
    submitButton.disabled = !quote || !pickup || !dropoff
      || !pickupAddress.value.trim() || !dropoffAddress.value.trim()
      || !form.elements.passengerName.value.trim() || !form.elements.passengerPhone.value.trim();
  };

  const setAddress = (kind, address) => {
    const field = kind === "pickup" ? pickupAddress : dropoffAddress;
    field.value = address;
    field.title = address;
    updateSubmitButton();
  };

  const refreshQuote = async () => {
    const request = ++quoteRequest;
    quote = null;
    updateSubmitButton();
    if (!pickup || !dropoff) {
      total.textContent = "Menunggu tujuan";
      mapService.clearRoute();
      return;
    }
    total.textContent = "Menghitung…";
    try {
      const [route, tariffs] = await Promise.all([
        mapService.calculateRealRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, () => !destroyed && request === quoteRequest),
        OrderService.getTariffs()
      ]);
      if (destroyed || request !== quoteRequest || !route) return;
      const fare = PricingService.calculateDeliveryFare("OJEK", route.distanceKm, tariffs);
      const now = Date.now();
      const activeDrivers = driverLocations.filter(driver => driver.isOnline === true
        && driver.accountStatus !== "SUSPENDED"
        && now - Date.parse(driver.updatedAt || "") >= 0
        && now - Date.parse(driver.updatedAt || "") <= 60_000
        && Number.isFinite(driver.lat) && Number.isFinite(driver.lng));
      const nearestDriver = activeDrivers.sort((a, b) =>
        MapService.calculateHaversineDistance(a.lat, a.lng, pickup.lat, pickup.lng)
        - MapService.calculateHaversineDistance(b.lat, b.lng, pickup.lat, pickup.lng))[0];
      let pickupDistanceKm = 0;
      if (nearestDriver) {
        const pickupRoute = await MapService.calculateRouteDistance(nearestDriver.lat, nearestDriver.lng, pickup.lat, pickup.lng);
        if (destroyed || request !== quoteRequest) return;
        pickupDistanceKm = pickupRoute.distanceKm;
      }
      const pickupSurcharge = PricingService.calculatePickupSurcharge(pickupDistanceKm, tariffs);
      quote = {
        distanceKm: route.distanceKm,
        baseDeliveryFare: fare,
        deliveryFare: fare + pickupSurcharge,
        platformFee: tariffs.platformFee,
        driverCommissionPct: tariffs.driverCommissionPct,
        merchantCommissionPct: tariffs.merchantCommissionPct,
        pickupDistanceKm,
        pickupSurcharge
      };
      total.textContent = money(fare + tariffs.platformFee + pickupSurcharge);
      total.title = `${route.distanceKm} km · sekitar ${route.durationMinutes} menit`;
      container.querySelector("#ojek-summary small").textContent =
        `${route.distanceKm} km · ±${route.durationMinutes} menit · ongkir ${money(fare)} + layanan ${money(tariffs.platformFee)}${pickupSurcharge ? ` + jemput ${pickupDistanceKm} km: ${money(pickupSurcharge)}` : nearestDriver ? ` · jemput ${pickupDistanceKm} km (tanpa biaya tambahan)` : " · biaya jemput dihitung saat driver tersedia"}. Tarif estimasi; harga akhir dikonfirmasi bersama driver.`;
      updateSubmitButton();
    } catch (error) {
      if (destroyed || request !== quoteRequest) return;
      total.textContent = "Estimasi belum tersedia";
      console.error("Estimasi tarif Ojek gagal dihitung.", error);
      showToast("Estimasi tarif belum tersedia. Periksa titik jemput dan tujuan lalu coba lagi.", "error");
    }
  };
  stopDriverLocations = user?.uid ? await OrderService.subscribeDriverLocations(locations => {
    driverLocations = locations;
    mapService.setDriverLocations(locations);
    if (pickup && dropoff) {
      window.clearTimeout(pickupRefreshTimer);
      pickupRefreshTimer = window.setTimeout(refreshQuote, 500);
    }
  }, error => console.error("Lokasi driver tidak dapat dimuat.", error)) : () => {};

  const reverseGeocode = async (kind, point) => {
    lookupControllers[kind]?.abort();
    const controller = new AbortController();
    lookupControllers[kind] = controller;
    const field = kind === "pickup" ? pickupAddress : dropoffAddress;
    const fallback = kind === "pickup" ? "Titik jemput sesuai pin peta" : "Tujuan sesuai pin peta";
    setAddress(kind, fallback);
    try {
      const params = new URLSearchParams({
        lang: "default",
        lat: String(point.lat),
        lon: String(point.lng)
      });
      const result = await lookupAddress(`${PHOTON_URL}/reverse?${params}`, controller.signal);
      if (destroyed || controller.signal.aborted) return;
      const address = formatAddress(result.features?.[0]);
      if (address) setAddress(kind, address);
      if (kind === "pickup") pickupFeedback.textContent = "Lokasi jemput sudah diatur. Tekan untuk memperbarui.";
    } catch (error) {
      if (error.name !== "AbortError" && !destroyed) {
        if (kind === "pickup") pickupFeedback.textContent = "Alamat tidak ditemukan; driver akan mengacu pada pin peta.";
      }
    }
  };

  const setPoint = (kind, point, address) => {
    const value = { lat: Number(point.lat), lng: Number(point.lng) };
    window.clearTimeout(searchTimers[kind]);
    searchControllers[kind]?.abort();
    lookupControllers[kind]?.abort();
    lookupControllers[kind]?.abort();
    suggestions[kind].classList.add("hidden");
    addressFields[kind].setAttribute("aria-expanded", "false");
    if (kind === "pickup") {
      pickup = value;
      mapService.setPickupLocation(value.lat, value.lng, "Jemput Ojek");
      mapService.centerOn(value.lat, value.lng);
    } else {
      dropoff = value;
      mapService.setDropoffLocation(value.lat, value.lng, "Tujuan");
    }
    if (address) setAddress(kind, address);
    else reverseGeocode(kind, value);
    if (kind === "pickup") pickupFeedback.textContent = "Lokasi jemput sudah diatur. Tekan ◎ untuk memperbarui.";
    mapHelp.textContent = kind === "pickup"
      ? "Titik jemput siap. Cari tujuan atau sesuaikan pin pada peta."
      : "Titik tujuan siap. Geser pin untuk menyesuaikan lokasi.";
    refreshQuote();
  };

  mapService.setLocationHandler((point, kind) => {
    const target = kind || activeMapTarget;
    setPoint(target, point);
  });

  container.querySelector("#current-location").addEventListener("click", event => {
    const button = event.currentTarget;
    if (!navigator.geolocation) {
      pickupFeedback.textContent = "Browser tidak mendukung lokasi otomatis. Pilih lokasi jemput di peta.";
      return;
    }
    button.disabled = true;
    pickupFeedback.textContent = "Mengambil lokasi saat ini…";
    navigator.geolocation.getCurrentPosition(position => {
      button.disabled = false;
      if (destroyed) return;
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      activeMapTarget = "pickup";
      setPoint("pickup", point);
    }, error => {
      button.disabled = false;
      if (destroyed) return;
      pickupFeedback.textContent = error.code === error.PERMISSION_DENIED
        ? "Izin lokasi ditolak. Pilih titik jemput pada peta."
        : "Lokasi tidak tersedia. Coba lagi atau pilih titik jemput pada peta.";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });

  const enableAddressSearch = kind => {
    const field = addressFields[kind];
    const resultList = suggestions[kind];
    field.addEventListener("input", () => {
      window.clearTimeout(searchTimers[kind]);
      searchControllers[kind]?.abort();
      if (kind === "pickup") {
        pickup = null;
        mapService.clearPickupLocation();
      } else {
        dropoff = null;
        mapService.clearDropoffLocation();
      }
      quoteRequest++;
      quote = null;
      updateSubmitButton();
      total.textContent = "Menunggu tujuan";
      const query = field.value.trim();
      if (query.length < 3) {
        resultList.innerHTML = "";
        resultList.classList.add("hidden");
        field.setAttribute("aria-expanded", "false");
        return;
      }
      resultList.innerHTML = `<div class="ojek-suggestion-message">Mencari alamat…</div>`;
      resultList.classList.remove("hidden");
      field.setAttribute("aria-expanded", "true");
      const search = async () => {
        if (destroyed || field.value.trim() !== query) return;
        const controller = new AbortController();
        searchControllers[kind] = controller;
        const params = new URLSearchParams({ q: query, limit: "5", lang: "default" });
        try {
          const response = await lookupAddress(`${PHOTON_URL}/api/?${params}`, controller.signal);
          if (destroyed || controller.signal.aborted || field.value.trim() !== query) return;
          const results = response.features || [];
          if (!results.length) {
            resultList.innerHTML = `<div class="ojek-suggestion-message">Alamat tidak ditemukan. Coba nama jalan atau tempat terdekat.</div>`;
            return;
          }
          resultList.innerHTML = results.map((result, index) => `<button class="ojek-suggestion" type="button" role="option" data-result="${index}"><span aria-hidden="true">⌖</span><span>${escapeHTML(formatAddress(result) || query)}</span></button>`).join("");
          resultList.querySelectorAll("[data-result]").forEach(button => button.addEventListener("click", () => {
            const result = results[Number(button.dataset.result)];
            activeMapTarget = kind;
            const [lng, lat] = result.geometry.coordinates;
            setPoint(kind, { lat: Number(lat), lng: Number(lng) }, formatAddress(result) || query);
            field.blur();
          }));
        } catch (error) {
          if (error.name !== "AbortError" && !destroyed) {
            resultList.innerHTML = `<div class="ojek-suggestion-message">Pencarian alamat gagal. Coba lagi sebentar.</div>`;
          }
        }
      };
      searchTimers[kind] = window.setTimeout(search, 700);
    });
    field.addEventListener("focus", () => {
      if (resultList.childElementCount) {
        resultList.classList.remove("hidden");
        field.setAttribute("aria-expanded", "true");
      }
    });
  };
  enableAddressSearch("pickup");
  enableAddressSearch("dropoff");
  container.querySelectorAll("[data-map-target]").forEach(button => button.addEventListener("click", event => {
    activeMapTarget = event.currentTarget.dataset.mapTarget;
    mapHelp.textContent = activeMapTarget === "pickup"
      ? "Ketuk peta untuk memilih titik jemput."
      : "Ketuk peta untuk memilih titik tujuan.";
  }));
  form.elements.passengerName.addEventListener("input", updateSubmitButton);
  form.elements.passengerPhone.addEventListener("input", updateSubmitButton);
  container.addEventListener("click", event => {
    if (event.target.closest(".ojek-location-field")) return;
    for (const kind of ["pickup", "dropoff"]) {
      if (!event.target.closest(kind === "pickup" ? ".ojek-pickup-wrap" : ".ojek-destination-wrap")) {
        suggestions[kind].classList.add("hidden");
        addressFields[kind].setAttribute("aria-expanded", "false");
      }
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitButton.disabled) return;
    if (!user) {
      sessionStorage.setItem("sjek.afterLoginPath", "/customer/ojek");
      showToast("Masuk terlebih dahulu untuk mengirim pesanan.");
      navigate("/auth");
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = "Mengirim pesanan…";
    try {
      const values = new FormData(form);
      const order = await OrderService.createOrder({
        serviceType: "OJEK",
        customerId: user.uid,
        pickup: { ...pickup, address: String(values.get("pickupAddress")).trim(), contactName: String(values.get("passengerName")).trim(), phone: String(values.get("passengerPhone")).trim() },
        dropoff: { ...dropoff, address: String(values.get("dropoffAddress")).trim(), contactName: String(values.get("passengerName")).trim(), phone: String(values.get("passengerPhone")).trim() },
        passenger: { name: values.get("passengerName"), phone: values.get("passengerPhone"), count: 1 },
        pricingBreakdown: quote,
        payment: { method: "COD", status: "UNPAID" }
      });
      showToast(`Permintaan Ojek ${order.id} dikirim. Menunggu driver.`);
      navigate("/customer/tracking");
    } catch (error) {
      console.error("Permintaan Ojek gagal dikirim.", error);
      showToast("Permintaan Ojek belum dapat dikirim. Silakan coba lagi.", "error");
      submitButton.disabled = false;
      submitButton.textContent = "Pesan Ojek";
    }
  });

  registerRouteCleanup(() => {
    destroyed = true;
    stopDriverLocations();
    window.clearTimeout(pickupRefreshTimer);
    Object.values(searchTimers).forEach(timer => window.clearTimeout(timer));
    Object.values(searchControllers).forEach(controller => controller?.abort());
    Object.values(lookupControllers).forEach(controller => controller?.abort());
    mapService.destroy();
  });
}
