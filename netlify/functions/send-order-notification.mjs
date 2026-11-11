import { createHash, randomUUID } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccount) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
  return initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
}

function jsonResponse(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "null",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    },
    body: JSON.stringify(body)
  };
}

function isAllowedOrigin(origin) {
  const configured = (process.env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  return configured.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
}

async function tokensForUsers(db, recipients) {
  const tokens = new Map();
  for (const recipient of recipients) {
    const { uid } = recipient;
    if (!uid) continue;
    const snapshot = await db.collection("users").doc(uid).collection("pushTokens").get();
    for (const device of snapshot.docs) {
      const value = device.data().token;
      if (typeof value === "string" && value.length > 20 && !tokens.has(value)) {
        tokens.set(value, { ...recipient, token: value });
      }
    }
  }
  return [...tokens.values()];
}

async function recipientsFor(db, order, eventType) {
  if (eventType === "order-created") {
    const drivers = await db.collection("users").where("partnerRoles", "array-contains", "driver").get();
    return drivers.docs.map(user => ({ uid: user.id, url: "#/driver/orders" }));
  }
  if (eventType === "order-accepted") {
    const recipients = [{
      uid: order.customerId,
      url: `#/customer/tracking?order=${encodeURIComponent(order.id)}`
    }];
    if (order.merchantId) {
      const merchant = await db.collection("merchants").doc(order.merchantId).get();
      const ownerUid = merchant.data()?.ownerUid;
      if (ownerUid) recipients.push({ uid: ownerUid, url: "#/merchant/orders" });
    }
    return recipients;
  }
  if (eventType === "merchant-accepted") {
    return [{
      uid: order.customerId,
      url: `#/customer/tracking?order=${encodeURIComponent(order.id)}`
    }];
  }
  return [{
    uid: order.customerId,
    url: `/#/customer/tracking?order=${encodeURIComponent(order.id)}`
  }];
}

async function eventIsValid(db, order, eventType, uid) {
  if (eventType === "order-created") return order.customerId === uid
    && order.orderStatus === "PENDING" && !order.driverId;
  if (eventType === "order-accepted") {
    if (order.driverId !== uid
      || !["ACCEPTED", "PROCESSING", "ON_THE_WAY", "COMPLETED"].includes(order.orderStatus)) return false;
    const driver = await db.collection("users").doc(uid).get();
    return driver.data()?.partnerRoles?.includes("driver") === true;
  }
  if (eventType === "merchant-accepted") {
    if (order.merchantStatus !== "ACCEPTED"
      || !["ACCEPTED", "PROCESSING", "ON_THE_WAY", "COMPLETED"].includes(order.orderStatus)
      || !order.merchantId) return false;
    const [merchant, user] = await Promise.all([
      db.collection("merchants").doc(order.merchantId).get(),
      db.collection("users").doc(uid).get()
    ]);
    return merchant.data()?.ownerUid === uid && user.data()?.partnerRoles?.includes("merchant") === true;
  }
  if (eventType === "order-completed") return order.driverId === uid && order.orderStatus === "COMPLETED";
  return false;
}

function eventMessage(eventType, order) {
  if (eventType === "order-created") return {
    title: "Pesanan kurir baru",
    body: "Ada pesanan baru. Buka aplikasi untuk melihat detail.",
    url: "#/driver/orders"
  };
  if (eventType === "order-accepted") return {
    title: "Pesanan diterima",
    body: "Kurir telah menerima pesanan Anda.",
    url: `#/customer/tracking?order=${encodeURIComponent(order.id)}`
  };
  if (eventType === "merchant-accepted") return {
    title: "Pesanan diterima toko",
    body: "Toko mulai menyiapkan pesanan Anda.",
    url: `#/customer/tracking?order=${encodeURIComponent(order.id)}`
  };
  return {
    title: "Pesanan selesai",
    body: "Pesanan Anda telah selesai.",
    url: `#/customer/tracking?order=${encodeURIComponent(order.id)}`
  };
}

export const handler = async event => {
  const origin = event.headers.origin || event.headers.Origin || "";
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {}, isAllowedOrigin(origin) ? origin : "null");
  }
  if (!isAllowedOrigin(origin)) return jsonResponse(403, { error: "Origin is not allowed." }, "null");
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed." }, origin);
  const authorization = event.headers.authorization || event.headers.Authorization || "";
  if (!authorization.startsWith("Bearer ")) return jsonResponse(401, { error: "Sign-in required." }, origin);

  let releaseClaim;
  try {
    const app = getAdminApp();
    const uidToken = await getAuth(app).verifyIdToken(authorization.slice(7));
    if (uidToken.email_verified !== true
      || !/^[a-z0-9._%+-]+@gmail\.com$/i.test(uidToken.email || "")
      || uidToken.firebase?.sign_in_provider !== "google.com") {
      return jsonResponse(403, { error: "Verified Google Gmail account required." }, origin);
    }
    const input = JSON.parse(event.body || "{}");
    const orderId = typeof input.orderId === "string" ? input.orderId : "";
    const eventType = input.eventType;
    const eventTypes = new Set(["order-created", "order-accepted", "merchant-accepted", "order-completed"]);
    if (!orderId || orderId.length > 128 || !eventTypes.has(eventType)) {
      return jsonResponse(400, { error: "Invalid order notification request." }, origin);
    }

    const db = getFirestore(app);
    const orderSnapshot = await db.collection("orders").doc(orderId).get();
    if (!orderSnapshot.exists) return jsonResponse(404, { error: "Order not found." }, origin);
    const order = { id: orderSnapshot.id, ...orderSnapshot.data() };
    if (!await eventIsValid(db, order, eventType, uidToken.uid)) {
      return jsonResponse(403, { error: "Not authorized for this order event." }, origin);
    }

    const eventKey = createHash("sha256").update(`${orderId}:${eventType}`).digest("hex");
    const eventRef = db.collection("notificationEvents").doc(eventKey);
    const claimId = randomUUID();
    const claim = await db.runTransaction(async transaction => {
      const previous = await transaction.get(eventRef);
      if (previous.exists) {
        const existing = previous.data();
        if (existing.status === "SENT" || Date.now() - existing.startedAt < 120000) return false;
        transaction.update(eventRef, {
          status: "SENDING",
          startedAt: Date.now(),
          claimId,
          actorUid: uidToken.uid
        });
        return true;
      }
      transaction.create(eventRef, {
        orderId,
        eventType,
        status: "SENDING",
        startedAt: Date.now(),
        claimId,
        actorUid: uidToken.uid
      });
      return true;
    });
    if (!claim) return jsonResponse(200, { sent: 0, duplicate: true }, origin);
    releaseClaim = async () => {
      const current = await eventRef.get();
      if (current.exists && current.data().claimId === claimId) await eventRef.delete();
    };

    const recipients = await recipientsFor(db, order, eventType);
    const tokens = await tokensForUsers(db, recipients);
    if (!tokens.length) {
      await eventRef.update({ status: "SENT", sent: 0, completedAt: Date.now() });
      return jsonResponse(200, { sent: 0 }, origin);
    }

    const notification = eventMessage(eventType, order);
    let sent = 0;
    const invalidTokens = [];
    const urls = new Map();
    for (const device of tokens) {
      if (!urls.has(device.url)) urls.set(device.url, []);
      urls.get(device.url).push(device.token);
    }
    for (const [url, recipientTokens] of urls) {
      for (let index = 0; index < recipientTokens.length; index += 500) {
        let pendingTokens = recipientTokens.slice(index, index + 500);
        for (let attempt = 0; pendingTokens.length && attempt < 3; attempt += 1) {
          const batch = pendingTokens;
          const result = await getMessaging(app).sendEachForMulticast({
            tokens: batch,
            android: {
              priority: "high",
              notification: {
                title: notification.title,
                body: notification.body,
                color: "#00880C"
              }
            },
            data: {
              title: notification.title,
              body: notification.body,
              orderId,
              eventType,
              url: url || notification.url
            },
            webpush: { headers: { TTL: "300" } }
          });
          sent += result.successCount;
          pendingTokens = [];
          result.responses.forEach((response, responseIndex) => {
            if (response.success) return;
            if (["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(response.error?.code)) {
              invalidTokens.push(batch[responseIndex]);
              return;
            }
            pendingTokens.push(batch[responseIndex]);
          });
          if (pendingTokens.length && attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));
        }
        if (pendingTokens.length) throw new Error("Some push notifications failed after retries.");
      }
    }
    if (invalidTokens.length) {
      const invalid = new Set(invalidTokens);
      const devices = await db.collectionGroup("pushTokens").get();
      const batch = db.batch();
      devices.docs.filter(device => invalid.has(device.data().token))
        .forEach(device => batch.delete(device.ref));
      if (devices.docs.some(device => invalid.has(device.data().token))) await batch.commit();
    }
    if (sent === 0) throw new Error("No push notification was delivered.");
    await eventRef.update({ status: "SENT", sent, completedAt: Date.now() });
    return jsonResponse(200, { sent }, origin);
  } catch (error) {
    try {
      await releaseClaim?.();
    } catch (cleanupError) {
      console.error("Could not release failed notification claim.", cleanupError);
    }
    console.error("Order notification failed.", error);
    return jsonResponse(500, { error: "Notification could not be sent." }, origin);
  }
};
