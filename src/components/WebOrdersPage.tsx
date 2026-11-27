import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  Globe,
  Link2,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import {
  CustomerRecord,
  ShopSettings,
  WEB_ORDER_STATUS_LABELS,
  WebOrder,
  WebOrderSource,
  WebOrderStatus,
} from '../types/optics';
import {
  DEFAULT_STOREFRONT_WEBSITE_URL,
  filterWebOrders,
  formatArabicDateTime,
  sanitizeWebsiteUrl,
  WEB_ORDER_STATUSES,
} from '../utils/optics';

interface WebOrdersPageProps {
  orders: WebOrder[];
  customers: CustomerRecord[];
  settings: ShopSettings;
  storefrontUser: User | null;
  storefrontSyncStatus?: {
    state: 'idle' | 'syncing' | 'ok' | 'partial' | 'error';
    message: string;
  };
  onSignInStorefront: () => Promise<void> | void;
  onSignOutStorefront: () => Promise<void> | void;
  onPullNow: () => Promise<{
    importedCount: number;
    webhookCount: number;
    firebaseCount: number;
    apiReachable: boolean;
    note: string;
  }>;
  onUpdateStatus: (orderId: string, status: WebOrderStatus) => void;
  onTransferToWhatsApp: (order: WebOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onUpdateSettings: (patch: Partial<ShopSettings>) => Promise<void> | void;
  onToast: (msg: string) => void;
}

const SOURCE_LABELS: Record<WebOrderSource, string> = {
  storefront_firebase: 'الموقع مباشر',
  webhook: 'Webhook',
  api: 'API الموقع',
  manual: 'يدوي',
};

const STATUS_BADGE_CLASSES: Record<WebOrderStatus, string> = {
  pending:
    'bg-amber-50 dark:bg-amber-950/45 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300',
  confirmed:
    'bg-sky-50 dark:bg-sky-950/45 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-300',
  preparing:
    'bg-indigo-50 dark:bg-indigo-950/45 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300',
  ready:
    'bg-emerald-50 dark:bg-emerald-950/45 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300',
  delivered:
    'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200',
  cancelled:
    'bg-rose-50 dark:bg-rose-950/45 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300',
};

export const WebOrdersPage: React.FC<WebOrdersPageProps> = ({
  orders,
  customers,
  settings,
  storefrontUser,
  storefrontSyncStatus,
  onSignInStorefront,
  onSignOutStorefront,
  onPullNow,
  onUpdateStatus,
  onTransferToWhatsApp,
  onDeleteOrder,
  onUpdateSettings,
  onToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<WebOrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [pulling, setPulling] = useState(false);
  const [lastSyncNote, setLastSyncNote] = useState<string | null>(null);
  const [webhookDrawerOpen, setWebhookDrawerOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [prescriptionPreview, setPrescriptionPreview] = useState<WebOrder | null>(null);
  const [prescriptionImageFailed, setPrescriptionImageFailed] = useState(false);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 3500);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

  useEffect(() => {
    if (!prescriptionPreview) return;
    setPrescriptionImageFailed(false);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPrescriptionPreview(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [prescriptionPreview]);

  const customerById = useMemo(() => {
    const map = new Map<string, CustomerRecord>();
    for (const c of customers) map.set(c.id, c);
    return map;
  }, [customers]);

  const counts = useMemo(() => {
    const map: Record<WebOrderStatus | 'all' | 'linked', number> = {
      all: orders.length,
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
      linked: 0,
    };
    for (const o of orders) {
      map[o.status] += 1;
      if (o.convertedCustomerId && customerById.has(o.convertedCustomerId)) {
        map.linked += 1;
      }
    }
    return map;
  }, [orders, customerById]);

  const filtered = useMemo(
    () => filterWebOrders(orders, statusFilter, search),
    [orders, statusFilter, search]
  );

  const storefrontUrl =
    sanitizeWebsiteUrl(settings.websiteUrl) || DEFAULT_STOREFRONT_WEBSITE_URL;
  const webhookEndpoint =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhook/storefront-order`
      : '/api/webhook/storefront-order';

  const autoTransferEnabled = settings.autoTransferWebOrdersToWhatsApp !== false;

  const handlePullNowClick = async () => {
    setPulling(true);
    try {
      const res = await onPullNow();
      setLastSyncNote(res.note);
      onToast(
        res.importedCount > 0
          ? `تم استيراد/تحديث ${res.importedCount} طلب من الموقع`
          : res.note
      );
    } catch {
      onToast('تعذر الاتصال بجلب طلبات الموقع الآن');
    } finally {
      setPulling(false);
    }
  };

  const handleCopyWebhook = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard
        .writeText(webhookEndpoint)
        .then(() => onToast('تم نسخ رابط Webhook لاستقبال طلبات الموقع'))
        .catch(() => onToast('انسخ الرابط يدوياً من الخانة'));
    }
  };

  return (
    <section aria-label="طلبات الموقع" className="space-y-5">
      {/* Summary & Storefront Sync Controls */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
              <ShoppingBag className="w-5 h-5 text-[#c9a24b]" />
              <span>طلبات الموقع</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              تصل هنا تلقائياً الطلبات القادمة من موقع{' '}
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="font-bold text-[#8f6c1e] dark:text-[#e8cf8b] underline"
              >
                {storefrontUrl.replace(/^https?:\/\//, '')}
              </a>{' '}
              وترتبط مباشرة بصفحة متابعة وواتساب لإرسال الفاتورة ورابط التتبع للعميل.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs tabular-nums">
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#101c28] text-slate-700 dark:text-slate-200 font-bold">
                الإجمالي: {counts.all}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold">
                طلبات جديدة: {counts.pending}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 font-bold">
                قيد التجهيز: {counts.confirmed + counts.preparing}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold">
                مربوطة بواتساب: {counts.linked}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => void handlePullNowClick()}
              disabled={pulling}
              className="flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] disabled:opacity-60 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${pulling ? 'animate-spin' : ''}`} />
              <span>{pulling ? 'جاري المزامنة...' : 'مزامنة طلبات الموقع الآن'}</span>
            </button>

            {storefrontUser ? (
              <button
                type="button"
                onClick={() => void onSignOutStorefront()}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                title={storefrontUser.email || 'متصل بحساب إدارة المتجر'}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="max-w-[140px] truncate" dir="ltr">
                  {storefrontUser.email || 'متصل بالمتجر'}
                </span>
                <LogOut className="w-3.5 h-3.5 opacity-80" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onSignInStorefront()}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#c9a24b]/60 bg-[#f9f3e3] dark:bg-[#1f2b36] hover:bg-[#f2e7ca] text-[#8f6c1e] dark:text-[#e8cf8b] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>ربط حساب إدارة المتجر</span>
              </button>
            )}
          </div>
        </div>

        {/* Auto-transfer + Webhook Details Strip */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoTransferEnabled}
              onChange={(e) => {
                void onUpdateSettings({ autoTransferWebOrdersToWhatsApp: e.target.checked });
                onToast(
                  e.target.checked
                    ? 'تم تفعيل التحويل التلقائي لطلبات الموقع إلى العملاء ومتابعة الواتساب'
                    : 'تم تحويل الربط مع متابعة الواتساب إلى الوضع اليدوي'
                );
              }}
              className="w-4 h-4 accent-[#c9a24b] rounded cursor-pointer"
            />
            <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
              تحويل طلبات الموقع الجديدة تلقائياً لصفحة العملاء ومتابعة الواتساب
            </span>
          </label>

          <button
            type="button"
            onClick={() => setWebhookDrawerOpen((prev) => !prev)}
            aria-expanded={webhookDrawerOpen}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101c28] hover:border-[#c9a24b] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Webhook className="w-3.5 h-3.5 text-[#c9a24b]" />
            <span>إعدادات Webhook والربط المباشر</span>
            {webhookDrawerOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {storefrontSyncStatus?.state === 'error' && storefrontSyncStatus.message && (
          <div className="text-xs font-semibold px-3 py-2.5 rounded-xl border bg-rose-50 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex flex-wrap items-center justify-between gap-2">
            <span className="leading-relaxed">{storefrontSyncStatus.message}</span>
            {storefrontUser && (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await onSignOutStorefront();
                    await onSignInStorefront();
                  })();
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-white dark:bg-[#101c28] border border-rose-300 dark:border-rose-700 hover:border-[#c9a24b] text-rose-700 dark:text-rose-200 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>تغيير حساب المتجر</span>
              </button>
            )}
          </div>
        )}

        {lastSyncNote && (
          <p className="text-xs font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] bg-[#f9f3e3]/80 dark:bg-[#1b2936] border border-[#c9a24b]/35 rounded-xl px-3 py-2">
            {lastSyncNote}
          </p>
        )}

        {webhookDrawerOpen && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-[#101c28] p-3.5 space-y-2.5 text-xs">
            <p className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-[#c9a24b]" />
              <span>عنوان استقبال الطلبات (Webhook URL):</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code
                dir="ltr"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-white dark:bg-[#0d1722] border border-slate-200 dark:border-slate-700 text-[11px] sm:text-xs font-mono text-slate-700 dark:text-slate-200 break-all"
              >
                {webhookEndpoint}
              </code>
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 hover:border-[#c9a24b] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-[#c9a24b]" />
                <span>نسخ الرابط</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              للاستقبال الفوري من أي عملية نشر خارجية، أضف هذا الرابط في متغير{' '}
              <code dir="ltr" className="font-mono font-bold">
                EXTERNAL_ADMIN_WEBHOOK_URL
              </code>{' '}
              بمشروع الموقع أو اربط حساب إدارة المتجر بالأعلى للقراءة الفورية من قاعدة بيانات المتجر.
            </p>
          </div>
        )}
      </div>

      {/* Status Tabs & Search */}
      <div className="space-y-3">
        <div
          role="tablist"
          aria-label="تصفية طلبات الموقع حسب الحالة"
          className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-200/70 dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar"
        >
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            الكل ({counts.all})
          </button>
          {WEB_ORDER_STATUSES.map((st) => {
            const active = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(st)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                  active
                    ? 'bg-white dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {WEB_ORDER_STATUS_LABELS[st]} ({counts[st]})
              </button>
            );
          })}
        </div>

        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-[#c9a24b] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم العميل، رقم الهاتف، كود الطلب، أو المنتج..."
            aria-label="بحث في طلبات الموقع"
            className="w-full min-h-[42px] pr-10 pl-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-sm focus:outline-none focus:border-[#c9a24b]"
          />
        </div>
      </div>

      {/* Orders List / Empty States */}
      {orders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center space-y-3">
          <Globe className="w-10 h-10 mx-auto text-[#c9a24b]" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              لا توجد طلبات واردة من الموقع بعد
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
              بمجرد قيام أي عميل بطلب نظارة أو عدسة من{' '}
              <span dir="ltr" className="font-semibold">
                {storefrontUrl.replace(/^https?:\/\//, '')}
              </span>{' '}
              سيظهر الطلب هنا تلقائياً مع مقاسات النظر وتفاصيل الشراء.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handlePullNowClick()}
              disabled={pulling}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${pulling ? 'animate-spin' : ''}`} />
              <span>فحص الطلبات الجديدة الآن</span>
            </button>
            {!storefrontUser && (
              <button
                type="button"
                onClick={() => void onSignInStorefront()}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#c9a24b] text-[#8f6c1e] dark:text-[#e8cf8b] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>ربط حساب إدارة المتجر</span>
              </button>
            )}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center space-y-2.5">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            لا توجد طلبات مطابقة للتصفية أو البحث الحالي
          </p>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setSearch('');
            }}
            className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] cursor-pointer"
          >
            عرض جميع طلبات الموقع
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((order) => {
            const linkedCustomer = order.convertedCustomerId
              ? customerById.get(order.convertedCustomerId) ?? null
              : null;
            const isDeleteArmed = confirmDeleteId === order.id;

            return (
              <article
                key={order.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xs"
              >
                <div className="space-y-3.5">
                  {/* Card Top Row: Code + Date + Source + Status */}
                  <div className="flex flex-wrap items-start justify-between gap-2.5">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          dir="ltr"
                          className="font-mono-num text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-[#f9f3e3] dark:bg-[#1f2b36] border border-[#c9a24b]/50 text-[#8f6c1e] dark:text-[#e8cf8b]"
                        >
                          #{order.orderCode}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#101c28] text-slate-600 dark:text-slate-300">
                          {SOURCE_LABELS[order.source]}
                        </span>
                        {order.orderType === 'preorder' && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            حجز مسبق
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {formatArabicDateTime(order.createdAtMs)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border whitespace-nowrap ${
                          STATUS_BADGE_CLASSES[order.status]
                        }`}
                      >
                        {WEB_ORDER_STATUS_LABELS[order.status]}
                      </span>
                      <select
                        aria-label={`تغيير حالة طلب ${order.customerName}`}
                        value={order.status}
                        onChange={(e) => {
                          const next = e.target.value as WebOrderStatus;
                          onUpdateStatus(order.id, next);
                          onToast(
                            `تم تحديث حالة طلب #${order.orderCode} إلى «${WEB_ORDER_STATUS_LABELS[next]}»`
                          );
                        }}
                        className="min-h-[34px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101c28] text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#c9a24b] cursor-pointer"
                      >
                        {WEB_ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {WEB_ORDER_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/75 dark:bg-[#101c28]/75 p-3 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                        {order.customerName}
                      </h3>
                      {order.customerPhone && (
                        <a
                          href={`tel:${order.customerPhone}`}
                          dir="ltr"
                          className="font-mono-num text-xs font-bold text-[#8f6c1e] dark:text-[#e8cf8b] inline-flex items-center gap-1 hover:underline"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{order.customerPhone}</span>
                        </a>
                      )}
                    </div>
                    {order.customerAddress && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#c9a24b] shrink-0 mt-0.5" />
                        <span>{order.customerAddress}</span>
                      </p>
                    )}
                    {order.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        ملاحظات العميل: {order.notes}
                      </p>
                    )}
                  </div>

                  {/* Items Breakdown */}
                  {order.items.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                        الأصناف المطلوبة ({order.items.length}):
                      </span>
                      <div className="space-y-1.5">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-2.5 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-[#101c28]/40 text-xs"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-bold text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                                <span>{item.productName}</span>
                                {item.quantity > 1 && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-extrabold tabular-nums">
                                    ×{item.quantity}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                {item.colorName && (
                                  <span className="inline-flex items-center gap-1">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
                                      style={{ backgroundColor: item.colorHex || '#141413' }}
                                    />
                                    <span>اللون: {item.colorName}</span>
                                  </span>
                                )}
                                {item.lensName && (
                                  <span className="text-sky-700 dark:text-sky-300 font-semibold">
                                    العدسة: {item.lensName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-left shrink-0 tabular-nums font-bold text-[#8f6c1e] dark:text-[#e8cf8b]">
                              {(
                                (item.framePrice + item.lensPrice) *
                                item.quantity
                              ).toLocaleString('en-US')}{' '}
                              ج.م
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Optical Prescription if included */}
                  {order.prescription && (
                    <div className="rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-sky-900 dark:text-sky-200">
                        <span className="inline-flex items-center gap-1.5">
                          <Eye className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                          <span>مقاس النظر المرفق</span>
                        </span>
                        <div className="flex items-center gap-2 text-[11px] tabular-nums">
                          {order.prescription.ipd && (
                            <span dir="ltr">IPD: {order.prescription.ipd}</span>
                          )}
                          {(order.prescription.os.add || order.prescription.od.add) && (
                            <span dir="ltr">
                              ADD: {order.prescription.os.add || order.prescription.od.add}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums" dir="ltr">
                        <div className="rounded-lg bg-white dark:bg-[#0d1722] px-2.5 py-1.5 border border-sky-100 dark:border-slate-800">
                          <span className="font-extrabold text-slate-700 dark:text-slate-200 block">
                            OD (Right)
                          </span>
                          <span className="font-mono-num text-slate-600 dark:text-slate-300">
                            SPH {order.prescription.od.sph} | CYL {order.prescription.od.cyl} | AXIS{' '}
                            {order.prescription.od.axis}
                          </span>
                        </div>
                        <div className="rounded-lg bg-white dark:bg-[#0d1722] px-2.5 py-1.5 border border-sky-100 dark:border-slate-800">
                          <span className="font-extrabold text-slate-700 dark:text-slate-200 block">
                            OS (Left)
                          </span>
                          <span className="font-mono-num text-slate-600 dark:text-slate-300">
                            SPH {order.prescription.os.sph} | CYL {order.prescription.os.cyl} | AXIS{' '}
                            {order.prescription.os.axis}
                          </span>
                        </div>
                      </div>
                      {order.prescription.imageUrl && (
                        <button
                          type="button"
                          onClick={() => setPrescriptionPreview(order)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 dark:text-sky-300 underline"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>عرض صورة الكشف الطبي المرفقة</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Total */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50/80 dark:bg-[#101c28]/80 border border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      إجمالي طلب الموقع
                    </span>
                    <span className="text-base font-extrabold text-[#8f6c1e] dark:text-[#e8cf8b] tabular-nums">
                      {order.total.toLocaleString('en-US')} ج.م
                    </span>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {linkedCustomer && (
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                      <span className="inline-flex items-center gap-1.5">
                        <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>مرتبط بسجل العميل ومتابعة الواتساب ({linkedCustomer.name})</span>
                      </span>
                      <span className="font-mono-num" dir="ltr">
                        #{linkedCustomer.tok.slice(0, 6)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onTransferToWhatsApp(order)}
                      className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      <span>
                        {linkedCustomer ? 'متابعة عبر واتساب' : 'تحويل لمتابعة وواتساب'}
                      </span>
                    </button>

                    {isDeleteArmed ? (
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteOrder(order.id);
                          setConfirmDeleteId(null);
                          onToast(`تم حذف طلب الموقع #${order.orderCode}`);
                        }}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                      >
                        تأكيد؟
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(order.id)}
                        aria-label={`حذف طلب ${order.orderCode}`}
                        className="min-h-[42px] min-w-[42px] rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 grid place-items-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {prescriptionPreview?.prescription?.imageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`صورة الكشف الطبي للطلب ${prescriptionPreview.orderCode}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPrescriptionPreview(null);
          }}
        >
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#101c28] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-3 text-white">
              <div>
                <h3 className="text-sm font-extrabold">صورة الكشف الطبي</h3>
                <p className="mt-0.5 text-xs text-slate-300" dir="ltr">{prescriptionPreview.orderCode}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={prescriptionPreview.prescription.imageUrl}
                  download={`prescription-${prescriptionPreview.orderCode}.jpg`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white hover:bg-slate-700"
                >
                  <Download className="h-4 w-4" /> تنزيل
                </a>
                <button type="button" onClick={() => setPrescriptionPreview(null)} aria-label="إغلاق الصورة" className="grid h-9 w-9 place-items-center rounded-lg bg-slate-800 text-white hover:bg-slate-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex min-h-48 flex-1 items-center justify-center overflow-auto bg-[#0b121a] p-2 sm:p-5">
              {prescriptionImageFailed ? (
                <p className="px-5 py-10 text-center text-sm text-rose-300">تعذر عرض الصورة. جرّب تنزيل الملف أو اطلب من العميل إعادة رفعه.</p>
              ) : (
                <img
                  src={prescriptionPreview.prescription.imageUrl}
                  alt={`صورة الكشف الطبي للطلب ${prescriptionPreview.orderCode}`}
                  className="max-h-[calc(94vh-90px)] max-w-full rounded-lg object-contain"
                  onError={() => setPrescriptionImageFailed(true)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
