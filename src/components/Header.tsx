import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  BarChart3,
  ChevronDown,
  Glasses,
  Globe,
  Menu,
  MessageCircle,
  Plus,
  Send,
  ShoppingBag,
  Tag,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { AppPage, NavPage } from '../types/optics';

interface HeaderProps {
  activePage: AppPage;
  onNavigate: (page: NavPage) => void;
  onAddCustomer: () => void;
  shopName: string;
  pendingWebOrdersCount?: number;
}

interface NavItemDef {
  id: NavPage;
  label: string;
  shortLabel: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}

const PRIMARY_NAV_ITEMS: NavItemDef[] = [
  { id: 'customers', label: 'العملاء', shortLabel: 'العملاء', icon: Users },
  { id: 'orders', label: 'متابعة وواتساب', shortLabel: 'الطلبات', icon: Send },
  { id: 'web-orders', label: 'طلبات الموقع', shortLabel: 'طلبات الموقع', icon: ShoppingBag },
];

const MENU_NAV_ITEMS: NavItemDef[] = [
  {
    id: 'repair-orders',
    label: 'واتساب التصليحات',
    shortLabel: 'ت.واتساب',
    subtitle: 'رسائل واتساب ومتابعة مراحل التصليح',
    icon: MessageCircle,
  },
  {
    id: 'repairs',
    label: 'التصليحات',
    shortLabel: 'التصليحات',
    subtitle: 'تسجيل ومتابعة تصليح ولحام النظارات',
    icon: Wrench,
  },
  {
    id: 'archive',
    label: 'أرشيف الطلبات',
    shortLabel: 'الأرشيف',
    subtitle: 'الطلبات المُسلّمة وسجل العملاء السابقين',
    icon: Archive,
  },
  {
    id: 'prices',
    label: 'قائمة الأسعار',
    shortLabel: 'الأسعار',
    subtitle: 'أسعار الشمبرات والعدسات والخدمات',
    icon: Tag,
  },
  {
    id: 'stats',
    label: 'الإحصائيات',
    shortLabel: 'الإحصائيات',
    subtitle: 'ملخص الإيرادات ونمو الطلبات الشهري',
    icon: BarChart3,
  },
  {
    id: 'web-control',
    label: 'لوحة التحكم للموقع',
    shortLabel: 'لوحة الموقع',
    subtitle: 'إدارة منتجات الموقع وتوفرها لحظياً',
    icon: Globe,
    highlight: true,
  },
];

