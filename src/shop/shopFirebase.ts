import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  ConfirmationResult,
  RecaptchaVerifier,
  User,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithPhoneNumber,
  signOut,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  collection,
  doc,
  initializeFirestore,
  onSnapshot,
  orderBy,
  query,
  where,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getDownloadURL, getStorage, ref, uploadBytesResumable } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_STOREFRONT_API_KEY || 'AIzaSyA1hJQqH2ATi46oX-pZMjuABM4TvUpnzdc',
  authDomain: import.meta.env.VITE_STOREFRONT_AUTH_DOMAIN || 'gen-lang-client-0748882445.firebaseapp.com',
  projectId: import.meta.env.VITE_STOREFRONT_PROJECT_ID || 'gen-lang-client-0748882445',
  storageBucket: import.meta.env.VITE_STOREFRONT_STORAGE_BUCKET || 'gen-lang-client-0748882445.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_STOREFRONT_MESSAGING_SENDER_ID || '1070147434597',
  appId: import.meta.env.VITE_STOREFRONT_APP_ID || '1:1070147434597:web:bfa337219583b627ee6e8c',
};

function getShopApp(): FirebaseApp {
  return getApps().find((app) => app.name === 'midoCustomerAuth') || initializeApp(firebaseConfig, 'midoCustomerAuth');
}

const shopApp = getShopApp();
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
if (appCheckSiteKey) {
  initializeAppCheck(shopApp, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
}
export const shopAuth = getAuth(shopApp);
export const shopFunctions = getFunctions(shopApp, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'europe-west1');
export const shopStorage = getStorage(shopApp);
export const shopDb = initializeFirestore(
  shopApp,
  { experimentalAutoDetectLongPolling: true },
  import.meta.env.VITE_STOREFRONT_DATABASE_ID || 'ai-studio-midooptics-b2b8b67a-82b2-4742-970e-5fe3b0f6abca'
);

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(shopAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(shopFunctions, '127.0.0.1', 5001);
  connectFirestoreEmulator(shopDb, '127.0.0.1', 8080);
  connectStorageEmulator(shopStorage, '127.0.0.1', 9199);
}

export interface CatalogVariant {
  id: string;
  colorName: string;
  colorHex: string;
  stock: number;
  active?: boolean;
  images: string[];
  price?: number;
  sku?: string;
  barcode?: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  discountPrice?: number;
  shortDesc: string;
  fullDesc: string;
  brand?: string;
  published: boolean;
  stockEstimate?: boolean;
  featured?: boolean;
  newArrival?: boolean;
  variants: CatalogVariant[];
  imageUrl?: string;
  images: string[];
}

export function toProduct(id: string, data: Record<string, unknown>): CatalogProduct {
  const cleanImage = (value: unknown) => {
    const image = String(value || '').trim();
    return (/^https:\/\//i.test(image) || /^\/(?!\/)/.test(image)) && image.length <= 1800 ? image : '';
  };
  const rawVariants = Array.isArray(data.variants) ? data.variants.filter((raw) => (raw as Record<string, unknown>)?.active !== false) : [];
  const variants = rawVariants.map((raw, index) => {
    const value = (raw || {}) as Record<string, unknown>;
    const images = Array.isArray(value.images) ? value.images.map(cleanImage).filter(Boolean) : [];
    return {
      id: String(value.id ?? index),
      colorName: String(value.colorName || value.name || 'Default'),
      colorHex: /^#[0-9a-f]{6}$/i.test(String(value.colorHex || '')) ? String(value.colorHex) : '#c9a24b',
      stock: Math.max(0, Number(value.stock) || 0),
      active: value.active !== false,
      images,
      ...(Number.isFinite(Number(value.price)) && Number(value.price) > 0 ? { price: Number(value.price) } : {}),
      ...(value.sku ? { sku: String(value.sku) } : {}),
      ...(value.barcode ? { barcode: String(value.barcode) } : {}),
    } satisfies CatalogVariant;
  });
  const images = Array.isArray(data.images) ? data.images.map(cleanImage).filter(Boolean) : [];
  const imageUrl = cleanImage(data.imageUrl);
  return {
    id,
    name: String(data.name || 'MIDO OPTICS'),
    category: String(data.category || 'prescription'),
    price: Math.max(0, Number(data.price) || 0),
    ...(Number(data.discountPrice) > 0 ? { discountPrice: Number(data.discountPrice) } : {}),
    shortDesc: String(data.shortDesc || data.subtitle || ''),
    fullDesc: String(data.fullDesc || data.description || data.shortDesc || ''),
    brand: typeof data.brand === 'string' ? data.brand : undefined,
    published: data.published === true,
    stockEstimate: data.stockEstimate === true,
    featured: data.featured === true,
    newArrival: data.newArrival === true,
    variants,
    imageUrl,
    images: images.length ? images : imageUrl ? [imageUrl] : [],
  };
}

export function subscribeCatalog(onData: (products: CatalogProduct[]) => void, onError: (error: Error) => void): () => void {
  const productsQuery = query(collection(shopDb, 'products'), where('published', '==', true));
  return onSnapshot(productsQuery, (snapshot) => {
    const products = snapshot.docs.map((item) => toProduct(item.id, item.data()));
    onData(products);
  }, (error) => onError(error));
}

export function subscribeCustomerOrders(uid: string, onData: (orders: StoreOrder[]) => void, onError: (error: Error) => void): () => void {
  const ordersQuery = query(collection(shopDb, 'orders'), where('customerUid', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(ordersQuery, (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<StoreOrder, 'id'>) })));
  }, (error) => onError(error));
}

