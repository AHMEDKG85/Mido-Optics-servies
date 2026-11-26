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
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  CustomerRecord,
  DEFAULT_WA_TEMPLATE,
  PendingPriceSyncOp,
  PendingRepairSyncOp,
  PendingSyncOp,
  PriceItem,
  PriceItemCategory,
  RepairRecord,
  ShopSettings,
  SyncState,
  UsageType,
} from '../types/optics';
import {
  advanceHist,
  applyCustomerDeliverySettlement,
  applyRepairDeliverySettlement,
  clampNumber,
  generateCustomerId,
  generatePriceItemId,
  generateRepairId,
  generateToken,
  normalizeCustomerRecord,
  normalizePriceCategory,
  normalizePriceItem,
  normalizeRepairRecord,
  normalizeUsageType,
  SAMPLE_CUSTOMERS,
  SAMPLE_REPAIRS,
  sanitizeAddPower,
  sanitizeEyeTuple,
  sanitizeFramePhoto,
  sanitizeId,
  sanitizePickupDate,
  sanitizeToken,
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
const STORAGE_SETTINGS_KEY = 'mido_settings_v1';

const DEFAULT_SETTINGS: ShopSettings = {
  shopName: 'Mido Optics',
  autoWhatsApp: true,
  waTemplate: DEFAULT_WA_TEMPLATE,
  publicBaseUrl: '',
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
    return {
      shopName: String(parsed.shopName || 'Mido Optics').slice(0, 80),
      autoWhatsApp: typeof parsed.autoWhatsApp === 'boolean' ? parsed.autoWhatsApp : true,
      waTemplate: String(parsed.waTemplate || DEFAULT_WA_TEMPLATE).slice(0, 600),
      publicBaseUrl: String(parsed.publicBaseUrl || '').trim().slice(0, 200),
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
  const [settings, setSettings] = useState<ShopSettings>(() => readLocalSettings());
  const [firestorePendingWrites, setFirestorePendingWrites] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const knownServerCustomerIds = useRef<Set<string>>(new Set());
  const knownServerPriceIds = useRef<Set<string>>(new Set());
  const knownServerRepairIds = useRef<Set<string>>(new Set());
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
    writeLocalSettings(settings);
  }, [settings]);

  // Watch Firebase auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsub;
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

  // Flush queued offline/pre-login ops when authenticated & online
  const flushPendingOps = useCallback(async () => {
    if (!user || !user.emailVerified || !isOnline || isFlushing.current) return;
    if (
      pendingOps.length === 0 &&
      pendingPriceOps.length === 0 &&
      pendingRepairOps.length === 0
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
    settings.shopName,
    commitUpsertToFirestore,
    commitDeleteToFirestore,
    commitPriceUpsertToFirestore,
    commitPriceDeleteToFirestore,
    commitRepairUpsertToFirestore,
    commitRepairDeleteToFirestore,
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
          setSettings({
            shopName: String(d.shopName || 'Mido Optics').slice(0, 80),
            autoWhatsApp: typeof d.autoWhatsApp === 'boolean' ? d.autoWhatsApp : true,
            waTemplate: String(d.waTemplate || DEFAULT_WA_TEMPLATE).slice(0, 600),
            publicBaseUrl: String(d.publicBaseUrl || '').trim().slice(0, 200),
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

    return () => {
      unsubCustomers();
      unsubSettings();
      unsubPrices();
      unsubRepairs();
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
      };
      setSettings(next);

      if (user && user.emailVerified) {
        const settingsRef = doc(db, 'settings', user.uid);
        try {
          const snap = await getDoc(settingsRef);
          if (snap.exists()) {
            await setDoc(
              settingsRef,
              {
                ownerId: user.uid,
                shopName: next.shopName,
                autoWhatsApp: next.autoWhatsApp,
                waTemplate: next.waTemplate,
                publicBaseUrl: next.publicBaseUrl,
                createdAt: snap.data().createdAt,
                updatedAt: serverTimestamp(),
              },
              { merge: false }
            );
          } else {
            await setDoc(settingsRef, {
              ownerId: user.uid,
              shopName: next.shopName,
              autoWhatsApp: next.autoWhatsApp,
              waTemplate: next.waTemplate,
              publicBaseUrl: next.publicBaseUrl,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
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

  const totalPendingCount =
    pendingOps.length + pendingPriceOps.length + pendingRepairOps.length;

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
    updateSettings,
    flushPendingOps,
  };
}
