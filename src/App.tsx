import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, MessageCircle, MessageSquare, Printer, Share2 } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { SyncToolbar } from './components/SyncToolbar';
import { CustomersPage } from './components/CustomersPage';
import {
  OrdersWhatsAppPage,
  WhatsAppDispatchItem,
} from './components/OrdersWhatsAppPage';
import { RepairsPage } from './components/RepairsPage';
import {
  RepairOrdersWhatsAppPage,
  RepairWhatsAppDispatchItem,
} from './components/RepairOrdersWhatsAppPage';
import { ArchivePage } from './components/ArchivePage';
import { PriceListPage } from './components/PriceListPage';
import { StatsDashboardPage } from './components/StatsDashboardPage';
import { WebControlPanelPage } from './components/WebControlPanelPage';
import { WebOrdersPage } from './components/WebOrdersPage';
import { CustomerFormModal } from './components/CustomerFormModal';
import { RepairFormModal } from './components/RepairFormModal';
import { OrderDetailModal } from './components/OrderDetailModal';
import { InvoiceModal } from './components/InvoiceModal';
import { CustomerTrackView } from './components/CustomerTrackView';
import { CustomerInput, RepairInput, useOpticsStore } from './hooks/useOpticsStore';
import { useLensInventory } from './hooks/useLensInventory';
import { usePickupNotifications } from './hooks/usePickupNotifications';
import { signInWithGoogle, signOutUser } from './lib/firebase';
import { AppPage, CustomerRecord, NavPage, RepairRecord, WebOrder } from './types/optics';
import {
  AuthErrorSummary,
  buildRepairStageWhatsAppDispatch,
  buildRepairTrackingUrl,
  buildStageWhatsAppDispatch,
  buildTrackingUrl,
  formatFirebaseAuthError,
} from './utils/optics';
import {
  copyReceiptImageToClipboard,
  generateReceiptImageAsset,
  shareReceiptImageWithLink,
  ThermalRollWidth,
  triggerImageDownload,
} from './utils/receiptImage';

