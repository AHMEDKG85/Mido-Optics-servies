import {
  CustomerRecord,
  DEFAULT_WA_TEMPLATE,
  EyeLensAvailability,
  EyeTuple,
  LensInventorySnapshot,
  LensSheet,
  ORDER_STAGES,
  PickupReminderSummary,
  PriceItem,
  PriceItemCategory,
  REPAIR_STAGES,
  RepairRecord,
  USAGE_TYPE_LABELS,
  UsageType,
  WEB_PRODUCT_CATEGORY_LABELS,
  WebOrder,
  WebOrderItem,
  WebOrderPrescription,
  WebOrderSource,
  WebOrderStatus,
  WebProduct,
  WebProductCategory,
} from '../types/optics';

export function clampNumber(value: unknown, min = 0, max = 10_000_000): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

export function calculateAutoTotal(
  framePrice: number | string | undefined,
  lensPrice: number | string | undefined
): number {
  return Math.round((clampNumber(framePrice) + clampNumber(lensPrice)) * 100) / 100;
}

export function calculateRemaining(total: number, paid: number): number {
  return Math.round((clampNumber(total) - clampNumber(paid)) * 100) / 100;
}

export function generateToken(length = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function generateCustomerId(): string {
  return `${Date.now()}_${generateToken(4)}`;
}

export function sanitizeEyeTuple(arr: unknown): EyeTuple {
  if (!Array.isArray(arr)) return ['-', '-', '-'];
  const getCell = (idx: number): string => {
    const val = String(arr[idx] ?? '').trim();
    return (val || '-').slice(0, 16);
  };
  return [getCell(0), getCell(1), getCell(2)];
}

export function sanitizeHist(hist: unknown): Array<number | null> {
  if (!Array.isArray(hist)) return [];
  return hist.slice(0, 5).map((item) => {
    if (item === null || item === undefined) return null;
    const num = Number(item);
    return Number.isFinite(num) && num >= 0 ? Math.trunc(num) : null;
  });
}

export function advanceHist(
  currentHist: Array<number | null> | undefined,
  targetStage: number,
  nowMs = Date.now()
): Array<number | null> {
  const stage = Math.max(0, Math.min(ORDER_STAGES.length - 1, Math.trunc(targetStage)));
  const prev = Array.isArray(currentHist) ? currentHist : [];
  const next: Array<number | null> = [];
  for (let i = 0; i < stage; i++) {
    next[i] = prev[i] ?? null;
  }
  next[stage] = nowMs;
  return next;
}

export function formatEgyptianWhatsAppPhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `20${digits.slice(1)}`;
  if (digits.startsWith('1') && digits.length === 10) return `20${digits}`;
  return digits;
}

export function resolvePublicOrigin(origin: string, customBaseUrl?: string): string {
  const trimmedCustom = String(customBaseUrl || '').trim().replace(/\/+$/, '');
  if (trimmedCustom) return trimmedCustom;
  return origin.replace(/\/+$/, '').replace('://ais-dev-', '://ais-pre-');
}

export function buildTrackingUrl(
  origin: string,
  pathname: string,
  tok: string,
  customBaseUrl?: string
): string {
  const trimmedCustom = String(customBaseUrl || '').trim().replace(/\/+$/, '');
  if (trimmedCustom) {
    return `${trimmedCustom}/#track-${tok}`;
  }
  const cleanOrigin = resolvePublicOrigin(origin);
  const cleanPath = pathname === '/' ? '' : pathname.replace(/\/+$/, '');
  return `${cleanOrigin}${cleanPath}/#track-${tok}`;
}

export function renderWhatsAppMessage(params: {
  template?: string;
  customer: Pick<CustomerRecord, 'name' | 'frame' | 'lens' | 'total' | 'paid' | 'status'>;
  trackingUrl: string;
  shopName?: string;
}): string {
  const {
    template = DEFAULT_WA_TEMPLATE,
    customer,
    trackingUrl,
    shopName = 'Mido Optics',
  } = params;
  const stageIndex = Math.max(0, Math.min(ORDER_STAGES.length - 1, customer.status || 0));
  const stageLabel = ORDER_STAGES[stageIndex];
  const remaining = calculateRemaining(customer.total, customer.paid);

  return (template || DEFAULT_WA_TEMPLATE)
    .replaceAll('{name}', customer.name || 'عميلنا العزيز')
    .replaceAll('{status}', stageLabel)
    .replaceAll('{link}', trackingUrl)
    .replaceAll('{frame}', customer.frame || 'الشمبر المختار')
    .replaceAll('{lens}', customer.lens || 'العدسات المختارة')
    .replaceAll('{rest}', String(remaining))
    .replaceAll('{shop}', shopName);
}

export function renderReadyPickupMessage(params: {
  customer: Pick<CustomerRecord, 'name' | 'frame' | 'lens' | 'total' | 'paid'>;
  trackingUrl: string;
  shopName?: string;
}): string {
  const shop = params.shopName || 'Mido Optics';
  const remaining = calculateRemaining(params.customer.total, params.customer.paid);
  const details = [params.customer.frame, params.customer.lens].filter(Boolean).join(' · ');
  const detailsLine = details ? `\nتفاصيل الطلب: ${details}.` : '';
  const paymentLine =
    remaining > 0
      ? `\nالمبلغ المتبقي عند الاستلام: ${remaining} جنيه.`
      : params.customer.total > 0
      ? '\nالمبلغ مسدد بالكامل (خالص).'
      : '';
  return `أهلاً ${params.customer.name || 'عميلنا العزيز'}، يسعدنا إبلاغك بأن نظارتك في ${shop} أصبحت جاهزة للاستلام الآن!${detailsLine}\nمن فضلك توجّه إلى الفرع لاستلام نظارتك.${paymentLine}\nرابط المتابعة:\n${params.trackingUrl}`;
}

export function buildSmsUrl(phone: string, message: string): string {
  const cleanDigits = formatEgyptianWhatsAppPhone(phone);
  const recipient = cleanDigits ? `+${cleanDigits}` : '';
  return `sms:${recipient}?body=${encodeURIComponent(message)}`;
}

export function buildStageWhatsAppDispatch(params: {
  customer: Pick<
    CustomerRecord,
    'name' | 'phone' | 'frame' | 'lens' | 'total' | 'paid' | 'status'
  >;
  trackingUrl: string;
  template?: string;
  shopName?: string;
  forceReadyMessage?: boolean;
}): {
  message: string;
  waUrl: string;
  smsUrl: string;
  isReadyNotification: boolean;
} {
  const isReadyNotification = Boolean(
    params.forceReadyMessage || params.customer.status === 4
  );
  const message = isReadyNotification
    ? renderReadyPickupMessage({
        customer: params.customer,
        trackingUrl: params.trackingUrl,
        shopName: params.shopName,
      })
    : renderWhatsAppMessage({
        template: params.template,
        customer: params.customer,
        trackingUrl: params.trackingUrl,
        shopName: params.shopName,
      });
  const phone = formatEgyptianWhatsAppPhone(params.customer.phone);
  const encoded = encodeURIComponent(message);
  const waUrl = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  const smsUrl = buildSmsUrl(params.customer.phone, message);

  return {
    message,
    waUrl,
    smsUrl,
    isReadyNotification,
  };
}

