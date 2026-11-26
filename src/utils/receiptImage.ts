import QRCode from 'qrcode';
import {
  CustomerRecord,
  ORDER_STAGES,
  REPAIR_STAGES,
  RepairRecord,
  USAGE_TYPE_LABELS,
} from '../types/optics';
import {
  buildReceiptImageFilename,
  calculateRemaining,
  formatArabicDateTime,
  formatArabicPickupDate,
} from './optics';

export type ThermalRollWidth = '80mm' | '58mm';

export interface GeneratedReceiptImage {
  file: File;
  blob: Blob;
  dataUrl: string;
  filename: string;
  width: number;
  height: number;
}

async function createQrCanvasForUrl(url: string, size: number): Promise<HTMLCanvasElement | null> {
  if (!url || typeof document === 'undefined') return null;
  const qrCanvas = document.createElement('canvas');
  try {
    await QRCode.toCanvas(qrCanvas, url, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return qrCanvas;
  } catch {
    return null;
  }
}

export async function renderThermalReceiptCanvas(params: {
  customer?: CustomerRecord | null;
  repair?: RepairRecord | null;
  shopName: string;
  trackingUrl: string;
  qrCanvas?: HTMLCanvasElement | null;
  rollWidth?: ThermalRollWidth;
}): Promise<HTMLCanvasElement> {
  const { customer, repair, shopName, trackingUrl, rollWidth = '80mm' } = params;
  const width = rollWidth === '58mm' ? 420 : 576;
  const tempHeight = 1480;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = tempHeight;
  tempCanvas.dir = 'rtl';
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر إنشاء صورة الإيصال');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, tempHeight);

  const isCompact = rollWidth === '58mm';
  const pad = isCompact ? 18 : 26;
  const innerW = width - pad * 2;
  let y = isCompact ? 30 : 38;

  const drawDashedLine = (lineY: number) => {
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(width - pad, lineY);
    ctx.stroke();
    ctx.restore();
  };

  // Shop header
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  ctx.font = `bold ${isCompact ? 26 : 34}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
  ctx.fillText(shopName || 'Mido Optics', width / 2, y);

  y += isCompact ? 26 : 32;
  ctx.fillStyle = '#1e293b';
  ctx.font = `bold ${isCompact ? 16 : 20}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
  ctx.fillText(repair ? 'إيصال استلام تصليح نظارة' : 'إيصال طلب نظارة طبية', width / 2, y);

  y += isCompact ? 22 : 26;
  const code = repair
    ? `REP-${repair.id.slice(-8).toUpperCase()}`
    : `INV-${(customer?.id || '').slice(-8).toUpperCase()}`;
  const dateText = formatArabicDateTime(repair ? repair.date : customer?.date) || '';
  ctx.fillStyle = '#334155';
  ctx.font = `bold ${isCompact ? 13 : 16}px monospace`;
  ctx.fillText(`${code} | ${dateText}`, width / 2, y);

  y += 18;
  drawDashedLine(y);

  const drawKeyValueRow = (label: string, value: string, bold = false, valueColor = '#000000') => {
    y += isCompact ? 26 : 30;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.font = `600 ${isCompact ? 15 : 18}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
    ctx.fillText(label, width - pad, y);

    ctx.textAlign = 'left';
    ctx.fillStyle = valueColor;
    ctx.font = `${bold ? 'bold' : '600'} ${isCompact ? 15 : 18}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
    ctx.fillText(String(value || '—').slice(0, isCompact ? 24 : 32), pad, y);
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
    drawKeyValueRow('حالة التصليح:', stageText, true);
    if (repair.notes) {
      drawKeyValueRow('ملاحظات:', repair.notes);
    }

    y += 18;
    drawDashedLine(y);

    const rest = calculateRemaining(repair.cost, repair.paid);
    drawKeyValueRow('تكلفة التصليح:', `${repair.cost} ج`, true);
    drawKeyValueRow('المدفوع:', `${repair.paid} ج`, true, '#047857');
    drawKeyValueRow(
      'الباقي:',
      rest > 0 ? `${rest} ج` : 'خالص (0 ج)',
      true,
      rest > 0 ? '#be123c' : '#047857'
    );
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
    drawKeyValueRow('الحالة:', stageText, true);

    y += 18;
    drawDashedLine(y);

    // Eye table
    y += 26;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${isCompact ? 15 : 18}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
    ctx.fillText('مقاس النظر (R / L)', width / 2, y);

    y += 12;
    const colW = innerW / 4;
    const rowH = isCompact ? 32 : 36;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, y, innerW, rowH * 3);

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(pad + 1, y + 1, innerW - 2, rowH - 1);

    ctx.direction = 'ltr';
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${isCompact ? 13 : 16}px monospace`;
    ['EYE', 'SPH', 'CYL', 'AXIS'].forEach((h, i) => {
      ctx.fillText(h, pad + colW * i + colW / 2, y + (isCompact ? 21 : 24));
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

      ctx.font = `bold ${isCompact ? 14 : 17}px monospace`;
      ctx.fillText(String(lbl), pad + colW / 2, ry + (isCompact ? 21 : 24));
      (vals as string[]).forEach((v, cIdx) => {
        ctx.font = `600 ${isCompact ? 14 : 17}px monospace`;
        ctx.fillText(v || '-', pad + colW * (cIdx + 1) + colW / 2, ry + (isCompact ? 21 : 24));
      });
    });

    y += rowH * 3;
    if (customer.add) {
      y += 26;
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${isCompact ? 14 : 17}px monospace`;
      ctx.fillText(`ADD (L): ${customer.add}`, width / 2, y);
    }

    y += 18;
    drawDashedLine(y);

    const rest = calculateRemaining(customer.total, customer.paid);
    drawKeyValueRow('المبلغ الكلي:', `${customer.total} ج`, true);
    drawKeyValueRow('المدفوع:', `${customer.paid} ج`, true, '#047857');
    drawKeyValueRow(
      'الباقي:',
      rest > 0 ? `${rest} ج` : 'خالص (0 ج)',
      true,
      rest > 0 ? '#be123c' : '#047857'
    );
  }

  y += 20;
  drawDashedLine(y);

  // QR + Footer
  y += 18;
  const qrSize = isCompact ? 116 : 148;
  const qrToDraw = params.qrCanvas || (await createQrCanvasForUrl(trackingUrl, qrSize));
  if (qrToDraw) {
    ctx.drawImage(qrToDraw, (width - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + 24;
  } else {
    y += 24;
  }

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  ctx.font = `bold ${isCompact ? 15 : 18}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
  ctx.fillText('امسح الكود لمتابعة الحالة خطوة بخطوة', width / 2, y);
  y += 24;
  ctx.fillStyle = '#334155';
  ctx.font = `600 ${isCompact ? 13 : 16}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
  ctx.fillText(`شكراً لتعاملكم مع ${shopName || 'Mido Optics'}`, width / 2, y);

  const finalHeight = Math.min(tempHeight, y + 26);
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = finalHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return tempCanvas;
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, width, finalHeight);
  outCtx.drawImage(tempCanvas, 0, 0, width, finalHeight, 0, 0, width, finalHeight);
  return outCanvas;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<{ blob: Blob; dataUrl: string }> {
  const dataUrl = canvas.toDataURL('image/png');
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve({ blob, dataUrl });
          return;
        }
        const base64 = dataUrl.split(',')[1] || '';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        resolve({ blob: new Blob([bytes], { type: 'image/png' }), dataUrl });
      }, 'image/png');
      return;
    }

    const base64 = dataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    resolve({ blob: new Blob([bytes], { type: 'image/png' }), dataUrl });
  });
}

