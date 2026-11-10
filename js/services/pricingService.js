export const DEFAULT_TARIFFS = Object.freeze({
  ojek: { baseKm: 2, baseFare: 7000, perKm: 2000 },
  ssend: { baseKm: 2, baseFare: 8000, perKm: 2500 },
  sfood: { baseKm: 2, baseFare: 7000, perKm: 2000 },
  platformFee: 1000,
  driverCommissionPct: 15,
  merchantCommissionPct: 20
});

export class PricingService {
  static calculateDeliveryFare(serviceType, distanceKm, tariffRules = DEFAULT_TARIFFS) {
    const rules = serviceType === "SSEND"
      ? tariffRules.ssend
      : serviceType === "OJEK"
        ? tariffRules.ojek || DEFAULT_TARIFFS.ojek
        : tariffRules.sfood;
    const distance = Math.max(0, Number(distanceKm) || 0);
    if (distance <= rules.baseKm) return rules.baseFare;
    return rules.baseFare + Math.ceil(distance - rules.baseKm) * rules.perKm;
  }

  static applyVoucher(voucher, subtotal, deliveryFare) {
    if (!voucher || !voucher.isActive) return { discountAmount: 0, isValid: false, reason: "Voucher tidak aktif" };
    if (voucher.validUntil && new Date(voucher.validUntil).setHours(23, 59, 59, 999) < Date.now()) {
      return { discountAmount: 0, isValid: false, reason: "Voucher sudah kedaluwarsa" };
    }
    if (Number.isFinite(voucher.quota) && voucher.quota > 0 && (voucher.usedCount || 0) >= voucher.quota) {
      return { discountAmount: 0, isValid: false, reason: "Kuota voucher telah habis" };
    }
    const targetAmount = voucher.target === "DELIVERY" ? deliveryFare : subtotal;
    if (targetAmount < (voucher.minSpend || 0)) {
      return { discountAmount: 0, isValid: false, reason: `Minimal transaksi Rp ${(voucher.minSpend || 0).toLocaleString("id-ID")}` };
    }
    let discount = 0;
    if (voucher.type === "PERCENT") {
      discount = (targetAmount * voucher.value) / 100;
      if (voucher.maxDiscount && discount > voucher.maxDiscount) discount = voucher.maxDiscount;
    } else if (voucher.type === "FIXED") {
      discount = voucher.value;
    }
    discount = Math.min(Math.max(0, discount), targetAmount);
    return { discountAmount: Math.round(discount), isValid: true, reason: "Voucher berhasil diterapkan" };
  }
}
