import { escapeHTML, showToast } from "../../app.js";
import { BannerService } from "../../services/bannerService.js";
import { MediaService } from "../../services/mediaService.js";

export async function render(container, { user }) {
  const banners = await BannerService.listAll();
  container.innerHTML = `<section class="page-heading"><a href="#/admin" class="muted">‹ Dashboard</a><h1>Banner Beranda</h1><p>Atur promosi yang tampil di beranda pelanggan.</p></section>
    <form id="banner-form" class="card stack"><h2 id="banner-form-title">Tambah banner</h2><input name="id" type="hidden"><input name="imageUrl" type="hidden">
      <div class="form-grid"><label class="field">Judul banner<input name="title" maxlength="80" required></label><label class="field">Tombol ajakan<input name="ctaLabel" value="Jelajahi" maxlength="28" required></label>
      <label class="field" style="grid-column:1/-1">Keterangan<textarea name="subtitle" maxlength="180"></textarea></label>
      <label class="field">Tautan tujuan<select name="ctaPath"><option value="/customer/ojek">Ojek Online</option><option value="/customer/sfood">SFood</option><option value="/customer/ssend">SSend</option></select></label>
      <label class="field">Urutan tampil<input name="order" type="number" min="0" max="99" step="1" value="0" required></label>
      <label class="field">Foto banner<input name="imageFile" type="file" accept="image/*"></label>
      <label class="field">Status<select name="isActive"><option value="true">Tampilkan</option><option value="false">Sembunyikan</option></select></label></div>
      <img id="banner-preview" class="banner-admin-preview hidden" alt="Pratinjau banner"><small id="banner-upload-status" class="muted" aria-live="polite">Pilih foto banner.</small>
      <div class="row"><button class="btn btn-primary" type="submit">Simpan banner</button><button class="btn btn-ghost" type="reset">Bersihkan</button></div>
    </form>
    <section class="stack customer-section"><h2>Banner terdaftar</h2>${banners.length ? `<div class="grid grid-2">${banners.map(banner => `<article class="card stack"><img class="banner-admin-preview" src="${escapeHTML(banner.imageUrl)}" alt=""><div class="split"><strong>${escapeHTML(banner.title)}</strong><span class="badge ${banner.isActive ? "badge-success" : "badge-danger"}">${banner.isActive ? "Tampil" : "Tersembunyi"}</span></div><p class="muted">Urutan ${banner.order} · ${escapeHTML(banner.ctaLabel)}</p><div class="row"><button class="btn btn-secondary" data-edit-banner="${escapeHTML(banner.id)}">Ubah</button><button class="btn btn-danger" data-delete-banner="${escapeHTML(banner.id)}">Hapus</button></div></article>`).join("")}</div>` : `<div class="empty-state">Belum ada banner. Tambahkan banner untuk mengisi area promosi di beranda.</div>`}</section>`;
  const form = container.querySelector("#banner-form");
  const fileInput = form.elements.imageFile;
  const imageUrl = form.elements.imageUrl;
  const preview = container.querySelector("#banner-preview");
  const status = container.querySelector("#banner-upload-status");
  const saveButton = form.querySelector('[type="submit"]');
  let uploadPromise = Promise.resolve();
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    const savedImageUrl = imageUrl.value;
    imageUrl.value = "";
    fileInput.setCustomValidity("");
    if (!file) {
      status.textContent = "Pilih foto banner.";
      saveButton.disabled = !form.elements.id.value;
      return;
    }
    fileInput.disabled = true;
    saveButton.disabled = true;
    status.textContent = "Memproses foto…";
    uploadPromise = (async () => {
      try {
        const uploaded = await MediaService.uploadPublicImage(file, "sjek/banners");
        imageUrl.value = uploaded.url;
        preview.src = uploaded.url;
        preview.classList.remove("hidden");
        status.textContent = "Foto siap digunakan.";
        fileInput.setCustomValidity("");
      } catch (error) {
        console.error("Foto banner gagal diproses.", error);
        imageUrl.value = savedImageUrl;
        fileInput.setCustomValidity("Foto belum dapat diproses. Silakan coba lagi.");
        status.textContent = "Foto belum dapat diproses. Silakan coba lagi.";
      } finally {
        fileInput.disabled = false;
        saveButton.disabled = false;
      }
    })();
  });
  form.addEventListener("reset", () => window.setTimeout(() => {
    imageUrl.value = "";
    preview.removeAttribute("src");
    preview.classList.add("hidden");
    status.textContent = "Pilih foto banner.";
    fileInput.required = true;
    fileInput.setCustomValidity("");
    saveButton.disabled = false;
    container.querySelector("#banner-form-title").textContent = "Tambah banner";
  }));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    await uploadPromise;
    if (!form.reportValidity()) return;
    if (!imageUrl.value) {
      showToast("Pilih foto banner sebelum menyimpan.", "error");
      return;
    }
    saveButton.disabled = true;
    const data = new FormData(form);
    try {
      await BannerService.save({
        title: data.get("title"), subtitle: data.get("subtitle"), imageUrl: data.get("imageUrl"),
        ctaLabel: data.get("ctaLabel"), ctaPath: data.get("ctaPath"),
        isActive: data.get("isActive") === "true", order: Number(data.get("order"))
      }, String(data.get("id") || ""));
      showToast("Banner berhasil disimpan.");
      render(container, { user });
    } catch (error) {
      console.error("Banner gagal disimpan.", error);
      showToast("Banner belum dapat disimpan. Periksa data dan coba lagi.", "error");
      saveButton.disabled = false;
    }
  });
  container.querySelectorAll("[data-edit-banner]").forEach(button => button.addEventListener("click", () => {
    const banner = banners.find(item => item.id === button.dataset.editBanner);
    if (!banner) return;
    for (const [key, value] of Object.entries({
      id: banner.id, title: banner.title, subtitle: banner.subtitle, imageUrl: banner.imageUrl,
      ctaLabel: banner.ctaLabel, ctaPath: banner.ctaPath, order: banner.order,
      isActive: String(banner.isActive)
    })) form.elements[key].value = value ?? "";
    fileInput.required = false;
    preview.src = banner.imageUrl;
    preview.classList.remove("hidden");
    status.textContent = "Foto saat ini siap digunakan. Pilih foto baru untuk menggantinya.";
    container.querySelector("#banner-form-title").textContent = `Ubah ${banner.title}`;
    saveButton.disabled = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  container.querySelectorAll("[data-delete-banner]").forEach(button => button.addEventListener("click", async () => {
    if (!window.confirm("Hapus banner ini dari beranda?")) return;
    try {
      await BannerService.remove(button.dataset.deleteBanner);
      showToast("Banner dihapus.");
      render(container, { user });
    } catch (error) {
      console.error("Banner gagal dihapus.", error);
      showToast("Banner belum dapat dihapus. Silakan coba lagi.", "error");
    }
  }));
}
