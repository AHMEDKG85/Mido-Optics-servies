import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Glasses, Phone, Tag, User, X } from 'lucide-react';
import { CustomerRecord, LensInventorySnapshot, PriceItem, UsageType } from '../types/optics';
import { CustomerInput } from '../hooks/useOpticsStore';
import { compressFramePhotoFile } from '../utils/image';
import {
  calculateAutoTotal,
  calculateRemaining,
  formatArabicDateTime,
} from '../utils/optics';
import { EyeLensStatusBadge } from './EyeLensStatusBadge';

interface CustomerFormModalProps {
  isOpen: boolean;
  editingCustomer: CustomerRecord | null;
  lensInventory: LensInventorySnapshot | null;
  priceItems: PriceItem[];
  onOpenPriceList?: () => void;
  onClose: () => void;
  onSave: (input: CustomerInput) => void;
  onToast: (msg: string) => void;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  editingCustomer,
  lensInventory,
  priceItems,
  onOpenPriceList,
  onClose,
  onSave,
  onToast,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [frame, setFrame] = useState('');
  const [lens, setLens] = useState('');
  const [framePrice, setFramePrice] = useState('');
  const [lensPrice, setLensPrice] = useState('');
  const [total, setTotal] = useState('');
  const [paid, setPaid] = useState('');
  const [photo, setPhoto] = useState('');
  const [rs, setRs] = useState('');
  const [rc, setRc] = useState('');
  const [ra, setRa] = useState('');
  const [ls, setLs] = useState('');
  const [lc, setLc] = useState('');
  const [la, setLa] = useState('');
  const [addPower, setAddPower] = useState('');
  const [usageType, setUsageType] = useState<UsageType>('');
  const [clockText, setClockText] = useState('');
  const [photoFromPriceList, setPhotoFromPriceList] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPhotoFromPriceList(false);
    if (editingCustomer) {
      setName(editingCustomer.name);
      setPhone(editingCustomer.phone);
      setFrame(editingCustomer.frame);
      setLens(editingCustomer.lens);
      setFramePrice(
        editingCustomer.framePrice && editingCustomer.framePrice > 0
          ? String(editingCustomer.framePrice)
          : ''
      );
      setLensPrice(
        editingCustomer.lensPrice && editingCustomer.lensPrice > 0
          ? String(editingCustomer.lensPrice)
          : ''
      );
      setTotal(String(editingCustomer.total));
      setPaid(String(editingCustomer.paid));
      setPhoto(editingCustomer.photo || '');
      setRs(editingCustomer.r[0] === '-' ? '' : editingCustomer.r[0]);
      setRc(editingCustomer.r[1] === '-' ? '' : editingCustomer.r[1]);
      setRa(editingCustomer.r[2] === '-' ? '' : editingCustomer.r[2]);
      setLs(editingCustomer.l[0] === '-' ? '' : editingCustomer.l[0]);
      setLc(editingCustomer.l[1] === '-' ? '' : editingCustomer.l[1]);
      setLa(editingCustomer.l[2] === '-' ? '' : editingCustomer.l[2]);
      setAddPower(editingCustomer.add || '');
      setUsageType(editingCustomer.usageType || '');
      setClockText(formatArabicDateTime(editingCustomer.date));
      return;
    }

    setName('');
    setPhone('');
    setFrame('');
    setLens('');
    setFramePrice('');
    setLensPrice('');
    setTotal('');
    setPaid('');
    setPhoto('');
    setRs('');
    setRc('');
    setRa('');
    setLs('');
    setLc('');
    setLa('');
    setAddPower('');
    setUsageType('');

