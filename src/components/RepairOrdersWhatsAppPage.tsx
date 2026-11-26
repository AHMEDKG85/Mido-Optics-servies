import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  MessageCircle,
  MessageSquare,
  PackageCheck,
  Printer,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { REPAIR_STAGES, RepairRecord, ShopSettings } from '../types/optics';
import {
  buildRepairStageWhatsAppDispatch,
  buildRepairTrackingUrl,
  buildRepairWhatsAppUrl,
  calculateRemaining,
  formatArabicDateTime,
} from '../utils/optics';
import {
  copyReceiptImageToClipboard,
  shareReceiptImageWithLink,
  triggerImageDownload,
} from '../utils/receiptImage';

export interface RepairWhatsAppDispatchItem {
  repair: RepairRecord;
  trackingUrl: string;
  waUrl: string;
  smsUrl?: string;
  message: string;
  isReadyNotification?: boolean;
  triggeredAt: number;
  receiptImageUrl?: string;
  receiptImageFile?: File;
  receiptImageBlob?: Blob;
  receiptFilename?: string;
}

interface RepairOrdersWhatsAppPageProps {
  repairs: RepairRecord[];
  settings: ShopSettings;
  isCloudSignedIn: boolean;
  pendingDispatch: RepairWhatsAppDispatchItem | null;
  onClearDispatch: () => void;
  onUpdateSettings: (patch: Partial<ShopSettings>) => Promise<void>;
  onAdvanceStage: (repairId: string, nextStage: number) => void;
  onMarkDelivered: (repairId: string) => void;
  onRestoreRepair: (repairId: string) => void;
  onOpenInvoice: (repair: RepairRecord) => void;
  onToast: (msg: string) => void;
}

