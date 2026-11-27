import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Image as ImageIcon, LoaderCircle, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { compressFramePhotoFile } from '../utils/image';
import { authenticatedStorefrontFetch } from '../lib/storefrontProxy';
import { sanitizeWebsiteUrl } from '../utils/optics';

type CatalogCategory = 'prescription' | 'sunglasses' | 'contact_lenses' | 'accessories';

interface CatalogVariant {
  id?: number;
  colorName: string;
  colorHex: string;
  stock: number;
  images: string[];
  sortOrder?: number;
}

interface CatalogProduct {
  id: number;
  slug: string;
  name: string;
  category: CatalogCategory;
  price: number;
  shortDesc: string;
  fullDesc: string;
  frameShape: string;
  material: string;
  dimensions: string;
  published: boolean;
  allowPreorder: boolean;
  preorderNote: string;
  variants: CatalogVariant[];
}

type ProductDraft = Omit<CatalogProduct, 'id' | 'variants'> & { id?: number; variants: CatalogVariant[] };

const CATEGORIES: Array<{ id: CatalogCategory; label: string }> = [
  { id: 'prescription', label: 'نظارات طبية' },
  { id: 'sunglasses', label: 'نظارات شمسية' },
  { id: 'contact_lenses', label: 'عدسات لاصقة' },
  { id: 'accessories', label: 'إكسسوارات' },
];

const DEFAULT_VARIANT: CatalogVariant = {
  colorName: 'أسود',
  colorHex: '#141413',
  stock: 1,
  images: [],
};

const INPUT = 'w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] px-3 py-2 text-sm focus:border-[#c9a24b] focus:outline-none';
const LABEL = 'block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-200';

function makeBlankDraft(): ProductDraft {
  return {
    slug: '',
    name: '',
    category: 'prescription',
    price: 0,
    shortDesc: '',
    fullDesc: '',
    frameShape: 'classic',
    material: '',
    dimensions: '',
    published: true,
    allowPreorder: false,
    preorderNote: '',
    variants: [{ ...DEFAULT_VARIANT, images: [...DEFAULT_VARIANT.images] }],
  };
}

function asDraft(product: CatalogProduct): ProductDraft {
  return {
    ...product,
    variants: product.variants.length
      ? product.variants.map((variant) => ({ ...variant, images: [...variant.images] }))
      : [{ ...DEFAULT_VARIANT, images: [...DEFAULT_VARIANT.images] }],
  };
}

interface StorefrontCatalogEditorProps {
  websiteUrl: string;
  storefrontAdminUserId?: string | null;
  onToast: (message: string) => void;
}