export interface StoreOrder {
  id: string;
  customerUid?: string;
  orderCode: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  items: Array<{ productName: string; colorName: string; colorHex: string; imageUrl: string; quantity: number; unitPrice: number; lineTotal: number }>;
  total: number;
  depositAmount: number;
  balanceAmount: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  createdAt?: { toDate?: () => Date };
  createdAtMs?: number;
  subtotal?: number;
  discountAmount?: number;
  pointsRedeemed?: number;
  pointsDiscountAmount?: number;
  pointsEarned?: number;
  cancellationReason?: string;
  paymentReference?: string;
  refundReference?: string;
  pickupAddressSnapshot?: string;
  paymentInstructionSnapshot?: string;
}

export async function sendPhoneCode(phone: string, verifier: RecaptchaVerifier): Promise<ConfirmationResult> {
  shopAuth.languageCode = document.documentElement.lang === 'en' ? 'en' : 'ar';
  return signInWithPhoneNumber(shopAuth, phone, verifier);
}

export async function signOutCustomer(): Promise<void> {
  await signOut(shopAuth);
}

export async function signInShopAdmin(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return (await signInWithPopup(shopAuth, provider)).user;
}

export function uploadStorefrontProductImage(productId: string, variantId: string, file: File, onProgress: (percent: number) => void): Promise<string> {
  const accepted = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
  if (!accepted.has(file.type) || file.size < 1 || file.size >= 10 * 1024 * 1024) {
    return Promise.reject(new Error('اختر صورة JPEG أو PNG أو WebP أو AVIF أقل من 10 ميجابايت.'));
  }
  const pathPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const fileName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'product-image';
  const imageRef = ref(shopStorage, `product-images/${pathPart(productId)}/${pathPart(variantId)}/${Date.now()}-${fileName}`);
  const task = uploadBytesResumable(imageRef, file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on('state_changed', (snapshot) => onProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, () => {
      void getDownloadURL(task.snapshot.ref).then(resolve, reject);
    });
  });
}

export function watchCustomerAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(shopAuth, callback);
}

export function callable<TRequest, TResponse>(name: string) {
  return httpsCallable<TRequest, TResponse>(shopFunctions, name);
}

export const shopUserRef = (uid: string) => doc(shopDb, 'users', uid);
