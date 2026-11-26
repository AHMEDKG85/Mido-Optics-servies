import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  LENS_INVENTORY_FIREBASE_CONFIG,
  lensAuth,
  signInToLensInventory,
  signOutLensInventory,
  subscribeToLensInventoryCloud,
} from '../lib/lensInventory';
import { LensInventorySnapshot } from '../types/optics';
import {
  AuthErrorSummary,
  formatFirebaseAuthError,
  normalizeLensInventorySnapshot,
  parseLensInventoryBackupJson,
  summarizeLensInventory,
} from '../utils/optics';

const LENS_STORAGE_KEY = 'mido_lens_inventory_v1';

function readCachedInventory(): LensInventorySnapshot | null {
  try {
    const raw = localStorage.getItem(LENS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeLensInventorySnapshot(
      parsed,
      parsed?.source === 'cloud' ? 'cloud' : 'json'
    );
  } catch {
    return null;
  }
}

function writeCachedInventory(snapshot: LensInventorySnapshot | null): void {
  try {
    if (!snapshot) {
      localStorage.removeItem(LENS_STORAGE_KEY);
      return;
    }
    localStorage.setItem(LENS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota errors
  }
}

export function useLensInventory() {
  const [lensUser, setLensUser] = useState<User | null>(null);
  const [inventory, setInventory] = useState<LensInventorySnapshot | null>(() =>
    readCachedInventory()
  );
  const [connecting, setConnecting] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorSummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(lensAuth, (user) => {
      setLensUser(user);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!lensUser || !lensUser.emailVerified) return;
    setSyncError(null);

    const unsub = subscribeToLensInventoryCloud(
      lensUser.uid,
      (snapshot) => {
        setInventory(snapshot);
        writeCachedInventory(snapshot);
        setSyncError(null);
      },
      (err) => {
        setSyncError(err.message || 'تعذر قراءة بيانات مخزن العدسات');
      }
    );

    return unsub;
  }, [lensUser]);

  const connectCloud = useCallback(async (): Promise<boolean> => {
    setConnecting(true);
    setAuthError(null);
    setSyncError(null);
    try {
      await signInToLensInventory();
      return true;
    } catch (err) {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const summary = formatFirebaseAuthError(err, hostname);
      setAuthError(summary);
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectCloud = useCallback(async () => {
    setAuthError(null);
    setSyncError(null);
    await signOutLensInventory();
  }, []);

  const importJsonText = useCallback((jsonText: string): LensInventorySnapshot => {
    const parsed = parseLensInventoryBackupJson(jsonText);
    setInventory(parsed);
    writeCachedInventory(parsed);
    setSyncError(null);
    return parsed;
  }, []);

  const clearInventory = useCallback(() => {
    setInventory(null);
    writeCachedInventory(null);
  }, []);

  const summary = summarizeLensInventory(inventory);

  return {
    lensUser,
    inventory,
    summary,
    connecting,
    authError,
    syncError,
    firebaseProjectId: LENS_INVENTORY_FIREBASE_CONFIG.projectId,
    connectCloud,
    disconnectCloud,
    importJsonText,
    clearInventory,
    dismissError: () => {
      setAuthError(null);
      setSyncError(null);
    },
  };
}