export function StorefrontCatalogEditor({ websiteUrl, storefrontAdminUserId, onToast }: StorefrontCatalogEditorProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [compressingImage, setCompressingImage] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [queryText, setQueryText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const target = sanitizeWebsiteUrl(websiteUrl);

  const loadProducts = useCallback(async () => {
    if (!storefrontAdminUserId) {
      setProducts([]);
      setLoading(false);
      setLoadError('اربط حساب إدارة المتجر الموثّق من زر «ربط حساب إدارة المتجر» حتى تتمكن من تعديل الكتالوج.');
      return;
    }
    if (!target) {
      setLoadError('احفظ رابط موقع الويب بالأعلى لتحميل المنتجات.');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const response = await authenticatedStorefrontFetch('/api/storefront/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: target, path: '/api/external/products', method: 'GET' }),
      });
      const result = (await response.json()) as { ok?: boolean; upstreamStatus?: number; data?: unknown };
      if (!response.ok || !result.ok || !Array.isArray(result.data)) {
        const status = result.upstreamStatus || response.status;
        throw new Error(status === 401
          ? 'مفتاح المزامنة غير متطابق. اجعل EXTERNAL_SYNC_SECRET في الموقع مطابقاً لـ MIDO_SYNC_SECRET في لوحة الخدمات.'
          : `تعذر جلب منتجات المتجر (HTTP ${status}).`);
      }
      setProducts(result.data as CatalogProduct[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'تعذر جلب منتجات المتجر.');
    } finally {
      setLoading(false);
    }
  }, [target, storefrontAdminUserId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts, reloadTick]);

  const updateVariant = (index: number, patch: Partial<CatalogVariant>) => {
    setDraft((current) => current && ({
      ...current,
      variants: current.variants.map((variant, i) => i === index ? { ...variant, ...patch } : variant),
    }));
  };

  const handleVariantImage = async (index: number, file: File) => {
    setCompressingImage(true);
    try {
      const image = await compressFramePhotoFile(file, 560, 0.62);
      updateVariant(index, { images: [...(draft?.variants[index]?.images || []), image].slice(0, 5) });
    } catch {
      onToast('تعذر تجهيز صورة المنتج.');
    } finally {
      setCompressingImage(false);
    }
  };

  const saveDraft = async () => {
    if (!draft || !target) return;
    const cleanDraft: ProductDraft = {
      ...draft,
      name: draft.name.trim(),
      shortDesc: draft.shortDesc.trim(),
      fullDesc: draft.fullDesc.trim(),
      variants: draft.variants.map((variant) => ({
        ...variant,
        colorName: variant.colorName.trim(),
        stock: Math.max(0, Math.trunc(Number(variant.stock) || 0)),
        images: variant.images.map((image) => image.trim()).filter(Boolean).slice(0, 5),
      })),
    };
    if (cleanDraft.name.length < 2 || cleanDraft.shortDesc.length < 2 || cleanDraft.fullDesc.length < 2) {
      onToast('أدخل اسم المنتج ووصفاً مختصراً وتفصيلياً.');
      return;
    }
    if (!Number.isFinite(Number(cleanDraft.price)) || Number(cleanDraft.price) < 0) {
      onToast('أدخل سعراً صحيحاً.');
      return;
    }
    if (!cleanDraft.variants.length || cleanDraft.variants.some((variant) => !variant.colorName || !/^#[0-9a-fA-F]{3,8}$/.test(variant.colorHex) || variant.images.length === 0)) {
      onToast('أكمل كل لون بصورة واحدة على الأقل وكود لون صالح.');
      return;
    }
    const imageChars = cleanDraft.variants.reduce(
      (total, variant) => total + variant.images.reduce((sum, image) => sum + image.length, 0),
      0,
    );
    if (imageChars > 2_500_000) {
      onToast('حجم صور المنتج كبير. قلّل عدد الصور أو ارفع صوراً أصغر.');
      return;
    }

    setSaving(true);
    try {
      const method = cleanDraft.id ? 'PUT' : 'POST';
      const path = cleanDraft.id
        ? `/api/external/products/${encodeURIComponent(String(cleanDraft.id))}`
        : '/api/external/products';
      const payload: Record<string, unknown> = { ...cleanDraft };
      if (!cleanDraft.id) delete payload.slug;
      const response = await authenticatedStorefrontFetch('/api/storefront/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: target, path, method, payload }),
      });
      const result = (await response.json()) as { ok?: boolean; upstreamStatus?: number; data?: { error?: string } };
      if (!response.ok || !result.ok) {
        throw new Error(result.data?.error || `تعذر حفظ المنتج (HTTP ${result.upstreamStatus || response.status}).`);
      }
      setDraft(null);
      setReloadTick((tick) => tick + 1);
      onToast(cleanDraft.id ? 'تم تحديث المنتج وصوره ومخزونه على الموقع.' : 'تمت إضافة المنتج إلى كتالوج الموقع.');
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'تعذر حفظ المنتج.');
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product: CatalogProduct) => {
    if (!target) return;
    try {
      const response = await authenticatedStorefrontFetch('/api/storefront/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: target, path: `/api/external/products/${product.id}`, method: 'DELETE' }),
      });
      const result = (await response.json()) as { ok?: boolean; upstreamStatus?: number };
      if (!response.ok || !result.ok) throw new Error(`تعذر حذف المنتج (HTTP ${result.upstreamStatus || response.status}).`);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setConfirmDeleteId(null);
      onToast(`تم حذف «${product.name}» من كتالوج الموقع.`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'تعذر حذف المنتج.');
    }
  };

  const filtered = products.filter((product) => {
    const needle = queryText.trim().toLowerCase();
    return !needle || `${product.name} ${product.slug} ${product.category}`.toLowerCase().includes(needle);
  });

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-4" aria-label="إدارة كتالوج المتجر الأصلي">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">كتالوج المتجر الأصلي</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">تحكم مباشر في المنتجات الحالية على الموقع: السعر، الوصف، الصور، الألوان، المخزون والنشر.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setReloadTick((tick) => tick + 1)} disabled={loading} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        <button type="button" onClick={() => setDraft(makeBlankDraft())} disabled={!target || !storefrontAdminUserId || loading} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#c9a24b] px-3 text-xs font-extrabold text-white disabled:opacity-50">
            <Plus className="h-4 w-4" /> إضافة منتج
          </button>
        </div>
      </div>

      {loadError && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">{loadError}</p>}

      {draft && (
        <div className="space-y-4 rounded-xl border border-[#c9a24b]/50 bg-[#fffcf5] p-3 dark:bg-[#101c28] sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">{draft.id ? 'تعديل منتج الموقع' : 'إضافة منتج إلى الموقع'}</h4>
            <button type="button" aria-label="إغلاق محرر المنتج" onClick={() => setDraft(null)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-[#203141]"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className={LABEL}><span>اسم المنتج</span><input value={draft.name} maxLength={140} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={INPUT} /></label>
            <label className={LABEL}><span>الفئة</span><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as CatalogCategory })} className={INPUT}>{CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
            <label className={LABEL}><span>السعر بالجنيه المصري</span><input type="number" min="0" max="500000" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} className={INPUT} /></label>
            <label className={LABEL}><span>شكل الإطار</span><input value={draft.frameShape} maxLength={60} onChange={(e) => setDraft({ ...draft, frameShape: e.target.value })} className={INPUT} /></label>
            <label className={LABEL}><span>الخامة</span><input value={draft.material} maxLength={120} onChange={(e) => setDraft({ ...draft, material: e.target.value })} className={INPUT} /></label>
            <label className={LABEL}><span>المقاسات</span><input value={draft.dimensions} maxLength={120} onChange={(e) => setDraft({ ...draft, dimensions: e.target.value })} className={INPUT} /></label>
            <label className={`${LABEL} md:col-span-3`}><span>وصف مختصر</span><textarea rows={2} maxLength={320} value={draft.shortDesc} onChange={(e) => setDraft({ ...draft, shortDesc: e.target.value })} className={INPUT} /></label>
            <label className={`${LABEL} md:col-span-3`}><span>الوصف التفصيلي</span><textarea rows={3} maxLength={2000} value={draft.fullDesc} onChange={(e) => setDraft({ ...draft, fullDesc: e.target.value })} className={INPUT} /></label>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} className="accent-[#c9a24b]" /> نشر المنتج على الموقع</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.allowPreorder} onChange={(e) => setDraft({ ...draft, allowPreorder: e.target.checked })} className="accent-[#c9a24b]" /> السماح بالحجز المسبق</label>
          </div>
          {draft.allowPreorder && <label className={LABEL}><span>ملاحظة الحجز المسبق</span><input value={draft.preorderNote} maxLength={200} onChange={(e) => setDraft({ ...draft, preorderNote: e.target.value })} className={INPUT} /></label>}

          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">الألوان والصور والمخزون</h5>
              <button type="button" disabled={draft.variants.length >= 15} onClick={() => setDraft({ ...draft, variants: [...draft.variants, { colorName: '', colorHex: '#141413', stock: 0, images: [] }] })} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"><Plus className="h-3.5 w-3.5" /> إضافة لون</button>
            </div>
            {draft.variants.map((variant, index) => (
              <article key={variant.id || `new-variant-${index}`} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-[#15232f]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">اللون {index + 1}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="رفع اللون" disabled={index === 0} onClick={() => { const variants = [...draft.variants]; [variants[index - 1], variants[index]] = [variants[index], variants[index - 1]]; setDraft({ ...draft, variants }); }} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" aria-label="خفض اللون" disabled={index === draft.variants.length - 1} onClick={() => { const variants = [...draft.variants]; [variants[index + 1], variants[index]] = [variants[index], variants[index + 1]]; setDraft({ ...draft, variants }); }} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" aria-label="حذف اللون" disabled={draft.variants.length <= 1} onClick={() => setDraft({ ...draft, variants: draft.variants.filter((_, i) => i !== index) })} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-rose-600 disabled:opacity-30 dark:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className={LABEL}><span>اسم اللون</span><input value={variant.colorName} maxLength={80} onChange={(e) => updateVariant(index, { colorName: e.target.value })} className={INPUT} /></label>
                  <label className={LABEL}><span>كود اللون</span><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(variant.colorHex) ? variant.colorHex : '#141413'} onChange={(e) => updateVariant(index, { colorHex: e.target.value })} className={`${INPUT} p-1`} /></label>
                  <label className={LABEL}><span>المخزون</span><input type="number" min="0" max="10000" step="1" value={variant.stock} onChange={(e) => updateVariant(index, { stock: Number(e.target.value) })} className={INPUT} /></label>
                </div>
                <label className={LABEL}><span>روابط الصور (رابط واحد في كل سطر)</span><textarea dir="ltr" rows={2} value={variant.images.join('\n')} onChange={(e) => updateVariant(index, { images: e.target.value.split('\n').slice(0, 5) })} className={INPUT} /></label>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"><ImageIcon className="h-4 w-4 text-[#c9a24b]" />رفع صورة<input type="file" accept="image/*" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleVariantImage(index, file); e.target.value = ''; }} /></label>
                  {variant.images.map((image, imageIndex) => <div key={`${imageIndex}-${image.slice(0, 25)}`} className="relative"><img src={image} alt={`صورة ${variant.colorName || index + 1}`} className="h-12 w-16 rounded-md border border-slate-200 object-cover dark:border-slate-700" /><button type="button" aria-label="إزالة الصورة" onClick={() => updateVariant(index, { images: variant.images.filter((_, i) => i !== imageIndex) })} className="absolute -right-2 -top-2 grid min-h-10 min-w-10 place-items-center rounded-full bg-rose-600 text-white"><X className="h-4 w-4" /></button></div>)}
                </div>
              </article>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">إلغاء</button>
            <button type="button" onClick={() => void saveDraft()} disabled={saving || compressingImage || !storefrontAdminUserId} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-extrabold text-white disabled:opacity-50">{saving || compressingImage ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {compressingImage ? 'تجهيز الصورة...' : 'حفظ المنتج'}</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input type="search" value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="ابحث باسم المنتج أو الفئة..." className={`${INPUT} max-w-md`} />
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{loading ? 'جارٍ تحميل المنتجات...' : `${filtered.length} منتج`}</span>
      </div>

      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />تحميل كتالوج الموقع</div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500 dark:bg-[#101c28] dark:text-slate-400">لا توجد منتجات مطابقة. أضف منتجاً جديداً أو حدّث القائمة.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const firstImage = product.variants.flatMap((variant) => variant.images)[0] || '';
            return (
              <article key={product.id} className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                {firstImage ? <img src={firstImage} alt={product.name} className="h-20 w-20 shrink-0 rounded-lg bg-slate-100 object-cover dark:bg-[#101c28]" /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-[#101c28]"><ImageIcon className="h-6 w-6" /></div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">{product.name}</h5>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{CATEGORIES.find((item) => item.id === product.category)?.label} · {product.variants.length} لون</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${product.published ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{product.published ? 'منشور' : 'مخفي'}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-[#8f6c1e] dark:text-[#e8cf8b]">{Number(product.price).toLocaleString('en-US')} ج.م</span>
                    <div className="flex gap-1.5">
                      <button type="button" disabled={!storefrontAdminUserId} onClick={() => setDraft(asDraft(product))} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"><Pencil className="h-3.5 w-3.5" /> تعديل</button>
                      {confirmDeleteId === product.id ? <button type="button" disabled={!storefrontAdminUserId} onClick={() => void deleteProduct(product)} className="min-h-11 rounded-lg bg-rose-600 px-2 text-[11px] font-extrabold text-white disabled:opacity-50">تأكيد الحذف</button> : <button type="button" disabled={!storefrontAdminUserId} onClick={() => setConfirmDeleteId(product.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-rose-200 px-2 text-[11px] font-bold text-rose-600 disabled:opacity-50 dark:border-rose-900 dark:text-rose-400"><Trash2 className="h-3.5 w-3.5" /> حذف</button>}
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
}
