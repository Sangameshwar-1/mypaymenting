# Secure PIN access — deployment guide

## Intended behavior

- Admin PIN: read and manage all people and all ledgers.
- Each personal PIN: read-only access to exactly one person's ledger and their own person record.
- No email/password account form; PINs are verified by a trusted Firebase Cloud Function.
- The browser never receives the PIN list or PIN hashes.

## Important: this branch is not live yet

The implementation is on `feature/secure-pin-access`. Do not deploy the new database rules until the migration is complete and this version of the client is published. The current live client signs in anonymously and will be denied by the new rules.

## Firebase setup

1. In the Firebase Console for project `blood-7b054`, export/backup Realtime Database data before any change.
2. Confirm Firebase Authentication is enabled. The PIN login uses Firebase custom tokens; it does not need Anonymous sign-in.
3. Firebase Functions deployment may require the project's Blaze billing plan. Check billing before deployment.
4. Install Firebase CLI locally and log in with an account that can deploy Functions and Database Rules.
5. From a local clone of this branch, run `npm install --prefix functions`.
6. Run `node scripts/create-pin-credentials.js` in a local interactive terminal. It asks for the admin PIN, then each person's **database ID** and personal PIN. PIN entry is hidden. Choose unique 6–12 digit PINs. Do not paste real PINs into GitHub or chat.
7. The utility writes `pin-credentials.local.json`. This file is ignored by Git. Keep it private and do not upload or commit it.
8. Set the JSON file contents as the Firebase Secret Manager secret named `PIN_CREDENTIALS` using the Firebase CLI's secret-setting prompt. The JSON shape is `{ "admin": { "salt": "...", "hash": "..." }, "people": { "PERSON_DATABASE_ID": { "salt": "...", "hash": "..." } } }`. The utility stores only salted scrypt hashes, not the original PINs.
9. Dry-run the ledger migration with a service account that has database admin access:
   `GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json node scripts/migrate-ledgers.js`
   Review the generated local backup and per-person counts. The script stops if a transaction references an unknown person ID or a ledger already exists.
10. After reviewing the backup and dry-run output, run the same command with `--apply`. It copies each existing transaction to `mypayments/ledgers/{personId}/transactions/{transactionId}` and leaves the old records intact.
11. Deploy the function first: `firebase deploy --only functions:loginWithPin`.
12. Test PIN login in a non-production test session. Verify a personal token has only the `personId` claim and admin has only `admin: true`.
13. Publish the updated client and only then deploy `database.rules.json`: `firebase deploy --only database`. The rules deny personal reads of the legacy shared transactions collection and grant access to only the authenticated person's ledger.
14. Test with two different personal PINs and the admin PIN. For each person, directly attempt to read a different person's `mypayments/ledgers/OTHER_ID` path in the Firebase SDK; it must return permission denied. Also test that signed-out access is denied.

## Database layout after migration

- `mypayments/people/{personId}`: person's profile; admin can read all, person can read only their own profile.
- `mypayments/ledgers/{personId}/transactions/{transactionId}`: isolated per-person ledger. Personal sessions can read their own ledger but cannot write transactions.
- `mypayments/transactions`: legacy data is retained for recovery but inaccessible to personal sessions. Delete it only after verified backups and testing.

## Security notes

- Realtime Database rules enforce privacy; hiding other people's rows in JavaScript alone is not security.
- PIN hashes and the admin SDK service-account key must never be committed.
- The function rate-limits repeated failures by source IP. For stronger protection, enable Firebase App Check and monitor authentication/function abuse.
- This branch has not been deployed or tested against the live database. Do not use real PINs until deployment and cross-account tests are complete.
