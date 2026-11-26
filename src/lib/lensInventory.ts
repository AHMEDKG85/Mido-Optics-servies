import { getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  Firestore,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { LensInventorySnapshot, LensSheet } from '../types/optics';
import { normalizeLensInventorySnapshot } from '../utils/optics';

export const LENS_INVENTORY_SITE_URL = 'https://lens-inventory.vercel.app/';

export const LENS_INVENTORY_FIREBASE_CONFIG = {
  projectId: 'mesmerizing-incentive-b4cnq',
  appId: '1:698432660237:web:4b71878521725a879a0644',
  apiKey: 'AIzaSyCQXvtUjRvmFsCUFAinLdw_b7LXl2DK8Ck',
  authDomain: 'mesmerizing-incentive-b4cnq.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-1dac0968-81ba-4327-aa56-c6971b36cef6',
  storageBucket: 'mesmerizing-incentive-b4cnq.firebasestorage.app',
  messagingSenderId: '698432660237',
};

const LENS_APP_NAME = 'lens-inventory-bridge';

const existingApp = getApps().find((a) => a.name === LENS_APP_NAME);
const lensApp = existingApp || initializeApp(LENS_INVENTORY_FIREBASE_CONFIG, LENS_APP_NAME);

let lensFirestore: Firestore;
try {
  lensFirestore = initializeFirestore(
    lensApp,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    LENS_INVENTORY_FIREBASE_CONFIG.firestoreDatabaseId
  );
} catch {
  lensFirestore = getFirestore(
    lensApp,
    LENS_INVENTORY_FIREBASE_CONFIG.firestoreDatabaseId
  );
}

export const lensAuth = getAuth(lensApp);
export const lensDb = lensFirestore;

export async function signInToLensInventory(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(lensAuth, provider);
  return result.user;
}

export async function signOutLensInventory(): Promise<void> {
  await signOut(lensAuth);
}

export function subscribeToLensInventoryCloud(
  uid: string,
  onSnapshotData: (snapshot: LensInventorySnapshot) => void,
  onError: (err: Error) => void
): () => void {
  let metaDoc: {
    sheetOrder?: string[];
    lowThresholds?: Record<string, number>;
  } = {};
  let sheetDocs: Record<string, LensSheet> = {};
  let hasSheets = false;

  const emitCombined = () => {
    if (!hasSheets) return;
    const normalized = normalizeLensInventorySnapshot(
      {
        sheets: sheetDocs,
        sheetOrder: metaDoc.sheetOrder,
        lowThresholds: metaDoc.lowThresholds,
        _t: Date.now(),
      },
      'cloud'
    );
    onSnapshotData(normalized);
  };

  const unsubMeta = onSnapshot(
    doc(lensDb, 'inventories', uid),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        metaDoc = {
          sheetOrder: Array.isArray(d.sheetOrder)
            ? d.sheetOrder.map((s) => String(s))
            : undefined,
          lowThresholds:
            d.lowThresholds && typeof d.lowThresholds === 'object'
              ? (d.lowThresholds as Record<string, number>)
              : undefined,
        };
      }
      emitCombined();
    },
    (err) => {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  );

  const unsubSheets = onSnapshot(
    collection(lensDb, 'inventories', uid, 'sheets'),
    (snap) => {
      hasSheets = true;
      const nextSheets: Record<string, LensSheet> = {};
      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        const rawQ =
          d.quantities && typeof d.quantities === 'object'
            ? (d.quantities as Record<string, unknown>)
            : {};
        const q: Record<string, number> = {};
        for (const [k, v] of Object.entries(rawQ)) {
          const num = Math.floor(Number(v) || 0);
          if (num > 0 && k.includes('|')) {
            q[k] = num;
          }
        }
        nextSheets[docSnap.id] = {
          id: docSnap.id,
          name: String(d.name || docSnap.id).slice(0, 60),
          rows: Array.isArray(d.rows) ? d.rows.map((r) => String(r)) : [],
          cols: Array.isArray(d.cols) ? d.cols.map((c) => String(c)) : [],
          q,
        };
      }
      sheetDocs = nextSheets;
      emitCombined();
    },
    (err) => {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  );

  return () => {
    unsubMeta();
    unsubSheets();
  };
}
