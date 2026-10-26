const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const crypto = require("node:crypto");
const { promisify } = require("node:util");

initializeApp();
const PIN_CREDENTIALS = defineSecret("PIN_CREDENTIALS");
const scrypt = promisify(crypto.scrypt);
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

function safeEqualHex(left, right) {
  if (typeof left !== "string" || typeof right !== "string" ||
      !/^[a-f0-9]{128}$/i.test(left) || !/^[a-f0-9]{128}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function verifyPin(pin, credential) {
  if (!credential || typeof credential.salt !== "string" || typeof credential.hash !== "string") return false;
  const derived = await scrypt(pin, credential.salt, 64);
  return safeEqualHex(derived.toString("hex"), credential.hash);
}

function requestKey(request) {
  const ip = String(request.rawRequest?.ip || "unknown");
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

async function assertNotRateLimited(key) {
  const ref = getDatabase().ref("security/loginAttempts/" + key);
  const snap = await ref.get();
  const data = snap.val() || {};
  if (data.lockedUntil && data.lockedUntil > Date.now()) {
    throw new HttpsError("resource-exhausted", "Too many incorrect PIN attempts. Try again in 10 minutes.");
  }
}

async function recordFailure(key) {
  const ref = getDatabase().ref("security/loginAttempts/" + key);
  await ref.transaction((current) => {
    const now = Date.now();
    if (!current || now - Number(current.windowStart || 0) > WINDOW_MS) {
      current = { count: 0, windowStart: now, lockedUntil: 0 };
    }
    current.count = Number(current.count || 0) + 1;
    if (current.count >= MAX_ATTEMPTS) current.lockedUntil = now + WINDOW_MS;
    return current;
  });
}

async function clearFailures(key) {
  await getDatabase().ref("security/loginAttempts/" + key).remove();
}

exports.loginWithPin = onCall(
  { secrets: [PIN_CREDENTIALS], enforceAppCheck: false, maxInstances: 5 },
  async (request) => {
    const pin = request.data?.pin;
    if (typeof pin !== "string" || !/^\d{4,12}$/.test(pin)) {
      throw new HttpsError("invalid-argument", "Enter a 4–12 digit PIN.");
    }

    const key = requestKey(request);
    await assertNotRateLimited(key);

    let credentials;
    try {
      credentials = JSON.parse(PIN_CREDENTIALS.value());
    } catch {
      throw new HttpsError("internal", "PIN credentials are not configured correctly.");
    }

    let claims = null;
    if (await verifyPin(pin, credentials.admin)) {
      claims = { admin: true };
    } else {
      const peopleSnap = await getDatabase().ref("security/pinCredentials/people").get();
      const people = peopleSnap.val() || {};
      for (const [personId, credential] of Object.entries(people)) {
        if (await verifyPin(pin, credential)) { claims = { personId }; break; }
      }
    }

    if (!claims) {
      await recordFailure(key);
      throw new HttpsError("unauthenticated", "Incorrect PIN.");
    }

    await clearFailures(key);
    const uid = claims.admin ? "mypayments-admin" : "mypayments-person-" + claims.personId;
    const customToken = await getAuth().createCustomToken(uid, claims);
    return { token: customToken, role: claims.admin ? "admin" : "person" };
  }
);

// Reads the existing shared transaction collection without moving or copying records.
exports.getPersonTransactions = onCall(
  { enforceAppCheck: false, maxInstances: 5 },
  async (request) => {
    const claims = request.auth?.token;
    if (!claims || (claims.admin !== true && typeof claims.personId !== "string")) {
      throw new HttpsError("unauthenticated", "Sign in with your PIN first.");
    }

    const requestedPersonId = request.data?.personId;
    let personId;
    if (claims.admin === true) {
      if (typeof requestedPersonId !== "string" || !requestedPersonId ||
          [".", "#", "$", "[", "]", "/"].some(ch => requestedPersonId.includes(ch))) {
        throw new HttpsError("invalid-argument", "A valid person ID is required.");
      }
      personId = requestedPersonId;
    } else {
      // Never trust a person ID supplied by a personal session.
      personId = claims.personId;
    }

    const [personSnap, transactionsSnap] = await Promise.all([
      getDatabase().ref("mypayments/people/" + personId).get(),
      getDatabase().ref("mypayments/transactions").get()
    ]);
    if (!personSnap.exists()) throw new HttpsError("not-found", "Person not found.");

    const allTransactions = transactionsSnap.val() || {};
    const transactions = {};
    for (const [transactionId, transaction] of Object.entries(allTransactions)) {
      if (transaction && transaction.personId === personId) {
        transactions[transactionId] = transaction;
      }
    }
    return { personId, transactions };
  }
);

// Read the existing shared transaction collection without moving or copying records.
exports.getPersonTransactions = onCall(
  { enforceAppCheck: false, maxInstances: 5 },
  async (request) => {
    const claims = request.auth?.token;
    if (!claims || (claims.admin !== true && typeof claims.personId !== "string")) {
      throw new HttpsError("unauthenticated", "Sign in with your PIN first.");
    }

    const requestedPersonId = request.data?.personId;
    let personId;
    if (claims.admin === true) {
      if (typeof requestedPersonId !== "string" || !requestedPersonId ||
          [".", "#", "$", "[", "]", "/"].some(ch => requestedPersonId.includes(ch))) {
        throw new HttpsError("invalid-argument", "A valid person ID is required.");
      }
      personId = requestedPersonId;
    } else {
      // Never trust a person ID supplied by a personal session.
      personId = claims.personId;
    }

    const [personSnap, transactionsSnap] = await Promise.all([
      getDatabase().ref("mypayments/people/" + personId).get(),
      getDatabase().ref("mypayments/transactions").get()
    ]);
    if (!personSnap.exists()) throw new HttpsError("not-found", "Person not found.");

    const allTransactions = transactionsSnap.val() || {};
    const transactions = {};
    for (const [transactionId, transaction] of Object.entries(allTransactions)) {
      if (transaction && transaction.personId === personId) {
        transactions[transactionId] = transaction;
      }
    }
    return { personId, transactions };
  }
);

exports.setPersonPin = onCall(
  { secrets: [PIN_CREDENTIALS], enforceAppCheck: false, maxInstances: 5 },
  async (request) => {
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError("permission-denied", "Only the admin can change personal PINs.");
    }
    const personId = request.data?.personId;
    const pin = request.data?.pin;
    if (typeof personId !== "string" || !personId || [".", "#", "$", "[", "]", "/"].some(ch => personId.includes(ch))) {
      throw new HttpsError("invalid-argument", "Invalid person ID.");
    }
    if (typeof pin !== "string" || !/^\d{4,12}$/.test(pin)) {
      throw new HttpsError("invalid-argument", "Enter a 4–12 digit PIN.");
    }
    const credentials = JSON.parse(PIN_CREDENTIALS.value());
    if (await verifyPin(pin, credentials.admin)) {
      throw new HttpsError("invalid-argument", "A personal PIN must be different from the admin PIN.");
    }
    const personSnap = await getDatabase().ref("mypayments/people/" + personId).get();
    if (!personSnap.exists()) throw new HttpsError("not-found", "That person does not exist.");
    const existingSnap = await getDatabase().ref("security/pinCredentials/people").get();
    const existing = existingSnap.val() || {};
    for (const [otherId, credential] of Object.entries(existing)) {
      if (otherId !== personId && await verifyPin(pin, credential)) {
        throw new HttpsError("already-exists", "Each person must have a unique PIN.");
      }
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = (await scrypt(pin, salt, 64)).toString("hex");
    await getDatabase().ref("security/pinCredentials/people/" + personId).set({ salt, hash });
    return { success: true };
  }
);
