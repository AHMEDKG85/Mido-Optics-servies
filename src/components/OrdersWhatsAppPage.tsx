import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  Calendar,
  CheckCircle2,
  Copy,
  MessageCircle,
  MessageSquare,
  PackageCheck,
  Printer,
  QrCode,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react';
import {
  CustomerRecord,
  DEFAULT_WA_TEMPLATE,
  LensInventorySnapshot,
  ORDER_STAGES,
  ShopSettings,
} from '../types/optics';
import {
  AuthErrorSummary,
  buildStageWhatsAppDispatch,
  buildTrackingUrl,
  buildWhatsAppUrl,
  formatArabicDateTime,
  formatArabicPickupDate,
  getPickupUrgency,
  renderWhatsAppMessage,
  resolvePublicOrigin,
} from '../utils/optics';
import { NotificationPermissionState } from '../hooks/usePickupNotifications';
import { EyeLensStatusBadge } from './EyeLensStatusBadge';
import { LensInventoryPanel } from './LensInventoryPanel';

export interface WhatsAppDispatchItem {
  customer: CustomerRecord;
  trackingUrl: string;
  waUrl: string;
  smsUrl?: string;
  message: string;
  isReadyNotification?: boolean;
  triggeredAt: number;
}

interface OrdersWhatsAppPageProps {
  customers: CustomerRecord[];
  settings: ShopSettings;
  isCloudSignedIn: boolean;
  pendingDispatch: WhatsAppDispatchItem | null;
  notificationPermission: NotificationPermissionState;
  notificationsEnabled: boolean;
  dueTodayCount: number;
  overdueCount: number;
  lensBridge: {
    lensUser: User | null;
    inventory: LensInventorySnapshot | null;
    summary: { sheetCount: number; stockedPowersCount: number; totalUnits: number };
    connecting: boolean;
    authError: AuthErrorSummary | null;
    syncError: string | null;
    firebaseProjectId: string;
    connectCloud: () => Promise<boolean>;
    disconnectCloud: () => Promise<void>;
    importJsonText: (jsonText: string) => LensInventorySnapshot;
    clearInventory: () => void;
    dismissError: () => void;
  };
  onEnableNotifications: () => Promise<void>;
  onToggleNotifications: () => void;
  onSendReminderNow: () => Promise<void>;
  onClearDispatch: () => void;
  onUpdateSettings: (patch: Partial<ShopSettings>) => Promise<void>;
  onAdvanceStage: (customerId: string, nextStage: number) => void;
  onMarkDelivered: (customerId: string) => void;
  onOpenOrderModal: (customer: CustomerRecord) => void;
  onOpenInvoice: (customer: CustomerRecord) => void;
  onToast: (msg: string) => void;
}

