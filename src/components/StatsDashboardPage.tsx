import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, CheckCircle2, Clock3, TrendingUp, Users, Wallet } from 'lucide-react';
import { CustomerRecord } from '../types/optics';
import {
  calculateMonthlyCustomerGrowth,
  calculateOrderReadinessStats,
} from '../utils/optics';

interface StatsDashboardPageProps {
  customers: CustomerRecord[];
}

export const StatsDashboardPage: React.FC<StatsDashboardPageProps> = ({ customers }) => {
  const readiness = useMemo(() => calculateOrderReadinessStats(customers), [customers]);
  const monthlyGrowth = useMemo(
    () => calculateMonthlyCustomerGrowth(customers),
    [customers]
  );

  const readyRate =
    readiness.totalOrders > 0
      ? Math.round((readiness.readyCount / readiness.totalOrders) * 100)
      : 0;

  const latestGrowth =
    monthlyGrowth.length > 0 ? monthlyGrowth[monthlyGrowth.length - 1] : null;

  return (
    <section aria-label="لوحة الإحصائيات والبيانات" className="space-y-5">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>إجمالي النظارات / العملاء</span>
            <Users className="w-4 h-4 text-[#c9a24b]" />
          </div>
          <p className="text-2xl font-extrabold tabular-nums">{readiness.totalOrders}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            نسبة الجاهزية: {readyRate}%
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>النظارات الجاهزة</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
            {readiness.readyCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            جاهزة للاستلام من المحل
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>تحت التنفيذ</span>
            <Clock3 className="w-4 h-4 text-[#c9a24b]" />
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-[#a8832f] dark:text-[#e8cf8b]">
            {readiness.inProgressCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            قيد التجهيز أو التركيب
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>النمو الشهري والإيرادات</span>
            <Wallet className="w-4 h-4 text-[#c9a24b]" />
          </div>
          <p className="text-2xl font-extrabold tabular-nums">
            {readiness.totalCollected.toLocaleString('ar-EG')} ج
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {latestGrowth && latestGrowth.growthPercent !== null
              ? `نمو الشهر الأخير: ${latestGrowth.growthPercent >= 0 ? '+' : ''}${latestGrowth.growthPercent}%`
              : `المتبقي للتحصيل: ${readiness.totalRemaining.toLocaleString('ar-EG')} ج`}
          </p>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center space-y-2">
          <BarChart3 className="w-11 h-11 text-[#c9a24b] mx-auto opacity-80" />
          <h2 className="text-base font-bold">لا توجد بيانات إحصائية بعد</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            أضف عملاء من صفحة «العملاء» لعرض الرسوم البيانية للنظارات الجاهزة وتحت التنفيذ ونسبة النمو الشهري.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Chart 1: Ready vs In-Progress Glasses */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#c9a24b]" />
                  <span>النظارات الجاهزة مقابل التي تحت التنفيذ</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  مقارنة فورية لحالة جميع طلبات النظارات الحالية
                </p>
              </div>
              <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {readyRate}% جاهز
              </span>
            </div>

            <div className="h-[260px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={readiness.readinessComparison}
                  margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                    axisLine={{ stroke: '#cbd5e1', strokeOpacity: 0.4 }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(201, 162, 75, 0.08)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as { name: string; value: number };
                      return (
                        <div
                          dir="rtl"
                          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101c28] px-3 py-2 text-xs shadow-md"
                        >
                          <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                          <p className="text-slate-600 dark:text-slate-300 tabular-nums mt-0.5">
                            العدد: <span className="font-extrabold">{item.value}</span> نظارة
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]} maxBarSize={76}>
                    {readiness.readinessComparison.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Stage Distribution Breakdown */}
            <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
              {readiness.stageBreakdown.map((item, idx) => (
                <div
                  key={item.stage}
                  className="rounded-xl bg-[#f3f9fd] dark:bg-[#1b3042]/60 px-1.5 py-2"
                >
                  <div className="text-sm font-extrabold tabular-nums text-[#8f6c1e] dark:text-[#e8cf8b]">
                    {item.count}
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight mt-0.5 line-clamp-2">
                    {idx + 1}. {item.stage}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 2: Monthly Customer Growth */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#c9a24b]" />
                  <span>نمو العملاء شهرياً ونسبة النمو (%)</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  عدد العملاء الجدد شهرياً ومعدل التغير مقارنة بالشهر السابق
                </p>
              </div>
              {latestGrowth && latestGrowth.growthPercent !== null && (
                <span
                  className={`text-xs font-bold tabular-nums ${
                    latestGrowth.growthPercent >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {latestGrowth.growthPercent >= 0 ? '+' : ''}
                  {latestGrowth.growthPercent}%
                </span>
              )}
            </div>

            <div className="h-[260px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyGrowth}
                  margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: '#cbd5e1', strokeOpacity: 0.4 }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    unit="%"
                    tick={{ fill: '#15935a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as {
                        monthLabel: string;
                        count: number;
                        growthPercent: number | null;
                      };
                      return (
                        <div
                          dir="rtl"
                          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101c28] px-3 py-2 text-xs shadow-md space-y-0.5"
                        >
                          <p className="font-bold text-slate-900 dark:text-white">
                            {pt.monthLabel}
                          </p>
                          <p className="text-slate-600 dark:text-slate-300 tabular-nums">
                            العملاء الجدد: <span className="font-extrabold">{pt.count}</span>
                          </p>
                          <p className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                            نسبة النمو:{' '}
                            <span className="font-extrabold">
                              {pt.growthPercent === null
                                ? 'الشهر الأساس'
                                : `${pt.growthPercent >= 0 ? '+' : ''}${pt.growthPercent}%`}
                            </span>
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="count"
                    name="عدد العملاء"
                    fill="#c9a24b"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={48}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="growthPercent"
                    name="نسبة النمو %"
                    stroke="#15935a"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#15935a' }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Breakdown Strip */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {monthlyGrowth.map((pt) => (
                <div
                  key={pt.monthKey}
                  className="rounded-xl bg-[#f3f9fd] dark:bg-[#1b3042]/60 px-3 py-1.5 text-xs tabular-nums flex items-center gap-2"
                >
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {pt.monthLabel}:
                  </span>
                  <span className="font-bold text-[#8f6c1e] dark:text-[#e8cf8b]">
                    {pt.count} عميل
                  </span>
                  {pt.growthPercent !== null && (
                    <span
                      className={`font-bold ${
                        pt.growthPercent >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      ({pt.growthPercent >= 0 ? '+' : ''}
                      {pt.growthPercent}%)
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
