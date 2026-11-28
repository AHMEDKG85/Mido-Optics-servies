---
name: playwright-testing
description: Create and run Playwright end-to-end tests for MIDO OPTICS storefront, product variants, cart, checkout, invoices, orders, permissions, and responsive behavior.
---

# Playwright Testing

Use this skill for browser-level tests and regression checks. Read `AGENTS.md`, inspect existing Playwright configuration, scripts, fixtures, and app startup requirements, then extend the current setup. Avoid adding another test framework if the repository already has one.

The supplied source snapshot has no Playwright dependency or configuration. It does include `src/utils/optics.test.ts` using Node's built-in `node:test`, while `package.json` has no test script. Verify the actual checkout and installed dependencies before selecting a command; add Playwright only as part of a scoped testing task, not as an assumption during documentation or skill setup.

## Test scope and environment

- Run tests against a local, emulator, or explicitly designated sandbox environment with controlled fixtures. Never create live orders, payments, customer accounts, or destructive production data during tests.
- Prefer exercising the real application and backend. Stub only external services that cannot safely or reliably run in the test environment, and keep the stub boundary explicit. Do not replace the application's backend with a fake when verifying persistence or authorization.
- Use isolated test data, deterministic setup, and cleanup limited to records created by the test. Do not delete or mutate unrelated user data.

## High-value journeys

- Verify a shopper can find a product, select a color/variant, see its corresponding images and availability, add it to the cart, and retain the exact variant through checkout and the resulting order.
- Verify server-side totals and stock behavior, including duplicate checkout attempts and rejected or unavailable variants, when the environment supports those paths.
- Verify supported payment states accurately: pending instructions are not paid, and only the trusted confirmation path changes payment status.
- Verify invoice generation is tied to the correct order and includes the purchased variant/color. Test that retries do not create duplicate orders, charges, or invoices.
- Cover customer order tracking and role boundaries. Test cancellation or permanent deletion only in isolated test data and check the resulting authorization and audit behavior.
- Exercise key responsive layouts at representative mobile, tablet, and desktop viewports, including navigation, gallery controls, variant selectors, and checkout forms.

## Test quality and reporting

- Use user-facing accessible locators where practical and assert observable outcomes or persisted state, not implementation details or the mere presence of a button.
- Capture useful failure context such as Playwright traces, screenshots, console errors, and relevant server logs when available. Keep secrets and customer data out of artifacts.
- Run the relevant tests when the environment supports them. Report the exact command and outcome, distinguish skipped or blocked tests from passing tests, and never claim success without an executed result.
