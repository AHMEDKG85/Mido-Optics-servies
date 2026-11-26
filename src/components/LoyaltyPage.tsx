import React from 'react';
import { Award, Banknote, Crown, Gift } from 'lucide-react';
import { CustomerRecord } from '../types/optics';
import { calculateLoyaltySummary } from '../utils/optics';

interface LoyaltyPageProps {
  customers: CustomerRecord[];
}

export const LoyaltyPage: React.FC<LoyaltyPageProps> = ({ customers }) => {
  const entries = calculateLoyaltySummary(customers);

  return (
    <section aria-label="نظام الولاء" className="space-y-5">
      {/* Program Rules Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#e3f2fb] dark:bg-[#1b3042] text-[#c9a24b] grid place-items-center shrink-0">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">كل 100 جنيه مدفوعة</p>
            <p className="text-base font-bold mt-0.5 tabular-nums">= 1 نقطة ولاء</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#e3f2fb] dark:bg-[#1b3042] text-[#c9a24b] grid place-items-center shrink-0">
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">كل 10 نقاط</p>
            <p className="text-base font-bold mt-0.5 tabular-nums">خصم 50 جنيه</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#e3f2fb] dark:bg-[#1b3042] text-[#c9a24b] grid place-items-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">مستويات العضوية</p>
            <p className="text-sm font-bold mt-0.5">برونزي · فضي 10+ · ذهبي 25+</p>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center">
          <Crown className="w-12 h-12 text-[#c9a24b] mx-auto mb-3 opacity-80" />
          <h2 className="text-base font-bold mb-1">لا توجد نقاط ولاء بعد</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            تُحسب النقاط والمكافآت تلقائياً بمجرد تسجيل عملاء ومدفوعات.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#e3f2fb]/75 dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] text-xs font-bold">
                  <th className="p-3.5 text-right">العميل</th>
                  <th className="p-3.5 text-right">الهاتف</th>
                  <th className="p-3.5 text-right">الزيارات</th>
                  <th className="p-3.5 text-right">إجمالي المدفوع</th>
                  <th className="p-3.5 text-right">النقاط</th>
                  <th className="p-3.5 text-right">المستوى</th>
                  <th className="p-3.5 text-right">المكافأة المتاحة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {entries.map((entry) => (
                  <tr
                    key={entry.key}
                    className="hover:bg-[#e3f2fb]/40 dark:hover:bg-[#1b3042]/45 transition-colors"
                  >
                    <td className="p-3.5 font-semibold">{entry.name}</td>
                    <td className="p-3.5 text-right font-mono-num text-xs" dir="ltr">
                      {entry.phone || '—'}
                    </td>
                    <td className="p-3.5 tabular-nums">{entry.visits}</td>
                    <td className="p-3.5 tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                      {entry.paid} جنيه
                    </td>
                    <td className="p-3.5 tabular-nums font-extrabold text-base">{entry.points}</td>
                    <td className="p-3.5 font-bold" style={{ color: entry.tierColor }}>
                      {entry.tier}
                    </td>
                    <td className="p-3.5 font-medium">{entry.rewardText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <h3 className="font-bold text-base truncate">{entry.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    <span dir="ltr" className="font-mono-num">
                      {entry.phone || 'بدون رقم'}
                    </span>
                    {' · '}
                    <span>{entry.visits} زيارة</span>
                    {' · '}
                    <span>{entry.paid} ج</span>
                  </p>
                  <p className="text-xs font-semibold mt-1" style={{ color: entry.tierColor }}>
                    المستوى {entry.tier} · {entry.rewardText}
                  </p>
                </div>
                <div className="text-center shrink-0 px-3 py-2 rounded-xl bg-[#f3f9fd] dark:bg-[#1b3042]">
                  <div className="text-lg font-extrabold tabular-nums text-[#a8832f] dark:text-[#e8cf8b]">
                    {entry.points}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">نقطة</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
};
