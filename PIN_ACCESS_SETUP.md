# Firebase-only email/password access (free Spark plan)

This branch replaces PIN/Cloud Functions login with Firebase Authentication email/password sign-in. It is designed to keep the current Realtime Database records in place.

## Important: do not deploy blindly

**No Firebase changes have been deployed by this repository change.** The current live site and database remain unchanged until you review and deploy the code/rules. Export a backup of the Realtime Database and current rules before changing rules.

## What stays unchanged

- Existing people: `mypayments/people/{personId}`
- Existing transactions: `mypayments/transactions/{transactionId}`
- No migration, copying, or deletion of transaction records.
- GitHub Pages remains the frontend host.
- Firebase Authentication and Realtime Database are the only application backend services.

## One-time Firebase Console setup

1. In Firebase Console for project `blood-7b054`, open **Authentication → Sign-in method** and enable **Email/Password**.
2. Open **Authentication → Users**. Create one account for the admin and one account for each person who needs access. Use unique email addresses and strong passwords. Do not reuse the admin password.
3. For each created account, copy its **UID** from Authentication → Users.
4. Open **Realtime Database → Data**. Add role mappings under `security/access`:
   - Admin UID: `security/access/ADMIN_UID/admin = true`
   - Person UID: `security/access/PERSON_UID/personId = "EXACT_EXISTING_PERSON_ID"`
   Use the existing person ID from `mypayments/people`; do not create a new person or move any payment records.
5. Keep the `security/access` mapping private. The supplied rules allow users to read only their own mapping; they cannot edit role mappings through the app.
6. Before deploying rules, verify that every personal UID maps to exactly one existing person ID, and that only the admin UID has `admin: true`.

## Deploying the database rules

Install Firebase CLI and sign in with an account that can administer project `blood-7b054`. From the repository root, review `database.rules.json` and run:

```bash
firebase deploy --only database --project blood-7b054
```

This deploys access rules only; it does not change data. Do not run any migration script. If any rule test fails, restore your exported previous rules and stop using the app until access is fixed.

## Verify before normal use

1. Sign in as admin. Confirm the admin can list people and all existing transactions, add/edit/delete transactions, and edit people.
2. Sign in as person A. Confirm only person A's profile and transactions are returned.
3. Try person B's ledger URL while signed in as person A; it must not reveal person B's profile or transactions.
4. Sign in as person B and repeat.
5. Confirm personal accounts cannot write people or transactions and cannot read the entire transactions collection.
6. Sign out and confirm the app returns to the login screen.

## Limitations

- This approach removes the old PIN interface. Users sign in with Firebase email/password.
- Create/reset accounts in Firebase Console; this frontend does not create or reset Auth users.
- Do not share the admin credentials. Do not make `mypayments/transactions` publicly readable.
- Firebase Realtime Database rules must be deployed and tested before assuming isolation is active. The existing Cloud Functions files are no longer used by the email/password frontend but are left in the repository for now.
