import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Download,
  Glasses,
  MessageCircle,
  Printer,
  Share2,
  X,
} from 'lucide-react';
import { CustomerRecord, ORDER_STAGES, ShopSettings } from '../types/optics';
import {
  buildSinglePagePdfFromJpeg,
  buildTrackingUrl,
  calculateRemaining,
  formatArabicDateTime,
  formatArabicPickupDate,
  formatEgyptianWhatsAppPhone,
} from '../utils/optics';

interface InvoiceModalProps {
  customer: CustomerRecord | null;
  settings: ShopSettings;
  onClose: () => void;
  onToast: (msg: string) => void;
}

async function renderInvoiceCanvas(params: {
  customer: CustomerRecord;
  shopName: string;
  trackingUrl: string;
  qrCanvas: HTMLCanvasElement | null;
}): Promise<HTMLCanvasElement> {
  const { customer, shopName, qrCanvas } = params;
  const width = 1240;
  const height = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.dir = 'rtl';
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر إنشاء الفاتورة');
  }

  // White paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Subtle outer frame
  ctx.strokeStyle = '#d6c18a';
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, width - 96, height - 96);

  // Top gold header band
  const grad = ctx.createLinearGradient(48, 48, width - 48, 220);
  grad.addColorStop(0, '#c9a24b');
  grad.addColorStop(1, '#9d7929');
  ctx.fillStyle = grad;
  ctx.fillRect(48, 48, width - 96, 175);

  // Header text (RTL)
  ctx.direction = 'rtl';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.font = 'bold 46px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText(shopName || 'Mido Optics', width - 92, 128);

  ctx.font = '600 26px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillStyle = '#fef7e4';
  ctx.fillText('فاتورة طلب نظارة طبية', width - 92, 178);

  const invoiceCode = `#${customer.id.slice(-8).toUpperCase()}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px monospace';
  ctx.fillText(invoiceCode, 92, 130);
  ctx.direction = 'rtl';
  ctx.font = '500 22px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText(formatArabicDateTime(customer.date) || '', 92, 175);

  // Customer & Order details section
  let y = 290;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText('بيانات العميل والطلب', width - 92, y);

  y += 28;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.fillRect(88, y, width - 176, 250);
  ctx.strokeRect(88, y, width - 176, 250);

  const stageText = customer.delivered
    ? 'تم تسليم النظارة'
    : ORDER_STAGES[Math.max(0, Math.min(4, customer.status || 0))];

  const detailRows: Array<[string, string]> = [
    ['اسم العميل:', customer.name],
    ['رقم الهاتف:', customer.phone || 'غير مسجل'],
    ['نوع الشمبر:', customer.frame || '—'],
    ['نوع العدسات:', customer.lens || '—'],
    [
      'موعد الاستلام:',
      customer.pickupDate ? formatArabicPickupDate(customer.pickupDate) : 'غير محدد',
    ],
    ['حالة الطلب:', stageText],
  ];

  let rowY = y + 48;
  for (const [label, val] of detailRows) {
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.font = '600 24px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillText(label, width - 120, rowY);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 25px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillText(val, width - 310, rowY);
    rowY += 38;
  }

  // Prescription table
  y += 305;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText('مقاس النظر (R / L)', width - 92, y);

  y += 26;
  const tableX = 88;
  const tableW = width - 176;
  const colW = tableW / 4;
  const rowH = 66;

  // Header row
  ctx.fillStyle = '#e3f2fb';
  ctx.fillRect(tableX, y, tableW, rowH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(tableX, y, tableW, rowH * 3);

  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8f6c1e';
  ctx.font = 'bold 26px monospace';
  const headers = ['العين', 'SPH', 'CYL', 'AXIS'];
  headers.forEach((h, i) => {
    ctx.fillText(h, tableX + colW * i + colW / 2, y + 43);
  });

  const eyeRows: Array<[string, string[]]> = [
    ['R (يمين)', customer.r],
    ['L (شمال)', customer.l],
  ];

  eyeRows.forEach(([eyeLabel, vals], idx) => {
    const ry = y + rowH * (idx + 1);
    ctx.beginPath();
    ctx.moveTo(tableX, ry);
    ctx.lineTo(tableX + tableW, ry);
    ctx.stroke();

    ctx.direction = 'rtl';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px "Cairo", monospace';
    ctx.fillText(eyeLabel, tableX + colW / 2, ry + 43);

    ctx.direction = 'ltr';
    vals.forEach((v, cIdx) => {
      ctx.font = '600 26px monospace';
      ctx.fillText(v || '-', tableX + colW * (cIdx + 1) + colW / 2, ry + 43);
    });
  });

  // Financial Summary Box
  y += rowH * 3 + 60;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText('الملخص المالي', width - 92, y);

  y += 26;
  const rest = calculateRemaining(customer.total, customer.paid);
  const boxW = (tableW - 36) / 3;
  const boxes = [
    { label: 'المبلغ الكلي', value: `${customer.total} ج`, bg: '#f8fafc', fg: '#0f172a' },
    { label: 'المبلغ المدفوع', value: `${customer.paid} ج`, bg: '#ecfdf5', fg: '#047857' },
    {
      label: 'المبلغ المتبقي',
      value: rest > 0 ? `${rest} ج` : 'خالص (0 ج)',
      bg: rest > 0 ? '#fff1f2' : '#ecfdf5',
      fg: rest > 0 ? '#be123c' : '#047857',
    },
  ];

  boxes.forEach((b, idx) => {
    // RTL order: Total on right, Paid center, Remaining on left
    const bx = tableX + tableW - boxW - idx * (boxW + 18);
    ctx.fillStyle = b.bg;
    ctx.strokeStyle = '#cbd5e1';
    ctx.fillRect(bx, y, boxW, 130);
    ctx.strokeRect(bx, y, boxW, 130);

    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = '600 24px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillText(b.label, bx + boxW / 2, y + 48);

    ctx.fillStyle = b.fg;
    ctx.font = 'bold 34px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillText(b.value, bx + boxW / 2, y + 100);
  });

  // QR Code & footer
  y += 190;
  if (qrCanvas) {
    ctx.drawImage(qrCanvas, 100, y, 200, 200);
  }
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText('امسح الكود لمتابعة حالة النظارة خطوة بخطوة', width - 100, y + 60);
  ctx.fillStyle = '#64748b';
  ctx.font = '500 22px "Cairo", "Segoe UI", Tahoma, sans-serif';
  ctx.fillText(`شكراً لتعاملكم مع ${shopName || 'Mido Optics'}`, width - 100, y + 110);
  ctx.fillText('الأسعار تشمل الضمان وفق سياسة المحل', width - 100, y + 150);

  return canvas;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  customer,
  settings,
  onClose,
  onToast,
}) => {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [busyPdf, setBusyPdf] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const trackingUrl = customer
    ? buildTrackingUrl(origin, pathname, customer.tok, settings.publicBaseUrl)
    : '';

  useEffect(() => {
    if (!customer || !qrCanvasRef.current) return;
    void QRCode.toCanvas(qrCanvasRef.current, trackingUrl, {
      width: 140,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  }, [customer, trackingUrl]);

  useEffect(() => {
    if (!customer) return;
    document.body.classList.add('printing-invoice');
    return () => {
      document.body.classList.remove('printing-invoice');
    };
  }, [customer]);

  if (!customer) return null;

  const rest = calculateRemaining(customer.total, customer.paid);
  const shopName = settings.shopName || 'Mido Optics';
  const invoiceNumber = `INV-${customer.id.slice(-8).toUpperCase()}`;
  const stageLabel = customer.delivered
    ? 'تم التسليم للعميل'
    : ORDER_STAGES[Math.max(0, Math.min(4, customer.status || 0))];

  const createPdfFile = async (): Promise<File> => {
    const canvas = await renderInvoiceCanvas({
      customer,
      shopName,
      trackingUrl,
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
    });
    const safeName = (customer.name || 'customer').replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    return new File([blob], `invoice-${safeName}-${customer.id.slice(-5)}.pdf`, {
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
      onToast('تم تنزيل الفاتورة بصيغة PDF');
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
      const textSummary = [
        `فاتورة ${shopName} (${invoiceNumber})`,
        `العميل: ${customer.name}`,
        `الطلب: ${[customer.frame, customer.lens].filter(Boolean).join(' · ') || 'نظارة طبية'}`,
        `الإجمالي: ${customer.total} ج | المدفوع: ${customer.paid} ج | المتبقي: ${rest > 0 ? `${rest} ج` : 'خالص'}`,
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
            title: `فاتورة ${customer.name} — ${shopName}`,
            text: textSummary,
            files: [pdfFile],
          });
          onToast('تمت مشاركة الفاتورة PDF');
          return;
        }

        await navigator.share({
          title: `فاتورة ${customer.name} — ${shopName}`,
          text: textSummary,
        });
        onToast('تمت مشاركة تفاصيل الفاتورة');
        return;
      }

      // Desktop fallback: download PDF + copy summary
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
      onToast('تم تنزيل الفاتورة PDF ونسخ ملخصها للمشاركة');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      onToast('تعذر المشاركة التلقائية، استخدم زر تنزيل PDF');
    } finally {
      setBusyPdf(false);
    }
  };

  const waInvoiceText = encodeURIComponent(
    [
      `فاتورة من ${shopName} (${invoiceNumber})`,
      `العميل: ${customer.name}`,
      customer.frame ? `الشمبر: ${customer.frame}` : '',
      customer.lens ? `العدسات: ${customer.lens}` : '',
      `المبلغ الكلي: ${customer.total} جنيه`,
      `المدفوع: ${customer.paid} جنيه`,
      `المبلغ المتبقي: ${rest > 0 ? `${rest} جنيه` : 'خالص'}`,
      customer.pickupDate ? `موعد الاستلام: ${formatArabicPickupDate(customer.pickupDate)}` : '',
      `متابعة الطلب: ${trackingUrl}`,
    ]
      .filter(Boolean)
      .join('\n')
  );
  const waPhone = formatEgyptianWhatsAppPhone(customer.phone);
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
        className="invoice-print-dialog w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Action Bar (hidden when printing) */}
        <div className="print:hidden sticky top-0 z-10 bg-white/95 dark:bg-[#15232f]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="invoice-modal-title" className="text-sm sm:text-base font-extrabold">
            فاتورة العميل القابلة للطباعة / PDF
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة / PDF</span>
            </button>
            <button
              type="button"
              disabled={busyPdf}
              onClick={() => void handleDownloadPdf()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Download className="w-4 h-4 text-[#c9a24b]" />
              <span>تنزيل PDF</span>
            </button>
            <button
              type="button"
              disabled={busyPdf}
              onClick={() => void handleSharePdf()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>مشاركة PDF</span>
            </button>
            <a
              href={waInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <MessageCircle className="w-4 h-4" />
              <span>واتساب</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق الفاتورة"
              className="min-h-[38px] min-w-[38px] rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 grid place-items-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Sheet */}
        <div className="p-4 sm:p-6">
          <article className="invoice-print-sheet rounded-2xl border border-slate-200 bg-white text-slate-900 overflow-hidden">
            {/* Invoice Brand Header */}
            <div className="bg-gradient-to-br from-[#c9a24b] to-[#9b7626] text-white px-5 py-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-white/20 grid place-items-center">
                  <Glasses className="w-6 h-6" />
                </span>
                <div>
                  <h3 className="text-xl font-extrabold">{shopName}</h3>
                  <p className="text-xs opacity-90">فاتورة طلب نظارة طبية</p>
                </div>
              </div>
              <div className="text-left text-xs space-y-0.5">
                <div className="font-mono-num font-bold text-sm">{invoiceNumber}</div>
                <div className="opacity-90 tabular-nums">
                  {formatArabicDateTime(customer.date)}
                </div>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Customer & Order Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs sm:text-sm">
                <div>
                  <span className="text-slate-500">اسم العميل: </span>
                  <span className="font-bold text-slate-900">{customer.name}</span>
                </div>
                <div>
                  <span className="text-slate-500">رقم الهاتف: </span>
                  <span className="font-mono-num font-semibold" dir="ltr">
                    {customer.phone || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">نوع الشمبر: </span>
                  <span className="font-semibold">{customer.frame || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">نوع العدسات: </span>
                  <span className="font-semibold">{customer.lens || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">موعد الاستلام: </span>
                  <span className="font-semibold tabular-nums">
                    {customer.pickupDate
                      ? formatArabicPickupDate(customer.pickupDate)
                      : 'غير محدد'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">حالة الطلب: </span>
                  <span className="font-bold text-[#8f6c1e]">{stageLabel}</span>
                </div>
              </div>

              {/* Eye Prescription Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 mb-2">مقاسات النظر</h4>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-center text-xs sm:text-sm font-mono-num" dir="ltr">
                    <thead className="bg-[#e3f2fb] text-[#8f6c1e]">
                      <tr>
                        <th className="py-2 px-3">EYE</th>
                        <th className="py-2 px-3">SPH</th>
                        <th className="py-2 px-3">CYL</th>
                        <th className="py-2 px-3">AXIS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="py-2.5 px-3 font-bold">R</td>
                        {customer.r.map((val, idx) => (
                          <td key={idx} className="py-2.5 px-3">
                            {val}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-bold">L</td>
                        {customer.l.map((val, idx) => (
                          <td key={idx} className="py-2.5 px-3">
                            {val}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals */}
              <div className="grid grid-cols-3 gap-3 text-center tabular-nums">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">المبلغ الكلي</div>
                  <div className="text-base sm:text-lg font-extrabold mt-1">
                    {customer.total} ج
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs text-emerald-800">المدفوع</div>
                  <div className="text-base sm:text-lg font-extrabold text-emerald-700 mt-1">
                    {customer.paid} ج
                  </div>
                </div>
                <div
                  className={`rounded-xl border p-3 ${
                    rest > 0
                      ? 'border-rose-200 bg-rose-50'
                      : 'border-emerald-200 bg-emerald-50'
                  }`}
                >
                  <div
                    className={`text-xs ${
                      rest > 0 ? 'text-rose-800' : 'text-emerald-800'
                    }`}
                  >
                    المبلغ المتبقي
                  </div>
                  <div
                    className={`text-base sm:text-lg font-extrabold mt-1 ${
                      rest > 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {rest > 0 ? `${rest} ج` : 'خالص'}
                  </div>
                </div>
              </div>

              {/* Footer with QR */}
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 text-xs text-slate-600">
                  <p className="font-bold text-slate-900">
                    امسح الكود لمتابعة حالة نظارتك مباشرة
                  </p>
                  <p>شكراً لاختياركم {shopName}</p>
                </div>
                <div className="p-1.5 rounded-xl border border-slate-200 bg-white">
                  <canvas ref={qrCanvasRef} />
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
};
