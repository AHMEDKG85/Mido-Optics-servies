import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BarChart3, Check, Download, Heart, LoaderCircle, LogOut, Menu, Minus,
  Moon, Package, Plus, Search, ShieldCheck, ShoppingBag, Sun, UserRound, X,
} from 'lucide-react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { RecaptchaVerifier, User } from 'firebase/auth';
import {
  CatalogProduct, CatalogVariant, callable, sendPhoneCode, shopAuth, shopDb, toProduct,
  signInShopAdmin, signOutCustomer, StoreOrder, subscribeCatalog, subscribeCustomerOrders, uploadStorefrontProductImage, watchCustomerAuth, shopUserRef,
} from './shopFirebase';
import { addCartLine, calculateCart, CartLine, cartLineKey, egyptianPhone, formatEgp, setCartQuantity } from './commerce';

type Locale = 'ar' | 'en';
type View = 'home' | 'catalog' | 'product' | 'cart' | 'checkout' | 'account' | 'orders' | 'wishlist' | 'invoice' | 'about' | 'contact' | 'policies' | 'offers' | 'admin';
type PaymentMethod = 'fawry' | 'vodafone_cash' | 'instapay';
type LoyaltySettings = { active: boolean; pointsPer100Egp: number; valuePerPoint: number; maxRedemptionPercent: number };
type ShopSettings = { pickupAddress?: string; pickupInstructions?: string; payments?: Partial<Record<PaymentMethod, boolean>>; paymentInstructions?: Partial<Record<PaymentMethod, string>>; contactPhone?: string; loyalty?: LoyaltySettings; updatedAt?: unknown };
type ShopCoupon = { id: string; code: string; discountType: 'fixed' | 'percent'; value: number; maxUses: number; usedCount: number; active: boolean };
type ShopStaff = { uid: string; email: string; displayName: string; phoneNumber: string; admin: boolean; owner: boolean; disabled: boolean };
type ShopBanner = { id: string; titleAr: string; titleEn: string; descriptionAr: string; descriptionEn: string; imageUrl?: string; couponCode?: string; destination: string; active: boolean; startsAt?: { toMillis?: () => number }; endsAt?: { toMillis?: () => number } };

function csvValue(value: unknown) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+@\-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

const COPY = {
  ar: {
    announcement: 'اختيارات بصرية تصنع حضورك', home: 'الرئيسية', shop: 'تسوّق', offers: 'العروض', account: 'حسابي', orders: 'طلباتي', wishlist: 'المفضلة',
    collection: 'مجموعة مختارة بعناية', title: 'رؤية أوضح.\nحضور لا يُنسى.', intro: 'نظارات مختارة بتفاصيل دقيقة، وخدمة شخصية من ميدو أوبتكس.', discover: 'اكتشف المجموعة', featured: 'مختاراتنا', all: 'كل المنتجات', search: 'ابحث عن إطار أو عدسة',
    glasses: 'نظارات طبية', sunglasses: 'نظارات شمسية', contacts: 'عدسات لاصقة', accessories: 'إكسسوارات', noProducts: 'لا توجد منتجات منشورة حالياً.', loading: 'نحمّل المجموعة…',
    details: 'التفاصيل', chooseColor: 'اختر اللون', stock: 'المتاح', add: 'أضف إلى الحقيبة', unavailable: 'نفد هذا اللون', cart: 'حقيبة التسوق', emptyCart: 'حقيبتك فارغة الآن', continue: 'تابع التسوق', checkout: 'إتمام الطلب', remove: 'إزالة', subtotal: 'الإجمالي الفرعي', deposit: 'العربون (٣٠٪)', balance: 'المتبقي عند الاستلام (٧٠٪)',
    pickup: 'استلام من الفرع فقط', fullName: 'الاسم بالكامل', phone: 'رقم الهاتف', email: 'البريد الإلكتروني (اختياري)', notes: 'ملاحظات الطلب', method: 'طريقة دفع العربون', placeOrder: 'تأكيد الطلب', noPayment: 'طرق الدفع غير مهيأة حالياً. تواصل مع المتجر لإتمام الطلب.',
    otpTitle: 'الدخول برقم الهاتف', otpText: 'سنرسل رمز تحقق برسالة SMS إلى رقمك.', sendCode: 'إرسال الرمز', enterCode: 'رمز التحقق', verify: 'تحقق وتابع', sendAgain: 'إعادة الإرسال', profileName: 'اسمك', signOut: 'تسجيل الخروج', signIn: 'دخول / حساب جديد',
    order: 'طلب', invoice: 'فاتورة', print: 'طباعة / حفظ PDF', status: 'الحالة', payment: 'حالة الدفع', pickupAddress: 'عنوان الاستلام', noOrders: 'لا توجد طلبات مرتبطة بهذا الحساب بعد.', accountHint: 'سجّل برقم الهاتف لعرض طلباتك وفواتيرك ومتابعتها.',
    admin: 'إدارة المتجر', adminTitle: 'مركز إدارة المتجر', overview: 'الطلبات المباشرة', config: 'إعداد الاستلام والدفع', paymentConfirm: 'تأكيد استلام العربون', update: 'حفظ الإعدادات', delete: 'حذف نهائي', deletePrompt: 'سيُحذف الطلب نهائياً مع تسجيل أثر الحذف. هل تريد المتابعة؟',
    about: 'عن ميدو أوبتكس', contact: 'تواصل معنا', policies: 'السياسات', save: 'حفظ', editProfile: 'تعديل البيانات', cancel: 'إلغاء', back: 'رجوع', success: 'تم بنجاح', error: 'حدث خطأ. حاول مرة أخرى.', dark: 'الوضع الداكن', language: 'English',
    networkError: 'تعذر تحميل المنتجات. تحقق من اتصال قاعدة بيانات المتجر وقواعد القراءة العامة.', retry: 'إعادة المحاولة', authRequired: 'تحتاج إلى التحقق برقم الهاتف أولاً.', permission: 'ليس لديك صلاحية إدارة المتجر. اطلب من مسؤول Firebase منح حسابك دور الإدارة.',
  },
  en: {
    announcement: 'Eyewear chosen for the way you see', home: 'Home', shop: 'Shop', offers: 'Offers', account: 'Account', orders: 'Orders', wishlist: 'Wishlist',
    collection: 'A considered collection', title: 'See clearly.\nArrive beautifully.', intro: 'Frames chosen with precision, and personal service from Mido Optics.', discover: 'Explore the collection', featured: 'Curated for you', all: 'All pieces', search: 'Search frames or lenses',
    glasses: 'Optical frames', sunglasses: 'Sunglasses', contacts: 'Contact lenses', accessories: 'Accessories', noProducts: 'No published products are available yet.', loading: 'Loading the collection…',
    details: 'Details', chooseColor: 'Choose a color', stock: 'Available', add: 'Add to bag', unavailable: 'This color is unavailable', cart: 'Shopping bag', emptyCart: 'Your bag is empty', continue: 'Continue shopping', checkout: 'Continue to checkout', remove: 'Remove', subtotal: 'Subtotal', deposit: 'Deposit (30%)', balance: 'Due at pickup (70%)',
    pickup: 'Store pickup only', fullName: 'Full name', phone: 'Phone number', email: 'Email (optional)', notes: 'Order notes', method: 'Deposit payment method', placeOrder: 'Place order', noPayment: 'Payment methods are not configured yet. Please contact the store to place an order.',
    otpTitle: 'Sign in with your phone', otpText: 'We will send a verification code by SMS.', sendCode: 'Send code', enterCode: 'Verification code', verify: 'Verify and continue', sendAgain: 'Send another code', profileName: 'Your name', signOut: 'Sign out', signIn: 'Sign in / Create account',
    order: 'Order', invoice: 'Invoice', print: 'Print / Save PDF', status: 'Status', payment: 'Payment status', pickupAddress: 'Pickup location', noOrders: 'No orders are linked to this account yet.', accountHint: 'Sign in with your phone to view and track orders and invoices.',
    admin: 'Store admin', adminTitle: 'Store operations', overview: 'Live orders', config: 'Pickup and payment setup', paymentConfirm: 'Confirm deposit received', update: 'Save settings', delete: 'Delete permanently', deletePrompt: 'This permanently deletes the order and records a tombstone. Continue?',
    about: 'About Mido Optics', contact: 'Contact', policies: 'Policies', save: 'Save', editProfile: 'Edit details', cancel: 'Cancel', back: 'Back', success: 'Done', error: 'Something went wrong. Try again.', dark: 'Dark mode', language: 'العربية',
    networkError: 'Products could not be loaded. Check the storefront database and public read rules.', retry: 'Try again', authRequired: 'Verify your phone number first.', permission: 'You do not have storefront admin access. Ask the Firebase owner to grant the admin role.',
  },
} as const;

const categoryKeys: Record<string, keyof typeof COPY.ar> = {
  prescription: 'glasses', medical_glasses: 'glasses', optical_frames: 'glasses', sunglasses: 'sunglasses', contact_lenses: 'contacts', accessories: 'accessories',
};
const methodKeys: Record<PaymentMethod, string> = { fawry: 'Fawry', vodafone_cash: 'Vodafone Cash', instapay: 'InstaPay' };
const STATUS_COPY: Record<string, Record<Locale, string>> = {
  new: { ar: 'جديد', en: 'New' }, awaiting_payment: { ar: 'بانتظار العربون', en: 'Awaiting deposit' },
  payment_verification: { ar: 'مراجعة الدفع', en: 'Payment review' }, verification_pending: { ar: 'بانتظار المراجعة', en: 'Awaiting review' },
  awaiting_deposit: { ar: 'بانتظار العربون', en: 'Awaiting deposit' }, deposit_verified: { ar: 'تم التحقق من العربون', en: 'Deposit verified' }, paid: { ar: 'تم سداد الطلب', en: 'Paid in full' },
  confirmed: { ar: 'مؤكد', en: 'Confirmed' }, processing: { ar: 'قيد التجهيز', en: 'Processing' },
  ready_for_pickup: { ar: 'جاهز للاستلام', en: 'Ready for pickup' }, delivered: { ar: 'تم التسليم', en: 'Delivered' },
  cancelled: { ar: 'ملغي', en: 'Cancelled' }, refunded: { ar: 'مسترد', en: 'Refunded' },
};
const emptyCart: CartLine[] = [];

function safeRead<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

function statusText(status: string, locale: Locale) {
  return STATUS_COPY[status]?.[locale] || status.replaceAll('_', ' ');
}

