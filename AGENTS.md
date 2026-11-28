# MIDO OPTICS project instructions

## Project snapshot

- The working tree is on `codex/mido-optics-storefront` and tracks `origin/main`. The attached ZIP is an older snapshot; use this checked-out tree as the implementation source.
- The app uses React 19, TypeScript, Vite 8, Tailwind CSS 4, Cairo typography, Arabic/RTL defaults, light/dark themes, and a PWA setup. Preserve the operational dashboard and receipts while adding the customer storefront as a separate surface.
- `src/lib/firebase.ts` initializes the operations app/project. `src/lib/storefrontFirebase.ts` initializes a different Firebase project for the storefront catalog and orders. Keep these configurations distinct; do not create a third project or assume rules, Auth users, Storage, or Functions are shared between them.
- The repository currently has Firestore rules for the operations project, but no checked-in Firebase Functions, Storage rules, or Playwright setup. The storefront Express server contains webhook/proxy endpoints and a local `.data/` webhook queue. Use the existing storefront Firebase project as the target for storefront services; do not deploy or change production rules/settings during local implementation.
- The storefront admin already edits remote product variants and content through an external API. Trace those sync paths before changing product or order contracts. Do not treat the local webhook queue as the authoritative order store.
- Package scripts include `build` and `lint`; `src/utils/optics.test.ts` uses Node's `node:test` but there is no test script. Add Playwright only for the requested end-to-end work and keep all tests on emulators/local fixtures.
- Useful source entry points: `src/App.tsx`, `src/components/`, `src/hooks/useOpticsStore.ts`, `src/types/optics.ts`, `src/utils/optics.ts`, `src/lib/firebase.ts`, `src/lib/storefrontFirebase.ts`, `firestore.rules`, `security_spec.md`, and `server.ts`.

## Before changing the project

- Read this file and the `SKILL.md` for each relevant workflow in `.agents/skills/` before making changes. Invoke skills directly when useful with `$cinematic-frontend`, `$ecommerce-engineering`, `$firebase-backend`, `$security`, or `$playwright-testing`.
- Inspect the current files, dependencies, data model, backend, and existing behavior before proposing or editing implementation. Do not assume a framework, payment provider, or database that the code does not show.
- Preserve existing project files and working features. Check callers, dependencies, and data flow before replacing or removing functionality.

## Product and architecture

- Build a premium MIDO OPTICS experience using the project's existing architecture. Use the real configured database and backend for production features; do not introduce a second backend without a documented reason and an approved migration plan.
- Production-facing controls must perform their stated action through the real application and backend. Do not ship fake buttons, simulated checkout, fabricated orders, or placeholder payment/invoice behavior as working features. If an action is not implemented, make that limitation clear in the interface and report it.
- Keep the current dashboard at `/` and mount the customer storefront and storefront administration at separate routes. Do not replace the operational dashboard with the new store.
- Keep product variants, selected colors, inventory, cart lines, orders, and invoices consistent. Revalidate prices, permissions, payment state, and inventory at trusted backend boundaries.
- Customer authentication uses Firebase phone verification by SMS (OTP), not passwords. Staff administration remains separate and requires a server-enforced admin role.
- Never expose private keys, service credentials, or payment secrets in frontend code or committed files.

## Work and verification

- Work in clear phases suited to the task: inspect current behavior and contracts, implement the backend/data changes, connect the UI, then verify the affected flows. Adapt the order when the existing architecture requires it.
- Run relevant existing checks after each major implementation change. Add or change tests when needed to verify the requested behavior, and report the exact checks run and their results.
- Fix regressions in the affected flows before proceeding to dependent work. Record important architecture or data-contract decisions in the project's existing documentation when those decisions will guide later changes.
- Report completed work, failed or skipped tests, unverified behavior, and remaining tasks honestly. Do not claim a feature or integration works unless its real path was verified.

## Skill usage guide

Read the matching skill before specialized work; combine skills when a change crosses product, backend, security, and UI boundaries.

| Skill | Activate for |
| --- | --- |
| `$cinematic-frontend` | Storefront or customer-facing visual design, galleries, responsive UI, and animation. |
| `$ecommerce-engineering` | Catalog variants, inventory, cart/checkout, website orders, promotions, and invoices. |
| `$firebase-backend` | Firebase Auth, Firestore models/queries, synchronization, offline behavior, and Firebase operations. |
| `$security` | Authentication boundaries, rules, webhook/proxy endpoints, checkout trust, secrets, or destructive order actions. |
| `$playwright-testing` | Browser-level regression coverage for customer, admin, storefront, and responsive workflows. |

## Approval boundaries

- Ask the user before destructive operations, permanent deletion, bulk data repair, production database changes, or changes to live payment settings. Prefer reversible operations and non-production verification.
- Do not modify the live website, production database, payment settings, or customer data as part of documentation, skill setup, or local development work unless the user separately authorizes that specific action.
