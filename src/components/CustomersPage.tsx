import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Edit3,
  Eye,
  Glasses,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { CustomerRecord, ORDER_STAGES, USAGE_TYPE_LABELS } from '../types/optics';
import {
  calculateRemaining,
  formatArabicDateTime,
  formatArabicPickupDate,
} from '../utils/optics';

interface CustomersPageProps {
  customers: CustomerRecord[];
  onAddCustomer: () => void;
  onEditCustomer: (customer: CustomerRecord) => void;
  onDeleteCustomer: (id: string) => void;
  onChangeStage: (customerId: string, nextStage: number) => void;
  onOpenOrder: (customer: CustomerRecord) => void;
  onOpenInvoice: (customer: CustomerRecord) => void;
  onImportCustomers: (rawList: unknown[]) => number;
  onLoadSampleData: () => number;
  onToast: (msg: string) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  onAddCustomer,
  onEditCustomer,
  onDeleteCustomer,
  onChangeStage,
  onOpenOrder,
  onOpenInvoice,
  onImportCustomers,
  onLoadSampleData,
  onToast,
}) => {
  const [query, setQuery] = useState('');
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!armedDeleteId) return;
    const timer = window.setTimeout(() => setArmedDeleteId(null), 3200);
    return () => window.clearTimeout(timer);
  }, [armedDeleteId]);

  const trimmed = query.trim().toLowerCase();
  const filtered = customers.filter(
    (c) =>
      !trimmed ||
      c.name.toLowerCase().includes(trimmed) ||
      c.phone.toLowerCase().includes(trimmed) ||
      c.frame.toLowerCase().includes(trimmed)
  );

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(customers, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mido-optics-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onToast('تم حفظ نسخة احتياطية بنجاح');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '[]'));
        if (!Array.isArray(parsed)) {
          onToast('صيغة الملف غير صالحة');
          return;
        }
        const count = onImportCustomers(parsed);
        onToast(count > 0 ? `تم استرجاع ${count} عميل ومزامنتهم` : 'لم يتم العثور على عملاء صالحين');
      } catch {
        onToast('تعذر قراءة الملف');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteClick = (id: string) => {
    if (armedDeleteId === id) {
      onDeleteCustomer(id);
      setArmedDeleteId(null);
      onToast('تم حذف العميل');
    } else {
      setArmedDeleteId(id);
    }
  };

  return (
    <section aria-label="إدارة العملاء" className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#c9a24b] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو نوع الشمبر..."
            aria-label="بحث في العملاء"
            className="w-full min-h-[44px] pr-10 pl-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#c9a24b]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExport}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-sm font-medium inline-flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#c9a24b]" />
            <span>حفظ نسخة</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-sm font-medium inline-flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-[#c9a24b]" />
            <span>استرجاع</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center">
          <Glasses className="w-12 h-12 text-[#c9a24b] mx-auto mb-3 opacity-80" />
          <h2 className="text-base font-bold mb-1">
            {customers.length === 0 ? 'لا يوجد عملاء مسجلين بعد' : 'لا توجد نتائج مطابقة للبحث'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            {customers.length === 0
              ? 'أضف أول عميل لحفظ مقاسات النظارة وإرسال رابط المتابعة عبر واتساب.'
              : 'جرّب البحث باسم آخر أو رقم هاتف مختلف.'}
          </p>
          {customers.length === 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onAddCustomer}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة عميل جديد</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = onLoadSampleData();
                  onToast(`تم إضافة ${n} عملاء للتجربة`);
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
              >
                تحميل بيانات تجريبية
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Desktop & Tablet Data Table (>= md) */}
          <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] overflow-x-auto">
            <table className="w-full border-collapse text-xs lg:text-sm">
              <thead>
                <tr className="bg-[#e3f2fb]/75 dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] text-xs font-bold">
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">التاريخ</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">العميل</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">الهاتف</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">الشمبر · العدسات</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">الكلي</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">المدفوع</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">الباقي</th>
                  <th className="px-2.5 py-3 text-center whitespace-nowrap">المقاس (R / L)</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">الحالة</th>
                  <th className="px-2.5 py-3 text-left whitespace-nowrap">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((c) => {
                  const rest = calculateRemaining(c.total, c.paid);
                  const isArmed = armedDeleteId === c.id;
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-[#e3f2fb]/40 dark:hover:bg-[#1b3042]/45 transition-colors"
                    >
                      <td className="px-2.5 py-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatArabicDateTime(c.date)}
                      </td>
                      <td className="px-2.5 py-3 font-semibold whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {c.photo ? (
                            <img
                              src={c.photo}
                              alt={`شمبر ${c.name}`}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : null}
                          <span className="max-w-[140px] truncate">{c.name}</span>
                        </div>
                      </td>
                      <td
                        className="px-2.5 py-3 text-right text-slate-700 dark:text-slate-300 font-mono-num text-xs whitespace-nowrap"
                        dir="ltr"
                      >
                        {c.phone || '—'}
                      </td>
                      <td className="px-2.5 py-3 text-slate-700 dark:text-slate-300 max-w-[190px]">
                        <div className="truncate">
                          {[c.frame, c.lens].filter(Boolean).join(' · ') || '—'}
                        </div>
                        {c.usageType && (
                          <div className="text-[11px] font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] mt-0.5">
                            {USAGE_TYPE_LABELS[c.usageType]}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-3 tabular-nums font-medium whitespace-nowrap">
                        {c.total}
                      </td>
                      <td className="px-2.5 py-3 tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {c.paid}
                      </td>
                      <td
                        className={`px-2.5 py-3 tabular-nums font-semibold whitespace-nowrap ${
                          rest > 0
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {rest > 0 ? `${rest} ج` : 'خالص'}
                      </td>
                      <td
                        className="px-2.5 py-3 text-center font-mono-num text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap leading-snug"
                        dir="ltr"
                      >
                        <div>
                          <span className="text-[#a8832f] dark:text-[#e8cf8b] font-bold">R: </span>
                          {c.r.join(' / ')}
                        </div>
                        <div>
                          <span className="text-[#a8832f] dark:text-[#e8cf8b] font-bold">L: </span>
                          {c.l.join(' / ')}
                        </div>
                        {c.add && (
                          <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            ADD: {c.add}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-3 text-xs font-medium whitespace-nowrap">
                        <div className="space-y-1">
                          {c.delivered ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                              تم استلام النظارة
                            </span>
                          ) : (
                            <select
                              aria-label={`تغيير حالة ${c.name}`}
                              value={Math.max(0, Math.min(4, c.status || 0))}
                              onChange={(e) => onChangeStage(c.id, Number(e.target.value))}
                              className={`min-h-[32px] px-2 py-1 rounded-lg border text-xs font-semibold bg-white dark:bg-[#0d1722] cursor-pointer focus:outline-none focus:border-[#c9a24b] ${
                                c.status === 4
                                  ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                                  : 'border-slate-200 dark:border-slate-700 text-[#8f6c1e] dark:text-[#e8cf8b]'
                              }`}
                            >
                              {ORDER_STAGES.map((stageLabel, idx) => (
                                <option key={stageLabel} value={idx}>
                                  {stageLabel}
                                </option>
                              ))}
                            </select>
                          )}
                          {c.pickupDate && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              التسليم: {formatArabicPickupDate(c.pickupDate)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2.5 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenInvoice(c)}
                            aria-label={`فاتورة ${c.name}`}
                            title="فاتورة للطباعة / PDF"
                            className="min-h-[36px] min-w-[36px] px-2 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] inline-flex items-center justify-center shadow-xs transition-all active:scale-[0.96] cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenOrder(c)}
                            aria-label={`متابعة وواتساب ${c.name}`}
                            title="متابعة الطلب وواتساب"
                            className="min-h-[36px] min-w-[36px] px-2 rounded-xl border border-sky-200/80 dark:border-slate-700 bg-[#e3f2fb] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] inline-flex items-center justify-center shadow-xs transition-all active:scale-[0.96] cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditCustomer(c)}
                            aria-label={`تعديل ${c.name}`}
                            title="تعديل بيانات العميل"
                            className="min-h-[36px] min-w-[36px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] inline-flex items-center justify-center shadow-xs transition-all active:scale-[0.96] cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(c.id)}
                            aria-label={isArmed ? `تأكيد حذف ${c.name}` : `حذف ${c.name}`}
                            className={`min-h-[36px] min-w-[36px] px-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center shadow-xs transition-all active:scale-[0.96] cursor-pointer ${
                              isArmed
                                ? 'bg-rose-600 text-white'
                                : 'border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white'
                            }`}
                          >
                            {isArmed ? 'تأكيد الحذف؟' : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards (< md) */}
          <div className="md:hidden space-y-3">
            {filtered.map((c) => {
              const rest = calculateRemaining(c.total, c.paid);
              const isArmed = armedDeleteId === c.id;
              return (
                <article
                  key={c.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {c.photo ? (
                        <img
                          src={c.photo}
                          alt={`شمبر ${c.name}`}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-[#e3f2fb] dark:bg-[#1b3042] text-[#c9a24b] grid place-items-center shrink-0">
                          <Glasses className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-base truncate">{c.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                          <span dir="ltr" className="font-mono-num">
                            {c.phone || 'بدون رقم'}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">{formatArabicDateTime(c.date)}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span>الشمبر: {c.frame || '—'}</span>
                    <span>·</span>
                    <span>العدسات: {c.lens || '—'}</span>
                    {c.usageType && (
                      <>
                        <span>·</span>
                        <span className="font-bold text-[#8f6c1e] dark:text-[#e8cf8b]">
                          {USAGE_TYPE_LABELS[c.usageType]}
                        </span>
                      </>
                    )}
                    {c.pickupDate && (
                      <>
                        <span>·</span>
                        <span className="tabular-nums">
                          التسليم: {formatArabicPickupDate(c.pickupDate)}
                        </span>
                      </>
                    )}
                    {c.delivered ? (
                      <>
                        <span>·</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                          تم التسليم
                        </span>
                      </>
                    ) : (
                      <div className="w-full pt-1">
                        <select
                          aria-label={`تغيير حالة ${c.name}`}
                          value={Math.max(0, Math.min(4, c.status || 0))}
                          onChange={(e) => onChangeStage(c.id, Number(e.target.value))}
                          className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border text-xs font-bold bg-[#f3f9fd] dark:bg-[#0d1722] cursor-pointer focus:outline-none focus:border-[#c9a24b] ${
                            c.status === 4
                              ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                              : 'border-slate-200 dark:border-slate-700 text-[#8f6c1e] dark:text-[#e8cf8b]'
                          }`}
                        >
                          {ORDER_STAGES.map((stageLabel, idx) => (
                            <option key={stageLabel} value={idx}>
                              الحالة: {stageLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f3f9fd] dark:bg-[#1b3042]/70 p-2.5 text-center text-xs tabular-nums">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">الكلي</div>
                      <div className="font-bold text-sm mt-0.5">{c.total}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">المدفوع</div>
                      <div className="font-bold text-sm mt-0.5 text-emerald-700 dark:text-emerald-400">
                        {c.paid}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">الباقي</div>
                      <div
                        className={`font-bold text-sm mt-0.5 ${
                          rest > 0
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {rest > 0 ? rest : 'خالص'}
                      </div>
                    </div>
                  </div>

                  <div
                    className="grid grid-cols-2 gap-2 text-xs font-mono-num text-center"
                    dir="ltr"
                  >
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 px-2">
                      <span className="text-[#a8832f] dark:text-[#e8cf8b] font-bold">R: </span>
                      {c.r.join(' / ')}
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 px-2">
                      <div>
                        <span className="text-[#a8832f] dark:text-[#e8cf8b] font-bold">L: </span>
                        {c.l.join(' / ')}
                      </div>
                      {c.add && (
                        <div className="text-[11px] font-bold text-[#8f6c1e] dark:text-[#e8cf8b] mt-0.5">
                          ADD: {c.add}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenInvoice(c)}
                      aria-label={`فاتورة ${c.name}`}
                      className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-[#8f6c1e] dark:text-[#e8cf8b] font-semibold text-xs inline-flex items-center justify-center gap-1 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>فاتورة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenOrder(c)}
                      className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#e3f2fb] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] font-semibold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>متابعة وواتساب</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditCustomer(c)}
                      aria-label={`تعديل ${c.name}`}
                      className="min-h-[44px] min-w-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center justify-center gap-1 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(c.id)}
                      aria-label={isArmed ? `تأكيد حذف ${c.name}` : `حذف ${c.name}`}
                      className={`min-h-[44px] min-w-[44px] px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center shadow-xs transition-all active:scale-[0.98] cursor-pointer ${
                        isArmed
                          ? 'bg-rose-600 text-white'
                          : 'border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {isArmed ? 'تأكيد؟' : <Trash2 className="w-4 h-4" />}
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
