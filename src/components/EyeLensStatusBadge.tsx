import React from 'react';
import { AlertTriangle, CheckCircle2, PackageX, Info } from 'lucide-react';
import { EyeTuple, LensInventorySnapshot } from '../types/optics';
import { checkEyeLensAvailability } from '../utils/optics';

interface EyeLensStatusBadgeProps {
  eye: 'R' | 'L';
  tuple: EyeTuple;
  inventory: LensInventorySnapshot | null;
  compact?: boolean;
}

export const EyeLensStatusBadge: React.FC<EyeLensStatusBadgeProps> = ({
  eye,
  tuple,
  inventory,
  compact = false,
}) => {
  const result = checkEyeLensAvailability(eye, tuple, inventory);

  if (result.status === 'empty') {
    return null;
  }

  const eyePrefix = eye === 'R' ? 'اليمين (R):' : 'الشمال (L):';

  if (result.status === 'in-stock') {
    return (
      <div
        className={`rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5 font-semibold ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
        }`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>
          {compact ? `${eyePrefix} ` : ''}
          {result.message}
        </span>
      </div>
    );
  }

  if (result.status === 'low-stock') {
    return (
      <div
        className={`rounded-xl border border-amber-300 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/35 text-amber-800 dark:text-amber-200 flex items-center gap-1.5 font-semibold ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
        }`}
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>
          {compact ? `${eyePrefix} ` : ''}
          {result.message}
        </span>
      </div>
    );
  }

  if (result.status === 'order-needed') {
    return (
      <div
        className={`rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 flex items-center gap-1.5 font-bold ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
        }`}
      >
        <PackageX className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
        <span>
          {compact ? `${eyePrefix} ` : ''}
          {result.message}
        </span>
      </div>
    );
  }

  if (result.status === 'invalid') {
    return (
      <div
        className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 flex items-center gap-1.5 ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
        }`}
      >
        <Info className="w-3.5 h-3.5 shrink-0 text-[#c9a24b]" />
        <span>{result.message}</span>
      </div>
    );
  }

  // no-inventory
  if (compact) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-[#0d1722]/60 text-slate-600 dark:text-slate-300 px-3 py-2 text-xs flex items-center gap-1.5">
      <Info className="w-3.5 h-3.5 shrink-0 text-[#c9a24b]" />
      <span>{result.message}</span>
    </div>
  );
};
