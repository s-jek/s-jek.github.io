import { DEFAULT_TARIFFS } from "./pricingService.js";

export class FinanceService {
  static calculateSplitBreakdown({
    serviceType,
    subtotalFood = 0,
    deliveryFare = 0,
    voucherDiscount = 0,
    tariffs = DEFAULT_TARIFFS
  }) {
    const driverCommRate = (tariffs.driverCommissionPct ?? 15) / 100;
    const merchantCommRate = (tariffs.merchantCommissionPct ?? 20) / 100;
    const platformFee = tariffs.platformFee ?? 1000;
    const platformCutFromDriver = Math.round(deliveryFare * driverCommRate);
    const driverNetEarning = deliveryFare - platformCutFromDriver;
    let platformCutFromMerchant = 0;
    let merchantNetEarning = 0;
    if (serviceType === "SFOOD") {
      platformCutFromMerchant = Math.round(subtotalFood * merchantCommRate);
      merchantNetEarning = subtotalFood - platformCutFromMerchant;
    }
    const platformGrossProfit = platformCutFromDriver + platformCutFromMerchant + platformFee;
    const platformNetProfit = platformGrossProfit - voucherDiscount;
    return {
      transactionTotals: {
        customerTotalToPay: subtotalFood + deliveryFare + platformFee - voucherDiscount,
        rawSubtotalFood: subtotalFood,
        rawDeliveryFare: deliveryFare,
        platformFee,
        voucherDiscountUsed: voucherDiscount
      },
      driverLedger: { grossFare: deliveryFare, platformFeeDeducted: platformCutFromDriver, netDisbursement: driverNetEarning },
      merchantLedger: { grossSales: subtotalFood, platformCommissionDeducted: platformCutFromMerchant, netDisbursement: merchantNetEarning },
      ownerLedger: {
        fromDriverCommission: platformCutFromDriver,
        fromMerchantCommission: platformCutFromMerchant,
        fromPlatformFee: platformFee,
        voucherSubsidyExpense: voucherDiscount,
        netPlatformProfit: platformNetProfit
      }
    };
  }
}
