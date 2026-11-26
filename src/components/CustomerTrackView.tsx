import React, { useEffect, useState } from 'react';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { ArrowRight, Calendar, CheckCircle2, Glasses, Wrench } from 'lucide-react';
import { db } from '../lib/firebase';
import {
  CustomerRecord,
  EyeTuple,
  ORDER_STAGES,
  REPAIR_STAGES,
  RepairRecord,
  USAGE_TYPE_LABELS,
  UsageType,
} from '../types/optics';
import {
  calculateRemaining,
  formatArabicDateTime,
  formatArabicPickupDate,
  sanitizePickupDate,
  sanitizeToken,
} from '../utils/optics';

interface TrackDisplayData {
  mode: 'customer' | 'repair';
  shopName: string;
  name: string;
  frame: string;
  lens: string;
  glassesType: string;
  weldingType: string;
  representativeName: string;
  total: number | null;
  paid: number | null;
  photo: string;
  r: EyeTuple;
  l: EyeTuple;
  add: string;
  usageType: UsageType;
  status: number;
  hist: Array<number | null>;
  pickupDate: string;
  delivered: boolean;
}

interface CustomerTrackViewProps {
  token: string;
  mode?: 'customer' | 'repair';
  localCustomers: CustomerRecord[];
  localRepairs?: RepairRecord[];
  onBack?: () => void;
}

