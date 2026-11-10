import { escapeHTML, money, showToast } from "../../app.js";
import { CoinService } from "../../services/coinService.js";

const statusNames = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", PAID: "Selesai" };

export async function render(container, { user }) {
  const [settings, rewards, redemptions] = await Promise.all([
    CoinService.getSettings(), CoinService.listRewards({ includeInactive: true }), CoinService.listRedemptions()
  ]);
  const rewardById = new Map(rewards.map(reward => [reward.id, reward]));
  container.innerHTML = `<section class="page-heading"><a href="#/admin" class="muted">‹ Dashboard</a><h1>Pengaturan Koin</h1><p>Atur hadiah check-in 7 hari, katalog penukaran, dan permintaan pencairan.</p></section>
    <form id="daily-reward-form" class="card stack"><h2>Hadiah check-in 7 hari</h2><div class="form-grid">${settings.dailyRewards.map((amount, index) => `<label class="field">Hari ${index + 1} · koin<input name="day${index + 1}" type="number" min="0" max="100000" step="1" value="${Number(amount)}" required></label>`).join("")}</div><button class="btn btn-primary" type="submit">Simpan hadiah harian</button></form>
    <form id="coin-reward-form" class="card stack" style="margin-top:20px"><h2 id="reward-form-title">Tambah hadiah</h2><input name="id" type="hidden"><div class="form-grid">
      <label class="field">Nama hadiah<input name="name" required maxlength="60"></label><label class="field">Tipe hadiah<select name="type"><option value="voucher">Voucher</option><option value="cash">Uang tunai</option></select></label>
      <label class="field">Biaya koin<input name="coinCost" type="number" min="1" step="1" required></label><label class="field coin-cash-field">Nilai tunai (Rp)<input name="cashAmount" type="number" min="1" step="1000"></label>
      <label class="field coin-voucher-field">Kode voucher<input name="voucherCode" maxlength="40"></label>
      <label class="field" style="grid-column:1/-1">Keterangan<textarea name="description" maxlength="180"></textarea></label>
      <label class="field">Status<select name="isActive"><option value="true">Tersedia</option><option value="false">Disembunyikan</option></select></label>
    </div><div class="row"><button class="btn btn-primary" type="submit">Simpan hadiah</button><button class="btn btn-ghost" type="reset">Bersihkan</button></div></form>
    <section class="stack customer-section"><h2>Katalog hadiah</h2>${rewards.length ? `<div class="grid grid-3">${rewards.map(reward => `<article class="card coin-reward-card"><span class="badge ${reward.isActive ? "badge-success" : "badge-danger"}">${reward.isActive ? "Tersedia" : "Disembunyikan"}</span><h3>${escapeHTML(reward.name)}</h3><p>${reward.type === "cash" ? money(reward.cashAmount) : `Voucher ${escapeHTML(reward.voucherCode)}`}</p><p class="muted">🪙 ${Number(reward.coinCost).toLocaleString("id-ID")} koin</p><div class="row"><button class="btn btn-secondary" data-edit-reward="${escapeHTML(reward.id)}">Ubah</button><button class="btn btn-danger" data-delete-reward="${escapeHTML(reward.id)}">Hapus</button></div></article>`).join("")}</div>` : `<div class="empty-state">Belum ada hadiah. Tambahkan hadiah untuk ditampilkan kepada pelanggan.</div>`}</section>
    <section class="stack customer-section"><h2>Permintaan penukaran</h2>${redemptions.length ? `<div class="table-wrap"><table><thead><tr><th>Pelanggan</th><th>Hadiah</th><th>Nilai</th><th>Tujuan pencairan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${redemptions.map(item => `<tr><td>${escapeHTML(item.uid)}</td><td>${escapeHTML(item.rewardName)}<br><small>${Number(item.coinCost).toLocaleString("id-ID")} koin</small></td><td>${item.rewardType === "cash" ? money(item.cashAmount) : escapeHTML(item.voucherCode)}</td><td>${item.rewardType === "cash" ? `${escapeHTML(item.payoutProvider)}<br>${escapeHTML(item.payoutAccount)}` : "—"}</td><td>${statusNames[item.status] || escapeHTML(item.status)}</td><td>${item.status === "PENDING" ? `<div class="row"><button class="btn btn-primary" data-review="APPROVED" data-redemption="${escapeHTML(item.id)}">Setujui</button><button class="btn btn-danger" data-review="REJECTED" data-redemption="${escapeHTML(item.id)}">Tolak</button></div>` : item.status === "APPROVED" && item.rewardType === "cash" ? `<button class="btn btn-secondary" data-review="PAID" data-redemption="${escapeHTML(item.id)}">Tandai dicairkan</button>` : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Belum ada permintaan penukaran.</div>`}</section>`;
  const rewardForm = container.querySelector("#coin-reward-form");
  const setRewardType = () => {
    const isCash = rewardForm.elements.type.value === "cash";
    container.querySelector(".coin-cash-field").classList.toggle("hidden", !isCash);
    container.querySelector(".coin-voucher-field").classList.toggle("hidden", isCash);
    rewardForm.elements.cashAmount.required = isCash;
    rewardForm.elements.voucherCode.required = !isCash;
  };
  rewardForm.elements.type.addEventListener("change", setRewardType);
  setRewardType();
  container.querySelector("#daily-reward-form").addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dailyRewards = Array.from({ length: 7 }, (_, index) => Number(data.get(`day${index + 1}`)));
    try {
      await CoinService.saveSettings(dailyRewards);
      showToast("Hadiah check-in berhasil disimpan.");
      render(container, { user });
    } catch (error) {
      console.error("Aturan hadiah check-in gagal disimpan.", error);
      showToast("Hadiah check-in belum dapat disimpan. Periksa nilainya dan coba lagi.", "error");
    }
  });
  rewardForm.addEventListener("reset", () => window.setTimeout(() => {
    rewardForm.elements.id.value = "";
    container.querySelector("#reward-form-title").textContent = "Tambah hadiah";
    setRewardType();
  }));
  rewardForm.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(rewardForm);
    try {
      await CoinService.saveReward({
        name: data.get("name"), description: data.get("description"), type: data.get("type"),
        coinCost: Number(data.get("coinCost")), cashAmount: Number(data.get("cashAmount")),
        voucherCode: data.get("voucherCode"), isActive: data.get("isActive") === "true"
      }, String(data.get("id") || ""));
      showToast("Hadiah berhasil disimpan.");
      render(container, { user });
    } catch (error) {
      console.error("Hadiah koin gagal disimpan.", error);
      showToast("Hadiah belum dapat disimpan. Periksa data dan coba lagi.", "error");
    }
  });
  container.querySelectorAll("[data-edit-reward]").forEach(button => button.addEventListener("click", () => {
    const reward = rewardById.get(button.dataset.editReward);
    if (!reward) return;
    for (const [key, value] of Object.entries({
      id: reward.id, name: reward.name, type: reward.type, coinCost: reward.coinCost,
      cashAmount: reward.cashAmount, voucherCode: reward.voucherCode, description: reward.description,
      isActive: String(reward.isActive)
    })) rewardForm.elements[key].value = value ?? "";
    setRewardType();
    container.querySelector("#reward-form-title").textContent = `Ubah ${reward.name}`;
    rewardForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  container.querySelectorAll("[data-delete-reward]").forEach(button => button.addEventListener("click", async () => {
    if (!window.confirm("Hapus hadiah ini dari katalog?")) return;
    try {
      await CoinService.removeReward(button.dataset.deleteReward);
      showToast("Hadiah dihapus.");
      render(container, { user });
    } catch (error) {
      console.error("Hadiah gagal dihapus.", error);
      showToast("Hadiah belum dapat dihapus. Silakan coba lagi.", "error");
    }
  }));
  container.querySelectorAll("[data-review]").forEach(button => button.addEventListener("click", async () => {
    const decision = button.dataset.review;
    if (decision === "REJECTED" && !window.confirm("Tolak permintaan ini dan kembalikan koin pelanggan?")) return;
    button.disabled = true;
    try {
      await CoinService.reviewRedemption(button.dataset.redemption, decision, user.uid);
      showToast(decision === "APPROVED" ? "Penukaran disetujui." : decision === "REJECTED" ? "Permintaan ditolak dan koin dikembalikan." : "Pencairan ditandai selesai.");
      render(container, { user });
    } catch (error) {
      console.error("Permintaan penukaran gagal diperbarui.", error);
      showToast("Permintaan belum dapat diperbarui. Silakan coba lagi.", "error");
      button.disabled = false;
    }
  }));
}
