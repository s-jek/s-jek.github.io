import { escapeHTML, money, showToast } from "../../app.js";
import { CoinService } from "../../services/coinService.js";

const stateLabels = {
  PENDING: "Menunggu peninjauan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak · koin dikembalikan",
  PAID: "Pencairan selesai"
};

function timeValue(timestamp) {
  return timestamp?.toMillis?.() || (timestamp?.seconds ? timestamp.seconds * 1000 : 0);
}

export async function render(container, { user }) {
  const [wallet, settings, rewards, redemptions] = await Promise.all([
    CoinService.getWallet(), CoinService.getSettings(), CoinService.listRewards(), CoinService.listRedemptions(user.uid)
  ]);
  const lastCheckIn = timeValue(wallet.lastCoinCheckInAt);
  const canCheckIn = !lastCheckIn || Date.now() - lastCheckIn >= 24 * 60 * 60 * 1000;
  const checkInStatus = settings.configured
    ? canCheckIn ? "Check-in harian tersedia." : "Check-in hari ini sudah dilakukan."
    : "Hadiah koin harian sedang disiapkan.";
  container.innerHTML = `<section class="page-heading"><a href="#/customer" class="muted">‹ Beranda</a><h1>Koin &amp; hadiah</h1><p>Kumpulkan koin dari check-in harian, lalu tukarkan dengan hadiah.</p></section>
    <section class="card stack"><div class="split"><div><span class="eyebrow">SALDO KOIN</span><h2>🪙 ${wallet.coins.toLocaleString("id-ID")} koin</h2></div><span class="badge badge-success">Hari ke-${wallet.coinCheckInStreak || 0} / 7</span></div>
      <div class="coin-streak">${settings.dailyRewards.map((amount, index) => `<div class="coin-streak-day"><span>Hari ${index + 1}</span><strong>🪙 ${Number(amount).toLocaleString("id-ID")}</strong></div>`).join("")}</div>
      <div class="split"><span class="muted" aria-live="polite">${checkInStatus}</span><button id="daily-checkin" class="btn btn-primary" ${!canCheckIn || !settings.configured ? "disabled" : ""}>Check-in hari ini</button></div>
    </section>
    <section class="stack customer-section"><div><span class="eyebrow">PILIH HADIAH</span><h2>Tukar koin</h2></div>
      ${rewards.length ? `<div class="grid grid-3">${rewards.map(reward => `<article class="card coin-reward-card"><span class="badge">${reward.type === "cash" ? "Uang tunai" : "Voucher"}</span><h3>${escapeHTML(reward.name)}</h3><p class="muted">${escapeHTML(reward.description || "")}</p><strong class="price">🪙 ${Number(reward.coinCost).toLocaleString("id-ID")} koin</strong><p>${reward.type === "cash" ? money(reward.cashAmount) : `Kode ${escapeHTML(reward.voucherCode)}`}</p>
        ${reward.type === "cash" ? `<label class="field">Bank / E-Wallet<input data-provider="${escapeHTML(reward.id)}" autocomplete="organization" maxlength="80" placeholder="Nama bank atau e-wallet"></label><label class="field">Nomor rekening / ponsel<input data-account="${escapeHTML(reward.id)}" autocomplete="off" maxlength="40" placeholder="Nomor tujuan pencairan"></label><small class="muted">Permintaan pencairan ditinjau oleh tim SJek.</small>` : ""}
        <button class="btn btn-primary" data-redeem="${escapeHTML(reward.id)}" ${wallet.coins < reward.coinCost ? "disabled" : ""}>Tukar hadiah</button></article>`).join("")}</div>` : `<div class="empty-state">Belum ada hadiah yang tersedia.</div>`}
    </section>
    <section class="stack customer-section"><div><span class="eyebrow">RIWAYAT</span><h2>Penukaran saya</h2></div>
      ${redemptions.length ? `<div class="stack">${redemptions.map(item => `<article class="card split"><div><strong>${escapeHTML(item.rewardName)}</strong><p class="muted">${Number(item.coinCost).toLocaleString("id-ID")} koin · ${item.createdAt?.toDate?.().toLocaleDateString("id-ID") || "Baru saja"}</p>${item.rewardType === "voucher" && item.status === "APPROVED" ? `<strong class="price">Kode voucher: ${escapeHTML(item.voucherCode)}</strong>` : ""}</div><span class="badge ${item.status === "REJECTED" ? "badge-danger" : item.status === "APPROVED" || item.status === "PAID" ? "badge-success" : "badge-warning"}">${stateLabels[item.status] || escapeHTML(item.status)}</span></article>`).join("")}</div>` : `<div class="empty-state">Belum ada penukaran hadiah.</div>`}
    </section>`;

  container.querySelector("#daily-checkin").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await CoinService.claimDailyCheckIn();
      showToast(`Check-in hari ke-${result.day} berhasil. Anda mendapat ${result.reward} koin.`);
      await render(container, { user: { ...user, coins: result.balance, coinCheckInStreak: result.day } });
    } catch (error) {
      console.error("Check-in koin gagal.", error);
      showToast(error.message === "Check-in hari ini sudah dilakukan. Kembali lagi besok."
        ? error.message
        : "Check-in belum dapat diproses. Silakan coba lagi.", "error");
      button.disabled = false;
    }
  });
  container.querySelectorAll("[data-redeem]").forEach(button => button.addEventListener("click", async () => {
    const reward = rewards.find(item => item.id === button.dataset.redeem);
    if (!reward) return;
    const payout = reward.type === "cash" ? {
      provider: container.querySelector(`[data-provider="${CSS.escape(reward.id)}"]`).value,
      account: container.querySelector(`[data-account="${CSS.escape(reward.id)}"]`).value
    } : {};
    button.disabled = true;
    try {
      await CoinService.redeem(reward.id, payout);
      showToast("Penukaran hadiah berhasil diajukan.");
      await render(container, { user });
    } catch (error) {
      console.error("Penukaran koin gagal.", error);
      const knownErrors = ["Koin Anda belum mencukupi.", "Lengkapi tujuan pencairan dengan data yang valid."];
      showToast(knownErrors.includes(error.message) ? error.message : "Penukaran belum dapat diproses. Silakan coba lagi.", "error");
      button.disabled = false;
    }
  }));
}
