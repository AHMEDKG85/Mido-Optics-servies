---
name: firebase-backend
description: Implement or maintain Firebase Authentication, Cloud Firestore, Storage, Cloud Functions, security rules, synchronization, and recovery for MIDO OPTICS.
---

# Firebase Backend

Use this skill for Firebase-specific backend work. Before proposing changes, inspect the repository for its current backend, auth provider, database, data model, deployment configuration, and tests. Reuse and extend a working architecture when appropriate. Do not add Firebase as a second backend or replace an existing system without a concrete reason and a migration plan. If no backend exists, choose Firebase only when it fits the requested scope and project constraints.

The supplied source snapshot initializes the primary Firebase app in `src/lib/firebase.ts` with Google sign-in, Firestore, and persistent local cache. It also initializes a separately named storefront app/database in `src/lib/storefrontFirebase.ts`; the Express server in `server.ts` handles webhook/proxy flows. The archive includes `firestore.rules`, but no Firebase Storage or Cloud Functions setup. Confirm which app/database and rules deployment a task targets before changing data or configuration. Firebase web app configuration is public client configuration, not a service-account credential; keep privileged credentials and sync secrets server-side.

## Design and implementation

- Define the data model and trusted ownership of each field before changing reads or writes. Keep product, variant, cart, order, payment, and invoice identifiers consistent across frontend and backend.
- Use Firebase Authentication for identity, but enforce customer, employee, and administrator permissions in Firestore rules or trusted server code. A role or user ID supplied by the browser is not authorization.
- Use Cloud Firestore transactions or batched writes for operations that must succeed together, such as order creation and inventory changes. Make retryable operations idempotent and handle transaction conflicts explicitly.
- Design real-time listeners with loading, stale data, permission errors, disconnection, and cleanup behavior. For offline writes and reconnects, define conflict resolution and canonical server reconciliation; do not blindly overwrite newer inventory, order status, or payment state.
- Restrict Storage paths and metadata by authenticated owner, resource type, and expected content. Validate uploads and do not treat obscure paths as access control.
- Put privileged operations in Cloud Functions or the project's trusted server. Validate the caller and payload there; the Admin SDK bypasses Firestore rules, so server code must enforce authorization itself.

## Rules, operations, and recovery

- Default to least privilege. Keep Firestore and Storage rules in source control, deny access unless a narrow rule grants it, and test both permitted and rejected access paths with the project's emulator or rule-test setup.
- Keep credentials and secrets in supported server-side secret configuration. Never bundle service account keys or privileged credentials into client code.
- Plan schema changes and data migrations for compatibility, retries, and rollback. Use local emulators or a non-production project for development and verification.
- Document and use the project's backup and restore process for critical data. Validate recovery with a non-production restore when the task requires backup work.
- Do not make production database changes, destructive migrations, or live data repairs without the approval required by `AGENTS.md`.

## Verification

Inspect real rules and server paths, not just client behavior. Verify authentication, role boundaries, transaction outcomes, reconnect behavior, and failure cases using the available emulator or integration environment. State which environment was used and any untested production behavior.
