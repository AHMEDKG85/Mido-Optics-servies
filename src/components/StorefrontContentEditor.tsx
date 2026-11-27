import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Image as ImageIcon, LoaderCircle, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { compressFramePhotoFile } from '../utils/image';
import { authenticatedStorefrontFetch } from '../lib/storefrontProxy';
import { sanitizeWebsiteUrl } from '../utils/optics';

type StorefrontPage = 'optical' | 'sunglasses' | 'contacts' | 'accessories';

interface HomeDepartmentDraft {
  id: string;
  title: string;
  subtitle: string;
  page: StorefrontPage;
  imageUrl: string;
}

interface StorefrontContentDraft {
  storeName: string;
  tagline: string;
  aboutText: string;
  storyBeats: Array<{ title: string; subtitle: string; body: string }>;
  heroModelUrl: string;
  address: string;
  mapLink: string;
  phones: string[];
  whatsapp: string;
  workingHours: string;
  externalAdminUrl: string;
  heroTitle: string;
  heroImageUrl: string;
  aboutTitle: string;
  featuredTitle: string;
  featuredSubtitle: string;
  locationTitle: string;
  locationText: string;
  homeDepartments: HomeDepartmentDraft[];
}

const DEFAULT_DEPARTMENTS: HomeDepartmentDraft[] = [
  {
    id: 'optical',
    title: 'النظارات الطبية',
    subtitle: 'اختيار الإطار وتجربة العدسات المناسبة.',
    page: 'optical',
    imageUrl: '/src/assets/images/optical_tortoise_gold_1795761229680.jpg',
  },
  {
    id: 'sunglasses',
    title: 'النظارات الشمسية',
    subtitle: 'إطارات شمسية بتصميمات متنوعة.',
    page: 'sunglasses',
    imageUrl: '/src/assets/images/sun_havana_amber_1795761231607.jpg',
  },
  {
    id: 'contacts',
    title: 'العدسات اللاصقة',
    subtitle: 'عدسات يومية وشهرية طبية وتجميلية.',
    page: 'contacts',
    imageUrl: '/src/assets/images/contact_lenses_pack_1795761232288.jpg',
  },
  {
    id: 'accessories',
    title: 'الإكسسوارات',
    subtitle: 'جرابات ومنتجات العناية بالنظارات.',
    page: 'accessories',
    imageUrl: '/src/assets/images/eyewear_accessories_kit_1795761232213.jpg',
  },
];

const EMPTY_CONTENT: StorefrontContentDraft = {
  storeName: 'ميدو للبصريات | MIDO OPTICS',
  tagline: 'حرفية بصرية تجمع بين دقة القياس وأناقة الإطار',
  aboutText: 'أضف نبذة المحل من لوحة التحكم لتظهر هنا.',
  storyBeats: [
    { title: 'لمحة عن ميدو للبصريات', subtitle: 'تعرف على المحل', body: 'اكتب نبذة المحل وتفاصيله من لوحة التحكم.' },
  ],
  heroModelUrl: '',
  address: '',
  mapLink: '',
  phones: [],
  whatsapp: '',
  workingHours: '',
  externalAdminUrl: '',
  heroTitle: 'رؤية واضحة بتصميم يليق بملامحك',
  heroImageUrl: '',
  aboutTitle: 'عن المحل ورؤيتنا',
  featuredTitle: 'إصدارات مختارة',
  featuredSubtitle: 'تشكيلة منتقاة من أحدث الإطارات الطبية والشمسية',
  locationTitle: 'موقع المحل وأرقام التواصل',
  locationText: 'نرحب بكم في فرعنا لفحص النظر وتجربة الإطارات على الطبيعة، أو اطلب عبر الموقع ليصلك الطلب مع الدفع عند الاستلام.',
  homeDepartments: DEFAULT_DEPARTMENTS,
};

const inputClass = 'w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] px-3 py-2 text-sm focus:border-[#c9a24b] focus:outline-none';
const labelClass = 'block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-200';

