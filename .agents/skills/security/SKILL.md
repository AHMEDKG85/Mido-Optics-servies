---
name: security
description: Review or implement security controls for MIDO OPTICS authentication, roles, backend access, checkout, payments, secrets, audit trails, and destructive order actions.
---

# Security

Use this skill when a change affects identity, permissions, customer or order data, checkout, payment state, secrets, auditability, cancellation, or deletion. Read `AGENTS.md` and inspect the actual data flow and backend before recommending controls. Fit protections to the existing stack and report concrete findings with affected paths and impact.

The supplied source snapshot uses Google sign-in, verified-email and `ownerId` checks in Firestore rules, token-based public tracking, a separate storefront-admin sign-in, and Express webhook/proxy endpoints configured with `MIDO_SYNC_SECRET`. Verify each boundary in the actual rules and server routes; a UI gate or successful Firestore client sign-in does not protect an Express endpoint. `security_spec.md` defines a no-PII public tracking contract, so compare the actual public payload and rules against it. The snapshot does not show an employee/admin role-claim system; do not assume one exists.

In that snapshot, webhook verification accepts requests when `MIDO_SYNC_SECRET` is unset, while the webhook-order list/delete handlers are separate routes. Treat this as a deployment-sensitive trust boundary: verify route authorization and fail-closed production configuration before relying on it. Do not alter live secrets or route behavior as part of a review or skills setup.

## Access and validation

- Define customer, employee, and administrator capabilities explicitly. Enforce them at every trusted server or database boundary; UI visibility and client-side role checks are usability only.
- Derive the acting user from verified authentication context. Validate resource ownership and allowed state transitions for reads, updates, cancellation, refund, and deletion.
- Validate request shape, types, ranges, identifiers, and allowed values on the server. Normalize and safely encode untrusted input at the appropriate storage or rendering boundary.
- Recalculate prices, discounts, shipping, stock, and order totals on the trusted backend. Use idempotency keys or equivalent deduplication for checkout and other retryable writes.

## Payments, secrets, and audit

- Never expose private keys, service credentials, provider secrets, or privileged API keys in frontend code, source maps, logs, or committed configuration. Use the project's server-side secret mechanism.
- Treat Firebase web API keys/config as public identifiers rather than privileged secrets; protect data with Security Rules, authorized-domain/API restrictions where applicable, and server-side authorization. Never place service-account keys or sync secrets in the browser.
- Treat provider status as authoritative only after a verified server-to-server response, signed webhook, or supported reconciliation flow. A browser redirect, user-supplied receipt, or client write must not establish payment.
- Collect and retain only payment data the configured provider and business flow require. Do not store raw card credentials in the application.
- Record sensitive actions such as role changes, order cancellation, refunds, and deletion with actor, target, time, outcome, and a minimal reason. Redact credentials and unnecessary customer data from logs.
- Prevent duplicate submissions and replay where repeated requests could charge, reserve, cancel, invoice, or delete more than once.

## Destructive changes and review

- Treat permanent deletion, bulk repair, production migrations, and changes to live payment or access settings as high impact. Follow `AGENTS.md` and obtain user approval before executing them.
- Prefer reversible status transitions and retention-aware deletion when business records must remain auditable. Never silently erase order or invoice history.
- When reviewing, prioritize exploitable paths and specific evidence. Separate confirmed vulnerabilities from assumptions and recommend a practical fix with a way to verify it.