export const CustomerTrackView: React.FC<CustomerTrackViewProps> = ({
  token,
  mode = 'customer',
  localCustomers,
  localRepairs = [],
  onBack,
}) => {
  const [data, setData] = useState<TrackDisplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const cleanTok = sanitizeToken(token);
    if (!cleanTok || cleanTok.length < 8) {
      setLoading(false);
      setErrorMsg('رابط المتابعة غير صالح');
      return;
    }

    const isRepair = mode === 'repair';
    const localCustomer = !isRepair
      ? localCustomers.find((c) => c.tok === cleanTok)
      : undefined;
    const localRepair = isRepair
      ? localRepairs.find((r) => r.tok === cleanTok)
      : undefined;

    if (localCustomer) {
      setData({
        mode: 'customer',
        shopName: 'Mido Optics',
        name: localCustomer.name,
        frame: localCustomer.frame,
        lens: localCustomer.lens,
        glassesType: '',
        weldingType: '',
        representativeName: '',
        total: localCustomer.total,
        paid: localCustomer.paid,
        photo: localCustomer.photo,
        r: localCustomer.r,
        l: localCustomer.l,
        add: localCustomer.add || '',
        usageType: localCustomer.usageType || '',
        status: localCustomer.status,
        hist: localCustomer.hist,
        pickupDate: localCustomer.pickupDate || '',
        delivered: Boolean(localCustomer.delivered),
      });
      setLoading(false);
    } else if (localRepair) {
      setData({
        mode: 'repair',
        shopName: 'Mido Optics',
        name: localRepair.name,
        frame: '',
        lens: '',
        glassesType: localRepair.glassesType,
        weldingType: localRepair.weldingType,
        representativeName: localRepair.representativeName,
        total: localRepair.cost,
        paid: localRepair.paid,
        photo: '',
        r: ['-', '-', '-'],
        l: ['-', '-', '-'],
        add: '',
        usageType: '',
        status: localRepair.status,
        hist: localRepair.hist,
        pickupDate: localRepair.pickupDate || '',
        delivered: Boolean(localRepair.delivered),
      });
      setLoading(false);
    } else {
      setLoading(true);
      setErrorMsg(null);
    }

    const trackRef = doc(db, isRepair ? 'repairTrack' : 'track', cleanTok);

    const applySnapshotData = (d: Record<string, unknown>) => {
      if (!active) return;
      setErrorMsg(null);
      setLoading(false);
      if (isRepair) {
        setData({
          mode: 'repair',
          shopName: String(d.shopName || 'Mido Optics'),
          name: String(d.n || ''),
          frame: '',
          lens: '',
          glassesType: String(d.glassesType || ''),
          weldingType: String(d.weldingType || ''),
          representativeName: String(d.representativeName || ''),
          total:
            typeof d.cost === 'number' && Number.isFinite(d.cost)
              ? d.cost
              : localRepair?.cost ?? null,
          paid:
            typeof d.paid === 'number' && Number.isFinite(d.paid)
              ? d.paid
              : localRepair?.paid ?? null,
          photo: '',
          r: ['-', '-', '-'],
          l: ['-', '-', '-'],
          add: '',
          usageType: '',
          status: Number(d.s || 0),
          hist: Array.isArray(d.h) ? (d.h as Array<number | null>) : [],
          pickupDate: sanitizePickupDate(d.pickupDate ?? localRepair?.pickupDate ?? ''),
          delivered:
            typeof d.delivered === 'boolean'
              ? d.delivered
              : Boolean(localRepair?.delivered),
        });
      } else {
        const rawUsage = d.usageType === 'distance' || d.usageType === 'reading' ? d.usageType : '';
        setData({
          mode: 'customer',
          shopName: String(d.shopName || 'Mido Optics'),
          name: String(d.n || ''),
          frame: String(d.frame || ''),
          lens: String(d.lens || ''),
          glassesType: '',
          weldingType: '',
          representativeName: '',
          total:
            typeof d.total === 'number' && Number.isFinite(d.total)
              ? d.total
              : localCustomer?.total ?? null,
          paid:
            typeof d.paid === 'number' && Number.isFinite(d.paid)
              ? d.paid
              : localCustomer?.paid ?? null,
          photo: String(d.ph || ''),
          r: Array.isArray(d.r)
            ? ([d.r[0] || '-', d.r[1] || '-', d.r[2] || '-'] as EyeTuple)
            : ['-', '-', '-'],
          l: Array.isArray(d.l)
            ? ([d.l[0] || '-', d.l[1] || '-', d.l[2] || '-'] as EyeTuple)
            : ['-', '-', '-'],
          add: String(d.add ?? localCustomer?.add ?? ''),
          usageType: rawUsage || localCustomer?.usageType || '',
          status: Number(d.s || 0),
          hist: Array.isArray(d.h) ? (d.h as Array<number | null>) : [],
          pickupDate: sanitizePickupDate(d.pickupDate ?? localCustomer?.pickupDate ?? ''),
          delivered:
            typeof d.delivered === 'boolean'
              ? d.delivered
              : Boolean(localCustomer?.delivered),
        });
      }
    };

    const hasLocalFallback = Boolean(localCustomer || localRepair);

    const unsub = onSnapshot(
      trackRef,
      { includeMetadataChanges: true },
      async (snap) => {
        if (!active) return;
        if (!snap.exists()) {
          if (snap.metadata.fromCache) {
            try {
              const serverSnap = await getDocFromServer(trackRef);
              if (!active) return;
              if (serverSnap.exists()) {
                applySnapshotData(serverSnap.data());
                return;
              }
            } catch {
              if (!active) return;
              if (!hasLocalFallback) {
                setLoading(false);
                setErrorMsg(
                  'تعذر الاتصال بالخادم، تأكد من الاتصال بالإنترنت وأعد المحاولة.'
                );
              }
              return;
            }
          }

          setLoading(false);
          if (!hasLocalFallback) {
            setData(null);
            setErrorMsg(
              'لم يتم العثور على هذا الطلب، تأكد من الرابط أو من مزامنة الطلب من جهاز المحل.'
            );
          }
          return;
        }

        applySnapshotData(snap.data());
      },
      () => {
        if (!active) return;
        setLoading(false);
        if (!hasLocalFallback) {
          setErrorMsg('تعذر تحميل حالة الطلب حالياً، يرجى المحاولة مرة أخرى.');
        }
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [token, mode, localCustomers, localRepairs]);

  const stage = data ? Math.max(0, Math.min(4, data.status)) : 0;
  const stagesList = data?.mode === 'repair' || mode === 'repair' ? REPAIR_STAGES : ORDER_STAGES;
  const hasFinancials =
    data !== null && typeof data.total === 'number' && typeof data.paid === 'number';
  const remaining = hasFinancials
    ? calculateRemaining(data.total as number, data.paid as number)
    : 0;

  const handleBackClick = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = mode === 'repair' ? '#repairs' : '#customers';
    }
  };

  const isRepairView = data?.mode === 'repair' || mode === 'repair';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f3f9fd] dark:bg-[#0d1722]">
      <main className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-6 shadow-sm space-y-5 text-center">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleBackClick}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f3f9fd] dark:bg-[#1b3042] text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع للخلف</span>
          </button>
          <span className="text-xs font-bold text-[#a8832f] dark:text-[#e8cf8b]">
            {data?.shopName || 'Mido Optics'}
          </span>
        </div>

        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#e8cf8b] to-[#a8832f] text-white grid place-items-center mx-auto">
          {isRepairView ? <Wrench className="w-6 h-6" /> : <Glasses className="w-6 h-6" />}
        </div>

        <div>
          <h1 className="text-xl font-extrabold">
            {isRepairView
              ? data?.name
                ? `متابعة تصليح نظارة ${data.name}`
                : 'متابعة حالة التصليح'
              : data?.name
              ? `متابعة نظارة ${data.name}`
              : 'متابعة حالة النظارة'}
          </h1>

          {isRepairView && data && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
              {(data.glassesType || data.weldingType) && (
                <p>{[data.glassesType, data.weldingType].filter(Boolean).join(' · ')}</p>
              )}
              {data.representativeName && (
                <p className="font-semibold text-slate-600 dark:text-slate-300">
                  المندوب المسؤول: {data.representativeName}
                </p>
              )}
            </div>
          )}

          {!isRepairView && data && (data.frame || data.lens || data.usageType) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {[
                data.frame,
                data.lens,
                data.usageType ? USAGE_TYPE_LABELS[data.usageType] : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          {!isRepairView && data?.pickupDate && (
            <p className="text-xs font-semibold text-[#8f6c1e] dark:text-[#e8cf8b] mt-1.5 inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>موعد الاستلام: {formatArabicPickupDate(data.pickupDate)}</span>
            </p>
          )}
        </div>

        {loading && !data && (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-6">
            جاري تحميل حالة الطلب...
          </p>
        )}

        {errorMsg && !data && (
          <p className="text-sm text-rose-600 dark:text-rose-400 py-6">{errorMsg}</p>
        )}

        {data && (
          <>
            {!isRepairView && data.photo && data.photo.startsWith('data:image/') && (
              <img
                src={data.photo}
                alt="صورة الشمبر"
                referrerPolicy="no-referrer"
                className="w-full max-h-48 object-contain rounded-2xl bg-[#f3f9fd] dark:bg-[#1b3042] border border-slate-200 dark:border-slate-700"
              />
            )}

            {/* Financial Summary: Total/Cost, Paid, Remaining */}
            {hasFinancials && (
              <div
                aria-label="ملخص الحساب"
                className="grid grid-cols-3 gap-2 rounded-2xl bg-[#f3f9fd] dark:bg-[#1b3042]/75 border border-slate-200 dark:border-slate-700 p-3 text-center tabular-nums"
              >
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {isRepairView ? 'التكلفة' : 'المبلغ الكلي'}
                  </div>
                  <div className="text-sm sm:text-base font-extrabold mt-0.5 text-slate-900 dark:text-white">
                    {data.total} ج
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    المدفوع
                  </div>
                  <div className="text-sm sm:text-base font-extrabold mt-0.5 text-emerald-700 dark:text-emerald-400">
                    {data.paid} ج
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    الباقي
                  </div>
                  <div
                    className={`text-sm sm:text-base font-extrabold mt-0.5 ${
                      remaining > 0
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {remaining > 0 ? `${remaining} ج` : 'خالص'}
                  </div>
                </div>
              </div>
            )}

            {!isRepairView && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-center text-xs font-mono-num" dir="ltr">
                  <thead className="bg-[#e3f2fb] dark:bg-[#1b3042] text-[#8f6c1e] dark:text-[#e8cf8b]">
                    <tr>
                      <th className="py-2 px-2"></th>
                      <th className="py-2 px-2">SPH</th>
                      <th className="py-2 px-2">CYL</th>
                      <th className="py-2 px-2">AXIS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                      <td className="py-2 px-2 font-bold">R</td>
                      {data.r.map((val, idx) => (
                        <td key={idx} className="py-2 px-2">
                          {val}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2 px-2 font-bold">L</td>
                      {data.l.map((val, idx) => (
                        <td key={idx} className="py-2 px-2">
                          {val}
                        </td>
                      ))}
                    </tr>
                    {data.add && (
                      <tr className="bg-[#f3f9fd]/70 dark:bg-[#1b3042]/40">
                        <td className="py-1.5 px-2 font-bold text-[#8f6c1e] dark:text-[#e8cf8b]">
                          ADD
                        </td>
                        <td colSpan={3} className="py-1.5 px-2 font-bold">
                          {data.add}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-2 text-right">
              {stagesList.map((label, idx) => {
                const isDone = idx < stage;
                const isCurrent = idx === stage;
                const ts = data.hist?.[idx];
                return (
                  <div
                    key={label}
                    className={`px-3.5 py-2.5 rounded-xl border flex items-center gap-3 ${
                      isCurrent
                        ? 'border-[#c9a24b] bg-[#f3f9fd] dark:bg-[#1b3042]'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1722]/60'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full text-xs font-bold grid place-items-center shrink-0 ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-[#c9a24b] text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {idx <= stage ? '✓' : idx + 1}
                    </span>
                    <span className="flex-1 text-sm font-semibold">{label}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {ts ? formatArabicDateTime(ts) : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-sm font-semibold flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300">
              {data.delivered ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {isRepairView
                      ? 'تم تسليم النظارة بعد التصليح بنجاح'
                      : 'تم تسليم النظارة للعميل بنجاح'}
                  </span>
                </>
              ) : stage === 4 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {isRepairView
                      ? 'التصليح جاهز الآن، تفضل بالاستلام!'
                      : 'نظارتك جاهزة الآن، تفضل بالاستلام!'}
                  </span>
                </>
              ) : (
                <span>
                  {isRepairView
                    ? 'يتم تحديث حالة التصليح أولاً بأول'
                    : 'يتم تحديث حالة النظارة أولاً بأول'}
                </span>
              )}
            </p>
          </>
        )}
      </main>
    </div>
  );
};
