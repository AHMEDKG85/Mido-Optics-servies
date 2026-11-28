import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

const PROJECT_ID = 'gen-lang-client-0748882445';
const DATABASE_ID = 'ai-studio-midooptics-b2b8b67a-82b2-4742-970e-5fe3b0f6abca';
const app = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app, DATABASE_ID);
setGlobalOptions({ region: 'europe-west1', maxInstances: 10, memory: '256MiB', enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' });

type PaymentMethod = 'fawry' | 'vodafone_cash' | 'instapay';
type ProductRecord = { name?: unknown; category?: unknown; price?: unknown; discountPrice?: unknown; published?: unknown; stockEstimate?: unknown; variants?: unknown[]; imageUrl?: unknown; images?: unknown[] };
type OrderRecord = {
  customerUid: string; orderCode: string; invoiceNumber: string; customerName: string; customerPhone: string; couponCode?: string;
  items: Array<{ productId: string; productSlug?: string; variantId: string; productName: string; category?: string; colorName: string; colorHex: string; imageUrl: string; quantity: number; unitPrice: number; framePrice?: number; lensId?: string; lensName?: string; lensPrice?: number; orderType?: string; lineTotal: number }>;
  subtotal: number; discountAmount: number; total: number; depositAmount: number; balanceAmount: number;
  pointsRedeemed?: number; pointsDiscountAmount?: number; pointsEarned?: number;
  paymentMethod: PaymentMethod; paymentStatus: string; status: string; stockReserved: boolean; stockReleased: boolean;
};

function requireUser(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'سجّل الدخول برقم هاتف موثّق أولاً.');
  const uid = request.auth.uid;
  const phone = String(request.auth.token.phone_number || '');
  if (!phone) throw new HttpsError('failed-precondition', 'يجب توثيق رقم الهاتف قبل متابعة الطلب.');
  return { uid, phone, token: request.auth.token };
}

function requireAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  const user = request.auth;
  if (!user?.uid) throw new HttpsError('unauthenticated', 'سجّل الدخول بحساب إدارة المتجر أولاً.');
  if (user.token.admin !== true) throw new HttpsError('permission-denied', 'حساب إدارة المتجر غير مخوّل.');
  return { uid: user.uid, token: user.token };
}

function requireOwner(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  const admin = requireAdmin(request);
  if (admin.token.owner !== true) throw new HttpsError('permission-denied', 'إدارة حسابات الفريق متاحة لمالك المتجر فقط.');
  return admin;
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, max);
}

