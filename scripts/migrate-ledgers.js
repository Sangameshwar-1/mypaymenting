#!/usr/bin/env node
// One-time copy from legacy shared transactions to per-person ledgers.
// Uses Application Default Credentials / GOOGLE_APPLICATION_CREDENTIALS.
// Always creates a local backup. Legacy data is intentionally not deleted.
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

const databaseURL = "https://blood-7b054-default-rtdb.firebaseio.com";
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath || !fs.existsSync(keyPath)) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service-account JSON file.");
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
initializeApp({ credential: cert(serviceAccount), databaseURL });
const db = getDatabase();

(async () => {
  const snapshot = await db.ref("mypayments").get();
  const root = snapshot.val() || {};
  const people = root.people || {};
  const transactions = root.transactions || {};
  const backup = {
    exportedAt: new Date().toISOString(),
    people,
    transactions,
    existingLedgers: root.ledgers || null
  };
  const backupPath = path.resolve("mypayments-backup-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), { flag: "wx", mode: 0o600 });

  const grouped = {};
  const missing = [];
  for (const [transactionId, transaction] of Object.entries(transactions)) {
    const personId = transaction?.personId;
    if (!personId || !people[personId]) {
      missing.push({ transactionId, personId: personId || null });
      continue;
    }
    grouped[personId] ||= {};
    grouped[personId][transactionId] = { ...transaction, personId };
  }
  if (missing.length) {
    console.error("Backup created at " + backupPath);
    console.error("Migration stopped: " + missing.length + " transaction(s) have missing/unknown personId. Resolve these first.");
    console.error(JSON.stringify(missing.slice(0, 30), null, 2));
    process.exit(2);
  }

  const existing = root.ledgers || {};
  for (const [personId, txs] of Object.entries(grouped)) {
    const oldCount = Object.keys(existing[personId]?.transactions || {}).length;
    const overlap = Object.keys(txs).some(id => existing[personId]?.transactions?.[id]);
    if (overlap || oldCount) {
      console.error("Existing ledger data found for person " + personId + ". Refusing to overwrite; inspect the backup and merge manually.");
      process.exit(3);
    }
  }
  const summary = Object.fromEntries(Object.entries(grouped).map(([id, txs]) => [id, Object.keys(txs).length]));
  console.log("Backup saved: " + backupPath);
  console.log("People: " + Object.keys(people).length + "; legacy transactions: " + Object.keys(transactions).length);
  console.log("Transactions by person: " + JSON.stringify(summary));
  if (!process.argv.includes("--apply")) {
    console.log("Dry run only. Review the backup and summary, then rerun with --apply to copy records.");
    return;
  }
  const updates = {};
  for (const [personId, txs] of Object.entries(grouped)) {
    updates["mypayments/ledgers/" + personId + "/transactions"] = txs;
  }
  await db.ref().update(updates);
  console.log("Migration copy complete. Legacy records were left unchanged.");
})().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
