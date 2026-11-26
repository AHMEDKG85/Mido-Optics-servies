import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  Cloud,
  CloudOff,
  Download,
  LogIn,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { SyncState } from '../types/optics';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface SyncToolbarProps {
  user: User | null;
  syncState: SyncState;
  pendingCount: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onManualSync: () => Promise<void>;
}

export const SyncToolbar: React.FC<SyncToolbarProps> = ({
  user,
  syncState,
  pendingCount,
  theme,
  onToggleTheme,
  onSignIn,
  onSignOut,
  onManualSync,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const handleAuthClick = async () => {
    setAuthBusy(true);
    try {
      if (user) {
        await onSignOut();
      } else {
        await onSignIn();
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const renderSyncLabel = () => {
    switch (syncState) {
      case 'synced':
        return {
          icon: Cloud,
          text: 'متزامن مع كل الأجهزة',
          tone: 'text-emerald-700 dark:text-emerald-400',
        };
      case 'syncing':
        return {
          icon: RefreshCw,
          text: pendingCount > 0 ? `جاري مزامنة ${pendingCount} عملية...` : 'جاري المزامنة...',
          tone: 'text-amber-700 dark:text-amber-400',
        };
      case 'offline':
        return {
          icon: CloudOff,
          text:
            pendingCount > 0
              ? `بدون إنترنت · ${pendingCount} تعديل محفوظ محلياً`
              : 'وضع عدم الاتصال · يعمل محلياً وسيُزامَن تلقائياً',
          tone: 'text-amber-700 dark:text-amber-400',
        };
      case 'error':
        return {
          icon: CloudOff,
          text: 'تعذر الاتصال بالسحابة · محفوظ محلياً',
          tone: 'text-rose-700 dark:text-rose-400',
        };
      default:
        return {
          icon: CloudOff,
          text:
            pendingCount > 0
              ? `محفوظ على هذا الجهاز (${pendingCount} بانتظار تسجيل الدخول)`
              : 'محفوظ على هذا الجهاز · سجّل الدخول للمزامنة عبر الأجهزة',
          tone: 'text-slate-600 dark:text-slate-300',
        };
    }
  };

  const syncInfo = renderSyncLabel();
  const SyncIcon = syncInfo.icon;

  return (
    <>
      <div className="border-b border-slate-200/70 dark:border-slate-800/80 bg-[#e9f4fb]/70 dark:bg-[#13212e]/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Real connectivity & Firebase sync telemetry */}
          <div className={`flex items-center gap-2 font-medium ${syncInfo.tone}`}>
            <SyncIcon
              className={`w-4 h-4 shrink-0 ${syncState === 'syncing' ? 'animate-spin' : ''}`}
            />
            <span>{syncInfo.text}</span>
            {user && pendingCount > 0 && syncState !== 'offline' && (
              <button
                type="button"
                onClick={() => void onManualSync()}
                className="underline hover:opacity-80 font-semibold cursor-pointer whitespace-nowrap"
              >
                مزامنة الآن
              </button>
            )}
          </div>

          {/* Account, PWA Install & Theme Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={() => void install()}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#c9a24b]/15 hover:bg-[#c9a24b]/25 text-[#8f6c1e] dark:text-[#e8cf8b] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تثبيت التطبيق</span>
              </button>
            )}

            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center gap-1.5 hover:bg-white/60 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تثبيت على iPhone</span>
              </button>
            )}

            <button
              type="button"
              disabled={authBusy}
              onClick={() => void handleAuthClick()}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white dark:bg-[#192b3b] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-[#c9a24b] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {user ? (
                <>
                  <LogOut className="w-3.5 h-3.5 text-[#c9a24b]" />
                  <span className="max-w-[140px] truncate" dir="ltr">
                    {user.email || 'حساب متصل'}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>خروج</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5 text-[#c9a24b]" />
                  <span>ربط الحساب عبر الأجهزة</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
              title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
              className="min-h-[36px] min-w-[36px] p-2 rounded-lg bg-white dark:bg-[#192b3b] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#15232f] border border-slate-200 dark:border-slate-800 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-2">تثبيت Mido Optics على iPhone / iPad</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              1. اضغط على زر <strong>المشاركة (Share)</strong> في شريط Safari.
              <br />
              2. اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong> للعمل بدون إنترنت في أي وقت.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#c9a24b] text-white font-semibold text-sm cursor-pointer"
            >
              فهمت
            </button>
          </div>
        </div>
      )}
    </>
  );
};
