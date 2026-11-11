import { AuthService } from "./services/authService.js";
import { PartnerService } from "./services/partnerService.js";
import { initializeFirebase } from "./config/firebase-config.js";
import { NotificationService } from "./services/notificationService.js";

const viewport = document.getElementById("app-viewport");
const signInLink = document.getElementById("signin-link");
const signOutButton = document.getElementById("signout-button");
const accountLabel = document.getElementById("account-label");
const portalLinks = document.getElementById("portal-links");
const permissionsButton = document.getElementById("permissions-button");
let renderGeneration = 0;
let ruleNoticeUnsubscribe = null;
let ruleNoticeUid = "";
let routeCleanup = null;

export const money = value => `Rp ${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;

export function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toast.dataset.type = type;
  container.append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

export function showModal(content) {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `<section class="modal-card">${content}<div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn btn-ghost" data-modal-close>Tutup</button></div></section>`;
  modal.classList.remove("hidden");
  modal.querySelector("[data-modal-close]").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", event => {
    if (event.target === modal) modal.classList.add("hidden");
  }, { once: true });
}

export function registerRouteCleanup(cleanup) {
  routeCleanup?.();
  routeCleanup = cleanup;
}

export function navigate(path) {
  location.hash = path.startsWith("#") ? path : `#${path}`;
}

function showDevicePermissions() {
  showModal(`<section class="stack"><h2>Pengaturan perangkat</h2><p class="muted">Pilih fitur yang ingin Anda aktifkan. Izin hanya diminta setelah Anda menekan tombol.</p>
    <div class="split"><span>Lokasi untuk perjalanan</span><button class="btn btn-secondary" data-permission="location">Izinkan lokasi</button></div>
    <div class="split"><span>Kamera untuk foto ulasan</span><button class="btn btn-secondary" data-permission="camera">Izinkan kamera</button></div>
    <div class="split"><span>Notifikasi pesanan</span><button class="btn btn-secondary" data-permission="push">Aktifkan notifikasi</button></div>
    <div class="split"><span>Suara pemberitahuan</span><button class="btn btn-secondary" data-permission="sound">Aktifkan suara</button></div>
  </section>`);
  const modal = document.getElementById("modal-container");
  modal.querySelectorAll("[data-permission]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      switch (button.dataset.permission) {
        case "location":
          await new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error("Lokasi tidak didukung browser ini."));
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
          });
          showToast("Izin lokasi berhasil diaktifkan.");
          break;
        case "camera": {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error("Kamera tidak didukung browser ini.");
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          stream.getTracks().forEach(track => track.stop());
          showToast("Izin kamera berhasil diaktifkan.");
          break;
        }
        case "push":
          await NotificationService.enablePush();
          showToast("Notifikasi pesanan berhasil diaktifkan.");
          break;
        case "sound":
          localStorage.setItem("sjek.soundEnabled", "true");
          NotificationService.playEventSound("order-accepted");
          showToast("Suara pemberitahuan berhasil diaktifkan.");
          break;
        default:
          break;
      }
    } catch (error) {
      console.error("Izin perangkat tidak berhasil diaktifkan.", error);
      showToast("Izin belum dapat diaktifkan. Periksa pengaturan browser dan coba lagi.", "error");
    } finally {
      button.disabled = false;
    }
  }));
}

