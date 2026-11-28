# MIDO OPTICS UX Contract

This contract records UI behavior. Business rules remain in the source prompt, `security_spec.md`, and the backend/API implementation. If these sources conflict, pause the affected workflow and resolve the source of truth before shipping.

## Business context sources

| Domain | Source | UI consequence |
| --- | --- | --- |
| Store scope and checkout | Owner-approved master brief supplied in the conversation | Pickup only; display Fawry, Vodafone Cash, and InstaPay only when configured; show 30% deposit and 70% balance. |
| Existing operations data | `src/types/optics.ts`, `src/hooks/useOpticsStore.ts`, `src/lib/storefrontFirebase.ts` | Preserve existing admin routes and map new order data deliberately into the existing dashboard. |
| Firestore access | `firestore.rules`, `security_spec.md`, storefront rule configuration | Do not assume the operations project's rules also govern the separate storefront project. Public tracking must not expose customer PII. |
| Authentication choice | Owner selected Firebase phone SMS verification | Customers use phone OTP; there is no password field or password reset flow. |

## Route and locale ownership

- The existing operations dashboard remains at `/`.
- The customer storefront is mounted under `/shop`; protected storefront administration is mounted under `/shop-admin`.
- The storefront router owns route state, browser history, and localized `document.title`; every page has a useful title in the active language.
- Arabic is the default locale and uses `dir="rtl"`; English uses `dir="ltr"`. Persist the selected locale, but do not mix directionality in form layouts. Identifiers, phone numbers, and EGP amounts may use explicit LTR spans.
- EGP formatting uses `Intl.NumberFormat` for the active locale. Dates show Cairo-local time and do not leak raw timestamps.
- The storefront theme provider owns light/dark state. The current operations dashboard keeps its existing theme behavior.

## Catalog, variants, and cart

- Published catalog data is read from the configured storefront Firebase project. Product and variant types must tolerate the legacy `/products` payload while the admin migration is in progress.
- A sellable color is a stable variant with its own name, HEX color, images, SKU/barcode when provided, price override when provided, and authoritative stock in the backend.
- No color is preselected on product detail. Adding to cart requires an available selected variant. Selection changes the image gallery, price, and stock message together.
- Cart lines are keyed by product ID and variant ID. Persist the cart locally for recovery, but treat its price and stock as a display snapshot only; the checkout callable revalidates both.
- Coupon validation and totals are server-authoritative. UI previews never mark a coupon redeemed before the order commits.

## Authentication and checkout

- Customer sign-in/register uses Firebase phone OTP with reCAPTCHA; account creation collects a name after phone verification. Do not ask for or store passwords. Customers may add email in their profile or checkout as optional contact information.
- Store pickup is the only delivery option. Show the configured pickup location and contact instructions; do not show shipping rates or address fields as required checkout fields.
- Checkout is an authenticated, idempotent callable operation. It re-reads products/variants, validates stock and coupon use, calculates EGP totals and 30% deposit, reserves stock, writes the order and invoice snapshot, and returns the committed result.
- Payment methods are manual verification workflows until a real provider integration is configured. “Instructions sent” and “proof submitted” are not “paid.” Admin confirmation is server-authorized and audited.
- Financial and inventory mutations are pessimistic: show pending state, block duplicates, and announce success only after server confirmation. Preserve safe form data after recoverable errors.

## Orders, invoices, and deletion

- The backend is the canonical order lifecycle. Customer and admin views update from persisted Firestore data, not local optimistic status.
- Order states are `new`, `awaiting_payment`, `payment_verification`, `confirmed`, `processing`, `ready_for_pickup`, `delivered`, `cancelled`, and `refunded`; backend functions enforce valid transitions.
- Every order item snapshots product, variant, selected color, quantity, and price so invoices remain historically correct after catalog edits.
- Invoice creation is idempotent and occurs in the order transaction. The customer can view, print, and download the saved invoice; the admin dashboard can access the same invoice record.
- Customer cancellation is allowed only for eligible statuses and releases reserved inventory in the same transaction. Permanent admin deletion requires explicit confirmation, deletes the order, writes an immutable tombstone and audit event atomically, and hides tombstoned IDs during offline/reconnect reconciliation.
- Never expose phone, email, address, prescription details, payment proof, or private invoice fields in public product queries or anonymous tracking.

## Admin authorization and data entry

- Existing operations dashboard authentication stays separate from customer phone auth. Storefront admin access requires a server-issued `admin` custom claim; a client-provided role or hidden route is never authorization.
- Product, variant, image, promotion, coupon, payment-instruction, order, invoice, staff, loyalty, and settings mutations go through authorized server functions or narrowly scoped rules.
- Image upload has a visible file picker, type/size limits, progress/error/retry states, and Storage ownership checks. Store URLs/paths, not base64 image blobs, in Firestore.
- Destructive product/order actions name the target and consequence and require confirmation. Every privileged change writes actor, time, target, action, and outcome to the audit log.
- Reports and Excel exports use server-authorized data and respect the requested date range and active admin permissions.

## Interaction and feedback

- Native buttons perform actions; anchors navigate. Icon-only controls have localized accessible names, visible focus, and 44px-class touch targets where practical.
- Forms use `noValidate`, associated labels, inline errors, `aria-invalid`, and error descriptions. Focus moves to the first invalid field on submit.
- Loading, empty, no-results, permission, offline, partial-sync, and server-error states are distinct. A toast is not the only record of a payment, order, cancellation, or deletion result.
- Dialogs trap focus only when modal, close with Escape where safe, restore focus, and keep actions visible above the virtual keyboard. Do not use browser `alert`, `confirm`, or `prompt`.
- Motion respects reduced-motion preferences and never blocks shopping or checkout.
- Invoices have dedicated print styling and a direct PDF download. Print preview is checked at supported receipt/page widths.

## Verification evidence

The storefront needs unit tests for pricing, deposits, variant selection, and state transitions; Firebase emulator tests for authorization, inventory transactions, order creation, cancellation, and tombstones; and Playwright flows for phone OTP (using Firebase test phone numbers), browsing, cart, checkout, invoice, admin updates, both locales, and mobile layouts. Do not claim live SMS or payment-provider verification from emulator tests.
