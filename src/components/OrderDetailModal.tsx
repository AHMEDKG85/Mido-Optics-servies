import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Glasses,
  MessageCircle,
  MessageSquare,
  Printer,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  CustomerRecord,
  LensInventorySnapshot,
  ORDER_STAGES,
  ShopSettings,
  USAGE_TYPE_LABELS,
} from '../types/optics';
import {
  buildStageWhatsAppDispatch,
  buildTrackingUrl,
  formatArabicDateTime,
  formatArabicPickupDate,
  getPickupUrgency,
} from '../utils/optics';
import { EyeLensStatusBadge } from './EyeLensStatusBadge';

interface OrderDetailModalProps {
  customer: CustomerRecord | null;
  settings: ShopSettings;
  lensInventory: LensInventorySnapshot | null;
  onClose: () => void;
  onSetStage: (customerId: string, stage: number) => void;
  onMarkDelivered: (customerId: string) => void;
  onRestoreOrder?: (customerId: string) => void;
  onEditCustomer: (customer: CustomerRecord) => void;
  onOpenInvoice: (customer: CustomerRecord) => void;
  onToast: (msg: string) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  customer,
  settings,
  lensInventory,
  onClose,
  onSetStage,
  onMarkDelivered,
  onRestoreOrder,
  onEditCustomer,
  onOpenInvoice,
  onToast,
}) => {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const trackingUrl = customer
    ? buildTrackingUrl(origin, pathname, customer.tok, settings.publicBaseUrl)
    : '';

  useEffect(() => {
    if (!customer || !qrCanvasRef.current) return;
    void QRCode.toCanvas(qrCanvasRef.current, trackingUrl, {
      width: 170,
      margin: 2,
      color: {
        dark: '#1d2733',
        light: '#ffffff',
      },
    });
  }, [customer, trackingUrl]);

  if (!customer) return null;

  const stage = Math.max(0, Math.min(4, customer.status || 0));
  const dispatch = buildStageWhatsAppDispatch({
    customer,
    trackingUrl,
    template: settings.waTemplate,
    shopName: settings.shopName,
  });
  const readyMessage = dispatch.message;
  const waUrl = dispatch.waUrl;
  const smsUrl = dispatch.smsUrl;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      onToast('تم نسخ رابط المتابعة');
    } catch {
      onToast('تعذر النسخ التلقائي، حدد الرابط وانسخه');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-[#e8cf8b] via-[#c9a24b] to-[#a8832f] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Glasses className="w-7 h-7 shrink-0" />
            <div className="min-w-0">
              <h2 id="order-detail-title" className="text-lg font-extrabold truncate">
                {customer.name}
              </h2>
              <p className="text-xs opacity-90 font-mono-num" dir="ltr">
                {customer.phone || 'بدون رقم هاتف'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق تفاصيل الطلب"
            className="min-h-[38px] min-w-[38px] rounded-xl bg-white/20 hover:bg-white/30 text-white grid place-items-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {customer.pickupDate && (() => {
            const urgency = getPickupUrgency(customer.pickupDate, customer.delivered);
            const isAlert =
              urgency.level === 'overdue' ||
              urgency.level === 'today' ||
              urgency.level === 'soon';
            return (
              <div
                className={`rounded-2xl border px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 ${
                  urgency.level === 'overdue' || urgency.level === 'today'
                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/35 text-rose-800 dark:text-rose-200'
                    : urgency.level === 'soon'
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/35 text-amber-800 dark:text-amber-200'
                    : 'border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042] text-slate-700 dark:text-slate-200'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 font-bold">
                  {isAlert ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <Calendar className="w-4 h-4 shrink-0 text-[#c9a24b]" />
                  )}
                  <span>
                    موعد الاستلام: {formatArabicPickupDate(customer.pickupDate)}
                  </span>
                </span>
                {urgency.label && <span className="font-bold">{urgency.label}</span>}
              </div>
            );
          })()}

          {customer.photo && (
            <img
              src={customer.photo}
              alt={`صورة نظارة ${customer.name}`}
              referrerPolicy="no-referrer"
              className="w-full max-h-48 object-contain rounded-2xl bg-[#f3f9fd] dark:bg-[#1b3042] border border-slate-200 dark:border-slate-700"
            />
          )}

          {/* Eye Prescription Summary */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {customer.usageType && (
              <div className="bg-[#f3f9fd] dark:bg-[#1b3042]/60 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">نوع النظارة</span>
                <span className="font-bold text-[#8f6c1e] dark:text-[#e8cf8b]">
                  {USAGE_TYPE_LABELS[customer.usageType]}
                </span>
              </div>
            )}
            <table className="w-full text-center text-xs font-mono-num" dir="ltr">
              <thead className="bg-[#e3f2fb] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b]">
                <tr>
                  <th className="py-2 px-2"></th>
                  <th className="py-2 px-2">SPH</th>
                  <th className="py-2 px-2">CYL</th>
                  <th className="py-2 px-2">AXIS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr>
                  <td className="py-2 px-2 font-bold">R</td>
                  {customer.r.map((val, idx) => (
                    <td key={idx} className="py-2 px-2">
                      {val}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-2 font-bold">L</td>
                  {customer.l.map((val, idx) => (
                    <td key={idx} className="py-2 px-2">
                      {val}
                    </td>
                  ))}
                </tr>
                {customer.add && (
                  <tr className="bg-[#f3f9fd]/70 dark:bg-[#1b3042]/40">
                    <td className="py-1.5 px-2 font-bold text-[#8f6c1e] dark:text-[#e8cf8b]">
                      ADD
                    </td>
                    <td colSpan={3} className="py-1.5 px-2 font-bold">
                      {customer.add}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Automatic R & L Lens Inventory Check */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <EyeLensStatusBadge
              eye="R"
              tuple={customer.r}
              inventory={lensInventory}
              compact
            />
            <EyeLensStatusBadge
              eye="L"
              tuple={customer.l}
              inventory={lensInventory}
              compact
            />
          </div>

          {/* 5 Stages */}
          <div className="space-y-2">
            {ORDER_STAGES.map((label, idx) => {
              const isDone = idx < stage;
              const isCurrent = idx === stage;
              const ts = customer.hist?.[idx];
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onSetStage(customer.id, idx)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-right flex items-center gap-3 transition-colors cursor-pointer ${
                    isCurrent
                      ? 'border-[#c9a24b] bg-[#f3f9fd] dark:bg-[#1b3042]'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1722]/60 hover:border-[#c9a24b]/60'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full text-xs font-bold grid place-items-center shrink-0 ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-[#c9a24b] text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {idx <= stage ? '✓' : idx + 1}
                  </span>
                  <span className="flex-1 text-sm font-semibold">{label}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {ts ? formatArabicDateTime(ts) : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {stage === 4 && !customer.delivered && (
            <div className="rounded-2xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/90 dark:bg-emerald-950/40 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                  النظارة جاهزة للاستلام — أرسل إشعار التوجّه للفرع لهاتف العميل
                </span>
                {customer.phone && (
                  <span dir="ltr" className="font-mono-num text-[11px] font-bold text-emerald-900 dark:text-emerald-200">
                    {customer.phone}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-line">
                {readyMessage}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>إشعار واتساب</span>
                </a>
                <a
                  href={smsUrl}
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>إشعار SMS</span>
                </a>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {stage > 0 && (
              <button
                type="button"
                onClick={() => onSetStage(customer.id, stage - 1)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>المرحلة السابقة</span>
              </button>
            )}
            {stage < 4 && (
              <button
                type="button"
                onClick={() => onSetStage(customer.id, stage + 1)}
                className="min-h-[44px] px-4 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>المرحلة التالية</span>
              </button>
            )}
            {!customer.delivered ? (
              <button
                type="button"
                onClick={() => {
                  onMarkDelivered(customer.id);
                  onClose();
                }}
                className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>استلام النظارة</span>
              </button>
            ) : (
              onRestoreOrder && (
                <button
                  type="button"
                  onClick={() => {
                    onRestoreOrder(customer.id);
                    onClose();
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>استرجاع للطلبات النشطة</span>
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => onEditCustomer(customer)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>تعديل بيانات العميل</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenInvoice(customer);
              }}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>فاتورة / PDF</span>
            </button>
          </div>

          {/* QR & WhatsApp Link Section */}
          <div className="rounded-2xl bg-[#f3f9fd] dark:bg-[#1b3042]/70 border border-slate-200 dark:border-slate-700 p-4 text-center space-y-3">
            <h3 className="text-sm font-bold text-[#8f6c1e] dark:text-[#e8cf8b]">
              QR ورابط متابعة العميل
            </h3>
            <div className="inline-block bg-white p-2.5 rounded-xl border border-slate-200">
              <canvas ref={qrCanvasRef} />
            </div>
            <input
              readOnly
              dir="ltr"
              aria-label="رابط متابعة العميل"
              value={trackingUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-xs font-mono-num"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="flex-1 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>نسخ الرابط</span>
              </button>
              <a
                href={`#track-${customer.tok}`}
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                <span>معاينة</span>
              </a>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>إرسال واتساب</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
