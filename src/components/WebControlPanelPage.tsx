import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Disc,
  ExternalLink,
  Eye,
  EyeOff,
  Glasses,
  Globe,
  Image as ImageIcon,
  Link2,
  LogIn,
  LogOut,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { WebProductInput } from '../hooks/useOpticsStore';
import {
  ShopSettings,
  WEB_PRODUCT_CATEGORY_LABELS,
  WebProduct,
  WebProductCategory,
} from '../types/optics';
import { compressFramePhotoFile } from '../utils/image';
import { StorefrontContentEditor } from './StorefrontContentEditor';
import { StorefrontCatalogEditor } from './StorefrontCatalogEditor';
import {
  DEFAULT_STOREFRONT_WEBSITE_URL,
  filterWebProducts,
  formatArabicDateTime,
  sanitizeProductColors,
  sanitizeWebsiteUrl,
  WEB_COLOR_PRESETS,
  WEB_PRODUCT_CATEGORIES,
} from '../utils/optics';

export interface StorefrontSyncStatusInfo {
  state: 'idle' | 'syncing' | 'ok' | 'partial' | 'error';
  message: string;
  publicProductsCount?: number;
  publicLensesCount?: number;
  lastSyncedAt?: number;
}

interface WebControlPanelPageProps {
  products: WebProduct[];
  settings: ShopSettings;
  storefrontUser?: User | null;
  storefrontSyncStatus?: StorefrontSyncStatusInfo;
  onSignInStorefront?: () => Promise<void> | void;
  onSignOutStorefront?: () => Promise<void> | void;
  onSyncAllToStorefront?: () => Promise<{
    synced: number;
    total: number;
    message: string;
  }>;
  onSaveProduct: (input: WebProductInput) => { product: WebProduct; isNew: boolean };
  onToggleAvailability: (productId: string, nextAvailable?: boolean) => WebProduct | null;
  onDeleteProduct: (productId: string) => void;
  onUpdateSettings: (patch: Partial<ShopSettings>) => Promise<void> | void;
  onToast: (msg: string) => void;
}

const CATEGORY_TABS: Array<{ id: WebProductCategory | 'all'; label: string }> = [
  { id: 'all', label: 'الكل' },
  { id: 'medical_glasses', label: 'نظارة طبية' },
  { id: 'sunglasses', label: 'نظارات شمسية' },
  { id: 'lenses', label: 'عدسات' },
  { id: 'contact_lenses', label: 'عدسات لاصقة' },
  { id: 'accessories', label: 'إكسسوارات' },
];

const AVAILABILITY_FILTERS: Array<{
  id: 'all' | 'available' | 'unavailable';
  label: string;
}> = [
  { id: 'all', label: 'كل الحالات' },
  { id: 'available', label: 'متوفر بالموقع' },
  { id: 'unavailable', label: 'غير متوفرة حالياً' },
];

function getCategoryIcon(category: WebProductCategory) {
  switch (category) {
    case 'sunglasses':
      return Sun;
    case 'lenses':
    case 'contact_lenses':
      return Disc;
    case 'accessories':
      return Package;
    case 'medical_glasses':
    default:
      return Glasses;
  }
}

function getColorSwatchHex(colorName: string): string | null {
  const lower = colorName.trim().toLowerCase();
  const match = WEB_COLOR_PRESETS.find((c) => c.name.toLowerCase() === lower);
  return match ? match.hex : null;
}