function parseHashRoute(hash: string): { page: AppPage; trackToken: string | null } {
  const clean = hash.replace(/^#/, '');
  if (clean.startsWith('track-')) {
    return { page: 'track', trackToken: clean.slice(6) };
  }
  if (clean.startsWith('rtrack-')) {
    return { page: 'rtrack', trackToken: clean.slice(7) };
  }
  if (
    clean === 'orders' ||
    clean === 'web-orders' ||
    clean === 'repairs' ||
    clean === 'repair-orders' ||
    clean === 'archive' ||
    clean === 'prices' ||
    clean === 'stats' ||
    clean === 'web-control' ||
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
  const [repairFormOpen, setRepairFormOpen] = useState(false);
  const [editingRepair, setEditingRepair] = useState<RepairRecord | null>(null);
  const [orderModalCustomerId, setOrderModalCustomerId] = useState<string | null>(null);
  const [invoiceCustomerId, setInvoiceCustomerId] = useState<string | null>(null);
  const [invoiceRepairId, setInvoiceRepairId] = useState<string | null>(null);
  const [pendingDispatch, setPendingDispatch] = useState<WhatsAppDispatchItem | null>(null);
  const [pendingRepairDispatch, setPendingRepairDispatch] =
    useState<RepairWhatsAppDispatchItem | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [authError, setAuthError] = useState<AuthErrorSummary | null>(null);
  const previousPageRef = useRef<NavPage>('customers');

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
        if (prev.page !== 'track' && prev.page !== 'rtrack') {
          previousPageRef.current = prev.page;
        }
        return nextRoute;
      });
      setFormOpen(false);
      setRepairFormOpen(false);
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

  const navigate = useCallback((page: NavPage) => {
    previousPageRef.current = page;
    window.location.hash = `#${page}`;
    setRouteState({ page, trackToken: null });
  }, []);

  const pickupNotifications = usePickupNotifications({
    customers: store.customers,
    shopName: store.settings.shopName,
    onNavigateToOrders: () => navigate('orders'),
  });

  const getPreferredRollWidth = (): ThermalRollWidth => {
    try {
      return localStorage.getItem('mido_thermal_width') === '58mm' ? '58mm' : '80mm';
    } catch {
      return '80mm';
    }
  };

  const prepareWhatsAppDispatch = useCallback(
    (
      record: CustomerRecord,
      options?: { readyPickup?: boolean; autoDownloadImage?: boolean; copyImage?: boolean }
    ) => {
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const trackingUrl = buildTrackingUrl(
        origin,
        pathname,
        record.tok,
        store.settings.publicBaseUrl
      );
      const dispatch = buildStageWhatsAppDispatch({
        customer: record,
        trackingUrl,
        template: store.settings.waTemplate,
        shopName: store.settings.shopName,
        forceReadyMessage: options?.readyPickup,
      });

      const triggeredAt = Date.now();
      setPendingDispatch({
        customer: record,
        trackingUrl,
        waUrl: dispatch.waUrl,
        smsUrl: dispatch.smsUrl,
        message: dispatch.message,
        isReadyNotification: dispatch.isReadyNotification,
        triggeredAt,
      });

      void generateReceiptImageAsset({
        customer: record,
        shopName: store.settings.shopName || 'Mido Optics',
        trackingUrl,
        rollWidth: getPreferredRollWidth(),
      })
        .then((asset) => {
          setPendingDispatch((prev) =>
            prev && prev.triggeredAt === triggeredAt
              ? {
                  ...prev,
                  receiptImageUrl: asset.dataUrl,
                  receiptImageFile: asset.file,
                  receiptImageBlob: asset.blob,
                  receiptFilename: asset.filename,
                }
              : prev
          );
          if (options?.autoDownloadImage) {
            triggerImageDownload(asset.file, asset.filename);
          }
          if (options?.copyImage || options?.autoDownloadImage) {
            void copyReceiptImageToClipboard(asset.blob);
          }
        })
        .catch(() => {
          // ignore silent background canvas fallback errors
        });

      return dispatch;
    },
    [store.settings.waTemplate, store.settings.shopName, store.settings.publicBaseUrl]
  );

  const prepareRepairWhatsAppDispatch = useCallback(
    (
      record: RepairRecord,
      options?: { readyPickup?: boolean; autoDownloadImage?: boolean; copyImage?: boolean }
    ) => {
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const trackingUrl = buildRepairTrackingUrl(
        origin,
        pathname,
        record.tok,
        store.settings.publicBaseUrl
      );
      const dispatch = buildRepairStageWhatsAppDispatch({
        repair: record,
        trackingUrl,
        shopName: store.settings.shopName,
        forceReadyMessage: options?.readyPickup,
      });

      const triggeredAt = Date.now();
      setPendingRepairDispatch({
        repair: record,
        trackingUrl,
        waUrl: dispatch.waUrl,
        smsUrl: dispatch.smsUrl,
        message: dispatch.message,
        isReadyNotification: dispatch.isReadyNotification,
        triggeredAt,
      });

      void generateReceiptImageAsset({
        repair: record,
        shopName: store.settings.shopName || 'Mido Optics',
        trackingUrl,
        rollWidth: getPreferredRollWidth(),
      })
        .then((asset) => {
          setPendingRepairDispatch((prev) =>
            prev && prev.triggeredAt === triggeredAt
              ? {
                  ...prev,
                  receiptImageUrl: asset.dataUrl,
                  receiptImageFile: asset.file,
                  receiptImageBlob: asset.blob,
                  receiptFilename: asset.filename,
                }
              : prev
          );
          if (options?.autoDownloadImage) {
            triggerImageDownload(asset.file, asset.filename);
          }
          if (options?.copyImage || options?.autoDownloadImage) {
            void copyReceiptImageToClipboard(asset.blob);
          }
        })
        .catch(() => {
          // ignore silent background canvas fallback errors
        });

      return dispatch;
    },
    [store.settings.shopName, store.settings.publicBaseUrl]
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
        prepareWhatsAppDispatch(record, { autoDownloadImage: true, copyImage: true });
        navigate('orders');
        showToast('تم حفظ العميل وتنزيل صورة الوصل وتجهيزها للإرسال مع رابط المتابعة');
      } else {
        const trackingUrl = buildTrackingUrl(
          window.location.origin,
          window.location.pathname,
          record.tok,
          store.settings.publicBaseUrl
        );
        void generateReceiptImageAsset({
          customer: record,
          shopName: store.settings.shopName || 'Mido Optics',
          trackingUrl,
          rollWidth: getPreferredRollWidth(),
        })
          .then((asset) => {
            triggerImageDownload(asset.file, asset.filename);
            void copyReceiptImageToClipboard(asset.blob);
          })
          .catch(() => {});
        setOrderModalCustomerId(record.id);
        showToast('تم حفظ العميل وتنزيل صورة الفاتورة (PNG) على جهازك');
      }
    } else {
      showToast('تم حفظ التعديلات بنجاح');
    }
  };

  const handleAdvanceStage = (customerId: string, nextStage: number) => {
    const previous = store.customers.find((c) => c.id === customerId);
    const updated = store.updateOrderStage(customerId, nextStage);
    if (!updated) return;
    const isMovingBack = previous ? updated.status < previous.status : false;

    if (updated.status === 4) {
      const dispatch = prepareWhatsAppDispatch(updated, {
        readyPickup: true,
        copyImage: true,
      });
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(dispatch.message).catch(() => {});
      }
      showToast('النظارة جاهزة للاستلام — تم تجهيز إشعار واتساب التلقائي للعميل');
      return;
    }

    if (store.settings.autoWhatsApp) {
      prepareWhatsAppDispatch(updated, { copyImage: true });
      showToast(
        isMovingBack
          ? 'تم الرجوع للمرحلة السابقة وتحديث رسالة المتابعة'
          : 'تم تحديث الحالة وتجهيز رسالة واتساب'
      );
    } else {
      showToast(isMovingBack ? 'تم الرجوع للمرحلة السابقة' : 'تم تحديث حالة النظارة');
    }
  };

  const handleMarkDelivered = (customerId: string) => {
    const updated = store.markCustomerDelivered(customerId);
    if (!updated) return;
    if (pendingDispatch?.customer.id === customerId) {
      setPendingDispatch(null);
    }
    showToast(
      `تم استلام نظارة ${updated.name} وتحصيل المتبقي (خالص) ونقل الطلب إلى الأرشيف والإحصائيات`
    );
  };

  const handleRestoreOrder = (customerId: string) => {
    const updated = store.restoreCustomerOrder(customerId);
    if (!updated) return;
    showToast(`تم استرجاع طلب ${updated.name} إلى الطلبات النشطة`);
  };

  // Repair Handlers
  const handleOpenAddRepair = () => {
    setEditingRepair(null);
    setRepairFormOpen(true);
  };

  const handleOpenEditRepair = (repair: RepairRecord) => {
    setEditingRepair(repair);
    setRepairFormOpen(true);
  };

  const handleSaveRepair = (input: RepairInput) => {
    const { record, isNew } = store.saveRepair(input);
    setRepairFormOpen(false);
    setEditingRepair(null);

    if (isNew) {
      if (store.settings.autoWhatsApp) {
        prepareRepairWhatsAppDispatch(record, { autoDownloadImage: true, copyImage: true });
        navigate('repair-orders');
        showToast('تم تسجيل التصليح وتنزيل صورة الوصل وتجهيزها للإرسال مع رابط المتابعة');
      } else {
        const trackingUrl = buildRepairTrackingUrl(
          window.location.origin,
          window.location.pathname,
          record.tok,
          store.settings.publicBaseUrl
        );
        void generateReceiptImageAsset({
          repair: record,
          shopName: store.settings.shopName || 'Mido Optics',
          trackingUrl,
          rollWidth: getPreferredRollWidth(),
        })
          .then((asset) => {
            triggerImageDownload(asset.file, asset.filename);
            void copyReceiptImageToClipboard(asset.blob);
          })
          .catch(() => {});
        showToast('تم تسجيل التصليح وتنزيل صورة الوصل (PNG) على جهازك');
      }
    } else {
      showToast('تم تحديث بيانات التصليح بنجاح');
    }
  };

  const handleAdvanceRepairStage = (repairId: string, nextStage: number) => {
    const previous = store.repairs.find((r) => r.id === repairId);
    const updated = store.updateRepairStage(repairId, nextStage);
    if (!updated) return;
    const isMovingBack = previous ? updated.status < previous.status : false;

    if (updated.status === 4) {
      const dispatch = prepareRepairWhatsAppDispatch(updated, {
        readyPickup: true,
        copyImage: true,
      });
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(dispatch.message).catch(() => {});
      }
      showToast('التصليح جاهز للاستلام — تم تجهيز إشعار واتساب التلقائي للعميل');
      return;
    }

    if (store.settings.autoWhatsApp) {
      prepareRepairWhatsAppDispatch(updated, { copyImage: true });
      showToast(
        isMovingBack
          ? 'تم الرجوع للمرحلة السابقة وتحديث رسالة متابعة التصليح'
          : 'تم تحديث مرحلة التصليح وتجهيز رسالة واتساب'
      );
    } else {
      showToast(isMovingBack ? 'تم الرجوع للمرحلة السابقة' : 'تم تحديث حالة التصليح');
    }
  };

  const handleMarkRepairDelivered = (repairId: string) => {
    const updated = store.markRepairDelivered(repairId);
    if (!updated) return;
    if (pendingRepairDispatch?.repair.id === repairId) {
      setPendingRepairDispatch(null);
    }
    showToast(`تم تسليم تصليح ${updated.name} وتسوية الحساب إلى خالص في الإحصائيات`);
  };

  const handleRestoreRepair = (repairId: string) => {
    const updated = store.restoreRepairOrder(repairId);
    if (!updated) return;
    showToast(`تم استرجاع تصليح ${updated.name} إلى المتابعة النشطة`);
  };

  const handleOpenRepairFollowUp = (repair: RepairRecord) => {
    prepareRepairWhatsAppDispatch(repair);
    navigate('repair-orders');
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

  const handleSignInStorefront = async () => {
    setAuthError(null);
    try {
      await store.signInStorefront();
      showToast('تم ربط حساب إدارة المتجر بنجاح، جاري مزامنة الموقع');
    } catch (err) {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const summary = formatFirebaseAuthError(err, hostname);
      setAuthError(summary);
      showToast(summary.title);
    }
  };

  const handleSignOutStorefront = async () => {
    await store.signOutStorefront();
    showToast('تم فصل حساب إدارة المتجر');
  };

  const handleTransferWebOrderToWhatsApp = (order: WebOrder) => {
    const res = store.convertWebOrderToCustomer(order.id);
    if (!res) return;
    prepareWhatsAppDispatch(res.customer, { copyImage: true });
    navigate('orders');
    showToast(
      res.isNew
        ? `تم تحويل طلب #${order.orderCode} إلى متابعة وواتساب وتجهيز الوصل`
        : `تم فتح متابعة واتساب لطلب ${res.customer.name}`
    );
  };

  // Public Customer or Repair Tracking Route (#track-<tok> / #rtrack-<tok>)
  if (
    (routeState.page === 'track' || routeState.page === 'rtrack') &&
    routeState.trackToken
  ) {
    return (
      <CustomerTrackView
        token={routeState.trackToken}
        mode={routeState.page === 'rtrack' ? 'repair' : 'customer'}
        localCustomers={store.customers}
        localRepairs={store.repairs}
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
  const invoiceRepair = invoiceRepairId
    ? store.repairs.find((r) => r.id === invoiceRepairId) ?? null
    : null;

  const pendingWebOrdersCount = store.webOrders.filter((o) => o.status === 'pending').length;

  return (
    <div className="app-print-root min-h-screen flex flex-col bg-[#f3f9fd] dark:bg-[#0d1722] text-[#1d2733] dark:text-[#eef3f8] pb-20 md:pb-8">
      <div className="app-shell-print-hide flex-1 flex flex-col">
        <Header
          activePage={routeState.page}
          onNavigate={navigate}
          onAddCustomer={handleOpenAdd}
          shopName={store.settings.shopName}
          pendingWebOrdersCount={pendingWebOrdersCount}
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
          {pendingDispatch?.isReadyNotification &&
            routeState.page !== 'orders' &&
            !orderModalCustomer && (
              <div
                role="region"
                aria-label="إشعار واتساب جاهز للعميل"
                className="mb-4 rounded-2xl border border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/45 p-4 space-y-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 flex-wrap">
                      <span>
                        النظارة جاهزة للاستلام — إشعار واتساب للعميل: {pendingDispatch.customer.name}
                      </span>
                      {pendingDispatch.customer.phone && (
                        <span
                          dir="ltr"
                          className="font-mono-num text-xs bg-white/80 dark:bg-slate-900/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800"
                        >
                          {pendingDispatch.customer.phone}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-200 mt-1 whitespace-pre-line leading-relaxed">
                      {pendingDispatch.message}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingDispatch(null)}
                    aria-label="إغلاق إشعار العميل"
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
                  >
                    إغلاق ✕
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {pendingDispatch.receiptImageFile && pendingDispatch.receiptImageBlob && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!pendingDispatch.receiptImageFile || !pendingDispatch.receiptImageBlob) return;
                        void shareReceiptImageWithLink({
                          file: pendingDispatch.receiptImageFile,
                          blob: pendingDispatch.receiptImageBlob,
                          filename: pendingDispatch.receiptFilename || 'receipt.png',
                          title: `وصل ${pendingDispatch.customer.name}`,
                          message: pendingDispatch.message,
                        }).then((res) => {
                          if (res === 'shared-file') {
                            showToast('تم إرسال صورة الوصل مع رابط المتابعة');
                          } else if (res === 'copied-and-downloaded') {
                            showToast('تم تنزيل ونسخ صورة الوصل — الصقها في واتساب مع الرابط');
                          }
                        });
                      }}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>إرسال الصورة + الرابط</span>
                    </button>
                  )}
                  <a
                    href={pendingDispatch.waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (!pendingDispatch.receiptImageBlob) return;
                      void copyReceiptImageToClipboard(pendingDispatch.receiptImageBlob).then((ok) => {
                        if (ok) showToast('تم نسخ صورة الوصل — الصقها في واتساب مع الرابط');
                      });
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>إرسال إشعار واتساب للعميل</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceRepairId(null);
                      setInvoiceCustomerId(pendingDispatch.customer.id);
                    }}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-[#c9a24b]" />
                    <span>طباعة كاشير</span>
                  </button>
                  {pendingDispatch.smsUrl && (
                    <a
                      href={pendingDispatch.smsUrl}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>إرسال SMS</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(pendingDispatch.message).catch(() => {});
                      showToast('تم نسخ رسالة الجاهزية');
                    }}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>نسخ الرسالة</span>
                  </button>
                </div>
              </div>
            )}

          {pendingRepairDispatch?.isReadyNotification &&
            routeState.page !== 'repair-orders' && (
              <div
                role="region"
                aria-label="إشعار واتساب جاهز لتصليح العميل"
                className="mb-4 rounded-2xl border border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/45 p-4 space-y-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 flex-wrap">
                      <span>
                        التصليح جاهز للاستلام — إشعار واتساب للعميل:{' '}
                        {pendingRepairDispatch.repair.name}
                      </span>
                      {pendingRepairDispatch.repair.phone && (
                        <span
                          dir="ltr"
                          className="font-mono-num text-xs bg-white/80 dark:bg-slate-900/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800"
                        >
                          {pendingRepairDispatch.repair.phone}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-200 mt-1 whitespace-pre-line leading-relaxed">
                      {pendingRepairDispatch.message}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingRepairDispatch(null)}
                    aria-label="إغلاق إشعار التصليح"
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
                  >
                    إغلاق ✕
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {pendingRepairDispatch.receiptImageFile && pendingRepairDispatch.receiptImageBlob && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !pendingRepairDispatch.receiptImageFile ||
                          !pendingRepairDispatch.receiptImageBlob
                        )
                          return;
                        void shareReceiptImageWithLink({
                          file: pendingRepairDispatch.receiptImageFile,
                          blob: pendingRepairDispatch.receiptImageBlob,
                          filename:
                            pendingRepairDispatch.receiptFilename || 'repair-receipt.png',
                          title: `إيصال تصليح ${pendingRepairDispatch.repair.name}`,
                          message: pendingRepairDispatch.message,
                        }).then((res) => {
                          if (res === 'shared-file') {
                            showToast('تم إرسال صورة الوصل مع رابط المتابعة');
                          } else if (res === 'copied-and-downloaded') {
                            showToast('تم تنزيل ونسخ صورة الوصل — الصقها في واتساب مع الرابط');
                          }
                        });
                      }}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>إرسال الصورة + الرابط</span>
                    </button>
                  )}
                  <a
                    href={pendingRepairDispatch.waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (!pendingRepairDispatch.receiptImageBlob) return;
                      void copyReceiptImageToClipboard(
                        pendingRepairDispatch.receiptImageBlob
                      ).then((ok) => {
                        if (ok) showToast('تم نسخ صورة الوصل — الصقها في واتساب مع الرابط');
                      });
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>إرسال إشعار واتساب للعميل</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceCustomerId(null);
                      setInvoiceRepairId(pendingRepairDispatch.repair.id);
                    }}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-[#c9a24b]" />
                    <span>طباعة كاشير</span>
                  </button>
                  {pendingRepairDispatch.smsUrl && (
                    <a
                      href={pendingRepairDispatch.smsUrl}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>إرسال SMS</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(pendingRepairDispatch.message)
                        .catch(() => {});
                      showToast('تم نسخ رسالة جاهزية التصليح');
                    }}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>نسخ الرسالة</span>
                  </button>
                </div>
              </div>
            )}

          {routeState.page === 'customers' && (
            <CustomersPage
              customers={store.customers}
              onAddCustomer={handleOpenAdd}
              onEditCustomer={handleOpenEdit}
              onDeleteCustomer={store.deleteCustomer}
              onChangeStage={handleAdvanceStage}
              onOpenOrder={(c) => {
                if (store.settings.autoWhatsApp) {
                  prepareWhatsAppDispatch(c);
                  navigate('orders');
                } else {
                  setOrderModalCustomerId(c.id);
                }
              }}
              onOpenInvoice={(c) => {
                setInvoiceRepairId(null);
                setInvoiceCustomerId(c.id);
              }}
              onImportCustomers={store.importCustomers}
              onLoadSampleData={store.loadSampleData}
              onToast={showToast}
            />
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
              onOpenInvoice={(c) => {
                setInvoiceRepairId(null);
                setInvoiceCustomerId(c.id);
              }}
              onToast={showToast}
            />
          )}

          {routeState.page === 'repairs' && (
            <RepairsPage
              repairs={store.repairs}
              onAddRepair={handleOpenAddRepair}
              onEditRepair={handleOpenEditRepair}
              onDeleteRepair={store.deleteRepair}
              onChangeStage={handleAdvanceRepairStage}
              onOpenRepairFollowUp={handleOpenRepairFollowUp}
              onOpenInvoice={(r) => {
                setInvoiceCustomerId(null);
                setInvoiceRepairId(r.id);
              }}
              onImportRepairs={store.importRepairs}
              onLoadSampleRepairs={store.loadSampleRepairs}
              onToast={showToast}
            />
          )}

          {routeState.page === 'repair-orders' && (
            <RepairOrdersWhatsAppPage
              repairs={store.repairs}
              settings={store.settings}
              isCloudSignedIn={Boolean(store.user && store.user.emailVerified)}
              pendingDispatch={pendingRepairDispatch}
              onClearDispatch={() => setPendingRepairDispatch(null)}
              onUpdateSettings={store.updateSettings}
              onAdvanceStage={handleAdvanceRepairStage}
              onMarkDelivered={handleMarkRepairDelivered}
              onRestoreRepair={handleRestoreRepair}
              onOpenInvoice={(r) => {
                setInvoiceCustomerId(null);
                setInvoiceRepairId(r.id);
              }}
              onToast={showToast}
            />
          )}

          {routeState.page === 'archive' && (
            <ArchivePage
              customers={store.customers}
              onRestoreOrder={handleRestoreOrder}
              onOpenOrderModal={(c) => setOrderModalCustomerId(c.id)}
              onOpenInvoice={(c) => {
                setInvoiceRepairId(null);
                setInvoiceCustomerId(c.id);
              }}
            />
          )}

          {routeState.page === 'prices' && (
            <PriceListPage
              items={store.priceItems}
              onSaveItem={store.savePriceItem}
              onDeleteItem={store.deletePriceItem}
              onLoadStarterPrices={store.loadStarterPriceItems}
              onToast={showToast}
            />
          )}

          {routeState.page === 'stats' && (
            <StatsDashboardPage customers={store.customers} repairs={store.repairs} />
          )}

          {routeState.page === 'web-orders' && (
            <WebOrdersPage
              orders={store.webOrders}
              customers={store.customers}
              settings={store.settings}
              storefrontUser={store.storefrontUser}
              storefrontSyncStatus={store.storefrontSyncStatus}
              onSignInStorefront={handleSignInStorefront}
              onSignOutStorefront={handleSignOutStorefront}
              onPullNow={store.pullOrdersFromStorefrontNow}
              onUpdateStatus={store.updateWebOrderStatus}
              onTransferToWhatsApp={handleTransferWebOrderToWhatsApp}
              onDeleteOrder={store.deleteWebOrder}
              onUpdateSettings={store.updateSettings}
              onToast={showToast}
            />
          )}

          {routeState.page === 'web-control' && (
            <WebControlPanelPage
              products={store.webProducts}
              settings={store.settings}
              storefrontUser={store.storefrontUser}
              storefrontSyncStatus={store.storefrontSyncStatus}
              onSignInStorefront={handleSignInStorefront}
              onSignOutStorefront={handleSignOutStorefront}
              onSyncAllToStorefront={store.syncAllProductsToStorefront}
              onSaveProduct={store.saveWebProduct}
              onToggleAvailability={store.toggleWebProductAvailability}
              onDeleteProduct={store.deleteWebProduct}
              onUpdateSettings={store.updateSettings}
              onToast={showToast}
            />
          )}
        </main>

        <CustomerFormModal
          isOpen={formOpen}
          editingCustomer={editingCustomer}
          lensInventory={lensBridge.inventory}
          priceItems={store.priceItems}
          onOpenPriceList={() => {
            setFormOpen(false);
            setEditingCustomer(null);
            navigate('prices');
          }}
          onClose={() => {
            setFormOpen(false);
            setEditingCustomer(null);
          }}
          onSave={handleSaveCustomer}
          onToast={showToast}
        />

        <RepairFormModal
          isOpen={repairFormOpen}
          editingRepair={editingRepair}
          onClose={() => {
            setRepairFormOpen(false);
            setEditingRepair(null);
          }}
          onSave={handleSaveRepair}
          onToast={showToast}
        />

        <OrderDetailModal
          customer={orderModalCustomer}
          settings={store.settings}
          lensInventory={lensBridge.inventory}
          onClose={() => setOrderModalCustomerId(null)}
          onSetStage={handleAdvanceStage}
          onMarkDelivered={handleMarkDelivered}
          onRestoreOrder={handleRestoreOrder}
          onEditCustomer={(c) => {
            setOrderModalCustomerId(null);
            handleOpenEdit(c);
          }}
          onOpenInvoice={(c) => {
            setInvoiceRepairId(null);
            setInvoiceCustomerId(c.id);
          }}
          onToast={showToast}
        />
      </div>

      <InvoiceModal
        customer={invoiceCustomer}
        repair={invoiceRepair}
        settings={store.settings}
        onClose={() => {
          setInvoiceCustomerId(null);
          setInvoiceRepairId(null);
        }}
        onToast={showToast}
      />

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="print:hidden fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs sm:text-sm font-semibold shadow-lg text-center leading-snug"
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
