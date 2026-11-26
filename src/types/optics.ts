export type EyeTuple = [string, string, string];

export interface CustomerRecord {
  id: string;
  ownerId?: string;
  date: string;
  name: string;
  phone: string;
  frame: string;
  lens: string;
  total: number;
  paid: number;
  photo: string;
  r: EyeTuple;
  l: EyeTuple;
  status: number;
  hist: Array<number | null>;
  tok: string;
  pickupDate: string;
  delivered: boolean;
}

export interface TrackOrderRecord {
  tok: string;
  ownerId: string;
  customerId: string;
  shopName: string;
  n: string;
  frame: string;
  lens: string;
  total: number;
  paid: number;
  ph: string;
  r: EyeTuple;
  l: EyeTuple;
  s: number;
  h: Array<number | null>;
  pickupDate: string;
  delivered: boolean;
}

export interface ShopSettings {
  shopName: string;
  autoWhatsApp: boolean;
  waTemplate: string;
  publicBaseUrl: string;
}

export interface PendingSyncOp {
  id: string;
  type: 'upsert' | 'delete';
  customerId: string;
  record?: CustomerRecord;
  tok?: string;
  queuedAt: number;
}

export type AppPage = 'customers' | 'loyalty' | 'orders' | 'stats' | 'track';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'local-only' | 'error';

export const ORDER_STAGES = [
  'تم استلام الطلب',
  'تم طلب العدسات',
  'العدسات وصلت',
  'جاري تركيب النظارة',
  'النظارة جاهزة للاستلام',
] as const;

export const DEFAULT_WA_TEMPLATE =
  'أهلاً {name}، طلب نظارتك في {shop} وصل الآن لمرحلة: «{status}».\nتابع حالة نظارتك خطوة بخطوة من هنا:\n{link}';

export interface LensSheet {
  id: string;
  name: string;
  rows: string[];
  cols: string[];
  q: Record<string, number>;
}

export interface LensInventorySnapshot {
  sheets: Record<string, LensSheet>;
  sheetOrder: string[];
  lowThresholds: Record<string, number>;
  updatedAt: number;
  source: 'cloud' | 'json';
}

export type EyeLensMatchStatus =
  | 'empty'
  | 'invalid'
  | 'no-inventory'
  | 'in-stock'
  | 'low-stock'
  | 'order-needed';

export interface EyeLensAvailability {
  eye: 'R' | 'L';
  status: EyeLensMatchStatus;
  sph: string;
  cyl: string;
  sheetId?: string;
  sheetName?: string;
  qty: number;
  threshold: number;
  transposed?: boolean;
  message: string;
}

export interface PickupReminderSummary {
  overdue: CustomerRecord[];
  today: CustomerRecord[];
  soon: CustomerRecord[];
  totalDueCount: number;
  title: string;
  body: string;
  signature: string;
}

