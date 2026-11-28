import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'gen-lang-client-0748882445';
let environment: RulesTestEnvironment;

before(async () => {
  const rules = await readFile(path.resolve('storefront.firestore.rules'), 'utf8');
  environment = await initializeTestEnvironment({ projectId, firestore: { rules } });
});

after(async () => environment?.cleanup());

test('published catalog is public, unpublished catalog and customer data stay private', async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'products', 'published-frame'), { published: true, name: 'Frame' });
    await setDoc(doc(db, 'products', 'draft-frame'), { published: false, name: 'Draft' });
    await setDoc(doc(db, 'orders', 'owner-order'), { customerUid: 'customer-a', shopSchema: 2 });
    await setDoc(doc(db, 'users', 'customer-a'), { displayName: 'Customer A' });
  });

  const anonymous = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anonymous, 'products', 'published-frame')));
  await assertFails(getDoc(doc(anonymous, 'products', 'draft-frame')));
  await assertFails(getDoc(doc(anonymous, 'orders', 'owner-order')));
  await assertFails(getDoc(doc(anonymous, 'users', 'customer-a')));

  const owner = environment.authenticatedContext('customer-a', { phone_number: '+201012345678' }).firestore();
  const ownOrders = await assertSucceeds(getDocs(query(collection(owner, 'orders'), where('customerUid', '==', 'customer-a'))));
  assert.equal(ownOrders.size, 1);
  await assertFails(getDoc(doc(owner, 'orders', 'someone-elses-order')));
  await assertFails(setDoc(doc(owner, 'orders', 'forged-order'), { customerUid: 'customer-a', total: 1 }));
  await assertFails(setDoc(doc(owner, 'products', 'published-frame'), { published: true, variants: [{ stock: 100000 }] }));
});

test('store admin claim grants admin reads but mutations remain server-only', async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'orders', 'any-order'), { customerUid: 'customer-a', shopSchema: 2 });
    await setDoc(doc(context.firestore(), 'storefront_audit', 'audit-entry'), { action: 'test' });
  });
  const admin = environment.authenticatedContext('staff-a', { admin: true }).firestore();
  await assertSucceeds(getDoc(doc(admin, 'orders', 'any-order')));
  await assertSucceeds(getDoc(doc(admin, 'storefront_audit', 'audit-entry')));
  await assertFails(setDoc(doc(admin, 'orders', 'forged-order'), { customerUid: 'staff-a' }));
  await assertFails(setDoc(doc(admin, 'storefront_audit', 'forged-entry'), { action: 'spoofed' }));
});

test('loyalty ledger is private to its customer and server-written', async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'customer-a', 'loyalty_ledger', 'earned-order-1'), { points: 20 });
    await setDoc(doc(db, 'users', 'customer-b', 'loyalty_ledger', 'earned-order-2'), { points: 40 });
  });
  const customer = environment.authenticatedContext('customer-a', { phone_number: '+201012345678' }).firestore();
  const ownLedger = await assertSucceeds(getDocs(collection(customer, 'users', 'customer-a', 'loyalty_ledger')));
  assert.equal(ownLedger.size, 1);
  await assertFails(getDoc(doc(customer, 'users', 'customer-b', 'loyalty_ledger', 'earned-order-2')));
  await assertFails(setDoc(doc(customer, 'users', 'customer-a', 'loyalty_ledger', 'forged'), { points: 999999 }));
  const admin = environment.authenticatedContext('staff-a', { admin: true }).firestore();
  await assertSucceeds(getDoc(doc(admin, 'users', 'customer-b', 'loyalty_ledger', 'earned-order-2')));
});