export function buildWhatsAppUrl(params: {
  customer: Pick<CustomerRecord, 'name' | 'phone' | 'frame' | 'lens' | 'total' | 'paid' | 'status'>;
  trackingUrl: string;
  template?: string;
  shopName?: string;
  preferReadyMessage?: boolean;
}): string {
  if (params.preferReadyMessage !== false && params.customer.status === 4) {
    return buildStageWhatsAppDispatch({
      customer: params.customer,
      trackingUrl: params.trackingUrl,
      template: params.template,
      shopName: params.shopName,
      forceReadyMessage: true,
    }).waUrl;
  }
  const phone = formatEgyptianWhatsAppPhone(params.customer.phone);
  const text = renderWhatsAppMessage(params);
  const encoded = encodeURIComponent(text);
  if (!phone) {
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${phone}?text=${encoded}`;
}

export function sanitizeId(rawId: unknown, fallbackPrefix = 'c'): string {
  const cleaned = String(rawId ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  if (cleaned.length >= 1 && cleaned.length <= 64) return cleaned;
  if (cleaned.length > 64) return cleaned.slice(0, 64);
  return `${fallbackPrefix}_${Date.now()}_${generateToken(4)}`;
}

export function sanitizeToken(rawTok: unknown): string {
  const cleaned = String(rawTok ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length >= 8 && cleaned.length <= 32) return cleaned;
  if (cleaned.length > 32) return cleaned.slice(0, 32);
  return generateToken(10);
}

export function sanitizePickupDate(rawDate: unknown): string {
  const cleaned = String(rawDate ?? '').trim();
  if (!cleaned) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (
      dt.getFullYear() === y &&
      dt.getMonth() === m - 1 &&
      dt.getDate() === d
    ) {
      return cleaned;
    }
  }
  return '';
}

export type PickupUrgencyLevel = 'none' | 'overdue' | 'today' | 'soon' | 'upcoming';

export interface PickupUrgencyInfo {
  level: PickupUrgencyLevel;
  daysLeft: number | null;
  label: string;
}

export function getPickupUrgency(
  pickupDate: string,
  delivered = false,
  now = new Date()
): PickupUrgencyInfo {
  const clean = sanitizePickupDate(pickupDate);
  if (!clean || delivered) {
    return { level: 'none', daysLeft: null, label: '' };
  }
  const [y, m, d] = clean.split('-').map(Number);
  const targetMidnight = new Date(y, m - 1, d).getTime();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const daysLeft = Math.round((targetMidnight - todayMidnight) / 86_400_000);

  if (daysLeft < 0) {
    const abs = Math.abs(daysLeft);
    return {
      level: 'overdue',
      daysLeft,
      label: abs === 1 ? 'تأخر عن موعد التسليم بيوم' : `تأخر عن موعد التسليم بـ ${abs} أيام`,
    };
  }
  if (daysLeft === 0) {
    return { level: 'today', daysLeft: 0, label: 'موعد التسليم اليوم' };
  }
  if (daysLeft === 1) {
    return { level: 'soon', daysLeft: 1, label: 'اقترب التسليم: غداً' };
  }
  if (daysLeft === 2) {
    return { level: 'soon', daysLeft: 2, label: 'اقترب التسليم: خلال يومين' };
  }
  return {
    level: 'upcoming',
    daysLeft,
    label: `متبقي ${daysLeft} أيام على التسليم`,
  };
}

export function formatArabicPickupDate(dateStr: string): string {
  const clean = sanitizePickupDate(dateStr);
  if (!clean) return '';
  const [y, m, d] = clean.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function sanitizeFramePhoto(rawPhoto: unknown): string {
  const str = String(rawPhoto ?? '');
  return str.startsWith('data:image/') && str.length <= 350_000 ? str : '';
}

export function sanitizeAddPower(raw: unknown): string {
  return String(raw ?? '').trim().slice(0, 16);
}

export function normalizeUsageType(raw: unknown): UsageType {
  if (raw === 'distance' || raw === 'reading') {
    return raw;
  }
  return '';
}

export function normalizeCustomerRecord(raw: unknown): CustomerRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const name = String(obj.name ?? '').trim().slice(0, 120);
  if (!name) return null;

  const rawDate = String(obj.date ?? '').trim();
  const parsedDate = rawDate && !Number.isNaN(Date.parse(rawDate))
    ? new Date(rawDate).toISOString().slice(0, 40)
    : new Date().toISOString();

  const statusNum = Math.trunc(clampNumber(obj.status, 0, ORDER_STAGES.length - 1));
  const safePhoto = sanitizeFramePhoto(obj.photo);

  const hist = sanitizeHist(obj.hist);
  if (hist.length === 0) {
    hist[0] = Date.parse(parsedDate) || Date.now();
  }

  return {
    id: sanitizeId(obj.id),
    ownerId: obj.ownerId ? String(obj.ownerId).slice(0, 128) : undefined,
    date: parsedDate,
    name,
    phone: String(obj.phone ?? '').trim().slice(0, 30),
    frame: String(obj.frame ?? '').trim().slice(0, 120),
    lens: String(obj.lens ?? '').trim().slice(0, 120),
    framePrice: clampNumber(obj.framePrice),
    lensPrice: clampNumber(obj.lensPrice),
    total: clampNumber(obj.total),
    paid: clampNumber(obj.paid),
    photo: safePhoto,
    r: sanitizeEyeTuple(obj.r),
    l: sanitizeEyeTuple(obj.l),
    add: sanitizeAddPower(obj.add),
    usageType: normalizeUsageType(obj.usageType),
    status: statusNum,
    hist,
    tok: sanitizeToken(obj.tok),
    pickupDate: sanitizePickupDate(obj.pickupDate),
    delivered: Boolean(obj.delivered),
  };
}

export function applyCustomerDeliverySettlement(
  record: CustomerRecord,
  nowMs = Date.now()
): CustomerRecord {
  const safeTotal = clampNumber(record.total);
  const safePaid = clampNumber(record.paid);
  return {
    ...record,
    status: 4,
    hist: record.status >= 4 ? record.hist : advanceHist(record.hist, 4, nowMs),
    paid: Math.max(safePaid, safeTotal),
    delivered: true,
  };
}

export function applyRepairDeliverySettlement(
  record: RepairRecord,
  nowMs = Date.now()
): RepairRecord {
  const safeCost = clampNumber(record.cost);
  const safePaid = clampNumber(record.paid);
  return {
    ...record,
    status: 4,
    hist: record.status >= 4 ? record.hist : advanceHist(record.hist, 4, nowMs),
    paid: Math.max(safePaid, safeCost),
    delivered: true,
  };
}

export function formatArabicDateTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

export const SAMPLE_CUSTOMERS: CustomerRecord[] = [
  {
    id: 'demo_1795651001',
    date: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    name: 'أحمد محمود حسن',
    phone: '01012345678',
    frame: 'Ray-Ban Meta Classic',
    lens: 'Blue Cut Anti-Reflection',
    total: 1850,
    paid: 1200,
    photo: '',
    r: ['-1.25', '-0.50', '90'],
    l: ['-1.50', '-0.25', '85'],
    status: 3,
    hist: [
      Date.now() - 86_400_000 * 2,
      Date.now() - 86_400_000 * 1.5,
      Date.now() - 86_400_000,
      Date.now() - 3_600_000 * 5,
    ],
    tok: 'demo7x9k2m',
    pickupDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    delivered: false,
  },
  {
    id: 'demo_1795651002',
    date: new Date(Date.now() - 86_400_000).toISOString(),
    name: 'سارة علي إبراهيم',
    phone: '01122334455',
    frame: 'Tom Ford Acetate Gold',
    lens: 'Transitions Gen 8',
    total: 2600,
    paid: 2600,
    photo: '',
    r: ['-2.00', '-', '-'],
    l: ['-1.75', '-0.50', '175'],
    status: 4,
    hist: [
      Date.now() - 86_400_000,
      Date.now() - 72_000_000,
      Date.now() - 50_000_000,
      Date.now() - 25_000_000,
      Date.now() - 7_200_000,
    ],
    tok: 'demo4p8q1w',
    pickupDate: new Date().toISOString().slice(0, 10),
    delivered: false,
  },
];

export interface OrderReadinessStats {
  totalOrders: number;
  readyCount: number;
  inProgressCount: number;
  totalRevenue: number;
  totalCollected: number;
  totalRemaining: number;
  readinessComparison: Array<{ name: string; value: number; fill: string }>;
  stageBreakdown: Array<{ stage: string; count: number }>;
}

export function calculateOrderReadinessStats(
  customers: CustomerRecord[]
): OrderReadinessStats {
  let readyCount = 0;
  let inProgressCount = 0;
  let totalRevenue = 0;
  let totalCollected = 0;
  const stageCounts = new Array<number>(ORDER_STAGES.length).fill(0);

  for (const c of customers) {
    const s = Math.max(0, Math.min(ORDER_STAGES.length - 1, Math.trunc(c.status || 0)));
    stageCounts[s] += 1;
    if (s >= 4) {
      readyCount += 1;
    } else {
      inProgressCount += 1;
    }
    totalRevenue += clampNumber(c.total);
    totalCollected += clampNumber(c.paid);
  }

  return {
    totalOrders: customers.length,
    readyCount,
    inProgressCount,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCollected: Math.round(totalCollected * 100) / 100,
    totalRemaining: Math.round((totalRevenue - totalCollected) * 100) / 100,
    readinessComparison: [
      { name: 'جاهزة للاستلام', value: readyCount, fill: '#15935a' },
      { name: 'تحت التنفيذ', value: inProgressCount, fill: '#c9a24b' },
    ],
    stageBreakdown: ORDER_STAGES.map((stage, idx) => ({
      stage,
      count: stageCounts[idx],
    })),
  };
}

export interface MonthlyCustomerGrowthPoint {
  monthKey: string;
  monthLabel: string;
  count: number;
  growthPercent: number | null;
}

export function calculateMonthlyCustomerGrowth(
  customers: CustomerRecord[]
): MonthlyCustomerGrowthPoint[] {
  const buckets = new Map<string, number>();

  for (const c of customers) {
    const dt = new Date(c.date);
    if (Number.isNaN(dt.getTime())) continue;
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const key = `${year}-${month}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  const sortedKeys = Array.from(buckets.keys()).sort();
  return sortedKeys.map((monthKey, idx) => {
    const count = buckets.get(monthKey) || 0;
    const [y, m] = monthKey.split('-').map(Number);
    const labelDate = new Date(y, m - 1, 1);
    const monthLabel = labelDate.toLocaleDateString('ar-EG', {
      month: 'short',
      year: 'numeric',
    });

    let growthPercent: number | null = null;
    if (idx > 0) {
      const prevCount = buckets.get(sortedKeys[idx - 1]) || 0;
      if (prevCount > 0) {
        growthPercent = Math.round(((count - prevCount) / prevCount) * 1000) / 10;
      }
    }

    return {
      monthKey,
      monthLabel,
      count,
      growthPercent,
    };
  });
}

export interface AuthErrorSummary {
  code: string;
  title: string;
  details: string;
  isUnauthorizedDomain: boolean;
  hostname: string;
}

export function formatFirebaseAuthError(
  error: unknown,
  hostname = ''
): AuthErrorSummary {
  const errObj =
    error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : {};
  const rawCode = typeof errObj.code === 'string' ? errObj.code : '';
  const rawMessage =
    typeof errObj.message === 'string' ? errObj.message : String(error || '');
  const cleanHost = hostname.trim();

  if (rawCode === 'auth/unauthorized-domain' || rawMessage.includes('unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      title: 'هذا الرابط غير مُصرّح له بتسجيل الدخول في Firebase',
      details: cleanHost
        ? `أضف النطاق (${cleanHost}) داخل Firebase Console ← Authentication ← Settings ← Authorized domains ثم أعد المحاولة.`
        : 'أضف رابط الموقع الحالي داخل Firebase Console ← Authentication ← Settings ← Authorized domains ثم أعد المحاولة.',
      isUnauthorizedDomain: true,
      hostname: cleanHost,
    };
  }

  if (rawCode === 'auth/popup-blocked') {
    return {
      code: rawCode,
      title: 'المتصفح منع نافذة تسجيل الدخول',
      details: 'اسمح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع من إعدادات المتصفح ثم اضغط «ربط الحساب» مرة أخرى.',
      isUnauthorizedDomain: false,
      hostname: cleanHost,
    };
  }

  if (
    rawCode === 'auth/popup-closed-by-user' ||
    rawCode === 'auth/cancelled-popup-request'
  ) {
    return {
      code: rawCode,
      title: 'تم إغلاق نافذة تسجيل الدخول',
      details: 'أبقِ نافذة Google مفتوحة حتى يكتمل اختيار الحساب والربط.',
      isUnauthorizedDomain: false,
      hostname: cleanHost,
    };
  }

  if (rawCode === 'auth/operation-not-allowed') {
    return {
      code: rawCode,
      title: 'تسجيل الدخول بـ Google غير مفعّل',
      details: 'فعّل موفر Google من Firebase Console ← Authentication ← Sign-in method.',
      isUnauthorizedDomain: false,
      hostname: cleanHost,
    };
  }

  if (rawCode === 'auth/network-request-failed') {
    return {
      code: rawCode,
      title: 'تعذر الاتصال بخدمة الحسابات',
      details: 'تأكد من اتصالك بالإنترنت وأعد المحاولة.',
      isUnauthorizedDomain: false,
      hostname: cleanHost,
    };
  }

  if (rawCode === 'auth/invalid-api-key' || rawCode === 'auth/app-not-authorized') {
    return {
      code: rawCode,
      title: 'إعدادات Firebase غير متطابقة',
      details: `تحقق من ملف firebase-applet-config.json أو صلاحيات المفتاح (${rawCode}).`,
      isUnauthorizedDomain: false,
      hostname: cleanHost,
    };
  }

  return {
    code: rawCode || 'auth/unknown',
    title: 'تعذر ربط الحساب',
    details: rawCode
      ? `رمز الخطأ: ${rawCode} — تأكد من السماح بالنوافذ المنبثقة وإعدادات النطاق في Firebase.`
      : rawMessage || 'حدث خطأ غير متوقع أثناء ربط الحساب.',
    isUnauthorizedDomain: false,
    hostname: cleanHost,
  };
}

export function collectPickupReminders(
  customers: CustomerRecord[],
  now = new Date(),
  shopName = 'Mido Optics'
): PickupReminderSummary {
  const overdue: CustomerRecord[] = [];
  const today: CustomerRecord[] = [];
  const soon: CustomerRecord[] = [];

  for (const c of customers) {
    if (c.delivered || !c.pickupDate) continue;
    const urgency = getPickupUrgency(c.pickupDate, false, now);
    if (urgency.level === 'overdue') overdue.push(c);
    else if (urgency.level === 'today') today.push(c);
    else if (urgency.level === 'soon') soon.push(c);
  }

  const totalDueCount = overdue.length + today.length;
  const parts: string[] = [];
  if (overdue.length > 0) {
    parts.push(
      overdue.length === 1
        ? `طلب واحد متأخر عن التسليم (${overdue[0].name})`
        : `${overdue.length} طلبات متأخرة عن التسليم (${overdue
            .slice(0, 2)
            .map((c) => c.name)
            .join('، ')})`
    );
  }
  if (today.length > 0) {
    parts.push(
      today.length === 1
        ? `طلب واحد موعد تسليمه اليوم (${today[0].name})`
        : `${today.length} طلبات موعد تسليمها اليوم (${today
            .slice(0, 2)
            .map((c) => c.name)
            .join('، ')})`
    );
  }

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dayKey = `${yyyy}-${mm}-${dd}`;
  const overdueIds = overdue.map((c) => c.id).sort().join(',');
  const todayIds = today.map((c) => c.id).sort().join(',');

  return {
    overdue,
    today,
    soon,
    totalDueCount,
    title:
      totalDueCount > 0
        ? `تنبيه مواعيد التسليم — ${shopName || 'Mido Optics'}`
        : `مواعيد التسليم — ${shopName || 'Mido Optics'}`,
    body:
      parts.length > 0
        ? parts.join(' • ')
        : 'لا توجد طلبات متأخرة أو مستحقة التسليم اليوم.',
    signature: `${dayKey}|o:${overdueIds}|t:${todayIds}`,
  };
}

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export interface ParsedLensPower {
  isEmpty: boolean;
  isValid: boolean;
  isPlano: boolean;
  sign: '+' | '-' | '0';
  num: number;
  magnitudeKey: string;
}

export function normalizeLensPowerValue(raw: string): ParsedLensPower {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[٠-٩]/g, (ch) => String(ARABIC_INDIC_DIGITS.indexOf(ch)))
    .replace(/[٫،,]/g, '.')
    .replace(/\s+/g, '');

  if (!cleaned || cleaned === '-') {
    return {
      isEmpty: true,
      isValid: true,
      isPlano: true,
      sign: '0',
      num: 0,
      magnitudeKey: 'plano',
    };
  }

  const lower = cleaned.toLowerCase();
  if (lower === 'plano' || lower === 'pl' || lower === '0' || lower === '0.0' || lower === '0.00' || lower === '+0' || lower === '-0' || lower === '+0.00' || lower === '-0.00') {
    return {
      isEmpty: false,
      isValid: true,
      isPlano: true,
      sign: '0',
      num: 0,
      magnitudeKey: 'plano',
    };
  }

  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(cleaned)) {
    return {
      isEmpty: false,
      isValid: false,
      isPlano: false,
      sign: '0',
      num: 0,
      magnitudeKey: '',
    };
  }

  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num)) {
    return {
      isEmpty: false,
      isValid: false,
      isPlano: false,
      sign: '0',
      num: 0,
      magnitudeKey: '',
    };
  }

  if (Math.abs(num) < 1e-6) {
    return {
      isEmpty: false,
      isValid: true,
      isPlano: true,
      sign: '0',
      num: 0,
      magnitudeKey: 'plano',
    };
  }

  return {
    isEmpty: false,
    isValid: true,
    isPlano: false,
    sign: num < 0 ? '-' : '+',
    num,
    magnitudeKey: Math.abs(num).toFixed(2),
  };
}