export const RepairOrdersWhatsAppPage: React.FC<RepairOrdersWhatsAppPageProps> = ({
  repairs,
  settings,
  isCloudSignedIn,
  pendingDispatch,
  onClearDispatch,
  onUpdateSettings,
  onAdvanceStage,
  onMarkDelivered,
  onRestoreRepair,
  onOpenInvoice,
  onToast,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'ready' | 'delivered'>('all');
  const [search, setSearch] = useState('');
  const dispatchCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingDispatch?.isReadyNotification && dispatchCardRef.current) {
      dispatchCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [pendingDispatch?.triggeredAt, pendingDispatch?.isReadyNotification]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

  const activeRepairs = repairs.filter((r) => !r.delivered);
  const deliveredRepairs = repairs.filter((r) => r.delivered);
  const readyRepairsCount = activeRepairs.filter((r) => r.status >= 4).length;
  const inProgressRepairsCount = activeRepairs.filter((r) => r.status < 4).length;

  const trimmed = search.trim().toLowerCase();
  const baseList = filter === 'delivered' ? deliveredRepairs : activeRepairs;
  const filtered = baseList.filter((r) => {
    if (filter === 'active' && r.status >= 4) return false;
    if (filter === 'ready' && r.status < 4) return false;
    if (!trimmed) return true;
    return (
      r.name.toLowerCase().includes(trimmed) ||
      r.phone.toLowerCase().includes(trimmed) ||
      r.glassesType.toLowerCase().includes(trimmed) ||
      r.weldingType.toLowerCase().includes(trimmed) ||
      r.representativeName.toLowerCase().includes(trimmed) ||
      r.tok.toLowerCase().includes(trimmed)
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

  return (
    <section aria-label="متابعة التصليحات وإرسال واتساب" className="space-y-5">
      {/* Auto-WhatsApp Control Panel for Repairs */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>متابعة التصليحات وإشعارات واتساب</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            تابع مراحل التصليح واللحام خطوة بخطوة، ومع الوصول لمرحلة «التصليح جاهز للاستلام» يتم تجهيز إشعار واتساب للعميل تلقائياً.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={settings.autoWhatsApp}
          onClick={() =>
            void onUpdateSettings({ autoWhatsApp: !settings.autoWhatsApp })
          }
          className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-2 border shadow-xs transition-all active:scale-[0.98] cursor-pointer ${
            settings.autoWhatsApp
              ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>
            {settings.autoWhatsApp ? 'الإرسال التلقائي: مُفعّل' : 'الإرسال التلقائي: متوقف'}
          </span>
        </button>
      </div>

      {/* Auto-Prepared Repair WhatsApp Dispatch Card */}
      {pendingDispatch && (
        <div
          ref={dispatchCardRef}
          role="region"
          aria-label="إشعار تصليح جاهز للإرسال للعميل"
          className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
            pendingDispatch.isReadyNotification
              ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/45 shadow-sm'
              : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/35'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="text-xs sm:text-sm font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 flex-wrap">
                <span>
                  {pendingDispatch.isReadyNotification
                    ? `التصليح جاهز للاستلام — إشعار للعميل: ${pendingDispatch.repair.name}`
                    : `تم حفظ صورة الوصل وتجهيز متابعة التصليح للعميل: ${pendingDispatch.repair.name}`}
                </span>
                {pendingDispatch.repair.phone && (
                  <span
                    dir="ltr"
                    className="font-mono-num text-xs bg-white/80 dark:bg-slate-900/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800"
                  >
                    {pendingDispatch.repair.phone}
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-200 mt-1.5 whitespace-pre-line leading-relaxed">
                {pendingDispatch.message}
              </p>
            </div>
            <div className="flex items-start gap-2">
              {pendingDispatch.receiptImageUrl && (
                <button
                  type="button"
                  onClick={() => onOpenInvoice(pendingDispatch.repair)}
                  title="معاينة وطباعة وصل التصليح"
                  className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white p-1 shadow-xs hover:border-[#c9a24b] transition-colors cursor-pointer shrink-0"
                >
                  <img
                    src={pendingDispatch.receiptImageUrl}
                    alt={`صورة وصل تصليح ${pendingDispatch.repair.name}`}
                    className="w-20 h-28 object-cover object-top rounded-lg"
                  />
                </button>
              )}
              <button
                type="button"
                onClick={onClearDispatch}
                aria-label="إغلاق إشعار التصليح"
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                إغلاق ✕
              </button>
            </div>
          </div>

          {!pendingDispatch.repair.phone && (
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl px-3 py-2">
              ملاحظة: لم يتم تسجيل رقم واتساب لهذا العميل، يمكنك اختيار جهة الاتصال بعد فتح واتساب.
            </p>
          )}
          {!isCloudSignedIn && (
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl px-3 py-2">
              تنبيه: الحساب غير مربوط بـ Google حالياً، اربط الحساب من الشريط العلوي لمزامنة رابط المتابعة السحابي.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {pendingDispatch.receiptImageFile && pendingDispatch.receiptImageBlob && (
              <button
                type="button"
                onClick={() => {
                  if (!pendingDispatch.receiptImageFile || !pendingDispatch.receiptImageBlob) return;
                  void shareReceiptImageWithLink({
                    file: pendingDispatch.receiptImageFile,
                    blob: pendingDispatch.receiptImageBlob,
                    filename: pendingDispatch.receiptFilename || 'repair-receipt.png',
                    title: `إيصال تصليح ${pendingDispatch.repair.name} — ${settings.shopName || 'Mido Optics'}`,
                    message: pendingDispatch.message,
                  }).then((res) => {
                    if (res === 'shared-file') {
                      onToast('تم إرسال صورة وصل التصليح مع رابط المتابعة');
                    } else if (res === 'copied-and-downloaded') {
                      onToast('تم تنزيل ونسخ صورة الوصل — الصقها في واتساب مع الرابط');
                    }
                  });
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>إرسال صورة الوصل + الرابط</span>
              </button>
            )}
            <a
              href={pendingDispatch.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (!pendingDispatch.receiptImageBlob) return;
                void copyReceiptImageToClipboard(pendingDispatch.receiptImageBlob).then((copied) => {
                  if (copied) {
                    onToast('تم نسخ صورة الوصل — الصقها (Ctrl+V / لصق) داخل واتساب مع الرابط');
                  }
                });
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4" />
              <span>
                {pendingDispatch.isReadyNotification
                  ? 'إرسال إشعار واتساب للعميل'
                  : 'فتح واتساب (صورة + رابط)'}
              </span>
            </a>
            {pendingDispatch.receiptImageBlob && (
              <button
                type="button"
                onClick={() => {
                  if (!pendingDispatch.receiptImageBlob) return;
                  triggerImageDownload(
                    pendingDispatch.receiptImageBlob,
                    pendingDispatch.receiptFilename || 'repair-receipt.png'
                  );
                  onToast('تم تنزيل صورة وصل التصليح (PNG)');
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 hover:border-[#c9a24b] text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#c9a24b]" />
                <span>تنزيل الصورة</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenInvoice(pendingDispatch.repair)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 hover:border-[#c9a24b] text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#c9a24b]" />
              <span>طباعة كاشير</span>
            </button>
            {pendingDispatch.smsUrl && (
              <a
                href={pendingDispatch.smsUrl}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98]"
              >
                <MessageSquare className="w-4 h-4" />
                <span>SMS</span>
              </a>
            )}
            <button
              type="button"
              onClick={() =>
                void handleCopy(pendingDispatch.message, 'تم نسخ رسالة متابعة التصليح')
              }
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 hover:border-[#c9a24b] text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
            >
              <Copy className="w-4 h-4 text-[#c9a24b]" />
              <span>نسخ الرسالة</span>
            </button>
          </div>
          {pendingDispatch.receiptImageUrl && (
            <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
              <span>تم تنزيل صورة الوصل تلقائياً على جهازك ونسخها للحافظة لإرسالها للعميل مع رابط المتابعة.</span>
            </p>
          )}
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="تصفية التصليحات"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 shadow-xs"
        >
          {[
            ['all', `النشطة (${activeRepairs.length})`],
            ['active', `قيد التصليح (${inProgressRepairsCount})`],
            ['ready', `جاهز للاستلام (${readyRepairsCount})`],
            ['delivered', `تم التسليم (${deliveredRepairs.length})`],
          ].map(([key, label]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setFilter(key as 'all' | 'active' | 'ready' | 'delivered')
                }
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#c9a24b] text-white shadow-xs'
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
            placeholder="بحث باسم العميل، اللحام، النظارة أو المندوب..."
            aria-label="بحث في متابعة التصليحات"
            className="w-full min-h-[42px] pr-10 pl-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-sm focus:outline-none focus:border-[#c9a24b]"
          />
        </div>
      </div>

      {/* Repairs Cards List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {repairs.length === 0
            ? 'لا توجد تصليحات مسجلة حالياً.'
            : 'لا توجد تصليحات في هذا التصنيف حالياً.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((r) => {
            const stage = Math.max(0, Math.min(4, r.status || 0));
            const trackingUrl = buildRepairTrackingUrl(
              origin,
              pathname,
              r.tok,
              settings.publicBaseUrl
            );
            const waUrl = buildRepairWhatsAppUrl({
              repair: r,
              trackingUrl,
              shopName: settings.shopName,
            });
            const isReady = stage === 4;
            const lastTimestamp = r.hist?.[stage];
            const remaining = calculateRemaining(r.cost, r.paid);

            return (
              <article
                key={r.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xs"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base truncate flex items-center gap-1.5">
                        <Wrench className="w-4 h-4 text-[#c9a24b] shrink-0" />
                        <span className="truncate">{r.name}</span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                        <span dir="ltr" className="font-mono-num">
                          {r.phone || 'بدون رقم'}
                        </span>
                        <span>·</span>
                        <span>
                          {[r.glassesType, r.weldingType].filter(Boolean).join(' / ') ||
                            'تصليح نظارة'}
                        </span>
                      </p>
                      {r.representativeName && (
                        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1 inline-flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-[#c9a24b]" />
                          <span>المندوب: {r.representativeName}</span>
                        </p>
                      )}
                    </div>

                    <span
                      className={`text-xs font-bold whitespace-nowrap shrink-0 px-2.5 py-1 rounded-lg ${
                        r.delivered
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                          : isReady
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                          : 'bg-[#f3f9fd] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b]'
                      }`}
                    >
                      {r.delivered ? 'تم التسليم' : REPAIR_STAGES[stage]}
                    </span>
                  </div>

                  {/* Financial Summary */}
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f3f9fd] dark:bg-[#1b3042]/70 p-2.5 text-center text-xs tabular-nums">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">التكلفة</div>
                      <div className="font-extrabold mt-0.5">{r.cost} ج</div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">المدفوع</div>
                      <div className="font-extrabold mt-0.5 text-emerald-700 dark:text-emerald-400">
                        {r.paid} ج
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">الباقي</div>
                      <div
                        className={`font-extrabold mt-0.5 ${
                          remaining > 0
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {remaining > 0 ? `${remaining} ج` : 'خالص'}
                      </div>
                    </div>
                  </div>

                  {/* 5-step progress bars */}
                  <div
                    className="grid grid-cols-5 gap-1.5"
                    aria-label={`المرحلة ${stage + 1} من 5`}
                  >
                    {REPAIR_STAGES.map((label, idx) => (
                      <button
                        key={label}
                        type="button"
                        title={label}
                        disabled={r.delivered}
                        onClick={() => onAdvanceStage(r.id, idx)}
                        className={`h-2 rounded-full transition-colors ${
                          r.delivered ? 'cursor-default' : 'cursor-pointer'
                        } ${
                          idx <= stage
                            ? isReady || r.delivered
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
                      #rtrack-{r.tok}
                    </span>
                  </div>

                  {r.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 rounded-xl px-3 py-2">
                      {r.notes}
                    </p>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {!r.delivered ? (
                    <>
                      {stage > 0 && (
                        <button
                          type="button"
                          onClick={() => onAdvanceStage(r.id, stage - 1)}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-xs font-bold inline-flex items-center justify-center gap-1 shadow-xs transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          <span>المرحلة السابقة</span>
                        </button>
                      )}

                      {stage < 4 ? (
                        <button
                          type="button"
                          onClick={() => onAdvanceStage(r.id, stage + 1)}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-xs font-bold inline-flex items-center justify-center gap-1 shadow-xs transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
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
                        onClick={() => onMarkDelivered(r.id)}
                        className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 text-xs font-bold inline-flex items-center justify-center gap-1 shadow-xs transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <PackageCheck className="w-4 h-4 shrink-0" />
                        <span>استلام النظارة</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRestoreRepair(r.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>استرجاع للتصليح</span>
                    </button>
                  )}

                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-[70px] min-h-[40px] px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1 shadow-xs transition-all active:scale-[0.98] whitespace-nowrap"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>واتساب</span>
                  </a>

                  <button
                    type="button"
                    onClick={() =>
                      void handleCopy(
                        buildRepairStageWhatsAppDispatch({
                          repair: r,
                          trackingUrl,
                          shopName: settings.shopName,
                        }).message,
                        'تم نسخ رسالة متابعة التصليح والرابط'
                      )
                    }
                    aria-label={`نسخ رابط متابعة تصليح ${r.name}`}
                    title="نسخ الرسالة والرابط"
                    className="min-h-[40px] min-w-[38px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] inline-flex items-center justify-center shadow-xs transition-all active:scale-[0.98] cursor-pointer shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenInvoice(r)}
                    aria-label={`فاتورة تصليح ${r.name}`}
                    title="طباعة كاشير / حفظ صورة الوصل"
                    className="min-h-[40px] min-w-[38px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] inline-flex items-center justify-center shadow-xs transition-all active:scale-[0.98] cursor-pointer shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  <a
                    href={`#rtrack-${r.tok}`}
                    aria-label={`معاينة رابط متابعة تصليح ${r.name}`}
                    title="معاينة صفحة متابعة العميل"
                    className="min-h-[40px] min-w-[38px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] inline-flex items-center justify-center shadow-xs transition-all active:scale-[0.98] shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
