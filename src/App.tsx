import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { SyncToolbar } from './components/SyncToolbar';
import { CustomersPage } from './components/CustomersPage';
import { LoyaltyPage } from './components/LoyaltyPage';
import {
  OrdersWhatsAppPage,
  WhatsAppDispatchItem,
} from './components/OrdersWhatsAppPage';
import { StatsDashboardPage } from './components/StatsDashboardPage';
import { CustomerFormModal } from './components/CustomerFormModal';
import { OrderDetailModal } from './components/OrderDetailModal';
import { InvoiceModal } from './components/InvoiceModal';
import { CustomerTrackView } from './components/CustomerTrackView';
import { CustomerInput, useOpticsStore } from './hooks/useOpticsStore';
import { useLensInventory } from './hooks/useLensInventory';
import { usePickupNotifications } from './hooks/usePickupNotifications';
import { signInWithGoogle, signOutUser } from './lib/firebase';
import { AppPage, CustomerRecord } from './types/optics';
import {
  AuthErrorSummary,
  buildTrackingUrl,
  buildWhatsAppUrl,
  formatFirebaseAuthError,
  renderWhatsAppMessage,
} from './utils/optics';

function parseHashRoute(hash: string): { page: AppPage; trackToken: string | null } {
  const clean = hash.replace(/^#/, '');
  if (clean.startsWith('track-')) {
    return { page: 'track', trackToken: clean.slice(6) };
  }
  if (
    clean === 'loyalty' ||
    clean === 'orders' ||
    clean === 'stats' ||
    clean === 'customers'
  ) {
    return { page: clean, trackToken: null };
  }
  return { page: 'customers', trackToken: null };
}

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('mido_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage errors
  }
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

function MidoOpticsApp() {
  const store = useOpticsStore();

  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [routeState, setRouteState] = useState(() =>
    parseHashRoute(typeof window !== 'undefined' ? window.location.hash : '')
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [orderModalCustomerId, setOrderModalCustomerId] = useState<string | null>(null);
  const [invoiceCustomerId, setInvoiceCustomerId] = useState<string | null>(null);
  const [pendingDispatch, setPendingDispatch] = useState<WhatsAppDispatchItem | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [authError, setAuthError] = useState<AuthErrorSummary | null>(null);
  const previousPageRef = useRef<Exclude<AppPage, 'track'>>('customers');

  const lensBridge = useLensInventory();

  // Apply theme class cleanly on <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('mido_theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  // Listen to hash routing
  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = parseHashRoute(window.location.hash);
      setRouteState((prev) => {
        if (prev.page !== 'track') {
          previousPageRef.current = prev.page;
        }
        return nextRoute;
      });
      setFormOpen(false);
      setOrderModalCustomerId(null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = window.setTimeout(() => setToastMsg(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMsg]);

  const navigate = useCallback((page: Exclude<AppPage, 'track'>) => {
    previousPageRef.current = page;
    window.location.hash = `#${page}`;
    setRouteState({ page, trackToken: null });
  }, []);

  const pickupNotifications = usePickupNotifications({
    customers: store.customers,
    shopName: store.settings.shopName,
    onNavigateToOrders: () => navigate('orders'),
  });

  const prepareWhatsAppDispatch = useCallback(
    (record: CustomerRecord) => {
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const trackingUrl = buildTrackingUrl(
        origin,
        pathname,
        record.tok,
        store.settings.publicBaseUrl
      );
      const message = renderWhatsAppMessage({
        template: store.settings.waTemplate,
        customer: record,
        trackingUrl,
        shopName: store.settings.shopName,
      });
      const waUrl = buildWhatsAppUrl({
        customer: record,
        trackingUrl,
        template: store.settings.waTemplate,
        shopName: store.settings.shopName,
      });
      setPendingDispatch({
        customer: record,
        trackingUrl,
        waUrl,
        message,
        triggeredAt: Date.now(),
      });
    },
    [store.settings.waTemplate, store.settings.shopName, store.settings.publicBaseUrl]
  );

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (customer: CustomerRecord) => {
    setEditingCustomer(customer);
    setFormOpen(true);
  };

  const handleSaveCustomer = (input: CustomerInput) => {
    const { record, isNew } = store.saveCustomer(input);
    setFormOpen(false);
    setEditingCustomer(null);

    if (isNew) {
      if (store.settings.autoWhatsApp) {
        prepareWhatsAppDispatch(record);
        navigate('orders');
        showToast('تم حفظ العميل وتجهيز رابط المتابعة للواتساب');
      } else {
        setOrderModalCustomerId(record.id);
        showToast('تم حفظ العميل بنجاح');
      }
    } else {
      showToast('تم حفظ التعديلات بنجاح');
    }
  };

  const handleAdvanceStage = (customerId: string, nextStage: number) => {
    const updated = store.updateOrderStage(customerId, nextStage);
    if (!updated) return;
    if (store.settings.autoWhatsApp) {
      prepareWhatsAppDispatch(updated);
      showToast('تم تحديث الحالة وتجهيز رسالة واتساب');
    } else {
      showToast('تم تحديث حالة النظارة');
    }
  };

  const handleMarkDelivered = (customerId: string) => {
    const updated = store.markCustomerDelivered(customerId);
    if (!updated) return;
    if (pendingDispatch?.customer.id === customerId) {
      setPendingDispatch(null);
    }
    showToast(`تم تسليم نظارة ${updated.name} وحذفها من صفحة الطلبات مع بقائها في صفحة العملاء`);
  };

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
      showToast('تم ربط الحساب بنجاح، جاري المزامنة...');
    } catch (err) {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const summary = formatFirebaseAuthError(err, hostname);
      setAuthError(summary);
      showToast(summary.title);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    await signOutUser();
    showToast('تم تسجيل الخروج');
  };

  // Public Customer Tracking Route (#track-<tok>)
  if (routeState.page === 'track' && routeState.trackToken) {
    return (
      <CustomerTrackView
        token={routeState.trackToken}
        localCustomers={store.customers}
        onBack={() => navigate(previousPageRef.current)}
      />
    );
  }

  const orderModalCustomer = orderModalCustomerId
    ? store.customers.find((c) => c.id === orderModalCustomerId) ?? null
    : null;
  const invoiceCustomer = invoiceCustomerId
    ? store.customers.find((c) => c.id === invoiceCustomerId) ?? null
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#f3f9fd] dark:bg-[#0d1722] text-[#1d2733] dark:text-[#eef3f8] pb-20 md:pb-8">
      <div className="app-shell-print-hide flex-1 flex flex-col">
        <Header
          activePage={routeState.page}
          onNavigate={navigate}
          onAddCustomer={handleOpenAdd}
          shopName={store.settings.shopName}
        />

        <SyncToolbar
          user={store.user}
          syncState={store.syncState}
          syncError={store.syncError}
          authError={authError}
          pendingCount={store.pendingCount}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onManualSync={store.flushPendingOps}
          onDismissAuthError={() => setAuthError(null)}
          onToast={showToast}
        />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {routeState.page === 'customers' && (
            <CustomersPage
              customers={store.customers}
              onAddCustomer={handleOpenAdd}
              onEditCustomer={handleOpenEdit}
              onDeleteCustomer={store.deleteCustomer}
              onOpenOrder={(c) => {
                if (store.settings.autoWhatsApp) {
                  prepareWhatsAppDispatch(c);
                  navigate('orders');
                } else {
                  setOrderModalCustomerId(c.id);
                }
              }}
              onOpenInvoice={(c) => setInvoiceCustomerId(c.id)}
              onImportCustomers={store.importCustomers}
              onLoadSampleData={store.loadSampleData}
              onToast={showToast}
            />
          )}

          {routeState.page === 'loyalty' && (
            <LoyaltyPage customers={store.customers} />
          )}

          {routeState.page === 'orders' && (
            <OrdersWhatsAppPage
              customers={store.customers}
              settings={store.settings}
              isCloudSignedIn={Boolean(store.user && store.user.emailVerified)}
              pendingDispatch={pendingDispatch}
              notificationPermission={pickupNotifications.permission}
              notificationsEnabled={pickupNotifications.enabled}
              dueTodayCount={pickupNotifications.summary.today.length}
              overdueCount={pickupNotifications.summary.overdue.length}
              lensBridge={lensBridge}
              onEnableNotifications={async () => {
                const res = await pickupNotifications.enableAndNotify();
                if (res.reason === 'denied') {
                  showToast('المتصفح حظر الإشعارات، اسمح بها من إعدادات الموقع');
                } else if (res.reason === 'granted') {
                  showToast('تم تفعيل تنبيهات مواعيد التسليم بنجاح');
                }
              }}
              onToggleNotifications={pickupNotifications.toggleEnabled}
              onSendReminderNow={async () => {
                const ok = await pickupNotifications.sendReminderNow();
                showToast(
                  ok
                    ? 'تم إرسال تنبيه مواعيد التسليم عبر المتصفح'
                    : 'تأكد من السماح بالإشعارات في المتصفح'
                );
              }}
              onClearDispatch={() => setPendingDispatch(null)}
              onUpdateSettings={store.updateSettings}
              onAdvanceStage={handleAdvanceStage}
              onMarkDelivered={handleMarkDelivered}
              onOpenOrderModal={(c) => setOrderModalCustomerId(c.id)}
              onOpenInvoice={(c) => setInvoiceCustomerId(c.id)}
              onToast={showToast}
            />
          )}

          {routeState.page === 'stats' && (
            <StatsDashboardPage customers={store.customers} />
          )}
        </main>

        <CustomerFormModal
          isOpen={formOpen}
          editingCustomer={editingCustomer}
          lensInventory={lensBridge.inventory}
          onClose={() => {
            setFormOpen(false);
            setEditingCustomer(null);
          }}
          onSave={handleSaveCustomer}
          onToast={showToast}
        />

        <OrderDetailModal
          customer={orderModalCustomer}
          settings={store.settings}
          lensInventory={lensBridge.inventory}
          onClose={() => setOrderModalCustomerId(null)}
          onSetStage={handleAdvanceStage}
          onMarkDelivered={handleMarkDelivered}
          onEditCustomer={(c) => {
            setOrderModalCustomerId(null);
            handleOpenEdit(c);
          }}
          onOpenInvoice={(c) => setInvoiceCustomerId(c.id)}
          onToast={showToast}
        />
      </div>

      <InvoiceModal
        customer={invoiceCustomer}
        settings={store.settings}
        onClose={() => setInvoiceCustomerId(null)}
        onToast={showToast}
      />

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="print:hidden fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs sm:text-sm font-semibold shadow-lg whitespace-nowrap"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MidoOpticsApp />
    </ErrorBoundary>
  );
}