export type LensSheetPolarity = 'minus' | 'plus' | 'mix' | 'any';

export function inferExpectedPolarity(
  sphSign: '+' | '-' | '0',
  cylSign: '+' | '-' | '0'
): LensSheetPolarity {
  if (sphSign === '0' && cylSign === '0') return 'any';
  if (sphSign !== '0' && cylSign !== '0' && sphSign !== cylSign) return 'mix';
  if (sphSign === '-' || cylSign === '-') return 'minus';
  return 'plus';
}

function detectSheetPolarity(sheetId: string, sheetName: string): LensSheetPolarity {
  const idLower = sheetId.toLowerCase();
  const nameLower = sheetName.toLowerCase();
  if (idLower === 'mix' || /\bmix\b/.test(nameLower)) return 'mix';
  if (
    idLower === 'plus' ||
    /\(\+\)|\+\s*b-?n|\bplus\b/.test(nameLower)
  ) {
    return 'plus';
  }
  if (
    idLower === 'minus' ||
    /\(-\)|-\s*b-?n|\bminus\b/.test(nameLower)
  ) {
    return 'minus';
  }
  return 'any';
}

export function normalizeLensInventorySnapshot(
  raw: unknown,
  source: 'cloud' | 'json' = 'json'
): LensInventorySnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new Error('صيغة بيانات مخزن العدسات غير صالحة');
  }
  const obj = raw as Record<string, unknown>;
  if (!obj.sheets || typeof obj.sheets !== 'object') {
    throw new Error('ملف مخزن العدسات لا يحتوي على صفحات (sheets)');
  }

  const rawSheets = obj.sheets as Record<string, unknown>;
  const sheets: Record<string, LensSheet> = {};

  for (const [sheetId, sheetVal] of Object.entries(rawSheets)) {
    if (!sheetVal || typeof sheetVal !== 'object') continue;
    const s = sheetVal as Record<string, unknown>;
    const rawQ = (s.q && typeof s.q === 'object' ? s.q : s.quantities) as
      | Record<string, unknown>
      | undefined;
    const q: Record<string, number> = {};
    if (rawQ && typeof rawQ === 'object') {
      for (const [k, v] of Object.entries(rawQ)) {
        const qty = Math.floor(Number(v) || 0);
        if (qty > 0 && k.includes('|')) {
          q[k] = qty;
        }
      }
    }
    sheets[sheetId] = {
      id: sheetId,
      name: String(s.name || sheetId).slice(0, 60),
      rows: Array.isArray(s.rows) ? s.rows.map((r) => String(r)) : [],
      cols: Array.isArray(s.cols) ? s.cols.map((c) => String(c)) : [],
      q,
    };
  }

  const rawOrder = Array.isArray(obj.sheetOrder)
    ? obj.sheetOrder.map((x) => String(x)).filter((id) => id in sheets)
    : [];
  const defaultOrder = ['minus', 'plus', 'mix'].filter((id) => id in sheets);
  const sheetOrder = Array.from(
    new Set([...rawOrder, ...defaultOrder, ...Object.keys(sheets)])
  );

  const lowThresholds: Record<string, number> = {};
  const rawThresholds =
    obj.lowThresholds && typeof obj.lowThresholds === 'object'
      ? (obj.lowThresholds as Record<string, unknown>)
      : {};
  for (const id of sheetOrder) {
    const val = Math.floor(Number(rawThresholds[id]) || 2);
    lowThresholds[id] = Math.max(1, Math.min(1000, val));
  }

  return {
    sheets,
    sheetOrder,
    lowThresholds,
    updatedAt: typeof obj._t === 'number' ? obj._t : Date.now(),
    source,
  };
}

