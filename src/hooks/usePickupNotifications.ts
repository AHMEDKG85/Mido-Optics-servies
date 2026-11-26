import { useCallback, useEffect, useMemo, useState } from 'react';
import { CustomerRecord } from '../types/optics';
import { collectPickupReminders } from '../utils/optics';

const NOTIF_ENABLED_KEY = 'mido_pickup_notifications_enabled_v1';
const NOTIF_LAST_SIG_KEY = 'mido_pickup_notifications_last_sig_v1';

export type NotificationPermissionState =
  | 'default'
  | 'granted'
  | 'denied'
  | 'unsupported';

function getBrowserPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function readEnabledFlag(): boolean {
  try {
    const raw = localStorage.getItem(NOTIF_ENABLED_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

async function dispatchBrowserNotification(
  title: string,
  body: string,
  tag: string,
  onClickNavigate?: () => void
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    const notif = new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      dir: 'rtl',
      lang: 'ar',
      tag,
    });
    notif.onclick = () => {
      try {
        window.focus();
        onClickNavigate?.();
        notif.close();
      } catch {
        // ignore focus errors
      }
    };
    return true;
  } catch {
    // On Android Chrome PWAs, new Notification() throws and requires ServiceWorkerRegistration.showNotification
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          dir: 'rtl',
          lang: 'ar',
          tag,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function usePickupNotifications(params: {
  customers: CustomerRecord[];
  shopName: string;
  onNavigateToOrders: () => void;
}) {
  const { customers, shopName, onNavigateToOrders } = params;

  const [permission, setPermission] = useState<NotificationPermissionState>(
    getBrowserPermission
  );
  const [enabled, setEnabled] = useState<boolean>(readEnabledFlag);

  const summary = useMemo(
    () => collectPickupReminders(customers, new Date(), shopName),
    [customers, shopName]
  );

  // Sync permission state when window regains focus (user may change browser settings)
  useEffect(() => {
    const refreshPermission = () => setPermission(getBrowserPermission());
    window.addEventListener('focus', refreshPermission);
    return () => window.removeEventListener('focus', refreshPermission);
  }, []);

  // Automatically remind once per day/signature when permitted & enabled
  useEffect(() => {
    if (permission !== 'granted' || !enabled || summary.totalDueCount === 0) {
      return;
    }
    try {
      const lastSig = localStorage.getItem(NOTIF_LAST_SIG_KEY);
      if (lastSig === summary.signature) return;
      localStorage.setItem(NOTIF_LAST_SIG_KEY, summary.signature);
    } catch {
      // proceed even if localStorage fails
    }

    void dispatchBrowserNotification(
      summary.title,
      summary.body,
      `mido-pickup-${summary.signature}`,
      onNavigateToOrders
    );
  }, [permission, enabled, summary, onNavigateToOrders]);

  const enableAndNotify = useCallback(async (): Promise<{
    ok: boolean;
    reason: 'granted' | 'denied' | 'unsupported' | 'dismissed';
    sentDueAlert: boolean;
  }> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return { ok: false, reason: 'unsupported', sentDueAlert: false };
    }

    let nextPerm = Notification.permission;
    if (nextPerm === 'default') {
      nextPerm = await Notification.requestPermission();
    }
    setPermission(nextPerm);

    if (nextPerm !== 'granted') {
      return {
        ok: false,
        reason: nextPerm === 'denied' ? 'denied' : 'dismissed',
        sentDueAlert: false,
      };
    }

    setEnabled(true);
    try {
      localStorage.setItem(NOTIF_ENABLED_KEY, 'true');
      localStorage.setItem(NOTIF_LAST_SIG_KEY, summary.signature);
    } catch {
      // ignore
    }

    const sent = await dispatchBrowserNotification(
      summary.title,
      summary.totalDueCount > 0
        ? summary.body
        : 'تم تفعيل تنبيهات المتصفح بنجاح — سيتم تذكيرك عند حلول أو تأخر أي موعد استلام.',
      summary.totalDueCount > 0
        ? `mido-pickup-${summary.signature}`
        : `mido-pickup-ready-${Date.now()}`,
      onNavigateToOrders
    );

    return {
      ok: sent,
      reason: 'granted',
      sentDueAlert: summary.totalDueCount > 0,
    };
  }, [summary, onNavigateToOrders]);

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NOTIF_ENABLED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const sendReminderNow = useCallback(async (): Promise<boolean> => {
    if (permission !== 'granted') {
      const res = await enableAndNotify();
      return res.ok;
    }
    return dispatchBrowserNotification(
      summary.title,
      summary.body,
      `mido-pickup-manual-${Date.now()}`,
      onNavigateToOrders
    );
  }, [permission, enableAndNotify, summary, onNavigateToOrders]);

  return {
    permission,
    enabled,
    summary,
    enableAndNotify,
    toggleEnabled,
    sendReminderNow,
  };
}
