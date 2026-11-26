import React, { useEffect, useState } from 'react';
import { Calendar, Check, Phone, User, UserCheck, Wrench, X } from 'lucide-react';
import { RepairInput } from '../hooks/useOpticsStore';
import { RepairRecord } from '../types/optics';
import { calculateRemaining, formatArabicDateTime } from '../utils/optics';

interface RepairFormModalProps {
  isOpen: boolean;
  editingRepair: RepairRecord | null;
  onClose: () => void;
  onSave: (input: RepairInput) => void;
  onToast: (msg: string) => void;
}

const WELDING_SUGGESTIONS = [
  'لحام ليزر',
  'لحام فضة',
  'تغيير مفصل / سوستة',
  'تغيير ذراع',
  'تركيب مسمار ومخدات أنف',
  'شد شمبر وتلميع',
];

export const RepairFormModal: React.FC<RepairFormModalProps> = ({
  isOpen,
  editingRepair,
  onClose,
  onSave,
  onToast,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [glassesType, setGlassesType] = useState('');
  const [weldingType, setWeldingType] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [cost, setCost] = useState('');
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [clockText, setClockText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingRepair) {
      setName(editingRepair.name);
      setPhone(editingRepair.phone);
      setGlassesType(editingRepair.glassesType);
      setWeldingType(editingRepair.weldingType);
      setRepresentativeName(editingRepair.representativeName);
      setCost(String(editingRepair.cost));
      setPaid(String(editingRepair.paid));
      setNotes(editingRepair.notes || '');
      setClockText(formatArabicDateTime(editingRepair.date));
      return;
    }

    setName('');
    setPhone('');
    setGlassesType('');
    setWeldingType('');
    setRepresentativeName('');
    setCost('');
    setPaid('');
    setNotes('');

    const updateClock = () =>
      setClockText(
        new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'medium' })
      );
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, editingRepair]);

  if (!isOpen) return null;

  const rest = calculateRemaining(Number(cost) || 0, Number(paid) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      onToast('اكتب اسم العميل أولاً');
      return;
    }

    onSave({
      id: editingRepair?.id,
      name: trimmedName,
      phone: phone.trim(),
      glassesType: glassesType.trim(),
      weldingType: weldingType.trim(),
      representativeName: representativeName.trim(),
      cost: Math.max(0, Number(cost) || 0),
      paid: Math.max(0, Number(paid) || 0),
      notes: notes.trim(),
      pickupDate: editingRepair?.pickupDate || '',
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="repair-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-[#e8cf8b] via-[#c9a24b] to-[#a8832f] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Wrench className="w-7 h-7 shrink-0" />
            <div className="min-w-0">
              <h2 id="repair-modal-title" className="text-lg font-extrabold truncate">
                {editingRepair ? 'تعديل بيانات التصليح' : 'إضافة تصليح جديد'}
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
            className="min-h-[38px] min-w-[38px] rounded-xl bg-white/20 hover:bg-white/30 text-white grid place-items-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label
                htmlFor="rep-name"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mb-1"
              >
                <User className="w-3.5 h-3.5 text-[#c9a24b]" />
                <span>اسم العميل *</span>
              </label>
              <input
                id="rep-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="rep-phone"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mb-1"
              >
                <Phone className="w-3.5 h-3.5 text-[#c9a24b]" />
                <span>رقم الواتساب</span>
              </label>
              <input
                id="rep-phone"
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
                htmlFor="rep-glasses"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                نوع النظارة
              </label>
              <input
                id="rep-glasses"
                value={glassesType}
                onChange={(e) => setGlassesType(e.target.value)}
                placeholder="مثال: شمبر معدن أو نظارة شمس"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            <div>
              <label
                htmlFor="rep-welding"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                نوع اللحام / التصليح
              </label>
              <input
                id="rep-welding"
                list="welding-suggestions"
                value={weldingType}
                onChange={(e) => setWeldingType(e.target.value)}
                placeholder="مثال: لحام ليزر أو تغيير مفصل"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
              <datalist id="welding-suggestions">
                {WELDING_SUGGESTIONS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="rep-representative"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mb-1"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#c9a24b]" />
                <span>اسم المندوب</span>
              </label>
              <input
                id="rep-representative"
                value={representativeName}
                onChange={(e) => setRepresentativeName(e.target.value)}
                placeholder="اسم المندوب أو الفني المسؤول عن التصليح"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label
                  htmlFor="rep-cost"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  تكلفة التصليح (جنيه)
                </label>
                <input
                  id="rep-cost"
                  type="number"
                  min="0"
                  step="any"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm font-bold tabular-nums focus:outline-none focus:border-[#c9a24b]"
                />
              </div>

              <div>
                <label
                  htmlFor="rep-paid"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  المدفوع (جنيه)
                </label>
                <input
                  id="rep-paid"
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
                  htmlFor="rep-rest"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
                >
                  الباقي
                </label>
                <input
                  id="rep-rest"
                  readOnly
                  value={rest > 0 ? `${rest} ج.م` : 'خالص (0 ج.م)'}
                  className={`w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#e3f2fb] dark:bg-[#1b3042] text-sm font-bold tabular-nums ${
                    rest > 0
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="rep-notes"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1"
              >
                ملاحظات إضافية (اختياري)
              </label>
              <input
                id="rep-notes"
                maxLength={240}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="تفاصيل موضع الكسر أو ملاحظات التسليم..."
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1722] text-sm focus:outline-none focus:border-[#c9a24b]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 min-h-[46px] px-5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{editingRepair ? 'حفظ تعديلات التصليح' : 'حفظ التصليح'}</span>
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
