#!/usr/bin/env node
// Run locally in a terminal. Never commit the generated credentials JSON or share PINs.
const crypto = require("node:crypto");
const fs = require("node:fs");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const seenPins = new Set();

function ask(prompt, hidden = false) {
  process.stdout.write(prompt);
  if (!process.stdin.isTTY) return Promise.reject(new Error("Run this utility in an interactive terminal."));
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\u0003") {
          process.stdin.off("data", onData);
          process.stdin.setRawMode(false);
          process.exit(1);
        }
        if (ch === "\r" || ch === "\n") {
          process.stdin.off("data", onData);
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          if (!hidden) process.stdout.write("\b \b");
        } else if (/^\d$/.test(ch) || (!hidden && ch.length === 1 && ch >= " ")) {
          value += ch;
          if (!hidden) process.stdout.write(ch);
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

async function makeCredential(label) {
  const pin = await ask(`${label} PIN (4–12 digits, input hidden): `, true);
  if (!/^\d{4,12}$/.test(pin)) throw new Error("PIN must contain 4–12 digits.");
  if (seenPins.has(pin)) throw new Error("PINs must be unique; choose a different PIN.");
  seenPins.add(pin);
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(pin, salt, 64)).toString("hex");
  return { salt, hash };
}

(async () => {
  const credentials = { admin: await makeCredential("Admin") };
  const output = "pin-credentials.local.json";
  fs.writeFileSync(output, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: "wx" });
  console.log(`Created ${output}. It contains hashes only. Do not commit or share it.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