export const WebControlPanelPage: React.FC<WebControlPanelPageProps> = ({
  products,
  settings,
  storefrontUser = null,
  storefrontSyncStatus,
  onSignInStorefront,
  onSignOutStorefront,
  onSyncAllToStorefront,
  onSaveProduct,
  onToggleAvailability,
  onDeleteProduct,
  onUpdateSettings,
  onToast,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<WebProductCategory | 'all'>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>(
    'all'
  );
  const [search, setSearch] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);

  // Storefront link bar
  const [websiteUrlDraft, setWebsiteUrlDraft] = useState(
    settings.websiteUrl || DEFAULT_STOREFRONT_WEBSITE_URL
  );
  useEffect(() => {
    setWebsiteUrlDraft(settings.websiteUrl || DEFAULT_STOREFRONT_WEBSITE_URL);
  }, [settings.websiteUrl]);

  // Add / Edit Product Form
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<WebProductCategory>('medical_glasses');
  const [price, setPrice] = useState('');
  const [colors, setColors] = useState<string[]>(['أسود']);
  const [customColorInput, setCustomColorInput] = useState('');
  const [available, setAvailable] = useState(true);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState('');

  // Two-step delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 3500);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

  const counts = useMemo(() => {
    const map: Record<WebProductCategory | 'all' | 'available' | 'unavailable', number> = {
      all: products.length,
      medical_glasses: 0,
      sunglasses: 0,
      lenses: 0,
      contact_lenses: 0,
      accessories: 0,
      available: 0,
      unavailable: 0,
    };

    for (const p of products) {
      map[p.category] += 1;
      if (p.available) map.available += 1;
      else map.unavailable += 1;
    }

    return map;
  }, [products]);

  const filtered = useMemo(
    () => filterWebProducts(products, categoryFilter, availabilityFilter, search),
    [products, categoryFilter, availabilityFilter, search]
  );

  const resetForm = (defaultCat?: WebProductCategory) => {
    setEditingId(null);
    setName('');
    setCategory(defaultCat ?? (categoryFilter === 'all' ? 'medical_glasses' : categoryFilter));
    setPrice('');
    setColors(['أسود']);
    setCustomColorInput('');
    setAvailable(true);
    setNotes('');
    setPhoto('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setFormOpen(true);
  };

  const handleOpenEdit = (product: WebProduct) => {
    setEditingId(product.id);
    setName(product.name);
    setCategory(product.category);
    setPrice(String(product.price));
    setColors(product.colors.length > 0 ? product.colors : []);
    setCustomColorInput('');
    setAvailable(product.available);
    setNotes(product.notes || '');
    setPhoto(product.photo || '');
    setFormOpen(true);
  };

  const handleToggleColor = (colorName: string) => {
    setColors((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === colorName.toLowerCase());
      if (exists) {
        return prev.filter((c) => c.toLowerCase() !== colorName.toLowerCase());
      }
      return sanitizeProductColors([...prev, colorName]);
    });
  };

  const handleAddCustomColor = () => {
    const trimmed = customColorInput.trim();
    if (!trimmed) return;
    setColors((prev) => sanitizeProductColors([...prev, trimmed]));
    setCustomColorInput('');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressFramePhotoFile(file);
      setPhoto(compressed);
    } catch {
      onToast('تعذر تحميل صورة المنتج');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      onToast('اكتب اسم المنتج أو النظارة أولاً');
      return;
    }
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      onToast('أدخل سعراً صحيحاً');
      return;
    }

    const finalColors = customColorInput.trim()
      ? sanitizeProductColors([...colors, customColorInput.trim()])
      : sanitizeProductColors(colors);

    const { isNew } = onSaveProduct({
      id: editingId ?? undefined,
      name: trimmedName,
      category,
      price: parsedPrice,
      colors: finalColors,
      available,
      notes: notes.trim(),
      photo,
    });

    setFormOpen(false);
    resetForm();
    onToast(isNew ? 'تمت إضافة المنتج إلى لوحة الموقع' : 'تم تحديث بيانات المنتج بنجاح');
  };

  const handleSaveWebsiteUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = websiteUrlDraft.trim();
    if (!trimmed) {
      void onUpdateSettings({ websiteUrl: '' });
      onToast('تم مسح رابط الموقع');
      return;
    }
    const valid = sanitizeWebsiteUrl(trimmed);
    if (!valid) {
      onToast('أدخل رابط موقع يبدأ بـ https:// أو http://');
      return;
    }
    void onUpdateSettings({ websiteUrl: valid });
    onToast('تم حفظ رابط موقع الويب بنجاح');
  };

  const handleQuickAvailability = (product: WebProduct) => {
    const nextState = !product.available;
    onToggleAvailability(product.id, nextState);
    onToast(
      nextState
        ? `تم تفعيل «${product.name}» كـ متوفرة في الموقع`
        : `تم تغيير حالة «${product.name}» إلى غير متوفرة حالياً`
    );
  };

  const savedWebsiteUrl =
    sanitizeWebsiteUrl(settings.websiteUrl) || DEFAULT_STOREFRONT_WEBSITE_URL;

  const handleSyncAllClick = async () => {
    if (!onSyncAllToStorefront) return;
    setSyncingAll(true);
    try {
      const res = await onSyncAllToStorefront();
      onToast(res.message);
    } catch {
      onToast('تعذر إتمام المزامنة مع الموقع');
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <section aria-label="لوحة التحكم لموقع الويب" className="space-y-5">
      {/* Header & Summary Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
              <Globe className="w-5 h-5 text-[#c9a24b]" />
              <span>لوحة التحكم لموقع الويب</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              أضف منتجات الموقع من نظارات طبية وشمسية وعدسات وعدسات لاصقة وإكسسوارات مع تحديد السعر والألوان المتوفرة وحالة التوفر الفورية.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs tabular-nums">
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#101c28] text-slate-700 dark:text-slate-200 font-bold">
                إجمالي المنتجات: {counts.all}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold">
                متوفرة: {counts.available}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold">
                غير متوفرة حالياً: {counts.unavailable}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => (formOpen ? setFormOpen(false) : handleOpenAdd())}
            className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
          >
            {formOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{formOpen ? 'إغلاق النموذج' : 'إضافة منتج للموقع'}</span>
          </button>
        </div>

        {/* Website Storefront Connection Bar */}
        <form
          onSubmit={handleSaveWebsiteUrl}
          className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2.5"
        >
          <label
            htmlFor="storefront-website-url"
            className="text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0"
          >
            <Link2 className="w-4 h-4 text-[#c9a24b]" />
            <span>رابط موقع الويب:</span>
          </label>
          <input
            id="storefront-website-url"
            type="url"
            dir="ltr"
            maxLength={200}
            value={websiteUrlDraft}
            onChange={(e) => setWebsiteUrlDraft(e.target.value)}
            placeholder="https://your-storefront-site.com"
            className="flex-1 min-w-[210px] min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0d1722] text-xs sm:text-sm focus:outline-none focus:border-[#c9a24b]"
          />
          <button
            type="submit"
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[#c9a24b]/60 bg-[#f9f3e3] dark:bg-[#1f2b36] hover:bg-[#f2e7ca] text-[#8f6c1e] dark:text-[#e8cf8b] text-xs font-bold whitespace-nowrap cursor-pointer"
          >
            حفظ الرابط
          </button>
          {savedWebsiteUrl && (
            <a
              href={savedWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>معاينة الموقع</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </form>

        <StorefrontContentEditor
          websiteUrl={savedWebsiteUrl}
          storefrontAdminUserId={storefrontUser?.uid}
          onToast={onToast}
        />
        <StorefrontCatalogEditor
          websiteUrl={savedWebsiteUrl}
          storefrontAdminUserId={storefrontUser?.uid}
          onToast={onToast}
        />

        {/* Direct Storefront Sync Bar */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {storefrontUser ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>متصل بإدارة المتجر:</span>
                  <span dir="ltr" className="max-w-[160px] truncate">
                    {storefrontUser.email || 'متصل'}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>للمزامنة الفورية مع الموقع اربط حساب إدارة المتجر</span>
                </span>
              )}

              {(typeof storefrontSyncStatus?.publicProductsCount === 'number' ||
                typeof storefrontSyncStatus?.publicLensesCount === 'number') && (
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  المعروض بالموقع الآن: {storefrontSyncStatus.publicProductsCount ?? 0} نظارة/إكسسوار ·{' '}
                  {storefrontSyncStatus.publicLensesCount ?? 0} عدسة
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onSyncAllToStorefront && (
                <button
                  type="button"
                  onClick={() => void handleSyncAllClick()}
                  disabled={syncingAll || storefrontSyncStatus?.state === 'syncing'}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      syncingAll || storefrontSyncStatus?.state === 'syncing' ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {syncingAll || storefrontSyncStatus?.state === 'syncing'
                      ? 'جاري المزامنة...'
                      : 'مزامنة الكل مع الموقع'}
                  </span>
                </button>
              )}

              {storefrontUser
                ? onSignOutStorefront && (
                    <button
                      type="button"
                      onClick={() => void onSignOutStorefront()}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101c28] hover:border-rose-400 text-slate-600 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>فصل المتجر</span>
                    </button>
                  )
                : onSignInStorefront && (
                    <button
                      type="button"
                      onClick={() => void onSignInStorefront()}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[#c9a24b] bg-[#f9f3e3] dark:bg-[#1f2b36] hover:bg-[#f2e7ca] text-[#8f6c1e] dark:text-[#e8cf8b] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>ربط حساب إدارة المتجر</span>
                    </button>
                  )}
            </div>
          </div>

          {storefrontSyncStatus?.message && (
            <div
              className={`text-xs font-semibold px-3 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${
                storefrontSyncStatus.state === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                  : storefrontSyncStatus.state === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-[#f9f3e3]/75 dark:bg-[#1b2936] border-[#c9a24b]/35 text-[#8f6c1e] dark:text-[#e8cf8b]'
              }`}
            >
              <span className="leading-relaxed">{storefrontSyncStatus.message}</span>
              {storefrontSyncStatus.state === 'error' &&
                storefrontUser &&
                onSignOutStorefront &&
                onSignInStorefront && (
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        await onSignOutStorefront();
                        await onSignInStorefront();
                      })();
                    }}
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-white dark:bg-[#101c28] border border-rose-300 dark:border-rose-700 hover:border-[#c9a24b] text-rose-700 dark:text-rose-200 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>تغيير حساب المتجر</span>
                  </button>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Product Form */}
      {formOpen && (
        <form
          onSubmit={handleSubmitForm}
          aria-label={editingId ? 'تعديل منتج بالموقع' : 'إضافة منتج جديد للموقع'}
          className="rounded-2xl border border-[#c9a24b]/70 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#c9a24b]" />
              <span>{editingId ? 'تعديل بيانات المنتج في الموقع' : 'إضافة منتج جديد لموقع الويب'}</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
            >
              إلغاء
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="sm:col-span-2">
              <label
                htmlFor="web-product-name"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                اسم النظارة / المنتج *
              </label>
              <input
                id="web-product-name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: نظارة طبية تيتانيوم أو عدسات فريش لوك"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            <div>
              <label
                htmlFor="web-product-category"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                الفئة *
              </label>
              <select
                id="web-product-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as WebProductCategory)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm font-semibold focus:outline-none focus:border-[#c9a24b]"
              >
                {WEB_PRODUCT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {WEB_PRODUCT_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="web-product-price"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                السعر (جنيه) *
              </label>
              <input
                id="web-product-price"
                type="number"
                required
                min="0"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm font-bold tabular-nums focus:outline-none focus:border-[#c9a24b]"
              />
            </div>
          </div>

          {/* Available Colors Picker */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-[#101c28]/70 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                الألوان المتوفرة في الموقع ({colors.length}/15)
              </span>
              {colors.length > 0 && (
                <button
                  type="button"
                  onClick={() => setColors([])}
                  className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  مسح كل الألوان
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {WEB_COLOR_PRESETS.map((preset) => {
                const selected = colors.some(
                  (c) => c.toLowerCase() === preset.name.toLowerCase()
                );
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleToggleColor(preset.name)}
                    aria-pressed={selected}
                    className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                      selected
                        ? 'border-[#c9a24b] bg-[#f9f3e3] dark:bg-[#1f2b36] text-[#8f6c1e] dark:text-[#e8cf8b] shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-slate-600 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
                      style={{ backgroundColor: preset.hex }}
                    />
                    <span>{preset.name}</span>
                    {selected && <Check className="w-3 h-3 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                maxLength={40}
                value={customColorInput}
                onChange={(e) => setCustomColorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomColor();
                  }
                }}
                placeholder="أضف لوناً آخر (مثال: كحلي، عسلي، تيتانيوم مطفي)..."
                aria-label="إضافة لون مخصص"
                className="flex-1 min-w-[200px] min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-xs focus:outline-none focus:border-[#c9a24b]"
              />
              <button
                type="button"
                onClick={handleAddCustomColor}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] hover:border-[#c9a24b] text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#c9a24b]" />
                <span>إضافة لون</span>
              </button>
            </div>

            {colors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {colors.map((color) => {
                  const swatch = getColorSwatchHex(color);
                  return (
                    <span
                      key={color}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                    >
                      {swatch && (
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-600"
                          style={{ backgroundColor: swatch }}
                        />
                      )}
                      <span>{color}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleColor(color)}
                        aria-label={`إزالة لون ${color}`}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Availability Status Selector */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 p-3 space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                حالة المنتج في الموقع
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAvailable(true)}
                  aria-pressed={available}
                  className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    available
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span>متوفرة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAvailable(false)}
                  aria-pressed={!available}
                  className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    !available
                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <EyeOff className="w-4 h-4" />
                  <span>غير متوفرة حالياً</span>
                </button>
              </div>
            </div>

            {/* Product Photo Upload */}
            <div className="rounded-xl border border-dashed border-[#c9a24b]/60 bg-[#f3f9fd]/60 dark:bg-[#1b3042]/40 p-3 space-y-2">
              <label
                htmlFor="web-product-photo"
                className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <ImageIcon className="w-4 h-4 text-[#c9a24b]" />
                <span>صورة المنتج للموقع (اختياري)</span>
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  id="web-product-photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handlePhotoUpload(e)}
                  className="flex-1 min-w-[180px] text-xs file:ml-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#e3f2fb] dark:file:bg-[#1b3042] file:text-[#8f6c1e] dark:file:text-[#e8cf8b] file:font-semibold file:cursor-pointer"
                />
                {photo && (
                  <div className="flex items-center gap-2">
                    <img
                      src={photo}
                      alt="معاينة صورة المنتج"
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-700 object-cover bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setPhoto('')}
                      className="text-xs font-semibold text-rose-600 dark:text-rose-400 underline cursor-pointer"
                    >
                      إزالة
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-3">
              <label
                htmlFor="web-product-notes"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                وصف أو مواصفات إضافية للموقع (اختياري)
              </label>
              <input
                id="web-product-notes"
                maxLength={240}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: مقاس 52-18، حماية UV400، شامل الجراب والمنديل..."
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{editingId ? 'حفظ التعديلات' : 'حفظ المنتج بالموقع'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Category Tabs, Availability Filter & Search */}
      <div className="space-y-3">
        <div
          role="tablist"
          aria-label="تصفية منتجات الموقع حسب الفئة"
          className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-200/70 dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar"
        >
          {CATEGORY_TABS.map((tab) => {
            const active = categoryFilter === tab.id;
            const tabCount = counts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategoryFilter(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                  active
                    ? 'bg-white dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label} ({tabCount})
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {AVAILABILITY_FILTERS.map((f) => {
              const active = availabilityFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAvailabilityFilter(f.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'border-[#c9a24b] bg-[#f9f3e3] dark:bg-[#1f2b36] text-[#8f6c1e] dark:text-[#e8cf8b]'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="relative flex-1 min-w-[230px] max-w-md">
            <Search className="w-4 h-4 text-[#c9a24b] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو اللون أو المواصفات..."
              aria-label="بحث في منتجات الموقع"
              className="w-full min-h-[42px] pr-10 pl-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-sm focus:outline-none focus:border-[#c9a24b]"
            />
          </div>
        </div>
      </div>

      {/* Empty / Filtered / Populated States */}
      {products.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center space-y-3">
          <Globe className="w-10 h-10 mx-auto text-[#c9a24b]" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              لا توجد منتجات مضافة للموقع بعد
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              ابدأ بإضافة النظارات الطبية والشمسية والعدسات والعدسات اللاصقة والإكسسوارات مع أسعارها وألوانها المتوفرة، وتحكم بضغطة زر في حالة التوفر بالموقع.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة أول منتج للموقع</span>
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center space-y-2.5">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            لا توجد منتجات مطابقة للفئة أو الحالة المختارة
          </p>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('all');
              setAvailabilityFilter('all');
              setSearch('');
            }}
            className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] cursor-pointer"
          >
            عرض جميع المنتجات
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((product) => {
            const CatIcon = getCategoryIcon(product.category);
            const isDeleteArmed = confirmDeleteId === product.id;

            return (
              <article
                key={product.id}
                className={`rounded-2xl border bg-white dark:bg-[#15232f] p-4 flex flex-col justify-between gap-3.5 transition-all ${
                  product.available
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Row: Image/Icon + Title + Availability Badge */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {product.photo ? (
                        <img
                          src={product.photo}
                          alt={`صورة ${product.name}`}
                          referrerPolicy="no-referrer"
                          className={`w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-white ${
                            !product.available ? 'opacity-65 grayscale-[35%]' : ''
                          }`}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-[#f3f9fd] dark:bg-[#1b3042] border border-slate-200 dark:border-slate-700 grid place-items-center shrink-0 text-[#c9a24b]">
                          <CatIcon className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#101c28] text-slate-600 dark:text-slate-300 mb-1">
                          {WEB_PRODUCT_CATEGORY_LABELS[product.category]}
                        </span>
                        <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-snug break-words">
                          {product.name}
                        </h3>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border whitespace-nowrap shrink-0 ${
                        product.available
                          ? 'bg-emerald-50 dark:bg-emerald-950/45 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {product.available ? 'متوفرة' : 'غير متوفرة حالياً'}
                    </span>
                  </div>

                  {/* Price & Updated Date */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50/80 dark:bg-[#101c28]/80 border border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      السعر بالموقع
                    </span>
                    <span className="text-base font-extrabold text-[#8f6c1e] dark:text-[#e8cf8b] tabular-nums">
                      {product.price.toLocaleString('en-US')} ج.م
                    </span>
                  </div>

                  {/* Available Colors */}
                  {product.colors.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                        الألوان المتوفرة:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {product.colors.map((color) => {
                          const swatch = getColorSwatchHex(color);
                          return (
                            <span
                              key={color}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101c28] text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                            >
                              {swatch && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
                                  style={{ backgroundColor: swatch }}
                                />
                              )}
                              <span>{color}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {product.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {product.notes}
                    </p>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="space-y-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleQuickAvailability(product)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
                      product.available
                        ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 hover:text-white hover:border-rose-600 text-rose-700 dark:text-rose-300'
                        : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {product.available ? (
                      <>
                        <EyeOff className="w-4 h-4 shrink-0" />
                        <span>إيقاف: غير متوفرة حالياً</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>إعادة تفعيل كـ متوفرة</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                      تحديث: {formatArabicDateTime(product.updatedAtMs)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(product)}
                        aria-label={`تعديل ${product.name}`}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] hover:border-[#c9a24b] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[#c9a24b]" />
                        <span>تعديل</span>
                      </button>

                      {isDeleteArmed ? (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteProduct(product.id);
                            setConfirmDeleteId(null);
                            onToast(`تم حذف «${product.name}» من لوحة الموقع`);
                          }}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                        >
                          تأكيد؟
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(product.id)}
                          aria-label={`حذف ${product.name}`}
                          className="min-h-[36px] min-w-[36px] rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 grid place-items-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
