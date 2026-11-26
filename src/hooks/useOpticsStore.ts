import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  CustomerRecord,
  DEFAULT_WA_TEMPLATE,
  PendingSyncOp,
  ShopSettings,
  SyncState,
} from '../types/optics';
import {
  advanceHist,
  clampNumber,
  generateCustomerId,
  generateToken,
  normalizeCustomerRecord,
  SAMPLE_CUSTOMERS,
  sanitizeEyeTuple,
  sanitizeId,
  sanitizePickupDate,
  sanitizeToken,
} from '../utils/optics';
import { useOnlineStatus } from './useOnlineStatus';

const STORAGE_CUSTOMERS_KEY = 'mido_customers_v2';
const LEGACY_CUSTOMERS_KEY = 'mido_customers';
const STORAGE_PENDING_KEY = 'mido_pending_ops_v1';
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

export interface CustomerInput {
  id?: string;
  name: string;
  phone: string;
  frame: string;
  lens: string;
  total: number;
  paid: number;
  photo: string;
  r: [string, string, string];
  l: [string, string, string];
  pickupDate: string;
}

export function useOpticsStore() {
  const isOnline = useOnlineStatus();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [customers, setCustomers] = useState<CustomerRecord[]>(() => readLocalCustomers());
  const [pendingOps, setPendingOps] = useState<PendingSyncOp[]>(() => readPendingOps());
  const [settings, setSettings] = useState<ShopSettings>(() => readLocalSettings());
  const [firestorePendingWrites, setFirestorePendingWrites] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const knownServerCustomerIds = useRef<Set<string>>(new Set());
  const isFlushing = useRef(false);

  // Persist local mirror whenever customers/pendingOps/settings change
  useEffect(() => {
    writeLocalCustomers(customers);
  }, [customers]);

  useEffect(() => {
    writePendingOps(pendingOps);
  }, [pendingOps]);

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

      const safeTotal = clampNumber(record.total);
      const safePaid = clampNumber(record.paid);
      const safePhoto =
        record.photo && record.photo.startsWith('data:image/') && record.photo.length <= 350_000
          ? record.photo
          : '';
      const safeR = sanitizeEyeTuple(record.r);
      const safeL = sanitizeEyeTuple(record.l);
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
          total: safeTotal,
          paid: safePaid,
          photo: safePhoto,
          r: safeR,
          l: safeL,
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
          total: safeTotal,
          paid: safePaid,
          photo: safePhoto,
          r: safeR,
          l: safeL,
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

  // Flush queued offline/pre-login ops when authenticated & online
  const flushPendingOps = useCallback(async () => {
    if (!user || !user.emailVerified || !isOnline || isFlushing.current) return;
    if (pendingOps.length === 0) return;

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
      setPendingOps((prev) => prev.filter((op) => !succeededIds.has(op.id)));
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
    settings.shopName,
    commitUpsertToFirestore,
    commitDeleteToFirestore,
  ]);

  useEffect(() => {
    void flushPendingOps();
  }, [flushPendingOps]);

  // Attach real-time Firestore listeners once authenticated
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      knownServerCustomerIds.current.clear();
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

    return () => {
      unsubCustomers();
      unsubSettings();
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
            total: clampNumber(input.total),
            paid: clampNumber(input.paid),
            photo: input.photo || '',
            r: sanitizeEyeTuple(input.r),
            l: sanitizeEyeTuple(input.l),
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
            total: clampNumber(input.total),
            paid: clampNumber(input.paid),
            photo: input.photo || '',
            r: sanitizeEyeTuple(input.r),
            l: sanitizeEyeTuple(input.l),
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
      const updated: CustomerRecord = {
        ...target,
        status: 4,
        hist: target.status >= 4 ? target.hist : advanceHist(target.hist, 4, Date.now()),
        delivered: true,
      };
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

  const syncState: SyncState = useMemo(() => {
    if (syncError) return 'error';
    if (!isOnline) return 'offline';
    if (!user) return 'local-only';
    if (firestorePendingWrites || pendingOps.length > 0) return 'syncing';
    return 'synced';
  }, [syncError, isOnline, user, firestorePendingWrites, pendingOps.length]);

  return {
    user,
    authReady,
    isOnline,
    syncState,
    syncError,
    pendingCount: pendingOps.length,
    firestorePendingWrites,
    customers,
    settings,
    saveCustomer,
    updateOrderStage,
    markCustomerDelivered,
    restoreCustomerOrder,
    deleteCustomer,
    importCustomers,
    loadSampleData,
    updateSettings,
    flushPendingOps,
  };
}
