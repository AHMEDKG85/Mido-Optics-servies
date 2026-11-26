import React, { useEffect, useState } from 'react';
import { Calendar, Check, Glasses, Phone, User, X } from 'lucide-react';
import { CustomerRecord } from '../types/optics';
import { CustomerInput } from '../hooks/useOpticsStore';
import { calculateRemaining, formatArabicDateTime } from '../utils/optics';

interface CustomerFormModalProps {
  isOpen: boolean;
  editingCustomer: CustomerRecord | null;
  onClose: () => void;
  onSave: (input: CustomerInput) => void;
  onToast: (msg: string) => void;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  editingCustomer,
  onClose,
  onSave,
  onToast,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [frame, setFrame] = useState('');
  const [lens, setLens] = useState('');
  const [total, setTotal] = useState('');
  const [paid, setPaid] = useState('');
  const [photo, setPhoto] = useState('');
  const [rs, setRs] = useState('');
  const [rc, setRc] = useState('');
  const [ra, setRa] = useState('');
  const [ls, setLs] = useState('');
  const [lc, setLc] = useState('');
  const [la, setLa] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [clockText, setClockText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingCustomer) {
      setName(editingCustomer.name);
      setPhone(editingCustomer.phone);
      setFrame(editingCustomer.frame);
      setLens(editingCustomer.lens);
      setTotal(String(editingCustomer.total));
      setPaid(String(editingCustomer.paid));
      setPhoto(editingCustomer.photo || '');
      setRs(editingCustomer.r[0] === '-' ? '' : editingCustomer.r[0]);
      setRc(editingCustomer.r[1] === '-' ? '' : editingCustomer.r[1]);
      setRa(editingCustomer.r[2] === '-' ? '' : editingCustomer.r[2]);
      setLs(editingCustomer.l[0] === '-' ? '' : editingCustomer.l[0]);
      setLc(editingCustomer.l[1] === '-' ? '' : editingCustomer.l[1]);
      setLa(editingCustomer.l[2] === '-' ? '' : editingCustomer.l[2]);
      setPickupDate(editingCustomer.pickupDate || '');
      setClockText(formatArabicDateTime(editingCustomer.date));
      return;
    }

    setName('');
    setPhone('');
    setFrame('');
    setLens('');
    setTotal('');
    setPaid('');
    setPhoto('');
    setRs('');
    setRc('');
    setRa('');
    setLs('');
    setLc('');
    setLa('');
    setPickupDate('');

    const updateClock = () =>
      setClockText(
        new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'medium' })
      );
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, editingCustomer]);

  if (!isOpen) return null;

  const rest = calculateRemaining(Number(total) || 0, Number(paid) || 0);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 380 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL('image/jpeg', 0.72));
      }
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      onToast('تعذر تحميل الصورة');
    };
    img.src = objectUrl;
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
      total: Math.max(0, Number(total) || 0),
      paid: Math.max(0, Number(paid) || 0),
      photo,
      r: [rs.trim() || '-', rc.trim() || '-', ra.trim() || '-'],
      l: [ls.trim() || '-', lc.trim() || '-', la.trim() || '-'],
      pickupDate: pickupDate.trim(),
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

            <div>
              <label
                htmlFor="cust-frame"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                نوع الشمبر
              </label>
              <input
                id="cust-frame"
                value={frame}
                onChange={(e) => setFrame(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

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
            </div>

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
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm tabular-nums focus:outline-none focus:border-[#c9a24b]"
              />
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

            <div>
              <label
                htmlFor="cust-pickup-date"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mb-1"
              >
                <Calendar className="w-3.5 h-3.5 text-[#c9a24b]" />
                <span>تاريخ استلام النظارة</span>
              </label>
              <input
                id="cust-pickup-date"
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm tabular-nums focus:outline-none focus:border-[#c9a24b]"
              />
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
                onChange={handlePhotoChange}
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
                  <button
                    type="button"
                    onClick={() => setPhoto('')}
                    className="mt-1 block text-xs text-rose-600 dark:text-rose-400 underline cursor-pointer"
                  >
                    إزالة الصورة
                  </button>
                </div>
              )}
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
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 min-h-[46px] px-5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{editingCustomer ? 'حفظ التعديلات' : 'حفظ العميل'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-slate-700 dark:text-slate-200 text-sm font-semibold cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
