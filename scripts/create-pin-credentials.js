#!/usr/bin/env node
// Run locally. Never commit the generated credentials JSON or enter PINs in chat.
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const scrypt = promisify(crypto.scrypt);

async function hidden(prompt) {
  stdout.write(prompt);
  stdin.setRawMode?.(true);
  let value = "";
  return new Promise((resolve) => {
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\r" || key === "\n") {
        stdin.off("data", onData);
        stdin.setRawMode?.(false);
        stdout.write("\n");
        resolve(value);
      } else if (key === "\u0003") {
        process.exit(1);
      } else if (key === "\u007f" || key === "\b") {
        value = value.slice(0, -1);
      } else if (/^\d$/.test(key)) {
        value += key;
      }
    };
    stdin.on("data", onData);
  });
}

async function makeCredential(label) {
  const pin = await hidden(`${label} PIN (6–12 digits): `);
  if (!/^\d{6,12}$/.test(pin)) throw new Error("PIN must contain 6–12 digits.");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(pin, salt, 64)).toString("hex");
  return { salt, hash };
}

(async () => {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const credentials = { admin: await makeCredential("Admin"), people: {} };
    const countText = await rl.question("How many people need PINs? ");
    const count = Number(countText);
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("Enter a count from 1 to 500.");
    for (let i = 0; i < count; i++) {
      const personId = (await rl.question(`Person #${i + 1} database ID (not display name): `)).trim();
      if (!personId || /[.#$\[\]/]/.test(personId) || credentials.people[personId]) throw new Error("Invalid or duplicate person ID.");
      credentials.people[personId] = await makeCredential(`Person ${personId}`);
    }
    const fs = require("node:fs");
    const output = "pin-credentials.local.json";
    fs.writeFileSync(output, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: "wx" });
    console.log(`Created ${output}. Do not commit or share it. Set it as the PIN_CREDENTIALS Firebase secret using the setup guide.`);
  } finally {
    rl.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
