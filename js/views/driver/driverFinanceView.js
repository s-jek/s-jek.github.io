import { money, showToast } from "../../app.js";
import { OrderService } from "../../services/orderService.js";
import { FinanceService } from "../../services/financeService.js";

export async function render(container, { user }) {
  const [allOrders, tariffs, settlements] = await Promise.all([
    OrderService.listOrders({ driverId: user.uid }),
    OrderService.getTariffs(),
    FinanceService.listDriverSettlements(user.uid)
  ]);
  const orders = allOrders.filter(order => order.orderStatus === "COMPLETED");
  const settlementStatus = FinanceService.calculateDriverSettlementStatus(orders, settlements, tariffs);
  const split = order => ({
    driverCommission: Number.isFinite(order.financialLedger?.driverCommission)
      ? order.financialLedger.driverCommission
      : Number.isFinite(order.financialLedger?.driverNet)
        ? Math.max(0, (Number(order.pricingBreakdown?.deliveryFare) || 0) - order.financialLedger.driverNet)
        : Math.round((Number(order.pricingBreakdown?.deliveryFare) || 0) * (order.pricingBreakdown?.driverCommissionPct ?? tariffs.driverCommissionPct ?? 0) / 100),
    merchantCommission: Number.isFinite(order.financialLedger?.merchantCommission)
      ? order.financialLedger.merchantCommission
      : order.serviceType !== "SFOOD" ? 0
        : Number.isFinite(order.financialLedger?.merchantNet)
          ? Math.max(0, (Number(order.pricingBreakdown?.subtotalFood) || 0) - order.financialLedger.merchantNet)
          : Math.round((Number(order.pricingBreakdown?.subtotalFood) || 0) * (order.pricingBreakdown?.merchantCommissionPct ?? tariffs.merchantCommissionPct ?? 0) / 100),
    platformFee: Number(order.pricingBreakdown?.platformFee) || 0
  });
  const driverNet = order => Number.isFinite(order.financialLedger?.driverNet)
    ? order.financialLedger.driverNet
    : Math.max(0, (Number(order.pricingBreakdown?.deliveryFare) || 0) - split(order).driverCommission);
  const approvedSettlements = settlements.filter(item => item.status === "APPROVED");
  const pendingSettlements = settlements.filter(item => item.status === "PENDING");
  const { dueByType, outstanding, overdue, deposit, blockedByFinance } = settlementStatus;
  const today = new Date().toDateString();
  const todayOrders = orders.filter(order => new Date(order.updatedAt).toDateString() === today);
  const todayIncome = todayOrders.reduce((sum, order) => sum + driverNet(order), 0);
  const todayKm = todayOrders.reduce((sum, order) => sum + (order.pricingBreakdown?.distanceKm || 0), 0);
  container.innerHTML = `<section class="page-heading"><a href="#/driver/orders" class="muted">‹ Kembali ke order</a><h1>Dompet Driver</h1><p>Penghasilan trip dan setoran tunai kepada admin.</p></section>
    ${blockedByFinance ? `<div class="card" role="alert"><strong>Setoran perlu diselesaikan.</strong><p>${overdue ? "Ada kewajiban yang belum disetor setelah 2×24 jam." : `Setoran tertunggak sudah mencapai deposit ${money(deposit)}.`} Tombol penerimaan order akan diblokir saat portal dibuka. Hubungi admin untuk verifikasi setoran.</p></div>` : ""}
    <section class="grid grid-3"><article class="card metric"><span>Penghasilan hari ini</span><strong>${money(todayIncome)}</strong></article><article class="card metric"><span>Trip selesai hari ini</span><strong>${todayOrders.length}</strong></article><article class="card metric"><span>Kilometer hari ini</span><strong>${todayKm.toFixed(1)} km</strong></article></section>
    <section class="grid grid-3" style="margin-top:16px"><article class="card metric"><span>Komisi driver untuk disetor</span><strong>${money(dueByType.driverCommission)}</strong></article><article class="card metric"><span>Potongan toko untuk disetor</span><strong>${money(dueByType.merchantCommission)}</strong></article><article class="card metric"><span>Biaya layanan untuk disetor</span><strong>${money(dueByType.platformFee)}</strong></article></section>
    <section class="card stack" style="margin-top:22px"><h2>Setoran tunai ke aplikasi</h2><p>Total kewajiban: <strong>${money(outstanding)}</strong> · Deposit driver: ${money(deposit)} · Menunggu konfirmasi admin: ${pendingSettlements.length} pengajuan.</p>
      <p class="muted">Setoran toko dipisahkan dari komisi driver. Admin memeriksa dan menyetujui setiap setoran secara manual.</p>
      <button class="btn btn-primary" id="submit-settlement" ${outstanding <= 0 || pendingSettlements.length > 0 || dueByType.driverCommission + dueByType.merchantCommission + dueByType.platformFee <= 0 ? "disabled" : ""}>${pendingSettlements.length ? "Menunggu konfirmasi setoran" : `Ajukan setoran ${money(dueByType.driverCommission + dueByType.merchantCommission + dueByType.platformFee)}`}</button>
      ${settlements.length ? `<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Komisi driver</th><th>Potongan toko</th><th>Biaya layanan</th><th>Total</th><th>Status</th></tr></thead><tbody>${settlements.map(item => `<tr><td>${new Date(item.createdAt).toLocaleString("id-ID")}</td><td>${money(item.driverCommission)}</td><td>${money(item.merchantCommission)}</td><td>${money(item.platformFee)}</td><td>${money(item.amount)}</td><td>${item.status}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Belum ada pengajuan setoran.</p>`}
    </section>
    <section class="stack" style="margin-top:22px"><h2>Riwayat transaksi per trip</h2>${orders.length ? `<div class="table-wrap"><table><thead><tr><th>ID Order</th><th>Tanggal</th><th>Ongkir dasar</th><th>Biaya jemput</th><th>Komisi driver</th><th>Komisi toko ditahan</th><th>Pendapatan bersih</th><th>Jarak</th></tr></thead><tbody>${orders.map(order => { const part = split(order); return `<tr><td>${order.id}</td><td>${new Date(order.updatedAt).toLocaleDateString("id-ID")}</td><td>${money(order.pricingBreakdown?.baseDeliveryFare ?? order.pricingBreakdown?.deliveryFare)}</td><td>${money(order.pricingBreakdown?.pickupSurcharge)}</td><td>${money(part.driverCommission)}</td><td>${money(part.merchantCommission)}</td><td><strong>${money(driverNet(order))}</strong></td><td>${order.pricingBreakdown?.distanceKm || 0} km</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty-state">Belum ada transaksi selesai.</div>`}</section>`;
  container.querySelector("#submit-settlement").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await FinanceService.submitDriverSettlement(user.uid, dueByType);
      showToast("Pengajuan setoran dikirim dan menunggu pemeriksaan admin.");
      await render(container, { user });
    } catch (error) {
      console.error("Pengajuan setoran driver gagal.", error);
      showToast(error.message || "Setoran belum dapat diajukan.", "error");
      button.disabled = false;
    }
  });
}
