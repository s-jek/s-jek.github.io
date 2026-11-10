import { DEFAULT_TARIFFS } from "./pricingService.js";
import { initializeFirebase } from "../config/firebase-config.js";

const SETTLEMENT_COLLECTION = "driverSettlements";

export class FinanceService {
  static calculateDriverSettlementStatus(orders, settlements, tariffs = DEFAULT_TARIFFS) {
    const completed = orders.filter(order => order.orderStatus === "COMPLETED");
    const split = order => {
      const fare = Number(order.pricingBreakdown?.deliveryFare) || 0;
      const subtotal = Number(order.pricingBreakdown?.subtotalFood) || 0;
      return {
        driverCommission: Number.isFinite(order.financialLedger?.driverCommission)
          ? order.financialLedger.driverCommission
          : Number.isFinite(order.financialLedger?.driverNet)
            ? Math.max(0, fare - order.financialLedger.driverNet)
            : Math.round(fare * (order.pricingBreakdown?.driverCommissionPct ?? tariffs.driverCommissionPct ?? 0) / 100),
        merchantCommission: Number.isFinite(order.financialLedger?.merchantCommission)
          ? order.financialLedger.merchantCommission
          : order.serviceType !== "SFOOD" ? 0
            : Number.isFinite(order.financialLedger?.merchantNet)
              ? Math.max(0, subtotal - order.financialLedger.merchantNet)
              : Math.round(subtotal * (order.pricingBreakdown?.merchantCommissionPct ?? tariffs.merchantCommissionPct ?? 0) / 100),
        platformFee: Number(order.pricingBreakdown?.platformFee) || 0
      };
    };
    const grossDue = completed.reduce((total, order) => {
      const part = split(order);
      return total + part.driverCommission + part.merchantCommission + part.platformFee;
    }, 0);
    const approvedSettlements = settlements.filter(item => item.status === "APPROVED");
    const dueByType = completed.reduce((total, order) => {
      const part = split(order);
      total.driverCommission += part.driverCommission;
      total.merchantCommission += part.merchantCommission;
      total.platformFee += part.platformFee;
      return total;
    }, { driverCommission: 0, merchantCommission: 0, platformFee: 0 });
    for (const settlement of approvedSettlements) {
      dueByType.driverCommission -= Number(settlement.driverCommission) || 0;
      dueByType.merchantCommission -= Number(settlement.merchantCommission) || 0;
      dueByType.platformFee -= Number(settlement.platformFee) || 0;
    }
    for (const key of Object.keys(dueByType)) dueByType[key] = Math.max(0, dueByType[key]);
    const settled = approvedSettlements.reduce((total, item) => total + (Number(item.amount) || 0), 0);
    const outstanding = Math.max(0, grossDue - settled);
    const sortedOrders = [...completed].sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    let remainingSettled = settled;
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const overdue = sortedOrders.some(order => {
      const part = split(order);
      const orderDue = part.driverCommission + part.merchantCommission + part.platformFee;
      const unpaid = Math.max(0, orderDue - remainingSettled);
      remainingSettled = Math.max(0, remainingSettled - orderDue);
      return new Date(order.updatedAt).getTime() <= cutoff && unpaid > 0;
    });
    const deposit = Number(tariffs.driverDeposit) || 0;
    return {
      dueByType,
      outstanding,
      overdue,
      blockedByFinance: overdue || (deposit > 0 && outstanding >= deposit),
      deposit
    };
  }

  static async listDriverSettlements(driverUid) {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Firebase belum siap untuk memuat data setoran.");
    const { collection, getDocs, query, where } = firebase.firestoreSdk;
    const reference = collection(firebase.db, SETTLEMENT_COLLECTION);
    const snapshot = await getDocs(driverUid
      ? query(reference, where("driverUid", "==", driverUid))
      : query(reference));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static async submitDriverSettlement(driverUid, breakdown) {
    const firebase = await initializeFirebase();
    if (!firebase || firebase.auth.currentUser?.uid !== driverUid) {
      throw new Error("Sesi driver tidak tersedia.");
    }
    const amounts = ["driverCommission", "merchantCommission", "platformFee"]
      .map(key => Number(breakdown[key]));
    if (amounts.some(value => !Number.isFinite(value) || value < 0)) {
      throw new Error("Rincian setoran tidak valid.");
    }
    const amount = amounts.reduce((sum, value) => sum + value, 0);
    if (amount <= 0) throw new Error("Tidak ada setoran yang perlu diajukan.");
    const { addDoc, collection } = firebase.firestoreSdk;
    const record = {
      driverUid,
      amount,
      driverCommission: amounts[0],
      merchantCommission: amounts[1],
      platformFee: amounts[2],
      status: "PENDING",
      createdAt: new Date().toISOString()
    };
    const reference = await addDoc(collection(firebase.db, SETTLEMENT_COLLECTION), record);
    return { id: reference.id, ...record };
  }

  static async reviewDriverSettlement(settlementId, decision, reviewerUid) {
    if (!["APPROVED", "REJECTED"].includes(decision)) throw new Error("Keputusan setoran tidak valid.");
    const firebase = await initializeFirebase();
    if (!firebase || firebase.auth.currentUser?.uid !== reviewerUid) {
      throw new Error("Sesi admin tidak tersedia.");
    }
    const { doc, getDoc, updateDoc } = firebase.firestoreSdk;
    const reference = doc(firebase.db, SETTLEMENT_COLLECTION, settlementId);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists() || snapshot.data().status !== "PENDING") {
      throw new Error("Setoran tidak ditemukan atau sudah ditinjau.");
    }
    await updateDoc(reference, {
      status: decision,
      reviewedBy: reviewerUid,
      reviewedAt: new Date().toISOString()
    });
  }

  static async listPartnerAccounts() {
    const firebase = await initializeFirebase();
    if (!firebase) throw new Error("Firebase belum siap untuk memuat data mitra.");
    const { collection, getDocs, query, where } = firebase.firestoreSdk;
    const snapshot = await getDocs(query(collection(firebase.db, "users"), where("partnerRoles", "array-contains-any", ["driver", "merchant"])));
    return snapshot.docs.map(item => ({ uid: item.id, ...item.data() }));
  }

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
