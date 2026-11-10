import { showToast } from "../app.js";
import { AuthService } from "../services/authService.js";

export async function render(container) {
  container.innerHTML = `<section class="auth-layout">
    <aside class="auth-promo"><span class="badge badge-light">SJek · Ojek + SFood + SSend</span><h1>Semua kebutuhan harian, satu aplikasi.</h1><p>Pesan ojek, makanan, dan kirim barang dengan mudah, transparan, dan aman.</p><div class="auth-promo-points"><span>✓ Harga transparan</span><span>✓ Mitra lokal</span><span>✓ Lacak pesanan</span></div></aside>
    <section class="auth-card card">
      <div class="tabs" role="tablist"><button class="tab active" data-mode="signin" role="tab">Masuk</button><button class="tab" data-mode="signup" role="tab">Daftar akun</button></div>
      <section id="google-step" class="stack">
        <h2 id="auth-title">Selamat datang kembali</h2>
        <p class="muted" id="auth-help">Langkah 1: masuk menggunakan akun Google. Setelah itu, konfirmasi nomor ponsel Anda.</p>
        <button class="btn btn-primary" type="button" id="google-signin">Lanjutkan dengan Google</button>
      </section>
      <form id="phone-form" class="stack hidden">
        <h2>Langkah 2: konfirmasi nomor ponsel</h2>
        <p class="muted">Akun Google: <strong id="google-account"></strong></p>
        <p class="muted">Masukkan nomor ponsel aktif yang dapat dihubungi.</p>
        <label class="field">Nomor ponsel<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="08123456789" required></label>
        <label class="agreement-check"><input name="confirmPhone" type="checkbox" required> Saya memastikan nomor ponsel ini benar dan aktif.</label>
        <button class="btn btn-primary" type="submit">Konfirmasi nomor dan lanjutkan</button>
      </form>
      <p class="auth-terms muted">Dengan menggunakan SJek, Anda menyetujui Ketentuan Penggunaan dan Kebijakan Privasi SJek.</p>
    </section>
  </section>`;

  const googleStep = container.querySelector("#google-step");
  const phoneForm = container.querySelector("#phone-form");
  const googleButton = container.querySelector("#google-signin");
  const showPhoneStep = email => {
    googleStep.classList.add("hidden");
    phoneForm.classList.remove("hidden");
    container.querySelector("#google-account").textContent = email;
  };
  const routeForUser = user => {
    const next = sessionStorage.getItem("sjek.afterLoginPath");
    sessionStorage.removeItem("sjek.afterLoginPath");
    location.hash = next || (user.role === "admin" || user.role === "superadmin" ? "#/admin" : "#/customer");
  };
  const setMode = mode => {
    container.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
    container.querySelector("#auth-title").textContent = mode === "signup" ? "Buat akun SJek" : "Selamat datang kembali";
    container.querySelector("#auth-help").textContent = mode === "signup"
      ? "Langkah 1: daftarkan akun menggunakan Google. Setelah itu, konfirmasi nomor ponsel Anda."
      : "Langkah 1: masuk menggunakan akun Google. Setelah itu, konfirmasi nomor ponsel Anda.";
  };
  container.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));

  googleButton.addEventListener("click", async () => {
    googleButton.disabled = true;
    try {
      const result = await AuthService.signInWithGoogle();
      if (result.needsPhone) {
        const state = await AuthService.getPhoneSetupState();
        showPhoneStep(state?.email || "");
      } else {
        routeForUser(result.profile);
      }
    } catch (error) {
      console.error("Masuk dengan Google gagal.", error);
      showToast("Tidak dapat masuk. Pastikan Anda menggunakan akun Gmail lalu coba lagi.", "error");
    } finally {
      googleButton.disabled = false;
    }
  });

  phoneForm.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(phoneForm);
    if (data.get("confirmPhone") !== "on") return showToast("Konfirmasi nomor ponsel terlebih dahulu.", "error");
    const submitButton = phoneForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const user = await AuthService.completePhoneSetup(data.get("phone"));
      routeForUser(user);
    } catch (error) {
      console.error("Penyimpanan nomor ponsel gagal.", error);
      showToast("Nomor ponsel belum dapat disimpan. Periksa kembali nomor dan coba lagi.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  try {
    const state = await AuthService.getPhoneSetupState();
    if (state) showPhoneStep(state.email);
  } catch (error) {
    console.error("Tahap konfirmasi nomor SJek gagal dimuat.", error);
  }
}