export function parseLensInventoryBackupJson(rawText: string): LensInventorySnapshot {
  const parsed = JSON.parse(rawText);
  return normalizeLensInventorySnapshot(parsed, 'json');
}

export function summarizeLensInventory(snapshot: LensInventorySnapshot | null): {
  sheetCount: number;
  stockedPowersCount: number;
  totalUnits: number;
} {
  if (!snapshot) {
    return { sheetCount: 0, stockedPowersCount: 0, totalUnits: 0 };
  }
  let stockedPowersCount = 0;
  let totalUnits = 0;
  for (const id of snapshot.sheetOrder) {
    const sheet = snapshot.sheets[id];
    if (!sheet) continue;
    for (const qty of Object.values(sheet.q)) {
      if (qty > 0) {
        stockedPowersCount += 1;
        totalUnits += qty;
      }
    }
  }
  return {
    sheetCount: snapshot.sheetOrder.length,
    stockedPowersCount,
    totalUnits,
  };
}

function lookupDirectInSnapshot(
  snapshot: LensInventorySnapshot,
  sphKey: string,
  cylKey: string,
  polarity: LensSheetPolarity
): { sheetId: string; sheetName: string; qty: number; threshold: number } | null {
  const cellKey = `${sphKey}|${cylKey}`;
  const orderedIds = snapshot.sheetOrder.filter((id) => id in snapshot.sheets);

  const matchingSheets = orderedIds.filter((id) => {
    if (polarity === 'any') return true;
    const sheet = snapshot.sheets[id];
    const sheetPolarity = detectSheetPolarity(id, sheet.name);
    return sheetPolarity === polarity || sheetPolarity === 'any';
  });

  let best: { sheetId: string; sheetName: string; qty: number; threshold: number } | null = null;
  for (const id of matchingSheets) {
    const sheet = snapshot.sheets[id];
    const qty = Math.floor(Number(sheet.q[cellKey]) || 0);
    const threshold = snapshot.lowThresholds[id] ?? 2;
    if (qty > 0 && (!best || qty > best.qty)) {
      best = { sheetId: id, sheetName: sheet.name, qty, threshold };
    }
  }
  return best;
}

export function checkEyeLensAvailability(
  eye: 'R' | 'L',
  tuple: EyeTuple,
  inventory: LensInventorySnapshot | null
): EyeLensAvailability {
  const parsedSph = normalizeLensPowerValue(tuple[0] ?? '');
  const parsedCyl = normalizeLensPowerValue(tuple[1] ?? '');

  if (parsedSph.isEmpty && parsedCyl.isEmpty) {
    return {
      eye,
      status: 'empty',
      sph: '-',
      cyl: '-',
      qty: 0,
      threshold: 2,
      message: 'أدخل مقاس العين للتحقق من المخزن',
    };
  }

  if (!parsedSph.isValid || !parsedCyl.isValid) {
    return {
      eye,
      status: 'invalid',
      sph: tuple[0] || '-',
      cyl: tuple[1] || '-',
      qty: 0,
      threshold: 2,
      message: 'صيغة المقاس غير واضحة (مثال: -1.25)',
    };
  }

  // If SPH was left empty while CYL was filled, treat SPH as plano (0.00)
  const effectiveSph = parsedSph.isEmpty
    ? { isEmpty: false, isValid: true, isPlano: true, sign: '0' as const, num: 0, magnitudeKey: 'plano' }
    : parsedSph;
  const effectiveCyl = parsedCyl.isEmpty
    ? { isEmpty: false, isValid: true, isPlano: true, sign: '0' as const, num: 0, magnitudeKey: 'plano' }
    : parsedCyl;

  if (!inventory) {
    return {
      eye,
      status: 'no-inventory',
      sph: effectiveSph.magnitudeKey,
      cyl: effectiveCyl.magnitudeKey,
      qty: 0,
      threshold: 2,
      message: 'اربط مخزن العدسات لمعرفة التوفر تلقائياً',
    };
  }

  const polarity = inferExpectedPolarity(effectiveSph.sign, effectiveCyl.sign);
  const directMatch = lookupDirectInSnapshot(
    inventory,
    effectiveSph.magnitudeKey,
    effectiveCyl.magnitudeKey,
    polarity
  );

  if (directMatch) {
    const isLow = directMatch.qty <= directMatch.threshold;
    return {
      eye,
      status: isLow ? 'low-stock' : 'in-stock',
      sph: effectiveSph.magnitudeKey,
      cyl: effectiveCyl.magnitudeKey,
      sheetId: directMatch.sheetId,
      sheetName: directMatch.sheetName,
      qty: directMatch.qty,
      threshold: directMatch.threshold,
      transposed: false,
      message: isLow
        ? `مخزون منخفض (${directMatch.qty} قطعة — ${directMatch.sheetName})`
        : `متوفر في المخزن (${directMatch.qty} قطعة — ${directMatch.sheetName})`,
    };
  }

  // Check optical transposition when CYL is non-zero (newSph = sph + cyl, newCyl = -cyl)
  if (!effectiveCyl.isPlano) {
    const tSphNum = Math.round((effectiveSph.num + effectiveCyl.num) * 100) / 100;
    const tCylNum = Math.round(-effectiveCyl.num * 100) / 100;
    const tSphSign: '+' | '-' | '0' = Math.abs(tSphNum) < 1e-6 ? '0' : tSphNum < 0 ? '-' : '+';
    const tCylSign: '+' | '-' | '0' = Math.abs(tCylNum) < 1e-6 ? '0' : tCylNum < 0 ? '-' : '+';
    const tSphKey = tSphSign === '0' ? 'plano' : Math.abs(tSphNum).toFixed(2);
    const tCylKey = tCylSign === '0' ? 'plano' : Math.abs(tCylNum).toFixed(2);
    const tPolarity = inferExpectedPolarity(tSphSign, tCylSign);

    const transposedMatch = lookupDirectInSnapshot(
      inventory,
      tSphKey,
      tCylKey,
      tPolarity
    );

    if (transposedMatch) {
      const isLow = transposedMatch.qty <= transposedMatch.threshold;
      return {
        eye,
        status: isLow ? 'low-stock' : 'in-stock',
        sph: tSphKey,
        cyl: tCylKey,
        sheetId: transposedMatch.sheetId,
        sheetName: transposedMatch.sheetName,
        qty: transposedMatch.qty,
        threshold: transposedMatch.threshold,
        transposed: true,
        message: isLow
          ? `متوفر بالتدوير (${transposedMatch.qty} قطعة — ${transposedMatch.sheetName})`
          : `متوفر في المخزن بالتدوير (${transposedMatch.qty} قطعة — ${transposedMatch.sheetName})`,
      };
    }
  }

  return {
    eye,
    status: 'order-needed',
    sph: effectiveSph.magnitudeKey,
    cyl: effectiveCyl.magnitudeKey,
    qty: 0,
    threshold: 2,
    message: 'غير متوفر في المخزن — اطلبها من الشركة',
  };
}

