import { money } from "../../app.js";
import { OrderService } from "../../services/orderService.js";

const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export async function render(container) {
  const orders = (await OrderService.listOrders()).filter(order => order.orderStatus === "COMPLETED");
  container.innerHTML = `<section class="page-heading"><a href="#/admin" class="muted">‹ Dashboard</a><h1>Laporan Finansial Platform</h1><p>Pembukuan transaksi selesai dan pembagian hak para mitra.</p></section>
    <div class="dashboard-toolbar"><label class="field">Rentang waktu<select id="date-range"><option value="today">Hari ini</option><option value="7days" selected>7 hari terakhir</option><option value="month">Bulan ini</option><option value="custom">Rentang kustom</option></select></label><div class="row" id="custom-dates" hidden><label class="field">Dari<input type="date" id="date-from"></label><label class="field">Sampai<input type="date" id="date-to"></label></div></div>
    <section class="grid grid-3" id="finance-metrics"></section><section class="stack" style="margin-top:22px"><h2>Buku besar transaksi</h2><div id="ledger-table"></div></section>`;
  const range = container.querySelector("#date-range");
  const custom = container.querySelector("#custom-dates");
  const refresh = () => {
    const now = new Date();
    let from = new Date(0);
    let to = new Date(8640000000000000);
    if (range.value === "today") from = startOfDay(now);
    if (range.value === "7days") from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    if (range.value === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
    if (range.value === "custom") {
      from = container.querySelector("#date-from").value ? new Date(`${container.querySelector("#date-from").value}T00:00:00`) : new Date(0);
      to = container.querySelector("#date-to").value ? new Date(`${container.querySelector("#date-to").value}T23:59:59`) : new Date(8640000000000000);
    }
    custom.hidden = range.value !== "custom";
    const filtered = orders.filter(order => {
      const created = new Date(order.createdAt);
      return created >= from && created <= to;
    });
    const gmv = filtered.reduce((sum, order) => sum + (order.pricingBreakdown?.totalCustomerPay || 0), 0);
    const ownerNet = filtered.reduce((sum, order) => sum + (order.financialLedger?.platformNet || 0), 0);
    const voucher = filtered.reduce((sum, order) => sum + (order.financialLedger?.voucherExpense || 0), 0);
    container.querySelector("#finance-metrics").innerHTML = `<article class="card metric"><span>Total GMV</span><strong>${money(gmv)}</strong></article><article class="card metric"><span>Pendapatan bersih owner</span><strong>${money(ownerNet)}</strong></article><article class="card metric"><span>Beban subsidi voucher</span><strong>${money(voucher)}</strong></article><article class="card metric"><span>Trip selesai</span><strong>${filtered.length}</strong></article>`;
    container.querySelector("#ledger-table").innerHTML = filtered.length ? `<div class="table-wrap"><table><thead><tr><th>ID Order</th><th>Layanan</th><th>Omzet / GMV</th><th>Hak Driver</th><th>Hak Toko</th><th>Komisi owner</th><th>Subsidi voucher</th><th>Status pencairan</th></tr></thead><tbody>${filtered.map(order => {
      const ledger = order.financialLedger || {};
      const ownerCommission = (ledger.platformGross || 0) - (order.pricingBreakdown?.platformFee || 1000);
      return `<tr><td>${order.id}</td><td>${order.serviceType}</td><td>${money(order.pricingBreakdown?.totalCustomerPay)}</td><td>${money(ledger.driverNet)}</td><td>${money(ledger.merchantNet)}</td><td>${money(ownerCommission + (order.pricingBreakdown?.platformFee || 1000))}</td><td>${money(ledger.voucherExpense)}</td><td><span class="badge badge-success">Selesai</span></td></tr>`;
    }).join("")}</tbody></table></div>` : `<div class="empty-state">Tidak ada transaksi selesai pada rentang waktu ini.</div>`;
  };
  range.addEventListener("change", refresh);
  container.querySelectorAll("#custom-dates input").forEach(input => input.addEventListener("change", refresh));
  refresh();
}
