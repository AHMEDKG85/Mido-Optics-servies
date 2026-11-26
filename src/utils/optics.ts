import {
  CustomerRecord,
  DEFAULT_WA_TEMPLATE,
  EyeTuple,
  ORDER_STAGES,
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
