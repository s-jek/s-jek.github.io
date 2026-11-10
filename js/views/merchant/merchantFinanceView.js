import { money } from "../../app.js";
import { OrderService } from "../../services/orderService.js";

export async function render(container, { user }) {
  const merchantId = user.partnerMerchantId;
  if (!merchantId) throw new Error("Profil mitra food belum memiliki toko aktif.");
  const orders = (await OrderService.listOrders({ merchantId })).filter(order => order.serviceType === "SFOOD" && order.orderStatus === "COMPLETED");
  const gross = orders.reduce((sum, order) => sum + (order.pricingBreakdown?.subtotalFood || 0), 0);
  const commission = orders.reduce((sum, order) => sum + ((order.pricingBreakdown?.subtotalFood || 0) - (order.financialLedger?.merchantNet || 0)), 0);
  const net = orders.reduce((sum, order) => sum + (order.financialLedger?.merchantNet || 0), 0);
  container.innerHTML = `<section class="page-heading"><a href="#/merchant/orders" class="muted">‹ Kembali ke pesanan</a><h1>Laporan Penjualan</h1><p>Rekap omzet, komisi platform, dan saldo pencairan toko.</p></section>
    <section class="grid grid-3"><article class="card metric"><span>Omzet kotor</span><strong>${money(gross)}</strong></article><article class="card metric"><span>Komisi platform (20%)</span><strong>${money(commission)}</strong></article><article class="card metric"><span>Saldo bersih toko</span><strong>${money(net)}</strong></article></section>
    <section class="stack" style="margin-top:22px"><h2>Transaksi selesai</h2>${orders.length ? `<div class="table-wrap"><table><thead><tr><th>ID Order</th><th>Tanggal</th><th>Penjualan kotor</th><th>Komisi (20%)</th><th>Saldo bersih</th></tr></thead><tbody>${orders.map(order => `<tr><td>${order.id}</td><td>${new Date(order.updatedAt).toLocaleDateString("id-ID")}</td><td>${money(order.pricingBreakdown?.subtotalFood)}</td><td>${money((order.pricingBreakdown?.subtotalFood || 0) - (order.financialLedger?.merchantNet || 0))}</td><td><strong>${money(order.financialLedger?.merchantNet)}</strong></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Belum ada transaksi selesai.</div>`}</section>`;
}