function safeId(value: unknown, max = 100): string {
  const id = String(value ?? '').trim();
  if (!id || id.length > max || /[/.#\[\]]/.test(id)) throw new HttpsError('invalid-argument', 'معرّف المنتج أو الطلب غير صالح.');
  return id;
}

function newCode(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function auditRef() { return db.collection('storefront_audit').doc(); }

function roundMoney(amount: number) { return Math.round(amount); }

async function readInventoryRefs(transaction: FirebaseFirestore.Transaction, order: OrderRecord) {
  const productIds = [...new Set(order.items.map((item) => item.productId))];
  return Promise.all(productIds.map(async (id) => {
    const ref = db.collection('products').doc(id);
    return { id, ref, snapshot: await transaction.get(ref) };
  }));
}

function releaseReservedInventory(transaction: FirebaseFirestore.Transaction, records: Awaited<ReturnType<typeof readInventoryRefs>>, order: OrderRecord) {
  if (!order.stockReserved || order.stockReleased) return;
  for (const record of records) {
    if (!record.snapshot.exists) continue;
    const product = record.snapshot.data() as ProductRecord;
    const variants = Array.isArray(product.variants) ? [...product.variants] as Array<Record<string, unknown>> : [];
    for (const item of order.items.filter((candidate) => candidate.productId === record.id)) {
      const index = variants.findIndex((variant) => String(variant.id ?? '') === item.variantId);
      if (index < 0) continue;
      variants[index] = { ...variants[index], stock: Math.max(0, Number(variants[index].stock) || 0) + item.quantity };
    }
    transaction.update(record.ref, { variants, updatedAt: FieldValue.serverTimestamp() });
  }
}

async function releaseCouponRedemption(transaction: FirebaseFirestore.Transaction, orderId: string, order: OrderRecord) {
  const code = cleanText(order.couponCode, 40).toUpperCase();
  if (!code) return;
  const couponRef = db.collection('coupons').doc(code);
  const redemptionRef = couponRef.collection('redemptions').doc(`${order.customerUid}_${orderId}`);
  const [couponSnapshot, redemptionSnapshot] = await Promise.all([transaction.get(couponRef), transaction.get(redemptionRef)]);
  if (!redemptionSnapshot.exists) return;
  if (couponSnapshot.exists) {
    const usedCount = Math.max(0, Number(couponSnapshot.data()?.usedCount || 0) - 1);
    transaction.update(couponRef, { usedCount, updatedAt: FieldValue.serverTimestamp() });
  }
  transaction.delete(redemptionRef);
}

export const saveCustomerProfile = onCall(async (request) => {
  const user = requireUser(request);
  const displayName = cleanText(request.data?.displayName, 90);
  if (displayName.length < 2) throw new HttpsError('invalid-argument', 'اكتب الاسم بالكامل.');
  const phone = user.phone;
  const userRef = db.collection('users').doc(user.uid);
  const profile: Record<string, unknown> = {
    uid: user.uid,
    displayName,
    phone,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (request.data?.email !== undefined) {
    const email = cleanText(request.data.email, 180);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError('invalid-argument', 'البريد الإلكتروني غير صالح.');
    profile.email = email || FieldValue.delete();
  }
  await userRef.set(profile, { merge: true });
  await getAuth(app).updateUser(user.uid, { displayName });
  return { ok: true };
});

export const listStorefrontStaff = onCall(async (request) => {
  requireOwner(request);
  const pageToken = cleanText(request.data?.pageToken, 2048) || undefined;
  const result = await getAuth(app).listUsers(100, pageToken);
  return {
    staff: result.users.filter((user) => user.customClaims?.admin === true || user.customClaims?.owner === true).map((user) => ({
      uid: user.uid, email: user.email || '', displayName: user.displayName || '', phoneNumber: user.phoneNumber || '',
      admin: user.customClaims?.admin === true, owner: user.customClaims?.owner === true, disabled: user.disabled,
    })),
    nextPageToken: result.pageToken || '',
  };
});

export const setStorefrontStaffAdmin = onCall(async (request) => {
  const owner = requireOwner(request);
  const targetUid = safeId(request.data?.uid, 128);
  const enabled = request.data?.enabled === true;
  if (targetUid === owner.uid && !enabled) throw new HttpsError('failed-precondition', 'لا يمكن لمالك المتجر إزالة صلاحية إدارته من هذه الشاشة.');
  const auth = getAuth(app);
  const target = await auth.getUser(targetUid);
  if (target.customClaims?.owner === true && !enabled) throw new HttpsError('failed-precondition', 'لا يمكن إزالة صلاحية مالك آخر من هذه الشاشة.');
  const claims = { ...(target.customClaims || {}) };
  if (enabled) claims.admin = true;
  else delete claims.admin;
  await auth.setCustomUserClaims(targetUid, claims);
  await auditRef().create({ actorUid: owner.uid, action: enabled ? 'staff.admin_granted' : 'staff.admin_revoked', targetId: targetUid, createdAt: FieldValue.serverTimestamp(), outcome: 'success' });
  return { ok: true, uid: targetUid, admin: enabled };
});

export const createStoreOrder = onCall(async (request) => {
  const user = requireUser(request);
  const rawItems = request.data?.items;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 30) throw new HttpsError('invalid-argument', 'السلة فارغة أو تحتوي عناصر كثيرة.');
  const items = rawItems.map((raw: unknown) => {
    const entry = raw as Record<string, unknown>;
    const quantity = Number(entry.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new HttpsError('invalid-argument', 'كمية المنتج غير صالحة.');
    return { productId: safeId(entry.productId), variantId: safeId(entry.variantId), quantity };
  });
  const merged = new Map<string, typeof items[number]>();
  for (const item of items) {
    const key = `${item.productId}:${item.variantId}`;
    const previous = merged.get(key);
    merged.set(key, { ...item, quantity: previous ? previous.quantity + item.quantity : item.quantity });
  }
  const distinct = [...merged.values()];
  if (distinct.some((item) => item.quantity > 20)) throw new HttpsError('invalid-argument', 'الكمية المطلوبة تتجاوز الحد المسموح.');
  const paymentMethod = String(request.data?.paymentMethod || '') as PaymentMethod;
  if (!['fawry', 'vodafone_cash', 'instapay'].includes(paymentMethod)) throw new HttpsError('invalid-argument', 'طريقة الدفع غير صالحة.');
  const idempotencyKey = cleanText(request.data?.idempotencyKey, 64).replace(/[^a-zA-Z0-9_-]/g, '');
  if (idempotencyKey.length < 12) throw new HttpsError('invalid-argument', 'معرّف الطلب غير صالح.');
  const idempotencyRef = db.collection('checkout_idempotency').doc(`${user.uid}_${idempotencyKey}`);
  const orderRef = db.collection('orders').doc(`shop-${randomBytes(12).toString('hex')}`);
  const invoiceRef = db.collection('invoices').doc(orderRef.id);
  const settingsRef = db.collection('settings').doc('storefront_public');
  const couponCode = cleanText(request.data?.couponCode, 40).toUpperCase();
  const couponRef = couponCode ? db.collection('coupons').doc(couponCode) : null;
  const requestedPoints = Number(request.data?.redeemPoints || 0);
  if (!Number.isInteger(requestedPoints) || requestedPoints < 0 || requestedPoints > 1_000_000) throw new HttpsError('invalid-argument', 'عدد نقاط الاستبدال غير صالح.');

  const created = await db.runTransaction(async (transaction) => {
    const idempotencySnapshot = await transaction.get(idempotencyRef);
    if (idempotencySnapshot.exists) {
      const previousOrderId = String(idempotencySnapshot.data()?.orderId || '');
      const previousOrder = previousOrderId ? await transaction.get(db.collection('orders').doc(previousOrderId)) : null;
      if (previousOrder?.exists) return { orderId: previousOrder.id, orderCode: previousOrder.data()?.orderCode, invoiceNumber: previousOrder.data()?.invoiceNumber };
      const deleted = previousOrderId ? await transaction.get(db.collection('deleted_store_orders').doc(previousOrderId)) : null;
      if (deleted?.exists) throw new HttpsError('failed-precondition', 'هذا الطلب حُذف نهائياً ولا يمكن إعادة إنشائه بمفتاح المحاولة نفسه.');
    }
    const [settingsSnapshot, ...productSnapshots] = await Promise.all([
      transaction.get(settingsRef),
      ...distinct.map((item) => transaction.get(db.collection('products').doc(item.productId))),
    ]);
    const settings = settingsSnapshot.data() || {};
    const payments = settings.payments || {};
    if (payments[paymentMethod] !== true) throw new HttpsError('failed-precondition', 'طريقة الدفع هذه غير متاحة حالياً.');
    const couponSnapshot = couponRef ? await transaction.get(couponRef) : null;
    let subtotal = 0;
    const orderItems: OrderRecord['items'] = [];
    const changedProducts = new Map<string, { ref: FirebaseFirestore.DocumentReference; variants: Array<Record<string, unknown>> }>();
    for (let i = 0; i < distinct.length; i += 1) {
      const requested = distinct[i];
      const snapshot = productSnapshots[i];
      if (!snapshot.exists) throw new HttpsError('not-found', 'أحد المنتجات لم يعد متاحاً.');
      const product = snapshot.data() as ProductRecord;
      if (product.published !== true) throw new HttpsError('failed-precondition', 'أحد المنتجات غير متاح للبيع.');
      if (product.stockEstimate === true) throw new HttpsError('failed-precondition', 'المخزون الفعلي لهذا المنتج يحتاج إلى تحديث قبل الشراء.');
      const variants = Array.isArray(product.variants) ? [...product.variants] as Array<Record<string, unknown>> : [];
      const variantIndex = variants.findIndex((variant) => String(variant.id ?? '') === requested.variantId);
      if (variantIndex < 0 || variants[variantIndex].active === false) throw new HttpsError('failed-precondition', 'لون المنتج تغير أو توقف. أعد تحميل صفحة المنتج.');
      const variant = variants[variantIndex];
      const stock = Number(variant.stock);
      if (!Number.isFinite(stock) || stock < requested.quantity) throw new HttpsError('failed-precondition', 'الكمية المطلوبة غير متوفرة حالياً.');
      const basePrice = Number(variant.price) > 0 ? Number(variant.price) : Number(product.discountPrice) > 0 ? Number(product.discountPrice) : Number(product.price);
      if (!Number.isFinite(basePrice) || basePrice < 1) throw new HttpsError('failed-precondition', 'سعر أحد المنتجات غير صالح.');
      const unitPrice = roundMoney(basePrice);
      const images = Array.isArray(variant.images) ? variant.images : [];
      const productImages = Array.isArray(product.images) ? product.images : [];
      const image = String(images[0] || productImages[0] || product.imageUrl || '');
      const lineTotal = unitPrice * requested.quantity;
      subtotal += lineTotal;
      orderItems.push({
        productId: requested.productId,
        productSlug: requested.productId,
        variantId: requested.variantId,
        productName: cleanText(product.name, 140) || 'MIDO OPTICS',
        category: cleanText(product.category, 40) || 'prescription',
        colorName: cleanText(variant.colorName, 80),
        colorHex: /^#[0-9a-f]{6}$/i.test(String(variant.colorHex || '')) ? String(variant.colorHex) : '#c9a24b',
        imageUrl: /^https?:\/\//i.test(image) ? image.slice(0, 1000) : '',
        quantity: requested.quantity,
        unitPrice,
        framePrice: unitPrice,
        lensId: '',
        lensName: '',
        lensPrice: 0,
        orderType: 'standard',
        lineTotal,
      });
      variants[variantIndex] = { ...variant, stock: stock - requested.quantity };
      changedProducts.set(requested.productId, { ref: snapshot.ref, variants });
    }
    if (subtotal < 1) throw new HttpsError('failed-precondition', 'قيمة الطلب غير صالحة.');
    let couponDiscountAmount = 0;
    if (couponCode) {
      if (!couponSnapshot?.exists) throw new HttpsError('failed-precondition', 'كود الخصم غير صالح.');
      const coupon = couponSnapshot.data() || {};
      const now = Timestamp.now();
      const startsAt = coupon.startsAt as Timestamp | undefined;
      const endsAt = coupon.endsAt as Timestamp | undefined;
      if (coupon.active !== true || (startsAt && startsAt.toMillis() > now.toMillis()) || (endsAt && endsAt.toMillis() < now.toMillis())) throw new HttpsError('failed-precondition', 'كود الخصم غير متاح حالياً.');
      const maxUses = Number(coupon.maxUses || 0);
      if (maxUses > 0 && Number(coupon.usedCount || 0) >= maxUses) throw new HttpsError('failed-precondition', 'تم استخدام كود الخصم بالكامل.');
      const value = Number(coupon.value || 0);
      couponDiscountAmount = coupon.discountType === 'fixed' ? Math.min(subtotal, roundMoney(value)) : Math.min(subtotal, roundMoney(subtotal * Math.min(100, Math.max(0, value)) / 100));
      if (couponDiscountAmount < 1) throw new HttpsError('failed-precondition', 'كود الخصم لا يطبق على هذا الطلب.');
    }
    const profileRef = db.collection('users').doc(user.uid);
    const profileSnapshot = await transaction.get(profileRef);
    const pointsBalance = Math.max(0, Math.floor(Number(profileSnapshot.data()?.loyaltyPoints) || 0));
    const loyalty = (settings.loyalty || {}) as Record<string, unknown>;
    const loyaltyActive = loyalty.active === true;
    const pointsPer100Egp = Math.floor(Number(loyalty.pointsPer100Egp) || 0);
    const valuePerPoint = Number(loyalty.valuePerPoint) || 0;
    const maxRedemptionPercent = Math.min(50, Math.max(0, Number(loyalty.maxRedemptionPercent) || 0));
    let pointsDiscountAmount = 0;
    if (requestedPoints > 0) {
      if (!loyaltyActive || valuePerPoint <= 0 || pointsPer100Egp < 1) throw new HttpsError('failed-precondition', 'استبدال النقاط غير متاح حالياً.');
      if (requestedPoints > pointsBalance) throw new HttpsError('failed-precondition', 'رصيد نقاطك غير كافٍ.');
      const remainingAfterCoupon = Math.max(0, subtotal - couponDiscountAmount);
      const pointsDiscountCap = Math.min(remainingAfterCoupon, roundMoney(subtotal * maxRedemptionPercent / 100));
      pointsDiscountAmount = roundMoney(requestedPoints * valuePerPoint);
      if (pointsDiscountAmount < 1 || pointsDiscountAmount > pointsDiscountCap) throw new HttpsError('failed-precondition', 'عدد النقاط يتجاوز حد الاستبدال لهذا الطلب.');
    }
    const discountAmount = couponDiscountAmount + pointsDiscountAmount;
    const total = subtotal - discountAmount;
    const depositAmount = roundMoney(total * 0.3);
    const balanceAmount = total - depositAmount;
    const displayName = cleanText(request.data?.customerName, 90) || cleanText(user.token.name, 90);
    const customerName = displayName || cleanText(profileSnapshot.data()?.displayName, 90);
    if (customerName.length < 2) throw new HttpsError('failed-precondition', 'أكمل اسمك في الحساب قبل إتمام الطلب.');
    const orderCode = newCode('MO');
    const invoiceNumber = newCode('INV');
    const order: OrderRecord & Record<string, unknown> = {
      schemaVersion: 2,
      shopSchema: 2,
      customerUid: user.uid,
      customerName,
      customerPhone: user.phone,
      customerEmail: cleanText(request.data?.email, 180),
      notes: cleanText(request.data?.notes, 1000),
      pickupOnly: true,
      customerAddress: '',
      orderType: 'standard',
      source: 'storefront_firebase',
      pickupAddressSnapshot: cleanText(settings.pickupAddress, 300),
      paymentInstructionSnapshot: cleanText(settings.paymentInstructions?.[paymentMethod], 500),
      frameSubtotal: subtotal,
      lensSubtotal: 0,
      orderCode,
      invoiceNumber,
      items: orderItems,
      subtotal,
      discountAmount,
      couponCode: couponCode || '',
      couponDiscountAmount,
      pointsRedeemed: requestedPoints,
      pointsDiscountAmount,
      total,
      depositAmount,
      balanceAmount,
      paymentMethod,
      paymentStatus: 'awaiting_deposit',
      status: 'awaiting_payment',
      stockReserved: true,
      stockReleased: false,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    for (const changed of changedProducts.values()) transaction.update(changed.ref, { variants: changed.variants, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(orderRef, order);
    transaction.set(invoiceRef, { ...order, orderId: orderRef.id, invoiceId: invoiceRef.id, createdAt: FieldValue.serverTimestamp() });
    transaction.set(idempotencyRef, { orderId: orderRef.id, createdAt: FieldValue.serverTimestamp() });
    if (couponRef && couponSnapshot?.exists) {
      transaction.update(couponRef, { usedCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(couponRef.collection('redemptions').doc(`${user.uid}_${orderRef.id}`), { uid: user.uid, orderId: orderRef.id, redeemedAt: FieldValue.serverTimestamp() });
    }
    transaction.set(profileRef, { uid: user.uid, displayName: customerName, phone: user.phone, ...(requestedPoints ? { loyaltyPoints: pointsBalance - requestedPoints, pointsRedeemedTotal: FieldValue.increment(requestedPoints) } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (requestedPoints) transaction.create(profileRef.collection('loyalty_ledger').doc(`redeem_${orderRef.id}`), { type: 'redemption', orderId: orderRef.id, points: -requestedPoints, amountEgp: pointsDiscountAmount, createdAt: FieldValue.serverTimestamp() });
    return { orderId: orderRef.id, orderCode, invoiceNumber };
  });
  return created;
});

export const cancelStoreOrder = onCall(async (request) => {
  const user = requireUser(request);
  const orderId = safeId(request.data?.orderId);
  const reason = cleanText(request.data?.reason, 500);
  const orderRef = db.collection('orders').doc(orderId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
    const order = snapshot.data() as OrderRecord & Record<string, unknown>;
    if (order.customerUid !== user.uid) throw new HttpsError('permission-denied', 'لا يمكنك إلغاء هذا الطلب.');
    if (order.status !== 'awaiting_payment' || order.paymentStatus !== 'awaiting_deposit' || order.paymentReference) throw new HttpsError('failed-precondition', 'لا يمكن إلغاء الطلب بعد إرسال مرجع الدفع. تواصل مع المتجر لمراجعة الحالة.');
    const inventory = await readInventoryRefs(transaction, order);
    const pointsRedeemed = Math.max(0, Math.floor(Number(order.pointsRedeemed) || 0));
    const profileRef = db.collection('users').doc(user.uid);
    const profileSnapshot = pointsRedeemed ? await transaction.get(profileRef) : null;
    await releaseCouponRedemption(transaction, orderId, order);
    releaseReservedInventory(transaction, inventory, order);
    transaction.update(orderRef, { status: 'cancelled', cancellationReason: reason, cancelledAt: FieldValue.serverTimestamp(), stockReleased: true, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(db.collection('invoices').doc(orderId), { status: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
    if (pointsRedeemed && profileSnapshot) {
      transaction.set(profileRef, { loyaltyPoints: Math.floor(Number(profileSnapshot.data()?.loyaltyPoints) || 0) + pointsRedeemed, pointsRestoredTotal: FieldValue.increment(pointsRedeemed), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.create(profileRef.collection('loyalty_ledger').doc(`cancel_${orderId}`), { type: 'cancellation_restore', orderId, points: pointsRedeemed, createdAt: FieldValue.serverTimestamp() });
    }
    transaction.set(auditRef(), { actorUid: user.uid, action: 'order.cancelled_by_customer', targetId: orderId, createdAt: FieldValue.serverTimestamp(), outcome: 'success' });
  });
  return { ok: true };
});

export const submitStorePaymentReference = onCall(async (request) => {
  const user = requireUser(request);
  const orderId = safeId(request.data?.orderId);
  const reference = cleanText(request.data?.reference, 100);
  if (reference.length < 4) throw new HttpsError('invalid-argument', 'اكتب رقم مرجع التحويل أو العملية.');
  const orderRef = db.collection('orders').doc(orderId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
    const order = snapshot.data() || {};
    if (order.customerUid !== user.uid) throw new HttpsError('permission-denied', 'لا يمكنك تحديث هذا الطلب.');
    if (!['awaiting_payment', 'payment_verification'].includes(String(order.status)) || order.paymentStatus === 'deposit_verified') throw new HttpsError('failed-precondition', 'لا يمكن إرسال مرجع الدفع في حالة الطلب الحالية.');
    transaction.update(orderRef, { paymentReference: reference, paymentStatus: 'verification_pending', status: 'payment_verification', paymentReferenceSubmittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(db.collection('invoices').doc(orderId), { paymentReference: reference, paymentStatus: 'verification_pending', status: 'payment_verification', updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

export const setStorePaymentStatus = onCall(async (request) => {
  const admin = requireAdmin(request);
  const orderId = safeId(request.data?.orderId);
  if (request.data?.status !== 'deposit_verified') throw new HttpsError('invalid-argument', 'حالة العربون غير مدعومة.');
  const orderRef = db.collection('orders').doc(orderId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
    const order = snapshot.data() || {};
    if (['cancelled', 'refunded'].includes(String(order.status))) throw new HttpsError('failed-precondition', 'الطلب ملغي أو مسترد.');
    transaction.update(orderRef, { paymentStatus: 'deposit_verified', status: 'confirmed', depositVerifiedAt: FieldValue.serverTimestamp(), depositVerifiedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(db.collection('invoices').doc(orderId), { paymentStatus: 'deposit_verified', status: 'confirmed', updatedAt: FieldValue.serverTimestamp() });
    transaction.set(auditRef(), { actorUid: admin.uid, action: 'payment.deposit_verified', targetId: orderId, createdAt: FieldValue.serverTimestamp(), outcome: 'success' });
  });
  return { ok: true };
});

export const setStoreOrderStatus = onCall(async (request) => {
  const admin = requireAdmin(request);
  const orderId = safeId(request.data?.orderId);
  const nextStatus = String(request.data?.status || '');
  const allowed = new Set(['processing', 'ready_for_pickup', 'delivered', 'refunded', 'cancelled']);
  if (!allowed.has(nextStatus)) throw new HttpsError('invalid-argument', 'حالة الطلب غير صالحة.');
  const refundReference = nextStatus === 'refunded' ? cleanText(request.data?.refundReference, 100) : '';
  if (nextStatus === 'refunded' && refundReference.length < 4) throw new HttpsError('invalid-argument', 'أدخل مرجع عملية الاسترداد اليدوية.');
  const orderRef = db.collection('orders').doc(orderId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
    const order = snapshot.data() as OrderRecord & Record<string, unknown>;
    const transitions: Record<string, string[]> = {
      awaiting_payment: ['cancelled'], confirmed: ['processing'], processing: ['ready_for_pickup'], ready_for_pickup: ['delivered'], delivered: ['refunded'],
    };
    if (!(transitions[order.status] || []).includes(nextStatus)) throw new HttpsError('failed-precondition', 'انتقال حالة الطلب غير مسموح.');
    if (nextStatus === 'cancelled' && (order.paymentStatus !== 'awaiting_deposit' || order.paymentReference)) throw new HttpsError('failed-precondition', 'لا يمكن إلغاء طلب بدأ دفعه قبل مراجعة المتجر.');
    if (nextStatus === 'delivered' && order.paymentStatus !== 'deposit_verified') throw new HttpsError('failed-precondition', 'أكد استلام العربون أولاً.');
    if (nextStatus === 'refunded' && order.paymentStatus !== 'paid') throw new HttpsError('failed-precondition', 'لا يمكن تسجيل الاسترداد قبل تأكيد دفع كامل الطلب.');
    const inventory = nextStatus === 'cancelled' ? await readInventoryRefs(transaction, order) : null;
    let pointsEarned = 0;
    if (nextStatus === 'delivered') {
      const settingsSnapshot = await transaction.get(db.collection('settings').doc('storefront_public'));
      const loyalty = (settingsSnapshot.data()?.loyalty || {}) as Record<string, unknown>;
      if (loyalty.active === true) pointsEarned = Math.max(0, Math.floor(Number(order.total) / 100) * Math.floor(Number(loyalty.pointsPer100Egp) || 0));
    }
    const pointsRedeemed = Math.max(0, Math.floor(Number(order.pointsRedeemed) || 0));
    const pointsToReverse = nextStatus === 'refunded' ? Math.max(0, Math.floor(Number(order.pointsEarned) || 0)) : 0;
    const pointsDelta = (nextStatus === 'cancelled' || nextStatus === 'refunded' ? pointsRedeemed : 0) - pointsToReverse + pointsEarned;
    const profileRef = db.collection('users').doc(order.customerUid);
    const profileSnapshot = pointsDelta ? await transaction.get(profileRef) : null;
    if (nextStatus === 'cancelled' || nextStatus === 'refunded') await releaseCouponRedemption(transaction, orderId, order);
    if (nextStatus === 'cancelled' && inventory) releaseReservedInventory(transaction, inventory, order);
    const released = nextStatus === 'cancelled' ? true : order.stockReleased;
    transaction.update(orderRef, {
      status: nextStatus,
      stockReleased: released,
      ...(nextStatus === 'cancelled' ? { cancelledAt: FieldValue.serverTimestamp(), cancellationReason: cleanText(request.data?.reason, 500) } : {}),
      ...(nextStatus === 'delivered' ? { paymentStatus: 'paid', balancePaidAt: FieldValue.serverTimestamp(), balancePaidBy: admin.uid, balancePaidAmount: order.balanceAmount } : {}),
      ...(nextStatus === 'refunded' ? { paymentStatus: 'refunded', refundReference, refundedAt: FieldValue.serverTimestamp(), refundedBy: admin.uid } : {}),
      ...(nextStatus === 'delivered' ? { pointsEarned } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(db.collection('invoices').doc(orderId), {
      status: nextStatus,
      ...(nextStatus === 'delivered' ? { paymentStatus: 'paid', balancePaidAt: FieldValue.serverTimestamp(), pointsEarned } : {}),
      ...(nextStatus === 'refunded' ? { paymentStatus: 'refunded', refundReference, refundedAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(auditRef(), { actorUid: admin.uid, action: `order.status.${nextStatus}`, targetId: orderId, createdAt: FieldValue.serverTimestamp(), outcome: 'success' });
    if (pointsDelta && profileSnapshot) {
      const currentPoints = Math.floor(Number(profileSnapshot.data()?.loyaltyPoints) || 0);
      transaction.set(profileRef, { loyaltyPoints: currentPoints + pointsDelta, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.create(profileRef.collection('loyalty_ledger').doc(`${nextStatus}_${orderId}`), {
        type: nextStatus === 'delivered' ? 'earned' : nextStatus === 'refunded' ? 'refund_adjustment' : 'cancellation_restore',
        orderId, points: pointsDelta, createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { ok: true };
});

export const permanentlyDeleteStoreOrder = onCall(async (request) => {
  const admin = requireAdmin(request);
  const orderId = safeId(request.data?.orderId);
  const orderRef = db.collection('orders').doc(orderId);
  const tombstoneRef = db.collection('deleted_store_orders').doc(orderId);
  await db.runTransaction(async (transaction) => {
    const [snapshot, existingTombstone] = await Promise.all([transaction.get(orderRef), transaction.get(tombstoneRef)]);
    if (existingTombstone.exists) return;
    if (!snapshot.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
    const order = snapshot.data() as OrderRecord & Record<string, unknown>;
    if (!['cancelled', 'delivered', 'refunded'].includes(order.status)) throw new HttpsError('failed-precondition', 'ألغِ الطلب أو أكمل تسليمه قبل الحذف النهائي.');
    const inventory = await readInventoryRefs(transaction, order);
    if (!['delivered', 'refunded'].includes(order.status)) releaseReservedInventory(transaction, inventory, order);
    transaction.delete(orderRef);
    transaction.delete(db.collection('invoices').doc(orderId));
    transaction.create(tombstoneRef, { orderId, orderCode: cleanText(order.orderCode, 80), deletedAt: FieldValue.serverTimestamp(), deletedBy: admin.uid });
    transaction.set(db.collection('deleted_order_codes').doc(cleanText(order.orderCode, 80).toUpperCase()), { orderCode: cleanText(order.orderCode, 80).toUpperCase(), deletedAt: FieldValue.serverTimestamp(), deletedBy: admin.uid });
    transaction.create(auditRef(), { actorUid: admin.uid, action: 'order.permanently_deleted', targetId: orderId, createdAt: FieldValue.serverTimestamp(), outcome: 'success' });
  });
  return { ok: true };
});

export const updateStorefrontSettings = onCall(async (request) => {
  const admin = requireAdmin(request);
  const pickupAddress = cleanText(request.data?.pickupAddress, 300);
  const pickupInstructions = cleanText(request.data?.pickupInstructions, 700);
  const contactPhone = cleanText(request.data?.contactPhone, 32);
  if (contactPhone && !/^[+0-9()\s-]{7,32}$/.test(contactPhone)) throw new HttpsError('invalid-argument', 'رقم هاتف المتجر غير صالح.');
  const incoming = request.data?.payments || {};
  const incomingInstructions = request.data?.paymentInstructions || {};
  const payments = {
    fawry: incoming.fawry === true,
    vodafone_cash: incoming.vodafone_cash === true,
    instapay: incoming.instapay === true,
  };
  const paymentInstructions = {
    fawry: cleanText(incomingInstructions.fawry, 500),
    vodafone_cash: cleanText(incomingInstructions.vodafone_cash, 500),
    instapay: cleanText(incomingInstructions.instapay, 500),
  };
  if (Object.entries(payments).some(([method, enabled]) => enabled && paymentInstructions[method as PaymentMethod].length < 4)) {
    throw new HttpsError('failed-precondition', 'أدخل بيانات الدفع قبل تفعيل الطريقة للعميل.');
  }
  const incomingLoyalty = request.data?.loyalty || {};
  const pointsPer100Egp = Number(incomingLoyalty.pointsPer100Egp);
  const valuePerPoint = Number(incomingLoyalty.valuePerPoint);
  const maxRedemptionPercent = Number(incomingLoyalty.maxRedemptionPercent);
  if (!Number.isInteger(pointsPer100Egp) || pointsPer100Egp < 1 || pointsPer100Egp > 1000 || !Number.isFinite(valuePerPoint) || valuePerPoint < 0.01 || valuePerPoint > 1000 || !Number.isInteger(maxRedemptionPercent) || maxRedemptionPercent < 1 || maxRedemptionPercent > 50) {
    throw new HttpsError('invalid-argument', 'إعدادات نقاط الولاء غير صالحة.');
  }
  const loyalty = { active: incomingLoyalty.active === true, pointsPer100Egp, valuePerPoint, maxRedemptionPercent };
  await db.runTransaction(async (transaction) => {
    transaction.set(db.collection('settings').doc('storefront_public'), { pickupAddress, pickupInstructions, contactPhone, payments, paymentInstructions, loyalty, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(auditRef(), { actorUid: admin.uid, action: 'settings.storefront_updated', targetId: 'storefront_public', createdAt: FieldValue.serverTimestamp(), outcome: 'success' });
  });
  return { ok: true };
});

export const updateStorefrontInventory = onCall(async (request) => {
  const admin = requireAdmin(request);
  const productId = safeId(request.data?.productId);
  const requestedVariants = request.data?.variants;
  if (!Array.isArray(requestedVariants) || requestedVariants.length < 1 || requestedVariants.length > 30) {
    throw new HttpsError('invalid-argument', 'قائمة ألوان المنتج غير صالحة.');
  }
  const updates = new Map<string, { stock: number; sku: string; barcode: string; price?: number | null; images?: string[] }>();
  for (const raw of requestedVariants as Array<Record<string, unknown>>) {
    const variantId = safeId(raw.variantId);
    const stock = Number(raw.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 100_000 || updates.has(variantId)) {
      throw new HttpsError('invalid-argument', 'عدد المخزون غير صالح.');
    }
    let price: number | null | undefined;
    if (raw.price !== undefined) {
      if (raw.price === null || raw.price === '') price = null;
      else {
        price = Number(raw.price);
        if (!Number.isFinite(price) || price < 0 || price > 10_000_000) throw new HttpsError('invalid-argument', 'سعر اللون غير صالح.');
      }
    }
    let images: string[] | undefined;
    if (raw.images !== undefined) {
      if (!Array.isArray(raw.images) || raw.images.length > 6) throw new HttpsError('invalid-argument', 'صور اللون غير صالحة.');
      images = raw.images.map((image) => cleanText(image, 1800));
      if (images.some((image) => !(/^https:\/\//i.test(image) || (/^\/(?!\/)/.test(image))))) throw new HttpsError('invalid-argument', 'رابط صورة المنتج غير صالح.');
    }
    updates.set(variantId, { stock, sku: cleanText(raw.sku, 50), barcode: cleanText(raw.barcode, 50), ...(price !== undefined ? { price } : {}), ...(images ? { images } : {}) });
  }
  const productRef = db.collection('products').doc(productId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(productRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'المنتج غير موجود.');
    const product = snapshot.data() as ProductRecord;
    const variants = Array.isArray(product.variants) ? [...product.variants] as Array<Record<string, unknown>> : [];
    const activeVariants = variants.filter((variant) => variant.active !== false);
    if (activeVariants.length !== updates.size || activeVariants.some((variant) => !updates.has(String(variant.id ?? '')))) {
      throw new HttpsError('failed-precondition', 'تغيرت ألوان المنتج. حدّث القائمة ثم أعد الحفظ.');
    }
    const updatedVariants = variants.map((variant) => {
      if (variant.active === false) return variant;
      const update = updates.get(String(variant.id ?? ''));
      if (!update) return variant;
      const next: Record<string, unknown> = { ...variant, active: true, stock: update.stock, sku: update.sku, barcode: update.barcode, ...(update.images ? { images: update.images } : {}) };
      if (update.price === null) delete next.price;
      else if (typeof update.price === 'number') next.price = update.price;
      return next;
    });
    transaction.update(productRef, { variants: updatedVariants, stockEstimate: false, inventoryUpdatedAt: FieldValue.serverTimestamp(), inventoryUpdatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(auditRef(), { actorUid: admin.uid, action: 'product.inventory_updated', targetId: productId, createdAt: FieldValue.serverTimestamp(), outcome: 'success', variants: [...updates.entries()].map(([variantId, value]) => ({ variantId, stock: value.stock })) });
  });
  return { ok: true };
});

export const saveStorefrontCoupon = onCall(async (request) => {
  const admin = requireAdmin(request);
  const code = cleanText(request.data?.code, 30).toUpperCase();
  const discountType = request.data?.discountType === 'fixed' ? 'fixed' : 'percent';
  const value = Number(request.data?.value);
  const maxUses = Math.floor(Number(request.data?.maxUses) || 0);
  const active = request.data?.active === true;
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new HttpsError('invalid-argument', 'كود الخصم يجب أن يتكون من 3 إلى 30 حرفاً أو رقماً.');
  if (!Number.isFinite(value) || value <= 0 || (discountType === 'percent' && value > 100) || (discountType === 'fixed' && value > 10_000_000)) throw new HttpsError('invalid-argument', 'قيمة الخصم غير صالحة.');
  if (!Number.isInteger(maxUses) || maxUses < 0 || maxUses > 1_000_000) throw new HttpsError('invalid-argument', 'حد الاستخدام غير صالح.');
  const couponRef = db.collection('coupons').doc(code);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(couponRef);
    const usedCount = Math.max(0, Number(existing.data()?.usedCount) || 0);
    transaction.set(couponRef, { code, discountType, value: roundMoney(value), maxUses, usedCount, active, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid, ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    transaction.set(auditRef(), { actorUid: admin.uid, action: 'coupon.saved', targetId: code, createdAt: FieldValue.serverTimestamp(), outcome: 'success' });
  });
  return { ok: true };
});

export const saveStorefrontBanner = onCall(async (request) => {
  const admin = requireAdmin(request);
  const bannerId = request.data?.id ? safeId(request.data.id, 80) : `banner-${randomBytes(8).toString('hex')}`;
  const titleAr = cleanText(request.data?.titleAr, 100);
  const titleEn = cleanText(request.data?.titleEn, 100);
  const descriptionAr = cleanText(request.data?.descriptionAr, 300);
  const descriptionEn = cleanText(request.data?.descriptionEn, 300);
  const imageUrl = cleanText(request.data?.imageUrl, 1800);
  const couponCode = cleanText(request.data?.couponCode, 30).toUpperCase();
  const destination = cleanText(request.data?.destination || '/shop/offers', 160);
  const active = request.data?.active === true;
  const parseDate = (value: unknown): Timestamp | null => {
    const raw = cleanText(value, 40);
    if (!raw) return null;
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) throw new HttpsError('invalid-argument', 'تاريخ الحملة غير صالح.');
    return Timestamp.fromDate(date);
  };
  const startsAt = parseDate(request.data?.startsAt);
  const endsAt = parseDate(request.data?.endsAt);
  if (titleAr.length < 2 || titleEn.length < 2) throw new HttpsError('invalid-argument', 'اكتب عنوان الحملة بالعربية والإنجليزية.');
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new HttpsError('invalid-argument', 'رابط صورة الحملة غير صالح.');
  if (startsAt && endsAt && startsAt.toMillis() > endsAt.toMillis()) throw new HttpsError('invalid-argument', 'تاريخ البداية يجب أن يسبق تاريخ النهاية.');
  if (!/^\/shop(?:[/?#]|$)/.test(destination)) throw new HttpsError('invalid-argument', 'وجهة الحملة يجب أن تكون داخل المتجر.');
  if (couponCode && !/^[A-Z0-9_-]{3,30}$/.test(couponCode)) throw new HttpsError('invalid-argument', 'كود الخصم غير صالح.');
  const bannerRef = db.collection('banners').doc(bannerId);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(bannerRef);
    const payload: Record<string, unknown> = {
      id: bannerId, titleAr, titleEn, descriptionAr, descriptionEn, imageUrl, couponCode,
      destination, active, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid,
    };
    payload.startsAt = startsAt || FieldValue.delete();
    payload.endsAt = endsAt || FieldValue.delete();
    if (!existing.exists) payload.createdAt = FieldValue.serverTimestamp();
    transaction.set(bannerRef, payload, { merge: true });
    transaction.set(auditRef(), { actorUid: admin.uid, action: 'banner.saved', targetId: bannerId, createdAt: FieldValue.serverTimestamp(), outcome: 'success' });
  });
  return { ok: true, id: bannerId };
});
