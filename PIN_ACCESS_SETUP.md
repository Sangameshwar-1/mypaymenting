# Secure PIN access — deployment guide

## Data-preserving design

This implementation uses the existing Realtime Database structure. **Do not run `scripts/migrate-ledgers.js` and do not copy, move, or delete existing transactions.** Transactions remain at `mypayments/transactions/{transactionId}`; people remain at `mypayments/people/{personId}`.

- Admin PIN: access and manage all people and transactions.
- Personal PIN: read-only access to the person's own profile and transactions.
- PINs are verified by a trusted Firebase Cloud Function. Personal transaction data is filtered on the server, not in browser JavaScript.
- The browser never receives PIN hashes. The admin can use **Set PIN** to create or reset a person's PIN.
- The legacy shared transaction path is readable/writable directly only by an authenticated admin. Personal sessions retrieve their filtered records through `getPersonTransactions`.

## Important status

The client and Cloud Functions source in this branch are proposed code. They have not been deployed to Firebase. The Firebase database and rules must remain unchanged until you review and test the implementation. GitHub Pages deployment alone does not activate the callable functions.

## Firebase setup

1. Export a backup from Firebase Console for project `blood-7b054` before making any Firebase changes. This is a precaution; the proposed code does not perform a data migration.
2. Confirm Firebase Authentication and Realtime Database are enabled. PIN login uses Firebase custom tokens.
3. Check that the Firebase project has the billing plan required for Cloud Functions.
4. Clone this repository and check out the reviewed branch. Install the Firebase CLI and authenticate with an account authorized to deploy Functions and Database Rules.
5. Run `npm install --prefix functions`.
6. Run `node scripts/create-pin-credentials.js` in a local interactive terminal. Enter the admin PIN `1991` only in that terminal when prompted. The script stores a salted scrypt hash in an ignored local file; never commit or share the PIN, hash file, or service-account key.
7. Configure the JSON contents as the Firebase Secret Manager secret named `PIN_CREDENTIALS`. Expected shape: `{ "admin": { "salt": "...", "hash": "..." } }`.
8. Review the function code and deployment diff. Then deploy the callable functions: `firebase deploy --only functions:loginWithPin,functions:setPersonPin,functions:getPersonTransactions`.
9. Publish the reviewed client to GitHub Pages.
10. Log in with the admin PIN and use **Set PIN** beside each person. Personal PINs must be 4–12 digits, unique, and different from the admin PIN. Share them privately.
11. Deploy the reviewed Realtime Database rules with `firebase deploy --only database`. This changes access permissions, not transaction records. Do not deploy rules from a different branch or older version. Keep your exported rules backup so you can restore the previous access configuration if needed.
12. Test with the admin PIN and at least two personal PINs after the rules are deployed. Confirm each personal login sees only its own transactions, direct reads of the shared transactions path are denied to personal users, personal writes are denied, and the admin can still view and edit all existing records. If any check fails, stop using the site and restore the prior rules configuration while troubleshooting.

## Data layout (unchanged)

- `mypayments/people/{personId}`: existing person profiles.
- `mypayments/transactions/{transactionId}`: existing shared transaction records. This remains the canonical transaction collection; records are not migrated.
- `security/pinCredentials/people/{personId}`: salted hashes for personal PINs, written by the trusted function. This is separate from payment records.

## Security notes

- Realtime Database rules must enforce access; hiding other people's rows in JavaScript is not secure.
- The `getPersonTransactions` function uses the authenticated person's claim to filter the existing shared transaction collection. It ignores a caller-supplied person ID for personal sessions.
- PINs and service-account keys must never be committed to GitHub or pasted into chat.
- The login function rate-limits repeated failures by source IP. Four-digit PINs are weak, so protect the admin PIN and consider enabling Firebase App Check and monitoring function usage.
- No Firebase deployment or database modification is performed by this guide.