export const Header: React.FC<HeaderProps> = ({
  activePage,
  onNavigate,
  onAddCustomer,
  shopName,
  pendingWebOrdersCount = 0,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileMoreBtnRef = useRef<HTMLButtonElement | null>(null);

  const activeMenuItem = MENU_NAV_ITEMS.find((item) => item.id === activePage) ?? null;

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(target) &&
        !(mobileMoreBtnRef.current && mobileMoreBtnRef.current.contains(target))
      ) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const handleSelectPage = (page: NavPage) => {
    setMenuOpen(false);
    onNavigate(page);
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-[#101c28]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-5">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#customers"
            onClick={(e) => {
              e.preventDefault();
              handleSelectPage('customers');
            }}
            className="flex items-center gap-2 text-base sm:text-lg lg:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#e8cf8b] via-[#c9a24b] to-[#a8832f] text-white grid place-items-center shadow-sm">
              <Glasses className="w-5 h-5" />
            </span>
            <span>{shopName || 'Mido Optics'}</span>
          </a>

          {/* Zone 2: Top Navigation (ONLY 3 primary items) + Hamburger Menu Button */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <nav
              aria-label="التنقل الرئيسي"
              className="hidden md:flex items-center gap-4 lg:gap-6 text-xs lg:text-sm font-semibold"
            >
              {PRIMARY_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                const badgeCount = item.id === 'web-orders' ? pendingWebOrdersCount : 0;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      handleSelectPage(item.id);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`py-1.5 border-b-2 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'border-[#c9a24b] text-[#a8832f] dark:text-[#e8cf8b] font-bold'
                        : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0 opacity-85" />
                    <span>{item.label}</span>
                    {badgeCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-md bg-rose-600 text-white text-[10px] font-extrabold inline-flex items-center justify-center tabular-nums">
                        {badgeCount}
                      </span>
                    )}
                  </a>
                );
              })}
            </nav>

            {/* Hamburger Menu Button + Dropdown Drawer */}
            <div ref={menuContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-label="القائمة"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className={`min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeMenuItem || menuOpen
                    ? 'border-[#c9a24b] bg-[#f9f3e3] dark:bg-[#1f2b36] text-[#8f6c1e] dark:text-[#e8cf8b] shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-slate-700 dark:text-slate-200 hover:border-[#c9a24b]/70'
                }`}
              >
                {menuOpen ? (
                  <X className="w-4 h-4 shrink-0" />
                ) : (
                  <Menu className="w-4 h-4 shrink-0" />
                )}
                <span className="hidden sm:inline">
                  {activeMenuItem ? activeMenuItem.shortLabel : 'القائمة'}
                </span>
                <ChevronDown
                  className={`hidden sm:inline w-3.5 h-3.5 transition-transform ${
                    menuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="قائمة الصفحات"
                  className="fixed inset-x-3 top-16 md:inset-x-auto md:absolute md:left-0 md:top-[calc(100%+0.5rem)] md:w-80 max-h-[75vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] shadow-xl p-2 z-50 space-y-1"
                >
                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 flex items-center justify-between">
                    <span>أقسام النظام</span>
                    <button
                      type="button"
                      onClick={() => setMenuOpen(false)}
                      aria-label="إغلاق القائمة"
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {MENU_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activePage === item.id;
                    return (
                      <React.Fragment key={item.id}>
                        {item.highlight && (
                          <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
                        )}
                        <a
                          role="menuitem"
                          href={`#${item.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            handleSelectPage(item.id);
                          }}
                          aria-current={isActive ? 'page' : undefined}
                          className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                            isActive
                              ? 'bg-[#f9f3e3] dark:bg-[#1f2f3d] text-[#8f6c1e] dark:text-[#e8cf8b]'
                              : item.highlight
                              ? 'bg-[#f3f9fd]/70 dark:bg-[#192b3b]/70 text-slate-800 dark:text-slate-100 hover:bg-[#e7f3fb] dark:hover:bg-[#1f3447]'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1b2c3b]'
                          }`}
                        >
                          <span
                            className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 mt-0.5 ${
                              isActive || item.highlight
                                ? 'bg-[#c9a24b]/15 text-[#a8832f] dark:text-[#e8cf8b]'
                                : 'bg-slate-100 dark:bg-[#101c28] text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs sm:text-sm font-bold leading-tight">
                              {item.label}
                            </span>
                            {item.subtitle && (
                              <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                                {item.subtitle}
                              </span>
                            )}
                          </span>
                        </a>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Zone 3: Single Primary Action CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={onAddCustomer}
              className="min-h-[40px] px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] hover:from-[#e3c26e] hover:to-[#977427] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
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
        <div className="grid grid-cols-4 h-14 px-1">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            const badgeCount = item.id === 'web-orders' ? pendingWebOrdersCount : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectPage(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] px-1 rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#a8832f] dark:text-[#e8cf8b] font-bold'
                    : 'text-slate-500 dark:text-slate-400 font-medium'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-[10px] leading-tight whitespace-nowrap">
                  {item.shortLabel}
                </span>
                {badgeCount > 0 && (
                  <span className="absolute top-1 left-2 min-w-[16px] h-[16px] px-1 rounded-md bg-rose-600 text-white text-[9px] font-extrabold inline-flex items-center justify-center tabular-nums">
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
          <button
            ref={mobileMoreBtnRef}
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="المزيد من الصفحات"
            aria-expanded={menuOpen}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] px-1 rounded-lg transition-colors cursor-pointer ${
              activeMenuItem || menuOpen
                ? 'text-[#a8832f] dark:text-[#e8cf8b] font-bold'
                : 'text-slate-500 dark:text-slate-400 font-medium'
            }`}
          >
            <Menu className="w-4 h-4 shrink-0" />
            <span className="text-[10px] leading-tight whitespace-nowrap">
              {activeMenuItem ? activeMenuItem.shortLabel : 'المزيد'}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};