export const OrdersWhatsAppPage: React.FC<OrdersWhatsAppPageProps> = ({
  customers,
  settings,
  isCloudSignedIn,
  pendingDispatch,
  notificationPermission,
  notificationsEnabled,
  dueTodayCount,
  overdueCount,
  lensBridge,
  onEnableNotifications,
  onToggleNotifications,
  onSendReminderNow,
  onClearDispatch,
  onUpdateSettings,
  onAdvanceStage,
  onMarkDelivered,
  onOpenOrderModal,
  onOpenInvoice,
  onToast,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'ready' | 'due'>('all');
  const [search, setSearch] = useState('');
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState(settings.waTemplate);
  const [publicBaseUrlDraft, setPublicBaseUrlDraft] = useState(settings.publicBaseUrl || '');
  const dispatchCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingDispatch?.isReadyNotification && dispatchCardRef.current) {
      dispatchCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [pendingDispatch?.triggeredAt, pendingDispatch?.isReadyNotification]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

  // Orders page only lists non-delivered orders; delivered customers remain in Customers page
  const activeOrders = customers.filter((c) => !c.delivered);

  const urgentOrders = activeOrders.filter((c) => {
    const u = getPickupUrgency(c.pickupDate, c.delivered);
    return u.level === 'overdue' || u.level === 'today' || u.level === 'soon';
  });

  const trimmed = search.trim().toLowerCase();
  const filtered = activeOrders.filter((c) => {
    if (filter === 'active' && c.status >= 4) return false;
    if (filter === 'ready' && c.status < 4) return false;
    if (filter === 'due') {
      const u = getPickupUrgency(c.pickupDate, c.delivered);
      if (u.level !== 'overdue' && u.level !== 'today' && u.level !== 'soon') {
        return false;
      }
    }
    if (!trimmed) return true;
    return (
      c.name.toLowerCase().includes(trimmed) ||
      c.phone.toLowerCase().includes(trimmed)
    );
  });

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast(label);
    } catch {
      onToast('تعذر النسخ، يمكنك تحديد النص ونسخه يدوياً');
    }
  };

  const handleSaveTemplate = async () => {
    await onUpdateSettings({
      waTemplate: templateDraft || DEFAULT_WA_TEMPLATE,
      publicBaseUrl: publicBaseUrlDraft.trim(),
    });
    setShowTemplateEditor(false);
    onToast('تم حفظ إعدادات الرسالة والرابط ومزامنتها');
  };

  const insertToken = (token: string) => {
    setTemplateDraft((prev) => `${prev}${prev.endsWith(' ') || prev === '' ? '' : ' '}${token}`);
  };

  return (
    <section aria-label="متابعة الطلبات وإرسال واتساب تلقائي" className="space-y-5">
      {/* Auto-WhatsApp Control Panel */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>الإرسال التلقائي لرابط المتابعة عبر واتساب</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              عند إضافة عميل جديد أو ترقية مرحلة النظارة، يتم تجهيز رسالة واتساب برابط المتابعة المباشر تلقائياً.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoWhatsApp}
              onClick={() =>
                void onUpdateSettings({ autoWhatsApp: !settings.autoWhatsApp })
              }
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-2 border transition-colors cursor-pointer ${
                settings.autoWhatsApp
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {settings.autoWhatsApp ? 'الإرسال التلقائي: مُفعّل' : 'الإرسال التلقائي: متوقف'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTemplateDraft(settings.waTemplate);
                setPublicBaseUrlDraft(settings.publicBaseUrl || '');
                setShowTemplateEditor((v) => !v);
              }}
              aria-expanded={showTemplateEditor}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 hover:border-[#c9a24b] cursor-pointer"
            >
              <Settings2 className="w-4 h-4 text-[#c9a24b]" />
              <span>تخصيص الرسالة</span>
            </button>
          </div>
        </div>

        {showTemplateEditor && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">إدراج متغير:</span>
              {[
                ['{name}', 'اسم العميل'],
                ['{status}', 'المرحلة الحالية'],
                ['{link}', 'رابط المتابعة'],
                ['{frame}', 'الشمبر'],
                ['{rest}', 'المبلغ المتبقي'],
              ].map(([token, label]) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertToken(token)}
                  className="px-2.5 py-1 rounded-lg bg-[#e3f2fb] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] font-semibold cursor-pointer hover:opacity-85"
                >
                  {label} ({token})
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              value={templateDraft}
              onChange={(e) => setTemplateDraft(e.target.value)}
              aria-label="نص قالب رسالة الواتساب"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#0d1722] p-3 text-sm focus:outline-none focus:border-[#c9a24b]"
            />
            <div className="space-y-1">
              <label
                htmlFor="public-base-url"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                رابط الموقع العام لروابط المتابعة (اختياري — اتركه فارغاً لاستخدام الرابط التلقائي)
              </label>
              <input
                id="public-base-url"
                type="url"
                dir="ltr"
                value={publicBaseUrlDraft}
                onChange={(e) => setPublicBaseUrlDraft(e.target.value)}
                placeholder={resolvePublicOrigin(origin)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#0d1722] px-3 text-xs font-mono-num focus:outline-none focus:border-[#c9a24b]"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTemplateDraft(DEFAULT_WA_TEMPLATE)}
                className="min-h-[40px] px-3.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                استعادة الافتراضي
              </button>
              <button
                type="button"
                onClick={() => void handleSaveTemplate()}
                className="min-h-[40px] px-4 rounded-xl bg-[#c9a24b] text-white text-xs font-bold cursor-pointer"
              >
                حفظ القالب
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Browser Web Notifications Panel for Overdue & Due-Today Orders */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            {notificationPermission === 'granted' && notificationsEnabled ? (
              <Bell className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <BellOff className="w-5 h-5 text-[#c9a24b]" />
            )}
            <span>تنبيهات المتصفح لمواعيد الاستلام</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {notificationPermission === 'unsupported'
              ? 'هذا المتصفح لا يدعم إشعارات الويب.'
              : notificationPermission === 'denied'
              ? 'تم حظر الإشعارات من المتصفح — اسمح بالإشعارات من إعدادات الموقع في شريط العنوان.'
              : overdueCount > 0 || dueTodayCount > 0
              ? `يوجد حالياً ${overdueCount} طلب متأخر و ${dueTodayCount} طلب موعد استلامه اليوم.`
              : 'تُرسل تنبيهات تلقائية عند اقتراب أو تأخر أي موعد تسليم.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {notificationPermission === 'granted' ? (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                onClick={onToggleNotifications}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border cursor-pointer ${
                  notificationsEnabled
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>
                  {notificationsEnabled ? 'التنبيهات: مُفعّلة' : 'التنبيهات: متوقفة'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void onSendReminderNow()}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] cursor-pointer"
              >
                إرسال تذكير الآن
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={notificationPermission === 'unsupported'}
              onClick={() => void onEnableNotifications()}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Bell className="w-4 h-4" />
              <span>تفعيل تنبيهات المتصفح</span>
            </button>
          )}
        </div>
      </div>

      {/* Lens Inventory Integration Panel */}
      <LensInventoryPanel
        lensUser={lensBridge.lensUser}
        inventory={lensBridge.inventory}
        summary={lensBridge.summary}
        connecting={lensBridge.connecting}
        authError={lensBridge.authError}
        syncError={lensBridge.syncError}
        firebaseProjectId={lensBridge.firebaseProjectId}
        onConnectCloud={lensBridge.connectCloud}
        onDisconnectCloud={lensBridge.disconnectCloud}
        onImportJsonText={lensBridge.importJsonText}
        onClearInventory={lensBridge.clearInventory}
        onDismissError={lensBridge.dismissError}
        onToast={onToast}
      />

      {/* Auto-Prepared Customer Phone Dispatch Card */}
      {pendingDispatch && (
        <div
          ref={dispatchCardRef}
          role="region"
          aria-label="إشعار جاهز للإرسال على هاتف العميل"
          className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
            pendingDispatch.isReadyNotification
              ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/45 shadow-sm'
              : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/35'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs sm:text-sm font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 flex-wrap">
                <span>
                  {pendingDispatch.isReadyNotification
                    ? `تم تجهيز إشعار جاهزية الاستلام للعميل: ${pendingDispatch.customer.name}`
                    : `تم تجهيز رابط المتابعة التلقائي للعميل: ${pendingDispatch.customer.name}`}
                </span>
                {pendingDispatch.customer.phone && (
                  <span dir="ltr" className="font-mono-num text-xs bg-white/80 dark:bg-slate-900/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    {pendingDispatch.customer.phone}
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-200 mt-1.5 whitespace-pre-line leading-relaxed">
                {pendingDispatch.message}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearDispatch}
              aria-label="إغلاق إشعار العميل"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
            >
              إغلاق ✕
            </button>
          </div>
          {!pendingDispatch.customer.phone && (
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl px-3 py-2">
              ملاحظة: لم يتم تسجيل رقم هاتف لهذا العميل، يمكنك إضافة رقمه أو اختيار جهة الاتصال عند الإرسال.
            </p>
          )}
          {!isCloudSignedIn && (
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl px-3 py-2">
              تنبيه: الحساب غير مربوط بـ Google حالياً، لذلك لن تظهر تفاصيل الطلب عند العميل على جهازه حتى تقوم بربط الحساب من الشريط العلوي ليتم رفعه للسحابة.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={pendingDispatch.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>
                {pendingDispatch.isReadyNotification
                  ? 'إرسال إشعار واتساب للعميل'
                  : 'فتح واتساب وإرسال الرابط الآن'}
              </span>
            </a>
            {pendingDispatch.smsUrl && (
              <a
                href={pendingDispatch.smsUrl}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                <span>إرسال رسالة نصية SMS</span>
              </a>
            )}
            <button
              type="button"
              onClick={() =>
                void handleCopy(pendingDispatch.message, 'تم نسخ نص الإشعار والرابط')
              }
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-4 h-4" />
              <span>نسخ الرسالة</span>
            </button>
          </div>
        </div>
      )}

      {/* Visual Alert Banner for Approaching / Overdue Pickup Dates */}
      {urgentOrders.length > 0 && (
        <div
          role="alert"
          aria-label="تنبيه مواعيد التسليم القريبة"
          className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/35 p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-500 text-white grid place-items-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-amber-900 dark:text-amber-200">
                تنبيه موعد التسليم: {urgentOrders.length}{' '}
                {urgentOrders.length === 1 ? 'نظارة اقترب أو حان موعد تسليمها' : 'نظارات اقترب أو حان موعد تسليمها'}
              </p>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                {urgentOrders
                  .slice(0, 3)
                  .map(
                    (o) =>
                      `${o.name} (${getPickupUrgency(o.pickupDate, o.delivered).label})`
                  )
                  .join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilter(filter === 'due' ? 'all' : 'due')}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            {filter === 'due' ? 'عرض جميع الطلبات' : 'عرض الطلبات العاجلة'}
          </button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="تصفية الطلبات"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-800"
        >
          {[
            ['all', `الكل (${activeOrders.length})`],
            ['active', `قيد التجهيز (${activeOrders.filter((c) => c.status < 4).length})`],
            ['ready', `جاهز للاستلام (${activeOrders.filter((c) => c.status >= 4).length})`],
            ['due', `قرب التسليم (${urgentOrders.length})`],
          ].map(([key, label]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as 'all' | 'active' | 'ready' | 'due')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#c9a24b] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-[#c9a24b] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في الطلبات..."
            aria-label="بحث في الطلبات"
            className="w-full min-h-[42px] pr-10 pl-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-sm focus:outline-none focus:border-[#c9a24b]"
          />
        </div>
      </div>

      {/* Orders List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {activeOrders.length === 0
            ? 'لا توجد طلبات قيد المتابعة حالياً.'
            : 'لا توجد طلبات في هذا التصنيف حالياً.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const stage = Math.max(0, Math.min(4, c.status || 0));
            const trackingUrl = buildTrackingUrl(
              origin,
              pathname,
              c.tok,
              settings.publicBaseUrl
            );
            const waUrl = buildWhatsAppUrl({
              customer: c,
              trackingUrl,
              template: settings.waTemplate,
              shopName: settings.shopName,
            });
            const isReady = stage === 4;
            const lastTimestamp = c.hist?.[stage];
            const urgency = getPickupUrgency(c.pickupDate, c.delivered);
            const isUrgentRed = urgency.level === 'overdue' || urgency.level === 'today';
            const isUrgentAmber = urgency.level === 'soon';

            return (
              <article
                key={c.id}
                className={`rounded-2xl border bg-white dark:bg-[#15232f] p-4 sm:p-5 flex flex-col justify-between gap-4 ${
                  isUrgentRed
                    ? 'border-rose-400 dark:border-rose-700'
                    : isUrgentAmber
                    ? 'border-amber-400 dark:border-amber-700'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base truncate">{c.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                        <span dir="ltr" className="font-mono-num">
                          {c.phone || 'بدون رقم'}
                        </span>
                        <span>·</span>
                        <span>{[c.frame, c.lens].filter(Boolean).join(' / ') || 'طلب نظارة'}</span>
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold whitespace-nowrap shrink-0 ${
                        isReady
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-[#a8832f] dark:text-[#e8cf8b]'
                      }`}
                    >
                      {ORDER_STAGES[stage]}
                    </span>
                  </div>

                  {/* 5-step progress bars */}
                  <div className="grid grid-cols-5 gap-1.5" aria-label={`المرحلة ${stage + 1} من 5`}>
                    {ORDER_STAGES.map((label, idx) => (
                      <button
                        key={label}
                        type="button"
                        title={label}
                        onClick={() => onAdvanceStage(c.id, idx)}
                        className={`h-2 rounded-full transition-colors cursor-pointer ${
                          idx <= stage
                            ? isReady
                              ? 'bg-emerald-500'
                              : 'bg-[#c9a24b]'
                            : 'bg-slate-200 dark:bg-slate-700 hover:bg-[#c9a24b]/50'
                        }`}
                      />
                    ))}
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 flex-wrap">
                    <span>
                      الخطوة {stage + 1} من 5
                      {lastTimestamp ? ` · ${formatArabicDateTime(lastTimestamp)}` : ''}
                    </span>
                    <span dir="ltr" className="font-mono-num truncate max-w-[180px]">
                      #track-{c.tok}
                    </span>
                  </div>

                  {c.pickupDate && (
                    <div
                      className={`rounded-xl px-3 py-2 text-xs flex items-center justify-between gap-2 ${
                        isUrgentRed
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 font-bold'
                          : isUrgentAmber
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-bold'
                          : 'bg-[#f3f9fd] dark:bg-[#1b3042]/70 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {isUrgentRed || isUrgentAmber ? (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Calendar className="w-3.5 h-3.5 shrink-0 text-[#c9a24b]" />
                        )}
                        <span>
                          موعد التسليم: {formatArabicPickupDate(c.pickupDate)}
                        </span>
                      </span>
                      {urgency.label && <span>{urgency.label}</span>}
                    </div>
                  )}

                  {lensBridge.inventory && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <EyeLensStatusBadge
                        eye="R"
                        tuple={c.r}
                        inventory={lensBridge.inventory}
                        compact
                      />
                      <EyeLensStatusBadge
                        eye="L"
                        tuple={c.l}
                        inventory={lensBridge.inventory}
                        compact
                      />
                    </div>
                  )}
                </div>

                {/* Quick Actions: Prev Stage + Next Stage + Mark Delivered + WhatsApp + Copy + QR */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {stage > 0 && (
                    <button
                      type="button"
                      onClick={() => onAdvanceStage(c.id, stage - 1)}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>المرحلة السابقة</span>
                    </button>
                  )}

                  {stage < 4 ? (
                    <button
                      type="button"
                      onClick={() => onAdvanceStage(c.id, stage + 1)}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>المرحلة التالية</span>
                    </button>
                  ) : (
                    <span className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>جاهزة</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onMarkDelivered(c.id)}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <PackageCheck className="w-4 h-4 shrink-0" />
                    <span>استلام النظارة</span>
                  </button>

                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-[70px] min-h-[40px] px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>واتساب</span>
                  </a>

                  <button
                    type="button"
                    onClick={() =>
                      void handleCopy(
                        buildStageWhatsAppDispatch({
                          customer: c,
                          trackingUrl,
                          template: settings.waTemplate,
                          shopName: settings.shopName,
                        }).message,
                        'تم نسخ رسالة المتابعة والرابط'
                      )
                    }
                    aria-label={`نسخ رابط متابعة ${c.name}`}
                    title="نسخ الرسالة والرابط"
                    className="min-h-[40px] min-w-[36px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] inline-flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenInvoice(c)}
                    aria-label={`فاتورة ${c.name}`}
                    title="طباعة / مشاركة فاتورة PDF"
                    className="min-h-[40px] min-w-[36px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] inline-flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenOrderModal(c)}
                    aria-label={`تفاصيل و QR ${c.name}`}
                    title="تفاصيل الطلب و QR"
                    className="min-h-[40px] min-w-[36px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] inline-flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
