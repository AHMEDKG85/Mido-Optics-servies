import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Edit3,
  Eye,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import { REPAIR_STAGES, RepairRecord } from '../types/optics';
import {
  calculateRemaining,
  filterRepairs,
  formatArabicDateTime,
} from '../utils/optics';

interface RepairsPageProps {
  repairs: RepairRecord[];
  onAddRepair: () => void;
  onEditRepair: (repair: RepairRecord) => void;
  onDeleteRepair: (id: string) => void;
  onChangeStage: (repairId: string, nextStage: number) => void;
  onOpenRepairFollowUp: (repair: RepairRecord) => void;
  onOpenInvoice: (repair: RepairRecord) => void;
  onImportRepairs: (rawList: unknown[]) => number;
  onLoadSampleRepairs: () => number;
  onToast: (msg: string) => void;
}

export const RepairsPage: React.FC<RepairsPageProps> = ({
  repairs,
  onAddRepair,
  onEditRepair,
  onDeleteRepair,
  onChangeStage,
  onOpenRepairFollowUp,
  onOpenInvoice,
  onImportRepairs,
  onLoadSampleRepairs,
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

  const filtered = filterRepairs(repairs, query);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(repairs, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mido-optics-repairs-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onToast('تم حفظ نسخة احتياطية للتصليحات بنجاح');
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
        const count = onImportRepairs(parsed);
        onToast(
          count > 0
            ? `تم استرجاع ${count} سجل تصليح ومزامنتهم`
            : 'لم يتم العثور على سجلات تصليح صالحة'
        );
      } catch {
        onToast('تعذر قراءة الملف');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteClick = (id: string) => {
    if (armedDeleteId === id) {
      onDeleteRepair(id);
      setArmedDeleteId(null);
      onToast('تم حذف سجل التصليح');
    } else {
      setArmedDeleteId(id);
    }
  };

  return (
    <section aria-label="إدارة التصليحات" className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#c9a24b] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالاسم، الواتساب، نوع النظارة، اللحام أو المندوب..."
            aria-label="بحث في التصليحات"
            className="w-full min-h-[44px] pr-10 pl-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#c9a24b]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onAddRepair}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-sm font-bold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة تصليح</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-sm font-medium inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#c9a24b]" />
            <span>حفظ نسخة</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-sm font-medium inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
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
          <Wrench className="w-12 h-12 text-[#c9a24b] mx-auto mb-3 opacity-80" />
          <h2 className="text-base font-bold mb-1">
            {repairs.length === 0 ? 'لا توجد تصليحات مسجلة بعد' : 'لا توجد نتائج مطابقة للبحث'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            {repairs.length === 0
              ? 'أضف أول طلب تصليح لتسجيل نوع اللحام والنظارة واسم المندوب وطباعة إيصال كاشير ومتابعته عبر واتساب.'
              : 'جرّب البحث باسم عميل آخر أو نوع لحام أو مندوب مختلف.'}
          </p>
          {repairs.length === 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onAddRepair}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة تصليح</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = onLoadSampleRepairs();
                  onToast(`تم إضافة ${n} تصليحات للتجربة`);
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition-colors cursor-pointer"
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
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">الواتساب</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">نوع النظارة · اللحام</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">المندوب</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">التكلفة</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">المدفوع</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">الباقي</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">الحالة</th>
                  <th className="px-2.5 py-3 text-left whitespace-nowrap">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((r) => {
                  const rest = calculateRemaining(r.cost, r.paid);
                  const isArmed = armedDeleteId === r.id;
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-[#e3f2fb]/40 dark:hover:bg-[#1b3042]/45 transition-colors"
                    >
                      <td className="px-2.5 py-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatArabicDateTime(r.date)}
                      </td>
                      <td className="px-2.5 py-3 font-semibold whitespace-nowrap">
                        <span className="max-w-[140px] truncate block">{r.name}</span>
                      </td>
                      <td
                        className="px-2.5 py-3 text-right text-slate-700 dark:text-slate-300 font-mono-num text-xs whitespace-nowrap"
                        dir="ltr"
                      >
                        {r.phone || '—'}
                      </td>
                      <td className="px-2.5 py-3 text-slate-700 dark:text-slate-300 max-w-[200px]">
                        <div className="truncate font-medium">{r.glassesType || '—'}</div>
                        {r.weldingType && (
                          <div className="text-[11px] text-[#8f6c1e] dark:text-[#e8cf8b] truncate">
                            {r.weldingType}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-3 text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap">
                        {r.representativeName || '—'}
                      </td>
                      <td className="px-2.5 py-3 tabular-nums font-medium whitespace-nowrap">
                        {r.cost}
                      </td>
                      <td className="px-2.5 py-3 tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {r.paid}
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
                      <td className="px-2.5 py-3 text-xs font-medium whitespace-nowrap">
                        <div className="space-y-1">
                          {r.delivered ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                              تم التسليم
                            </span>
                          ) : (
                            <select
                              aria-label={`تغيير حالة تصليح ${r.name}`}
                              value={Math.max(0, Math.min(4, r.status || 0))}
                              onChange={(e) => onChangeStage(r.id, Number(e.target.value))}
                              className={`min-h-[34px] px-2 py-1 rounded-lg border text-xs font-semibold bg-white dark:bg-[#0d1722] cursor-pointer focus:outline-none focus:border-[#c9a24b] ${
                                r.status === 4
                                  ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                                  : 'border-slate-200 dark:border-slate-700 text-[#8f6c1e] dark:text-[#e8cf8b]'
                              }`}
                            >
                              {REPAIR_STAGES.map((stageLabel, idx) => (
                                <option key={stageLabel} value={idx}>
                                  {stageLabel}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-2.5 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenInvoice(r)}
                            aria-label={`فاتورة تصليح ${r.name}`}
                            title="إيصال كاشير / PDF"
                            className="min-h-[38px] min-w-[38px] px-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-[#f3f9fd] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] inline-flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenRepairFollowUp(r)}
                            aria-label={`متابعة وواتساب ${r.name}`}
                            title="متابعة التصليح وواتساب"
                            className="min-h-[38px] min-w-[38px] px-2 rounded-xl border border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white inline-flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditRepair(r)}
                            aria-label={`تعديل تصليح ${r.name}`}
                            title="تعديل بيانات التصليح"
                            className="min-h-[38px] min-w-[38px] px-2 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 inline-flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(r.id)}
                            aria-label={isArmed ? `تأكيد حذف ${r.name}` : `حذف ${r.name}`}
                            className={`min-h-[38px] min-w-[38px] px-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                              isArmed
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'border border-rose-200/80 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white'
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
            {filtered.map((r) => {
              const rest = calculateRemaining(r.cost, r.paid);
              const isArmed = armedDeleteId === r.id;
              return (
                <article
                  key={r.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-[#e3f2fb] dark:bg-[#1b3042] text-[#c9a24b] grid place-items-center shrink-0">
                        <Wrench className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-base truncate">{r.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                          <span dir="ltr" className="font-mono-num">
                            {r.phone || 'بدون رقم'}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">{formatArabicDateTime(r.date)}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>النظارة: {r.glassesType || '—'}</span>
                      <span>·</span>
                      <span>اللحام: {r.weldingType || '—'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>المندوب: {r.representativeName || '—'}</span>
                    </div>
                    {r.delivered ? (
                      <div className="text-emerald-700 dark:text-emerald-400 font-bold pt-0.5">
                        تم التسليم
                      </div>
                    ) : (
                      <div className="w-full pt-1">
                        <select
                          aria-label={`تغيير حالة تصليح ${r.name}`}
                          value={Math.max(0, Math.min(4, r.status || 0))}
                          onChange={(e) => onChangeStage(r.id, Number(e.target.value))}
                          className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border text-xs font-bold bg-[#f3f9fd] dark:bg-[#0d1722] cursor-pointer focus:outline-none focus:border-[#c9a24b] ${
                            r.status === 4
                              ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                              : 'border-slate-200 dark:border-slate-700 text-[#8f6c1e] dark:text-[#e8cf8b]'
                          }`}
                        >
                          {REPAIR_STAGES.map((stageLabel, idx) => (
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
                      <div className="text-slate-500 dark:text-slate-400">التكلفة</div>
                      <div className="font-bold text-sm mt-0.5">{r.cost}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">المدفوع</div>
                      <div className="font-bold text-sm mt-0.5 text-emerald-700 dark:text-emerald-400">
                        {r.paid}
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

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenInvoice(r)}
                      aria-label={`فاتورة تصليح ${r.name}`}
                      className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#192b3b] text-[#8f6c1e] dark:text-[#e8cf8b] font-semibold text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>فاتورة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenRepairFollowUp(r)}
                      className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#e3f2fb] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>متابعة وواتساب</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditRepair(r)}
                      aria-label={`تعديل تصليح ${r.name}`}
                      className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(r.id)}
                      aria-label={isArmed ? `تأكيد حذف ${r.name}` : `حذف ${r.name}`}
                      className={`min-h-[44px] min-w-[44px] px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center cursor-pointer ${
                        isArmed
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400'
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
