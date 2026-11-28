import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { authenticatedStorefrontFetch } from '../lib/storefrontProxy';
import {
  deleteStorefrontCatalogItem,
  fetchPublicStorefrontCatalog,
  fetchStorefrontDeletedOrderCodes,
  fetchStorefrontOrdersOnce,
  formatStorefrontErrorMessage,
  onStorefrontAuthChanged,
  signInStorefrontAdmin,
  signOutStorefrontAdmin,
  subscribeStorefrontDeletedOrderCodes,
  subscribeStorefrontOrders,
  deleteStorefrontOrder,
  saveStorefrontDeletedOrderCodes,
  updateStorefrontOrderStatus,
  upsertStorefrontCatalogItem,
} from '../lib/storefrontFirebase';
import {
  CustomerRecord,
  DEFAULT_WA_TEMPLATE,
  PendingPriceSyncOp,
  PendingRepairSyncOp,
  PendingSyncOp,
  PendingWebOrderSyncOp,
  PendingWebProductSyncOp,
  PriceItem,
  PriceItemCategory,
  RepairRecord,
  ShopSettings,
  SyncState,
  UsageType,
  WebOrder,
  WebOrderStatus,
  WebProduct,
  WebProductCategory,
} from '../types/optics';
import {
  advanceHist,
  applyCustomerDeliverySettlement,
  applyRepairDeliverySettlement,
  buildStorefrontSlug,
  clampNumber,
  DEFAULT_STOREFRONT_WEBSITE_URL,
  generateCustomerId,
  generatePriceItemId,
  generateRepairId,
  generateToken,
  generateWebProductId,
  mapWebOrderToCustomerInput,
  mapWebProductToStorefrontLens,
  mapWebProductToStorefrontProduct,
  normalizeCustomerRecord,
  normalizePriceCategory,
  normalizePriceItem,
  normalizeRepairRecord,
  normalizeUsageType,
  normalizeWebOrder,
  normalizeWebOrderStatus,
  normalizeWebProduct,
  normalizeWebProductCategory,
  SAMPLE_CUSTOMERS,
  SAMPLE_REPAIRS,
  sanitizeAddPower,
  sanitizeEyeTuple,
  sanitizeFramePhoto,
  sanitizeId,
  sanitizePickupDate,
  sanitizeProductColors,
  sanitizeToken,
  sanitizeWebsiteUrl,
  STARTER_PRICE_ITEMS,
} from '../utils/optics';
import { useOnlineStatus } from './useOnlineStatus';

const STORAGE_CUSTOMERS_KEY = 'mido_customers_v2';
const LEGACY_CUSTOMERS_KEY = 'mido_customers';
const STORAGE_PENDING_KEY = 'mido_pending_ops_v1';
const STORAGE_PRICES_KEY = 'mido_prices_v1';
const STORAGE_PENDING_PRICES_KEY = 'mido_pending_price_ops_v1';
const STORAGE_REPAIRS_KEY = 'mido_repairs_v1';
const STORAGE_PENDING_REPAIRS_KEY = 'mido_pending_repair_ops_v1';
const STORAGE_WEB_PRODUCTS_KEY = 'mido_web_products_v1';
const STORAGE_PENDING_WEB_PRODUCTS_KEY = 'mido_pending_web_product_ops_v1';
const STORAGE_WEB_ORDERS_KEY = 'mido_web_orders_v1';
const STORAGE_DELETED_WEB_ORDER_CODES_KEY = 'mido_deleted_web_order_codes_v1';
const STORAGE_PENDING_WEB_ORDERS_KEY = 'mido_pending_web_order_ops_v1';
const STORAGE_SETTINGS_KEY = 'mido_settings_v1';

const DEFAULT_SETTINGS: ShopSettings = {
  shopName: 'Mido Optics',
  autoWhatsApp: true,
  waTemplate: DEFAULT_WA_TEMPLATE,
  publicBaseUrl: '',
  websiteUrl: DEFAULT_STOREFRONT_WEBSITE_URL,
  autoTransferWebOrdersToWhatsApp: true,
};

function readLocalCustomers(): CustomerRecord[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_CUSTOMERS_KEY) ||
      localStorage.getItem(LEGACY_CUSTOMERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeCustomerRecord)
      .filter((x): x is CustomerRecord => x !== null)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  } catch {
    return [];
  }
}

