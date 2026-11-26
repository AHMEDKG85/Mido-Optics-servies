import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Download,
  Glasses,
  Image as ImageIcon,
  MessageCircle,
  Printer,
  Share2,
  Wrench,
  X,
} from 'lucide-react';
import {
  CustomerRecord,
  ORDER_STAGES,
  REPAIR_STAGES,
  RepairRecord,
  ShopSettings,
  USAGE_TYPE_LABELS,
} from '../types/optics';
import {
  buildReceiptShareSummary,
  buildRepairTrackingUrl,
  buildTrackingUrl,
  calculateRemaining,
  formatArabicDateTime,
  formatArabicPickupDate,
  formatEgyptianWhatsAppPhone,
} from '../utils/optics';
import {
  copyReceiptImageToClipboard,
  generateReceiptImageAsset,
  shareReceiptImageWithLink,
  ThermalRollWidth,
  triggerImageDownload,
} from '../utils/receiptImage';

interface InvoiceModalProps {
  customer?: CustomerRecord | null;
  repair?: RepairRecord | null;
  settings: ShopSettings;
  onClose: () => void;
  onToast: (msg: string) => void;
}

function getInitialRollWidth(): ThermalRollWidth {
  try {
    const saved = localStorage.getItem('mido_thermal_width');
    if (saved === '58mm' || saved === '80mm') return saved;
  } catch {
    // ignore storage access errors
  }
  return '80mm';
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  customer,
  repair,
  settings,
  onClose,
  onToast,
}) => {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [busyImage, setBusyImage] = useState(false);
  const [rollWidth, setRollWidth] = useState<ThermalRollWidth>(getInitialRollWidth);

  const activeRecord = repair || customer || null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const trackingUrl = repair
    ? buildRepairTrackingUrl(origin, pathname, repair.tok, settings.publicBaseUrl)
    : customer
    ? buildTrackingUrl(origin, pathname, customer.tok, settings.publicBaseUrl)
    : '';

  useEffect(() => {
    if (!activeRecord || !qrCanvasRef.current) return;
    void QRCode.toCanvas(qrCanvasRef.current, trackingUrl, {
      width: rollWidth === '58mm' ? 96 : 114,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [activeRecord, trackingUrl, rollWidth]);

  useEffect(() => {
    if (!activeRecord) return;
    document.body.classList.add('printing-invoice');
    return () => {
      document.body.classList.remove('printing-invoice');
      document.body.classList.remove('thermal-58mm');
    };
  }, [activeRecord]);

  useEffect(() => {
    if (!activeRecord) return;
    document.body.classList.toggle('thermal-58mm', rollWidth === '58mm');
    try {
      localStorage.setItem('mido_thermal_width', rollWidth);
    } catch {
      // ignore storage errors
    }
  }, [activeRecord, rollWidth]);

  if (!activeRecord) return null;

  const shopName = settings.shopName || 'Mido Optics';
  const totalAmount = repair ? repair.cost : customer ? customer.total : 0;
  const paidAmount = repair ? repair.paid : customer ? customer.paid : 0;
  const rest = calculateRemaining(totalAmount, paidAmount);
  const invoiceNumber = repair
    ? `REP-${repair.id.slice(-8).toUpperCase()}`
    : `INV-${(customer?.id || '').slice(-8).toUpperCase()}`;

  const stageLabel = repair
    ? repair.delivered
      ? 'تم التسليم للعميل'
      : REPAIR_STAGES[Math.max(0, Math.min(4, repair.status || 0))]
    : customer?.delivered
    ? 'تم التسليم للعميل'
    : ORDER_STAGES[Math.max(0, Math.min(4, customer?.status || 0))];

  const createImageAsset = async () => {
    return generateReceiptImageAsset({
      customer,
      repair,
      shopName,
      trackingUrl,
      qrCanvas: qrCanvasRef.current,
      rollWidth,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadImage = async () => {
    setBusyImage(true);
    try {
      const asset = await createImageAsset();
      triggerImageDownload(asset.file, asset.filename);
      onToast('تم تنزيل صورة فاتورة الكاشير (PNG) على جهازك');
    } catch {
      onToast('تعذر حفظ صورة الفاتورة، يمكنك استخدام زر الطباعة');
    } finally {
      setBusyImage(false);
    }
  };

  const handleShareImage = async () => {
    setBusyImage(true);
    try {
      const asset = await createImageAsset();
      const textSummary = buildReceiptShareSummary({
        customer,
        repair,
        shopName,
        trackingUrl,
      });

      const result = await shareReceiptImageWithLink({
        file: asset.file,
        blob: asset.blob,
        filename: asset.filename,
        title: `إيصال ${activeRecord.name} — ${shopName}`,
        message: textSummary,
      });

      if (result === 'shared-file') {
        onToast('تمت مشاركة صورة الوصل مع رابط المتابعة');
      } else if (result === 'copied-and-downloaded') {
        onToast('تم تنزيل صورة الوصل ونسخها — الصقها في واتساب مع رابط المتابعة');
      }
    } catch {
      onToast('تعذر مشاركة صورة الوصل، تم تنزيل الصورة على جهازك');
    } finally {
      setBusyImage(false);
    }
  };

  const handlePrepareWhatsAppImage = async () => {
    try {
      const asset = await createImageAsset();
      const copied = await copyReceiptImageToClipboard(asset.blob);
      if (copied) {
        onToast('تم نسخ صورة الوصل تلقائياً — الصقها (Ctrl+V / لصق) داخل واتساب');
      } else {
        triggerImageDownload(asset.file, asset.filename);
        onToast('تم تنزيل صورة الوصل لإرفاقها في واتساب مع الرابط');
      }
    } catch {
      // ignore fallback errors and still let WhatsApp link open
    }
  };

  const shareSummary = buildReceiptShareSummary({
    customer,
    repair,
    shopName,
    trackingUrl,
  });
  const waInvoiceText = encodeURIComponent(shareSummary);
  const waPhone = formatEgyptianWhatsAppPhone(activeRecord.phone);
  const waInvoiceUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${waInvoiceText}`
    : `https://wa.me/?text=${waInvoiceText}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-modal-title"
      className="invoice-print-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <style media="print">{`@page { size: ${rollWidth} auto; margin: 1.5mm; }`}</style>

      <div
        className="invoice-print-dialog w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Action Bar (hidden when printing) */}
        <div className="print:hidden sticky top-0 z-10 bg-white/95 dark:bg-[#15232f]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="invoice-modal-title" className="text-sm sm:text-base font-extrabold">
                {repair ? 'إيصال تصليح — ماكينة الكاشير' : 'فاتورة العميل — ماكينة الكاشير'}
              </h2>
              <div
                role="group"
                aria-label="مقاس ورق الكاشير"
                className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0d1722] p-0.5 text-[11px] font-bold"
              >
                {(['80mm', '58mm'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setRollWidth(size)}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      rollWidth === size
                        ? 'bg-[#c9a24b] text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق الفاتورة"
              className="min-h-[38px] min-w-[38px] rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 grid place-items-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة كاشير</span>
            </button>
            <button
              type="button"
              disabled={busyImage}
              onClick={() => void handleDownloadImage()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] hover:border-[#c9a24b] text-slate-800 dark:text-slate-100 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Download className="w-4 h-4 text-[#c9a24b]" />
              <span>تنزيل كصورة (PNG)</span>
            </button>
            <button
              type="button"
              disabled={busyImage}
              onClick={() => void handleShareImage()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:border-emerald-500 text-emerald-800 dark:text-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>إرسال الصورة + الرابط</span>
            </button>
            <a
              href={waInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void handlePrepareWhatsAppImage()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>واتساب (صورة + رابط)</span>
            </a>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-[#c9a24b] shrink-0" />
            <span>
              تُحفظ الفاتورة كصورة PNG وتُطبع مباشرة على ورق الكاشير ({rollWidth}) مع كود المتابعة.
            </span>
          </p>
        </div>

        {/* Thermal Cashier Receipt Sheet */}
        <div className="p-4 sm:p-6 bg-slate-100/70 dark:bg-[#0d1722]/60 print:p-0 print:bg-white">
          <article
            data-receipt-format={`thermal-${rollWidth}`}
            className={`invoice-print-sheet w-full mx-auto rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm px-4 py-4 space-y-3 leading-snug ${
              rollWidth === '58mm' ? 'max-w-[260px] text-[11px]' : 'max-w-[340px] text-xs'
            }`}
          >
            {/* Shop Header */}
            <header className="text-center space-y-1 pb-2.5 border-b border-dashed border-slate-400">
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white grid place-items-center mx-auto">
                {repair ? <Wrench className="w-4 h-4" /> : <Glasses className="w-4 h-4" />}
              </div>
              <h3 className="text-base font-extrabold text-slate-900">{shopName}</h3>
              <p className="text-[11px] font-bold text-slate-700">
                {repair ? 'إيصال تصليح نظارة' : 'إيصال طلب نظارة طبية'}
              </p>
              <p className="text-[11px] font-mono-num text-slate-600">
                {invoiceNumber} · {formatArabicDateTime(activeRecord.date)}
              </p>
            </header>

            {/* Details rows */}
            <div className="space-y-1.5 pb-2.5 border-b border-dashed border-slate-400">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">العميل:</span>
                <span className="font-bold text-slate-900 text-left">{activeRecord.name}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">الهاتف:</span>
                <span className="font-mono-num font-semibold text-slate-900" dir="ltr">
                  {activeRecord.phone || '—'}
                </span>
              </div>

              {repair ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">نوع النظارة:</span>
                    <span className="font-semibold text-left">{repair.glassesType || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">نوع اللحام:</span>
                    <span className="font-semibold text-left">{repair.weldingType || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">اسم المندوب:</span>
                    <span className="font-semibold text-left">
                      {repair.representativeName || '—'}
                    </span>
                  </div>
                  {repair.notes && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-slate-500 shrink-0">ملاحظات:</span>
                      <span className="font-medium text-left">{repair.notes}</span>
                    </div>
                  )}
                </>
              ) : (
                customer && (
                  <>
                    {customer.usageType && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">الاستخدام:</span>
                        <span className="font-bold text-slate-900">
                          {USAGE_TYPE_LABELS[customer.usageType]}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">الشمبر:</span>
                      <span className="font-semibold text-left">{customer.frame || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">العدسات:</span>
                      <span className="font-semibold text-left">{customer.lens || '—'}</span>
                    </div>
                  </>
                )
              )}

              {!repair && customer?.pickupDate && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">الاستلام:</span>
                  <span className="font-semibold tabular-nums">
                    {formatArabicPickupDate(customer.pickupDate)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">الحالة:</span>
                <span className="font-bold text-slate-900">{stageLabel}</span>
              </div>
            </div>

            {/* Compact Prescription Table (Customer Orders only) */}
            {customer && (
              <div className="pb-2.5 border-b border-dashed border-slate-400 space-y-1.5">
                <div className="text-center font-bold text-[11px] text-slate-700">
                  مقاسات النظر
                </div>
                <table
                  className="w-full text-center text-[11px] font-mono-num border border-slate-300"
                  dir="ltr"
                >
                  <thead className="bg-slate-100 text-slate-800 border-b border-slate-300">
                    <tr>
                      <th className="py-1 px-1.5">EYE</th>
                      <th className="py-1 px-1.5">SPH</th>
                      <th className="py-1 px-1.5">CYL</th>
                      <th className="py-1 px-1.5">AXIS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-1 px-1.5 font-bold">R</td>
                      {customer.r.map((val, idx) => (
                        <td key={idx} className="py-1 px-1.5">
                          {val}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-1 px-1.5 font-bold">L</td>
                      {customer.l.map((val, idx) => (
                        <td key={idx} className="py-1 px-1.5">
                          {val}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                {customer.add && (
                  <div className="text-center font-mono-num text-[11px] font-bold text-slate-800" dir="ltr">
                    ADD (L): {customer.add}
                  </div>
                )}
              </div>
            )}

            {/* Cashier Financial Totals */}
            <div className="space-y-1.5 pb-2.5 border-b border-dashed border-slate-400 tabular-nums">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">
                  {repair ? 'تكلفة التصليح:' : 'المبلغ الكلي:'}
                </span>
                <span className="font-bold text-slate-900">{totalAmount} ج.م</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">المدفوع:</span>
                <span className="font-bold text-emerald-700">{paidAmount} ج.م</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-1 border-t border-slate-200">
                <span className="font-extrabold text-slate-900">المتبقي:</span>
                <span
                  className={`font-extrabold ${
                    rest > 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {rest > 0 ? `${rest} ج.م` : 'خالص'}
                </span>
              </div>
            </div>

            {/* Thermal QR & Footer */}
            <footer className="text-center space-y-2 pt-1">
              <div className="inline-block p-1.5 rounded-lg border border-slate-200 bg-white">
                <canvas ref={qrCanvasRef} />
              </div>
              <p className="text-[11px] font-bold text-slate-800">
                امسح الكود لمتابعة الحالة خطوة بخطوة
              </p>
              <p className="text-[11px] text-slate-500">شكراً لتعاملكم مع {shopName}</p>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
};
