import {
  CustomerRecord,
  DEFAULT_WA_TEMPLATE,
  EyeLensAvailability,
  EyeTuple,
  LensInventorySnapshot,
  LensSheet,
  ORDER_STAGES,
  PickupReminderSummary,
} from '../types/optics';

export interface LoyaltyEntry {
  key: string;
  name: string;
  phone: string;
  visits: number;
  paid: number;
  points: number;
  tier: 'برونزي' | 'فضي' | 'ذهبي';
  tierColor: string;
  rewardText: string;
}

export function clampNumber(value: unknown, min = 0, max = 10_000_000): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
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

export function buildWhatsAppUrl(params: {
  customer: Pick<CustomerRecord, 'name' | 'phone' | 'frame' | 'lens' | 'total' | 'paid' | 'status'>;
  trackingUrl: string;
  template?: string;
  shopName?: string;
}): string {
  const phone = formatEgyptianWhatsAppPhone(params.customer.phone);
  const text = renderWhatsAppMessage(params);
  const encoded = encodeURIComponent(text);
  if (!phone) {
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${phone}?text=${encoded}`;
}

export function calculateLoyaltySummary(customers: CustomerRecord[]): LoyaltyEntry[] {
  const map = new Map<string, { name: string; phone: string; visits: number; paid: number }>();
  for (const c of customers) {
    const key = (c.phone || '').trim() || c.name.trim();
    if (!key) continue;
    const prev = map.get(key);
    if (prev) {
      prev.visits += 1;
      prev.paid += clampNumber(c.paid);
      if (c.name && !prev.name) prev.name = c.name;
    } else {
      map.set(key, {
        name: c.name,
        phone: c.phone,
        visits: 1,
        paid: clampNumber(c.paid),
      });
    }
  }

  return Array.from(map.entries())
    .map(([key, item]) => {
      const points = Math.floor(item.paid / 100);
      const tier: LoyaltyEntry['tier'] =
        points >= 25 ? 'ذهبي' : points >= 10 ? 'فضي' : 'برونزي';
      const tierColor =
        points >= 25 ? '#c99312' : points >= 10 ? '#64748b' : '#a35d28';
      const rewardAmount = Math.floor(points / 10) * 50;
      return {
        key,
        name: item.name,
        phone: item.phone,
        visits: item.visits,
        paid: item.paid,
        points,
        tier,
        tierColor,
        rewardText: rewardAmount > 0 ? `خصم ${rewardAmount} جنيه` : '—',
      };
    })
    .sort((a, b) => b.points - a.points);
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
  const rawPhoto = String(obj.photo ?? '');
  const safePhoto =
    rawPhoto.startsWith('data:image/') && rawPhoto.length <= 350_000 ? rawPhoto : '';

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
    total: clampNumber(obj.total),
    paid: clampNumber(obj.paid),
    photo: safePhoto,
    r: sanitizeEyeTuple(obj.r),
    l: sanitizeEyeTuple(obj.l),
    status: statusNum,
    hist,
    tok: sanitizeToken(obj.tok),
    pickupDate: sanitizePickupDate(obj.pickupDate),
    delivered: Boolean(obj.delivered),
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

export function buildSinglePagePdfFromJpeg(params: {
  jpegBytes: Uint8Array;
  imageWidth: number;
  imageHeight: number;
}): Uint8Array {
  const { jpegBytes, imageWidth, imageHeight } = params;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 20;
  const availW = pageWidth - margin * 2;
  const availH = pageHeight - margin * 2;
  const safeW = Math.max(1, imageWidth);
  const safeH = Math.max(1, imageHeight);
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


