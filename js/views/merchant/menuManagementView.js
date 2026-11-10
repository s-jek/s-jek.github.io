import { escapeHTML, money, showToast } from "../../app.js";
import { MerchantService } from "../../services/merchantService.js";
import { MediaService } from "../../services/mediaService.js";

const isCompressedCloudinaryImage = url => /^https:\/\/res\.cloudinary\.com\/ks6vgjfn\/image\/upload\/.+\.webp$/i.test(url || "");

export async function render(container, { user }) {
  const merchantId = user.partnerMerchantId;
  if (!merchantId) throw new Error("Profil mitra food belum memiliki toko aktif.");
  const merchant = await MerchantService.getMerchant(merchantId);
  const menu = await MerchantService.listMenu(merchantId);
  container.innerHTML = `  <section class="page-heading"><a href="#/merchant/orders" class="muted">‹ Pesanan toko</a><div class="split"><div><h1>Manajemen Menu</h1><p>${escapeHTML(merchant.name)} · Tambah hidangan, atur varian, dan ketersediaan.</p></div><button id="merchant-open-toggle" class="btn ${merchant.isOpen ? "btn-danger" : "btn-primary"}">${merchant.isOpen ? "Tutup toko" : "Buka toko"}</button></div></section>
    <form id="menu-form" class="card stack"><h2 id="form-title">Tambah hidangan</h2><input name="id" type="hidden">
      <div class="form-grid"><label class="field">Nama hidangan<input name="name" required></label><label class="field">Harga (Rp)<input name="price" type="number" min="0" step="500" required></label>
      <label class="field">Kategori<select name="category"><option>Nasi</option><option>Minuman</option><option>Cepat Saji</option><option>Camilan</option></select></label>
      <label class="field">Foto hidangan<input name="imageFile" type="file" accept="image/*"></label>
      <input name="imageUrl" type="hidden">
      <img id="image-preview" class="menu-image-preview hidden" alt="Pratinjau foto hidangan">
      <small id="image-upload-status" class="muted" aria-live="polite">Pilih foto hidangan.</small>
      <label class="field" style="grid-column:1/-1">Deskripsi<textarea name="description"></textarea></label>
      <label class="field" style="grid-column:1/-1">Opsi varian (pisahkan dengan koma)<input name="variants" placeholder="Pedas 1, Pedas 3, Pedas 5"></label></div>
      <div class="row"><button class="btn btn-primary" type="submit">Simpan hidangan</button><button class="btn btn-ghost" type="reset" id="cancel-edit">Bersihkan</button></div>
    </form>
    <section class="stack" style="margin-top:20px"><h2>Daftar hidangan</h2>${menu.length ? menu.map(item => `<article class="card split"><div><strong>${escapeHTML(item.name)}</strong><p class="muted">${escapeHTML(item.category || "")} · ${money(item.price)} · ${(item.variants || []).map(escapeHTML).join(", ")}</p><span class="badge ${item.isAvailable ? "badge-success" : "badge-danger"}">${item.isAvailable ? "Tersedia" : "Habis"}</span></div><div class="row"><button class="btn btn-secondary" data-edit="${escapeHTML(item.id)}">Edit</button><button class="btn btn-ghost" data-toggle="${escapeHTML(item.id)}">${item.isAvailable ? "Tandai habis" : "Tersedia"}</button><button class="btn btn-danger" data-delete="${escapeHTML(item.id)}">Hapus</button></div></article>`).join("") : `<div class="empty-state">Belum ada hidangan.</div>`}</section>`;
  const form = container.querySelector("#menu-form");
  let imageUploadPromise = Promise.resolve();
  const imageSubmitButton = form.querySelector('button[type="submit"]');
  imageSubmitButton.disabled = true;
  form.elements.imageFile.required = true;
  container.querySelector("#merchant-open-toggle").addEventListener("click", async event => {
    try {
      await MerchantService.setMerchantOpen(merchantId, !merchant.isOpen);
      showToast(merchant.isOpen ? "Toko ditutup untuk sementara." : "Toko sekarang menerima pesanan.");
      event.currentTarget.textContent = merchant.isOpen ? "Buka toko" : "Tutup toko";
      event.currentTarget.className = `btn ${merchant.isOpen ? "btn-primary" : "btn-danger"}`;
      merchant.isOpen = !merchant.isOpen;
    } catch (error) {
      console.error("Perubahan status toko gagal disimpan.", error);
      showToast("Status toko belum dapat diperbarui. Silakan coba lagi.", "error");
    }
  });
  form.elements.imageFile.addEventListener("change", async () => {
    const file = form.elements.imageFile.files?.[0];
    const status = container.querySelector("#image-upload-status");
    form.elements.imageUrl.value = "";
    form.elements.imageFile.setCustomValidity("");
    if (!file) {
      status.textContent = "Pilih foto hidangan.";
      imageSubmitButton.disabled = true;
      return;
    }
    form.elements.imageFile.disabled = true;
    imageSubmitButton.disabled = true;
    status.textContent = "Memproses foto…";
    imageUploadPromise = (async () => {
      try {
        const uploaded = await MediaService.uploadPublicImage(file, `sjek/menu/${merchantId}`);
        form.elements.imageUrl.value = uploaded.url;
        form.elements.imageFile.setCustomValidity("");
        const preview = container.querySelector("#image-preview");
        preview.src = uploaded.url;
        preview.classList.remove("hidden");
        status.textContent = "Foto siap digunakan.";
        showToast("Foto hidangan berhasil ditambahkan.");
      } catch (error) {
        console.error("Foto hidangan gagal diproses.", error);
        form.elements.imageFile.setCustomValidity("Foto belum dapat diproses. Silakan coba lagi.");
        status.textContent = "Foto belum dapat diproses. Silakan pilih foto lain atau coba lagi.";
        showToast("Foto belum dapat diproses. Silakan coba lagi.", "error");
      } finally {
        form.elements.imageFile.disabled = false;
        imageSubmitButton.disabled = false;
      }
    })();
    await imageUploadPromise;
  });
  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      form.elements.id.value = "";
      form.elements.imageUrl.value = "";
      form.elements.imageFile.required = true;
      form.elements.imageFile.setCustomValidity("");
      imageSubmitButton.disabled = true;
      container.querySelector("#image-preview").classList.add("hidden");
      container.querySelector("#image-upload-status").textContent = "Pilih foto hidangan.";
      container.querySelector("#form-title").textContent = "Tambah hidangan";
    });
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await imageUploadPromise;
      const data = new FormData(form);
      if (!data.get("imageUrl")) throw new Error("Pilih foto hidangan sebelum menyimpan.");
      await MerchantService.saveMenuItem(merchantId, {
        id: data.get("id") || undefined, name: data.get("name"), price: Number(data.get("price")),
        category: data.get("category"), imageUrl: data.get("imageUrl"), description: data.get("description"),
        variants: String(data.get("variants") || "").split(",").map(value => value.trim()).filter(Boolean), isAvailable: true
      });
      showToast("Hidangan berhasil disimpan.");
      render(container);
    } catch (error) {
      console.error("Hidangan gagal disimpan.", error);
      showToast(error.message === "Pilih foto hidangan sebelum menyimpan."
        ? error.message
        : "Hidangan belum dapat disimpan. Periksa data dan coba lagi.", "error");
    }
  });
  container.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => {
    const item = menu.find(entry => entry.id === button.dataset.edit);
    if (!item) return;
    for (const [key, value] of Object.entries({ ...item, variants: (item.variants || []).join(", ") })) {
      if (form.elements[key]) form.elements[key].value = value;
    }
    const savedImageUrl = isCompressedCloudinaryImage(item.imageUrl) ? item.imageUrl : "";
    form.elements.imageUrl.value = savedImageUrl;
    form.elements.imageFile.required = !savedImageUrl;
    form.elements.imageFile.setCustomValidity("");
    imageSubmitButton.disabled = false;
    const preview = container.querySelector("#image-preview");
    const status = container.querySelector("#image-upload-status");
    if (savedImageUrl) {
      preview.src = savedImageUrl;
      preview.classList.remove("hidden");
      status.textContent = "Foto saat ini siap digunakan. Pilih foto baru untuk menggantinya.";
    } else {
      preview.classList.add("hidden");
      status.textContent = item.imageUrl
        ? "Pilih foto baru untuk hidangan ini sebelum menyimpan."
        : "Pilih foto hidangan.";
    }
    container.querySelector("#form-title").textContent = `Edit ${item.name}`;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  container.querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", async () => {
    const item = menu.find(entry => entry.id === button.dataset.toggle);
    try {
      await MerchantService.updateMenuAvailability(merchantId, item.id, !item.isAvailable);
      showToast("Ketersediaan hidangan diperbarui.");
      render(container);
    } catch (error) {
      console.error("Ketersediaan hidangan gagal diperbarui.", error);
      showToast("Ketersediaan hidangan belum dapat diperbarui. Silakan coba lagi.", "error");
    }
  }));
  container.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", async () => {
    const item = menu.find(entry => entry.id === button.dataset.delete);
    if (!window.confirm(`Hapus ${item.name} dari menu?`)) return;
    try {
      await MerchantService.deleteMenuItem(merchantId, item.id);
      showToast("Hidangan dihapus.");
      render(container);
    } catch (error) {
      console.error("Hidangan gagal dihapus.", error);
      showToast("Hidangan belum dapat dihapus. Silakan coba lagi.", "error");
    }
  }));
}
