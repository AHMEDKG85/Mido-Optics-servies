import React, { useState } from 'react';
import {
  Archive,
  Calendar,
  CheckCircle2,
  Eye,
  Printer,
  RotateCcw,
  Search,
} from 'lucide-react';
import { CustomerRecord } from '../types/optics';
import {
  calculateRemaining,
  filterArchivedOrders,
  formatArabicDateTime,
  formatArabicPickupDate,
} from '../utils/optics';

interface ArchivePageProps {
  customers: CustomerRecord[];
  onRestoreOrder: (customerId: string) => void;
  onOpenOrderModal: (customer: CustomerRecord) => void;
  onOpenInvoice: (customer: CustomerRecord) => void;
}

export const ArchivePage: React.FC<ArchivePageProps> = ({
  customers,
  onRestoreOrder,
  onOpenOrderModal,
  onOpenInvoice,
}) => {
  const [search, setSearch] = useState('');

  const allArchived = filterArchivedOrders(customers, '');
  const filtered = filterArchivedOrders(customers, search);
  const totalCollected = allArchived.reduce((sum, c) => sum + (Number(c.paid) || 0), 0);

  return (
    <section aria-label="أرشيف الطلبات المسلمة" className="space-y-5">
      {/* Summary Header Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2">
            <Archive className="w-5 h-5 text-[#c9a24b]" />
            <span>أرشيف الطلبات المُسلّمة</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            يتم حفظ جميع الطلبات التي تم تسليم نظاراتها هنا تلقائياً لتخفيف الضغط على صفحة الطلبات النشطة، مع إمكانية البحث أو استرجاع أي طلب عند الحاجة.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-3 w-full sm:w-auto">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042]/80 px-4 py-2 text-center">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              الطلبات المؤرشفة
            </div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
              {allArchived.length}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/35 px-4 py-2 text-center">
            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              إجمالي المحصل
            </div>
            <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {totalCollected.toLocaleString('en-US')} ج.م
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-[#c9a24b] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في الأرشيف بالاسم، الهاتف، الشمبر، العدسة أو الكود..."
            aria-label="بحث في أرشيف الطلبات"
            className="w-full min-h-[44px] pr-10 pl-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-sm focus:outline-none focus:border-[#c9a24b]"
          />
        </div>
        {search.trim() && (
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
            نتائج البحث: {filtered.length} من {allArchived.length}
          </div>
        )}
      </div>

      {/* Empty States or Archived Orders Grid */}
      {allArchived.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center space-y-2">
          <Archive className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-600" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            لا توجد طلبات مؤرشفة حتى الآن
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            عند الضغط على «استلام النظارة» لأي طلب في صفحة الطلبات، سينتقل إلى الأرشيف تلقائياً.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-10 text-center space-y-2">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            لا توجد طلبات مطابقة لبحثك في الأرشيف
          </p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] cursor-pointer"
          >
            مسح البحث
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const remaining = calculateRemaining(c.total, c.paid);
            const deliveredAt = c.hist?.[4];

            return (
              <article
                key={c.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base truncate">{c.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                        <span dir="ltr" className="font-mono-num">
                          {c.phone || 'بدون رقم'}
                        </span>
                        <span>·</span>
                        <span>
                          {[c.frame, c.lens].filter(Boolean).join(' / ') || 'طلب نظارة'}
                        </span>
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>تم التسليم</span>
                    </span>
                  </div>

                  {/* Financial Summary */}
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f3f9fd] dark:bg-[#1b3042]/70 border border-slate-200/80 dark:border-slate-700/70 p-2.5 text-center text-xs tabular-nums">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">الكلي</div>
                      <div className="font-extrabold text-slate-900 dark:text-white mt-0.5">
                        {c.total} ج.م
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">المدفوع</div>
                      <div className="font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {c.paid} ج.م
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">الباقي</div>
                      <div
                        className={`font-extrabold mt-0.5 ${
                          remaining > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {remaining} ج.م
                      </div>
                    </div>
                  </div>

                  {/* Dates & Tracking Token */}
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#c9a24b] shrink-0" />
                      <span>
                        تسجيل: {formatArabicDateTime(c.date)}
                        {c.pickupDate ? ` · استلام: ${formatArabicPickupDate(c.pickupDate)}` : ''}
                        {deliveredAt ? ` · سُلّمت: ${formatArabicDateTime(deliveredAt)}` : ''}
                      </span>
                    </span>
                    <span dir="ltr" className="font-mono-num truncate max-w-[160px]">
                      #track-{c.tok}
                    </span>
                  </div>
                </div>

                {/* Archive Actions */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => onRestoreOrder(c.id)}
                    className="col-span-2 sm:flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-4 h-4 shrink-0" />
                    <span>استرجاع للطلبات</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenOrderModal(c)}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <span>التفاصيل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenInvoice(c)}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b] hover:border-[#c9a24b] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Printer className="w-4 h-4 shrink-0" />
                    <span>فاتورة</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
