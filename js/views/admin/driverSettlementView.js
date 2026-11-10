import { escapeHTML, money, showToast } from "../../app.js";
import { FinanceService } from "../../services/financeService.js";
import { OrderService } from "../../services/orderService.js";

function depositLabel(status) {
  if (status === "HELD") return "Dipegang";
  if (status === "REFUNDED") return "Dikembalikan";
  return "Belum diterima";
}

export async function render(container, { user }) {
  const [settlements, partners, orders, tariffs] = await Promise.all([
    FinanceService.listDriverSettlements(),
    FinanceService.listPartnerAccounts(),
    OrderService.listOrders(),
    OrderService.getTariffs()
  ]);
  const drivers = partners.filter(partner => partner.partnerRoles?.includes("driver"));
  const partnerEntries = partners.flatMap(partner => [
    ...(partner.partnerRoles?.includes("driver") ? [{ ...partner, partnerType: "driver" }] : []),
    ...(partner.partnerRoles?.includes("merchant") ? [{ ...partner, partnerType: "merchant" }] : [])
  ]);
  const settlementsByDriver = new Map();
  for (const settlement of settlements) {
    const list = settlementsByDriver.get(settlement.driverUid) || [];
    list.push(settlement);
    settlementsByDriver.set(settlement.driverUid, list);
  }
  const accountSummaries = new Map(drivers.map(driver => {
    const driverOrders = orders.filter(order => order.driverId === driver.uid);
    return [driver.uid, FinanceService.calculateDriverSettlementStatus(
      driverOrders,
      settlementsByDriver.get(driver.uid) || [],
      tariffs
    )];
  }));
  container.innerHTML = `<section class="page-heading"><a href="#/admin" class="muted">‹ Dashboard</a><h1>Setoran &amp; deposit mitra</h1><p>Tinjau setoran tunai driver, status akun, dan pengembalian deposit.</p><p class="muted">Tanpa Cloud Function terjadwal, pemicu batas 48 jam dihitung saat portal driver dibuka. Untuk penolakan order yang konsisten di Firestore, admin perlu menandai akun nonaktif.</p></section>
    <section class="stack"><h2>Pengajuan setoran driver (${settlements.filter(item => item.status === "PENDING").length} menunggu)</h2>
      ${settlements.length ? `<div class="table-wrap"><table><thead><tr><th>Driver</th><th>Tanggal</th><th>Tertunggak</th><th>Komisi driver</th><th>Potongan toko</th><th>Biaya layanan</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${settlements.map(item => {
        const driver = drivers.find(entry => entry.uid === item.driverUid);
        const finance = accountSummaries.get(item.driverUid);
        const breakdownFits = finance
          && item.amount <= finance.outstanding
          && item.driverCommission <= finance.dueByType.driverCommission
          && item.merchantCommission <= finance.dueByType.merchantCommission
          && item.platformFee <= finance.dueByType.platformFee;
        return `<tr><td>${escapeHTML(driver?.name || item.driverUid)}</td><td>${new Date(item.createdAt).toLocaleString("id-ID")}</td><td>${money(finance?.outstanding)}</td><td>${money(item.driverCommission)}</td><td>${money(item.merchantCommission)}</td><td>${money(item.platformFee)}</td><td><strong>${money(item.amount)}</strong></td><td>${escapeHTML(item.status)}</td><td>${item.status === "PENDING" ? `<div class="row"><button class="btn btn-primary" data-settlement="${escapeHTML(item.id)}" data-decision="APPROVED" ${breakdownFits ? "" : "disabled"} title="${breakdownFits ? "Konfirmasi uang sudah diterima dan rinciannya cocok" : "Rincian pengajuan melebihi saldo tertunggak"}">Setujui</button><button class="btn btn-danger" data-settlement="${escapeHTML(item.id)}" data-decision="REJECTED">Tolak</button></div>` : "—"}</td></tr>`;
      }).join("")}</tbody></table></div>` : `<div class="empty-state">Belum ada pengajuan setoran.</div>`}
    </section>
    <section class="stack" style="margin-top:24px"><h2>Status akun &amp; deposit mitra</h2>
      ${partnerEntries.length ? `<div class="table-wrap"><table><thead><tr><th>Mitra</th><th>Jenis</th><th>Status akun</th><th>Setoran tertunggak</th><th>Deposit</th><th>Status deposit</th><th>Aksi</th></tr></thead><tbody>${partnerEntries.map(partner => {
        const isDriver = partner.partnerType === "driver";
        const accountStatus = isDriver ? partner.driverAccountStatus || "ACTIVE" : partner.merchantAccountStatus || "ACTIVE";
        const depositStatus = isDriver ? partner.driverDepositStatus : partner.merchantDepositStatus;
        const depositAmount = isDriver ? tariffs.driverDeposit : tariffs.merchantDeposit;
        const finance = accountSummaries.get(partner.uid);
        const outstanding = isDriver ? finance?.outstanding || 0 : 0;
        const canRefund = accountStatus === "SUSPENDED" && outstanding === 0 && depositStatus === "HELD";
        const statusField = isDriver ? "driverAccountStatus" : "merchantAccountStatus";
        const depositField = isDriver ? "driverDepositStatus" : "merchantDepositStatus";
        return `<tr><td>${escapeHTML(partner.name || partner.email || partner.uid)}</td><td>${isDriver ? "Driver" : "Toko"}</td><td>${accountStatus === "SUSPENDED" ? "Nonaktif" : "Aktif"}</td><td>${isDriver ? money(outstanding) : "—"}</td><td>${money(depositAmount)}</td><td>${depositLabel(depositStatus)}</td><td><div class="row">
          <button class="btn btn-secondary" data-account="${escapeHTML(partner.uid)}" data-field="${statusField}" data-value="${accountStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"}">${accountStatus === "SUSPENDED" ? "Aktifkan akun" : "Nonaktifkan akun"}</button>
          ${depositStatus === "HELD" ? `<button class="btn btn-ghost" data-account="${escapeHTML(partner.uid)}" data-field="${depositField}" data-value="REFUNDED" ${canRefund ? "" : "disabled"} title="${canRefund ? "Tandai deposit sudah dikembalikan" : "Akun harus nonaktif dan semua kewajiban lunas"}">Kembalikan deposit</button>` : depositStatus === "REFUNDED" ? "—" : `<button class="btn btn-ghost" data-account="${escapeHTML(partner.uid)}" data-field="${depositField}" data-value="HELD">Tandai deposit diterima</button>`}
        </div></td></tr>`;
      }).join("")}</tbody></table></div>` : `<div class="empty-state">Belum ada mitra aktif.</div>`}
      <p class="muted">Deposit pengembalian harus diverifikasi manual setelah akun dinonaktifkan dan seluruh kewajiban diselesaikan.</p>
    </section>`;

  container.querySelectorAll("[data-settlement]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await FinanceService.reviewDriverSettlement(button.dataset.settlement, button.dataset.decision, user.uid);
      showToast(button.dataset.decision === "APPROVED" ? "Setoran disetujui." : "Pengajuan setoran ditolak.");
      await render(container, { user });
    } catch (error) {
      console.error("Pemeriksaan setoran driver gagal.", error);
      showToast(error.message || "Setoran belum dapat diperbarui.", "error");
      button.disabled = false;
    }
  }));
  container.querySelectorAll("[data-account]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const updates = { [button.dataset.field]: button.dataset.value };
      if (button.dataset.field === "driverAccountStatus" && button.dataset.value === "SUSPENDED") {
        updates.driverDepositStatus = partners.find(partner => partner.uid === button.dataset.account)?.driverDepositStatus || "UNPAID";
      }
      await OrderService.updatePartnerAccount(button.dataset.account, updates);
      showToast(button.dataset.value === "REFUNDED" ? "Pengembalian deposit dicatat." : button.dataset.value === "HELD" ? "Deposit diterima dicatat." : "Status mitra berhasil diperbarui.");
      await render(container, { user });
    } catch (error) {
      console.error("Pembaruan status mitra gagal.", error);
      showToast(error.message || "Pembaruan mitra belum dapat disimpan.", "error");
      button.disabled = false;
    }
  }));
}
