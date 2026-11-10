import { initializeFirebase } from "../config/firebase-config.js";

function getReviewRef(firebase, orderId, targetType) {
  return firebase.firestoreSdk.doc(firebase.db, "orders", orderId, "reviews", targetType);
}

export class ReviewService {
  static async getRating(targetUid, targetType) {
    const firebase = await initializeFirebase();
    if (!firebase || !targetUid) return { average: 0, count: 0, available: false };
    const { average, collectionGroup, count, getAggregateFromServer, query, where } = firebase.firestoreSdk;
    const aggregates = await getAggregateFromServer(query(
      collectionGroup(firebase.db, "reviews"),
      where("targetUid", "==", targetUid),
      where("targetType", "==", targetType),
      where("status", "==", "VISIBLE")
    ), {
      averageRating: average("stars"),
      totalReviews: count()
    });
    const result = aggregates.data();
    return {
      average: Number(result.averageRating) || 0,
      count: Number(result.totalReviews) || 0,
      available: true
    };
  }

  static async listForOrder(orderId) {
    const firebase = await initializeFirebase();
    if (!firebase) return [];
    const snapshot = await firebase.firestoreSdk.getDocs(
      firebase.firestoreSdk.collection(firebase.db, "orders", orderId, "reviews")
    );
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  }

  static async listAppealsForOrder(orderId, customerId) {
    const firebase = await initializeFirebase();
    if (!firebase || !customerId) return [];
    const { collection, getDocs, query, where } = firebase.firestoreSdk;
    const snapshot = await getDocs(query(
      collection(firebase.db, "reviewAppeals"),
      where("orderId", "==", orderId),
      where("customerId", "==", customerId)
    ));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  }

  static async submitReview(order, user, targetType, stars, comment, imageUrl = "") {
    const firebase = await initializeFirebase();
    if (!firebase || firebase.auth.currentUser?.uid !== user.uid) throw new Error("Masuk kembali untuk mengirim penilaian.");
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error("Pilih nilai bintang dari 1 sampai 5.");
    if (!["driver", "merchant"].includes(targetType)) throw new Error("Jenis penilaian tidak valid.");
    const targetUid = targetType === "driver" ? order.driverId : order.merchantId;
    if (!targetUid) throw new Error("Mitra yang dinilai tidak tersedia.");
    const normalizedComment = String(comment || "").trim();
    if (normalizedComment.length > 500) throw new Error("Ulasan maksimal 500 karakter.");
    const review = {
      targetType,
      targetUid,
      stars,
      comment: normalizedComment,
      imageUrl,
      status: "VISIBLE",
      createdAt: new Date().toISOString()
    };
    await firebase.firestoreSdk.setDoc(getReviewRef(firebase, order.id, targetType), review);
    return review;
  }

  static async submitAppeal(order, user, targetType, details, evidenceUrl) {
    const firebase = await initializeFirebase();
    if (!firebase || firebase.auth.currentUser?.uid !== user.uid) throw new Error("Masuk kembali untuk mengajukan banding.");
    if (!String(details || "").trim() || String(details).trim().length > 1000) {
      throw new Error("Jelaskan alasan banding (maksimal 1.000 karakter).");
    }
    if (!evidenceUrl) throw new Error("Unggah bukti pendukung untuk mengajukan banding.");
    const appealId = `${order.id}_${targetType}`;
    const appeal = {
      orderId: order.id,
      targetType,
      customerId: user.uid,
      details: String(details).trim(),
      evidenceUrl,
      status: "PENDING",
      createdAt: new Date().toISOString()
    };
    await firebase.firestoreSdk.setDoc(firebase.firestoreSdk.doc(firebase.db, "reviewAppeals", appealId), appeal);
    return appeal;
  }

  static async listPendingAppeals() {
    const firebase = await initializeFirebase();
    if (!firebase) return [];
    const { collection, getDocs, query, where } = firebase.firestoreSdk;
    const snapshot = await getDocs(query(collection(firebase.db, "reviewAppeals"), where("status", "==", "PENDING")));
    return Promise.all(snapshot.docs.map(async item => {
      const appeal = { id: item.id, ...item.data() };
      const reviewSnapshot = await firebase.firestoreSdk.getDoc(getReviewRef(firebase, appeal.orderId, appeal.targetType));
      return { ...appeal, review: reviewSnapshot.exists() ? reviewSnapshot.data() : null };
    }));
  }

  static async reviewAppeal(appeal, decision, adminUid, decisionDetails = "") {
    if (!["UPHELD", "REJECTED"].includes(decision)) throw new Error("Keputusan banding tidak valid.");
    const firebase = await initializeFirebase();
    if (!firebase || firebase.auth.currentUser?.uid !== adminUid) throw new Error("Sesi admin sudah berakhir.");
    const { doc, runTransaction } = firebase.firestoreSdk;
    const appealRef = doc(firebase.db, "reviewAppeals", appeal.id);
    const reviewRef = getReviewRef(firebase, appeal.orderId, appeal.targetType);
    await runTransaction(firebase.db, async transaction => {
      const [appealSnapshot, reviewSnapshot] = await Promise.all([
        transaction.get(appealRef), transaction.get(reviewRef)
      ]);
      if (!appealSnapshot.exists() || appealSnapshot.data().status !== "PENDING") {
        throw new Error("Banding ini sudah ditinjau.");
      }
      if (!reviewSnapshot.exists()) throw new Error("Ulasan terkait tidak ditemukan.");
      transaction.update(appealRef, {
        status: decision,
        decisionDetails: String(decisionDetails || "").trim().slice(0, 500),
        reviewedBy: adminUid,
        reviewedAt: new Date().toISOString()
      });
      if (decision === "UPHELD") transaction.update(reviewRef, { status: "HIDDEN" });
    });
  }
}
