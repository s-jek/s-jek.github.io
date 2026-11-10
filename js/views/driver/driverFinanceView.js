import { money } from "../../app.js";
import { OrderService } from "../../services/orderService.js";

export async function render(container, { user }) {
  const orders = (await OrderService.listOrders({ driverId: user.uid })).filter(order => order.orderStatus === "COMPLETED");
  const today = new Date().toDateString();
  const todayOrders = orders.filter(order => new Date(order.updatedAt).toDateString() === today);
  const todayIncome = todayOrders.reduce((sum, order) => sum + (order.financialLedger?.driverNet || 0), 0);
  const todayKm = todayOrders.reduce((sum, order) => sum + (order.pricingBreakdown?.distanceKm || 0), 0);
  container.innerHTML = `<section class="page-heading"><a href="#/driver/orders" class="muted">‹ Kembali ke order</a><h1>Dompet Driver</h1><p>Ringkasan trip selesai dan pendapatan bersih.</p></section>
    <section class="grid grid-3"><article class="card metric"><span>Penghasilan hari ini</span><strong>${money(todayIncome)}</strong></article><article class="card metric"><span>Trip selesai hari ini</span><strong>${todayOrders.length}</strong></article><article class="card metric"><span>Kilometer hari ini</span><strong>${todayKm.toFixed(1)} km</strong></article></section>
    <section class="stack" style="margin-top:22px"><h2>Riwayat transaksi per trip</h2>${orders.length ? `<div class="table-wrap"><table><thead><tr><th>ID Order</th><th>Tanggal</th><th>Ongkir kotor</th><th>Komisi platform</th><th>Pendapatan bersih</th><th>Jarak</th></tr></thead><tbody>${orders.map(order => `<tr><td>${order.id}</td><td>${new Date(order.updatedAt).toLocaleDateString("id-ID")}</td><td>${money(order.pricingBreakdown?.deliveryFare)}</td><td>${money((order.pricingBreakdown?.deliveryFare || 0) - (order.financialLedger?.driverNet || 0))}</td><td><strong>${money(order.financialLedger?.driverNet)}</strong></td><td>${order.pricingBreakdown?.distanceKm || 0} km</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Belum ada transaksi selesai.</div>`}</section>`;
}