const routes = {
  "/": () => import("./views/customer/customerHomeView.js"),
  "/auth": () => import("./views/authView.js"),
  "/customer": () => import("./views/customer/customerHomeView.js"),
  "/customer/ojek": () => import("./views/customer/ojekView.js"),
  "/customer/sfood": () => import("./views/customer/sfoodView.js"),
  "/customer/ssend": () => import("./views/customer/ssendView.js"),
  "/customer/tracking": () => import("./views/customer/orderTrackingView.js"),
  "/customer/rewards": () => import("./views/customer/coinRewardsView.js"),
  "/partner/driver": () => import("./views/partnerApplicationView.js"),
  "/partner/merchant": () => import("./views/partnerApplicationView.js"),
  "/driver": () => import("./views/driver/driverOrdersView.js"),
  "/driver/orders": () => import("./views/driver/driverOrdersView.js"),
  "/driver/finance": () => import("./views/driver/driverFinanceView.js"),
  "/merchant": () => import("./views/merchant/merchantOrdersView.js"),
  "/merchant/orders": () => import("./views/merchant/merchantOrdersView.js"),
  "/merchant/menu": () => import("./views/merchant/menuManagementView.js"),
  "/merchant/finance": () => import("./views/merchant/merchantFinanceView.js"),
  "/admin": () => import("./views/admin/adminDashboardView.js"),
  "/admin/tariffs": () => import("./views/admin/tariffManagementView.js"),
  "/admin/vouchers": () => import("./views/admin/voucherManagementView.js"),
  "/admin/coins": () => import("./views/admin/coinManagementView.js"),
  "/admin/banners": () => import("./views/admin/bannerManagementView.js"),
  "/admin/review-appeals": () => import("./views/admin/reviewAppealsView.js"),
  "/admin/finance": () => import("./views/admin/ownerFinanceView.js"),
  "/admin/driver-settlements": () => import("./views/admin/driverSettlementView.js")
};

function updateHeader(user) {
  const signedIn = Boolean(user);
  signInLink.classList.toggle("hidden", signedIn);
  signOutButton.classList.toggle("hidden", !signedIn);
  accountLabel.textContent = user ? user.name : "";
  accountLabel.title = user ? `${user.name} · ${user.email}` : "";
  portalLinks.innerHTML = user ? [
    `<a href="#/customer">Beranda</a>`,
    `<a href="#/customer/rewards">Koin</a>`,
    ...(user.partnerRoles?.includes("driver") && user.driverAccountStatus !== "SUSPENDED" ? [`<a href="#/driver/orders">Kurir</a>`] : []),
    ...(user.partnerRoles?.includes("merchant") && user.merchantAccountStatus !== "SUSPENDED" ? [`<a href="#/merchant/orders">Food</a>`] : []),
    ...(user.role === "admin" || user.role === "superadmin" ? [`<a href="#/admin">Admin</a>`] : [])
  ].join("") : "";
}

function hasPortalAccess(path, user) {
  if (path === "/auth") return true;
  if (!user) return ["/", "/customer", "/customer/ojek", "/customer/sfood", "/customer/ssend"].includes(path);
  if (path.startsWith("/driver")) return user.partnerRoles?.includes("driver") === true;
  if (path.startsWith("/merchant")) return user.partnerRoles?.includes("merchant") === true && user.merchantAccountStatus !== "SUSPENDED";
  if (path.startsWith("/admin")) return ["admin", "superadmin"].includes(user.role);
  return true;
}

async function renderPartnerRuleNotices(user) {
  if (!user?.partnerRoles?.length) return;
  const changes = await PartnerService.listBusinessRuleChanges();
  if (!changes.length) return;
  const section = document.createElement("section");
  section.className = "card rule-notice";
  section.innerHTML = `<div class="split"><strong>🔔 Pemberitahuan aturan bisnis</strong><span class="badge">${changes.length} perubahan</span></div><ul>${changes.slice(0, 5).map(change => `<li><strong>${escapeHTML(change.title || "Aturan bisnis diperbarui")}</strong><br><span class="muted">${escapeHTML(change.details || "")} · ${new Date(change.createdAt).toLocaleString("id-ID")}</span></li>`).join("")}</ul>`;
  viewport.append(section);
}

async function watchPartnerRuleNotices(user) {
  const nextUid = user?.partnerRoles?.length ? user.uid : "";
  if (nextUid === ruleNoticeUid) return;
  ruleNoticeUnsubscribe?.();
  ruleNoticeUnsubscribe = null;
  ruleNoticeUid = nextUid;
  if (!nextUid) return;
  ruleNoticeUnsubscribe = await PartnerService.watchBusinessRuleChanges(change => {
    if (!change) return;
    const key = `sjek.lastBusinessRuleChange.${nextUid}`;
    const previous = localStorage.getItem(key);
    localStorage.setItem(key, change.id);
    if (previous && previous !== change.id) {
      showToast(`Aturan bisnis SJek berubah: ${change.title}`);
      renderRoute();
    }
  });
}

