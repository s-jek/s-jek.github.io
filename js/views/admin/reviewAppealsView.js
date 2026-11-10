import { escapeHTML, showToast } from "../../app.js";
import { ReviewService } from "../../services/reviewService.js";

export async function render(container, { user }) {
  const appeals = await ReviewService.listPendingAppeals();
  container.innerHTML = `<section class="page-heading"><a href="#/admin" class="muted">‹ Admin</a><h1>Banding penilaian</h1><p>Tinjau permohonan banding untuk ulasan bintang satu atau dua.</p></section>
    ${appeals.length ? `<section class="stack">${appeals.map(appeal => `<article class="card stack" data-appeal="${escapeHTML(appeal.id)}">
      <div class="split"><strong>${escapeHTML(appeal.orderId)} · ${escapeHTML(appeal.targetType === "driver" ? "Kurir" : "Toko")}</strong><span class="badge badge-warning">Menunggu</span></div>
      <p><strong>Penilaian awal:</strong> ${appeal.review ? `${"★".repeat(appeal.review.stars)}${"☆".repeat(5 - appeal.review.stars)} · ${escapeHTML(appeal.review.comment || "Tanpa ulasan")}` : "Ulasan tidak ditemukan."}</p>
      <p><strong>Alasan banding:</strong> ${escapeHTML(appeal.details)}</p>
      <a class="btn btn-secondary" href="${escapeHTML(appeal.evidenceUrl)}" target="_blank" rel="noopener noreferrer">Lihat bukti pendukung</a>
      <div class="row"><button class="btn btn-primary" data-decision="UPHELD">Setujui banding &amp; sembunyikan ulasan</button><button class="btn btn-danger" data-decision="REJECTED">Tolak banding</button></div>
    </article>`).join("")}</section>` : `<div class="empty-state">Tidak ada banding yang menunggu.</div>`}`;
  container.querySelectorAll("[data-decision]").forEach(button => button.addEventListener("click", async () => {
    const appeal = appeals.find(item => item.id === button.closest("[data-appeal]").dataset.appeal);
    if (!appeal) return;
    const decision = button.dataset.decision;
    try {
      button.disabled = true;
      await ReviewService.reviewAppeal(appeal, decision, user.uid);
      showToast(decision === "UPHELD" ? "Banding disetujui dan ulasan disembunyikan." : "Banding ditolak.");
      await render(container, { user });
    } catch (error) {
      console.error("Keputusan banding gagal disimpan.", error);
      showToast("Keputusan banding belum dapat disimpan. Silakan coba lagi.", "error");
      button.disabled = false;
    }
  }));
}
