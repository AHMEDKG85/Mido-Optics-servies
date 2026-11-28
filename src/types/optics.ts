export type EyeTuple = [string, string, string];

export type UsageType = 'distance' | 'reading' | '';

export const USAGE_TYPE_LABELS: Record<Exclude<UsageType, ''>, string> = {
  distance: 'مسافات',
  reading: 'قراءة',
};

export interface CustomerRecord {
  id: string;
  ownerId?: string;
  date: string;
  name: string;
  phone: string;
  frame: string;
  lens: string;
  framePrice?: number;
  lensPrice?: number;
  total: number;
  paid: number;
  photo: string;
  r: EyeTuple;
  l: EyeTuple;
  add?: string;
  usageType?: UsageType;
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
  add?: string;
  usageType?: UsageType;
  s: number;
  h: Array<number | null>;
  pickupDate: string;
  delivered: boolean;
}

export interface RepairRecord {
  id: string;
  ownerId?: string;
  date: string;
  name: string;
  phone: string;
  glassesType: string;
  weldingType: string;
  representativeName: string;
  cost: number;
  paid: number;
  notes: string;
  status: number;
  hist: Array<number | null>;
  tok: string;
  pickupDate: string;
  delivered: boolean;
}

export interface RepairTrackRecord {
  tok: string;
  ownerId: string;
  repairId: string;
  shopName: string;
  n: string;
  glassesType: string;
  weldingType: string;
  representativeName: string;
  cost: number;
  paid: number;
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
  websiteUrl?: string;
  autoTransferWebOrdersToWhatsApp?: boolean;
}

export type PriceItemCategory = 'frame' | 'lens' | 'service';

export const PRICE_CATEGORY_LABELS: Record<PriceItemCategory, string> = {
  frame: 'شمبر',
  lens: 'عدسات',
  service: 'خدمات وإصلاحات',
};

export interface PriceItem {
  id: string;
  ownerId?: string;
  name: string;
  category: PriceItemCategory;
  price: number;
  notes: string;
  photo?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PendingSyncOp {
  id: string;
  type: 'upsert' | 'delete';
  customerId: string;
  record?: CustomerRecord;
  tok?: string;
  queuedAt: number;
}

export interface PendingPriceSyncOp {
  id: string;
  type: 'upsert' | 'delete';
  priceId: string;
  item?: PriceItem;
  queuedAt: number;
}

export interface PendingRepairSyncOp {
  id: string;
  type: 'upsert' | 'delete';
  repairId: string;
  record?: RepairRecord;
  tok?: string;
  queuedAt: number;
}

export type WebProductCategory =
  | 'medical_glasses'
  | 'sunglasses'
  | 'lenses'
  | 'contact_lenses'
  | 'accessories';

export const WEB_PRODUCT_CATEGORY_LABELS: Record<WebProductCategory, string> = {
  medical_glasses: 'نظارة طبية',
  sunglasses: 'نظارات شمسية',
  lenses: 'عدسات',
  contact_lenses: 'عدسات لاصقة',
  accessories: 'إكسسوارات',
};

export interface WebProduct {
  id: string;
  ownerId?: string;
  name: string;
  category: WebProductCategory;
  price: number;
  brand?: string;
  discountPrice?: number;
  featured?: boolean;
  newArrival?: boolean;
  colors: string[];
  available: boolean;
  notes: string;
  photo: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PendingWebProductSyncOp {
  id: string;
  type: 'upsert' | 'delete';
  productId: string;
  product?: WebProduct;
  queuedAt: number;
}

export type WebOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export const WEB_ORDER_STATUS_LABELS: Record<WebOrderStatus, string> = {
  pending: 'طلب جديد',
  confirmed: 'تم التأكيد',
  preparing: 'جاري التجهيز',
  ready: 'جاهز للاستلام',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};

export interface WebOrderItem {
  id: string;
  productId?: string;
  productSlug?: string;
  productName: string;
  category: string;
  variantId?: string;
  colorName: string;
  colorHex: string;
  imageUrl: string;
  framePrice: number;
  lensId?: string;
  lensName: string;
  lensPrice: number;
  quantity: number;
  orderType: 'standard' | 'preorder';
}

export interface WebOrderPrescriptionEye {
  sph: string;
  cyl: string;
  axis: string;
  add?: string;
}

export interface WebOrderPrescription {
  mode: string;
  od: WebOrderPrescriptionEye;
  os: WebOrderPrescriptionEye;
  ipd: string;
  imageUrl: string;
}

export type WebOrderSource = 'storefront_firebase' | 'webhook' | 'api' | 'manual';

export interface WebOrder {
  id: string;
  ownerId?: string;
  orderCode: string;
  invoiceNumber: string;
  orderType: 'standard' | 'preorder';
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  items: WebOrderItem[];
  prescription: WebOrderPrescription | null;
  frameSubtotal: number;
  lensSubtotal: number;
  total: number;
  status: WebOrderStatus;
  source: WebOrderSource;
  convertedCustomerId?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PendingWebOrderSyncOp {
  id: string;
  type: 'upsert' | 'delete';
  orderId: string;
  orderCode?: string;
  order?: WebOrder;
  queuedAt: number;
}

export type NavPage =
  | 'customers'
  | 'orders'
  | 'web-orders'
  | 'repairs'
  | 'repair-orders'
  | 'archive'
  | 'prices'
  | 'stats'
  | 'web-control';

export type AppPage = NavPage | 'track' | 'rtrack';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'local-only' | 'error';

export const ORDER_STAGES = [
  'تم استلام الطلب',
  'تم طلب العدسات',
  'العدسات وصلت',
  'جاري تركيب النظارة',
  'النظارة جاهزة للاستلام',
] as const;

export const REPAIR_STAGES = [
  'تم استلام النظارة للتصليح',
  'جاري الفحص والتجهيز',
  'تحت التصليح واللحام',
  'جاري التلميع والمراجعة',
  'التصليح جاهز للاستلام',
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

