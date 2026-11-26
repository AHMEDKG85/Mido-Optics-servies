import React, { useMemo, useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { PriceItemInput } from '../hooks/useOpticsStore';
import {
  PRICE_CATEGORY_LABELS,
  PriceItem,
  PriceItemCategory,
} from '../types/optics';
import { compressFramePhotoFile } from '../utils/image';
import { filterPriceItems, formatArabicDateTime } from '../utils/optics';

interface PriceListPageProps {
  items: PriceItem[];
  onSaveItem: (input: PriceItemInput) => { item: PriceItem; isNew: boolean };
  onDeleteItem: (priceId: string) => void;
  onLoadStarterPrices: () => number;
  onToast: (msg: string) => void;
}

const CATEGORY_TABS: Array<{ id: PriceItemCategory | 'all'; label: string }> = [
  { id: 'all', label: 'الكل' },
  { id: 'frame', label: 'شمبرات' },
  { id: 'lens', label: 'عدسات' },
  { id: 'service', label: 'خدمات' },
];

export const PriceListPage: React.FC<PriceListPageProps> = ({
  items,
  onSaveItem,
  onDeleteItem,
  onLoadStarterPrices,
  onToast,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<PriceItemCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<PriceItemCategory>('frame');
  const [newPrice, setNewPrice] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newPhoto, setNewPhoto] = useState('');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<PriceItemCategory>('frame');
  const [editPrice, setEditPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPhoto, setEditPhoto] = useState('');

  const counts = useMemo(() => {
    let frame = 0;
    let lens = 0;
    let service = 0;
    for (const item of items) {
      if (item.category === 'frame') frame += 1;
      else if (item.category === 'lens') lens += 1;
      else service += 1;
    }
    return { all: items.length, frame, lens, service };
  }, [items]);

  const filtered = useMemo(
    () => filterPriceItems(items, categoryFilter, search),
    [items, categoryFilter, search]
  );

  const resetAddForm = () => {
    setNewName('');
    setNewCategory(categoryFilter === 'all' ? 'frame' : categoryFilter);
    setNewPrice('');
    setNewNotes('');
    setNewPhoto('');
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    resetAddForm();
    setShowAddForm(true);
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    onLoaded: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressFramePhotoFile(file);
      onLoaded(compressed);
    } catch {
      onToast('تعذر تحميل صورة الشمبر');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      onToast('اكتب اسم المنتج أو الخدمة أولاً');
      return;
    }
    const parsedPrice = Number(newPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      onToast('أدخل سعراً صحيحاً');
      return;
    }

    onSaveItem({
      name: trimmed,
      category: newCategory,
      price: parsedPrice,
      notes: newNotes.trim(),
      photo: newCategory === 'frame' ? newPhoto : '',
    });
    resetAddForm();
    setShowAddForm(false);
    onToast('تمت إضافة الصنف إلى قائمة الأسعار');
  };

  const startEdit = (item: PriceItem) => {
    setShowAddForm(false);
    setEditingId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditPrice(String(item.price));
    setEditNotes(item.notes || '');
    setEditPhoto(item.category === 'frame' ? item.photo || '' : '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPhoto('');
  };

  const handleSaveEdit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) {
      onToast('اكتب اسم الصنف أولاً');
      return;
    }
    const parsedPrice = Number(editPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      onToast('أدخل سعراً صحيحاً');
      return;
    }

    onSaveItem({
      id,
      name: trimmed,
      category: editCategory,
      price: parsedPrice,
      notes: editNotes.trim(),
      photo: editCategory === 'frame' ? editPhoto : '',
    });
    setEditingId(null);
    setEditPhoto('');
    onToast('تم تحديث السعر بنجاح');
  };

  const handleLoadStarter = () => {
    const added = onLoadStarterPrices();
    if (added > 0) {
      onToast(`تم تحميل ${added} أصناف استرشادية في قائمة الأسعار`);
    } else {
      onToast('الأصناف الاسترشادية مضافة بالفعل');
    }
  };

  return (
    <section aria-label="قائمة الأسعار" className="space-y-5">
      {/* Header Summary Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
            <Tag className="w-5 h-5 text-[#c9a24b]" />
            <span>قائمة الأسعار والخدمات</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            احفظ وحدّث أسعار الشمبرات والعدسات وخدمات الصيانة لاستخدامها كمرجع تلقائي وسريع عند إضافة عملاء جدد.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums pt-0.5">
            إجمالي الأصناف: {counts.all} · شمبرات: {counts.frame} · عدسات: {counts.lens} · خدمات: {counts.service}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => (showAddForm ? setShowAddForm(false) : handleOpenAdd())}
            className="flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showAddForm ? 'إغلاق النموذج' : 'إضافة صنف جديد'}</span>
          </button>

          {items.length === 0 && (
            <button
              type="button"
              onClick={handleLoadStarter}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#c9a24b]" />
              <span>تحميل أسعار استرشادية</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Price Item Form */}
      {showAddForm && (
        <form
          onSubmit={handleSubmitNew}
          aria-label="إضافة صنف إلى قائمة الأسعار"
          className="rounded-2xl border border-[#c9a24b]/60 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
              إضافة منتج أو خدمة جديدة
            </h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              aria-label="إغلاق نموذج الإضافة"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
            >
              إلغاء
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="sm:col-span-2 lg:col-span-2">
              <label
                htmlFor="price-item-name"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                اسم المنتج أو الخدمة *
              </label>
              <input
                id="price-item-name"
                required
                maxLength={120}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: عدسات Blue Cut أو شمبر تيتانيوم"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            <div>
              <label
                htmlFor="price-item-category"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                الفئة *
              </label>
              <select
                id="price-item-category"
                value={newCategory}
                onChange={(e) => {
                  const nextCat = e.target.value as PriceItemCategory;
                  setNewCategory(nextCat);
                  if (nextCat !== 'frame') {
                    setNewPhoto('');
                  }
                }}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm font-semibold focus:outline-none focus:border-[#c9a24b]"
              >
                <option value="frame">شمبر</option>
                <option value="lens">عدسات</option>
                <option value="service">خدمات وإصلاحات</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="price-item-amount"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                السعر (جنيه) *
              </label>
              <input
                id="price-item-amount"
                type="number"
                required
                min="0"
                step="any"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="0"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm font-bold tabular-nums focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            <div className={newCategory === 'frame' ? 'sm:col-span-2 lg:col-span-4' : 'sm:col-span-2 lg:col-span-3'}>
              <label
                htmlFor="price-item-notes"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                مواصفات أو ملاحظات (اختياري)
              </label>
              <input
                id="price-item-notes"
                maxLength={240}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="تفاصيل الخامة، المعالجة، أو الضمان..."
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            {newCategory === 'frame' && (
              <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-[#c9a24b]/60 bg-[#f3f9fd]/70 dark:bg-[#1b3042]/45 p-3">
                <label
                  htmlFor="price-item-photo"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mb-2"
                >
                  <ImageIcon className="w-4 h-4 text-[#c9a24b]" />
                  <span>صورة الشمبر (اختياري — تضاف تلقائياً عند اختيار هذا الشمبر للعميل)</span>
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id="price-item-photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handlePhotoUpload(e, setNewPhoto)}
                    className="flex-1 min-w-[200px] text-xs file:ml-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:bg-[#e3f2fb] dark:file:bg-[#1b3042] file:text-[#8f6c1e] dark:file:text-[#e8cf8b] file:font-semibold file:cursor-pointer"
                  />
                  {newPhoto && (
                    <div className="flex items-center gap-2.5">
                      <img
                        src={newPhoto}
                        alt="معاينة صورة الشمبر"
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-lg border border-slate-200 dark:border-slate-700 object-cover bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setNewPhoto('')}
                        className="text-xs font-semibold text-rose-600 dark:text-rose-400 underline cursor-pointer"
                      >
                        إزالة الصورة
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>حفظ السعر</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="تصفية قائمة الأسعار حسب الفئة"
          className="grid grid-cols-4 sm:flex sm:items-center gap-1 p-1 w-full sm:w-auto rounded-xl bg-slate-200/70 dark:bg-[#15232f] border border-slate-200 dark:border-slate-800"
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
                className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums text-center ${
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

        <div className="relative flex-1 min-w-[230px] max-w-md">
          <Search className="w-4 h-4 text-[#c9a24b] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو المواصفات..."
            aria-label="بحث في قائمة الأسعار"
            className="w-full min-h-[42px] pr-10 pl-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-sm focus:outline-none focus:border-[#c9a24b]"
          />
        </div>
      </div>

      {/* Empty / Filtered / Populated States */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center space-y-3">
          <Tag className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-600" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              قائمة الأسعار فارغة حالياً
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              أضف أسعار الشمبرات والعدسات والخدمات التي يقدمها المحل للرجوع إليها وحساب الإجمالي تلقائياً عند تسجيل أي عميل جديد.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة أول صنف</span>
            </button>
            <button
              type="button"
              onClick={handleLoadStarter}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#c9a24b]" />
              <span>تحميل أسعار استرشادية</span>
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center space-y-2.5">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            لا توجد أصناف مطابقة للبحث أو الفئة المختارة
          </p>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('all');
              setSearch('');
            }}
            className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] cursor-pointer"
          >
            عرض جميع الأصناف
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table (md+) */}
          <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] overflow-hidden">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#101c28] text-xs font-bold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">المنتج / الخدمة</th>
                  <th className="py-3 px-4 w-36">الفئة</th>
                  <th className="py-3 px-4 w-36">السعر</th>
                  <th className="py-3 px-4">ملاحظات</th>
                  <th className="py-3 px-4 w-36">آخر تحديث</th>
                  <th className="py-3 px-4 w-40 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filtered.map((item) => {
                  const isEditing = editingId === item.id;
                  if (isEditing) {
                    return (
                      <tr key={item.id} className="bg-[#f3f9fd] dark:bg-[#1b3042]/60">
                        <td colSpan={6} className="p-3.5">
                          <form
                            onSubmit={(e) => handleSaveEdit(e, item.id)}
                            className="grid grid-cols-12 gap-2.5 items-end"
                          >
                            <div className="col-span-4">
                              <label
                                htmlFor={`edit-name-${item.id}`}
                                className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                              >
                                اسم الصنف *
                              </label>
                              <input
                                id={`edit-name-${item.id}`}
                                required
                                maxLength={120}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0d1722] text-sm"
                              />
                            </div>
                            <div className="col-span-2">
                              <label
                                htmlFor={`edit-cat-${item.id}`}
                                className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                              >
                                الفئة
                              </label>
                              <select
                                id={`edit-cat-${item.id}`}
                                value={editCategory}
                                onChange={(e) => {
                                  const nextCat = e.target.value as PriceItemCategory;
                                  setEditCategory(nextCat);
                                  if (nextCat !== 'frame') {
                                    setEditPhoto('');
                                  }
                                }}
                                className="w-full min-h-[38px] px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0d1722] text-xs font-semibold"
                              >
                                <option value="frame">شمبر</option>
                                <option value="lens">عدسات</option>
                                <option value="service">خدمات وإصلاحات</option>
                              </select>
                            </div>
                            <div className="col-span-2">
                              <label
                                htmlFor={`edit-price-${item.id}`}
                                className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                              >
                                السعر (جنيه)
                              </label>
                              <input
                                id={`edit-price-${item.id}`}
                                type="number"
                                required
                                min="0"
                                step="any"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0d1722] text-sm font-bold tabular-nums"
                              />
                            </div>
                            <div className="col-span-2">
                              <label
                                htmlFor={`edit-notes-${item.id}`}
                                className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                              >
                                ملاحظات
                              </label>
                              <input
                                id={`edit-notes-${item.id}`}
                                maxLength={240}
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0d1722] text-xs"
                              />
                            </div>
                            <div className="col-span-2 flex items-center gap-1.5">
                              <button
                                type="submit"
                                className="flex-1 min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>حفظ</span>
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                aria-label="إلغاء التعديل"
                                className="min-h-[38px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#15232f] text-xs font-semibold cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                            {editCategory === 'frame' && (
                              <div className="col-span-12 pt-1 flex flex-wrap items-center gap-3 border-t border-slate-200/80 dark:border-slate-700/80">
                                <label
                                  htmlFor={`edit-photo-${item.id}`}
                                  className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5"
                                >
                                  <ImageIcon className="w-3.5 h-3.5 text-[#c9a24b]" />
                                  <span>صورة الشمبر:</span>
                                </label>
                                <input
                                  id={`edit-photo-${item.id}`}
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => void handlePhotoUpload(e, setEditPhoto)}
                                  className="text-xs file:ml-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#e3f2fb] dark:file:bg-[#15232f] file:text-[#8f6c1e] dark:file:text-[#e8cf8b] file:font-semibold file:cursor-pointer"
                                />
                                {editPhoto && (
                                  <div className="flex items-center gap-2">
                                    <img
                                      src={editPhoto}
                                      alt={`صورة ${editName || item.name}`}
                                      referrerPolicy="no-referrer"
                                      className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 object-cover bg-white"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setEditPhoto('')}
                                      className="text-xs text-rose-600 dark:text-rose-400 underline cursor-pointer"
                                    >
                                      إزالة الصورة
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </form>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#1b3042]/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2.5">
                          {item.category === 'frame' && item.photo && (
                            <img
                              src={item.photo}
                              alt={`صورة ${item.name}`}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-white"
                            />
                          )}
                          <span>{item.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {PRICE_CATEGORY_LABELS[item.category]}
                      </td>
                      <td className="py-3 px-4 font-extrabold text-[#8f6c1e] dark:text-[#e8cf8b] tabular-nums whitespace-nowrap">
                        {item.price.toLocaleString('en-US')} ج.م
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {item.notes || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatArabicDateTime(item.updatedAtMs)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            aria-label={`تعديل سعر ${item.name}`}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] hover:border-[#c9a24b] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 shadow-xs transition-all active:scale-[0.97] whitespace-nowrap cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[#c9a24b]" />
                            <span>تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteItem(item.id);
                              onToast(`تم حذف ${item.name} من قائمة الأسعار`);
                            }}
                            aria-label={`حذف ${item.name}`}
                            className="min-h-[36px] min-w-[36px] rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 grid place-items-center shadow-xs transition-all active:scale-[0.97] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards (< md) */}
          <div className="md:hidden space-y-3">
            {filtered.map((item) => {
              const isEditing = editingId === item.id;
              if (isEditing) {
                return (
                  <form
                    key={item.id}
                    onSubmit={(e) => handleSaveEdit(e, item.id)}
                    className="rounded-2xl border border-[#c9a24b] bg-white dark:bg-[#15232f] p-4 space-y-3"
                  >
                    <div>
                      <label
                        htmlFor={`m-edit-name-${item.id}`}
                        className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                      >
                        اسم الصنف *
                      </label>
                      <input
                        id={`m-edit-name-${item.id}`}
                        required
                        maxLength={120}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label
                          htmlFor={`m-edit-cat-${item.id}`}
                          className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                        >
                          الفئة
                        </label>
                        <select
                          id={`m-edit-cat-${item.id}`}
                          value={editCategory}
                          onChange={(e) => {
                            const nextCat = e.target.value as PriceItemCategory;
                            setEditCategory(nextCat);
                            if (nextCat !== 'frame') {
                              setEditPhoto('');
                            }
                          }}
                          className="w-full min-h-[42px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-xs font-semibold"
                        >
                          <option value="frame">شمبر</option>
                          <option value="lens">عدسات</option>
                          <option value="service">خدمات وإصلاحات</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`m-edit-price-${item.id}`}
                          className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                        >
                          السعر (جنيه)
                        </label>
                        <input
                          id={`m-edit-price-${item.id}`}
                          type="number"
                          required
                          min="0"
                          step="any"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm font-bold tabular-nums"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor={`m-edit-notes-${item.id}`}
                        className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                      >
                        ملاحظات
                      </label>
                      <input
                        id={`m-edit-notes-${item.id}`}
                        maxLength={240}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm"
                      />
                    </div>
                    {editCategory === 'frame' && (
                      <div className="rounded-xl border border-dashed border-[#c9a24b]/60 bg-[#f3f9fd]/70 dark:bg-[#1b3042]/45 p-3 space-y-2">
                        <label
                          htmlFor={`m-edit-photo-${item.id}`}
                          className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                        >
                          <ImageIcon className="w-4 h-4 text-[#c9a24b]" />
                          <span>صورة الشمبر</span>
                        </label>
                        <input
                          id={`m-edit-photo-${item.id}`}
                          type="file"
                          accept="image/*"
                          onChange={(e) => void handlePhotoUpload(e, setEditPhoto)}
                          className="w-full text-xs file:ml-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#e3f2fb] dark:file:bg-[#1b3042] file:text-[#8f6c1e] dark:file:text-[#e8cf8b] file:font-semibold file:cursor-pointer"
                        />
                        {editPhoto && (
                          <div className="flex items-center gap-2.5">
                            <img
                              src={editPhoto}
                              alt={`صورة ${editName || item.name}`}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-700 object-cover bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => setEditPhoto('')}
                              className="text-xs text-rose-600 dark:text-rose-400 underline cursor-pointer"
                            >
                              إزالة الصورة
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>حفظ التحديث</span>
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                );
              }

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {item.category === 'frame' && item.photo && (
                        <img
                          src={item.photo}
                          alt={`صورة ${item.name}`}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-white"
                        />
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                          {item.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {PRICE_CATEGORY_LABELS[item.category]} · آخر تحديث{' '}
                          {formatArabicDateTime(item.updatedAtMs)}
                        </p>
                      </div>
                    </div>
                    <div className="text-base font-extrabold text-[#8f6c1e] dark:text-[#e8cf8b] tabular-nums whitespace-nowrap shrink-0">
                      {item.price.toLocaleString('en-US')} ج.م
                    </div>
                  </div>

                  {item.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.notes}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      aria-label={`تعديل سعر ${item.name}`}
                      className="flex-1 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4 text-[#c9a24b]" />
                      <span>تعديل السعر</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteItem(item.id);
                        onToast(`تم حذف ${item.name} من قائمة الأسعار`);
                      }}
                      aria-label={`حذف ${item.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 grid place-items-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};