function writeLocalCustomers(list: CustomerRecord[]): void {
  try {
    localStorage.setItem(STORAGE_CUSTOMERS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function readPendingOps(): PendingSyncOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingOps(ops: PendingSyncOp[]): void {
  try {
    localStorage.setItem(STORAGE_PENDING_KEY, JSON.stringify(ops));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function readLocalSettings(): ShopSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const savedUrl = sanitizeWebsiteUrl(parsed.websiteUrl);
    return {
      shopName: String(parsed.shopName || 'Mido Optics').slice(0, 80),
      autoWhatsApp: typeof parsed.autoWhatsApp === 'boolean' ? parsed.autoWhatsApp : true,
      waTemplate: String(parsed.waTemplate || DEFAULT_WA_TEMPLATE).slice(0, 600),
      publicBaseUrl: String(parsed.publicBaseUrl || '').trim().slice(0, 200),
      websiteUrl: savedUrl || DEFAULT_STOREFRONT_WEBSITE_URL,
      autoTransferWebOrdersToWhatsApp:
        typeof parsed.autoTransferWebOrdersToWhatsApp === 'boolean'
          ? parsed.autoTransferWebOrdersToWhatsApp
          : true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeLocalSettings(settings: ShopSettings): void {
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function readLocalPriceItems(): PriceItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_PRICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizePriceItem)
      .filter((x): x is PriceItem => x !== null)
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  } catch {
    return [];
  }
}

function writeLocalPriceItems(list: PriceItem[]): void {
  try {
    localStorage.setItem(STORAGE_PRICES_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function readPendingPriceOps(): PendingPriceSyncOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_PRICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingPriceOps(ops: PendingPriceSyncOp[]): void {
  try {
    localStorage.setItem(STORAGE_PENDING_PRICES_KEY, JSON.stringify(ops));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function readLocalRepairs(): RepairRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_REPAIRS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeRepairRecord)
      .filter((x): x is RepairRecord => x !== null)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  } catch {
    return [];
  }
}

function writeLocalRepairs(list: RepairRecord[]): void {
  try {
    localStorage.setItem(STORAGE_REPAIRS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function readPendingRepairOps(): PendingRepairSyncOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_REPAIRS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingRepairOps(ops: PendingRepairSyncOp[]): void {
  try {
    localStorage.setItem(STORAGE_PENDING_REPAIRS_KEY, JSON.stringify(ops));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function readLocalWebProducts(): WebProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_WEB_PRODUCTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeWebProduct)
      .filter((x): x is WebProduct => x !== null)
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  } catch {
    return [];
  }
}

function writeLocalWebProducts(list: WebProduct[]): void {
  try {
    localStorage.setItem(STORAGE_WEB_PRODUCTS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function readPendingWebProductOps(): PendingWebProductSyncOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_WEB_PRODUCTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingWebProductOps(ops: PendingWebProductSyncOp[]): void {
  try {
    localStorage.setItem(STORAGE_PENDING_WEB_PRODUCTS_KEY, JSON.stringify(ops));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function readLocalWebOrders(): WebOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_WEB_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeWebOrder(item, 'webhook'))
      .filter((x): x is WebOrder => x !== null)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch {
    return [];
  }
}

function writeLocalWebOrders(list: WebOrder[]): void {
  try {
    localStorage.setItem(STORAGE_WEB_ORDERS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function normalizeWebOrderCode(value: unknown): string {
  return String(value || '').trim().toUpperCase().slice(0, 64);
}

function readDeletedWebOrderCodes(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_DELETED_WEB_ORDER_CODES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.map(normalizeWebOrderCode).filter(Boolean)))
      : [];
  } catch {
    return [];
  }
}

function writeDeletedWebOrderCodes(codes: string[]): void {
  try {
    localStorage.setItem(STORAGE_DELETED_WEB_ORDER_CODES_KEY, JSON.stringify(codes));
  } catch {
    // Keep the in-memory tombstones active if local storage is unavailable.
  }
}

function readPendingWebOrderOps(): PendingWebOrderSyncOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_WEB_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingWebOrderOps(ops: PendingWebOrderSyncOp[]): void {
  try {
    localStorage.setItem(STORAGE_PENDING_WEB_ORDERS_KEY, JSON.stringify(ops));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export interface CustomerInput {
  id?: string;
  name: string;
  phone: string;
  frame: string;
  lens: string;
  framePrice?: number;
  lensPrice?: number;
  total: number;
  paid: number;
  photo: string;
  r: [string, string, string];
  l: [string, string, string];
  add?: string;
  usageType?: UsageType;
  pickupDate: string;
}

export interface PriceItemInput {
  id?: string;
  name: string;
  category: PriceItemCategory;
  price: number;
  notes?: string;
  photo?: string;
}

export interface RepairInput {
  id?: string;
  name: string;
  phone: string;
  glassesType: string;
  weldingType: string;
  representativeName: string;
  cost: number;
  paid: number;
  notes?: string;
  pickupDate: string;
}

export interface WebProductInput {
  id?: string;
  name: string;
  category: WebProductCategory;
  price: number;
  brand?: string;
  discountPrice?: number;
  featured?: boolean;
  newArrival?: boolean;
  colors: string[];
  available: boolean;
  notes?: string;
  photo?: string;
}

export function useOpticsStore() {
  const isOnline = useOnlineStatus();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [customers, setCustomers] = useState<CustomerRecord[]>(() => readLocalCustomers());
  const [pendingOps, setPendingOps] = useState<PendingSyncOp[]>(() => readPendingOps());
  const [priceItems, setPriceItems] = useState<PriceItem[]>(() => readLocalPriceItems());
  const [pendingPriceOps, setPendingPriceOps] = useState<PendingPriceSyncOp[]>(() =>
    readPendingPriceOps()
  );
  const [repairs, setRepairs] = useState<RepairRecord[]>(() => readLocalRepairs());
  const [pendingRepairOps, setPendingRepairOps] = useState<PendingRepairSyncOp[]>(() =>
    readPendingRepairOps()
  );
  const [webProducts, setWebProducts] = useState<WebProduct[]>(() => readLocalWebProducts());
  const [pendingWebProductOps, setPendingWebProductOps] = useState<PendingWebProductSyncOp[]>(() =>
    readPendingWebProductOps()
  );
  const [webOrders, setWebOrders] = useState<WebOrder[]>(() => readLocalWebOrders());
  const [deletedWebOrderCodes, setDeletedWebOrderCodes] = useState<string[]>(() =>
    readDeletedWebOrderCodes()
  );
  const [pendingWebOrderOps, setPendingWebOrderOps] = useState<PendingWebOrderSyncOp[]>(() =>
    readPendingWebOrderOps()
  );
  const [settings, setSettings] = useState<ShopSettings>(() => readLocalSettings());
  const [firestorePendingWrites, setFirestorePendingWrites] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Storefront integration live status
  const [storefrontUser, setStorefrontUser] = useState<User | null>(null);
  const [storefrontSyncStatus, setStorefrontSyncStatus] = useState<{
    state: 'idle' | 'syncing' | 'ok' | 'partial' | 'error';
    message: string;
    publicProductsCount?: number;
    publicLensesCount?: number;
    lastSyncedAt?: number;
  }>({ state: 'idle', message: '' });

  const knownServerCustomerIds = useRef<Set<string>>(new Set());
  const knownServerPriceIds = useRef<Set<string>>(new Set());
  const knownServerRepairIds = useRef<Set<string>>(new Set());
  const knownServerWebProductIds = useRef<Set<string>>(new Set());
  const knownServerWebOrderIds = useRef<Set<string>>(new Set());
  const deletedWebOrderCodesRef = useRef<Set<string>>(new Set(readDeletedWebOrderCodes()));
  const syncedDeletedOrderUserRef = useRef<string | null>(null);
  const autoConvertedOrderIds = useRef<Set<string>>(new Set());
  const convertedCustomerByOrderCode = useRef<Map<string, string>>(new Map());
  const cleanedDeletedOrderCustomerIds = useRef<Set<string>>(new Set());
  const isFlushing = useRef(false);

  // Persist local mirror whenever collections/pendingOps/settings change
  useEffect(() => {
    writeLocalCustomers(customers);
  }, [customers]);

  useEffect(() => {
    writePendingOps(pendingOps);
  }, [pendingOps]);

  useEffect(() => {
    writeLocalPriceItems(priceItems);
  }, [priceItems]);

  useEffect(() => {
    writePendingPriceOps(pendingPriceOps);
  }, [pendingPriceOps]);

  useEffect(() => {
    writeLocalRepairs(repairs);
  }, [repairs]);

  useEffect(() => {
    writePendingRepairOps(pendingRepairOps);
  }, [pendingRepairOps]);

  useEffect(() => {
    writeLocalWebProducts(webProducts);
  }, [webProducts]);

  useEffect(() => {
    writePendingWebProductOps(pendingWebProductOps);
  }, [pendingWebProductOps]);

  useEffect(() => {
    writeLocalWebOrders(webOrders);
  }, [webOrders]);

  useEffect(() => {
    const codes = Array.from(new Set(deletedWebOrderCodes.map(normalizeWebOrderCode).filter(Boolean)));
    deletedWebOrderCodesRef.current = new Set(codes);
    writeDeletedWebOrderCodes(codes);
  }, [deletedWebOrderCodes]);

  const rememberDeletedWebOrderCodes = useCallback((codes: string[]) => {
    const additions = codes
      .map(normalizeWebOrderCode)
      .filter((code) => Boolean(code) && !deletedWebOrderCodesRef.current.has(code));
    if (additions.length === 0) return;
    const next = Array.from(new Set([...deletedWebOrderCodesRef.current, ...additions]));
    deletedWebOrderCodesRef.current = new Set(next);
    writeDeletedWebOrderCodes(next);
    setDeletedWebOrderCodes(next);
  }, []);

  useEffect(() => {
    writePendingWebOrderOps(pendingWebOrderOps);
  }, [pendingWebOrderOps]);

  useEffect(() => {
    writeLocalSettings(settings);
  }, [settings]);

  // Watch primary Firebase auth state & secondary Storefront Firebase auth state
  useEffect(() => {
    const unsubMain = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    const unsubStorefront = onStorefrontAuthChanged((nextSfUser) => {
      setStorefrontUser(nextSfUser);
    });
    return () => {
      unsubMain();
      unsubStorefront();
    };
  }, []);

  const commitUpsertToFirestore = useCallback(
    async (record: CustomerRecord, uid: string, shopName: string) => {
      const id = sanitizeId(record.id);
      const tok = sanitizeToken(record.tok);
      const customerRef = doc(db, 'customers', id);
      const trackRef = doc(db, 'track', tok);
      const batch = writeBatch(db);

      let existsOnServer = knownServerCustomerIds.current.has(id);
      if (!existsOnServer) {
        try {
          const existingCustSnap = await getDoc(customerRef);
          existsOnServer = existingCustSnap.exists();
          if (existsOnServer) {
            knownServerCustomerIds.current.add(id);
          }
        } catch {
          existsOnServer = false;
        }
      }

      const safeFramePrice = clampNumber(record.framePrice);
      const safeLensPrice = clampNumber(record.lensPrice);
      const safeTotal = clampNumber(record.total);
      const safePaid = clampNumber(record.paid);
      const safePhoto =
        record.photo && record.photo.startsWith('data:image/') && record.photo.length <= 350_000
          ? record.photo
          : '';
      const safeR = sanitizeEyeTuple(record.r);
      const safeL = sanitizeEyeTuple(record.l);
      const safeAdd = sanitizeAddPower(record.add);
      const safeUsageType = normalizeUsageType(record.usageType);
      const safeStatus = Math.max(0, Math.min(4, Math.trunc(record.status || 0)));
      const rawHist = Array.isArray(record.hist) ? record.hist.slice(0, 5) : [Date.now()];
      const safeHist = rawHist.map((item, idx) => {
        if (typeof item === 'number' && Number.isFinite(item) && item >= 0) {
          return Math.trunc(item);
        }
        return idx === 0 ? Date.now() : null;
      });
      if (safeHist.length === 0) {
        safeHist.push(Date.now());
      }
      const rawDate = String(record.date || '').trim().slice(0, 40);
      const safeDate = rawDate.length >= 10 ? rawDate : new Date().toISOString();
      const safeName = record.name.trim().slice(0, 120) || 'عميل';
      const safePhone = (record.phone || '').trim().slice(0, 30);
      const safeFrame = (record.frame || '').trim().slice(0, 120);
      const safeLens = (record.lens || '').trim().slice(0, 120);
      const safePickupDate = sanitizePickupDate(record.pickupDate);
      const safeDelivered = Boolean(record.delivered);

      if (existsOnServer) {
        batch.update(customerRef, {
          name: safeName,
          phone: safePhone,
          frame: safeFrame,
          lens: safeLens,
          framePrice: safeFramePrice,
          lensPrice: safeLensPrice,
          total: safeTotal,
          paid: safePaid,
          photo: safePhoto,
          r: safeR,
          l: safeL,
          add: safeAdd,
          usageType: safeUsageType,
          status: safeStatus,
          hist: safeHist,
          pickupDate: safePickupDate,
          delivered: safeDelivered,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(customerRef, {
          id,
          ownerId: uid,
          date: safeDate,
          name: safeName,
          phone: safePhone,
          frame: safeFrame,
          lens: safeLens,
          framePrice: safeFramePrice,
          lensPrice: safeLensPrice,
          total: safeTotal,
          paid: safePaid,
          photo: safePhoto,
          r: safeR,
          l: safeL,
          add: safeAdd,
          usageType: safeUsageType,
          status: safeStatus,
          hist: safeHist,
          tok,
          pickupDate: safePickupDate,
          delivered: safeDelivered,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      let trackExists = existsOnServer;
      try {
        const trackSnap = await getDoc(trackRef);
        trackExists = trackSnap.exists();
      } catch {
        trackExists = existsOnServer;
      }

      if (trackExists) {
        batch.update(trackRef, {
          shopName: shopName.slice(0, 80) || 'Mido Optics',
          n: safeName,
          frame: safeFrame,
          lens: safeLens,
          total: safeTotal,
          paid: safePaid,
          ph: safePhoto,
          r: safeR,
          l: safeL,
          add: safeAdd,
          usageType: safeUsageType,
          s: safeStatus,
          h: safeHist,
          pickupDate: safePickupDate,
          delivered: safeDelivered,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(trackRef, {
          tok,
          ownerId: uid,
          customerId: id,
          shopName: shopName.slice(0, 80) || 'Mido Optics',
          n: safeName,
          frame: safeFrame,
          lens: safeLens,
          total: safeTotal,
          paid: safePaid,
          ph: safePhoto,
          r: safeR,
          l: safeL,
          add: safeAdd,
          usageType: safeUsageType,
          s: safeStatus,
          h: safeHist,
          pickupDate: safePickupDate,
          delivered: safeDelivered,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
        knownServerCustomerIds.current.add(id);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `customers/${id}`);
      }
    },
    []
  );

  const commitDeleteToFirestore = useCallback(async (customerId: string, tok?: string) => {
    const id = sanitizeId(customerId);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'customers', id));
    if (tok) {
      batch.delete(doc(db, 'track', sanitizeToken(tok)));
    }
    try {
      await batch.commit();
      knownServerCustomerIds.current.delete(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `customers/${id}`);
    }
  }, []);

  const commitPriceUpsertToFirestore = useCallback(
    async (item: PriceItem, uid: string) => {
      const id = sanitizeId(item.id, 'p');
      const priceRef = doc(db, 'prices', id);

      let existsOnServer = knownServerPriceIds.current.has(id);
      if (!existsOnServer) {
        try {
          const snap = await getDoc(priceRef);
          existsOnServer = snap.exists();
          if (existsOnServer) {
            knownServerPriceIds.current.add(id);
          }
        } catch {
          existsOnServer = false;
        }
      }

      const safeName = item.name.trim().slice(0, 120) || 'صنف';
      const safeCategory = normalizePriceCategory(item.category);
      const safePrice = clampNumber(item.price);
      const safeNotes = (item.notes || '').trim().slice(0, 240);
      const safePhoto = safeCategory === 'frame' ? sanitizeFramePhoto(item.photo) : '';
      const safeCreatedAtMs = Math.max(0, Math.trunc(item.createdAtMs || Date.now()));
      const safeUpdatedAtMs = Math.max(0, Math.trunc(item.updatedAtMs || Date.now()));

      try {
        if (existsOnServer) {
          await updateDoc(priceRef, {
            name: safeName,
            category: safeCategory,
            price: safePrice,
            notes: safeNotes,
            photo: safePhoto,
            updatedAtMs: safeUpdatedAtMs,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(priceRef, {
            id,
            ownerId: uid,
            name: safeName,
            category: safeCategory,
            price: safePrice,
            notes: safeNotes,
            photo: safePhoto,
            createdAtMs: safeCreatedAtMs,
            updatedAtMs: safeUpdatedAtMs,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        knownServerPriceIds.current.add(id);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `prices/${id}`);
      }
    },
    []
  );

  const commitPriceDeleteToFirestore = useCallback(async (priceId: string) => {
    const id = sanitizeId(priceId, 'p');
    try {
      await deleteDoc(doc(db, 'prices', id));
      knownServerPriceIds.current.delete(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `prices/${id}`);
    }
  }, []);

  const commitRepairUpsertToFirestore = useCallback(
    async (record: RepairRecord, uid: string, shopName: string) => {
      const id = sanitizeId(record.id, 'r');
      const tok = sanitizeToken(record.tok);
      const repairRef = doc(db, 'repairs', id);
      const trackRef = doc(db, 'repairTrack', tok);
      const batch = writeBatch(db);

      let existsOnServer = knownServerRepairIds.current.has(id);
      if (!existsOnServer) {
        try {
          const existingSnap = await getDoc(repairRef);
          existsOnServer = existingSnap.exists();
          if (existsOnServer) {
            knownServerRepairIds.current.add(id);
          }
        } catch {
          existsOnServer = false;
        }
      }

      const safeCost = clampNumber(record.cost);
      const safePaid = clampNumber(record.paid);
      const safeStatus = Math.max(0, Math.min(4, Math.trunc(record.status || 0)));
      const rawHist = Array.isArray(record.hist) ? record.hist.slice(0, 5) : [Date.now()];
      const safeHist = rawHist.map((item, idx) => {
        if (typeof item === 'number' && Number.isFinite(item) && item >= 0) {
          return Math.trunc(item);
        }
        return idx === 0 ? Date.now() : null;
      });
      if (safeHist.length === 0) {
        safeHist.push(Date.now());
      }
      const rawDate = String(record.date || '').trim().slice(0, 40);
      const safeDate = rawDate.length >= 10 ? rawDate : new Date().toISOString();
      const safeName = record.name.trim().slice(0, 120) || 'عميل';
      const safePhone = (record.phone || '').trim().slice(0, 30);
      const safeGlasses = (record.glassesType || '').trim().slice(0, 120);
      const safeWelding = (record.weldingType || '').trim().slice(0, 120);
      const safeRep = (record.representativeName || '').trim().slice(0, 120);
      const safeNotes = (record.notes || '').trim().slice(0, 240);
      const safePickupDate = sanitizePickupDate(record.pickupDate);
      const safeDelivered = Boolean(record.delivered);

      if (existsOnServer) {
        batch.update(repairRef, {
          name: safeName,
          phone: safePhone,
          glassesType: safeGlasses,
          weldingType: safeWelding,
          representativeName: safeRep,
          cost: safeCost,
          paid: safePaid,
          notes: safeNotes,
          status: safeStatus,
          hist: safeHist,
          pickupDate: safePickupDate,
          delivered: safeDelivered,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(repairRef, {
          id,
          ownerId: uid,
          date: safeDate,
          name: safeName,
          phone: safePhone,
          glassesType: safeGlasses,
          weldingType: safeWelding,
          representativeName: safeRep,
          cost: safeCost,
          paid: safePaid,
          notes: safeNotes,
          status: safeStatus,
          hist: safeHist,
          tok,
          pickupDate: safePickupDate,
          delivered: safeDelivered,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      let trackExists = existsOnServer;
      try {
        const trackSnap = await getDoc(trackRef);
        trackExists = trackSnap.exists();
      } catch {
        trackExists = existsOnServer;
      }

      if (trackExists) {
        batch.update(trackRef, {
          shopName: shopName.slice(0, 80) || 'Mido Optics',
          n: safeName,
          glassesType: safeGlasses,
          weldingType: safeWelding,
          representativeName: safeRep,
          cost: safeCost,
          paid: safePaid,
          s: safeStatus,
          h: safeHist,
          pickupDate: safePickupDate,
          delivered: safeDelivered,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(trackRef, {
          tok,
          ownerId: uid,
          repairId: id,
          shopName: shopName.slice(0, 80) || 'Mido Optics',
          n: safeName,
          glassesType: safeGlasses,
          weldingType: safeWelding,
          representativeName: safeRep,
          cost: safeCost,
          paid: safePaid,
          s: safeStatus,
          h: safeHist,
          pickupDate: safePickupDate,
          delivered: safeDelivered,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
        knownServerRepairIds.current.add(id);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `repairs/${id}`);
      }
    },
    []
  );

  const commitRepairDeleteToFirestore = useCallback(async (repairId: string, tok?: string) => {
    const id = sanitizeId(repairId, 'r');
    const batch = writeBatch(db);
    batch.delete(doc(db, 'repairs', id));
    if (tok) {
      batch.delete(doc(db, 'repairTrack', sanitizeToken(tok)));
    }
    try {
      await batch.commit();
      knownServerRepairIds.current.delete(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `repairs/${id}`);
    }
  }, []);

  const commitWebProductUpsertToFirestore = useCallback(
    async (product: WebProduct, uid: string) => {
      const id = sanitizeId(product.id, 'wp');
      const productRef = doc(db, 'webProducts', id);

      let existsOnServer = knownServerWebProductIds.current.has(id);
      if (!existsOnServer) {
        try {
          const snap = await getDoc(productRef);
          existsOnServer = snap.exists();
          if (existsOnServer) {
            knownServerWebProductIds.current.add(id);
          }
        } catch {
          existsOnServer = false;
        }
      }

      const safeName = product.name.trim().slice(0, 120) || 'منتج';
      const safeCategory = normalizeWebProductCategory(product.category);
      const safePrice = clampNumber(product.price);
      const safeColors = sanitizeProductColors(product.colors);
      const safeAvailable = Boolean(product.available);
      const safeNotes = (product.notes || '').trim().slice(0, 240);
      const safePhoto = sanitizeFramePhoto(product.photo);
      const safeCreatedAtMs = Math.max(0, Math.trunc(product.createdAtMs || Date.now()));
      const safeUpdatedAtMs = Math.max(0, Math.trunc(product.updatedAtMs || Date.now()));

      try {
        if (existsOnServer) {
          await updateDoc(productRef, {
            name: safeName,
            category: safeCategory,
            price: safePrice,
            colors: safeColors,
            available: safeAvailable,
            notes: safeNotes,
            photo: safePhoto,
            updatedAtMs: safeUpdatedAtMs,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(productRef, {
            id,
            ownerId: uid,
            name: safeName,
            category: safeCategory,
            price: safePrice,
            colors: safeColors,
            available: safeAvailable,
            notes: safeNotes,
            photo: safePhoto,
            createdAtMs: safeCreatedAtMs,
            updatedAtMs: safeUpdatedAtMs,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        knownServerWebProductIds.current.add(id);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `webProducts/${id}`);
      }
    },
    []
  );

  const commitWebProductDeleteToFirestore = useCallback(async (productId: string) => {
    const id = sanitizeId(productId, 'wp');
    try {
      await deleteDoc(doc(db, 'webProducts', id));
      knownServerWebProductIds.current.delete(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `webProducts/${id}`);
    }
  }, []);

  const commitWebOrderUpsertToFirestore = useCallback(
    async (order: WebOrder, uid: string) => {
      const id = sanitizeId(order.id, 'wo');
      const orderRef = doc(db, 'webOrders', id);

      let existsOnServer = knownServerWebOrderIds.current.has(id);
      if (!existsOnServer) {
        try {
          const snap = await getDoc(orderRef);
          existsOnServer = snap.exists();
          if (existsOnServer) {
            knownServerWebOrderIds.current.add(id);
          }
        } catch {
          existsOnServer = false;
        }
      }

      const payload = {
        orderCode: String(order.orderCode || id).slice(0, 64),
        invoiceNumber: String(order.invoiceNumber || order.orderCode || id).slice(0, 64),
        orderType: order.orderType === 'preorder' ? 'preorder' : 'standard',
        customerName: order.customerName.trim().slice(0, 120) || 'عميل موقع',
        customerPhone: (order.customerPhone || '').trim().slice(0, 30),
        customerAddress: (order.customerAddress || '').trim().slice(0, 240),
        notes: (order.notes || '').trim().slice(0, 400),
        items: (order.items || []).slice(0, 50),
        prescription: order.prescription ?? null,
        frameSubtotal: clampNumber(order.frameSubtotal),
        lensSubtotal: clampNumber(order.lensSubtotal),
        total: clampNumber(order.total),
        status: normalizeWebOrderStatus(order.status),
        source: order.source || 'webhook',
        ...(order.convertedCustomerId
          ? { convertedCustomerId: sanitizeId(order.convertedCustomerId, 'c') }
          : {}),
        updatedAtMs: Math.max(0, Math.trunc(order.updatedAtMs || Date.now())),
        updatedAt: serverTimestamp(),
      };

      try {
        if (existsOnServer) {
          await updateDoc(orderRef, payload);
        } else {
          await setDoc(orderRef, {
            id,
            ownerId: uid,
            ...payload,
            createdAtMs: Math.max(0, Math.trunc(order.createdAtMs || Date.now())),
            createdAt: serverTimestamp(),
          });
        }
        knownServerWebOrderIds.current.add(id);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `webOrders/${id}`);
      }
    },
    []
  );

  const commitWebOrderDeleteToFirestore = useCallback(async (orderId: string, orderCode?: string) => {
    const id = sanitizeId(orderId, 'wo');
    try {
      await deleteDoc(doc(db, 'webOrders', id));
      knownServerWebOrderIds.current.delete(id);
      if (orderCode && storefrontUser && !(user && user.emailVerified)) {
        await deleteStorefrontOrder(orderCode);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `webOrders/${id}`);
    }
  }, [storefrontUser]);

  // Flush queued offline/pre-login ops when authenticated & online
  const flushPendingOps = useCallback(async () => {
    if (!user || !user.emailVerified || !isOnline || isFlushing.current) return;
    if (
      pendingOps.length === 0 &&
      pendingPriceOps.length === 0 &&
      pendingRepairOps.length === 0 &&
      pendingWebProductOps.length === 0 &&
      pendingWebOrderOps.length === 0
    ) {
      return;
    }

    isFlushing.current = true;
    try {
      const opsToRun = [...pendingOps];
      const succeededIds = new Set<string>();
      for (const op of opsToRun) {
        if (op.type === 'upsert' && op.record) {
          await commitUpsertToFirestore(op.record, user.uid, settings.shopName);
          succeededIds.add(op.id);
        } else if (op.type === 'delete') {
          await commitDeleteToFirestore(op.customerId, op.tok);
          succeededIds.add(op.id);
        }
      }
      if (succeededIds.size > 0) {
        setPendingOps((prev) => prev.filter((op) => !succeededIds.has(op.id)));
      }

      const priceOpsToRun = [...pendingPriceOps];
      const succeededPriceOpIds = new Set<string>();
      for (const op of priceOpsToRun) {
        if (op.type === 'upsert' && op.item) {
          await commitPriceUpsertToFirestore(op.item, user.uid);
          succeededPriceOpIds.add(op.id);
        } else if (op.type === 'delete') {
          await commitPriceDeleteToFirestore(op.priceId);
          succeededPriceOpIds.add(op.id);
        }
      }
      if (succeededPriceOpIds.size > 0) {
        setPendingPriceOps((prev) => prev.filter((op) => !succeededPriceOpIds.has(op.id)));
      }

      const repairOpsToRun = [...pendingRepairOps];
      const succeededRepairOpIds = new Set<string>();
      for (const op of repairOpsToRun) {
        if (op.type === 'upsert' && op.record) {
          await commitRepairUpsertToFirestore(op.record, user.uid, settings.shopName);
          succeededRepairOpIds.add(op.id);
        } else if (op.type === 'delete') {
          await commitRepairDeleteToFirestore(op.repairId, op.tok);
          succeededRepairOpIds.add(op.id);
        }
      }
      if (succeededRepairOpIds.size > 0) {
        setPendingRepairOps((prev) => prev.filter((op) => !succeededRepairOpIds.has(op.id)));
      }

      const webProductOpsToRun = [...pendingWebProductOps];
      const succeededWebProductOpIds = new Set<string>();
      for (const op of webProductOpsToRun) {
        if (op.type === 'upsert' && op.product) {
          await commitWebProductUpsertToFirestore(op.product, user.uid);
          succeededWebProductOpIds.add(op.id);
        } else if (op.type === 'delete') {
          await commitWebProductDeleteToFirestore(op.productId);
          succeededWebProductOpIds.add(op.id);
        }
      }
      if (succeededWebProductOpIds.size > 0) {
        setPendingWebProductOps((prev) =>
          prev.filter((op) => !succeededWebProductOpIds.has(op.id))
        );
      }

      const webOrderOpsToRun = [...pendingWebOrderOps];
      const succeededWebOrderOpIds = new Set<string>();
      for (const op of webOrderOpsToRun) {
        if (op.type === 'upsert' && op.order) {
          await commitWebOrderUpsertToFirestore(op.order, user.uid);
          succeededWebOrderOpIds.add(op.id);
        } else if (op.type === 'delete') {
          await commitWebOrderDeleteToFirestore(op.orderId, op.orderCode);
          succeededWebOrderOpIds.add(op.id);
        }
      }
      if (succeededWebOrderOpIds.size > 0) {
        setPendingWebOrderOps((prev) =>
          prev.filter((op) => !succeededWebOrderOpIds.has(op.id))
        );
      }

      setSyncError(null);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'تعذر المزامنة');
    } finally {
      isFlushing.current = false;
    }
  }, [
    user,
    isOnline,
    pendingOps,
    pendingPriceOps,
    pendingRepairOps,
    pendingWebProductOps,
    pendingWebOrderOps,
    settings.shopName,
    commitUpsertToFirestore,
    commitDeleteToFirestore,
    commitPriceUpsertToFirestore,
    commitPriceDeleteToFirestore,
    commitRepairUpsertToFirestore,
    commitRepairDeleteToFirestore,
    commitWebProductUpsertToFirestore,
    commitWebProductDeleteToFirestore,
    commitWebOrderUpsertToFirestore,
    commitWebOrderDeleteToFirestore,
  ]);

  useEffect(() => {
    void flushPendingOps();
  }, [flushPendingOps]);

  // Attach real-time Firestore listeners once authenticated
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      knownServerCustomerIds.current.clear();
      knownServerPriceIds.current.clear();
      knownServerRepairIds.current.clear();
      knownServerWebProductIds.current.clear();
      setFirestorePendingWrites(false);
      return;
    }

    const q = query(collection(db, 'customers'), where('ownerId', '==', user.uid));
    let isFirstSnapshot = true;

    const unsubCustomers = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        setFirestorePendingWrites(snapshot.metadata.hasPendingWrites);
        setSyncError(null);

        const serverList: CustomerRecord[] = [];
        const nextKnown = new Set<string>();

        for (const docSnap of snapshot.docs) {
          const normalized = normalizeCustomerRecord(docSnap.data());
          if (normalized) {
            serverList.push(normalized);
            nextKnown.add(normalized.id);
          }
        }

        knownServerCustomerIds.current = nextKnown;

        // If cloud is empty on first sign-in and device has local records, queue them for upload!
        if (isFirstSnapshot && serverList.length === 0) {
          const localOnly = readLocalCustomers();
          if (localOnly.length > 0) {
            isFirstSnapshot = false;
            setPendingOps((prev) => {
              const existingCustIds = new Set(prev.map((p) => p.customerId));
              const additions: PendingSyncOp[] = localOnly
                .filter((c) => !existingCustIds.has(c.id))
                .map((c) => ({
                  id: `migrate_${c.id}_${Date.now()}`,
                  type: 'upsert',
                  customerId: c.id,
                  record: { ...c, ownerId: user.uid },
                  tok: c.tok,
                  queuedAt: Date.now(),
                }));
              return additions.length ? [...prev, ...additions] : prev;
            });
            return;
          }
        }
        isFirstSnapshot = false;

        // Merge any un-flushed local pending operations on top of snapshot
        const currentPending = readPendingOps();
        const pendingDeletes = new Set(
          currentPending.filter((op) => op.type === 'delete').map((op) => op.customerId)
        );
        const pendingUpserts = new Map<string, CustomerRecord>();
        for (const op of currentPending) {
          if (op.type === 'upsert' && op.record) {
            pendingUpserts.set(op.customerId, op.record);
          }
        }

        const mergedMap = new Map<string, CustomerRecord>();
        for (const item of serverList) {
          if (!pendingDeletes.has(item.id)) {
            mergedMap.set(item.id, item);
          }
        }
        for (const [id, rec] of pendingUpserts.entries()) {
          mergedMap.set(id, rec);
        }

        const sorted = Array.from(mergedMap.values()).sort(
          (a, b) => Date.parse(b.date) - Date.parse(a.date)
        );
        setCustomers(sorted);
      },
      (err) => {
        setSyncError(err.message);
        try {
          handleFirestoreError(err, OperationType.LIST, 'customers');
        } catch {
          // Structured error logged in handleFirestoreError; keep app running offline-first
        }
      }
    );

    const settingsRef = doc(db, 'settings', user.uid);
    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const savedUrl = sanitizeWebsiteUrl(d.websiteUrl);
          setSettings({
            shopName: String(d.shopName || 'Mido Optics').slice(0, 80),
            autoWhatsApp: typeof d.autoWhatsApp === 'boolean' ? d.autoWhatsApp : true,
            waTemplate: String(d.waTemplate || DEFAULT_WA_TEMPLATE).slice(0, 600),
            publicBaseUrl: String(d.publicBaseUrl || '').trim().slice(0, 200),
            websiteUrl: savedUrl || DEFAULT_STOREFRONT_WEBSITE_URL,
            autoTransferWebOrdersToWhatsApp:
              typeof d.autoTransferWebOrdersToWhatsApp === 'boolean'
                ? d.autoTransferWebOrdersToWhatsApp
                : true,
          });
        }
      },
      (err) => {
        setSyncError(err.message);
        try {
          handleFirestoreError(err, OperationType.GET, `settings/${user.uid}`);
        } catch {
          // Structured error logged in handleFirestoreError; keep app running offline-first
        }
      }
    );

    const pricesQuery = query(collection(db, 'prices'), where('ownerId', '==', user.uid));
    let isFirstPriceSnapshot = true;

    const unsubPrices = onSnapshot(
      pricesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setSyncError(null);
        const serverPrices: PriceItem[] = [];
        const nextKnownPrices = new Set<string>();

        for (const docSnap of snapshot.docs) {
          const normalized = normalizePriceItem(docSnap.data());
          if (normalized) {
            serverPrices.push(normalized);
            nextKnownPrices.add(normalized.id);
          }
        }

        knownServerPriceIds.current = nextKnownPrices;

        if (isFirstPriceSnapshot && serverPrices.length === 0) {
          const localOnlyPrices = readLocalPriceItems();
          if (localOnlyPrices.length > 0) {
            isFirstPriceSnapshot = false;
            setPendingPriceOps((prev) => {
              const existingPriceIds = new Set(prev.map((p) => p.priceId));
              const additions: PendingPriceSyncOp[] = localOnlyPrices
                .filter((item) => !existingPriceIds.has(item.id))
                .map((item) => ({
                  id: `migrate_price_${item.id}_${Date.now()}`,
                  type: 'upsert',
                  priceId: item.id,
                  item: { ...item, ownerId: user.uid },
                  queuedAt: Date.now(),
                }));
              return additions.length ? [...prev, ...additions] : prev;
            });
            return;
          }
        }
        isFirstPriceSnapshot = false;

        const currentPendingPrices = readPendingPriceOps();
        const pendingDeletes = new Set(
          currentPendingPrices.filter((op) => op.type === 'delete').map((op) => op.priceId)
        );
        const pendingUpserts = new Map<string, PriceItem>();
        for (const op of currentPendingPrices) {
          if (op.type === 'upsert' && op.item) {
            pendingUpserts.set(op.priceId, op.item);
          }
        }

        const mergedPrices = new Map<string, PriceItem>();
        for (const item of serverPrices) {
          if (!pendingDeletes.has(item.id)) {
            mergedPrices.set(item.id, item);
          }
        }
        for (const [id, item] of pendingUpserts.entries()) {
          mergedPrices.set(id, item);
        }

        setPriceItems(
          Array.from(mergedPrices.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      },
      (err) => {
        setSyncError(err.message);
        try {
          handleFirestoreError(err, OperationType.LIST, 'prices');
        } catch {
          // Structured error logged in handleFirestoreError; keep app running offline-first
        }
      }
    );

    const repairsQuery = query(collection(db, 'repairs'), where('ownerId', '==', user.uid));
    let isFirstRepairSnapshot = true;

    const unsubRepairs = onSnapshot(
      repairsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setSyncError(null);
        const serverRepairs: RepairRecord[] = [];
        const nextKnownRepairs = new Set<string>();

        for (const docSnap of snapshot.docs) {
          const normalized = normalizeRepairRecord(docSnap.data());
          if (normalized) {
            serverRepairs.push(normalized);
            nextKnownRepairs.add(normalized.id);
          }
        }

        knownServerRepairIds.current = nextKnownRepairs;

        if (isFirstRepairSnapshot && serverRepairs.length === 0) {
          const localOnlyRepairs = readLocalRepairs();
          if (localOnlyRepairs.length > 0) {
            isFirstRepairSnapshot = false;
            setPendingRepairOps((prev) => {
              const existingRepairIds = new Set(prev.map((p) => p.repairId));
              const additions: PendingRepairSyncOp[] = localOnlyRepairs
                .filter((r) => !existingRepairIds.has(r.id))
                .map((r) => ({
                  id: `migrate_rep_${r.id}_${Date.now()}`,
                  type: 'upsert',
                  repairId: r.id,
                  record: { ...r, ownerId: user.uid },
                  tok: r.tok,
                  queuedAt: Date.now(),
                }));
              return additions.length ? [...prev, ...additions] : prev;
            });
            return;
          }
        }
        isFirstRepairSnapshot = false;

        const currentPendingRepairs = readPendingRepairOps();
        const pendingDeletes = new Set(
          currentPendingRepairs.filter((op) => op.type === 'delete').map((op) => op.repairId)
        );
        const pendingUpserts = new Map<string, RepairRecord>();
        for (const op of currentPendingRepairs) {
          if (op.type === 'upsert' && op.record) {
            pendingUpserts.set(op.repairId, op.record);
          }
        }

        const mergedRepairs = new Map<string, RepairRecord>();
        for (const item of serverRepairs) {
          if (!pendingDeletes.has(item.id)) {
            mergedRepairs.set(item.id, item);
          }
        }
        for (const [id, rec] of pendingUpserts.entries()) {
          mergedRepairs.set(id, rec);
        }

        setRepairs(
          Array.from(mergedRepairs.values()).sort(
            (a, b) => Date.parse(b.date) - Date.parse(a.date)
          )
        );
      },
      (err) => {
        setSyncError(err.message);
        try {
          handleFirestoreError(err, OperationType.LIST, 'repairs');
        } catch {
          // Structured error logged in handleFirestoreError; keep app running offline-first
        }
      }
    );

    const webProductsQuery = query(
      collection(db, 'webProducts'),
      where('ownerId', '==', user.uid)
    );
    let isFirstWebProductSnapshot = true;

    const unsubWebProducts = onSnapshot(
      webProductsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setSyncError(null);
        const serverProducts: WebProduct[] = [];
        const nextKnownProducts = new Set<string>();

        for (const docSnap of snapshot.docs) {
          const normalized = normalizeWebProduct(docSnap.data());
          if (normalized) {
            serverProducts.push(normalized);
            nextKnownProducts.add(normalized.id);
          }
        }

        knownServerWebProductIds.current = nextKnownProducts;

        if (isFirstWebProductSnapshot && serverProducts.length === 0) {
          const localOnlyProducts = readLocalWebProducts();
          if (localOnlyProducts.length > 0) {
            isFirstWebProductSnapshot = false;
            setPendingWebProductOps((prev) => {
              const existingIds = new Set(prev.map((p) => p.productId));
              const additions: PendingWebProductSyncOp[] = localOnlyProducts
                .filter((item) => !existingIds.has(item.id))
                .map((item) => ({
                  id: `migrate_wp_${item.id}_${Date.now()}`,
                  type: 'upsert',
                  productId: item.id,
                  product: { ...item, ownerId: user.uid },
                  queuedAt: Date.now(),
                }));
              return additions.length ? [...prev, ...additions] : prev;
            });
            return;
          }
        }
        isFirstWebProductSnapshot = false;

        const currentPendingProducts = readPendingWebProductOps();
        const pendingDeletes = new Set(
          currentPendingProducts.filter((op) => op.type === 'delete').map((op) => op.productId)
        );
        const pendingUpserts = new Map<string, WebProduct>();
        for (const op of currentPendingProducts) {
          if (op.type === 'upsert' && op.product) {
            pendingUpserts.set(op.productId, op.product);
          }
        }

        const mergedProducts = new Map<string, WebProduct>();
        for (const item of serverProducts) {
          if (!pendingDeletes.has(item.id)) {
            mergedProducts.set(item.id, item);
          }
        }
        for (const [id, item] of pendingUpserts.entries()) {
          mergedProducts.set(id, item);
        }

        setWebProducts(
          Array.from(mergedProducts.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      },
      (err) => {
        setSyncError(err.message);
        try {
          handleFirestoreError(err, OperationType.LIST, 'webProducts');
        } catch {
          // Structured error logged in handleFirestoreError; keep app running offline-first
        }
      }
    );

    const webOrdersQuery = query(
      collection(db, 'webOrders'),
      where('ownerId', '==', user.uid)
    );
    let isFirstWebOrderSnapshot = true;

    const unsubWebOrders = onSnapshot(
      webOrdersQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setSyncError(null);
        const serverOrders: WebOrder[] = [];
        const nextKnownOrders = new Set<string>();

        for (const docSnap of snapshot.docs) {
          const normalized = normalizeWebOrder(docSnap.data(), 'webhook');
          if (normalized) {
            serverOrders.push(normalized);
            nextKnownOrders.add(normalized.id);
          }
        }

        knownServerWebOrderIds.current = nextKnownOrders;

        if (isFirstWebOrderSnapshot && serverOrders.length === 0) {
          const localOnlyOrders = readLocalWebOrders();
          if (localOnlyOrders.length > 0) {
            isFirstWebOrderSnapshot = false;
            setPendingWebOrderOps((prev) => {
              const existingIds = new Set(prev.map((p) => p.orderId));
              const additions: PendingWebOrderSyncOp[] = localOnlyOrders
                .filter((item) => {
                  const code = normalizeWebOrderCode(item.orderCode);
                  return !existingIds.has(item.id) && !(code && deletedWebOrderCodesRef.current.has(code));
                })
                .map((item) => ({
                  id: `migrate_wo_${item.id}_${Date.now()}`,
                  type: 'upsert',
                  orderId: item.id,
                  orderCode: item.orderCode,
                  order: { ...item, ownerId: user.uid },
                  queuedAt: Date.now(),
                }));
              return additions.length ? [...prev, ...additions] : prev;
            });
            return;
          }
        }
        isFirstWebOrderSnapshot = false;

        const currentPendingOrders = readPendingWebOrderOps();
        const pendingDeletes = new Set(
          currentPendingOrders.filter((op) => op.type === 'delete').map((op) => op.orderId)
        );
        const pendingUpserts = new Map<string, WebOrder>();
        for (const op of currentPendingOrders) {
          const code = normalizeWebOrderCode(op.orderCode || op.order?.orderCode);
          if (op.type === 'upsert' && op.order && !(code && deletedWebOrderCodesRef.current.has(code))) {
            pendingUpserts.set(op.orderId, op.order);
          }
        }

        const mergedOrders = new Map<string, WebOrder>();
        for (const item of serverOrders) {
          const code = normalizeWebOrderCode(item.orderCode);
          if (!pendingDeletes.has(item.id) && !(code && deletedWebOrderCodesRef.current.has(code))) {
            mergedOrders.set(item.id, item);
          }
        }
        for (const [id, item] of pendingUpserts.entries()) {
          mergedOrders.set(id, item);
        }

        setWebOrders(
          Array.from(mergedOrders.values()).sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
      },
      (err) => {
        setSyncError(err.message);
        try {
          handleFirestoreError(err, OperationType.LIST, 'webOrders');
        } catch {
          // Structured error logged in handleFirestoreError; keep app running offline-first
        }
      }
    );

    return () => {
      unsubCustomers();
      unsubSettings();
      unsubPrices();
      unsubRepairs();
      unsubWebProducts();
      unsubWebOrders();
    };
  }, [authReady, user]);

  const queueOrSyncUpsert = useCallback(
    (record: CustomerRecord) => {
      if (user && user.emailVerified) {
        if (isOnline) {
          void commitUpsertToFirestore(record, user.uid, settings.shopName).catch((err) => {
            setSyncError(err instanceof Error ? err.message : 'تعذر المزامنة');
          });
        } else {
          // Queue in Firestore offline cache AND local pending backup
          void commitUpsertToFirestore(record, user.uid, settings.shopName).catch(() => {});
        }
        return;
      }

      // Not signed in yet: store in pending queue so it syncs automatically after sign-in
      setPendingOps((prev) => [
        ...prev.filter((op) => op.customerId !== record.id),
        {
          id: `op_${record.id}_${Date.now()}`,
          type: 'upsert',
          customerId: record.id,
          record,
          tok: record.tok,
          queuedAt: Date.now(),
        },
      ]);
    },
    [user, isOnline, settings.shopName, commitUpsertToFirestore]
  );

  const saveCustomer = useCallback(
    (input: CustomerInput): { record: CustomerRecord; isNew: boolean } => {
      const existing = input.id ? customers.find((c) => c.id === input.id) : undefined;
      const isNew = !existing;
      const nowIso = new Date().toISOString();

      const record: CustomerRecord = existing
        ? {
            ...existing,
            name: input.name.trim().slice(0, 120),
            phone: input.phone.trim().slice(0, 30),
            frame: input.frame.trim().slice(0, 120),
            lens: input.lens.trim().slice(0, 120),
            framePrice: clampNumber(input.framePrice),
            lensPrice: clampNumber(input.lensPrice),
            total: clampNumber(input.total),
            paid: clampNumber(input.paid),
            photo: input.photo || '',
            r: sanitizeEyeTuple(input.r),
            l: sanitizeEyeTuple(input.l),
            add: sanitizeAddPower(input.add),
            usageType: normalizeUsageType(input.usageType),
            pickupDate: sanitizePickupDate(input.pickupDate),
          }
        : {
            id: generateCustomerId(),
            ownerId: user?.uid,
            date: nowIso,
            name: input.name.trim().slice(0, 120),
            phone: input.phone.trim().slice(0, 30),
            frame: input.frame.trim().slice(0, 120),
            lens: input.lens.trim().slice(0, 120),
            framePrice: clampNumber(input.framePrice),
            lensPrice: clampNumber(input.lensPrice),
            total: clampNumber(input.total),
            paid: clampNumber(input.paid),
            photo: input.photo || '',
            r: sanitizeEyeTuple(input.r),
            l: sanitizeEyeTuple(input.l),
            add: sanitizeAddPower(input.add),
            usageType: normalizeUsageType(input.usageType),
            status: 0,
            hist: [Date.now()],
            tok: generateToken(10),
            pickupDate: sanitizePickupDate(input.pickupDate),
            delivered: false,
          };

      setCustomers((prev) => {
        if (existing) {
          return prev.map((item) => (item.id === record.id ? record : item));
        }
        return [record, ...prev];
      });

      queueOrSyncUpsert(record);
      return { record, isNew };
    },
    [customers, user, queueOrSyncUpsert]
  );

  const updateOrderStage = useCallback(
    (customerId: string, nextStage: number): CustomerRecord | null => {
      const target = customers.find((c) => c.id === customerId);
      if (!target) return null;
      const clampedStage = Math.max(0, Math.min(4, Math.trunc(nextStage)));
      const updated: CustomerRecord = {
        ...target,
        status: clampedStage,
        hist: advanceHist(target.hist, clampedStage, Date.now()),
      };
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? updated : c)));
      queueOrSyncUpsert(updated);
      return updated;
    },
    [customers, queueOrSyncUpsert]
  );

  const markCustomerDelivered = useCallback(
    (customerId: string): CustomerRecord | null => {
      const target = customers.find((c) => c.id === customerId);
      if (!target) return null;
      const updated = applyCustomerDeliverySettlement(target, Date.now());
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? updated : c)));
      queueOrSyncUpsert(updated);
      return updated;
    },
    [customers, queueOrSyncUpsert]
  );

  const restoreCustomerOrder = useCallback(
    (customerId: string): CustomerRecord | null => {
      const target = customers.find((c) => c.id === customerId);
      if (!target) return null;
      const updated: CustomerRecord = {
        ...target,
        delivered: false,
      };
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? updated : c)));
      queueOrSyncUpsert(updated);
      return updated;
    },
    [customers, queueOrSyncUpsert]
  );

  const deleteCustomer = useCallback(
    (customerId: string) => {
      const target = customers.find((c) => c.id === customerId);
      setCustomers((prev) => prev.filter((c) => c.id !== customerId));
      cleanedDeletedOrderCustomerIds.current.add(customerId);
      for (const [orderCode, convertedCustomerId] of convertedCustomerByOrderCode.current) {
        if (convertedCustomerId === customerId) convertedCustomerByOrderCode.current.delete(orderCode);
      }

      if (user && user.emailVerified) {
        void commitDeleteToFirestore(customerId, target?.tok).catch((err) => {
          setSyncError(err instanceof Error ? err.message : 'تعذر الحذف من السحابة');
        });
      } else {
        setPendingOps((prev) => [
          ...prev.filter((op) => op.customerId !== customerId),
          {
            id: `del_${customerId}_${Date.now()}`,
            type: 'delete',
            customerId,
            tok: target?.tok,
            queuedAt: Date.now(),
          },
        ]);
      }
    },
    [customers, user, commitDeleteToFirestore]
  );

  useEffect(() => {
    const deletedCodes = new Set(deletedWebOrderCodes.map(normalizeWebOrderCode).filter(Boolean));
    if (deletedCodes.size === 0) return;

    const customerIds = new Set<string>();
    for (const [orderCode, customerId] of convertedCustomerByOrderCode.current) {
      if (deletedCodes.has(orderCode)) customerIds.add(customerId);
    }
    for (const order of webOrders) {
      if (deletedCodes.has(normalizeWebOrderCode(order.orderCode)) && order.convertedCustomerId) {
        customerIds.add(order.convertedCustomerId);
      }
    }

    for (const customerId of customerIds) {
      if (!cleanedDeletedOrderCustomerIds.current.has(customerId)) deleteCustomer(customerId);
    }

    if (webOrders.some((order) => deletedCodes.has(normalizeWebOrderCode(order.orderCode)))) {
      setWebOrders((current) =>
        current.filter((order) => !deletedCodes.has(normalizeWebOrderCode(order.orderCode)))
      );
    }
  }, [deletedWebOrderCodes, webOrders, deleteCustomer]);

  const importCustomers = useCallback(
    (rawArray: unknown[]): number => {
      const normalized = rawArray
        .map(normalizeCustomerRecord)
        .filter((x): x is CustomerRecord => x !== null);
      if (normalized.length === 0) return 0;

      setCustomers((prev) => {
        const map = new Map<string, CustomerRecord>();
        for (const c of prev) map.set(c.id, c);
        for (const c of normalized) map.set(c.id, c);
        return Array.from(map.values()).sort(
          (a, b) => Date.parse(b.date) - Date.parse(a.date)
        );
      });

      for (const rec of normalized) {
        queueOrSyncUpsert(rec);
      }
      return normalized.length;
    },
    [queueOrSyncUpsert]
  );

  const loadSampleData = useCallback(() => {
    return importCustomers(SAMPLE_CUSTOMERS);
  }, [importCustomers]);

  const updateSettings = useCallback(
    async (patch: Partial<ShopSettings>) => {
      const next: ShopSettings = {
        ...settings,
        ...patch,
        shopName: String(patch.shopName ?? settings.shopName).slice(0, 80) || 'Mido Optics',
        waTemplate: String(patch.waTemplate ?? settings.waTemplate).slice(0, 600),
        publicBaseUrl: String(patch.publicBaseUrl ?? settings.publicBaseUrl).trim().slice(0, 200),
        websiteUrl: sanitizeWebsiteUrl(patch.websiteUrl ?? settings.websiteUrl),
        autoTransferWebOrdersToWhatsApp:
          typeof patch.autoTransferWebOrdersToWhatsApp === 'boolean'
            ? patch.autoTransferWebOrdersToWhatsApp
            : settings.autoTransferWebOrdersToWhatsApp ?? true,
      };
      setSettings(next);

      if (user && user.emailVerified) {
        const settingsRef = doc(db, 'settings', user.uid);
        try {
          const snap = await getDoc(settingsRef);
          const payload = {
            ownerId: user.uid,
            shopName: next.shopName,
            autoWhatsApp: next.autoWhatsApp,
            waTemplate: next.waTemplate,
            publicBaseUrl: next.publicBaseUrl,
            websiteUrl: next.websiteUrl || '',
            autoTransferWebOrdersToWhatsApp: Boolean(next.autoTransferWebOrdersToWhatsApp),
            updatedAt: serverTimestamp(),
          };
          if (snap.exists()) {
            await setDoc(
              settingsRef,
              {
                ...payload,
                createdAt: snap.data().createdAt,
              },
              { merge: false }
            );
          } else {
            await setDoc(settingsRef, {
              ...payload,
              createdAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `settings/${user.uid}`);
        }
      }
    },
    [settings, user]
  );

  const queueOrSyncPriceUpsert = useCallback(
    (item: PriceItem) => {
      if (user && user.emailVerified) {
        if (isOnline) {
          void commitPriceUpsertToFirestore(item, user.uid).catch((err) => {
            setSyncError(err instanceof Error ? err.message : 'تعذر المزامنة');
          });
        } else {
          void commitPriceUpsertToFirestore(item, user.uid).catch(() => {});
        }
        return;
      }

      setPendingPriceOps((prev) => [
        ...prev.filter((op) => op.priceId !== item.id),
        {
          id: `price_op_${item.id}_${Date.now()}`,
          type: 'upsert',
          priceId: item.id,
          item,
          queuedAt: Date.now(),
        },
      ]);
    },
    [user, isOnline, commitPriceUpsertToFirestore]
  );

  const savePriceItem = useCallback(
    (input: PriceItemInput): { item: PriceItem; isNew: boolean } => {
      const existing = input.id ? priceItems.find((p) => p.id === input.id) : undefined;
      const isNew = !existing;
      const nowMs = Date.now();

      const safeCategory = normalizePriceCategory(input.category);
      const safePhoto = safeCategory === 'frame' ? sanitizeFramePhoto(input.photo) : '';

      const item: PriceItem = existing
        ? {
            ...existing,
            name: input.name.trim().slice(0, 120),
            category: safeCategory,
            price: clampNumber(input.price),
            notes: (input.notes || '').trim().slice(0, 240),
            photo: safePhoto,
            updatedAtMs: nowMs,
          }
        : {
            id: generatePriceItemId(),
            ownerId: user?.uid,
            name: input.name.trim().slice(0, 120),
            category: safeCategory,
            price: clampNumber(input.price),
            notes: (input.notes || '').trim().slice(0, 240),
            photo: safePhoto,
            createdAtMs: nowMs,
            updatedAtMs: nowMs,
          };

      setPriceItems((prev) => {
        if (existing) {
          return prev
            .map((p) => (p.id === item.id ? item : p))
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        }
        return [item, ...prev];
      });

      queueOrSyncPriceUpsert(item);
      return { item, isNew };
    },
    [priceItems, user, queueOrSyncPriceUpsert]
  );

  const deletePriceItem = useCallback(
    (priceId: string) => {
      setPriceItems((prev) => prev.filter((p) => p.id !== priceId));

      if (user && user.emailVerified) {
        void commitPriceDeleteToFirestore(priceId).catch((err) => {
          setSyncError(err instanceof Error ? err.message : 'تعذر الحذف من السحابة');
        });
      } else {
        setPendingPriceOps((prev) => [
          ...prev.filter((op) => op.priceId !== priceId),
          {
            id: `del_price_${priceId}_${Date.now()}`,
            type: 'delete',
            priceId,
            queuedAt: Date.now(),
          },
        ]);
      }
    },
    [user, commitPriceDeleteToFirestore]
  );

  const loadStarterPriceItems = useCallback((): number => {
    const existingNames = new Set(
      priceItems.map((item) => `${item.category}::${item.name.trim().toLowerCase()}`)
    );
    const additions = STARTER_PRICE_ITEMS.filter(
      (item) => !existingNames.has(`${item.category}::${item.name.trim().toLowerCase()}`)
    ).map((item) => ({
      ...item,
      ownerId: user?.uid,
    }));

    if (additions.length === 0) return 0;

    setPriceItems((prev) =>
      [...additions, ...prev].sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    );
    for (const item of additions) {
      queueOrSyncPriceUpsert(item);
    }
    return additions.length;
  }, [priceItems, user, queueOrSyncPriceUpsert]);

  const queueOrSyncRepairUpsert = useCallback(
    (record: RepairRecord) => {
      if (user && user.emailVerified) {
        if (isOnline) {
          void commitRepairUpsertToFirestore(record, user.uid, settings.shopName).catch((err) => {
            setSyncError(err instanceof Error ? err.message : 'تعذر المزامنة');
          });
        } else {
          void commitRepairUpsertToFirestore(record, user.uid, settings.shopName).catch(() => {});
        }
        return;
      }

      setPendingRepairOps((prev) => [
        ...prev.filter((op) => op.repairId !== record.id),
        {
          id: `rep_op_${record.id}_${Date.now()}`,
          type: 'upsert',
          repairId: record.id,
          record,
          tok: record.tok,
          queuedAt: Date.now(),
        },
      ]);
    },
    [user, isOnline, settings.shopName, commitRepairUpsertToFirestore]
  );

  const saveRepair = useCallback(
    (input: RepairInput): { record: RepairRecord; isNew: boolean } => {
      const existing = input.id ? repairs.find((r) => r.id === input.id) : undefined;
      const isNew = !existing;
      const nowIso = new Date().toISOString();

      const record: RepairRecord = existing
        ? {
            ...existing,
            name: input.name.trim().slice(0, 120),
            phone: input.phone.trim().slice(0, 30),
            glassesType: input.glassesType.trim().slice(0, 120),
            weldingType: input.weldingType.trim().slice(0, 120),
            representativeName: input.representativeName.trim().slice(0, 120),
            cost: clampNumber(input.cost),
            paid: clampNumber(input.paid),
            notes: (input.notes || '').trim().slice(0, 240),
            pickupDate: sanitizePickupDate(input.pickupDate),
          }
        : {
            id: generateRepairId(),
            ownerId: user?.uid,
            date: nowIso,
            name: input.name.trim().slice(0, 120),
            phone: input.phone.trim().slice(0, 30),
            glassesType: input.glassesType.trim().slice(0, 120),
            weldingType: input.weldingType.trim().slice(0, 120),
            representativeName: input.representativeName.trim().slice(0, 120),
            cost: clampNumber(input.cost),
            paid: clampNumber(input.paid),
            notes: (input.notes || '').trim().slice(0, 240),
            status: 0,
            hist: [Date.now()],
            tok: generateToken(10),
            pickupDate: sanitizePickupDate(input.pickupDate),
            delivered: false,
          };

      setRepairs((prev) => {
        if (existing) {
          return prev.map((item) => (item.id === record.id ? record : item));
        }
        return [record, ...prev];
      });

      queueOrSyncRepairUpsert(record);
      return { record, isNew };
    },
    [repairs, user, queueOrSyncRepairUpsert]
  );

  const updateRepairStage = useCallback(
    (repairId: string, nextStage: number): RepairRecord | null => {
      const target = repairs.find((r) => r.id === repairId);
      if (!target) return null;
      const clampedStage = Math.max(0, Math.min(4, Math.trunc(nextStage)));
      const updated: RepairRecord = {
        ...target,
        status: clampedStage,
        hist: advanceHist(target.hist, clampedStage, Date.now()),
      };
      setRepairs((prev) => prev.map((r) => (r.id === repairId ? updated : r)));
      queueOrSyncRepairUpsert(updated);
      return updated;
    },
    [repairs, queueOrSyncRepairUpsert]
  );

  const markRepairDelivered = useCallback(
    (repairId: string): RepairRecord | null => {
      const target = repairs.find((r) => r.id === repairId);
      if (!target) return null;
      const updated = applyRepairDeliverySettlement(target, Date.now());
      setRepairs((prev) => prev.map((r) => (r.id === repairId ? updated : r)));
      queueOrSyncRepairUpsert(updated);
      return updated;
    },
    [repairs, queueOrSyncRepairUpsert]
  );

  const restoreRepairOrder = useCallback(
    (repairId: string): RepairRecord | null => {
      const target = repairs.find((r) => r.id === repairId);
      if (!target) return null;
      const updated: RepairRecord = {
        ...target,
        delivered: false,
      };
      setRepairs((prev) => prev.map((r) => (r.id === repairId ? updated : r)));
      queueOrSyncRepairUpsert(updated);
      return updated;
    },
    [repairs, queueOrSyncRepairUpsert]
  );

  const deleteRepair = useCallback(
    (repairId: string) => {
      const target = repairs.find((r) => r.id === repairId);
      setRepairs((prev) => prev.filter((r) => r.id !== repairId));

      if (user && user.emailVerified) {
        void commitRepairDeleteToFirestore(repairId, target?.tok).catch((err) => {
          setSyncError(err instanceof Error ? err.message : 'تعذر الحذف من السحابة');
        });
      } else {
        setPendingRepairOps((prev) => [
          ...prev.filter((op) => op.repairId !== repairId),
          {
            id: `del_rep_${repairId}_${Date.now()}`,
            type: 'delete',
            repairId,
            tok: target?.tok,
            queuedAt: Date.now(),
          },
        ]);
      }
    },
    [repairs, user, commitRepairDeleteToFirestore]
  );

  const importRepairs = useCallback(
    (rawArray: unknown[]): number => {
      const normalized = rawArray
        .map(normalizeRepairRecord)
        .filter((x): x is RepairRecord => x !== null);
      if (normalized.length === 0) return 0;

      setRepairs((prev) => {
        const map = new Map<string, RepairRecord>();
        for (const r of prev) map.set(r.id, r);
        for (const r of normalized) map.set(r.id, r);
        return Array.from(map.values()).sort(
          (a, b) => Date.parse(b.date) - Date.parse(a.date)
        );
      });

      for (const rec of normalized) {
        queueOrSyncRepairUpsert(rec);
      }
      return normalized.length;
    },
    [queueOrSyncRepairUpsert]
  );

  const loadSampleRepairs = useCallback(() => {
    return importRepairs(SAMPLE_REPAIRS);
  }, [importRepairs]);

  const queueOrSyncWebProductUpsert = useCallback(
    (product: WebProduct) => {
      if (user && user.emailVerified) {
        if (isOnline) {
          void commitWebProductUpsertToFirestore(product, user.uid).catch((err) => {
            setSyncError(err instanceof Error ? err.message : 'تعذر المزامنة');
          });
        } else {
          void commitWebProductUpsertToFirestore(product, user.uid).catch(() => {});
        }
        return;
      }

      setPendingWebProductOps((prev) => [
        ...prev.filter((op) => op.productId !== product.id),
        {
          id: `wp_op_${product.id}_${Date.now()}`,
          type: 'upsert',
          productId: product.id,
          product,
          queuedAt: Date.now(),
        },
      ]);
    },
    [user, isOnline, commitWebProductUpsertToFirestore]
  );

  const pushSingleProductToStorefront = useCallback(
    async (product: WebProduct): Promise<{ synced: boolean; note: string }> => {
      const targetUrl = sanitizeWebsiteUrl(settings.websiteUrl);
      let firebaseOk = false;
      let restOk = false;
      let notes: string[] = [];

      if (storefrontUser) {
        try {
          const sfRes = await upsertStorefrontCatalogItem(product);
          if (sfRes.ok) {
            firebaseOk = true;
            if (sfRes.imageTrimmed) {
              notes.push('تمت المزامنة مع الموقع (بدون الصورة المحلية الكبيرة)');
            }
          }
        } catch (err) {
          notes.push(formatStorefrontErrorMessage(err, storefrontUser.email, 'catalog'));
        }
      }

      if (targetUrl) {
        try {
          const isLens = product.category === 'lenses';
          const payload = isLens
            ? mapWebProductToStorefrontLens(product)
            : mapWebProductToStorefrontProduct(product);
          const slugId = isLens
            ? buildStorefrontSlug(product.id, 'lens')
            : buildStorefrontSlug(product.id, 'prod');
          const res = await authenticatedStorefrontFetch('/api/storefront/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              websiteUrl: targetUrl,
              path: isLens ? `/api/external/lenses/${slugId}` : `/api/external/products/${slugId}`,
              method: 'PUT',
              payload,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { ok?: boolean; upstreamStatus?: number; data?: { error?: string } };
            if (data.ok) restOk = true;
            else notes.push(data.data?.error || `رفض خادم الموقع المزامنة (HTTP ${data.upstreamStatus || res.status})`);
          } else {
            notes.push(`تعذر الوصول إلى خادم المزامنة (HTTP ${res.status})`);
          }
        } catch {
          notes.push('تعذر الاتصال بخادم مزامنة الموقع');
        }
      }

      if (firebaseOk || restOk) {
        const msg =
          notes[0] || `تمت مزامنة «${product.name}» تلقائياً مع الموقع`;
        setStorefrontSyncStatus((prev) => ({
          ...prev,
          state: notes.length > 0 ? 'partial' : 'ok',
          message: msg,
          lastSyncedAt: Date.now(),
        }));
        return { synced: true, note: msg };
      }

      if (!storefrontUser && !notes.length) {
        const msg = 'اربط حساب إدارة المتجر من أعلى الصفحة لدفع التحديثات مباشرة لموقع الويب';
        setStorefrontSyncStatus((prev) => ({
          ...prev,
          state: 'partial',
          message: msg,
        }));
        return { synced: false, note: msg };
      }

      const fallbackMsg = notes[0] || 'تعذر الوصول الفوري لموقع الويب';
      setStorefrontSyncStatus((prev) => ({
        ...prev,
        state: 'error',
        message: fallbackMsg,
      }));
      return { synced: false, note: fallbackMsg };
    },
    [settings.websiteUrl, storefrontUser]
  );

  const saveWebProduct = useCallback(
    (input: WebProductInput): { product: WebProduct; isNew: boolean } => {
      const existing = input.id ? webProducts.find((p) => p.id === input.id) : undefined;
      const isNew = !existing;
      const nowMs = Date.now();

      const product: WebProduct = existing
        ? {
            ...existing,
            name: input.name.trim().slice(0, 120),
            category: normalizeWebProductCategory(input.category),
            price: clampNumber(input.price),
            brand: (input.brand || '').trim().slice(0, 100),
            discountPrice: input.discountPrice && input.discountPrice > 0 ? clampNumber(input.discountPrice) : undefined,
            featured: Boolean(input.featured),
            newArrival: Boolean(input.newArrival),
            colors: sanitizeProductColors(input.colors),
            available: Boolean(input.available),
            notes: (input.notes || '').trim().slice(0, 240),
            photo: sanitizeFramePhoto(input.photo),
            updatedAtMs: nowMs,
          }
        : {
            id: generateWebProductId(),
            ownerId: user?.uid,
            name: input.name.trim().slice(0, 120),
            category: normalizeWebProductCategory(input.category),
            price: clampNumber(input.price),
            brand: (input.brand || '').trim().slice(0, 100),
            discountPrice: input.discountPrice && input.discountPrice > 0 ? clampNumber(input.discountPrice) : undefined,
            featured: Boolean(input.featured),
            newArrival: Boolean(input.newArrival),
            colors: sanitizeProductColors(input.colors),
            available: Boolean(input.available),
            notes: (input.notes || '').trim().slice(0, 240),
            photo: sanitizeFramePhoto(input.photo),
            createdAtMs: nowMs,
            updatedAtMs: nowMs,
          };

      setWebProducts((prev) => {
        if (existing) {
          return prev
            .map((p) => (p.id === product.id ? product : p))
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        }
        return [product, ...prev];
      });

      queueOrSyncWebProductUpsert(product);
      void pushSingleProductToStorefront(product);
      return { product, isNew };
    },
    [webProducts, user, queueOrSyncWebProductUpsert, pushSingleProductToStorefront]
  );

  const toggleWebProductAvailability = useCallback(
    (productId: string, nextAvailable?: boolean): WebProduct | null => {
      const target = webProducts.find((p) => p.id === productId);
      if (!target) return null;
      const next = typeof nextAvailable === 'boolean' ? nextAvailable : !target.available;
      const nowMs = Date.now();
      const updated: WebProduct = {
        ...target,
        available: next,
        updatedAtMs: nowMs,
      };

      setWebProducts((prev) =>
        prev
          .map((p) => (p.id === productId ? updated : p))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );

      if (user && user.emailVerified && knownServerWebProductIds.current.has(sanitizeId(productId, 'wp'))) {
        const id = sanitizeId(productId, 'wp');
        void updateDoc(doc(db, 'webProducts', id), {
          available: next,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          try {
            handleFirestoreError(err, OperationType.UPDATE, `webProducts/${id}`);
          } catch {
            // fallback error state
          }
          setSyncError(err instanceof Error ? err.message : 'تعذر تحديث حالة المنتج');
        });
      } else {
        queueOrSyncWebProductUpsert(updated);
      }

      void pushSingleProductToStorefront(updated);
      return updated;
    },
    [webProducts, user, queueOrSyncWebProductUpsert, pushSingleProductToStorefront]
  );

  const deleteWebProduct = useCallback(
    (productId: string) => {
      const target = webProducts.find((p) => p.id === productId);
      setWebProducts((prev) => prev.filter((p) => p.id !== productId));

      if (user && user.emailVerified) {
        void commitWebProductDeleteToFirestore(productId).catch((err) => {
          setSyncError(err instanceof Error ? err.message : 'تعذر الحذف من السحابة');
        });
      } else {
        setPendingWebProductOps((prev) => [
          ...prev.filter((op) => op.productId !== productId),
          {
            id: `del_wp_${productId}_${Date.now()}`,
            type: 'delete',
            productId,
            queuedAt: Date.now(),
          },
        ]);
      }

      if (target && storefrontUser) {
        void deleteStorefrontCatalogItem(target).catch(() => {});
      }

      if (target) {
        const targetUrl = sanitizeWebsiteUrl(settings.websiteUrl);
        const isLens = target.category === 'lenses';
        const externalKey = buildStorefrontSlug(target.id, isLens ? 'lens' : 'prod');
        if (targetUrl) {
          void authenticatedStorefrontFetch('/api/storefront/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              websiteUrl: targetUrl,
              path: `/api/external/${isLens ? 'lenses' : 'products'}/${externalKey}`,
              method: 'DELETE',
            }),
          }).catch(() => {});
        }
      }
    },
    [webProducts, user, storefrontUser, settings.websiteUrl, commitWebProductDeleteToFirestore]
  );

  const syncAllProductsToStorefront = useCallback(async (): Promise<{
    synced: number;
    total: number;
    message: string;
  }> => {
    if (!storefrontUser) {
      const msg = 'سجّل الدخول أولاً بحساب إدارة الموقع للمزامنة المباشرة مع المتجر';
      setStorefrontSyncStatus({ state: 'partial', message: msg });
      return { synced: 0, total: webProducts.length, message: msg };
    }
    setStorefrontSyncStatus((prev) => ({
      ...prev,
      state: 'syncing',
      message: 'جاري مزامنة جميع المنتجات والعدسات مع الموقع...',
    }));
    let synced = 0;
    let lastErrorNote = '';
    for (const product of webProducts) {
      const res = await pushSingleProductToStorefront(product);
      if (res.synced) {
        synced += 1;
      } else if (res.note) {
        lastErrorNote = res.note;
      }
    }

    if (webProducts.length > 0 && synced === 0 && lastErrorNote) {
      try {
        const publicCounts = await fetchPublicStorefrontCatalog();
        setStorefrontSyncStatus({
          state: 'error',
          message: lastErrorNote,
          publicProductsCount: publicCounts.publishedProductsCount,
          publicLensesCount: publicCounts.publishedLensesCount,
        });
      } catch {
        setStorefrontSyncStatus((prev) => ({
          ...prev,
          state: 'error',
          message: lastErrorNote,
        }));
      }
      return { synced: 0, total: webProducts.length, message: lastErrorNote };
    }

    try {
      const publicCounts = await fetchPublicStorefrontCatalog();
      const msg =
        synced === webProducts.length
          ? `تمت مزامنة ${synced} من ${webProducts.length} منتج مع الموقع بنجاح`
          : lastErrorNote || `تمت مزامنة ${synced} من ${webProducts.length} منتج مع الموقع`;
      setStorefrontSyncStatus({
        state: synced === webProducts.length ? 'ok' : 'partial',
        message: msg,
        publicProductsCount: publicCounts.publishedProductsCount,
        publicLensesCount: publicCounts.publishedLensesCount,
        lastSyncedAt: Date.now(),
      });
      return { synced, total: webProducts.length, message: msg };
    } catch {
      const msg =
        synced === webProducts.length
          ? `تمت مزامنة ${synced} من ${webProducts.length} منتج مع الموقع`
          : lastErrorNote || `تمت مزامنة ${synced} من ${webProducts.length} منتج مع الموقع`;
      setStorefrontSyncStatus({
        state: synced === webProducts.length ? 'ok' : 'partial',
        message: msg,
        lastSyncedAt: Date.now(),
      });
      return { synced, total: webProducts.length, message: msg };
    }
  }, [storefrontUser, webProducts, pushSingleProductToStorefront]);

  // WebOrders CRUD + Auto-ingestion from Storefront Firebase & Webhook server + Transfer to WhatsApp Follow-Up
  const queueOrSyncWebOrderUpsert = useCallback(
    (order: WebOrder) => {
      if (user && user.emailVerified) {
        if (isOnline) {
          void commitWebOrderUpsertToFirestore(order, user.uid).catch((err) => {
            setSyncError(err instanceof Error ? err.message : 'تعذر مزامنة طلبات الموقع');
          });
        } else {
          void commitWebOrderUpsertToFirestore(order, user.uid).catch(() => {});
        }
        return;
      }

      setPendingWebOrderOps((prev) => [
        ...prev.filter((op) => op.orderId !== order.id),
        {
          id: `wo_op_${order.id}_${Date.now()}`,
          type: 'upsert',
          orderId: order.id,
          orderCode: order.orderCode,
          order,
          queuedAt: Date.now(),
        },
      ]);
    },
    [user, isOnline, commitWebOrderUpsertToFirestore]
  );

  const upsertIncomingWebOrders = useCallback(
    (incoming: WebOrder[]): number => {
      if (!incoming.length) return 0;

      const normalizedIncoming = incoming
        .map((item) => normalizeWebOrder(item, item.source || 'webhook'))
        .filter((x): x is WebOrder => x !== null);
      if (normalizedIncoming.length === 0) return 0;

      const getOrderKey = (order: WebOrder) => normalizeWebOrderCode(order.orderCode) || order.id;
      const existingMap = new Map<string, WebOrder>(webOrders.map((o) => [getOrderKey(o), o]));
      const nextToPersist: WebOrder[] = [];

      for (const order of normalizedIncoming) {
        const orderCode = normalizeWebOrderCode(order.orderCode);
        if (orderCode && deletedWebOrderCodesRef.current.has(orderCode)) continue;
        const key = getOrderKey(order);
        const prev = existingMap.get(key);
        let merged: WebOrder = prev
          ? {
              ...order,
              id: prev.id,
              orderCode: prev.orderCode || order.orderCode,
              ownerId: prev.ownerId ?? user?.uid,
              convertedCustomerId: prev.convertedCustomerId || order.convertedCustomerId,
              // Preserve local status progression if locally modified more recently
              status:
                prev.updatedAtMs > order.updatedAtMs ? prev.status : order.status,
              updatedAtMs: Math.max(prev.updatedAtMs, order.updatedAtMs),
            }
          : {
              ...order,
              ownerId: user?.uid,
            };

        if (
          settings.autoTransferWebOrdersToWhatsApp !== false &&
          !merged.convertedCustomerId &&
          !autoConvertedOrderIds.current.has(orderCode || merged.id) &&
          merged.status !== 'cancelled'
        ) {
          autoConvertedOrderIds.current.add(orderCode || merged.id);
          const { record } = saveCustomer(mapWebOrderToCustomerInput(merged));
          if (orderCode) convertedCustomerByOrderCode.current.set(orderCode, record.id);
          merged = {
            ...merged,
            convertedCustomerId: record.id,
            updatedAtMs: Date.now(),
          };
        }
        if (orderCode && merged.convertedCustomerId) {
          convertedCustomerByOrderCode.current.set(orderCode, merged.convertedCustomerId);
        }

        const changed =
          !prev ||
          prev.status !== merged.status ||
          prev.total !== merged.total ||
          prev.convertedCustomerId !== merged.convertedCustomerId ||
          prev.items.length !== merged.items.length;

        if (changed) {
          nextToPersist.push(merged);
        }
        existingMap.set(key, merged);
      }

      setWebOrders(
        Array.from(existingMap.values()).sort((a, b) => b.createdAtMs - a.createdAtMs)
      );
      if (nextToPersist.length > 0) {
        for (const item of nextToPersist) {
          queueOrSyncWebOrderUpsert(item);
        }
      }

      return nextToPersist.length;
    },
    [
      webOrders,
      user?.uid,
      settings.autoTransferWebOrdersToWhatsApp,
      saveCustomer,
      queueOrSyncWebOrderUpsert,
    ]
  );

  const convertWebOrderToCustomer = useCallback(
    (orderId: string): { customer: CustomerRecord; isNew: boolean } | null => {
      const target = webOrders.find((o) => o.id === orderId);
      if (!target) return null;

      if (target.convertedCustomerId) {
        const existingCust = customers.find((c) => c.id === target.convertedCustomerId);
        if (existingCust) {
          const orderCode = normalizeWebOrderCode(target.orderCode);
          if (orderCode) convertedCustomerByOrderCode.current.set(orderCode, existingCust.id);
          return { customer: existingCust, isNew: false };
        }
      }

      const orderCode = normalizeWebOrderCode(target.orderCode);
      autoConvertedOrderIds.current.add(orderCode || target.id);
      const { record } = saveCustomer(mapWebOrderToCustomerInput(target));
      if (orderCode) convertedCustomerByOrderCode.current.set(orderCode, record.id);
      const updatedOrder: WebOrder = {
        ...target,
        convertedCustomerId: record.id,
        status: target.status === 'pending' ? 'confirmed' : target.status,
        updatedAtMs: Date.now(),
      };
      setWebOrders((prev) =>
        prev.map((o) => (o.id === target.id ? updatedOrder : o))
      );
      queueOrSyncWebOrderUpsert(updatedOrder);

      if (storefrontUser && target.status === 'pending') {
        void updateStorefrontOrderStatus(target.orderCode, 'confirmed').catch(() => {});
      }

      return { customer: record, isNew: true };
    },
    [webOrders, customers, saveCustomer, queueOrSyncWebOrderUpsert, storefrontUser]
  );

  const updateWebOrderStatus = useCallback(
    (orderId: string, nextStatus: WebOrderStatus): WebOrder | null => {
      const target = webOrders.find((o) => o.id === orderId);
      if (!target) return null;
      const updated: WebOrder = {
        ...target,
        status: nextStatus,
        updatedAtMs: Date.now(),
      };
      setWebOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      queueOrSyncWebOrderUpsert(updated);

      if (storefrontUser) {
        void updateStorefrontOrderStatus(target.orderCode, nextStatus).catch(() => {});
      }

      const targetUrl = sanitizeWebsiteUrl(settings.websiteUrl);
      if (targetUrl) {
        void authenticatedStorefrontFetch('/api/storefront/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            websiteUrl: targetUrl,
            path: `/api/external/orders/${encodeURIComponent(target.orderCode)}/status`,
            method: 'PATCH',
            payload: { status: nextStatus },
          }),
        }).catch(() => {});
      }

      return updated;
    },
    [webOrders, queueOrSyncWebOrderUpsert, storefrontUser, settings.websiteUrl]
  );

  const deleteWebOrder = useCallback(
    (orderId: string) => {
      const target = webOrders.find((order) => order.id === orderId);
      const orderCode = normalizeWebOrderCode(target?.orderCode);
      if (orderCode) rememberDeletedWebOrderCodes([orderCode]);
      setWebOrders((prev) => prev.filter((o) => o.id !== orderId));

      if (target?.convertedCustomerId) {
        deleteCustomer(target.convertedCustomerId);
      }

      if (user && user.emailVerified) {
        void commitWebOrderDeleteToFirestore(orderId, orderCode).catch((err) => {
          setSyncError(err instanceof Error ? err.message : 'تعذر حذف طلب الموقع');
        });
      } else {
        setPendingWebOrderOps((prev) => [
          ...prev.filter((op) =>
            op.orderId !== orderId &&
            (!orderCode || normalizeWebOrderCode(op.orderCode || op.order?.orderCode) !== orderCode)
          ),
          {
            id: `del_wo_${orderId}_${Date.now()}`,
            type: 'delete',
            orderId,
            orderCode: orderCode || undefined,
            queuedAt: Date.now(),
          },
        ]);
      }
        void authenticatedStorefrontFetch(`/api/storefront/webhook-orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
      }).catch(() => {});

      if (orderCode && storefrontUser) {
        void deleteStorefrontOrder(orderCode).catch((err) => {
          setStorefrontSyncStatus((prev) => ({
            ...prev,
            state: 'error',
            message: formatStorefrontErrorMessage(err, storefrontUser.email, 'orders'),
          }));
        });
      }

      const targetUrl = sanitizeWebsiteUrl(settings.websiteUrl);
      if (targetUrl && orderCode) {
        void authenticatedStorefrontFetch('/api/storefront/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            websiteUrl: targetUrl,
            path: `/api/external/orders/${encodeURIComponent(orderCode)}`,
            method: 'DELETE',
          }),
        }).catch(() => {});
      }
    },
    [
      webOrders,
      rememberDeletedWebOrderCodes,
      deleteCustomer,
      user,
      storefrontUser,
      settings.websiteUrl,
      commitWebOrderDeleteToFirestore,
    ]
  );

  const pullOrdersFromStorefrontNow = useCallback(async (): Promise<{
    importedCount: number;
    webhookCount: number;
    firebaseCount: number;
    apiReachable: boolean;
    note: string;
  }> => {
    let webhookCount = 0;
    let firebaseCount = 0;
    let apiReachable = false;
    const gathered: WebOrder[] = [];
    const targetUrl = sanitizeWebsiteUrl(settings.websiteUrl);

    if (storefrontUser) {
      try {
        const deletedCodes = await fetchStorefrontDeletedOrderCodes();
        rememberDeletedWebOrderCodes(deletedCodes);
      } catch {
        // Keep local tombstones active if the shared deletion ledger is temporarily unavailable.
      }
    }

    if (targetUrl) {
      try {
        const localDeletedCodes = Array.from(deletedWebOrderCodesRef.current);
        for (let start = 0; start < localDeletedCodes.length; start += 200) {
          await authenticatedStorefrontFetch('/api/storefront/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              websiteUrl: targetUrl,
              path: '/api/external/deleted-orders',
              method: 'POST',
              payload: { orderCodes: localDeletedCodes.slice(start, start + 200) },
            }),
          });
        }
        const deletedRes = await authenticatedStorefrontFetch('/api/storefront/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            websiteUrl: targetUrl,
            path: '/api/external/deleted-orders',
            method: 'GET',
          }),
        });
        if (deletedRes.ok) {
          const deletedPayload = (await deletedRes.json()) as {
            ok?: boolean;
            data?: { deletedOrderCodes?: unknown[] };
          };
          if (deletedPayload.ok && Array.isArray(deletedPayload.data?.deletedOrderCodes)) {
            rememberDeletedWebOrderCodes(
              deletedPayload.data.deletedOrderCodes.map(normalizeWebOrderCode).filter(Boolean)
            );
          }
        }
      } catch {
        // Local tombstones and Firestore tombstones remain active if the remote API is unavailable.
      }
    }

    // 1. Pull from local Express webhook ingestion queue
    try {
      const res = await authenticatedStorefrontFetch('/api/storefront/webhook-orders');
      if (res.ok) {
        const data = (await res.json()) as { orders?: unknown[] };
        if (Array.isArray(data.orders)) {
          for (const raw of data.orders) {
            const norm = normalizeWebOrder(raw, 'webhook');
            if (norm) {
              gathered.push(norm);
              webhookCount += 1;
            }
          }
        }
      }
    } catch {
      // ignore offline webhook poll
    }

    // 2. Pull from Storefront Firebase if admin connected
    if (storefrontUser) {
      try {
        const sfOrders = await fetchStorefrontOrdersOnce();
        firebaseCount = sfOrders.length;
        gathered.push(...sfOrders);
      } catch {
        // handled below via state
      }
    }

    // 3. Probe Storefront REST API /api/external/orders via server-side proxy
    if (targetUrl) {
      try {
        const proxyRes = await authenticatedStorefrontFetch('/api/storefront/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            websiteUrl: targetUrl,
            path: '/api/external/orders',
            method: 'GET',
          }),
        });
        if (proxyRes.ok) {
          const data = (await proxyRes.json()) as {
            ok?: boolean;
            upstreamStatus?: number;
            data?: { orders?: unknown[] } | unknown[];
          };
          if (data.ok) {
            apiReachable = true;
            const list = Array.isArray(data.data)
              ? data.data
              : data.data && typeof data.data === 'object' && Array.isArray(data.data.orders)
              ? data.data.orders
              : [];
            for (const raw of list) {
              const norm = normalizeWebOrder(raw, 'api');
              if (norm) gathered.push(norm);
            }
          }
        }
      } catch {
        // ignore network error
      }
    }

    const importedCount = upsertIncomingWebOrders(gathered);
    const note = storefrontUser
      ? `تمت المزامنة: ${firebaseCount} طلب من قاعدة الموقع و${webhookCount} عبر Webhook`
      : apiReachable
      ? `تمت المزامنة مع API الموقع (${gathered.length} طلب)`
      : `تم فحص الطلبات الواردة (${webhookCount} عبر Webhook) — اربط حساب إدارة المتجر لمزامنة Firebase المباشرة`;

    return { importedCount, webhookCount, firebaseCount, apiReachable, note };
  }, [storefrontUser, settings.websiteUrl, upsertIncomingWebOrders, rememberDeletedWebOrderCodes]);

  // Keep a ref to latest upsertIncomingWebOrders so polling & Storefront snapshot never churn
  const upsertIncomingWebOrdersRef = useRef(upsertIncomingWebOrders);
  useEffect(() => {
    upsertIncomingWebOrdersRef.current = upsertIncomingWebOrders;
  }, [upsertIncomingWebOrders]);

  // Live subscription to Storefront Firebase `orders` when Storefront Admin is signed in
  useEffect(() => {
    if (!storefrontUser) return;
    const unsubOrders = subscribeStorefrontOrders(
      (orders) => {
        upsertIncomingWebOrdersRef.current(orders);
      },
      (err) => {
        setStorefrontSyncStatus((prev) => ({
          ...prev,
          state: 'error',
          message: formatStorefrontErrorMessage(err, storefrontUser.email, 'orders'),
        }));
      }
    );
    const unsubDeletedCodes = subscribeStorefrontDeletedOrderCodes(
      (codes) => {
        const normalized = codes.map(normalizeWebOrderCode).filter(Boolean);
        rememberDeletedWebOrderCodes(normalized);
      },
      (err) => {
        setStorefrontSyncStatus((prev) => ({
          ...prev,
          state: 'error',
          message: formatStorefrontErrorMessage(err, storefrontUser.email, 'orders'),
        }));
      }
    );
    return () => {
      unsubOrders();
      unsubDeletedCodes();
    };
  }, [storefrontUser, rememberDeletedWebOrderCodes]);

  useEffect(() => {
    if (!storefrontUser) {
      syncedDeletedOrderUserRef.current = null;
      return;
    }
    if (syncedDeletedOrderUserRef.current === storefrontUser.uid || deletedWebOrderCodes.length === 0) return;
    syncedDeletedOrderUserRef.current = storefrontUser.uid;
    void saveStorefrontDeletedOrderCodes(deletedWebOrderCodes).catch((err) => {
      setStorefrontSyncStatus((prev) => ({
        ...prev,
        state: 'partial',
        message: formatStorefrontErrorMessage(err, storefrontUser.email, 'orders'),
      }));
    });
  }, [storefrontUser, deletedWebOrderCodes]);

  // Poll local webhook receiver every 15s (plus on mount) so orders posted from storefront appear automatically
  useEffect(() => {
    let active = true;
    const pollWebhook = async () => {
      const targetUrl = sanitizeWebsiteUrl(settings.websiteUrl);
      if (targetUrl) {
        try {
          const res = await authenticatedStorefrontFetch('/api/storefront/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              websiteUrl: targetUrl,
              path: '/api/external/deleted-orders',
              method: 'GET',
            }),
          });
          if (res.ok && active) {
            const result = (await res.json()) as {
              ok?: boolean;
              data?: { deletedOrderCodes?: unknown[] };
            };
            if (result.ok && Array.isArray(result.data?.deletedOrderCodes)) {
              const codes = result.data.deletedOrderCodes.map(normalizeWebOrderCode).filter(Boolean);
              rememberDeletedWebOrderCodes(codes);
            }
          }
        } catch {
          // The dashboard remains usable when the storefront API is offline.
        }
      }

      try {
        const res = await authenticatedStorefrontFetch('/api/storefront/webhook-orders');
        if (res.ok && active) {
          const data = (await res.json()) as { orders?: unknown[] };
          if (Array.isArray(data.orders) && data.orders.length > 0) {
            const normalized = data.orders
              .map((raw) => normalizeWebOrder(raw, 'webhook'))
              .filter((x): x is WebOrder => x !== null);
            if (normalized.length > 0) upsertIncomingWebOrdersRef.current(normalized);
          }
        }
      } catch {
        // ignore transient poll failures
      }
    };
    void pollWebhook();
    const timer = window.setInterval(() => void pollWebhook(), 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [settings.websiteUrl, rememberDeletedWebOrderCodes]);

  const signInStorefront = useCallback(async () => {
    const signedUser = await signInStorefrontAdmin();
    setStorefrontUser(signedUser);
    setStorefrontSyncStatus((prev) => ({
      ...prev,
      state: 'idle',
      message: '',
    }));
    return signedUser;
  }, []);

  const signOutStorefront = useCallback(async () => {
    await signOutStorefrontAdmin();
    setStorefrontUser(null);
    setStorefrontSyncStatus((prev) => ({
      ...prev,
      state: 'idle',
      message: '',
    }));
  }, []);

  const totalPendingCount =
    pendingOps.length +
    pendingPriceOps.length +
    pendingRepairOps.length +
    pendingWebProductOps.length +
    pendingWebOrderOps.length;

  const syncState: SyncState = useMemo(() => {
    if (syncError) return 'error';
    if (!isOnline) return 'offline';
    if (!user) return 'local-only';
    if (firestorePendingWrites || totalPendingCount > 0) {
      return 'syncing';
    }
    return 'synced';
  }, [syncError, isOnline, user, firestorePendingWrites, totalPendingCount]);

  return {
    user,
    authReady,
    isOnline,
    syncState,
    syncError,
    pendingCount: totalPendingCount,
    firestorePendingWrites,
    customers,
    priceItems,
    repairs,
    webProducts,
    webOrders,
    storefrontUser,
    storefrontSyncStatus,
    settings,
    saveCustomer,
    updateOrderStage,
    markCustomerDelivered,
    restoreCustomerOrder,
    deleteCustomer,
    importCustomers,
    loadSampleData,
    savePriceItem,
    deletePriceItem,
    loadStarterPriceItems,
    saveRepair,
    updateRepairStage,
    markRepairDelivered,
    restoreRepairOrder,
    deleteRepair,
    importRepairs,
    loadSampleRepairs,
    saveWebProduct,
    toggleWebProductAvailability,
    deleteWebProduct,
    syncAllProductsToStorefront,
    signInStorefront,
    signOutStorefront,
    upsertIncomingWebOrders,
    convertWebOrderToCustomer,
    updateWebOrderStatus,
    deleteWebOrder,
    pullOrdersFromStorefrontNow,
    updateSettings,
    flushPendingOps,
  };
}
