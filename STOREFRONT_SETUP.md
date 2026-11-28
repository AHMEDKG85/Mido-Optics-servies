# MIDO OPTICS storefront setup

The customer storefront is served at `/shop`. The existing optical operations app remains at `/`, and the storefront order tools are available at `/shop-admin`.

## Firebase targets

- Customer Auth, Firestore, and Functions use project `gen-lang-client-0748882445` and Firestore database `ai-studio-midooptics-b2b8b67a-82b2-4742-970e-5fe3b0f6abca`.
- The existing optical operations application keeps its separate Firebase configuration. Do not change the root `firestore.rules` to deploy the storefront policy.
- `firebase.storefront.json` targets only the storefront database, Functions codebase, and Storage rules. Firebase CLI deployment replaces remote rules for the selected target. Export the current storefront rules and merge the new policy with any existing access before deployment.

## Local development

Use Node.js 22 for Cloud Functions and a supported Node.js release for Vite. Firestore/Auth emulators also need Java 21 or a compatible JRE. Install dependencies, then start the web app with `npm run dev`.

Copy the storefront values from `.env.example` into an ignored local env file only if the existing web-app configuration needs overriding. `VITE_USE_FIREBASE_EMULATORS=true` is for local emulator runs and must be `false` for a real Firebase environment.

Run the local checks:

```powershell
npm run lint
npm run test:unit
npm run test:rules
npm run test:functions:smoke
npm run test:e2e
npm run build
npm run build --prefix functions
```

The emulator commands start isolated local Auth and Firestore services; they do not deploy or write to the production database.

## Firebase Console setup before launch

1. In Firebase Authentication for `gen-lang-client-0748882445`, enable Phone sign-in, configure the authorized web domains, and verify reCAPTCHA/SMS delivery with a test phone number. The storefront uses SMS verification; it does not accept phone/password credentials.
2. Confirm the named Firestore database ID above and its location. Keep the functions region aligned with the project’s chosen deployment region if you change it from `europe-west1`.
3. Seed `settings/storefront_public` with a pickup address and pickup instructions. Enable only the payment methods the shop can currently receive, and enter their verified Fawry, Vodafone Cash, or InstaPay instructions. Customer-submitted references remain pending until staff verifies them.
4. Use the existing catalog editor to publish products, then open `/shop-admin` to set **real stock for each color variant** and upload up to six JPEG, PNG, WebP, or AVIF images per color (each under 10 MB). Imported legacy rows are marked `stockEstimate`; checkout blocks them until their inventory is confirmed. Do not treat the old aggregate availability count as per-color stock.
5. Bootstrap the store owner with the `owner` command below. The owner claim also grants admin access and is required to manage staff claims in `/shop-admin`. The storefront admin accepts the existing Google provider; customer checkout still requires SMS-verified phone auth. Only the owner can grant/revoke staff admin access; refresh each user’s ID token after changing a claim.
6. Register the web app with Firebase App Check and a reCAPTCHA v3 provider. Set `VITE_FIREBASE_APP_CHECK_SITE_KEY` to that provider’s site key in the production web environment. Deployed callable Functions enforce App Check; only the local Functions emulator disables enforcement.

Store staff can configure loyalty points in the storefront admin settings. Points are earned only after the full order is marked picked up and paid. Redemptions are debited during order creation, restored on eligible cancellation/refund, and validated against the server-side balance and per-order cap.

The storefront supports manual payment verification; no card processor, Fawry API, Vodafone API, or InstaPay API connection is implemented. Marking an order delivered records payment of the remaining balance. Recording a refund requires staff to issue it outside the website first and enter the refund transaction reference.

## Admin claim

Build Functions, then bootstrap the owner or grant/revoke a staff claim using the authenticated Firebase Admin SDK environment. The exact UID must also be repeated in `MIDO_ADMIN_CONFIRM_UID` as a safeguard. Bootstrap one owner UID first; owners cannot be added through the staff screen.

```powershell
npm run build --prefix functions
$env:MIDO_ADMIN_CONFIRM_UID = 'FIREBASE_AUTH_UID'
npm run admin:claim --prefix functions -- owner FIREBASE_AUTH_UID
```

Use `grant` to add an ordinary admin or `revoke` to remove an admin/owner claim. The command uses Application Default Credentials for the target Firebase project; Firebase CLI login by itself may not provide those credentials to the Admin SDK.

## Deployment gate

No production Firebase rules, Functions, Storage rules, website hosting, or repository changes are deployed by the local checks. Before a live deployment, back up and review the existing storefront database/storage rules, verify Firebase Auth and App Check settings, set real per-variant stock and payment instructions, and test the complete order/cancellation/pickup flow against a non-production Firebase project. Then deploy only the named storefront configuration after reviewing the resolved CLI target.

The Firestore rules unit suite exercises the policy source in the emulator. Playwright runs desktop and mobile storefront navigation with Auth/Firestore emulators. Production SMS delivery, live payment receipt, Firebase project permissions, and real database region are not verifiable from this local workspace.