export function buildReceiptImageFilename(
  kind: 'customer' | 'repair',
  name: string,
  id: string
): string {
  const safeName =
    String(name || '')
      .trim()
      .replace(/[^\w\u0600-\u06FF-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'customer';
  const suffix = String(id || '').slice(-5) || '00000';
  const prefix = kind === 'repair' ? 'repair-receipt' : 'receipt';
  return `${prefix}-${safeName}-${suffix}.png`;
}

export function buildReceiptShareSummary(params: {
  customer?: CustomerRecord | null;
  repair?: RepairRecord | null;
  shopName?: string;
  trackingUrl: string;
}): string {
  const { customer, repair, shopName = 'Mido Optics', trackingUrl } = params;
  if (repair) {
    const invoiceNumber = `REP-${repair.id.slice(-8).toUpperCase()}`;
    const rest = calculateRemaining(repair.cost, repair.paid);
    return [
      `إيصال تصليح من ${shopName} (${invoiceNumber})`,
      `العميل: ${repair.name}`,
      repair.glassesType ? `نوع النظارة: ${repair.glassesType}` : '',
      repair.weldingType ? `نوع اللحام: ${repair.weldingType}` : '',
      repair.representativeName ? `اسم المندوب: ${repair.representativeName}` : '',
      `التكلفة: ${repair.cost} جنيه | المدفوع: ${repair.paid} جنيه | المتبقي: ${
        rest > 0 ? `${rest} جنيه` : 'خالص'
      }`,
      `متابعة التصليح: ${trackingUrl}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (customer) {
    const invoiceNumber = `INV-${customer.id.slice(-8).toUpperCase()}`;
    const rest = calculateRemaining(customer.total, customer.paid);
    const details = [customer.frame, customer.lens].filter(Boolean).join(' · ');
    return [
      `فاتورة من ${shopName} (${invoiceNumber})`,
      `العميل: ${customer.name}`,
      customer.usageType ? `الاستخدام: ${USAGE_TYPE_LABELS[customer.usageType]}` : '',
      details ? `الطلب: ${details}` : '',
      `الإجمالي: ${customer.total} جنيه | المدفوع: ${customer.paid} جنيه | المتبقي: ${
        rest > 0 ? `${rest} جنيه` : 'خالص'
      }`,
      `متابعة الطلب: ${trackingUrl}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return `رابط المتابعة:\n${trackingUrl}`;
}

export function buildSinglePagePdfFromJpeg(params: {
  jpegBytes: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  paperFormat?: 'a4' | 'thermal-80mm';
}): Uint8Array {
  const { jpegBytes, imageWidth, imageHeight, paperFormat = 'a4' } = params;
  const safeW = Math.max(1, imageWidth);
  const safeH = Math.max(1, imageHeight);
  const isThermal = paperFormat === 'thermal-80mm';
  // 80mm thermal roll width = 226.77pt
  const pageWidth = isThermal ? 226.77 : 595.28;
  const margin = isThermal ? 6 : 20;
  const availW = pageWidth - margin * 2;
  const pageHeight = isThermal
    ? Math.max(240, Math.round((availW * (safeH / safeW) + margin * 2) * 100) / 100)
    : 841.89;
  const availH = pageHeight - margin * 2;
  const scale = Math.min(availW / safeW, availH / safeH);
  const drawW = safeW * scale;
  const drawH = safeH * scale;
  const offsetX = (pageWidth - drawW) / 2;
  const offsetY = pageHeight - margin - drawH;

  const contentStream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  const encoder = new TextEncoder();

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let byteLength = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteLength += bytes.length;
  };
  const pushText = (text: string) => {
    pushBytes(encoder.encode(text));
  };

  pushText('%PDF-1.4\n');
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1: Catalog
  offsets.push(byteLength);
  pushText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  offsets.push(byteLength);
  pushText('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: Page
  offsets.push(byteLength);
  pushText(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  // 4: Image XObject
  offsets.push(byteLength);
  pushText(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(safeW)} /Height ${Math.round(safeH)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushText('\nendstream\nendobj\n');

  // 5: Content stream
  const contentBytes = encoder.encode(contentStream);
  offsets.push(byteLength);
  pushText(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushText('endstream\nendobj\n');

  // XRef table
  const xrefStart = byteLength;
  pushText(`xref\n0 ${offsets.length}\n`);
  pushText('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    pushText(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushText(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  );

  const out = new Uint8Array(byteLength);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

export function filterArchivedOrders(
  customers: CustomerRecord[],
  query = ''
): CustomerRecord[] {
  const trimmed = query.trim().toLowerCase();
  return customers
    .filter((c) => {
      if (!c.delivered) return false;
      if (!trimmed) return true;
      return (
        c.name.toLowerCase().includes(trimmed) ||
        c.phone.toLowerCase().includes(trimmed) ||
        c.frame.toLowerCase().includes(trimmed) ||
        c.lens.toLowerCase().includes(trimmed) ||
        c.tok.toLowerCase().includes(trimmed)
      );
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function generatePriceItemId(): string {
  return `p_${Date.now()}_${generateToken(4)}`;
}

export function normalizePriceCategory(raw: unknown): PriceItemCategory {
  if (raw === 'frame' || raw === 'lens' || raw === 'service') {
    return raw;
  }
  return 'frame';
}

export function normalizePriceItem(raw: unknown): PriceItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const name = String(obj.name ?? '').trim().slice(0, 120);
  if (!name) return null;

  const createdAtMs =
    typeof obj.createdAtMs === 'number' && Number.isFinite(obj.createdAtMs) && obj.createdAtMs >= 0
      ? Math.trunc(obj.createdAtMs)
      : Date.now();
  const updatedAtMs =
    typeof obj.updatedAtMs === 'number' && Number.isFinite(obj.updatedAtMs) && obj.updatedAtMs >= 0
      ? Math.trunc(obj.updatedAtMs)
      : createdAtMs;

  const category = normalizePriceCategory(obj.category);

  return {
    id: sanitizeId(obj.id, 'p'),
    ownerId: obj.ownerId ? String(obj.ownerId).slice(0, 128) : undefined,
    name,
    category,
    price: clampNumber(obj.price),
    notes: String(obj.notes ?? '').trim().slice(0, 240),
    photo: category === 'frame' ? sanitizeFramePhoto(obj.photo) : '',
    createdAtMs,
    updatedAtMs,
  };
}

export function filterPriceItems(
  items: PriceItem[],
  category: PriceItemCategory | 'all' = 'all',
  query = ''
): PriceItem[] {
  const trimmed = query.trim().toLowerCase();
  return items
    .filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!trimmed) return true;
      return (
        item.name.toLowerCase().includes(trimmed) ||
        item.notes.toLowerCase().includes(trimmed)
      );
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export const STARTER_PRICE_ITEMS: PriceItem[] = [
  {
    id: 'starter_frame_tr90',
    name: 'شمبر TR90 مرن ضد الكسر',
    category: 'frame',
    price: 450,
    notes: 'خفيف الوزن ومناسب للاستخدام اليومي',
    createdAtMs: 1764000001000,
    updatedAtMs: 1764000001000,
  },
  {
    id: 'starter_frame_metal',
    name: 'شمبر معدن كلاسيك',
    category: 'frame',
    price: 650,
    notes: 'وسادات أنف سيليكون مريحة',
    createdAtMs: 1764000002000,
    updatedAtMs: 1764000002000,
  },
  {
    id: 'starter_frame_acetate',
    name: 'شمبر أسيتات براند',
    category: 'frame',
    price: 1200,
    notes: 'خامة فاخرة مع جراب ومنديل',
    createdAtMs: 1764000003000,
    updatedAtMs: 1764000003000,
  },
  {
    id: 'starter_lens_ar',
    name: 'عدسات انتي ريفليكشن (Anti-Reflection)',
    category: 'lens',
    price: 350,
    notes: 'ضد الانعكاس والخدش — 1.56',
    createdAtMs: 1764000004000,
    updatedAtMs: 1764000004000,
  },
  {
    id: 'starter_lens_bluecut',
    name: 'عدسات Blue Cut للحماية من الشاشات',
    category: 'lens',
    price: 480,
    notes: 'فلتر الضوء الأزرق والأشعة فوق البنفسجية',
    createdAtMs: 1764000005000,
    updatedAtMs: 1764000005000,
  },
  {
    id: 'starter_lens_photo',
    name: 'عدسات فوتوكروميك (تتلون بالشمس)',
    category: 'lens',
    price: 1100,
    notes: 'تتكيف تلقائياً مع إضاءة الشمس',
    createdAtMs: 1764000006000,
    updatedAtMs: 1764000006000,
  },
  {
    id: 'starter_service_solder',
    name: 'لحام ليزر للشمبر وتعديل الأذرع',
    category: 'service',
    price: 150,
    notes: 'صيانة سريعة للشمبرات المعدن',
    createdAtMs: 1764000007000,
    updatedAtMs: 1764000007000,
  },
  {
    id: 'starter_service_pads',
    name: 'تغيير مخدات الأنف وضبط الاستقامة',
    category: 'service',
    price: 50,
    notes: 'خدمة فورية بالفرع',
    createdAtMs: 1764000008000,
    updatedAtMs: 1764000008000,
  },
];

export function generateRepairId(): string {
  return `r_${Date.now()}_${generateToken(4)}`;
}

export function normalizeRepairRecord(raw: unknown): RepairRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const name = String(obj.name ?? '').trim().slice(0, 120);
  if (!name) return null;

  const rawDate = String(obj.date ?? '').trim();
  const parsedDate =
    rawDate && !Number.isNaN(Date.parse(rawDate))
      ? new Date(rawDate).toISOString().slice(0, 40)
      : new Date().toISOString();

  const statusNum = Math.trunc(clampNumber(obj.status, 0, REPAIR_STAGES.length - 1));
  const hist = sanitizeHist(obj.hist);
  if (hist.length === 0) {
    hist[0] = Date.parse(parsedDate) || Date.now();
  }

  return {
    id: sanitizeId(obj.id, 'r'),
    ownerId: obj.ownerId ? String(obj.ownerId).slice(0, 128) : undefined,
    date: parsedDate,
    name,
    phone: String(obj.phone ?? '').trim().slice(0, 30),
    glassesType: String(obj.glassesType ?? '').trim().slice(0, 120),
    weldingType: String(obj.weldingType ?? '').trim().slice(0, 120),
    representativeName: String(obj.representativeName ?? '').trim().slice(0, 120),
    cost: clampNumber(obj.cost),
    paid: clampNumber(obj.paid),
    notes: String(obj.notes ?? '').trim().slice(0, 240),
    status: statusNum,
    hist,
    tok: sanitizeToken(obj.tok),
    pickupDate: sanitizePickupDate(obj.pickupDate),
    delivered: Boolean(obj.delivered),
  };
}

export function filterRepairs(
  repairs: RepairRecord[],
  query = ''
): RepairRecord[] {
  const trimmed = query.trim().toLowerCase();
  return repairs
    .filter((r) => {
      if (!trimmed) return true;
      return (
        r.name.toLowerCase().includes(trimmed) ||
        r.phone.toLowerCase().includes(trimmed) ||
        r.glassesType.toLowerCase().includes(trimmed) ||
        r.weldingType.toLowerCase().includes(trimmed) ||
        r.representativeName.toLowerCase().includes(trimmed) ||
        r.tok.toLowerCase().includes(trimmed)
      );
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function buildRepairTrackingUrl(
  origin: string,
  pathname: string,
  tok: string,
  customBaseUrl?: string
): string {
  const trimmedCustom = String(customBaseUrl || '').trim().replace(/\/+$/, '');
  if (trimmedCustom) {
    return `${trimmedCustom}/#rtrack-${tok}`;
  }
  const cleanOrigin = resolvePublicOrigin(origin);
  const cleanPath = pathname === '/' ? '' : pathname.replace(/\/+$/, '');
  return `${cleanOrigin}${cleanPath}/#rtrack-${tok}`;
}

export function renderRepairWhatsAppMessage(params: {
  repair: Pick<
    RepairRecord,
    'name' | 'glassesType' | 'weldingType' | 'representativeName' | 'cost' | 'paid' | 'status'
  >;
  trackingUrl: string;
  shopName?: string;
}): string {
  const { repair, trackingUrl, shopName = 'Mido Optics' } = params;
  const stageIndex = Math.max(0, Math.min(REPAIR_STAGES.length - 1, repair.status || 0));
  const stageLabel = REPAIR_STAGES[stageIndex];
  const remaining = calculateRemaining(repair.cost, repair.paid);
  const workDetails = [repair.glassesType, repair.weldingType].filter(Boolean).join(' · ');
  const detailLine = workDetails ? `\nتفاصيل التصليح: ${workDetails}.` : '';
  const repLine = repair.representativeName
    ? `\nالمندوب المسؤول: ${repair.representativeName}.`
    : '';
  const paymentLine =
    remaining > 0
      ? `\nالمبلغ المتبقي: ${remaining} جنيه.`
      : repair.cost > 0
      ? '\nالحساب: خالص.'
      : '';
  return `أهلاً ${repair.name || 'عميلنا العزيز'}، طلب التصليح الخاص بك في ${shopName} وصل الآن لمرحلة: «${stageLabel}».${detailLine}${repLine}${paymentLine}\nتابع حالة التصليح خطوة بخطوة من هنا:\n${trackingUrl}`;
}

export function renderRepairReadyMessage(params: {
  repair: Pick<
    RepairRecord,
    'name' | 'glassesType' | 'weldingType' | 'representativeName' | 'cost' | 'paid'
  >;
  trackingUrl: string;
  shopName?: string;
}): string {
  const { repair, trackingUrl, shopName = 'Mido Optics' } = params;
  const remaining = calculateRemaining(repair.cost, repair.paid);
  const workDetails = [repair.glassesType, repair.weldingType].filter(Boolean).join(' · ');
  const detailLine = workDetails ? `\nتفاصيل التصليح: ${workDetails}.` : '';
  const paymentLine =
    remaining > 0
      ? `\nالمبلغ المتبقي عند الاستلام: ${remaining} جنيه.`
      : repair.cost > 0
      ? '\nالمبلغ مسدد بالكامل (خالص).'
      : '';
  return `أهلاً ${repair.name || 'عميلنا العزيز'}، يسعدنا إبلاغك بأن تصليح نظارتك في ${shopName} أصبح جاهزاً للاستلام الآن!${detailLine}\nمن فضلك توجّه إلى الفرع لاستلام النظارة.${paymentLine}\nرابط المتابعة:\n${trackingUrl}`;
}

export function buildRepairStageWhatsAppDispatch(params: {
  repair: Pick<
    RepairRecord,
    'name' | 'phone' | 'glassesType' | 'weldingType' | 'representativeName' | 'cost' | 'paid' | 'status'
  >;
  trackingUrl: string;
  shopName?: string;
  forceReadyMessage?: boolean;
}): {
  message: string;
  waUrl: string;
  smsUrl: string;
  isReadyNotification: boolean;
} {
  const isReadyNotification = Boolean(
    params.forceReadyMessage || params.repair.status === 4
  );
  const message = isReadyNotification
    ? renderRepairReadyMessage({
        repair: params.repair,
        trackingUrl: params.trackingUrl,
        shopName: params.shopName,
      })
    : renderRepairWhatsAppMessage({
        repair: params.repair,
        trackingUrl: params.trackingUrl,
        shopName: params.shopName,
      });
  const phone = formatEgyptianWhatsAppPhone(params.repair.phone);
  const encoded = encodeURIComponent(message);
  const waUrl = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  const smsUrl = buildSmsUrl(params.repair.phone, message);

  return {
    message,
    waUrl,
    smsUrl,
    isReadyNotification,
  };
}

export function buildRepairWhatsAppUrl(params: {
  repair: Pick<
    RepairRecord,
    'name' | 'phone' | 'glassesType' | 'weldingType' | 'representativeName' | 'cost' | 'paid' | 'status'
  >;
  trackingUrl: string;
  shopName?: string;
  preferReadyMessage?: boolean;
}): string {
  return buildRepairStageWhatsAppDispatch({
    repair: params.repair,
    trackingUrl: params.trackingUrl,
    shopName: params.shopName,
    forceReadyMessage: params.preferReadyMessage !== false && params.repair.status === 4,
  }).waUrl;
}

export interface RepairStatsSummary {
  totalRepairs: number;
  activeCount: number;
  readyCount: number;
  deliveredCount: number;
  totalRevenue: number;
  totalCollected: number;
  totalRemaining: number;
}

export function calculateRepairStats(repairs: RepairRecord[]): RepairStatsSummary {
  let activeCount = 0;
  let readyCount = 0;
  let deliveredCount = 0;
  let totalRevenue = 0;
  let totalCollected = 0;

  for (const r of repairs) {
    if (r.delivered) {
      deliveredCount += 1;
    } else {
      activeCount += 1;
      if (r.status >= 4) readyCount += 1;
    }
    totalRevenue += clampNumber(r.cost);
    totalCollected += clampNumber(r.paid);
  }

  return {
    totalRepairs: repairs.length,
    activeCount,
    readyCount,
    deliveredCount,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCollected: Math.round(totalCollected * 100) / 100,
    totalRemaining: Math.round((totalRevenue - totalCollected) * 100) / 100,
  };
}

export const SAMPLE_REPAIRS: RepairRecord[] = [
  {
    id: 'demo_rep_1795652001',
    date: new Date(Date.now() - 86_400_000).toISOString(),
    name: 'كريم عبد الله',
    phone: '01098765432',
    glassesType: 'شمبر معدن تيتانيوم',
    weldingType: 'لحام ليزر للذراع الأيمن',
    representativeName: 'محمود سعيد',
    cost: 250,
    paid: 100,
    notes: 'استلام سريع ومراجعة الوسادات',
    status: 2,
    hist: [Date.now() - 86_400_000, Date.now() - 50_000_000, Date.now() - 12_000_000],
    tok: 'repdemo91a',
    pickupDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    delivered: false,
  },
  {
    id: 'demo_rep_1795652002',
    date: new Date(Date.now() - 36_000_000).toISOString(),
    name: 'منى طارق',
    phone: '01234567890',
    glassesType: 'نظارة شمس أسيتات',
    weldingType: 'تغيير سوستة المفصل',
    representativeName: 'إسلام حسن',
    cost: 180,
    paid: 180,
    notes: '',
    status: 4,
    hist: [
      Date.now() - 36_000_000,
      Date.now() - 28_000_000,
      Date.now() - 20_000_000,
      Date.now() - 10_000_000,
      Date.now() - 3_600_000,
    ],
    tok: 'repdemo44b',
    pickupDate: new Date().toISOString().slice(0, 10),
    delivered: false,
  },
];

export const WEB_PRODUCT_CATEGORIES: WebProductCategory[] = [
  'medical_glasses',
  'sunglasses',
  'lenses',
  'contact_lenses',
  'accessories',
];

export const WEB_COLOR_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'أسود', hex: '#111827' },
  { name: 'ذهبي', hex: '#c9a24b' },
  { name: 'فضي', hex: '#94a3b8' },
  { name: 'بني', hex: '#78350f' },
  { name: 'هافان', hex: '#b45309' },
  { name: 'شفاف', hex: '#e2e8f0' },
  { name: 'أزرق', hex: '#2563eb' },
  { name: 'أخضر', hex: '#16a34a' },
  { name: 'رمادي', hex: '#64748b' },
  { name: 'أحمر', hex: '#dc2626' },
  { name: 'وردي', hex: '#ec4899' },
  { name: 'أبيض', hex: '#ffffff' },
];

export function generateWebProductId(): string {
  return `wp_${Date.now()}_${generateToken(4)}`;
}

export function normalizeWebProductCategory(raw: unknown): WebProductCategory {
  if (
    raw === 'medical_glasses' ||
    raw === 'sunglasses' ||
    raw === 'lenses' ||
    raw === 'contact_lenses' ||
    raw === 'accessories'
  ) {
    return raw;
  }
  return 'medical_glasses';
}

export function sanitizeProductColors(raw: unknown): string[] {
  const source = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
    ? raw.split(/[،,|/]+/)
    : [];

  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const entry of source) {
    const label = String(entry ?? '').trim().slice(0, 40);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(label);
    if (cleaned.length >= 15) break;
  }

  return cleaned;
}

export function sanitizeWebsiteUrl(raw: unknown): string {
  const trimmed = String(raw ?? '').trim().slice(0, 200);
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

export function normalizeWebProduct(raw: unknown): WebProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const name = String(obj.name ?? '').trim().slice(0, 120);
  if (!name) return null;

  const createdAtMs =
    typeof obj.createdAtMs === 'number' && Number.isFinite(obj.createdAtMs) && obj.createdAtMs >= 0
      ? Math.trunc(obj.createdAtMs)
      : Date.now();
  const updatedAtMs =
    typeof obj.updatedAtMs === 'number' && Number.isFinite(obj.updatedAtMs) && obj.updatedAtMs >= 0
      ? Math.trunc(obj.updatedAtMs)
      : createdAtMs;

  return {
    id: sanitizeId(obj.id, 'wp'),
    ownerId: obj.ownerId ? String(obj.ownerId).slice(0, 128) : undefined,
    name,
    category: normalizeWebProductCategory(obj.category),
    price: clampNumber(obj.price),
    colors: sanitizeProductColors(obj.colors),
    available: typeof obj.available === 'boolean' ? obj.available : true,
    notes: String(obj.notes ?? '').trim().slice(0, 240),
    photo: sanitizeFramePhoto(obj.photo),
    createdAtMs,
    updatedAtMs,
  };
}

export function filterWebProducts(
  products: WebProduct[],
  category: WebProductCategory | 'all' = 'all',
  availability: 'all' | 'available' | 'unavailable' = 'all',
  query = ''
): WebProduct[] {
  const trimmed = query.trim().toLowerCase();
  return products
    .filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (availability === 'available' && !item.available) return false;
      if (availability === 'unavailable' && item.available) return false;
      if (!trimmed) return true;
      return (
        item.name.toLowerCase().includes(trimmed) ||
        item.notes.toLowerCase().includes(trimmed) ||
        item.colors.some((color) => color.toLowerCase().includes(trimmed))
      );
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export const DEFAULT_STOREFRONT_WEBSITE_URL = 'https://mido-web-site.vercel.app';

export const WEB_ORDER_STATUSES: WebOrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
];

export function sanitizeRemoteOrDataImage(raw: unknown): string {
  const str = String(raw ?? '').trim();
  if (!str) return '';
  if (str.startsWith('data:image/') && str.length <= 350_000) return str;
  if (/^https?:\/\//i.test(str) && str.length <= 1000) return str;
  if (str.startsWith('/') && !str.startsWith('//') && str.length <= 500) return str;
  return '';
}

export function buildStorefrontSlug(rawId: string, prefix = 'prod'): string {
  const cleaned = String(rawId || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  if (cleaned.length >= 2) return cleaned;
  let hash = 0;
  for (let i = 0; i < rawId.length; i += 1) {
    hash = (hash * 31 + rawId.charCodeAt(i)) >>> 0;
  }
  return `${prefix}-${hash.toString(36) || 'item'}`;
}

export function buildStorefrontStableNumericId(rawId: string): number {
  const numericOnly = Number(String(rawId || '').replace(/\D+/g, '').slice(0, 9));
  if (Number.isInteger(numericOnly) && numericOnly > 0) return numericOnly;
  let hash = 0;
  for (let i = 0; i < rawId.length; i += 1) {
    hash = (hash * 33 + rawId.charCodeAt(i)) % 900_000;
  }
  return 100_000 + Math.abs(hash);
}

export function resolveColorHex(colorName: string): string {
  const lower = String(colorName || '').trim().toLowerCase();
  const match = WEB_COLOR_PRESETS.find((c) => c.name.toLowerCase() === lower);
  return match ? match.hex : '#141413';
}

export type StorefrontProductCategory =
  | 'prescription'
  | 'sunglasses'
  | 'contact_lenses'
  | 'accessories';

export interface StorefrontProductPayload {
  slug: string;
  name: string;
  category: StorefrontProductCategory;
  price: number;
  shortDesc: string;
  fullDesc: string;
  frameShape: string;
  material: string;
  dimensions: string;
  published: boolean;
  allowPreorder: boolean;
  preorderNote: string;
  variants: Array<{
    id: number;
    colorName: string;
    colorHex: string;
    stock: number;
    images: string[];
    sortOrder: number;
  }>;
}

export interface StorefrontLensPayload {
  docId: string;
  id: number;
  name: string;
  subtitle: string;
  price: number;
  imageUrl: string;
  details: string[];
  fullDescription: string;
  refractiveIndex: string;
  published: boolean;
  sortOrder: number;
}

export function mapWebProductCategoryToStorefront(
  category: WebProductCategory
): StorefrontProductCategory {
  switch (category) {
    case 'sunglasses':
      return 'sunglasses';
    case 'contact_lenses':
      return 'contact_lenses';
    case 'accessories':
      return 'accessories';
    case 'medical_glasses':
    default:
      return 'prescription';
  }
}

export function mapWebProductToStorefrontProduct(
  product: WebProduct
): StorefrontProductPayload {
  const slug = buildStorefrontSlug(product.id, 'prod');
  const numericId = buildStorefrontStableNumericId(product.id);
  const activeColors = product.colors.length > 0 ? product.colors : ['أساسي'];
  const stockPerVariant = product.available ? 10 : 0;
  const images = product.photo ? [product.photo] : [];

  return {
    slug,
    name: product.name.slice(0, 140),
    category: mapWebProductCategoryToStorefront(product.category),
    price: clampNumber(product.price),
    shortDesc: (product.notes || WEB_PRODUCT_CATEGORY_LABELS[product.category]).slice(0, 320),
    fullDesc: (product.notes || product.name).slice(0, 2000),
    frameShape: 'classic',
    material: '',
    dimensions: '',
    published: true,
    allowPreorder: false,
    preorderNote: product.available ? '' : 'غير متوفرة حالياً',
    variants: activeColors.slice(0, 15).map((colorName, idx) => ({
      id: numericId * 100 + idx + 1,
      colorName,
      colorHex: resolveColorHex(colorName),
      stock: stockPerVariant,
      images,
      sortOrder: idx,
    })),
  };
}

export function mapWebProductToStorefrontLens(
  product: WebProduct
): StorefrontLensPayload {
  const numericId = buildStorefrontStableNumericId(product.id);
  const safeRemoteImg =
    product.photo && product.photo.startsWith('data:image/') && product.photo.length <= 350_000
      ? product.photo
      : product.photo && /^https?:\/\//i.test(product.photo) && product.photo.length <= 500
      ? product.photo
      : product.photo && product.photo.startsWith('/') && product.photo.length <= 500
      ? product.photo
      : '/src/assets/images/optical_lens_crystal_1795761233547.jpg';
  const noteParts = product.notes
    ? product.notes
        .split(/[،,|•\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  return {
    docId: `lens-${numericId}`,
    id: numericId,
    name: product.name.slice(0, 140),
    subtitle: (product.notes || 'عدسة طبية معتمدة').slice(0, 240),
    price: clampNumber(product.price),
    imageUrl: safeRemoteImg,
    details: noteParts.length > 0 ? noteParts : ['عدسة طبية معتمدة'],
    fullDescription: (product.notes || product.name).slice(0, 1500),
    refractiveIndex: '1.56',
    published: Boolean(product.available),
    sortOrder: 0,
  };
}

export function normalizeWebOrderStatus(raw: unknown): WebOrderStatus {
  const val = String(raw ?? '').trim().toLowerCase();
  if (
    val === 'pending' ||
    val === 'confirmed' ||
    val === 'preparing' ||
    val === 'ready' ||
    val === 'delivered' ||
    val === 'cancelled'
  ) {
    return val;
  }
  return 'pending';
}

function parseFlexibleTimestampMs(raw: unknown, fallback = Date.now()): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw.trim());
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (raw && typeof raw === 'object') {
    const rec = raw as { toMillis?: () => number; seconds?: number };
    if (typeof rec.toMillis === 'function') {
      const ms = rec.toMillis();
      if (Number.isFinite(ms)) return Math.trunc(ms);
    }
    if (typeof rec.seconds === 'number' && Number.isFinite(rec.seconds)) {
      return Math.trunc(rec.seconds * 1000);
    }
  }
  return fallback;
}

export function generateWebOrderId(orderCode?: string): string {
  const cleanCode = String(orderCode || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  if (cleanCode) return `wo_${cleanCode}`.slice(0, 64);
  return `wo_${Date.now()}_${generateToken(4)}`;
}

function normalizeWebOrderItem(raw: unknown, idx: number): WebOrderItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const productName = String(obj.productName ?? obj.name ?? '').trim().slice(0, 140);
  const lensName = String(obj.lensName ?? '').trim().slice(0, 140);
  if (!productName && !lensName) return null;

  return {
    id: String(obj.id ?? idx + 1).slice(0, 64),
    productId: obj.productId !== undefined && obj.productId !== null ? String(obj.productId).slice(0, 64) : undefined,
    productSlug: obj.productSlug ? String(obj.productSlug).slice(0, 120) : undefined,
    productName: productName || 'عدسات طبية',
    category: String(obj.category ?? 'prescription').slice(0, 40),
    variantId: obj.variantId !== undefined && obj.variantId !== null ? String(obj.variantId).slice(0, 64) : undefined,
    colorName: String(obj.colorName ?? '').trim().slice(0, 60),
    colorHex: String(obj.colorHex ?? '').trim().slice(0, 20),
    imageUrl: sanitizeRemoteOrDataImage(obj.imageUrl),
    framePrice: clampNumber(obj.framePrice),
    lensId: obj.lensId !== undefined && obj.lensId !== null ? String(obj.lensId).slice(0, 64) : undefined,
    lensName,
    lensPrice: clampNumber(obj.lensPrice),
    quantity: Math.max(1, Math.min(999, Math.trunc(clampNumber(obj.quantity ?? 1, 1, 999)))),
    orderType: obj.orderType === 'preorder' ? 'preorder' : 'standard',
  };
}

function normalizeWebOrderPrescription(raw: unknown): WebOrderPrescription | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawOd = (obj.od && typeof obj.od === 'object' ? obj.od : {}) as Record<string, unknown>;
  const rawOs = (obj.os && typeof obj.os === 'object' ? obj.os : {}) as Record<string, unknown>;

  const cleanPower = (val: unknown) => String(val ?? '').trim().slice(0, 16) || '-';
  const odSph = cleanPower(rawOd.sph);
  const odCyl = cleanPower(rawOd.cyl);
  const odAxis = cleanPower(rawOd.axis);
  const odAdd = String(rawOd.add ?? obj.add ?? '').trim().slice(0, 16);

  const osSph = cleanPower(rawOs.sph);
  const osCyl = cleanPower(rawOs.cyl);
  const osAxis = cleanPower(rawOs.axis);
  const osAdd = String(rawOs.add ?? '').trim().slice(0, 16);

  const imageUrl = sanitizeRemoteOrDataImage(obj.imageUrl);
  const ipd = String(obj.ipd ?? '').trim().slice(0, 16);
  const mode = String(obj.mode ?? '').trim().slice(0, 40);

  const hasAnyValue =
    odSph !== '-' ||
    odCyl !== '-' ||
    odAxis !== '-' ||
    osSph !== '-' ||
    osCyl !== '-' ||
    osAxis !== '-' ||
    Boolean(odAdd || osAdd || ipd || imageUrl);

  if (!hasAnyValue) return null;

  return {
    mode,
    od: { sph: odSph, cyl: odCyl, axis: odAxis, add: odAdd },
    os: { sph: osSph, cyl: osCyl, axis: osAxis, add: osAdd },
    ipd,
    imageUrl,
  };
}

export function normalizeWebOrder(
  raw: unknown,
  fallbackSource: WebOrderSource = 'webhook'
): WebOrder | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const customerName = String(obj.customerName ?? obj.name ?? '').trim().slice(0, 120);
  if (!customerName) return null;

  const orderCode =
    String(obj.orderCode ?? obj.code ?? '').trim().slice(0, 64) ||
    `WEB-${generateToken(6).toUpperCase()}`;
  const invoiceNumber =
    String(obj.invoiceNumber ?? '').trim().slice(0, 64) || orderCode;

  const items = Array.isArray(obj.items)
    ? obj.items
        .map((item, idx) => normalizeWebOrderItem(item, idx))
        .filter((item): item is WebOrderItem => item !== null)
        .slice(0, 50)
    : [];

  const frameSubtotal =
    obj.frameSubtotal !== undefined
      ? clampNumber(obj.frameSubtotal)
      : items.reduce((sum, it) => sum + it.framePrice * it.quantity, 0);
  const lensSubtotal =
    obj.lensSubtotal !== undefined
      ? clampNumber(obj.lensSubtotal)
      : items.reduce((sum, it) => sum + it.lensPrice * it.quantity, 0);
  const total =
    obj.total !== undefined ? clampNumber(obj.total) : frameSubtotal + lensSubtotal;

  const createdAtMs = parseFlexibleTimestampMs(obj.createdAtMs ?? obj.createdAt, Date.now());
  const updatedAtMs = parseFlexibleTimestampMs(obj.updatedAtMs ?? obj.updatedAt, createdAtMs);

  const rawSource = String(obj.source ?? fallbackSource);
  const source: WebOrderSource =
    rawSource === 'storefront_firebase' ||
    rawSource === 'webhook' ||
    rawSource === 'api' ||
    rawSource === 'manual'
      ? rawSource
      : fallbackSource;

  const id = obj.id ? sanitizeId(obj.id, 'wo') : generateWebOrderId(orderCode);

  return {
    id,
    ownerId: obj.ownerId ? String(obj.ownerId).slice(0, 128) : undefined,
    orderCode,
    invoiceNumber,
    orderType: obj.orderType === 'preorder' ? 'preorder' : 'standard',
    customerName,
    customerPhone: String(obj.customerPhone ?? obj.phone ?? '').trim().slice(0, 30),
    customerAddress: String(obj.customerAddress ?? obj.address ?? '').trim().slice(0, 240),
    notes: String(obj.notes ?? '').trim().slice(0, 400),
    items,
    prescription: normalizeWebOrderPrescription(obj.prescription),
    frameSubtotal,
    lensSubtotal,
    total,
    status: normalizeWebOrderStatus(obj.status),
    source,
    convertedCustomerId: obj.convertedCustomerId
      ? sanitizeId(obj.convertedCustomerId, 'c')
      : undefined,
    createdAtMs,
    updatedAtMs,
  };
}

export function filterWebOrders(
  orders: WebOrder[],
  status: WebOrderStatus | 'all' = 'all',
  query = ''
): WebOrder[] {
  const trimmed = query.trim().toLowerCase();
  return orders
    .filter((order) => {
      if (status !== 'all' && order.status !== status) return false;
      if (!trimmed) return true;
      return (
        order.customerName.toLowerCase().includes(trimmed) ||
        order.customerPhone.toLowerCase().includes(trimmed) ||
        order.orderCode.toLowerCase().includes(trimmed) ||
        order.invoiceNumber.toLowerCase().includes(trimmed) ||
        order.items.some(
          (item) =>
            item.productName.toLowerCase().includes(trimmed) ||
            item.lensName.toLowerCase().includes(trimmed) ||
            item.colorName.toLowerCase().includes(trimmed)
        )
      );
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function mapWebOrderToCustomerInput(order: WebOrder): {
  name: string;
  phone: string;
  frame: string;
  lens: string;
  framePrice: number;
  lensPrice: number;
  total: number;
  paid: number;
  photo: string;
  r: [string, string, string];
  l: [string, string, string];
  add: string;
  usageType: UsageType;
  pickupDate: string;
} {
  const frameSummary = order.items
    .map((item) => {
      const color = item.colorName ? ` (${item.colorName})` : '';
      const qty = item.quantity > 1 ? ` ×${item.quantity}` : '';
      return `${item.productName}${color}${qty}`;
    })
    .filter(Boolean)
    .join(' + ')
    .slice(0, 120);

  const lensSummary = Array.from(
    new Set(order.items.map((item) => item.lensName).filter(Boolean))
  )
    .join(' + ')
    .slice(0, 120);

  const rx = order.prescription;
  const r: [string, string, string] = rx
    ? [rx.od.sph || '-', rx.od.cyl || '-', rx.od.axis || '-']
    : ['-', '-', '-'];
  const l: [string, string, string] = rx
    ? [rx.os.sph || '-', rx.os.cyl || '-', rx.os.axis || '-']
    : ['-', '-', '-'];
  const add = sanitizeAddPower(rx?.os.add || rx?.od.add || '');

  const photo =
    order.items
      .map((it) => it.imageUrl)
      .find((url) => url.startsWith('data:image/') && url.length <= 350_000) || '';

  return {
    name: order.customerName.slice(0, 120),
    phone: order.customerPhone.slice(0, 30),
    frame: frameSummary || `طلب موقع #${order.orderCode}`.slice(0, 120),
    lens: lensSummary,
    framePrice: clampNumber(order.frameSubtotal),
    lensPrice: clampNumber(order.lensSubtotal),
    total: clampNumber(order.total),
    paid: 0,
    photo,
    r,
    l,
    add,
    usageType: add ? 'reading' : '',
    pickupDate: '',
  };
}





