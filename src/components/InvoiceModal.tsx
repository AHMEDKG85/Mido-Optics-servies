import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Download,
  Glasses,
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
  buildRepairTrackingUrl,
  buildSinglePagePdfFromJpeg,
  buildTrackingUrl,
  calculateRemaining,
  formatArabicDateTime,
  formatArabicPickupDate,
  formatEgyptianWhatsAppPhone,
} from '../utils/optics';

interface InvoiceModalProps {
  customer?: CustomerRecord | null;
  repair?: RepairRecord | null;
  settings: ShopSettings;
  onClose: () => void;
  onToast: (msg: string) => void;
}

async function renderThermalReceiptCanvas(params: {
  customer?: CustomerRecord | null;
  repair?: RepairRecord | null;
  shopName: string;
  qrCanvas: HTMLCanvasElement | null;
}): Promise<HTMLCanvasElement> {
  const { customer, repair, shopName, qrCanvas } = params;
  const width = 576; // 80mm thermal roll width (~203dpi)
  const height = customer ? 1060 : 940;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.dir = 'rtl';
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر إنشاء الإيصال');
  }

  // Crisp thermal white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const pad = 26;
  const innerW = width - pad * 2;
  let y = 36;

  const drawDashedLine = (lineY: number) => {
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(width - pad, lineY);
    ctx.stroke();
    ctx.restore();
  };

  // Shop header
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 34px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText(shopName || 'Mido Optics', width / 2, y);

  y += 32;
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 20px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText(repair ? 'إيصال استلام تصليح نظارة' : 'إيصال طلب نظارة طبية', width / 2, y);

  y += 26;
  const code = repair
    ? `REP-${repair.id.slice(-8).toUpperCase()}`
    : `INV-${(customer?.id || '').slice(-8).toUpperCase()}`;
  const dateText = formatArabicDateTime(repair ? repair.date : customer?.date) || '';
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 17px monospace';
  ctx.fillText(`${code}  |  ${dateText}`, width / 2, y);

  y += 22;
  drawDashedLine(y);

  const drawKeyValueRow = (label: string, value: string, bold = false) => {
    y += 30;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '600 18px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillText(label, width - pad, y);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = `${bold ? 'bold' : '600'} 18px "Cairo", "Segoe UI", Tahoma, sans-serif`;
    ctx.fillText(value.slice(0, 32), pad, y);
  };

  if (repair) {
    const stageText = repair.delivered
      ? 'تم التسليم للعميل'
      : REPAIR_STAGES[Math.max(0, Math.min(4, repair.status || 0))];
    drawKeyValueRow('اسم العميل:', repair.name, true);
    drawKeyValueRow('واتساب:', repair.phone || 'غير مسجل');
    drawKeyValueRow('نوع النظارة:', repair.glassesType || '—');
    drawKeyValueRow('نوع اللحام:', repair.weldingType || '—');
    drawKeyValueRow('اسم المندوب:', repair.representativeName || '—');
    drawKeyValueRow('حالة التصليح:', stageText);
    if (repair.notes) {
      drawKeyValueRow('ملاحظات:', repair.notes);
    }

    y += 22;
    drawDashedLine(y);

    const rest = calculateRemaining(repair.cost, repair.paid);
    drawKeyValueRow('تكلفة التصليح:', `${repair.cost} ج`, true);
    drawKeyValueRow('المدفوع:', `${repair.paid} ج`);
    drawKeyValueRow('الباقي:', rest > 0 ? `${rest} ج` : 'خالص (0 ج)', true);
  } else if (customer) {
    const stageText = customer.delivered
      ? 'تم التسليم للعميل'
      : ORDER_STAGES[Math.max(0, Math.min(4, customer.status || 0))];
    const usageLabel = customer.usageType ? USAGE_TYPE_LABELS[customer.usageType] : '';

    drawKeyValueRow('اسم العميل:', customer.name, true);
    drawKeyValueRow('الهاتف:', customer.phone || 'غير مسجل');
    if (usageLabel) {
      drawKeyValueRow('نوع الاستخدام:', usageLabel, true);
    }
    drawKeyValueRow('الشمبر:', customer.frame || '—');
    drawKeyValueRow('العدسات:', customer.lens || '—');
    if (customer.pickupDate) {
      drawKeyValueRow('موعد الاستلام:', formatArabicPickupDate(customer.pickupDate));
    }
    drawKeyValueRow('الحالة:', stageText);

    y += 22;
    drawDashedLine(y);

    // Eye table
    y += 28;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillText('مقاس النظر (R / L)', width / 2, y);

    y += 14;
    const colW = innerW / 4;
    const rowH = 38;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, y, innerW, rowH * 3);

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(pad + 1, y + 1, innerW - 2, rowH - 1);

    ctx.direction = 'ltr';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px monospace';
    ['EYE', 'SPH', 'CYL', 'AXIS'].forEach((h, i) => {
      ctx.fillText(h, pad + colW * i + colW / 2, y + 25);
    });

    [
      ['R', customer.r],
      ['L', customer.l],
    ].forEach(([lbl, vals], rIdx) => {
      const ry = y + rowH * (rIdx + 1);
      ctx.beginPath();
      ctx.moveTo(pad, ry);
      ctx.lineTo(pad + innerW, ry);
      ctx.stroke();

      ctx.font = 'bold 17px monospace';
      ctx.fillText(String(lbl), pad + colW / 2, ry + 25);
      (vals as string[]).forEach((v, cIdx) => {
        ctx.font = '600 17px monospace';
        ctx.fillText(v || '-', pad + colW * (cIdx + 1) + colW / 2, ry + 25);
      });
    });

    y += rowH * 3;
    if (customer.add) {
      y += 28;
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(`ADD (L): ${customer.add}`, width / 2, y);
    }

    y += 22;
    drawDashedLine(y);

    const rest = calculateRemaining(customer.total, customer.paid);
    drawKeyValueRow('المبلغ الكلي:', `${customer.total} ج`, true);
    drawKeyValueRow('المدفوع:', `${customer.paid} ج`);
    drawKeyValueRow('الباقي:', rest > 0 ? `${rest} ج` : 'خالص (0 ج)', true);
  }

  y += 24;
  drawDashedLine(y);

  // QR + Footer
  y += 20;
  if (qrCanvas) {
    const qrSize = 136;
    ctx.drawImage(qrCanvas, (width - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + 24;
  } else {
    y += 28;
  }

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText('امسح الكود لمتابعة الحالة خطوة بخطوة', width / 2, y);
  y += 26;
  ctx.fillStyle = '#475569';
  ctx.font = '500 16px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText(`شكراً لتعاملكم مع ${shopName || 'Mido Optics'}`, width / 2, y);

  return canvas;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  customer,
  repair,
  settings,
  onClose,
  onToast,
}) => {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [busyPdf, setBusyPdf] = useState(false);

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
      width: 112,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  }, [activeRecord, trackingUrl]);

  useEffect(() => {
    if (!activeRecord) return;
    document.body.classList.add('printing-invoice');
    return () => {
      document.body.classList.remove('printing-invoice');
    };
  }, [activeRecord]);

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

  const createPdfFile = async (): Promise<File> => {
    const canvas = await renderThermalReceiptCanvas({
      customer,
      repair,
      shopName,
      qrCanvas: qrCanvasRef.current,
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = dataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const jpegBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      jpegBytes[i] = binary.charCodeAt(i);
    }
    const pdfBytes = buildSinglePagePdfFromJpeg({
      jpegBytes,
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      paperFormat: 'thermal-80mm',
    });
    const safeName = (activeRecord.name || 'customer').replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const prefix = repair ? 'repair-receipt' : 'receipt';
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    return new File([blob], `${prefix}-${safeName}-${activeRecord.id.slice(-5)}.pdf`, {
      type: 'application/pdf',
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setBusyPdf(true);
    try {
      const pdfFile = await createPdfFile();
      const url = URL.createObjectURL(pdfFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFile.name;
      a.click();
      URL.revokeObjectURL(url);
      onToast('تم تنزيل إيصال الكاشير بصيغة PDF');
    } catch {
      onToast('تعذر توليد ملف PDF، يمكنك استخدام زر الطباعة');
    } finally {
      setBusyPdf(false);
    }
  };

  const handleSharePdf = async () => {
    setBusyPdf(true);
    try {
      const pdfFile = await createPdfFile();
      const textSummary = repair
        ? [
            `إيصال تصليح ${shopName} (${invoiceNumber})`,
            `العميل: ${repair.name}`,
            `النظارة: ${repair.glassesType || '—'} · اللحام: ${repair.weldingType || '—'}`,
            repair.representativeName ? `المندوب: ${repair.representativeName}` : '',
            `التكلفة: ${repair.cost} ج | المدفوع: ${repair.paid} ج | المتبقي: ${rest > 0 ? `${rest} ج` : 'خالص'}`,
            `رابط المتابعة: ${trackingUrl}`,
          ]
            .filter(Boolean)
            .join('\n')
        : [
            `فاتورة ${shopName} (${invoiceNumber})`,
            `العميل: ${customer?.name}`,
            `الطلب: ${[customer?.frame, customer?.lens].filter(Boolean).join(' · ') || 'نظارة طبية'}`,
            `الإجمالي: ${totalAmount} ج | المدفوع: ${paidAmount} ج | المتبقي: ${rest > 0 ? `${rest} ج` : 'خالص'}`,
            `رابط المتابعة: ${trackingUrl}`,
          ].join('\n');

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function'
      ) {
        const canShareFiles =
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [pdfFile] });

        if (canShareFiles) {
          await navigator.share({
            title: `إيصال ${activeRecord.name} — ${shopName}`,
            text: textSummary,
            files: [pdfFile],
          });
          onToast('تمت مشاركة الإيصال PDF');
          return;
        }

        await navigator.share({
          title: `إيصال ${activeRecord.name} — ${shopName}`,
          text: textSummary,
        });
        onToast('تمت مشاركة تفاصيل الإيصال');
        return;
      }

      const url = URL.createObjectURL(pdfFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFile.name;
      a.click();
      URL.revokeObjectURL(url);
      try {
        await navigator.clipboard.writeText(textSummary);
      } catch {
        // ignore clipboard denial
      }
      onToast('تم تنزيل الإيصال PDF ونسخ ملخصه للمشاركة');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      onToast('تعذر المشاركة التلقائية، استخدم زر تنزيل PDF');
    } finally {
      setBusyPdf(false);
    }
  };

  const waInvoiceText = encodeURIComponent(
    repair
      ? [
          `إيصال تصليح من ${shopName} (${invoiceNumber})`,
          `العميل: ${repair.name}`,
          repair.glassesType ? `نوع النظارة: ${repair.glassesType}` : '',
          repair.weldingType ? `نوع اللحام: ${repair.weldingType}` : '',
          repair.representativeName ? `اسم المندوب: ${repair.representativeName}` : '',
          `تكلفة التصليح: ${repair.cost} جنيه`,
          `المدفوع: ${repair.paid} جنيه`,
          `الباقي: ${rest > 0 ? `${rest} جنيه` : 'خالص'}`,
          `متابعة التصليح: ${trackingUrl}`,
        ]
          .filter(Boolean)
          .join('\n')
      : [
          `فاتورة من ${shopName} (${invoiceNumber})`,
          `العميل: ${customer?.name}`,
          customer?.usageType ? `الاستخدام: ${USAGE_TYPE_LABELS[customer.usageType]}` : '',
          customer?.frame ? `الشمبر: ${customer.frame}` : '',
          customer?.lens ? `العدسات: ${customer.lens}` : '',
          `المبلغ الكلي: ${totalAmount} جنيه`,
          `المدفوع: ${paidAmount} جنيه`,
          `المبلغ المتبقي: ${rest > 0 ? `${rest} جنيه` : 'خالص'}`,
          customer?.pickupDate
            ? `موعد الاستلام: ${formatArabicPickupDate(customer.pickupDate)}`
            : '',
          `متابعة الطلب: ${trackingUrl}`,
        ]
          .filter(Boolean)
          .join('\n')
  );
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
      <div
        className="invoice-print-dialog w-full max-w-xl max-h-[94vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Action Bar (hidden when printing) */}
        <div className="print:hidden sticky top-0 z-10 bg-white/95 dark:bg-[#15232f]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="invoice-modal-title" className="text-sm sm:text-base font-extrabold">
            {repair ? 'فاتورة التصليح — ورق كاشير (80mm)' : 'فاتورة العميل — ورق كاشير (80mm)'}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة كاشير</span>
            </button>
            <button
              type="button"
              disabled={busyPdf}
              onClick={() => void handleDownloadPdf()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] hover:border-[#c9a24b] text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Download className="w-4 h-4 text-[#c9a24b]" />
              <span>تنزيل PDF</span>
            </button>
            <button
              type="button"
              disabled={busyPdf}
              onClick={() => void handleSharePdf()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] hover:border-emerald-500 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>مشاركة PDF</span>
            </button>
            <a
              href={waInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>واتساب</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق الفاتورة"
              className="min-h-[38px] min-w-[38px] rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 grid place-items-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 80mm Thermal Cashier Receipt Sheet */}
        <div className="p-4 sm:p-6 bg-slate-100/70 dark:bg-[#0d1722]/60 print:p-0 print:bg-white">
          <article
            data-receipt-format="thermal-80mm"
            className="invoice-print-sheet w-full max-w-[340px] mx-auto rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm px-4 py-4 space-y-3 text-xs leading-snug"
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
