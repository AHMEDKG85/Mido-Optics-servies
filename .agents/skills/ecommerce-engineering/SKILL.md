---
name: ecommerce-engineering
description: Build or maintain MIDO OPTICS catalog, product variants, cart, checkout, customer accounts, orders, promotions, invoices, and optical retail workflows.
---

# Ecommerce Engineering

Use this skill for product catalog and purchase flows. Read `AGENTS.md`, inspect the existing application and backend, and follow the repository's current architecture. Coordinate with `firebase-backend` when Firebase is actually the chosen backend and with `security` for authorization, payment, or deletion changes.

In the supplied source snapshot, the operations app manages a `WebProduct` color list and `WebOrderItem` snapshots, then maps them to a separate storefront Firebase app/database. The current mapping derives storefront variants from product-level color, availability, and photo fields and caps the mapped color list. Treat this as compatibility behavior, not evidence of independently managed variant images or stock. Before changing it, trace both sides of the sync and plan a compatible migration. The app also has printed customer/repair receipts; a web order's `invoiceNumber` alone does not prove automatic electronic invoicing is implemented.

## Catalog and variants

- Support eyeglasses, sunglasses, optical lenses, contact lenses, and accessories without assuming every category has the same options.
- Model each sellable variant with a stable identifier and its own SKU or equivalent, option values, price where applicable, images, and inventory state. Do not impose a fixed number of colors or variants in UI or data structures.
- Store variant-specific images and inventory so selecting a color can show the correct photos and availability. Represent options with accessible controls and make the selected option visible.
- Use one canonical product/variant contract across catalog, cart, checkout, order, and invoice code. Do not infer a selected color from an image index or display label.

## Cart, checkout, and orders

- Persist each cart line's product ID, variant ID, quantity, and a display snapshot of selected options such as color. Revalidate current price, availability, and allowed quantity on the trusted backend during checkout; never treat client totals as authoritative.
- Create orders through a trusted operation with idempotency protection. Update inventory atomically or use the existing reservation model so concurrent checkouts cannot silently oversell stock.
- Keep order status changes explicit and valid for the existing business workflow. Cancellation, refunds, and permanent deletion require authorization and must not be represented as complete until the backend confirms them.
- Make customer accounts and tracking show only data the signed-in customer is allowed to access. Enforce access on the backend, not only by hiding UI.

## Payments, promotions, and invoices

- Present Fawry, Vodafone Cash, and InstaPay only as payment methods the project actually supports. Clearly distinguish an instruction or pending transfer from verified payment. Never mark an order paid based on a client redirect, screenshot, or unverified client-side signal.
- The supplied snapshot does not establish a payment-provider integration. Inspect the current checkout and backend before presenting any method as operational; never infer a completed integration from labels, order fields, or a sync endpoint.
- Calculate coupons, promotions, shipping, and totals on the trusted backend. Validate eligibility, expiry, usage limits, and currency there as well.
- Generate electronic invoices from the authoritative order lifecycle. Include the chosen variant and color in each line item and persist a stable order/invoice snapshot so later catalog edits do not rewrite historical purchases. Make invoice creation idempotent and follow the project's applicable tax and invoicing requirements rather than inventing them.
- Keep payment credentials and privileged API keys out of browser code. Use the configured provider's approved integration and verify callbacks server-side.

## Verification

- Trace a selected color from product page through cart, checkout, persisted order, and invoice. Verify variant ID, option snapshot, image selection, and inventory behavior at each boundary.
- Use the existing test setup and report exactly which flows were exercised. Do not claim a payment, invoice, order, or inventory integration works unless the real backend path was verified.
