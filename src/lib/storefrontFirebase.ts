import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Firestore,
} from 'firebase/firestore';
import { WebOrder, WebOrderStatus, WebProduct } from '../types/optics';
import {
  buildStorefrontSlug,
  buildStorefrontStableNumericId,
  mapWebProductToStorefrontLens,
  mapWebProductToStorefrontProduct,
  normalizeWebOrder,
} from '../utils/optics';

export function isStorefrontPermissionError(err: unknown): boolean {
  if (!err) return false;
  const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === 'permission-denied' ||
    /missing or insufficient permissions/i.test(msg) ||
    /permission-denied/i.test(msg)
  );
}

export function formatStorefrontErrorMessage(
  err: unknown,
  email?: string | null,
  context: 'catalog' | 'orders' = 'catalog'
): string {
  const activeEmail = email || storefrontAuth.currentUser?.email || 'الحالي';
  if (isStorefrontPermissionError(err)) {
    const actionLabel =
      context === 'orders'
        ? 'قراءة أو تحديث طلبات المتجر'
        : 'تحديث منتجات قاعدة بيانات الموقع';
    return `الحساب المرتبط (${activeEmail}) لا يملك صلاحية ${actionLabel}. اضغط «تغيير حساب المتجر» وسجّل الدخول بحساب الإدارة المعتمد لموقع الويب.`;
  }
  const msg = err instanceof Error ? err.message : String(err || '');
  return msg
    ? `تعذر ${context === 'orders' ? 'مزامنة طلبات الموقع' : 'تحديث قاعدة الموقع'}: ${msg}`
    : 'تعذر الاتصال بقاعدة بيانات الموقع';
}

// Public web client config used by https://mido-web-site.vercel.app
const STOREFRONT_FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0748882445',
  appId: '1:1070147434597:web:bfa337219583b627ee6e8c',
  apiKey: 'AIzaSyA1hJQqH2ATi46oX-pZMjuABM4TvUpnzdc',
  authDomain: 'gen-lang-client-0748882445.firebaseapp.com',
  storageBucket: 'gen-lang-client-0748882445.firebasestorage.app',
  messagingSenderId: '1070147434597',
};

const STOREFRONT_DATABASE_ID = 'ai-studio-midooptics-b2b8b67a-82b2-4742-970e-5fe3b0f6abca';
const STOREFRONT_APP_NAME = 'midoStorefront';

function getOrInitStorefrontApp(): FirebaseApp {
  const existing = getApps().find((app) => app.name === STOREFRONT_APP_NAME);
  if (existing) return existing;
  return initializeApp(STOREFRONT_FIREBASE_CONFIG, STOREFRONT_APP_NAME);
}

const storefrontApp = getOrInitStorefrontApp();
export const storefrontAuth = getAuth(storefrontApp);
export const storefrontDb: Firestore = initializeFirestore(
  storefrontApp,
  { experimentalAutoDetectLongPolling: true },
  STOREFRONT_DATABASE_ID
);

const storefrontProvider = new GoogleAuthProvider();
storefrontProvider.setCustomParameters({ prompt: 'select_account' });

export function onStorefrontAuthChanged(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(storefrontAuth, cb);
}

export async function signInStorefrontAdmin(): Promise<User> {
  const res = await signInWithPopup(storefrontAuth, storefrontProvider);
  return res.user;
}

export async function signOutStorefrontAdmin(): Promise<void> {
  await signOut(storefrontAuth);
}

export interface StorefrontSyncResult {
  ok: boolean;
  target: 'products' | 'lenses';
  docId: string;
  imageTrimmed?: boolean;
  reason?: string;
}