async function renderRoute() {
  routeCleanup?.();
  routeCleanup = null;
  const generation = ++renderGeneration;
  const path = location.hash.slice(1).split("?")[0] || "/";
  const user = AuthService.getCurrentUser();
  updateHeader(user);
  if (!user && [
    "/customer/ojek", "/customer/tracking", "/customer/rewards"
  ].includes(path)) {
    sessionStorage.setItem("sjek.afterLoginPath", path);
    location.hash = "#/auth";
    return;
  }
  if (!user && !hasPortalAccess(path, user)) {
    location.hash = "#/auth";
    return;
  }
  if (!hasPortalAccess(path, user)) {
    const suggested = path.startsWith("/driver")
      ? `<a class="btn btn-primary" href="#/partner/driver">Ajukan sebagai mitra kurir</a>`
      : path.startsWith("/merchant")
        ? `<a class="btn btn-primary" href="#/partner/merchant">Ajukan sebagai mitra food</a>`
        : "";
    viewport.innerHTML = `<section class="card stack"><h1>Portal tidak tersedia</h1><p>Akun ini tidak memiliki akses ke portal tersebut. Akun pelanggan tetap dapat memakai layanan reguler SJek.</p><div class="row"><a class="btn btn-secondary" href="#/customer">Kembali ke beranda</a>${suggested}</div></section>`;
    return;
  }
  const loader = routes[path] || routes["/customer"];
  try {
    const module = await loader();
    if (generation !== renderGeneration) return;
    await module.render(viewport, { user, path });
    if (generation !== renderGeneration) return;
    await renderPartnerRuleNotices(user);
    viewport.focus({ preventScroll: true });
  } catch (error) {
    console.error("Halaman SJek gagal dimuat.", error);
    viewport.innerHTML = `<section class="card"><h1>Halaman belum dapat dimuat</h1><p>Silakan coba lagi beberapa saat.</p><a class="btn btn-primary" href="#/customer">Kembali</a></section>`;
  }
}

signOutButton.addEventListener("click", async () => {
  let tokenRemovalFailed = false;
  try {
    try {
      await NotificationService.removePushToken();
    } catch (error) {
      tokenRemovalFailed = true;
      console.error("Token notifikasi tidak berhasil dihapus saat keluar.", error);
    }
    await AuthService.signOut();
    updateHeader(null);
    navigate("/");
    if (tokenRemovalFailed) showToast("Anda sudah keluar, tetapi notifikasi pada perangkat ini mungkin perlu dinonaktifkan di pengaturan browser.", "error");
  } catch (error) {
    showToast(`Keluar gagal: ${error.message}`, "error");
  }
});

permissionsButton.addEventListener("click", showDevicePermissions);
if (window.Capacitor?.isNativePlatform?.()) {
  NotificationService.initializeNativePushListeners().catch(error => {
    console.error("Listener notifikasi native gagal disiapkan.", error);
  });
}
window.addEventListener("sjek:push-notification", event => {
  const { eventType, title, body, url, orderId } = event.detail || {};
  if (!NotificationService.shouldDisplayEvent(eventType, orderId)) return;
  showToast(`${title}${body ? ` — ${body}` : ""}`);
  NotificationService.playEventSound(eventType, orderId);
  if (!window.Capacitor?.isNativePlatform?.() && "Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(title || "SJek", { body: body || "", icon: "./assets/img/sjek-mark.png" });
    notification.onclick = () => {
      window.focus();
      navigate(url || "/");
      notification.close();
    };
  }
});
window.addEventListener("hashchange", renderRoute);
window.addEventListener("sjek:profile-changed", () => {
  const user = AuthService.getCurrentUser();
  watchPartnerRuleNotices(user);
  renderRoute();
});
window.addEventListener("sjek:data-changed", () => {
  if (document.visibilityState === "visible") renderRoute();
});

initializeFirebase().then(async () => {
  const user = await AuthService.hydrateSession();
  updateHeader(user);
  if (user) {
    NotificationService.restoreNativePush(user.uid).catch(error => {
      console.error("Pendaftaran ulang notifikasi native gagal.", error);
    });
  }
  await watchPartnerRuleNotices(user);
  await renderRoute();
}).catch(error => {
  console.error("Inisialisasi SJek gagal.", error);
  viewport.innerHTML = `<section class="card"><h1>SJek belum dapat dibuka</h1><p>Periksa koneksi internet lalu coba lagi.</p></section>`;
});
