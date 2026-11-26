import React from 'react';
import { Archive, BarChart3, Crown, Glasses, Plus, Send, Users } from 'lucide-react';
import { AppPage } from '../types/optics';

interface HeaderProps {
  activePage: AppPage;
  onNavigate: (page: Exclude<AppPage, 'track'>) => void;
  onAddCustomer: () => void;
  shopName: string;
}

const NAV_ITEMS: Array<{
  id: Exclude<AppPage, 'track'>;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'customers', label: 'العملاء', shortLabel: 'العملاء', icon: Users },
  { id: 'loyalty', label: 'نظام الولاء', shortLabel: 'الولاء', icon: Crown },
  { id: 'orders', label: 'متابعة وواتساب', shortLabel: 'واتساب', icon: Send },
  { id: 'archive', label: 'أرشيف الطلبات', shortLabel: 'الأرشيف', icon: Archive },
  { id: 'stats', label: 'الإحصائيات', shortLabel: 'الإحصائيات', icon: BarChart3 },
];

export const Header: React.FC<HeaderProps> = ({
  activePage,
  onNavigate,
  onAddCustomer,
  shopName,
}) => {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-[#101c28]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#customers"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('customers');
            }}
            className="flex items-center gap-2.5 text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#e8cf8b] via-[#c9a24b] to-[#a8832f] text-white grid place-items-center shadow-sm">
              <Glasses className="w-5 h-5" />
            </span>
            <span>{shopName || 'Mido Optics'}</span>
          </a>

          {/* Zone 2: Concise single-line navigation links (Desktop & Tablet) */}
          <nav
            aria-label="التنقل الرئيسي"
            className="hidden md:flex items-center gap-6 text-sm font-semibold"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activePage === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(item.id);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-[#c9a24b] text-[#a8832f] dark:text-[#e8cf8b]'
                      : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={onAddCustomer}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-sm font-bold inline-flex items-center gap-1.5 shadow-sm transition-transform active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة عميل</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Thumb-Zone Tab Bar (< md) */}
      <nav
        aria-label="التنقل السريع"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#101c28]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="grid grid-cols-5 h-14">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#a8832f] dark:text-[#e8cf8b] font-bold'
                    : 'text-slate-500 dark:text-slate-400 font-medium'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] leading-tight whitespace-nowrap">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