export async function generateReceiptImageAsset(params: {
  customer?: CustomerRecord | null;
  repair?: RepairRecord | null;
  shopName: string;
  trackingUrl: string;
  qrCanvas?: HTMLCanvasElement | null;
  rollWidth?: ThermalRollWidth;
}): Promise<GeneratedReceiptImage> {
  const canvas = await renderThermalReceiptCanvas(params);
  const { blob, dataUrl } = await canvasToPngBlob(canvas);
  const active = params.repair || params.customer;
  const filename = buildReceiptImageFilename(
    params.repair ? 'repair' : 'customer',
    active?.name || 'customer',
    active?.id || '00000'
  );
  const file = new File([blob], filename, { type: 'image/png' });
  return {
    file,
    blob,
    dataUrl,
    filename,
    width: canvas.width,
    height: canvas.height,
  };
}

export function triggerImageDownload(blobOrFile: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blobOrFile);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

export async function copyReceiptImageToClipboard(blob: Blob): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    typeof ClipboardItem === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== 'function'
  ) {
    return false;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function shareReceiptImageWithLink(params: {
  file: File;
  blob: Blob;
  filename: string;
  title: string;
  message: string;
}): Promise<'shared-file' | 'shared-text' | 'copied-and-downloaded' | 'aborted'> {
  const { file, blob, filename, title, message } = params;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({
          title,
          text: message,
          files: [file],
        });
        return 'shared-file';
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return 'aborted';
    }
  }

  // Fallback for desktop browsers that don't support sharing image files directly:
  // download PNG + copy image (and text) to clipboard so cashier can paste directly into WhatsApp.
  triggerImageDownload(blob, filename);
  const imgCopied = await copyReceiptImageToClipboard(blob);
  if (!imgCopied && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // ignore clipboard denial
    }
  }
  return 'copied-and-downloaded';
}