function normalizeContent(raw: unknown): StorefrontContentDraft {
  if (!raw || typeof raw !== 'object') return EMPTY_CONTENT;
  const data = raw as Record<string, unknown>;
  const arrayValue = (key: string, fallback: string[]): string[] =>
    Array.isArray(data[key]) ? (data[key] as unknown[]).map(String).slice(0, 6) : fallback;
  const departments = Array.isArray(data.homeDepartments)
    ? (data.homeDepartments as unknown[])
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .slice(0, 6)
        .map((item, index) => ({
          id: String(item.id || `section-${index + 1}`).slice(0, 60),
          title: String(item.title || '').slice(0, 100),
          subtitle: String(item.subtitle || '').slice(0, 240),
          page: (['optical', 'sunglasses', 'contacts', 'accessories'].includes(String(item.page))
            ? item.page
            : 'optical') as StorefrontPage,
          imageUrl: String(item.imageUrl || '').slice(0, 180_000),
        }))
    : DEFAULT_DEPARTMENTS;

  return {
    ...EMPTY_CONTENT,
    storeName: String(data.storeName || EMPTY_CONTENT.storeName),
    tagline: String(data.tagline || EMPTY_CONTENT.tagline),
    aboutText: String(data.aboutText || EMPTY_CONTENT.aboutText),
    storyBeats: Array.isArray(data.storyBeats) && data.storyBeats.length > 0
      ? (data.storyBeats as StorefrontContentDraft['storyBeats']).slice(0, 6)
      : EMPTY_CONTENT.storyBeats,
    heroModelUrl: String(data.heroModelUrl || ''),
    address: String(data.address || ''),
    mapLink: String(data.mapLink || ''),
    phones: arrayValue('phones', []),
    whatsapp: String(data.whatsapp || ''),
    workingHours: String(data.workingHours || ''),
    externalAdminUrl: String(data.externalAdminUrl || ''),
    heroTitle: String(data.heroTitle ?? EMPTY_CONTENT.heroTitle),
    heroImageUrl: String(data.heroImageUrl || ''),
    aboutTitle: String(data.aboutTitle ?? EMPTY_CONTENT.aboutTitle),
    featuredTitle: String(data.featuredTitle ?? EMPTY_CONTENT.featuredTitle),
    featuredSubtitle: String(data.featuredSubtitle ?? EMPTY_CONTENT.featuredSubtitle),
    locationTitle: String(data.locationTitle ?? EMPTY_CONTENT.locationTitle),
    locationText: String(data.locationText ?? EMPTY_CONTENT.locationText),
    homeDepartments: departments,
  };
}

interface StorefrontContentEditorProps {
  websiteUrl: string;
  storefrontAdminUserId?: string | null;
  onToast: (message: string) => void;
}