export async function upsertStorefrontCatalogItem(
  product: WebProduct
): Promise<StorefrontSyncResult> {
  if (!storefrontAuth.currentUser) {
    return {
      ok: false,
      target: product.category === 'lenses' ? 'lenses' : 'products',
      docId: product.id,
      reason: 'storefront-auth-required',
    };
  }

  if (product.category === 'lenses') {
    const payload = mapWebProductToStorefrontLens(product);
    await setDoc(doc(storefrontDb, 'lenses', payload.docId), {
      name: payload.name,
      subtitle: payload.subtitle,
      price: payload.price,
      imageUrl: payload.imageUrl,
      details: payload.details,
      fullDescription: payload.fullDescription,
      refractiveIndex: payload.refractiveIndex,
      published: payload.published,
      sortOrder: payload.sortOrder,
      updatedAt: serverTimestamp(),
    });
    return {
      ok: true,
      target: 'lenses',
      docId: payload.docId,
      imageTrimmed: Boolean(product.photo && product.photo.startsWith('data:')),
    };
  }

  const payload = mapWebProductToStorefrontProduct(product);
  const productRef = doc(storefrontDb, 'products', payload.slug);
  try {
    await setDoc(productRef, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, target: 'products', docId: payload.slug };
  } catch (err) {
    // Retry without inline base64 photo if storefront rules constrain image length
    const hasInlineImg = Boolean(product.photo && product.photo.startsWith('data:'));
    if (hasInlineImg) {
      await setDoc(productRef, {
        ...payload,
        variants: payload.variants.map((v) => ({ ...v, images: [] })),
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        target: 'products',
        docId: payload.slug,
        imageTrimmed: true,
      };
    }
    throw err;
  }
}

export async function deleteStorefrontCatalogItem(product: WebProduct): Promise<void> {
  if (!storefrontAuth.currentUser) return;
  if (product.category === 'lenses') {
    const lensDocId = `lens-${buildStorefrontStableNumericId(product.id)}`;
    await deleteDoc(doc(storefrontDb, 'lenses', lensDocId));
    return;
  }
  const slug = buildStorefrontSlug(product.id, 'prod');
  await deleteDoc(doc(storefrontDb, 'products', slug));
}

export async function updateStorefrontOrderStatus(
  orderCode: string,
  status: WebOrderStatus
): Promise<boolean> {
  if (!storefrontAuth.currentUser) return false;
  const docId = `ord-${buildStorefrontSlug(orderCode, 'ord')}`;
  const orderRef = doc(storefrontDb, 'orders', docId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) return false;
  await updateDoc(orderRef, {
    status,
    updatedAt: serverTimestamp(),
  });
  return true;
}

function normalizeDeletedOrderCode(value: unknown): string {
  return String(value || '').trim().toUpperCase().slice(0, 64);
}

export async function fetchStorefrontDeletedOrderCodes(): Promise<string[]> {
  if (!storefrontAuth.currentUser) {
    throw new Error('قم بتسجيل الدخول لإدارة المتجر لمزامنة الطلبات المحذوفة');
  }
  const snapshot = await getDocs(collection(storefrontDb, 'deleted_order_codes'));
  return snapshot.docs
    .map((item) => normalizeDeletedOrderCode(item.data().orderCode || item.id))
    .filter(Boolean);
}

export async function saveStorefrontDeletedOrderCodes(orderCodes: string[]): Promise<void> {
  if (!storefrontAuth.currentUser) {
    throw new Error('قم بتسجيل الدخول لإدارة المتجر لحفظ الحذف على الموقع');
  }
  const codes = Array.from(new Set(orderCodes.map(normalizeDeletedOrderCode).filter(Boolean)));
  for (let start = 0; start < codes.length; start += 400) {
    const batch = writeBatch(storefrontDb);
    for (const orderCode of codes.slice(start, start + 400)) {
      batch.set(doc(storefrontDb, 'deleted_order_codes', orderCode), {
        orderCode,
        deletedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export async function deleteStorefrontOrder(orderCode: string): Promise<void> {
  if (!storefrontAuth.currentUser) return;
  const normalizedCode = normalizeDeletedOrderCode(orderCode);
  if (!normalizedCode) return;
  await saveStorefrontDeletedOrderCodes([normalizedCode]);
  const docId = `ord-${buildStorefrontSlug(normalizedCode, 'ord')}`;
  await deleteDoc(doc(storefrontDb, 'orders', docId));
}

export function subscribeStorefrontDeletedOrderCodes(
  onCodes: (codes: string[]) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(storefrontDb, 'deleted_order_codes'),
    (snapshot) => {
      onCodes(
        snapshot.docs
          .map((item) => normalizeDeletedOrderCode(item.data().orderCode || item.id))
          .filter(Boolean)
      );
    },
    onError
  );
}

export function subscribeStorefrontOrders(
  onOrders: (orders: WebOrder[]) => void,
  onError: (error: Error) => void
): () => void {
  const ordersCol = collection(storefrontDb, 'orders');
  return onSnapshot(
    ordersCol,
    (snapshot) => {
      const parsed: WebOrder[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const code = String(data.orderCode || docSnap.id.replace(/^ord-/, ''));
        const normalized = normalizeWebOrder(
          {
            ...data,
            id: `wo_${buildStorefrontSlug(code, 'ord')}`,
            orderCode: code,
          },
          'storefront_firebase'
        );
        if (normalized) parsed.push(normalized);
      }
      onOrders(parsed.sort((a, b) => b.createdAtMs - a.createdAtMs));
    },
    (err) => {
      onError(err);
    }
  );
}

export async function fetchStorefrontOrdersOnce(): Promise<WebOrder[]> {
  if (!storefrontAuth.currentUser) {
    throw new Error('قم بتسجيل الدخول لإدارة المتجر لقراءة الطلبات من قاعدة بيانات الموقع');
  }
  const snap = await getDocs(collection(storefrontDb, 'orders'));
  const parsed: WebOrder[] = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const code = String(data.orderCode || docSnap.id.replace(/^ord-/, ''));
    const normalized = normalizeWebOrder(
      {
        ...data,
        id: `wo_${buildStorefrontSlug(code, 'ord')}`,
        orderCode: code,
      },
      'storefront_firebase'
    );
    if (normalized) parsed.push(normalized);
  }
  return parsed.sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function fetchPublicStorefrontCatalog(): Promise<{
  publishedProductsCount: number;
  publishedLensesCount: number;
}> {
  const [prodsSnap, lensesSnap] = await Promise.all([
    getDocs(query(collection(storefrontDb, 'products'), where('published', '==', true))),
    getDocs(query(collection(storefrontDb, 'lenses'), where('published', '==', true))),
  ]);
  return {
    publishedProductsCount: prodsSnap.size,
    publishedLensesCount: lensesSnap.size,
  };
}
