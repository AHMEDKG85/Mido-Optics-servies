"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const projectId = 'gen-lang-client-0748882445';
const [action, uid] = process.argv.slice(2);
if (!['grant', 'revoke', 'owner'].includes(action || '') || !uid) {
    throw new Error('Usage: npm run admin:claim -- <grant|revoke|owner> <firebase-auth-uid>');
}
if (process.env.MIDO_ADMIN_CONFIRM_UID !== uid) {
    throw new Error('Set MIDO_ADMIN_CONFIRM_UID to the exact UID to confirm this one-account claim update.');
}
async function updateClaim() {
    const app = (0, app_1.initializeApp)({ projectId }, `mido-admin-claims-${Date.now()}`);
    const auth = (0, auth_1.getAuth)(app);
    const target = await auth.getUser(uid);
    const claims = { ...(target.customClaims || {}) };
    if (action === 'owner') {
        claims.admin = true;
        claims.owner = true;
    }
    else if (action === 'grant')
        claims.admin = true;
    else {
        delete claims.admin;
        delete claims.owner;
    }
    await auth.setCustomUserClaims(uid, claims);
    console.log(`${action === 'owner' ? 'Granted owner and admin claims' : action === 'grant' ? 'Granted admin claim' : 'Revoked admin and owner claims'} for ${target.uid}${target.phoneNumber ? ` (${target.phoneNumber})` : ''}. The user must refresh their ID token.`);
}
void updateClaim();