export function StorefrontContentEditor({ websiteUrl, storefrontAdminUserId, onToast }: StorefrontContentEditorProps) {
  const [draft, setDraft] = useState(EMPTY_CONTENT);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let active = true;
    if (!storefrontAdminUserId) {
      setLoaded(false);
      setLoading(false);
      setLoadError('');
      return () => { active = false; };
    }
    const target = sanitizeWebsiteUrl(websiteUrl);
    if (!target) {
      setLoaded(false);
      return () => { active = false; };
    }

    setLoading(true);
    setLoadError('');
    void authenticatedStorefrontFetch('/api/storefront/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ websiteUrl: target, path: '/api/external/store', method: 'GET' }),
    })
      .then(async (response) => {
        const result = (await response.json()) as { ok?: boolean; data?: unknown };
        if (!response.ok || !result.ok || !result.data) throw new Error('تعذر قراءة بيانات الموقع');
        if (active) {
          setDraft(normalizeContent(result.data));
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setLoaded(false);
          setLoadError('تعذر تحميل محتوى المتجر. راجع مفتاح المزامنة ورابط الموقع ثم اضغط تحديث.');
          onToast('تعذر تحميل بيانات الموقع. تأكد من رابط الموقع واتصال المزامنة.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [websiteUrl, storefrontAdminUserId, onToast, reloadTick]);

  const setField = <K extends keyof StorefrontContentDraft>(key: K, value: StorefrontContentDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const uploadImage = async (file: File, done: (url: string) => void) => {
    try {
      done(await compressFramePhotoFile(file, 300, 0.6));
    } catch {
      onToast('تعذر معالجة الصورة. جرّب صورة أخرى.');
    }
  };

  const updateDepartment = (index: number, patch: Partial<HomeDepartmentDraft>) => {
    setDraft((current) => ({
      ...current,
      homeDepartments: current.homeDepartments.map((section, idx) =>
        idx === index ? { ...section, ...patch } : section,
      ),
    }));
  };

  const moveDepartment = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draft.homeDepartments.length) return;
    const next = [...draft.homeDepartments];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setField('homeDepartments', next);
  };

  const updateStoryBeat = (
    index: number,
    patch: Partial<StorefrontContentDraft['storyBeats'][number]>
  ) => {
    setDraft((current) => ({
      ...current,
      storyBeats: current.storyBeats.map((beat, idx) =>
        idx === index ? { ...beat, ...patch } : beat,
      ),
    }));
  };

  const handleSave = async () => {
    const target = sanitizeWebsiteUrl(websiteUrl);
    if (!target || !loaded) return;
    if (!draft.storeName.trim() || !draft.tagline.trim() || !draft.aboutText.trim()) {
      onToast('أكمل اسم المتجر والعبارة التعريفية والنبذة أولاً.');
      return;
    }
    if (!draft.address.trim() || !draft.phones.some((phone) => phone.trim()) || !draft.workingHours.trim()) {
      onToast('أكمل العنوان ورقم هاتف واحداً على الأقل وساعات العمل.');
      return;
    }
    if (draft.homeDepartments.some((section) => !section.title.trim())) {
      onToast('أدخل عنواناً لكل بطاقة ظاهرة في الصفحة الرئيسية.');
      return;
    }
    if (draft.storyBeats.some((beat) => beat.title.trim().length < 2 || beat.body.trim().length < 4)) {
      onToast('أكمل عنوان ونص كل محطة في قصة المتجر.');
      return;
    }

    setSaving(true);
    try {
      const response = await authenticatedStorefrontFetch('/api/storefront/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: target,
          path: '/api/external/store',
          method: 'PUT',
          payload: {
            ...draft,
            phones: draft.phones.map((phone) => phone.trim()).filter(Boolean).slice(0, 6),
            homeDepartments: draft.homeDepartments.slice(0, 6),
          },
        }),
      });
      const result = (await response.json()) as { ok?: boolean; upstreamStatus?: number; data?: unknown };
      if (!response.ok || !result.ok) {
        throw new Error(`تعذر حفظ المحتوى (رمز ${result.upstreamStatus || response.status})`);
      }
      if (result.data) setDraft(normalizeContent(result.data));
      onToast('تم حفظ محتوى الموقع والصور والعنوان بنجاح.');
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'تعذر حفظ محتوى الموقع');
    } finally {
      setSaving(false);
    }
  };

  const imagePicker = (label: string, value: string, onChange: (next: string) => void) => (
    <div className="space-y-2">
      <label className={labelClass}>
        <span>{label}</span>
        <input type="url" dir="ltr" value={value.startsWith('data:') ? '' : value} onChange={(event) => onChange(event.target.value)} placeholder="https://..." className={inputClass} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200">
          <ImageIcon className="h-4 w-4 text-[#c9a24b]" />
          رفع صورة من الجهاز
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadImage(file, onChange);
              event.target.value = '';
            }}
          />
        </label>
        {value && (
          <>
            <img src={value} alt="معاينة الصورة" className="h-14 w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 object-cover" />
          <button type="button" onClick={() => onChange('')} className="inline-flex min-h-[44px] items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
              <Trash2 className="h-3.5 w-3.5" /> إزالة الصورة
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-4" aria-label="محرر محتوى الموقع">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">محتوى الصفحة الرئيسية</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">عدّل النصوص والعنوان والصور وبطاقات الأقسام. التغييرات تُحفظ على موقع المتجر.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setReloadTick((tick) => tick + 1)} disabled={loading || !storefrontAdminUserId} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={!loaded || loading || saving} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving || loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'جارٍ الحفظ...' : loading ? 'جارٍ تحميل المحتوى...' : 'حفظ محتوى الموقع'}
          </button>
        </div>
      </div>

      {!loaded ? (
        <p className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-xs font-semibold text-amber-800 dark:text-amber-200">
          {loading
            ? 'يتم تحميل بيانات المتجر...'
            : loadError
              ? loadError
            : !storefrontAdminUserId
              ? 'اربط حساب إدارة المتجر الموثّق من زر «ربط حساب إدارة المتجر» حتى تتمكن من تعديل المحتوى.'
              : 'احفظ رابط موقع الويب بالأعلى ثم أعد تحميل المحتوى.'}
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className={labelClass}><span>اسم المتجر</span><input value={draft.storeName} maxLength={140} onChange={(e) => setField('storeName', e.target.value)} className={inputClass} /></label>
            <label className={labelClass}><span>العبارة التعريفية</span><input value={draft.tagline} maxLength={240} onChange={(e) => setField('tagline', e.target.value)} className={inputClass} /></label>
            <label className={labelClass}><span>عنوان الواجهة الرئيسية</span><input value={draft.heroTitle} maxLength={180} onChange={(e) => setField('heroTitle', e.target.value)} className={inputClass} /></label>
            <label className={labelClass}><span>عنوان قسم عن المتجر</span><input value={draft.aboutTitle} maxLength={140} onChange={(e) => setField('aboutTitle', e.target.value)} className={inputClass} /></label>
            <label className={`${labelClass} md:col-span-2`}><span>نبذة عن المتجر</span><textarea value={draft.aboutText} maxLength={2000} rows={3} onChange={(e) => setField('aboutText', e.target.value)} className={inputClass} /></label>
            <label className={`${labelClass} md:col-span-2`}><span>رابط نموذج النظارة ثلاثي الأبعاد (اختياري)</span><input type="url" dir="ltr" value={draft.heroModelUrl} maxLength={500} onChange={(e) => setField('heroModelUrl', e.target.value)} placeholder="https://.../model.glb" className={inputClass} /></label>
          </div>

          {imagePicker('صورة الواجهة الرئيسية (إزالتها تعيد مشهد النظارة ثلاثي الأبعاد)', draft.heroImageUrl, (heroImageUrl) => setField('heroImageUrl', heroImageUrl))}

          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">محطات قصة المتجر</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">تظهر مع حركة النظارة في الواجهة الرئيسية.</p>
              </div>
              <button type="button" disabled={draft.storyBeats.length >= 6} onClick={() => setField('storyBeats', [...draft.storyBeats, { title: 'محطة جديدة', subtitle: '', body: 'اكتب تفاصيل المحطة هنا.' }])} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#c9a24b]/50 px-3 text-xs font-bold text-[#8f6c1e] disabled:opacity-50 dark:text-[#e8cf8b]"><Plus className="h-4 w-4" /> إضافة محطة</button>
            </div>
            {draft.storyBeats.map((beat, index) => (
              <article key={`beat-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 md:grid-cols-3">
                <label className={labelClass}><span>العنوان</span><input value={beat.title} maxLength={120} onChange={(e) => updateStoryBeat(index, { title: e.target.value })} className={inputClass} /></label>
                <label className={labelClass}><span>العنوان الفرعي</span><input value={beat.subtitle} maxLength={160} onChange={(e) => updateStoryBeat(index, { subtitle: e.target.value })} className={inputClass} /></label>
                <div className="flex items-end gap-2">
                  <label className={`${labelClass} flex-1`}><span>النص</span><textarea value={beat.body} maxLength={600} rows={2} onChange={(e) => updateStoryBeat(index, { body: e.target.value })} className={inputClass} /></label>
                  <button type="button" aria-label="حذف محطة القصة" disabled={draft.storyBeats.length <= 1} onClick={() => setField('storyBeats', draft.storyBeats.filter((_, idx) => idx !== index))} className="mb-0.5 grid min-h-11 min-w-11 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-30 dark:text-rose-400 dark:hover:bg-rose-950/30"><Trash2 className="h-4 w-4" /></button>
                </div>
              </article>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 md:grid-cols-2">
            <label className={labelClass}><span>عنوان المنتجات المختارة</span><input value={draft.featuredTitle} maxLength={140} onChange={(e) => setField('featuredTitle', e.target.value)} className={inputClass} /></label>
            <label className={labelClass}><span>وصف المنتجات المختارة</span><input value={draft.featuredSubtitle} maxLength={300} onChange={(e) => setField('featuredSubtitle', e.target.value)} className={inputClass} /></label>
            <label className={labelClass}><span>عنوان الموقع والتواصل</span><input value={draft.locationTitle} maxLength={140} onChange={(e) => setField('locationTitle', e.target.value)} className={inputClass} /></label>
            <label className={labelClass}><span>النص التعريفي للموقع</span><textarea value={draft.locationText} maxLength={1000} rows={2} onChange={(e) => setField('locationText', e.target.value)} className={inputClass} /></label>
            <label className={`${labelClass} md:col-span-2`}><span>عنوان الفرع (اكتب أي عنوان تريده)</span><input value={draft.address} maxLength={300} onChange={(e) => setField('address', e.target.value)} className={inputClass} /></label>
            <label className={labelClass}><span>رابط خرائط Google</span><input type="url" dir="ltr" value={draft.mapLink} maxLength={400} onChange={(e) => setField('mapLink', e.target.value)} className={inputClass} /></label>
            <label className={labelClass}><span>رقم واتساب</span><input dir="ltr" value={draft.whatsapp} maxLength={30} onChange={(e) => setField('whatsapp', e.target.value)} className={inputClass} /></label>
            <label className={labelClass}><span>أرقام الهاتف (رقم في كل سطر)</span><textarea dir="ltr" value={draft.phones.join('\n')} maxLength={180} rows={2} onChange={(e) => setField('phones', e.target.value.split('\n').slice(0, 6))} className={inputClass} /></label>
            <label className={labelClass}><span>ساعات العمل</span><input value={draft.workingHours} maxLength={200} onChange={(e) => setField('workingHours', e.target.value)} className={inputClass} /></label>
          </div>

          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">بطاقات الصور والأقسام</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">عدّل الصورة والنص، أو احذف البطاقة لإزالتها من الرئيسية.</p>
              </div>
              <button type="button" disabled={draft.homeDepartments.length >= 6} onClick={() => setField('homeDepartments', [...draft.homeDepartments, { id: `section-${Date.now()}`, title: '', subtitle: '', page: 'optical', imageUrl: '' }])} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#c9a24b]/50 px-3 text-xs font-bold text-[#8f6c1e] disabled:opacity-50 dark:text-[#e8cf8b]">
                <Plus className="h-4 w-4" /> إضافة بطاقة
              </button>
            </div>
            {draft.homeDepartments.length === 0 && <p className="rounded-xl bg-slate-50 dark:bg-[#101c28] p-3 text-xs text-slate-500 dark:text-slate-400">لا توجد بطاقات ظاهرة على الصفحة الرئيسية.</p>}
            {draft.homeDepartments.map((section, index) => (
              <article key={section.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">بطاقة {index + 1}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="رفع ترتيب البطاقة" onClick={() => moveDepartment(index, -1)} disabled={index === 0} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-[#203141]"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" aria-label="خفض ترتيب البطاقة" onClick={() => moveDepartment(index, 1)} disabled={index === draft.homeDepartments.length - 1} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-[#203141]"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" aria-label="حذف البطاقة" onClick={() => setField('homeDepartments', draft.homeDepartments.filter((_, idx) => idx !== index))} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className={labelClass}><span>العنوان</span><input value={section.title} maxLength={100} onChange={(e) => updateDepartment(index, { title: e.target.value })} className={inputClass} /></label>
                  <label className={labelClass}><span>الوصف</span><input value={section.subtitle} maxLength={240} onChange={(e) => updateDepartment(index, { subtitle: e.target.value })} className={inputClass} /></label>
                  <label className={labelClass}><span>القسم عند الضغط</span><select value={section.page} onChange={(e) => updateDepartment(index, { page: e.target.value as StorefrontPage })} className={inputClass}><option value="optical">نظارات طبية</option><option value="sunglasses">نظارات شمسية</option><option value="contacts">عدسات لاصقة</option><option value="accessories">إكسسوارات</option></select></label>
                </div>
                {imagePicker('صورة البطاقة (اختياري)', section.imageUrl, (imageUrl) => updateDepartment(index, { imageUrl }))}
              </article>
            ))}
          </div>

          <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-4">
            <button type="button" onClick={() => void handleSave()} disabled={!loaded || saving} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-extrabold text-white disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'جارٍ الحفظ...' : 'حفظ كل تغييرات الموقع'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
