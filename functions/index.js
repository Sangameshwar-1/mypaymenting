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
    if (typeof pin !== "string" || !/^\d{6,12}$/.test(pin)) {
      throw new HttpsError("invalid-argument", "Enter a 6–12 digit PIN.");
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
      const people = credentials.people || {};
      // Person IDs are server-side keys; they are never supplied by the client.
      for (const [personId, credential] of Object.entries(people)) {
        if (await verifyPin(pin, credential)) {
          claims = { personId };
          break;
        }
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
