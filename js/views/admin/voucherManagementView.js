import { escapeHTML, money, showToast } from "../../app.js";
import { OrderService } from "../../services/orderService.js";

export async function render(container) {
  const vouchers = await OrderService.listVouchers();
  container.innerHTML = `<section class="page-heading"><a href="#/admin" class="muted">‹ Dashboard</a><h1>Voucher Promo</h1><p>Atur kode diskon, syarat transaksi, kuota, dan masa berlaku.</p></section>
    <form id="voucher-form" class="card stack"><h2>Buat / ubah voucher</h2><div class="form-grid">
      <label class="field">Kode voucher<input name="code" required placeholder="SJEKHEMAT"></label>
      <label class="field">Target diskon<select name="target"><option value="SUBTOTAL">Subtotal belanja</option><option value="DELIVERY">Ongkir</option></select></label>
      <label class="field">Tipe diskon<select name="type"><option value="PERCENT">Persentase (%)</option><option value="FIXED">Nominal (Rp)</option></select></label>
      <label class="field">Nilai diskon<input name="value" type="number" min="0" required></label>
      <label class="field">Batas maksimum diskon (Rp)<input name="maxDiscount" type="number" min="0" value="10000"></label>
      <label class="field">Minimum transaksi (Rp)<input name="minSpend" type="number" min="0" value="20000"></label>
      <label class="field">Kuota penggunaan<input name="quota" type="number" min="0" value="100"></label>
      <label class="field">Tanggal kedaluwarsa<input name="validUntil" type="date" required></label>
      <label class="field"><span>Status aktif</span><select name="isActive"><option value="true">Aktif</option><option value="false">Nonaktif</option></select></label>
    </div><button class="btn btn-primary" type="submit">Simpan voucher</button></form>
    <section class="stack" style="margin-top:20px"><h2>Voucher terdaftar</h2>${vouchers.length ? `<div class="table-wrap"><table><thead><tr><th>Kode</th><th>Diskon</th><th>Syarat</th><th>Penggunaan</th><th>Berlaku sampai</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${vouchers.map(voucher => `<tr><td><strong>${escapeHTML(voucher.code)}</strong></td><td>${voucher.type === "PERCENT" ? `${voucher.value}% (maks. ${money(voucher.maxDiscount)})` : money(voucher.value)}</td><td>${money(voucher.minSpend)} · ${voucher.target === "DELIVERY" ? "Ongkir" : "Subtotal"}</td><td>${voucher.usedCount || 0}/${voucher.quota || "∞"}</td><td>${escapeHTML(voucher.validUntil || "—")}</td><td><span class="badge ${voucher.isActive ? "badge-success" : "badge-danger"}">${voucher.isActive ? "Aktif" : "Nonaktif"}</span></td><td><button class="btn btn-danger" data-delete="${escapeHTML(voucher.code)}">Hapus</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Belum ada voucher.</div>`}</section>`;
  container.querySelector("#voucher-form").addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const voucher = {
      code: String(data.get("code")).trim().toUpperCase(), target: data.get("target"), type: data.get("type"),
      value: Number(data.get("value")), maxDiscount: Number(data.get("maxDiscount")), minSpend: Number(data.get("minSpend")),
      quota: Number(data.get("quota")), validUntil: data.get("validUntil"), isActive: data.get("isActive") === "true"
    };
    if (!voucher.code || Object.values([voucher.value, voucher.maxDiscount, voucher.minSpend, voucher.quota]).some(number => !Number.isFinite(number) || number < 0)) {
      return showToast("Lengkapi voucher dengan nilai angka yang valid.", "error");
    }
    if (voucher.type === "PERCENT" && voucher.value > 100) return showToast("Persentase diskon maksimal 100%.", "error");
    try {
      await OrderService.saveVoucher(voucher);
      showToast("Voucher berhasil disimpan.");
      render(container);
    } catch (error) {
      console.error("Voucher gagal disimpan.", error);
      showToast("Voucher belum dapat disimpan. Silakan coba lagi.", "error");
    }
  });
  container.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", async () => {
    if (!window.confirm(`Hapus voucher ${button.dataset.delete}?`)) return;
    try {
      await OrderService.deleteVoucher(button.dataset.delete);
      showToast("Voucher dihapus.");
      render(container);
    } catch (error) {
      console.error("Voucher gagal dihapus.", error);
      showToast("Voucher belum dapat dihapus. Silakan coba lagi.", "error");
    }
  }));
}
