# Secure PIN access — implementation notes

## Required behavior
- Admin PIN: can read and manage every person's ledger.
- Personal PIN: can read only the ledger belonging to the mapped person ID.
- No email/password form is shown to users. A PIN is the only visible sign-in step.

## Security requirement
Do not implement PIN verification only in browser JavaScript. GitHub Pages serves its source publicly, so embedded PINs, hashes, and client-side role checks can be inspected or bypassed. Firebase Realtime Database must enforce access independently.

## Required architecture
1. Verify PINs in a trusted server environment (Firebase Cloud Functions or another server).
2. Store only salted PIN hashes; never commit PINs or hashes to this repository.
3. After successful PIN verification, issue a Firebase custom token with a server-assigned `personId` claim, or an `admin` claim.
4. Move transactions into per-person database paths (for example `mypayments/ledgers/{personId}/transactions`) so Realtime Database rules can enforce per-person access. Rules cannot securely filter a shared transaction collection by each record's `personId`.
5. Add and deploy restrictive Realtime Database rules before deploying the new client.
6. Migrate existing `mypayments/people` and `mypayments/transactions` data with a backup first, then test personal and admin access using separate sessions.

## Before deployment
- Back up the current Realtime Database.
- Configure the Firebase project for Cloud Functions and custom authentication.
- Set PIN hashes through a trusted admin-only setup process or server secrets.
- Test that a personal session cannot read another person's ledger by directly requesting its database path.
- Test that an unauthenticated session cannot read or write any payment data.

This file is a security checklist, not a deployed access-control implementation. Do not enter real payment data under a client-only PIN gate.
