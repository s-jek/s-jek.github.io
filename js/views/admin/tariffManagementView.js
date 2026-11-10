import { money, showToast } from "../../app.js";
import { OrderService } from "../../services/orderService.js";

export async function render(container) {
  const tariffs = await OrderService.getTariffs();
  container.innerHTML = `<section class="page-heading"><a href="#/admin" class="muted">‹ Dashboard</a><h1>Pengaturan Tarif</h1><p>Perubahan tarif digunakan untuk pesanan baru. Transaksi lama tetap memakai rincian tersimpan.</p></section>
    <form class="card stack" id="tariff-form"><h2>Ojek Online</h2><div class="form-grid">
      <label class="field">Jarak dasar (km)<input name="ojekBaseKm" type="number" min="0" step="0.1" value="${tariffs.ojek.baseKm}" required></label>
      <label class="field">Tarif dasar (Rp)<input name="ojekBaseFare" type="number" min="0" step="500" value="${tariffs.ojek.baseFare}" required></label>
      <label class="field">Tarif tambahan per km (Rp)<input name="ojekPerKm" type="number" min="0" step="500" value="${tariffs.ojek.perKm}" required></label>
    </div><h2>SSend</h2><div class="form-grid">
      <label class="field">Jarak dasar (km)<input name="ssendBaseKm" type="number" min="0" step="0.1" value="${tariffs.ssend.baseKm}" required></label>
      <label class="field">Tarif dasar (Rp)<input name="ssendBaseFare" type="number" min="0" step="500" value="${tariffs.ssend.baseFare}" required></label>
      <label class="field">Tarif tambahan per km (Rp)<input name="ssendPerKm" type="number" min="0" step="500" value="${tariffs.ssend.perKm}" required></label>
    </div><h2>SFood</h2><div class="form-grid">
      <label class="field">Jarak dasar (km)<input name="sfoodBaseKm" type="number" min="0" step="0.1" value="${tariffs.sfood.baseKm}" required></label>
      <label class="field">Tarif dasar (Rp)<input name="sfoodBaseFare" type="number" min="0" step="500" value="${tariffs.sfood.baseFare}" required></label>
      <label class="field">Tarif tambahan per km (Rp)<input name="sfoodPerKm" type="number" min="0" step="500" value="${tariffs.sfood.perKm}" required></label>
    </div><h2>Platform &amp; komisi</h2><div class="form-grid">
      <label class="field">Biaya layanan (Rp)<input name="platformFee" type="number" min="0" step="500" value="${tariffs.platformFee}" required></label>
      <label class="field">Komisi driver (%)<input name="driverCommissionPct" type="number" min="0" max="100" step="0.1" value="${tariffs.driverCommissionPct}" required></label>
      <label class="field">Komisi toko (%)<input name="merchantCommissionPct" type="number" min="0" max="100" step="0.1" value="${tariffs.merchantCommissionPct}" required></label>
    </div><div class="row"><button class="btn btn-primary" type="submit">Simpan tarif</button><span class="muted">Tarif dasar saat ini: Ojek ${money(tariffs.ojek.baseFare)}, SFood ${money(tariffs.sfood.baseFare)}, SSend ${money(tariffs.ssend.baseFare)}.</span></div></form>`;
  container.querySelector("#tariff-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = name => Number(form.elements[name].value);
    const updated = {
      ojek: { baseKm: value("ojekBaseKm"), baseFare: value("ojekBaseFare"), perKm: value("ojekPerKm") },
      ssend: { baseKm: value("ssendBaseKm"), baseFare: value("ssendBaseFare"), perKm: value("ssendPerKm") },
      sfood: { baseKm: value("sfoodBaseKm"), baseFare: value("sfoodBaseFare"), perKm: value("sfoodPerKm") },
      platformFee: value("platformFee"),
      driverCommissionPct: value("driverCommissionPct"),
      merchantCommissionPct: value("merchantCommissionPct")
    };
    if (Object.values(updated.ojek).concat(Object.values(updated.ssend), Object.values(updated.sfood), updated.platformFee, updated.driverCommissionPct, updated.merchantCommissionPct).some(number => !Number.isFinite(number) || number < 0)) {
      return showToast("Nilai tarif harus berupa angka nol atau lebih.", "error");
    }
    if (updated.driverCommissionPct > 100 || updated.merchantCommissionPct > 100) return showToast("Persentase komisi maksimal 100%.", "error");
    try {
      await OrderService.saveTariffs(updated);
      showToast("Tarif berhasil disimpan.");
    } catch (error) {
      console.error("Perubahan tarif gagal disimpan.", error);
      showToast("Tarif belum dapat disimpan. Silakan coba lagi.", "error");
    }
  });
}