function dateTimeLocalValue(value?: { toMillis?: () => number }) {
  if (!value?.toMillis) return '';
  const date = new Date(value.toMillis());
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function useShopRoute() {
  const basePath = location.pathname.match(/^\/MidoOpticWeb(?=\/|$)/)?.[0] || '';
  const cleanPath = () => location.pathname.replace(/^\/MidoOpticWeb(?=\/|$)/, '') || '/';
  const [route, setRoute] = useState(() => ({ view: (new URLSearchParams(location.search).get('view') || (cleanPath() === '/shop-admin' ? 'admin' : cleanPath() === '/shop/offers' ? 'offers' : 'home')) as View, product: new URLSearchParams(location.search).get('product') || '' }));
  useEffect(() => {
    const update = () => setRoute({ view: (new URLSearchParams(location.search).get('view') || (cleanPath() === '/shop-admin' ? 'admin' : cleanPath() === '/shop/offers' ? 'offers' : 'home')) as View, product: new URLSearchParams(location.search).get('product') || '' });
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const go = useCallback((view: View, product = '') => {
    const admin = view === 'admin';
    const params = new URLSearchParams();
    if (view !== 'home' && !admin) params.set('view', view);
    if (product) params.set('product', product);
    const path = `${basePath}${admin ? '/shop-admin' : view === 'home' ? '/' : '/shop'}`;
    const suffix = params.size ? `?${params.toString()}` : '';
    history.pushState({}, '', `${path}${suffix}`);
    setRoute({ view, product });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  return { ...route, go };
}

function ProductImage({ src, alt, className = '' }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={`shop-image-placeholder ${className}`} aria-label={alt}><span className="shop-orbit" /><span className="shop-placeholder-brand">mido optics</span></div>;
  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />;
}

function AuthDialog({ locale, onClose, onSuccess }: { locale: Locale; onClose: () => void; onSuccess: (user: User) => void }) {
  const t = COPY[locale];
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const confirmation = useRef<Awaited<ReturnType<typeof sendPhoneCode>> | null>(null);
  useEffect(() => () => { verifier.current?.clear(); }, []);

  async function requestCode() {
    setBusy(true); setError('');
    try {
      const normalized = egyptianPhone(phone);
      if (!/^\+[1-9]\d{8,14}$/.test(normalized)) throw new Error(locale === 'ar' ? 'أدخل رقم هاتف بصيغة دولية صحيحة.' : 'Enter a valid international phone number.');
      verifier.current ||= new RecaptchaVerifier(shopAuth, recaptchaRef.current!, { size: 'invisible' });
      confirmation.current = await sendPhoneCode(normalized, verifier.current);
      setPhone(normalized); setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
      verifier.current?.clear(); verifier.current = null;
    } finally { setBusy(false); }
  }

  async function verifyCode() {
    setBusy(true); setError('');
    try {
      if (!confirmation.current) throw new Error(t.error);
      const result = await confirmation.current.confirm(code.trim());
      if (!result.user.phoneNumber) throw new Error(t.error);
      const profileName = name.trim() || result.user.displayName || '';
      if (profileName.length < 2) throw new Error(locale === 'ar' ? 'اكتب اسمك لحفظ حسابك.' : 'Enter your name to finish creating your account.');
      const saveProfile = callable<{ displayName: string }, { ok: boolean }>('saveCustomerProfile');
      await saveProfile({ displayName: profileName });
      onSuccess(result.user);
    } catch (err) { setError(err instanceof Error ? err.message : t.error); }
    finally { setBusy(false); }
  }

  return <div className="shop-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="shop-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <button className="shop-icon-btn shop-modal-close" onClick={onClose} aria-label={t.cancel}><X size={19} /></button>
      <span className="shop-kicker">MIDO OPTICS / ACCOUNT</span><h2 id="auth-title">{t.otpTitle}</h2><p>{t.otpText}</p>
      {step === 'phone' ? <>
        <label className="shop-label">{t.phone}<input autoFocus type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+20 10 1234 5678" dir="ltr" /></label>
        <button className="shop-button shop-button-dark shop-full" disabled={busy} onClick={requestCode}>{busy ? <LoaderCircle className="shop-spin" size={18} /> : t.sendCode}</button>
      </> : <>
        <label className="shop-label">{t.profileName}<input autoFocus value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label className="shop-label">{t.enterCode}<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" /></label>
        <button className="shop-button shop-button-dark shop-full" disabled={busy || code.length < 6} onClick={verifyCode}>{busy ? <LoaderCircle className="shop-spin" size={18} /> : t.verify}</button>
        <button className="shop-text-button shop-full" disabled={busy} onClick={() => { setStep('phone'); setCode(''); }}>{t.sendAgain}</button>
      </>}
      <div ref={recaptchaRef} />{error && <p className="shop-error" role="alert">{error}</p>}
      <p className="shop-privacy">{locale === 'ar' ? 'نستخدم رقمك لإدارة حسابك وطلباتك فقط.' : 'Your number is used to manage your account and orders.'}</p>
    </section>
  </div>;
}

export function ShopApp() {
  const route = useShopRoute();
  const [locale, setLocale] = useState<Locale>(() => safeRead('mido_shop_locale', 'ar'));
  const [dark, setDark] = useState(() => safeRead('mido_shop_theme', false));
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [banners, setBanners] = useState<ShopBanner[]>([]);
  const [promotionNow, setPromotionNow] = useState(Date.now());
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [cart, setCart] = useState<CartLine[]>(() => safeRead('mido_shop_cart', emptyCart));
  const [wishlist, setWishlist] = useState<string[]>(() => safeRead('mido_shop_wishlist', []));
  const [user, setUser] = useState<User | null>(shopAuth.currentUser);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [userName, setUserName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profileEmailDraft, setProfileEmailDraft] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [settings, setSettings] = useState<ShopSettings>({});
  const [admin, setAdmin] = useState(false);
  const [adminOrders, setAdminOrders] = useState<StoreOrder[]>([]);
  const [adminProducts, setAdminProducts] = useState<CatalogProduct[]>([]);
  const [storeOwner, setStoreOwner] = useState(false);
  const [adminStaff, setAdminStaff] = useState<ShopStaff[]>([]);
  const [staffPageToken, setStaffPageToken] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffUidDraft, setStaffUidDraft] = useState('');
  const [inventoryDrafts, setInventoryDrafts] = useState<Record<string, { stock: string; sku: string; barcode: string; price: string }>>({});
  const [imageUploadProgress, setImageUploadProgress] = useState<Record<string, number>>({});
  const [adminCoupons, setAdminCoupons] = useState<ShopCoupon[]>([]);
  const [adminBanners, setAdminBanners] = useState<ShopBanner[]>([]);
  const [couponDraft, setCouponDraft] = useState({ code: '', discountType: 'percent' as 'fixed' | 'percent', value: '', maxUses: '0', active: true });
  const [loyaltyDraft, setLoyaltyDraft] = useState({ active: false, pointsPer100Egp: '1', valuePerPoint: '1', maxRedemptionPercent: '25' });
  const [bannerDraft, setBannerDraft] = useState({ id: '', titleAr: '', titleEn: '', descriptionAr: '', descriptionEn: '', imageUrl: '', couponCode: '', destination: '/shop/offers', startsAt: '', endsAt: '', active: true });
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [adminError, setAdminError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeInvoice, setActiveInvoice] = useState<StoreOrder | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [paymentInstructions, setPaymentInstructions] = useState<Partial<Record<PaymentMethod, string>>>({});
  const checkoutRequest = useRef({ signature: '', key: '' });
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StoreOrder | null>(null);
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<StoreOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [paymentReferenceOrder, setPaymentReferenceOrder] = useState<StoreOrder | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [refundTarget, setRefundTarget] = useState<StoreOrder | null>(null);
  const [refundReference, setRefundReference] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [redeemPoints, setRedeemPoints] = useState('0');
  const [mobileMenu, setMobileMenu] = useState(false);
  const t = COPY[locale];
  const { subtotal, deposit, balance } = calculateCart(cart);

  useEffect(() => {
    const timer = window.setInterval(() => setPromotionNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('mido_shop_locale', JSON.stringify(locale)); localStorage.setItem('mido_shop_theme', JSON.stringify(dark)); localStorage.setItem('mido_shop_cart', JSON.stringify(cart)); localStorage.setItem('mido_shop_wishlist', JSON.stringify(wishlist)); }
    catch { /* Storage can be disabled; shopping continues in memory. */ }
  }, [locale, dark, cart, wishlist]);

  useEffect(() => {
    let active = true;
    let receivedInitialSnapshot = false;
    setCatalogLoading(true);
    setCatalogError('');
    const timeout = window.setTimeout(() => {
      if (active && !receivedInitialSnapshot) {
        setCatalogError('The storefront connection timed out.');
        setCatalogLoading(false);
      }
    }, 8_000);
    const stop = subscribeCatalog((items) => {
      receivedInitialSnapshot = true;
      window.clearTimeout(timeout);
      if (active) { setProducts(items); setCatalogLoading(false); setCatalogError(''); }
    }, (error) => {
      receivedInitialSnapshot = true;
      window.clearTimeout(timeout);
      if (active) { setCatalogError(error.message); setCatalogLoading(false); }
    });
    return () => { active = false; window.clearTimeout(timeout); stop(); };
  }, [catalogRetry]);
  useEffect(() => onSnapshot(query(collection(shopDb, 'banners'), where('active', '==', true)), (snapshot) => {
    setBanners(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ShopBanner, 'id'>) })));
  }, (error) => setNotice(error.message)), []);
  useEffect(() => watchCustomerAuth((current) => setUser(current)), []);
  useEffect(() => onSnapshot(doc(shopDb, 'settings', 'storefront_public'), (snapshot) => {
    if (snapshot.exists()) { const data = snapshot.data() as ShopSettings; setSettings(data); setPickupAddress(data.pickupAddress || ''); setPickupInstructions(data.pickupInstructions || ''); setPaymentInstructions(data.paymentInstructions || {}); setContactPhone(data.contactPhone || ''); setLoyaltyDraft({ active: data.loyalty?.active === true, pointsPer100Egp: String(data.loyalty?.pointsPer100Egp || 1), valuePerPoint: String(data.loyalty?.valuePerPoint || 1), maxRedemptionPercent: String(data.loyalty?.maxRedemptionPercent || 25) }); }
  }, (error) => setNotice(error.message)), []);

  useEffect(() => {
    if (!user) { setOrders([]); setUserName(''); setLoyaltyPoints(0); setAdmin(false); setStoreOwner(false); return; }
    let active = true;
    void user.getIdTokenResult().then((token) => { if (active) { setAdmin(token.claims.admin === true); setStoreOwner(token.claims.owner === true); } }).catch(() => { if (active) { setAdmin(false); setStoreOwner(false); } });
    const stopProfile = onSnapshot(shopUserRef(user.uid), (snapshot) => {
      const profile = snapshot.data() || {};
      const name = String(profile.displayName || user.displayName || '');
      const email = String(profile.email || user.email || '');
      setUserName(name); setProfileNameDraft(name); setProfileEmail(email); setProfileEmailDraft(email); setLoyaltyPoints(Math.max(0, Math.floor(Number(profile.loyaltyPoints) || 0)));
    });
    const stopOrders = subscribeCustomerOrders(user.uid, setOrders, (error) => setNotice(error.message));
    return () => { active = false; stopProfile(); stopOrders(); };
  }, [user]);

  useEffect(() => {
    if (route.view !== 'admin' || !admin) { setAdminOrders([]); setAdminError(''); return; }
    const liveOrders = query(collection(shopDb, 'orders'), where('shopSchema', '==', 2));
    const stopOrders = onSnapshot(liveOrders, (snapshot) => setAdminOrders(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<StoreOrder, 'id'>) })).sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0))), (error) => setAdminError(error.message));
    const stopCoupons = onSnapshot(collection(shopDb, 'coupons'), (snapshot) => setAdminCoupons(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ShopCoupon, 'id'>) }))), (error) => setAdminError(error.message));
    const stopBanners = onSnapshot(collection(shopDb, 'banners'), (snapshot) => setAdminBanners(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ShopBanner, 'id'>) }))), (error) => setAdminError(error.message));
    const stopProducts = onSnapshot(collection(shopDb, 'products'), (snapshot) => setAdminProducts(snapshot.docs.map((item) => toProduct(item.id, item.data())).sort((a, b) => a.name.localeCompare(b.name))), (error) => setAdminError(error.message));
    return () => { stopOrders(); stopCoupons(); stopBanners(); stopProducts(); };
  }, [route.view, admin]);

  useEffect(() => {
    if (route.view !== 'admin' || !admin || !storeOwner) { setAdminStaff([]); setStaffPageToken(''); return; }
    void loadAdminStaff('', false);
  }, [route.view, admin, storeOwner]);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'all' || product.category === category;
    const queryText = search.trim().toLocaleLowerCase(locale === 'ar' ? 'ar' : 'en');
    return matchesCategory && (!queryText || `${product.name} ${product.shortDesc} ${product.brand || ''}`.toLocaleLowerCase().includes(queryText));
  }), [products, category, search, locale]);
  const activeBanners = useMemo(() => {
    return banners.filter((banner) => (!banner.startsAt?.toMillis || banner.startsAt.toMillis() <= promotionNow) && (!banner.endsAt?.toMillis || banner.endsAt.toMillis() >= promotionNow));
  }, [banners, promotionNow]);
  const adminReportOrders = useMemo(() => {
    const from = reportFrom ? new Date(`${reportFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = reportTo ? new Date(`${reportTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return adminOrders.filter((order) => {
      const timestamp = Number(order.createdAtMs || 0);
      return timestamp >= from && timestamp <= to;
    });
  }, [adminOrders, reportFrom, reportTo]);
  const selectedProduct = products.find((product) => product.id === route.product) || null;

  function setView(view: View, productId = '') { setNotice(''); route.go(view, productId); setMobileMenu(false); }
  function toggleWishlist(id: string) { setWishlist((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function addVariantToCart(product: CatalogProduct, variant: CatalogVariant) {
    if (variant.stock < 1) return;
    const imageUrl = variant.images[0] || product.images[0] || product.imageUrl || '';
    setCart((current) => addCartLine(current, { productId: product.id, variantId: variant.id, quantity: 1, productName: product.name, colorName: variant.colorName, colorHex: variant.colorHex, imageUrl, unitPrice: variant.price || product.discountPrice || product.price, stockSnapshot: variant.stock }));
    setNotice(locale === 'ar' ? 'أُضيف المنتج إلى حقيبة التسوق.' : 'Added to your bag.');
  }

  async function submitOrder() {
    if (!user) { setAuthOpen(true); return; }
    if (!settings.payments || !Object.values(settings.payments).some(Boolean)) { setNotice(t.noPayment); return; }
    if (!paymentMethod || !settings.payments[paymentMethod]) { setNotice(locale === 'ar' ? 'اختر طريقة دفع مفعّلة.' : 'Choose an enabled payment method.'); return; }
    if (!cart.length) return;
    setBusy(true); setNotice('');
    try {
      const createOrder = callable<{ items: Array<{ productId: string; variantId: string; quantity: number }>; paymentMethod: PaymentMethod; idempotencyKey: string; email?: string; notes?: string; redeemPoints?: number }, { orderId: string; orderCode: string; invoiceNumber: string }>('createStoreOrder');
      const requestItems = cart.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));
      const signature = JSON.stringify({ items: requestItems, paymentMethod, couponCode: couponCode.trim(), redeemPoints, checkoutEmail: checkoutEmail.trim(), checkoutNotes: checkoutNotes.trim() });
      if (checkoutRequest.current.signature !== signature) checkoutRequest.current = { signature, key: crypto.randomUUID() };
      const result = await createOrder({
        items: requestItems,
        paymentMethod,
        idempotencyKey: checkoutRequest.current.key,
        ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
        ...(Number(redeemPoints) > 0 ? { redeemPoints: Number(redeemPoints) } : {}),
        ...(checkoutEmail.trim() ? { email: checkoutEmail.trim() } : {}),
        ...(checkoutNotes.trim() ? { notes: checkoutNotes.trim() } : {}),
      });
      const orderSnapshot = await getDoc(doc(shopDb, 'orders', result.data.orderId));
      if (orderSnapshot.exists()) setActiveInvoice({ id: orderSnapshot.id, ...(orderSnapshot.data() as Omit<StoreOrder, 'id'>) });
      checkoutRequest.current = { signature: '', key: '' };
      setCart([]); setCheckoutNotes(''); setCouponCode(''); setRedeemPoints('0'); setView('invoice');
    } catch (error) { setNotice(error instanceof Error ? error.message : t.error); }
    finally { setBusy(false); }
  }

  async function adminAction(name: string, payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setNotice('');
    try { await callable<Record<string, unknown>, { ok: boolean }>(name)(payload); setNotice(t.success); return true; }
    catch (error) { setNotice(error instanceof Error ? error.message : t.error); return false; }
    finally { setBusy(false); }
  }

  async function loadAdminStaff(pageToken: string, append: boolean) {
    setStaffLoading(true);
    try {
      const result = await callable<{ pageToken?: string }, { staff: ShopStaff[]; nextPageToken: string }>('listStorefrontStaff')({ ...(pageToken ? { pageToken } : {}) });
      setAdminStaff((current) => append ? [...current, ...result.data.staff] : result.data.staff);
      setStaffPageToken(result.data.nextPageToken || '');
    } catch (error) { setAdminError(error instanceof Error ? error.message : t.error); }
    finally { setStaffLoading(false); }
  }

  async function changeStaffAdmin(uid: string, enabled: boolean) {
    if (await adminAction('setStorefrontStaffAdmin', { uid, enabled })) await loadAdminStaff('', false);
  }

  async function saveAdminSettings() {
    await adminAction('updateStorefrontSettings', {
      pickupAddress: pickupAddress.trim(), pickupInstructions: pickupInstructions.trim(), contactPhone: contactPhone.trim(),
      payments: settings.payments || {}, paymentInstructions,
      loyalty: { active: loyaltyDraft.active, pointsPer100Egp: Number(loyaltyDraft.pointsPer100Egp), valuePerPoint: Number(loyaltyDraft.valuePerPoint), maxRedemptionPercent: Number(loyaltyDraft.maxRedemptionPercent) },
    });
  }

  function exportStoreReport() {
    const rows: unknown[][] = [['Order', 'Invoice', 'Date', 'Customer', 'Phone', 'Product', 'Color', 'Quantity', 'Unit price EGP', 'Line total EGP', 'Order total EGP', 'Deposit EGP', 'Balance EGP', 'Payment method', 'Payment status', 'Order status']];
    for (const order of adminReportOrders) for (const item of order.items || []) {
      rows.push([
        order.orderCode, order.invoiceNumber, order.createdAtMs ? new Date(order.createdAtMs).toISOString() : '',
        order.customerName, order.customerPhone, item.productName, item.colorName, item.quantity,
        item.unitPrice, item.lineTotal, order.total, order.depositAmount, order.balanceAmount,
        methodKeys[order.paymentMethod as PaymentMethod] || order.paymentMethod, order.paymentStatus, order.status,
      ]);
    }
    const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `mido-store-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveInventory(product: CatalogProduct) {
    const variants = product.variants.filter((variant) => variant.active !== false).map((variant) => {
      const key = `${product.id}::${variant.id}`;
      const draft = inventoryDrafts[key];
      const priceDraft = draft?.price ?? (variant.price ? String(variant.price) : '');
      return { variantId: variant.id, stock: Number(draft?.stock ?? variant.stock), sku: draft?.sku ?? variant.sku ?? '', barcode: draft?.barcode ?? variant.barcode ?? '', price: priceDraft.trim() ? Number(priceDraft) : null };
    });
    const hasBlankStock = product.variants.some((variant) => inventoryDrafts[`${product.id}::${variant.id}`]?.stock.trim() === '');
    if (!variants.length || hasBlankStock || variants.some((variant) => !Number.isInteger(variant.stock) || variant.stock < 0 || variant.stock > 100_000 || (variant.price !== null && (!Number.isFinite(variant.price) || variant.price <= 0 || variant.price > 10_000_000)))) {
      setNotice(locale === 'ar' ? 'أدخل كمية صحيحة لكل لون.' : 'Enter a valid quantity for every color.');
      return;
    }
    const saved = await adminAction('updateStorefrontInventory', { productId: product.id, variants });
    if (saved) setInventoryDrafts((current) => {
      const next = { ...current };
      product.variants.forEach((variant) => { delete next[`${product.id}::${variant.id}`]; });
      return next;
    });
  }

  async function uploadVariantImage(product: CatalogProduct, variant: CatalogVariant, file: File) {
    const key = `${product.id}::${variant.id}`;
    if (product.stockEstimate) {
      setNotice(locale === 'ar' ? 'احفظ الكمية الفعلية لكل لون أولاً، ثم أضف الصور.' : 'Save verified stock for every color before uploading images.');
      return;
    }
    if (variant.images.length >= 6) {
      setNotice(locale === 'ar' ? 'يمكن إضافة 6 صور كحد أقصى لكل لون.' : 'Each color can have up to 6 images.');
      return;
    }
    const variants = product.variants.filter((item) => item.active !== false).map((item) => {
      const itemKey = `${product.id}::${item.id}`;
      const draft = inventoryDrafts[itemKey];
      const priceDraft = draft?.price ?? (item.price ? String(item.price) : '');
      return { variantId: item.id, stock: Number(draft?.stock ?? item.stock), sku: draft?.sku ?? item.sku ?? '', barcode: draft?.barcode ?? item.barcode ?? '', price: priceDraft.trim() ? Number(priceDraft) : null };
    });
    const hasBlankStock = product.variants.some((item) => inventoryDrafts[`${product.id}::${item.id}`]?.stock.trim() === '');
    if (hasBlankStock || variants.some((item) => !Number.isInteger(item.stock) || item.stock < 0 || item.stock > 100_000)) {
      setNotice(locale === 'ar' ? 'أدخل كمية صحيحة لكل لون قبل رفع الصورة.' : 'Enter a valid quantity for every color before uploading.');
      return;
    }

    setBusy(true);
    setNotice('');
    setImageUploadProgress((current) => ({ ...current, [key]: 0 }));
    try {
      const imageUrl = await uploadStorefrontProductImage(product.id, variant.id, file, (percent) => {
        setImageUploadProgress((current) => ({ ...current, [key]: percent }));
      });
      const safeExistingImages = variant.images.filter((image) => /^https:\/\//i.test(image) || (/^\/(?!\/)/.test(image)));
      const updatedVariants = variants.map((item) => item.variantId === variant.id
        ? { ...item, images: [...safeExistingImages, imageUrl].slice(0, 6) }
        : item);
      await callable<Record<string, unknown>, { ok: boolean }>('updateStorefrontInventory')( { productId: product.id, variants: updatedVariants });
      setNotice(locale === 'ar' ? 'تم حفظ الصورة والمخزون.' : 'Image and inventory saved.');
      setInventoryDrafts((current) => {
        const next = { ...current };
        product.variants.forEach((item) => { delete next[`${product.id}::${item.id}`]; });
        return next;
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.error);
    } finally {
      setBusy(false);
      setImageUploadProgress((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  const header = <header className="shop-header">
    <div className="shop-header-top"><span>{t.announcement}</span><span className="shop-header-mark">MIDO OPTICS <i>—</i> EGYPT</span><span className="shop-header-locale">{locale === 'ar' ? 'خدمة شخصية' : 'PERSONAL SERVICE'}</span></div>
    <div className="shop-nav">
      <button className="shop-wordmark" onClick={() => setView('home')} aria-label="Mido Optics home">mido optics<span>OPTICAL ATELIER</span></button>
      <nav className={mobileMenu ? 'shop-links is-open' : 'shop-links'} aria-label={locale === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
        <button className={route.view === 'home' ? 'active' : ''} onClick={() => setView('home')}>{t.home}</button>
        <button className={route.view === 'catalog' ? 'active' : ''} onClick={() => { setCategory('all'); setView('catalog'); }}>{t.shop}</button>
        <button className={route.view === 'offers' ? 'active' : ''} onClick={() => setView('offers')}>{t.offers}</button>
        <button onClick={() => setView('about')}>{t.about}</button>
        <button onClick={() => setView('contact')}>{t.contact}</button>
        {route.view === 'admin' && admin && <button onClick={() => setBannerEditorOpen(true)}>{locale === 'ar' ? 'إدارة الحملات' : 'Manage campaigns'}</button>}
      </nav>
      <div className="shop-actions">
        <button className="shop-icon-btn shop-search-toggle" onClick={() => setView('catalog')} aria-label={t.search}><Search size={19} /></button>
        <button className="shop-icon-btn" onClick={() => setView('wishlist')} aria-label={t.wishlist}><Heart size={19} /><span className="shop-count">{wishlist.length}</span></button>
        <button className="shop-icon-btn" onClick={() => setView('cart')} aria-label={t.cart}><ShoppingBag size={19} /><span className="shop-count">{cart.length}</span></button>
        <button className="shop-icon-btn shop-account-btn" onClick={() => user ? setView('account') : setAuthOpen(true)} aria-label={t.account}><UserRound size={19} /></button>
        <button className="shop-icon-btn shop-theme-btn" onClick={() => setDark(!dark)} aria-label={t.dark}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button className="shop-locale-btn" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>{t.language}</button>
        <button className="shop-icon-btn shop-menu-btn" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu">{mobileMenu ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
  </header>;

  function productCard(product: CatalogProduct, index: number) {
    const cover = product.variants.find((item) => item.stock > 0)?.images[0] || product.images[0] || product.imageUrl;
    const price = product.discountPrice || product.price;
    return <article className="shop-product-card" key={product.id} style={{ animationDelay: `${Math.min(index * 55, 330)}ms` }}>
      <button className="shop-product-media" onClick={() => setView('product', product.id)} aria-label={`${t.details}: ${product.name}`}>
        <ProductImage src={cover} alt={product.name} />
        {product.featured && <span className="shop-badge">{locale === 'ar' ? 'اختيارنا' : 'CURATED'}</span>}
        {product.newArrival && <span className="shop-badge shop-badge-new">{locale === 'ar' ? 'وصل حديثاً' : 'NEW ARRIVAL'}</span>}
      </button>
      <button className={`shop-card-wish ${wishlist.includes(product.id) ? 'is-liked' : ''}`} onClick={() => toggleWishlist(product.id)} aria-label={t.wishlist}><Heart size={17} fill={wishlist.includes(product.id) ? 'currentColor' : 'none'} /></button>
      <div className="shop-product-copy"><div className="shop-card-meta"><span>{t[categoryKeys[product.category] || 'glasses']}</span><span>{product.variants.filter((v) => v.stock > 0).length} {locale === 'ar' ? 'ألوان' : 'COLORS'}</span></div>
        <button className="shop-product-name" onClick={() => setView('product', product.id)}>{product.name}</button>
        {product.brand && <small className="shop-card-brand">{product.brand}</small>}
        <div className="shop-card-price">{formatEgp(price, locale)}{product.discountPrice && product.discountPrice < product.price ? <del>{formatEgp(product.price, locale)}</del> : null}</div>
      </div>
    </article>;
  }

  function productGrid(items: CatalogProduct[]) {
    if (catalogLoading) return <div className="shop-state"><LoaderCircle className="shop-spin" />{t.loading}</div>;
    if (catalogError) return <div className="shop-state shop-state-error"><p>{t.networkError}</p><small>{catalogError}</small><button className="shop-button shop-button-outline" onClick={() => setCatalogRetry((value) => value + 1)}>{t.retry}</button></div>;
    if (!items.length) return <div className="shop-state"><span className="shop-state-ornament">◌</span><p>{t.noProducts}</p></div>;
    return <div className="shop-product-grid">{items.map(productCard)}</div>;
  }

  function renderProduct() {
    if (!selectedProduct) return <section className="shop-empty-page"><p>{t.noProducts}</p><button className="shop-button shop-button-outline" onClick={() => setView('catalog')}>{t.back}</button></section>;
    const chosenId = selectedVariant[selectedProduct.id] || '';
    const chosen = selectedProduct.variants.find((variant) => variant.id === chosenId) || null;
    const inventoryConfirmed = selectedProduct.stockEstimate !== true;
    const gallery = chosen?.images.length ? chosen.images : selectedProduct.images;
    const price = chosen?.price || selectedProduct.discountPrice || selectedProduct.price;
    return <section className="shop-product-detail shop-container">
      <button className="shop-back-link" onClick={() => setView('catalog')}>{locale === 'ar' ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{t.back}</button>
      <div className="shop-detail-layout"><div className="shop-detail-gallery">
        <div className="shop-detail-main"><ProductImage src={gallery[0] || selectedProduct.imageUrl} alt={selectedProduct.name} /></div>
        {gallery.length > 1 && <div className="shop-thumbnails">{gallery.slice(1).map((image, index) => <ProductImage key={`${image}-${index}`} src={image} alt={`${selectedProduct.name} ${index + 2}`} />)}</div>}
      </div><div className="shop-detail-copy"><span className="shop-kicker">MIDO OPTICS / {t[categoryKeys[selectedProduct.category] || 'glasses']}</span>
        <h1>{selectedProduct.name}</h1>{selectedProduct.brand && <span className="shop-detail-brand">{selectedProduct.brand}</span>}<p className="shop-detail-desc">{selectedProduct.fullDesc}</p><strong className="shop-detail-price">{formatEgp(price, locale)}</strong>
        <div className="shop-divider"/><h3>{t.chooseColor}</h3>
        <div className="shop-swatches">{selectedProduct.variants.map((variant) => <button key={variant.id} className={`shop-swatch ${variant.id === chosenId ? 'selected' : ''} ${variant.stock < 1 || !inventoryConfirmed ? 'out' : ''}`} style={{ '--swatch-color': variant.colorHex } as React.CSSProperties} onClick={() => setSelectedVariant((current) => ({ ...current, [selectedProduct.id]: variant.id }))} title={variant.colorName} aria-label={`${variant.colorName}${variant.stock < 1 || !inventoryConfirmed ? ` — ${t.unavailable}` : ''}`} aria-pressed={variant.id === chosenId}><span/>{(variant.stock < 1 || !inventoryConfirmed) && <i/>}</button>)}</div>
        {chosen && <div className="shop-variant-info"><span>{chosen.colorName}</span><span>{inventoryConfirmed ? `${t.stock}: ${chosen.stock}` : (locale === 'ar' ? 'المخزون بانتظار التأكيد' : 'Stock awaiting confirmation')}</span></div>}
        <button className="shop-button shop-button-dark shop-add-button" disabled={!chosen || chosen.stock < 1 || !inventoryConfirmed} onClick={() => chosen && inventoryConfirmed && addVariantToCart(selectedProduct, chosen)}>{!chosen ? t.chooseColor : !inventoryConfirmed ? (locale === 'ar' ? 'قريباً' : 'Coming soon') : chosen.stock < 1 ? t.unavailable : t.add}<ShoppingBag size={17}/></button>
        <p className="shop-detail-note"><ShieldCheck size={16}/>{locale === 'ar' ? 'استلام من الفرع • الأسعار بالجنيه المصري' : 'Store pickup • Prices in Egyptian pounds'}</p>
      </div></div>
    </section>;
  }

  function renderCart() {
    return <section className="shop-container shop-page-section"><div className="shop-page-heading"><span className="shop-kicker">YOUR SELECTION / 01</span><h1>{t.cart}</h1><p>{locale === 'ar' ? 'تفاصيل كل اختيار ولونه في مكان واحد.' : 'Every frame and chosen color, together.'}</p></div>
      {!cart.length ? <div className="shop-state shop-cart-empty"><ShoppingBag size={36}/><p>{t.emptyCart}</p><button className="shop-button shop-button-outline" onClick={() => setView('catalog')}>{t.continue}</button></div> : <div className="shop-cart-layout"><div className="shop-cart-lines">{cart.map((line) => { const key = cartLineKey(line); return <article className="shop-cart-line" key={key}>
        <ProductImage src={line.imageUrl} alt={line.productName}/><div className="shop-cart-line-copy"><span>{line.productName}</span><small><i style={{ background: line.colorHex }}/>{line.colorName}</small><b>{formatEgp(line.unitPrice, locale)}</b></div>
        <div className="shop-quantity"><button aria-label={t.remove} onClick={() => setCart((current) => setCartQuantity(current, key, line.quantity - 1))}><Minus size={14}/></button><span>{line.quantity}</span><button aria-label="Increase" disabled={line.quantity >= line.stockSnapshot} onClick={() => setCart((current) => setCartQuantity(current, key, line.quantity + 1))}><Plus size={14}/></button></div>
        <button className="shop-remove" onClick={() => setCart((current) => setCartQuantity(current, key, 0))}>{t.remove}</button>
      </article>; })}</div><aside className="shop-summary"><h2>{locale === 'ar' ? 'ملخص الحقيبة' : 'Order summary'}</h2><div><span>{t.subtotal}</span><b>{formatEgp(subtotal, locale)}</b></div><div><span>{t.deposit}</span><b>{formatEgp(deposit, locale)}</b></div><div><span>{t.balance}</span><b>{formatEgp(balance, locale)}</b></div><p>{t.pickup}</p><button className="shop-button shop-button-dark shop-full" onClick={() => setView('checkout')}>{t.checkout}<ArrowRight size={17}/></button></aside></div>}
    </section>;
  }

  function renderCheckout() {
    if (!user) return <section className="shop-container shop-page-section shop-auth-required"><span className="shop-kicker">SECURE CHECKOUT</span><h1>{t.checkout}</h1><p>{t.authRequired}</p><button className="shop-button shop-button-dark" onClick={() => setAuthOpen(true)}>{t.signIn}</button></section>;
    const activeMethods = (Object.keys(methodKeys) as PaymentMethod[]).filter((method) => settings.payments?.[method] && settings.paymentInstructions?.[method]?.trim());
    return <section className="shop-container shop-page-section"><div className="shop-page-heading"><span className="shop-kicker">SECURE CHECKOUT / 02</span><h1>{t.checkout}</h1><p>{t.pickup}</p></div>
      <div className="shop-checkout-layout"><form className="shop-checkout-form" onSubmit={(event) => { event.preventDefault(); void submitOrder(); }}>
        <div className="shop-form-section"><h2>01 <span>{locale === 'ar' ? 'بيانات العميل' : 'Your details'}</span></h2><label className="shop-label">{t.fullName}<input value={userName || user.displayName || ''} readOnly /></label><label className="shop-label">{t.phone}<input value={user.phoneNumber || ''} readOnly dir="ltr" /></label><label className="shop-label">{t.email}<input value={checkoutEmail} onChange={(e) => setCheckoutEmail(e.target.value)} type="email" autoComplete="email" dir="ltr" /></label><label className="shop-label">{t.notes}<textarea value={checkoutNotes} onChange={(e) => setCheckoutNotes(e.target.value)} rows={3}/></label></div>
        <div className="shop-form-section"><h2>02 <span>{t.pickup}</span></h2><div className="shop-pickup-card"><Package size={20}/><div><b>{settings.pickupAddress || (locale === 'ar' ? 'عنوان الاستلام سيظهر بعد تهيئته من الإدارة' : 'Pickup location will appear when configured')}</b><p>{settings.pickupInstructions || (locale === 'ar' ? 'سيتواصل معك فريقنا لتأكيد جاهزية الطلب.' : 'Our team will contact you when your order is ready.')}</p></div></div></div>
        <div className="shop-form-section"><h2>03 <span>{t.method}</span></h2>{activeMethods.length ? <div className="shop-methods">{activeMethods.map((method) => <label className={`shop-method ${paymentMethod === method ? 'selected' : ''}`} key={method}><input type="radio" name="payment" checked={paymentMethod === method} onChange={() => setPaymentMethod(method)}/><span>{methodKeys[method]}</span><small>{locale === 'ar' ? 'تحقق يدوي من العربون' : 'Deposit verified manually'}</small></label>)}</div> : <p className="shop-inline-warning">{t.noPayment}</p>}{paymentMethod && settings.paymentInstructions?.[paymentMethod] && <div className="shop-payment-instructions"><b>{methodKeys[paymentMethod]}</b><span>{settings.paymentInstructions[paymentMethod]}</span></div>}{settings.loyalty?.active && user && <label className="shop-label shop-loyalty-input">{locale === 'ar' ? `استخدم نقاط الولاء (رصيدك ${loyaltyPoints})` : `Redeem loyalty points (${loyaltyPoints} available)`}<input type="number" inputMode="numeric" min="0" max={loyaltyPoints} step="1" value={redeemPoints} onChange={(event) => setRedeemPoints(event.target.value)}/>{Number(redeemPoints) > 0 && <small>{locale === 'ar' ? 'خصم تقديري:' : 'Estimated discount:'} {formatEgp(Math.round(Number(redeemPoints) * settings.loyalty.valuePerPoint), locale)}</small>}</label>}<label className="shop-label shop-coupon-input">{locale === 'ar' ? 'كود الخصم (اختياري)' : 'Discount code (optional)'}<input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} autoCapitalize="characters"/></label></div>
        <button className="shop-button shop-button-dark shop-full" disabled={busy || !cart.length || !activeMethods.length || !paymentMethod}>{busy ? <LoaderCircle className="shop-spin" size={18}/> : t.placeOrder}</button>
      </form><aside className="shop-summary shop-checkout-summary"><h2>{locale === 'ar' ? 'طلبك' : 'Your order'}</h2>{cart.map((line) => <div className="shop-summary-product" key={cartLineKey(line)}><span>{line.quantity} × {line.productName}<small>{line.colorName}</small></span><b>{formatEgp(line.quantity * line.unitPrice, locale)}</b></div>)}<div className="shop-divider"/><div><span>{t.subtotal}</span><b>{formatEgp(subtotal, locale)}</b></div><div><span>{t.deposit}</span><b>{formatEgp(deposit, locale)}</b></div><div><span>{t.balance}</span><b>{formatEgp(balance, locale)}</b></div><p className="shop-manual-note">{locale === 'ar' ? 'لن يُسجل العربون كمدفوع إلا بعد مراجعته من فريق المتجر.' : 'Your deposit is marked paid only after store staff verifies it.'}</p></aside></div>
    </section>;
  }

  function renderInvoice(order: StoreOrder | null) {
    if (!order) return <section className="shop-container shop-page-section"><p>{t.noOrders}</p><button className="shop-button shop-button-outline" onClick={() => setView('orders')}>{t.orders}</button></section>;
    const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG', { timeZone: 'Africa/Cairo' }) : '';
    return <section className="shop-container shop-page-section"><article className="shop-invoice" id="shop-invoice"><div className="shop-invoice-top"><div><span className="shop-wordmark invoice-wordmark">mido optics</span><p>OPTICAL ATELIER · EGYPT</p></div><div className="shop-invoice-title"><span>{t.invoice}</span><b dir="ltr">{order.invoiceNumber}</b></div></div><div className="shop-invoice-meta"><div><small>{t.order}</small><b dir="ltr">{order.orderCode}</b></div><div><small>{locale === 'ar' ? 'التاريخ' : 'Date'}</small><b>{date}</b></div><div><small>{t.status}</small><b>{statusText(order.status, locale)}</b></div></div><div className="shop-invoice-items">{order.items?.map((item, index) => <div key={`${item.productName}-${index}`}><span>{item.productName}<small><i style={{ background: item.colorHex }}/>{item.colorName} · {item.quantity}</small></span><b>{formatEgp(item.lineTotal, locale)}</b></div>)}</div><div className="shop-invoice-totals"><div><span>{t.subtotal}</span><b>{formatEgp(order.subtotal ?? order.total + (order.discountAmount || 0), locale)}</b></div>{!!order.discountAmount && <div><span>{locale === 'ar' ? 'الخصم' : 'Discount'}</span><b>−{formatEgp(order.discountAmount, locale)}</b></div>}{!!order.pointsRedeemed && <div><span>{locale === 'ar' ? 'النقاط المستبدلة' : 'Points redeemed'}</span><b>{order.pointsRedeemed}</b></div>}<div><span>{locale === 'ar' ? 'الإجمالي' : 'Total'}</span><b>{formatEgp(order.total, locale)}</b></div><div className="shop-invoice-deposit"><span>{t.deposit}</span><b>{formatEgp(order.depositAmount, locale)}</b></div><div><span>{t.balance}</span><b>{formatEgp(order.balanceAmount, locale)}</b></div><div><span>{locale === 'ar' ? 'طريقة الدفع' : 'Payment method'}</span><b>{methodKeys[order.paymentMethod as PaymentMethod] || order.paymentMethod}</b></div><div><span>{t.payment}</span><b>{statusText(order.paymentStatus, locale)}</b></div></div><div className="shop-invoice-foot"><span>{t.pickup}</span><b>{order.pickupAddressSnapshot || settings.pickupAddress || 'MIDO OPTICS'}</b>{(order.paymentInstructionSnapshot || settings.paymentInstructions?.[order.paymentMethod as PaymentMethod]) && <p className="shop-invoice-payment-note">{order.paymentInstructionSnapshot || settings.paymentInstructions?.[order.paymentMethod as PaymentMethod]}</p>}<p>{locale === 'ar' ? 'شكراً لاختيارك ميدو أوبتكس.' : 'Thank you for choosing Mido Optics.'}</p></div></article><button className="shop-button shop-button-dark shop-print-btn" onClick={() => window.print()}>{t.print}</button><button className="shop-text-button" onClick={() => setView('orders')}>{t.orders}</button></section>;
  }

  function renderOrders() {
    if (!user) return <section className="shop-container shop-page-section shop-auth-required"><h1>{t.orders}</h1><p>{t.accountHint}</p><button className="shop-button shop-button-dark" onClick={() => setAuthOpen(true)}>{t.signIn}</button></section>;
    return <section className="shop-container shop-page-section"><div className="shop-page-heading"><span className="shop-kicker">ACCOUNT / 03</span><h1>{t.orders}</h1></div>{orders.length ? <div className="shop-orders-list">{orders.map((order) => <article className="shop-order-card" key={order.id}><div><span className="shop-kicker">{order.invoiceNumber}</span><h3>{order.orderCode}</h3><p>{order.items?.length || 0} {locale === 'ar' ? 'منتج' : 'items'} · {formatEgp(order.total, locale)}</p></div><div className="shop-order-state"><span>{statusText(order.status, locale)}</span><small>{statusText(order.paymentStatus, locale)}</small></div><div className="shop-order-actions"><button className="shop-button shop-button-outline" onClick={() => { setActiveInvoice(order); setView('invoice'); }}>{t.invoice}</button>{order.status === 'awaiting_payment' && order.paymentStatus === 'awaiting_deposit' && <><button className="shop-text-button" onClick={() => { setPaymentReferenceOrder(order); setPaymentReference(order.paymentReference || ''); }}>{locale === 'ar' ? 'إرسال مرجع الدفع' : 'Submit payment reference'}</button><button className="shop-text-button" onClick={() => { setCancelTarget(order); setCancelReason(''); }}>{locale === 'ar' ? 'إلغاء الطلب' : 'Cancel order'}</button></>}</div></article>)}</div> : <div className="shop-state"><Package size={34}/><p>{t.noOrders}</p><button className="shop-button shop-button-outline" onClick={() => setView('catalog')}>{t.continue}</button></div>}</section>;
  }

  function renderAdmin() {
    if (!user) return <section className="shop-container shop-page-section shop-auth-required"><span className="shop-kicker">MIDO / ADMIN</span><h1>{t.adminTitle}</h1><p>{locale === 'ar' ? 'دخول العملاء برمز SMS، ودخول فريق المتجر بحساب Google المعتمد.' : 'Customers use an SMS code. Store staff use their approved Google account.'}</p><button className="shop-button shop-button-dark" onClick={() => setAuthOpen(true)}>{t.signIn}</button><button className="shop-button shop-button-outline" disabled={busy} onClick={async () => { setBusy(true); try { setUser(await signInShopAdmin()); } catch (error) { setNotice(error instanceof Error ? error.message : t.error); } finally { setBusy(false); } }}>{locale === 'ar' ? 'دخول فريق المتجر عبر Google' : 'Staff sign in with Google'}</button></section>;
    if (!admin) return <section className="shop-container shop-page-section shop-auth-required"><ShieldCheck size={34}/><h1>{t.adminTitle}</h1><p>{t.permission}</p><a href="/#web-control" className="shop-button shop-button-outline">{locale === 'ar' ? 'لوحة التشغيل الحالية' : 'Open existing operations dashboard'}</a></section>;
    const reportSales = adminReportOrders.filter((order) => order.paymentStatus === 'paid' || order.paymentStatus === 'deposit_verified').reduce((sum, order) => sum + (order.paymentStatus === 'paid' ? order.total : order.depositAmount), 0);
    const reportCancelled = adminReportOrders.filter((order) => order.status === 'cancelled').length;
    const reportCustomers = new Set(adminReportOrders.map((order) => order.customerUid || order.customerPhone)).size;
    const reportProducts = new Map<string, number>();
    const reportColors = new Map<string, number>();
    for (const order of adminReportOrders) for (const item of order.items || []) {
      reportProducts.set(item.productName, (reportProducts.get(item.productName) || 0) + item.quantity);
      const colorKey = `${item.productName} · ${item.colorName}`;
      reportColors.set(colorKey, (reportColors.get(colorKey) || 0) + item.quantity);
    }
    const leaders = (values: Map<string, number>) => [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return <section className="shop-container shop-page-section"><div className="shop-page-heading shop-admin-heading"><div><span className="shop-kicker">MIDO OPTICS / ADMIN</span><h1>{t.adminTitle}</h1></div><a className="shop-button shop-button-outline" href="/#web-control">{locale === 'ar' ? 'إدارة المنتجات والمحتوى' : 'Manage products and content'}</a></div>
      <section className="shop-admin-reports"><div className="shop-report-heading"><div><span className="shop-kicker">MIDO / BUSINESS INTELLIGENCE</span><h2><BarChart3 size={18}/>{locale === 'ar' ? 'تقارير المتجر' : 'Store reports'}</h2></div><div className="shop-report-filters"><label>{locale === 'ar' ? 'من' : 'From'}<input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)}/></label><label>{locale === 'ar' ? 'إلى' : 'To'}<input type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)}/></label><button className="shop-button shop-button-outline shop-button-small" onClick={exportStoreReport}><Download size={14}/>{locale === 'ar' ? 'تصدير Excel / CSV' : 'Export Excel / CSV'}</button></div></div><div className="shop-report-stats"><article><small>{locale === 'ar' ? 'الطلبات' : 'Orders'}</small><b>{adminReportOrders.length}</b></article><article><small>{locale === 'ar' ? 'المبيعات المحصلة' : 'Collected sales'}</small><b>{formatEgp(reportSales, locale)}</b></article><article><small>{locale === 'ar' ? 'الطلبات الملغاة' : 'Cancelled orders'}</small><b>{reportCancelled}</b></article><article><small>{locale === 'ar' ? 'العملاء' : 'Customers'}</small><b>{reportCustomers}</b></article><article><small>{locale === 'ar' ? 'المخزون المؤكد' : 'Confirmed units in stock'}</small><b>{adminProducts.filter((product) => !product.stockEstimate).reduce((sum, product) => sum + product.variants.reduce((variantSum, variant) => variantSum + variant.stock, 0), 0)}</b></article></div><div className="shop-report-leaders"><div><h3>{locale === 'ar' ? 'الأكثر مبيعاً' : 'Best-selling products'}</h3>{leaders(reportProducts).length ? leaders(reportProducts).map(([name, count]) => <p key={name}><span>{name}</span><b>{count}</b></p>) : <small>{locale === 'ar' ? 'لا توجد مبيعات في النطاق المحدد.' : 'No sales in this date range.'}</small>}</div><div><h3>{locale === 'ar' ? 'الألوان الأكثر طلباً' : 'Best-selling colors'}</h3>{leaders(reportColors).length ? leaders(reportColors).map(([name, count]) => <p key={name}><span>{name}</span><b>{count}</b></p>) : <small>{locale === 'ar' ? 'لا توجد مبيعات في النطاق المحدد.' : 'No sales in this date range.'}</small>}</div></div></section>
      <div className="shop-admin-layout"><div className="shop-admin-settings"><h2>{t.config}</h2><label className="shop-label">{t.pickupAddress}<input value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)}/></label><label className="shop-label">{locale === 'ar' ? 'تعليمات الاستلام' : 'Pickup instructions'}<textarea rows={3} value={pickupInstructions} onChange={(e) => setPickupInstructions(e.target.value)}/></label><label className="shop-label">{locale === 'ar' ? 'هاتف المتجر' : 'Store phone'}<input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} dir="ltr" type="tel"/></label><h3>{locale === 'ar' ? 'بيانات الدفع اليدوي' : 'Manual payment details'}</h3>{(Object.keys(methodKeys) as PaymentMethod[]).map((method) => <div className="shop-payment-config" key={method}><label><input type="checkbox" checked={!!settings.payments?.[method]} onChange={(e) => setSettings((current) => ({ ...current, payments: { ...current.payments, [method]: e.target.checked } }))}/>{methodKeys[method]}</label><textarea rows={2} value={paymentInstructions[method] || ''} onChange={(e) => setPaymentInstructions((current) => ({ ...current, [method]: e.target.value }))} placeholder={locale === 'ar' ? 'رقم المحفظة أو مرجع الدفع' : 'Wallet number or payment reference'}/></div>)}<div className="shop-loyalty-config"><h3>{locale === 'ar' ? 'نظام نقاط الولاء' : 'Loyalty points'}</h3><label className="shop-coupon-active"><input type="checkbox" checked={loyaltyDraft.active} onChange={(event) => setLoyaltyDraft((current) => ({ ...current, active: event.target.checked }))}/>{locale === 'ar' ? 'تفعيل كسب واستبدال النقاط' : 'Enable earning and redemption'}</label><div className="shop-coupon-fields"><label className="shop-label">{locale === 'ar' ? 'نقاط لكل 100 جنيه عند التسليم' : 'Points per EGP 100 after pickup'}<input type="number" min="1" max="1000" step="1" value={loyaltyDraft.pointsPer100Egp} onChange={(event) => setLoyaltyDraft((current) => ({ ...current, pointsPer100Egp: event.target.value }))}/></label><label className="shop-label">{locale === 'ar' ? 'قيمة النقطة بالجنيه' : 'EGP value per point'}<input type="number" min="0.01" max="1000" step="0.01" value={loyaltyDraft.valuePerPoint} onChange={(event) => setLoyaltyDraft((current) => ({ ...current, valuePerPoint: event.target.value }))}/></label><label className="shop-label">{locale === 'ar' ? 'أقصى نسبة استبدال من الطلب (%)' : 'Max redemption per order (%)'}<input type="number" min="1" max="50" step="1" value={loyaltyDraft.maxRedemptionPercent} onChange={(event) => setLoyaltyDraft((current) => ({ ...current, maxRedemptionPercent: event.target.value }))}/></label></div><p>{locale === 'ar' ? 'تُضاف النقاط بعد تأكيد الاستلام وسداد كامل الطلب. يمكن استبدالها بخصم حتى النسبة المحددة.' : 'Points are earned after pickup and full payment. Redemption is capped at the configured share of an order.'}</p></div><button className="shop-button shop-button-dark" disabled={busy} onClick={() => void saveAdminSettings()}>{t.update}</button><p>{locale === 'ar' ? 'تظهر الطريقة للعميل بعد إدخال تفاصيلها. التحقق من التحويل يدوي ولا يُعرض الدفع كناجح تلقائياً.' : 'A method appears after its details are saved. Transfers are manually verified.'}</p></div>
        <div className="shop-admin-inventory"><div className="shop-inventory-heading"><div><h2>{locale === 'ar' ? 'مخزون ألوان المنتجات' : 'Color inventory'}</h2><p>{locale === 'ar' ? 'حدّث الكمية الفعلية لكل لون. المنتجات ذات المخزون التقديري لا تقبل طلبات حتى تأكيد الكمية.' : 'Set the real quantity for each color. Estimated stock cannot be checked out until confirmed.'}</p></div><span>{adminProducts.length}</span></div>{adminProducts.length ? adminProducts.map((product) => <article className="shop-inventory-product" key={product.id}><header><div><b>{product.name}</b><small>{product.stockEstimate ? (locale === 'ar' ? 'المخزون يحتاج إلى تأكيد' : 'Inventory needs confirmation') : (locale === 'ar' ? 'مخزون مؤكد' : 'Inventory confirmed')}</small></div><button className="shop-button shop-button-small" disabled={busy || !product.variants.length} onClick={() => void saveInventory(product)}>{locale === 'ar' ? 'حفظ مخزون الألوان' : 'Save color stock'}</button></header>{product.variants.length ? <div className="shop-inventory-variants">{product.variants.map((variant) => { const key = `${product.id}::${variant.id}`; const draft = inventoryDrafts[key] || { stock: String(variant.stock), sku: variant.sku || '', barcode: variant.barcode || '', price: variant.price ? String(variant.price) : '' }; return <div className="shop-inventory-variant" key={variant.id}><span className="shop-inventory-color"><i style={{ background: variant.colorHex }}/>{variant.colorName}</span><label className="shop-label">{locale === 'ar' ? 'الكمية' : 'Stock'}<input type="number" inputMode="numeric" min="0" max="100000" value={draft.stock} onChange={(event) => setInventoryDrafts((current) => ({ ...current, [key]: { ...draft, stock: event.target.value } }))}/></label><label className="shop-label">{locale === 'ar' ? 'السعر الخاص باللون (اختياري)' : 'Color price (optional)'}<input type="number" min="0.01" max="10000000" step="0.01" value={draft.price} onChange={(event) => setInventoryDrafts((current) => ({ ...current, [key]: { ...draft, price: event.target.value } }))}/></label><label className="shop-label">SKU<input value={draft.sku} maxLength={50} dir="ltr" onChange={(event) => setInventoryDrafts((current) => ({ ...current, [key]: { ...draft, sku: event.target.value } }))}/></label><label className="shop-label">{locale === 'ar' ? 'الباركود' : 'Barcode'}<input value={draft.barcode} maxLength={50} dir="ltr" onChange={(event) => setInventoryDrafts((current) => ({ ...current, [key]: { ...draft, barcode: event.target.value } }))}/></label><div className="shop-inventory-images"><div className="shop-inventory-thumbs">{variant.images.slice(0, 6).map((image, index) => <img src={image} alt={`${variant.colorName} ${index + 1}`} key={`${image}-${index}`} loading="lazy"/>)}<span>{variant.images.length}/6 {locale === 'ar' ? 'صور' : 'images'}</span></div><label className={`shop-image-upload ${busy || variant.images.length >= 6 ? 'is-disabled' : ''}`}>{locale === 'ar' ? 'إضافة صورة لهذا اللون' : 'Add a color image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy || variant.images.length >= 6} onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ''; if (file) void uploadVariantImage(product, variant, file); }}/></label>{imageUploadProgress[key] !== undefined && <div className="shop-image-progress" role="progressbar" aria-label={locale === 'ar' ? 'رفع الصورة' : 'Uploading image'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={imageUploadProgress[key]}><span style={{ width: `${imageUploadProgress[key]}%` }}/><small>{imageUploadProgress[key]}%</small></div>}</div></div>; })}</div> : <p className="shop-state">{locale === 'ar' ? 'أضف لوناً للمنتج من محرر المنتجات أولاً.' : 'Add a product color in the catalog editor first.'}</p>}</article>) : <div className="shop-state">{locale === 'ar' ? 'لا توجد منتجات في قاعدة المتجر بعد.' : 'No products are available in the storefront database yet.'}</div>}</div>
        <div className="shop-admin-coupon-panel"><h2>{locale === 'ar' ? 'أكواد الخصم' : 'Discount codes'}</h2><label className="shop-label">{locale === 'ar' ? 'الكود' : 'Code'}<input value={couponDraft.code} onChange={(event) => setCouponDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} maxLength={30} dir="ltr" /></label><div className="shop-coupon-fields"><label className="shop-label">{locale === 'ar' ? 'القيمة' : 'Value'}<input value={couponDraft.value} onChange={(event) => setCouponDraft((current) => ({ ...current, value: event.target.value }))} type="number" min="1" /></label><label className="shop-label">{locale === 'ar' ? 'النوع' : 'Type'}<select value={couponDraft.discountType} onChange={(event) => setCouponDraft((current) => ({ ...current, discountType: event.target.value as 'fixed' | 'percent' }))}><option value="percent">%</option><option value="fixed">EGP</option></select></label><label className="shop-label">{locale === 'ar' ? 'عدد الاستخدامات (0 بلا حد)' : 'Use limit (0 = unlimited)'}<input value={couponDraft.maxUses} onChange={(event) => setCouponDraft((current) => ({ ...current, maxUses: event.target.value }))} type="number" min="0" /></label></div><label className="shop-coupon-active"><input type="checkbox" checked={couponDraft.active} onChange={(event) => setCouponDraft((current) => ({ ...current, active: event.target.checked }))}/>{locale === 'ar' ? 'مفعّل' : 'Active'}</label><button className="shop-button shop-button-dark" disabled={busy || !couponDraft.code || !couponDraft.value} onClick={async () => { await adminAction('saveStorefrontCoupon', { ...couponDraft, value: Number(couponDraft.value), maxUses: Number(couponDraft.maxUses) }); setCouponDraft({ code: '', discountType: 'percent', value: '', maxUses: '0', active: true }); }}>{locale === 'ar' ? 'حفظ الكوبون' : 'Save coupon'}</button><div className="shop-admin-coupon-list">{adminCoupons.map((coupon) => <button key={coupon.id} onClick={() => setCouponDraft({ code: coupon.code, discountType: coupon.discountType, value: String(coupon.value), maxUses: String(coupon.maxUses), active: !coupon.active })}><b dir="ltr">{coupon.code}</b><span>{coupon.discountType === 'percent' ? `${coupon.value}%` : formatEgp(coupon.value, locale)} · {coupon.usedCount || 0}{coupon.maxUses ? ` / ${coupon.maxUses}` : ''}</span><small>{coupon.active ? (locale === 'ar' ? 'مفعّل' : 'Active') : (locale === 'ar' ? 'متوقف' : 'Paused')}</small></button>)}</div></div>
        {storeOwner && <div className="shop-admin-staff"><h2>{locale === 'ar' ? 'حسابات فريق المتجر' : 'Store staff accounts'}</h2><p>{locale === 'ar' ? 'مالك المتجر فقط يستطيع منح أو سحب صلاحية الإدارة. يجب على الموظف تحديث تسجيل الدخول بعد تغيير الصلاحية.' : 'Only the store owner can grant or revoke staff access. Staff must refresh their sign-in after a role change.'}</p><div className="shop-admin-staff-add"><input value={staffUidDraft} onChange={(event) => setStaffUidDraft(event.target.value)} placeholder={locale === 'ar' ? 'أدخل Firebase Auth UID للموظف' : 'Enter staff Firebase Auth UID'} dir="ltr"/><button className="shop-button shop-button-dark shop-button-small" disabled={busy || staffLoading || staffUidDraft.trim().length < 8} onClick={async () => { const uid = staffUidDraft.trim(); if (await adminAction('setStorefrontStaffAdmin', { uid, enabled: true })) { setStaffUidDraft(''); await loadAdminStaff('', false); } }}>{locale === 'ar' ? 'منح صلاحية الإدارة' : 'Grant admin access'}</button></div>{adminStaff.map((staff) => <article key={staff.uid}><div><b>{staff.displayName || staff.email || staff.phoneNumber || staff.uid}</b><small dir="ltr">{staff.email || staff.phoneNumber || staff.uid}</small><small>{staff.owner ? (locale === 'ar' ? 'مالك' : 'Owner') : staff.admin ? (locale === 'ar' ? 'مسؤول' : 'Admin') : (locale === 'ar' ? 'بدون صلاحية' : 'No admin access')}{staff.disabled ? (locale === 'ar' ? ' · معطّل' : ' · Disabled') : ''}</small></div>{!staff.owner && <button className="shop-button shop-button-small shop-button-outline" disabled={busy || staffLoading} onClick={() => void changeStaffAdmin(staff.uid, !staff.admin)}>{staff.admin ? (locale === 'ar' ? 'سحب الإدارة' : 'Revoke admin') : (locale === 'ar' ? 'منح الإدارة' : 'Grant admin')}</button>}</article>)}{staffLoading && <small>{locale === 'ar' ? 'تحميل حسابات الفريق…' : 'Loading staff accounts…'}</small>}{staffPageToken && <button className="shop-button shop-button-outline shop-button-small" disabled={staffLoading} onClick={() => void loadAdminStaff(staffPageToken, true)}>{locale === 'ar' ? 'تحميل المزيد' : 'Load more'}</button>}</div>}<div className="shop-admin-orders"><h2>{t.overview} <span>{adminOrders.length}</span></h2>{adminError && <p className="shop-error">{adminError}</p>}{adminOrders.length ? adminOrders.map((order) => { const next: Record<string, string> = { awaiting_payment: 'cancelled', confirmed: 'processing', processing: 'ready_for_pickup', ready_for_pickup: 'delivered', delivered: 'refunded' }; const canDelete = ['cancelled','delivered','refunded'].includes(order.status); return <article className="shop-admin-order" key={order.id}><div className="shop-admin-order-head"><div><small>{order.invoiceNumber}</small><h3>{order.customerName}</h3><span dir="ltr">{order.customerPhone}</span></div><strong>{formatEgp(order.total, locale)}</strong></div><div className="shop-admin-order-meta"><span>{order.orderCode}</span><span>{statusText(order.status, locale)}</span><span>{statusText(order.paymentStatus, locale)}</span>{order.paymentReference && <span>{locale === 'ar' ? 'مرجع الدفع:' : 'Payment ref:'} {order.paymentReference}</span>}{order.refundReference && <span>{locale === 'ar' ? 'مرجع الاسترداد:' : 'Refund ref:'} {order.refundReference}</span>}</div><div className="shop-admin-buttons">{order.paymentStatus !== 'deposit_verified' && order.paymentStatus !== 'paid' && <button className="shop-button shop-button-small" disabled={busy || ['cancelled','refunded'].includes(order.status)} onClick={() => void adminAction('setStorePaymentStatus', { orderId: order.id, status: 'deposit_verified' })}>{t.paymentConfirm}</button>}{next[order.status] && <button className="shop-button shop-button-small" disabled={busy} onClick={() => { const status = next[order.status]; if (status === 'refunded') { setRefundTarget(order); setRefundReference(''); } else void adminAction('setStoreOrderStatus', { orderId: order.id, status, reason: locale === 'ar' ? 'أُلغي قبل تأكيد الدفع.' : 'Cancelled before payment confirmation.' }); }}>{next[order.status] === 'refunded' ? (locale === 'ar' ? 'تسجيل استرداد' : 'Record refund') : next[order.status] === 'cancelled' ? (locale === 'ar' ? 'إلغاء الطلب' : 'Cancel order') : next[order.status] === 'delivered' ? (locale === 'ar' ? 'تأكيد الاستلام وسداد المتبقي' : 'Confirm pickup and balance') : locale === 'ar' ? `التالي: ${statusText(next[order.status], locale)}` : `Move to ${statusText(next[order.status], locale)}`}</button>}<button className="shop-button shop-button-small shop-button-outline" onClick={() => { setActiveInvoice(order); setView('invoice'); }}>{t.invoice}</button><button className="shop-danger-link" disabled={!canDelete || busy} title={!canDelete ? (locale === 'ar' ? 'ألغِ الطلب أو أكمل تسليمه قبل الحذف.' : 'Cancel or complete the order before deletion.') : ''} onClick={() => setDeleteTarget(order)}>{t.delete}</button></div></article>; }) : <div className="shop-state"><p>{locale === 'ar' ? 'لا توجد طلبات متجر بعد.' : 'No storefront orders yet.'}</p></div>}</div>
      </div></section>;
  }

  function renderInfo(view: 'about' | 'contact' | 'policies') {
    const heading = view === 'about' ? t.about : view === 'contact' ? t.contact : t.policies;
    const content = view === 'about'
      ? (locale === 'ar' ? 'نختار النظارات بعناية لتجمع بين وضوح الرؤية والتعبير الشخصي. ميدو أوبتكس — تجربة بصرية تبدأ باختيارك.' : 'We select eyewear with care, bringing visual clarity and personal expression together. Mido Optics — an optical experience shaped around you.')
      : view === 'contact'
        ? (settings.contactPhone ? `${locale === 'ar' ? 'اتصل بنا' : 'Call us'}: ${settings.contactPhone}` : (locale === 'ar' ? 'بيانات التواصل يحددها فريق المتجر من الإعدادات.' : 'Store contact details are managed by the store team.'))
        : (locale === 'ar' ? 'الاستلام من الفرع فقط. تتم مراجعة العربون يدوياً. تتوفر تفاصيل الإلغاء والاستبدال من فريق المتجر قبل إتمام الطلب.' : 'Store pickup only. Deposits are verified manually. Contact the store team for cancellation and exchange terms before ordering.');
    return <section className="shop-container shop-info-page"><span className="shop-kicker">MIDO OPTICS / {view.toUpperCase()}</span><h1>{heading}</h1><p>{content}</p>{view === 'contact' && settings.contactPhone && <a className="shop-button shop-button-dark" href={`tel:${settings.contactPhone}`}>{locale === 'ar' ? 'اتصل بالمتجر' : 'Call the store'}</a>}</section>;
  }

  let content;
  if (route.view === 'home') content = <>
    <section className="shop-hero"><div className="shop-hero-copy"><span className="shop-kicker">MIDO OPTICS · OPTICAL ATELIER</span><h1>{t.title.split('\n').map((line) => <span key={line}>{line}</span>)}</h1><p>{t.intro}</p><button className="shop-button shop-button-light" onClick={() => setView('catalog')}>{t.discover}<ArrowRight size={17}/></button><div className="shop-hero-index"><span>01</span><i/><span>{locale === 'ar' ? 'رؤية يومية' : 'DAILY VISION'}</span></div></div><div className="shop-hero-visual"><div className="shop-hero-orbit shop-orbit-one"/><div className="shop-hero-orbit shop-orbit-two"/>{products[0] && <ProductImage src={products[0].variants[0]?.images[0] || products[0].images[0] || products[0].imageUrl} alt={products[0].name} className="shop-hero-image"/>}<span className="shop-hero-caption">01 — {products[0]?.name || 'OPTICAL FORM'}</span><span className="shop-hero-side-note">MIDO / COLLECTION</span></div><div className="shop-hero-scroll">SCROLL TO DISCOVER <span>↓</span></div></section>
    {activeBanners[0] && <section className="shop-promo-strip"><span className="shop-kicker">MIDO / {t.offers}</span><div>{activeBanners[0].imageUrl && <img className="shop-promo-image" src={activeBanners[0].imageUrl} alt=""/>}<h2>{locale === 'ar' ? activeBanners[0].titleAr : activeBanners[0].titleEn}</h2><p>{locale === 'ar' ? activeBanners[0].descriptionAr : activeBanners[0].descriptionEn}</p></div><button onClick={() => setView('offers')}>{t.discover}<ArrowRight size={16}/></button></section>}
    <section className="shop-container shop-feature-section"><div className="shop-section-heading"><div><span className="shop-kicker">THE EDIT / 2026</span><h2>{t.featured}</h2></div><button className="shop-back-link" onClick={() => setView('catalog')}>{t.all}{locale === 'ar' ? <ArrowLeft size={16}/> : <ArrowRight size={16}/>}</button></div>{productGrid(products.filter((product) => product.featured).slice(0, 4).length ? products.filter((product) => product.featured).slice(0, 4) : products.slice(0, 4))}</section>
    <section className="shop-editorial"><div className="shop-editorial-line"/><span className="shop-kicker">A STUDY IN LIGHT</span><p>{locale === 'ar' ? 'تفاصيل دقيقة. رؤية أوسع.' : 'Considered details. A wider point of view.'}</p><button onClick={() => setView('catalog')}>{t.discover}<ArrowRight size={16}/></button></section>
  </>;
  else if (route.view === 'catalog') content = <section className="shop-container shop-page-section"><div className="shop-page-heading"><span className="shop-kicker">COLLECTION / 2026</span><h1>{t.shop}</h1><p>{t.intro}</p></div><div className="shop-catalog-controls"><label className="shop-search"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search}/></label><div className="shop-category-scroll"><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>{t.all}</button>{['prescription','sunglasses','contact_lenses','accessories'].map((id) => <button key={id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)}>{t[categoryKeys[id]]}</button>)}</div></div>{productGrid(visibleProducts)}</section>;
  else if (route.view === 'product') content = renderProduct();
  else if (route.view === 'cart') content = renderCart();
  else if (route.view === 'checkout') content = renderCheckout();
  else if (route.view === 'account') content = <section className="shop-container shop-page-section shop-account-page"><div className="shop-page-heading"><span className="shop-kicker">ACCOUNT / MIDO</span><h1>{userName || user?.displayName || t.account}</h1></div>{user ? <><div className="shop-account-card"><UserRound size={23}/><div><b>{userName || user.displayName || t.account}</b><span dir="ltr">{user.phoneNumber}</span>{profileEmail && <span dir="ltr">{profileEmail}</span>}</div><button className="shop-text-button" onClick={() => setEditingProfile(!editingProfile)}>{t.editProfile}</button><button className="shop-text-button" onClick={() => void signOutCustomer()}><LogOut size={15}/>{t.signOut}</button></div>{editingProfile && <div className="shop-profile-edit"><label className="shop-label">{t.fullName}<input value={profileNameDraft} onChange={(event) => setProfileNameDraft(event.target.value)} autoComplete="name" /></label><label className="shop-label">{t.email}<input value={profileEmailDraft} onChange={(event) => setProfileEmailDraft(event.target.value)} type="email" dir="ltr" autoComplete="email" /></label><button className="shop-button shop-button-dark" disabled={busy || profileNameDraft.trim().length < 2} onClick={async () => { await adminAction('saveCustomerProfile', { displayName: profileNameDraft.trim(), email: profileEmailDraft.trim() }); setEditingProfile(false); }}>{t.save}</button></div>}<div className="shop-account-links"><button onClick={() => setView('orders')}><Package size={19}/>{t.orders}<span>{orders.length}</span></button><button onClick={() => setView('wishlist')}><Heart size={19}/>{t.wishlist}<span>{wishlist.length}</span></button>{admin && <button onClick={() => setView('admin')}><ShieldCheck size={19}/>{t.admin}</button>}</div><div className="shop-loyalty-card"><span>{locale === 'ar' ? 'نقاط الولاء' : 'Loyalty points'}</span><b>{loyaltyPoints.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}</b></div></> : <><p>{t.accountHint}</p><button className="shop-button shop-button-dark" onClick={() => setAuthOpen(true)}>{t.signIn}</button></>}</section>;
  else if (route.view === 'orders') content = renderOrders();
  else if (route.view === 'wishlist') content = <section className="shop-container shop-page-section"><div className="shop-page-heading"><span className="shop-kicker">ACCOUNT / SAVED</span><h1>{t.wishlist}</h1></div>{productGrid(products.filter((product) => wishlist.includes(product.id)))}</section>;
  else if (route.view === 'offers') content = <section className="shop-container shop-page-section"><div className="shop-page-heading"><span className="shop-kicker">MIDO OPTICS / PROMOTIONS</span><h1>{t.offers}</h1><p>{locale === 'ar' ? 'العروض الفعالة حالياً من فريق المتجر.' : 'Current offers published by the store team.'}</p></div>{activeBanners.length ? <div className="shop-offer-grid">{activeBanners.map((banner) => <article className="shop-offer-card" key={banner.id}>{banner.imageUrl && <img className="shop-offer-image" src={banner.imageUrl} alt="" loading="lazy"/>}<span className="shop-kicker">MIDO / LIMITED OFFER</span><h2>{locale === 'ar' ? banner.titleAr : banner.titleEn}</h2><p>{locale === 'ar' ? banner.descriptionAr : banner.descriptionEn}</p>{banner.couponCode && <button className="shop-offer-code" onClick={async () => { try { await navigator.clipboard.writeText(banner.couponCode || ''); setNotice(locale === 'ar' ? 'تم نسخ كود الخصم.' : 'Discount code copied.'); } catch { setNotice(banner.couponCode || ''); } }}><span dir="ltr">{banner.couponCode}</span><small>{locale === 'ar' ? 'اضغط للنسخ' : 'Tap to copy'}</small></button>}<a className="shop-button shop-button-dark" href={banner.destination}>{t.discover}<ArrowRight size={16}/></a></article>)}</div> : <div className="shop-state"><span className="shop-state-ornament">◌</span><p>{locale === 'ar' ? 'لا توجد عروض فعالة الآن.' : 'There are no active offers right now.'}</p><button className="shop-button shop-button-outline" onClick={() => setView('catalog')}>{t.shop}</button></div>}</section>;
  else if (route.view === 'invoice') content = renderInvoice(activeInvoice || orders.find((item) => item.id === new URLSearchParams(location.search).get('order')) || null);
  else if (route.view === 'admin') content = renderAdmin();
  else content = renderInfo(route.view);

  return <div className={`shop-app ${dark ? 'shop-dark' : ''}`} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    {header}<main>{content}</main>
    <footer className="shop-footer"><div className="shop-footer-top"><div><span className="shop-wordmark">mido optics<span>OPTICAL ATELIER</span></span><p>{t.intro}</p></div><div className="shop-footer-links"><button onClick={() => setView('about')}>{t.about}</button><button onClick={() => setView('contact')}>{t.contact}</button><button onClick={() => setView('offers')}>{t.offers}</button><button onClick={() => setView('policies')}>{t.policies}</button><button onClick={() => setView('admin')}>{t.admin}</button></div><div className="shop-footer-news">{locale === 'ar' ? 'الرؤية تبدأ من هنا.' : 'A clearer point of view.'}<span>EGYPT · {new Date().getFullYear()}</span></div></div><div className="shop-footer-bottom"><span>© MIDO OPTICS</span><span>{locale === 'ar' ? 'جميع الحقوق محفوظة' : 'ALL RIGHTS RESERVED'}</span></div></footer>
    {notice && <div className="shop-toast" role="status" aria-live="polite"><Check size={16}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {authOpen && <AuthDialog locale={locale} onClose={() => setAuthOpen(false)} onSuccess={(current) => { setUser(current); setAuthOpen(false); if (route.view === 'checkout') setNotice(locale === 'ar' ? 'تم التحقق من الهاتف. يمكنك إكمال الطلب.' : 'Phone verified. You can continue checkout.'); }}/>}
    {deleteTarget && <div className="shop-overlay"><section className="shop-modal" role="alertdialog" aria-modal="true"><h2>{t.delete}</h2><p>{t.deletePrompt}</p><div className="shop-modal-actions"><button className="shop-button shop-button-outline" onClick={() => setDeleteTarget(null)}>{t.cancel}</button><button className="shop-button shop-button-danger" disabled={busy} onClick={async () => { await adminAction('permanentlyDeleteStoreOrder', { orderId: deleteTarget.id }); setDeleteTarget(null); }}>{t.delete}</button></div></section></div>}
    {refundTarget && <div className="shop-overlay"><section className="shop-modal" role="dialog" aria-modal="true"><span className="shop-kicker">{refundTarget.orderCode}</span><h2>{locale === 'ar' ? 'تسجيل استرداد يدوي' : 'Record a manual refund'}</h2><p>{locale === 'ar' ? 'نفّذ الاسترداد خارج الموقع أولاً ثم أدخل مرجع العملية. لن يتغير سجل الدفع قبل هذه الخطوة.' : 'Issue the refund outside the website first, then enter its transaction reference. The payment record changes only after this confirmation.'}</p><label className="shop-label">{locale === 'ar' ? 'مرجع عملية الاسترداد' : 'Refund transaction reference'}<input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} maxLength={100} dir="ltr" /></label><div className="shop-modal-actions"><button className="shop-button shop-button-outline" onClick={() => { setRefundTarget(null); setRefundReference(''); }}>{t.cancel}</button><button className="shop-button shop-button-danger" disabled={busy || refundReference.trim().length < 4} onClick={async () => { const saved = await adminAction('setStoreOrderStatus', { orderId: refundTarget.id, status: 'refunded', refundReference: refundReference.trim() }); if (saved) { setRefundTarget(null); setRefundReference(''); } }}>{locale === 'ar' ? 'تأكيد تسجيل الاسترداد' : 'Confirm refund record'}</button></div></section></div>}
    {cancelTarget && <div className="shop-overlay"><section className="shop-modal" role="alertdialog" aria-modal="true"><span className="shop-kicker">{cancelTarget.orderCode}</span><h2>{locale === 'ar' ? 'إلغاء الطلب' : 'Cancel order'}</h2><p>{locale === 'ar' ? 'سيتم إعادة الكمية المحجوزة إلى المخزون وتسجيل سبب الإلغاء.' : 'Reserved stock will be restored and the reason recorded.'}</p><label className="shop-label">{locale === 'ar' ? 'سبب الإلغاء (اختياري)' : 'Reason (optional)'}<textarea rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label><div className="shop-modal-actions"><button className="shop-button shop-button-outline" onClick={() => setCancelTarget(null)}>{t.cancel}</button><button className="shop-button shop-button-danger" disabled={busy} onClick={async () => { await adminAction('cancelStoreOrder', { orderId: cancelTarget.id, reason: cancelReason }); setCancelTarget(null); }}>{locale === 'ar' ? 'تأكيد الإلغاء' : 'Confirm cancellation'}</button></div></section></div>}
    {paymentReferenceOrder && <div className="shop-overlay"><section className="shop-modal" role="dialog" aria-modal="true"><span className="shop-kicker">{paymentReferenceOrder.orderCode}</span><h2>{locale === 'ar' ? 'مرجع تحويل العربون' : 'Deposit transfer reference'}</h2><p>{locale === 'ar' ? 'إرسال المرجع يحول حالة الدفع إلى «بانتظار المراجعة» فقط. لن يُسجل المبلغ مدفوعاً حتى يؤكده فريق المتجر.' : 'Submitting a reference marks the payment for review only. It is not marked paid until store staff confirms it.'}</p><label className="shop-label">{locale === 'ar' ? 'رقم العملية أو مرجع التحويل' : 'Transaction or transfer reference'}<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={100} dir="ltr" /></label><div className="shop-modal-actions"><button className="shop-button shop-button-outline" onClick={() => setPaymentReferenceOrder(null)}>{t.cancel}</button><button className="shop-button shop-button-dark" disabled={busy || paymentReference.trim().length < 4} onClick={async () => { await adminAction('submitStorePaymentReference', { orderId: paymentReferenceOrder.id, reference: paymentReference.trim() }); setPaymentReferenceOrder(null); }}>{locale === 'ar' ? 'إرسال للمراجعة' : 'Send for review'}</button></div></section></div>}
    {bannerEditorOpen && <div className="shop-overlay"><section className="shop-modal shop-modal-wide" role="dialog" aria-modal="true"><button className="shop-icon-btn shop-modal-close" onClick={() => setBannerEditorOpen(false)} aria-label={t.cancel}><X size={19}/></button><span className="shop-kicker">MIDO / CAMPAIGNS</span><h2>{locale === 'ar' ? 'إدارة البانرات والعروض' : 'Campaign banners and offers'}</h2><div className="shop-banner-editor-grid"><label className="shop-label">{locale === 'ar' ? 'العنوان بالعربية' : 'Arabic title'}<input value={bannerDraft.titleAr} onChange={(event) => setBannerDraft((current) => ({ ...current, titleAr: event.target.value }))}/></label><label className="shop-label">English title<input value={bannerDraft.titleEn} onChange={(event) => setBannerDraft((current) => ({ ...current, titleEn: event.target.value }))}/></label><label className="shop-label">{locale === 'ar' ? 'الوصف بالعربية' : 'Arabic description'}<textarea rows={2} value={bannerDraft.descriptionAr} onChange={(event) => setBannerDraft((current) => ({ ...current, descriptionAr: event.target.value }))}/></label><label className="shop-label">English description<textarea rows={2} value={bannerDraft.descriptionEn} onChange={(event) => setBannerDraft((current) => ({ ...current, descriptionEn: event.target.value }))}/></label><label className="shop-label shop-banner-image-field">{locale === 'ar' ? 'صورة الحملة' : 'Campaign image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy || imageUploadProgress['campaign-image'] !== undefined} onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ''; if (!file) return; const progressKey = 'campaign-image'; setImageUploadProgress((current) => ({ ...current, [progressKey]: 0 })); void uploadStorefrontProductImage('campaigns', bannerDraft.id || crypto.randomUUID(), file, (percent) => setImageUploadProgress((current) => ({ ...current, [progressKey]: percent }))).then((imageUrl) => setBannerDraft((current) => ({ ...current, imageUrl }))).catch((error) => setNotice(error instanceof Error ? error.message : t.error)).finally(() => setImageUploadProgress((current) => { const next = { ...current }; delete next[progressKey]; return next; })); }}/>{bannerDraft.imageUrl && <img src={bannerDraft.imageUrl} alt={locale === 'ar' ? 'معاينة صورة الحملة' : 'Campaign image preview'}/>}{imageUploadProgress['campaign-image'] !== undefined && <small>{locale === 'ar' ? 'جاري رفع الصورة' : 'Uploading image'} {imageUploadProgress['campaign-image']}%</small>}</label><label className="shop-label">{locale === 'ar' ? 'كود الخصم المرتبط' : 'Linked discount code'}<input dir="ltr" value={bannerDraft.couponCode} onChange={(event) => setBannerDraft((current) => ({ ...current, couponCode: event.target.value.toUpperCase() }))}/></label><label className="shop-label">{locale === 'ar' ? 'الوجهة' : 'Destination'}<select value={bannerDraft.destination} onChange={(event) => setBannerDraft((current) => ({ ...current, destination: event.target.value }))}><option value="/shop/offers">{t.offers}</option><option value="/shop?view=catalog">{t.shop}</option><option value="/shop">{t.home}</option></select></label><label className="shop-label">{locale === 'ar' ? 'يبدأ في' : 'Starts at'}<input type="datetime-local" value={bannerDraft.startsAt} onChange={(event) => setBannerDraft((current) => ({ ...current, startsAt: event.target.value }))}/></label><label className="shop-label">{locale === 'ar' ? 'ينتهي في' : 'Ends at'}<input type="datetime-local" value={bannerDraft.endsAt} onChange={(event) => setBannerDraft((current) => ({ ...current, endsAt: event.target.value }))}/></label></div><label className="shop-coupon-active"><input type="checkbox" checked={bannerDraft.active} onChange={(event) => setBannerDraft((current) => ({ ...current, active: event.target.checked }))}/>{locale === 'ar' ? 'مفعّل' : 'Active'}</label><div className="shop-modal-actions"><button className="shop-button shop-button-outline" onClick={() => { setBannerEditorOpen(false); setBannerDraft({ id: '', titleAr: '', titleEn: '', descriptionAr: '', descriptionEn: '', imageUrl: '', couponCode: '', destination: '/shop/offers', startsAt: '', endsAt: '', active: true }); }}>{t.cancel}</button><button className="shop-button shop-button-dark" disabled={busy || imageUploadProgress['campaign-image'] !== undefined || !bannerDraft.titleAr.trim() || !bannerDraft.titleEn.trim()} onClick={async () => { await adminAction('saveStorefrontBanner', { ...bannerDraft, startsAt: bannerDraft.startsAt ? new Date(bannerDraft.startsAt).toISOString() : '', endsAt: bannerDraft.endsAt ? new Date(bannerDraft.endsAt).toISOString() : '' }); setBannerEditorOpen(false); setBannerDraft({ id: '', titleAr: '', titleEn: '', descriptionAr: '', descriptionEn: '', imageUrl: '', couponCode: '', destination: '/shop/offers', startsAt: '', endsAt: '', active: true }); }}>{locale === 'ar' ? 'حفظ الحملة' : 'Save campaign'}</button></div><div className="shop-admin-coupon-list">{adminBanners.map((banner) => <button key={banner.id} onClick={() => setBannerDraft({ id: banner.id, titleAr: banner.titleAr, titleEn: banner.titleEn, descriptionAr: banner.descriptionAr, descriptionEn: banner.descriptionEn, imageUrl: banner.imageUrl || '', couponCode: banner.couponCode || '', destination: banner.destination || '/shop/offers', startsAt: dateTimeLocalValue(banner.startsAt), endsAt: dateTimeLocalValue(banner.endsAt), active: banner.active })}><b>{locale === 'ar' ? banner.titleAr : banner.titleEn}</b><small>{banner.active ? (locale === 'ar' ? 'مفعّل — اضغط للتعديل أو الإيقاف' : 'Active — edit or pause') : (locale === 'ar' ? 'متوقف — اضغط للتعديل أو التفعيل' : 'Paused — edit or activate')}</small></button>)}</div></section></div>}
    <div className="shop-print-only" aria-hidden="true" />
  </div>;
}