    const updateClock = () =>
      setClockText(
        new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'medium' })
      );
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, editingCustomer]);

  const framePriceItems = useMemo(
    () => priceItems.filter((item) => item.category === 'frame'),
    [priceItems]
  );
  const lensPriceItems = useMemo(
    () => priceItems.filter((item) => item.category === 'lens'),
    [priceItems]
  );
  const servicePriceItems = useMemo(
    () => priceItems.filter((item) => item.category === 'service'),
    [priceItems]
  );

  if (!isOpen) return null;

  const rest = calculateRemaining(Number(total) || 0, Number(paid) || 0);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressFramePhotoFile(file);
      setPhoto(compressed);
      setPhotoFromPriceList(false);
    } catch {
      onToast('تعذر تحميل الصورة');
    } finally {
      e.target.value = '';
    }
  };

  const handleFramePriceChange = (nextFramePrice: string) => {
    setFramePrice(nextFramePrice);
    if (nextFramePrice.trim() === '' && lensPrice.trim() === '') {
      setTotal('');
    } else {
      setTotal(String(calculateAutoTotal(nextFramePrice, lensPrice)));
    }
  };

  const handleLensPriceChange = (nextLensPrice: string) => {
    setLensPrice(nextLensPrice);
    if (framePrice.trim() === '' && nextLensPrice.trim() === '') {
      setTotal('');
    } else {
      setTotal(String(calculateAutoTotal(framePrice, nextLensPrice)));
    }
  };

  const applySavedFrameItem = (picked: PriceItem, showFeedback = true) => {
    const nextPriceStr = String(picked.price);
    setFrame(picked.name);
    setFramePrice(nextPriceStr);
    setTotal(String(calculateAutoTotal(nextPriceStr, lensPrice)));
    if (picked.photo) {
      if (!photo || photoFromPriceList) {
        setPhoto(picked.photo);
        setPhotoFromPriceList(true);
        if (showFeedback) {
          onToast('تم تحديد سعر الشمبر وصورته تلقائياً من قائمة الأسعار');
        }
      } else if (showFeedback) {
        onToast('تم تحديد سعر الشمبر من قائمة الأسعار');
      }
    } else if (photoFromPriceList) {
      setPhoto('');
      setPhotoFromPriceList(false);
    }
  };

  const handlePickFrameFromPriceList = (priceId: string) => {
    const picked = framePriceItems.find((item) => item.id === priceId);
    if (!picked) return;
    applySavedFrameItem(picked, true);
  };

  const handleFrameNameChange = (nextName: string) => {
    setFrame(nextName);
    const normalized = nextName.trim().toLowerCase();
    if (!normalized) return;
    const matched = framePriceItems.find(
      (item) => item.name.trim().toLowerCase() === normalized
    );
    if (matched) {
      if (!framePrice.trim()) {
        setFramePrice(String(matched.price));
        setTotal(String(calculateAutoTotal(String(matched.price), lensPrice)));
      }
      if (matched.photo && (!photo || photoFromPriceList)) {
        setPhoto(matched.photo);
        setPhotoFromPriceList(true);
      }
    }
  };

  const handlePickLensFromPriceList = (priceId: string) => {
    const picked = lensPriceItems.find((item) => item.id === priceId);
    if (!picked) return;
    const nextPriceStr = String(picked.price);
    setLens(picked.name);
    setLensPrice(nextPriceStr);
    setTotal(String(calculateAutoTotal(framePrice, nextPriceStr)));
  };

  const handlePickServiceFromPriceList = (priceId: string) => {
    const picked = servicePriceItems.find((item) => item.id === priceId);
    if (!picked) return;
    const currentLensText = lens.trim();
    const nextLensText = currentLensText
      ? currentLensText.includes(picked.name)
        ? currentLensText
        : `${currentLensText} + ${picked.name}`.slice(0, 120)
      : picked.name;
    const currentLensPriceNum = Math.max(0, Number(lensPrice) || 0);
    const nextLensPriceStr = String(
      Math.round((currentLensPriceNum + picked.price) * 100) / 100
    );
    setLens(nextLensText);
    setLensPrice(nextLensPriceStr);
    setTotal(String(calculateAutoTotal(framePrice, nextLensPriceStr)));
    onToast(`تمت إضافة «${picked.name}» (${picked.price} ج.م)`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      onToast('اكتب اسم العميل أولاً');
      return;
    }

    onSave({
      id: editingCustomer?.id,
      name: trimmedName,
      phone: phone.trim(),
      frame: frame.trim(),
      lens: lens.trim(),
      framePrice: Math.max(0, Number(framePrice) || 0),
      lensPrice: Math.max(0, Number(lensPrice) || 0),
      total: Math.max(0, Number(total) || 0),
      paid: Math.max(0, Number(paid) || 0),
      photo,
      r: [rs.trim() || '-', rc.trim() || '-', ra.trim() || '-'],
      l: [ls.trim() || '-', lc.trim() || '-', la.trim() || '-'],
      add: addPower.trim(),
      usageType,
      pickupDate: editingCustomer?.pickupDate || '',
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-br from-[#e8cf8b] via-[#c9a24b] to-[#a8832f] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Glasses className="w-7 h-7 shrink-0" />
            <div className="min-w-0">
              <h2 id="customer-modal-title" className="text-lg font-extrabold truncate">
                {editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
              </h2>
              <p className="text-xs opacity-90 flex items-center gap-1.5 mt-0.5 truncate">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>{clockText}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="min-h-[38px] min-w-[38px] rounded-xl bg-white/20 hover:bg-white/30 text-white grid place-items-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label
                htmlFor="cust-name"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mb-1"
              >
                <User className="w-3.5 h-3.5 text-[#c9a24b]" />
                <span>اسم العميل *</span>
              </label>
              <input
                id="cust-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="cust-phone"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mb-1"
              >
                <Phone className="w-3.5 h-3.5 text-[#c9a24b]" />
                <span>رقم الهاتف (لواتساب المتابعة)</span>
              </label>
              <input
                id="cust-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm text-right font-mono-num focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="cust-frame"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  نوع الشمبر
                </label>
                <input
                  id="cust-frame"
                  list={framePriceItems.length > 0 ? 'saved-frames-datalist' : undefined}
                  value={frame}
                  onChange={(e) => handleFrameNameChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
                />
                {framePriceItems.length > 0 && (
                  <>
                    <datalist id="saved-frames-datalist">
                      {framePriceItems.map((item) => (
                        <option key={item.id} value={item.name} />
                      ))}
                    </datalist>
                    <select
                      aria-label="اختيار شمبر من قائمة الأسعار"
                      value=""
                      onChange={(e) => handlePickFrameFromPriceList(e.target.value)}
                      className="mt-1.5 w-full min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042] text-xs font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] focus:outline-none focus:border-[#c9a24b]"
                    >
                      <option value="">— اختر شمبر من قائمة الأسعار —</option>
                      {framePriceItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.price} ج.م){item.photo ? ' · بصورة' : ''}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div>
                <label
                  htmlFor="cust-frame-price"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  سعر الشمبر (جنيه)
                </label>
                <input
                  id="cust-frame-price"
                  type="number"
                  min="0"
                  step="any"
                  value={framePrice}
                  onChange={(e) => handleFramePriceChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm tabular-nums focus:outline-none focus:border-[#c9a24b]"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="cust-lens"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  نوع العدسات
                </label>
                <input
                  id="cust-lens"
                  value={lens}
                  onChange={(e) => setLens(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
                />
                {lensPriceItems.length > 0 && (
                  <select
                    aria-label="اختيار عدسات من قائمة الأسعار"
                    value=""
                    onChange={(e) => handlePickLensFromPriceList(e.target.value)}
                    className="mt-1.5 w-full min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042] text-xs font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] focus:outline-none focus:border-[#c9a24b]"
                  >
                    <option value="">— اختر عدسات من قائمة الأسعار —</option>
                    {lensPriceItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.price} ج.م)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label
                  htmlFor="cust-lens-price"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  سعر العدسات (جنيه)
                </label>
                <input
                  id="cust-lens-price"
                  type="number"
                  min="0"
                  step="any"
                  value={lensPrice}
                  onChange={(e) => handleLensPriceChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm tabular-nums focus:outline-none focus:border-[#c9a24b]"
                />
              </div>
            </div>

            {servicePriceItems.length > 0 && (
              <div className="sm:col-span-2">
                <label
                  htmlFor="cust-service-ref"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mb-1"
                >
                  <Tag className="w-3.5 h-3.5 text-[#c9a24b]" />
                  <span>إضافة خدمة أو صيانة من قائمة الأسعار (اختياري)</span>
                </label>
                <select
                  id="cust-service-ref"
                  aria-label="إضافة خدمة من قائمة الأسعار"
                  value=""
                  onChange={(e) => handlePickServiceFromPriceList(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042] text-xs font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] focus:outline-none focus:border-[#c9a24b]"
                >
                  <option value="">— اختر خدمة لإضافتها تلقائياً إلى السعر —</option>
                  {servicePriceItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} (+{item.price} ج.م)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {priceItems.length === 0 && onOpenPriceList && (
              <div className="sm:col-span-2 flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042]/60 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                <span>أضف أسعار الشمبرات والعدسات في «قائمة الأسعار» لاستخدامها كمرجع سريع هنا.</span>
                <button
                  type="button"
                  onClick={onOpenPriceList}
                  className="font-bold text-[#8f6c1e] dark:text-[#e8cf8b] underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  فتح قائمة الأسعار
                </button>
              </div>
            )}

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label
                  htmlFor="cust-total"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  المبلغ الكلي (جنيه)
                </label>
                <input
                  id="cust-total"
                  type="number"
                  min="0"
                  step="any"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm font-bold tabular-nums focus:outline-none focus:border-[#c9a24b]"
                />
                {(framePrice.trim() !== '' || lensPrice.trim() !== '') && (
                  <p className="text-[11px] text-[#8f6c1e] dark:text-[#e8cf8b] mt-1 tabular-nums">
                    يحسب تلقائياً: سعر الشمبر + سعر العدسات
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="cust-paid"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  المبلغ المدفوع (جنيه)
                </label>
                <input
                  id="cust-paid"
                  type="number"
                  min="0"
                  step="any"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm tabular-nums focus:outline-none focus:border-[#c9a24b]"
                />
              </div>

              <div>
                <label
                  htmlFor="cust-rest"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  الباقي
                </label>
                <input
                  id="cust-rest"
                  readOnly
                  value={rest}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#e3f2fb] dark:bg-[#1b3042] text-sm font-bold tabular-nums"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="cust-photo"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                صورة الشمبر (اختياري)
              </label>
              <input
                id="cust-photo"
                type="file"
                accept="image/*"
                onChange={(e) => void handlePhotoChange(e)}
                className="w-full text-xs file:ml-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:bg-[#e3f2fb] dark:file:bg-[#1b3042] file:text-[#8f6c1e] dark:file:text-[#e8cf8b] file:font-semibold file:cursor-pointer"
              />
              {photo && (
                <div className="mt-2 relative inline-block">
                  <img
                    src={photo}
                    alt="معاينة الشمبر"
                    referrerPolicy="no-referrer"
                    className="max-h-36 rounded-xl border border-slate-200 dark:border-slate-700 object-contain"
                  />
                  {photoFromPriceList && (
                    <p className="mt-1 text-[11px] font-semibold text-[#8f6c1e] dark:text-[#e8cf8b]">
                      صورة تلقائية من قائمة الأسعار
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto('');
                      setPhotoFromPriceList(false);
                    }}
                    className="mt-1 block text-xs text-rose-600 dark:text-rose-400 underline cursor-pointer"
                  >
                    إزالة الصورة
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Usage Type: Distance vs Reading */}
          <div className="rounded-2xl bg-[#f3f9fd] dark:bg-[#1b3042]/65 border border-slate-200 dark:border-slate-700 p-3.5">
            <span className="text-xs font-bold text-[#8f6c1e] dark:text-[#e8cf8b] block mb-2">
              نوع النظارة / الاستخدام
            </span>
            <div
              role="group"
              aria-label="نوع الاستخدام مسافات أو قراءة"
              className="grid grid-cols-2 gap-2"
            >
              {(
                [
                  { id: 'distance', label: 'مسافات' },
                  { id: 'reading', label: 'قراءة' },
                ] as const
              ).map((option) => {
                const active = usageType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setUsageType((prev) => (prev === option.id ? '' : option.id))
                    }
                    className={`min-h-[42px] px-4 rounded-xl border text-sm font-bold inline-flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      active
                        ? 'bg-gradient-to-br from-[#d9b65c] to-[#a8832f] border-[#a8832f] text-white shadow-sm'
                        : 'bg-white dark:bg-[#0d1722] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b]'
                    }`}
                  >
                    {active && <Check className="w-4 h-4 shrink-0" />}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Eye */}
          <div className="rounded-2xl bg-[#f3f9fd] dark:bg-[#1b3042]/65 border border-slate-200 dark:border-slate-700 p-3.5">
            <div className="flex items-center gap-2 mb-2.5 font-bold text-sm text-[#8f6c1e] dark:text-[#e8cf8b]">
              <span className="w-6 h-6 rounded-full bg-[#c9a24b] text-white text-xs grid place-items-center">
                R
              </span>
              <span>العين اليمين</span>
            </div>
            <div className="grid grid-cols-3 gap-2" dir="ltr">
              {[
                ['r-sph', 'SPH', rs, setRs],
                ['r-cyl', 'CYL', rc, setRc],
                ['r-axis', 'AXIS', ra, setRa],
              ].map(([id, lbl, val, setter]) => (
                <div key={String(id)}>
                  <label
                    htmlFor={String(id)}
                    className="block text-center text-[11px] font-bold text-[#8f6c1e] dark:text-[#e8cf8b] mb-1"
                  >
                    {String(lbl)}
                  </label>
                  <input
                    id={String(id)}
                    value={String(val)}
                    onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                    className="w-full min-h-[40px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-center font-mono-num text-sm focus:outline-none focus:border-[#c9a24b]"
                  />
                </div>
              ))}
            </div>
            <div className="mt-2.5">
              <EyeLensStatusBadge
                eye="R"
                tuple={[rs.trim() || '-', rc.trim() || '-', ra.trim() || '-']}
                inventory={lensInventory}
              />
            </div>
          </div>

          {/* Left Eye */}
          <div className="rounded-2xl bg-[#f3f9fd] dark:bg-[#1b3042]/65 border border-slate-200 dark:border-slate-700 p-3.5">
            <div className="flex items-center gap-2 mb-2.5 font-bold text-sm text-[#8f6c1e] dark:text-[#e8cf8b]">
              <span className="w-6 h-6 rounded-full bg-[#c9a24b] text-white text-xs grid place-items-center">
                L
              </span>
              <span>العين الشمال</span>
            </div>
            <div className="grid grid-cols-3 gap-2" dir="ltr">
              {[
                ['l-sph', 'SPH', ls, setLs],
                ['l-cyl', 'CYL', lc, setLc],
                ['l-axis', 'AXIS', la, setLa],
              ].map(([id, lbl, val, setter]) => (
                <div key={String(id)}>
                  <label
                    htmlFor={String(id)}
                    className="block text-center text-[11px] font-bold text-[#8f6c1e] dark:text-[#e8cf8b] mb-1"
                  >
                    {String(lbl)}
                  </label>
                  <input
                    id={String(id)}
                    value={String(val)}
                    onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                    className="w-full min-h-[40px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-center font-mono-num text-sm focus:outline-none focus:border-[#c9a24b]"
                  />
                </div>
              ))}
            </div>

            {/* Small ADD field directly under Left Eye */}
            <div className="mt-2.5 flex items-center justify-end gap-2.5" dir="ltr">
              <div className="w-28 sm:w-32">
                <label
                  htmlFor="l-add"
                  className="block text-center text-[11px] font-bold text-[#8f6c1e] dark:text-[#e8cf8b] mb-1"
                >
                  ADD
                </label>
                <input
                  id="l-add"
                  maxLength={16}
                  placeholder="+0.00"
                  value={addPower}
                  onChange={(e) => setAddPower(e.target.value)}
                  className="w-full min-h-[38px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-center font-mono-num text-xs focus:outline-none focus:border-[#c9a24b]"
                />
              </div>
            </div>

            <div className="mt-2.5">
              <EyeLensStatusBadge
                eye="L"
                tuple={[ls.trim() || '-', lc.trim() || '-', la.trim() || '-']}
                inventory={lensInventory}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 min-h-[46px] px-5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{editingCustomer ? 'حفظ التعديلات' : 'حفظ العميل'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
