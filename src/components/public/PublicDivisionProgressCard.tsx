import { memo, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  Lock,
  Navigation2,
  Plus,
  QrCode,
  ShoppingBag,
  Trophy,
  Wallet,
} from 'lucide-react';
import { formatQuantity } from '../../utils/format';

export interface TopSectorChipItem {
  id: number;
  name: string;
  total_liters: number;
}

interface PublicDivisionProgressCardProps {
  totalLiters: number;
  totalOrders: number;
  divisionLimit: number;
  percentComplete: number;
  upiPercent: number;
  cashPercent: number;
  ordersOpen: boolean;
  topSectors?: TopSectorChipItem[];
  topSectorName?: string;
  topSectorLiters?: number;
  onQuickEntry?: () => void;
  className?: string;
}

export const PublicDivisionProgressCard = memo(function PublicDivisionProgressCard({
  totalLiters,
  totalOrders,
  divisionLimit,
  percentComplete,
  upiPercent,
  cashPercent,
  ordersOpen,
  topSectors,
  topSectorName,
  topSectorLiters = 0,
  onQuickEntry,
  className = '',
}: PublicDivisionProgressCardProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [visibleChipCount, setVisibleChipCount] = useState(1);

  const rankedSectors: TopSectorChipItem[] =
    topSectors && topSectors.length > 0
      ? topSectors.slice(0, 5)
      : [
          {
            id: 0,
            name: topSectorName || 'Wandoor Division',
            total_liters: topSectorLiters,
          },
        ];

  useEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateCount = (width: number) => {
      // Each sector card targets ~150px + 8px gap
      const fit = Math.max(1, Math.min(5, Math.floor((width + 8) / 158)));
      setVisibleChipCount(fit);
    };

    updateCount(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateCount(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const displayedSectors = rankedSectors.slice(0, visibleChipCount);
  const safePct = Math.min(100, Math.max(0, Number(percentComplete) || 0));
  const visualPct = safePct > 0 ? Math.max(3, safePct) : 0;
  const radius = 74;
  const arcLength = Math.PI * radius;
  const dashOffset = arcLength * (1 - visualPct / 100);
  const pointerAngleDeg = -90 + (safePct / 100) * 180;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl glass-crimson text-white p-3.5 sm:p-5 lg:p-6 xl:p-7 flex flex-col justify-between gap-2.5 sm:gap-3 lg:gap-4 shadow-lg ${className}`}
    >
      {/* Top Row: Title + Quick Entry Plus */}
      <div className="relative z-10 flex items-center justify-between gap-2.5 lg:gap-3">
        <div className="flex items-center gap-2 lg:gap-3 min-w-0">
          <span className="w-8 h-8 lg:w-10 lg:h-10 xl:w-11 xl:h-11 rounded-xl lg:rounded-2xl bg-white/16 border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] inline-flex items-center justify-center shrink-0">
            <Trophy className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-[#FCE36D]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm lg:text-base xl:text-lg font-bold text-white truncate leading-tight">
              Division Progress
            </h2>
            <p className="text-[10px] sm:text-[11px] lg:text-xs xl:text-sm text-white/75 num leading-tight">
              Target: {formatQuantity(divisionLimit)} L
            </p>
          </div>
        </div>

        {onQuickEntry && ordersOpen && (
          <button
            type="button"
            onClick={onQuickEntry}
            aria-label="Quick Entry"
            title="Quick Entry"
            className="w-8 h-8 lg:w-10 lg:h-10 xl:w-11 xl:h-11 rounded-full bg-white/16 hover:bg-white/26 border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] text-[#FCE36D] inline-flex items-center justify-center transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5 lg:w-5 lg:h-5" />
          </button>
        )}
      </div>

      {/* Middle Row: Compact Metric + Status on Left, Compact Semi-Circle Gauge on Right */}
      <div className="relative z-10 grid grid-cols-12 gap-2 lg:gap-3 items-center">
        <div className="col-span-6 space-y-1 lg:space-y-2">
          <p className="text-[11px] lg:text-sm xl:text-base text-white/80 font-medium">
            Total Payasam
          </p>
          <div className="flex flex-wrap items-center gap-1.5 lg:gap-2.5">
            <p className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight num text-white leading-none drop-shadow-xs">
              {formatQuantity(totalLiters)}
              <span className="text-base lg:text-2xl xl:text-3xl font-bold text-[#FCE36D] ml-1">
                L
              </span>
            </p>

            {ordersOpen ? (
              <span className="inline-flex items-center gap-1 lg:gap-1.5 px-2 py-0.5 lg:px-3 lg:py-1 rounded-full bg-emerald-400/22 border border-emerald-300/45 text-[10px] lg:text-xs xl:text-sm font-bold text-emerald-100 whitespace-nowrap shadow-xs">
                <CheckCircle2 className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 shrink-0" />
                <span>Open</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 lg:gap-1.5 px-2 py-0.5 lg:px-3 lg:py-1 rounded-full bg-black/40 border border-white/25 text-[10px] lg:text-xs xl:text-sm font-bold text-amber-200 whitespace-nowrap">
                <Lock className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 shrink-0" />
                <span>Closed</span>
              </span>
            )}
          </div>
          <p className="text-[11px] lg:text-sm xl:text-base text-white/80 font-semibold num">
            {safePct.toFixed(1)}% achieved
          </p>
        </div>

        {/* Compact Semi-Circle Glass Gauge + Center Arrow */}
        <div className="col-span-6 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-[144px] sm:max-w-[162px] lg:max-w-[210px] xl:max-w-[235px] aspect-[200/116]">
            <svg
              viewBox="0 0 200 116"
              className="w-full h-full overflow-visible"
              aria-label={`Division progress ${safePct.toFixed(1)} percent`}
            >
              <defs>
                <linearGradient
                  id="payasamGaugeGrad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#FFF099" />
                  <stop offset="50%" stopColor="#FCE36D" />
                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
              </defs>

              {/* Outer Glass Rim */}
              <path
                d="M 26 98 A 74 74 0 0 1 174 98"
                fill="none"
                stroke="rgba(255, 255, 255, 0.20)"
                strokeWidth="26"
                strokeLinecap="round"
              />

              {/* Frosted Track */}
              <path
                d="M 26 98 A 74 74 0 0 1 174 98"
                fill="none"
                stroke="rgba(43, 4, 6, 0.44)"
                strokeWidth="22"
                strokeLinecap="round"
              />

              {/* Progress Arc (Crisp Glassy Fill, Zero Glow) */}
              {visualPct > 0 && (
                <path
                  d="M 26 98 A 74 74 0 0 1 174 98"
                  fill="none"
                  stroke="url(#payasamGaugeGrad)"
                  strokeWidth="22"
                  strokeLinecap="round"
                  strokeDasharray={arcLength}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
              )}
            </svg>

            {/* Center Frosted Hub + Navigation2 Arrow */}
            <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-end pointer-events-none">
              <div
                className="w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14 xl:w-16 xl:h-16 rounded-full bg-white/18 border border-white/30 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.45),0_6px_14px_-4px_rgba(0,0,0,0.32)] flex items-center justify-center transition-transform duration-700 ease-out"
                style={{ transform: `rotate(${pointerAngleDeg}deg)` }}
              >
                <Navigation2
                  className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 xl:w-8 xl:h-8 text-[#FCE36D] fill-[#FCE36D] drop-shadow-sm"
                  strokeWidth={2}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Compact UPI %, Cash %, Orders + Leading Sector Glass Pill */}
      <div className="relative z-10 pt-2 lg:pt-3.5 border-t border-white/15 flex items-center justify-between gap-2 lg:gap-3">
        <div className="flex items-center gap-2 lg:gap-2.5 shrink-0">
          {/* 1. UPI % Circle */}
          <div
            title={`UPI Share: ${upiPercent}%`}
            className="relative w-9 h-9 lg:w-11 lg:h-11 xl:w-12 xl:h-12 rounded-full bg-white/16 border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] flex items-center justify-center"
          >
            <QrCode className="w-3.5 h-3.5 lg:w-[18px] lg:h-[18px] xl:w-5 xl:h-5 text-white" />
            <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-4 lg:min-w-[26px] lg:h-5 px-1 lg:px-1.5 rounded-full bg-[#FCE36D] text-[#4A070A] text-[9px] lg:text-[11px] font-extrabold num flex items-center justify-center shadow-sm border border-white/50">
              {upiPercent}%
            </span>
          </div>

          {/* 2. Cash Handover % Circle */}
          <div
            title={`Cash Handover Share: ${cashPercent}%`}
            className="relative w-9 h-9 lg:w-11 lg:h-11 xl:w-12 xl:h-12 rounded-full bg-white/16 border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] flex items-center justify-center"
          >
            <Wallet className="w-3.5 h-3.5 lg:w-[18px] lg:h-[18px] xl:w-5 xl:h-5 text-white" />
            <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-4 lg:min-w-[26px] lg:h-5 px-1 lg:px-1.5 rounded-full bg-white text-[#5C0A0E] text-[9px] lg:text-[11px] font-extrabold num flex items-center justify-center shadow-sm border border-white/60">
              {cashPercent}%
            </span>
          </div>

          {/* 3. Total Orders Circle */}
          <div
            title={`Total Orders: ${totalOrders}`}
            className="relative w-9 h-9 lg:w-11 lg:h-11 xl:w-12 xl:h-12 rounded-full bg-white/16 border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] flex items-center justify-center"
          >
            <ShoppingBag className="w-3.5 h-3.5 lg:w-[18px] lg:h-[18px] xl:w-5 xl:h-5 text-white" />
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-4 lg:min-w-[24px] lg:h-5 px-1 lg:px-1.5 rounded-full bg-emerald-400 text-emerald-950 text-[9px] lg:text-[11px] font-extrabold num flex items-center justify-center shadow-sm border border-white/50">
              {totalOrders}
            </span>
          </div>
        </div>

        {/* Responsive Top Sector Cards Strip (1..5 cards depending on available width) */}
        <div
          ref={stripRef}
          className="flex-1 min-w-0 flex items-center gap-2"
        >
          {displayedSectors.map((sec, idx) => {
            const rank = idx + 1;
            const isFirst = rank === 1;
            const isSecond = rank === 2;
            if (isFirst) {
              return (
                <div
                  key={sec.id}
                  className="flex-1 min-w-0 rounded-2xl bg-gradient-to-r from-[#FCE36D] via-[#FACC15] to-[#F59E0B] border border-[#FFF5B8]/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_4px_12px_-4px_rgba(0,0,0,0.28)] px-2.5 py-1 lg:px-3 lg:py-2 flex items-center gap-2 lg:gap-2.5"
                >
                  <span className="w-6 h-6 lg:w-8 lg:h-8 rounded-lg lg:rounded-xl bg-gradient-to-br from-[#8F0D14] to-[#5C0A0E] text-white border border-white/20 inline-flex items-center justify-center shrink-0 shadow-xs">
                    <Crown className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] lg:text-xs xl:text-[13px] font-extrabold text-[#2B0406] truncate leading-tight">
                      {sec.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="px-1.5 lg:px-2 py-0.2 rounded-full bg-[#5C0A0E] text-white text-[9px] lg:text-[11px] font-extrabold num leading-tight">
                        #1
                      </span>
                      <span className="text-[10px] lg:text-xs text-[#4A070A] font-bold num truncate">
                        {formatQuantity(Number(sec.total_liters) || 0)} L
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            if (isSecond) {
              return (
                <div
                  key={sec.id}
                  className="flex-1 min-w-0 rounded-2xl bg-gradient-to-r from-[#F8FAFC] via-[#E2E8F0] to-[#CBD5E1] border border-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_12px_-4px_rgba(0,0,0,0.25)] px-2.5 py-1 lg:px-3 lg:py-2 flex items-center gap-2 lg:gap-2.5"
                >
                  <span className="w-6 h-6 lg:w-8 lg:h-8 rounded-lg lg:rounded-xl bg-gradient-to-br from-[#475569] to-[#1E293B] text-white border border-white/25 text-[10px] lg:text-xs font-extrabold num inline-flex items-center justify-center shrink-0 shadow-xs">
                    #2
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] lg:text-xs xl:text-[13px] font-extrabold text-[#0F172A] truncate leading-tight">
                      {sec.name}
                    </p>
                    <p className="text-[10px] lg:text-xs text-[#334155] font-bold num truncate mt-0.5">
                      {formatQuantity(Number(sec.total_liters) || 0)} L
                    </p>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={sec.id}
                className="flex-1 min-w-0 rounded-2xl bg-white/16 border border-white/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] px-2.5 py-1 lg:px-3 lg:py-2 flex items-center gap-2 lg:gap-2.5"
              >
                <span className="w-6 h-6 lg:w-8 lg:h-8 rounded-lg lg:rounded-xl bg-white/15 border border-white/25 text-white text-[10px] lg:text-xs font-extrabold num inline-flex items-center justify-center shrink-0">
                  #{rank}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] lg:text-xs xl:text-[13px] font-bold text-white truncate leading-tight">
                    {sec.name}
                  </p>
                  <p className="text-[10px] lg:text-xs text-white/80 font-medium num truncate mt-0.5">
                    {formatQuantity(Number(sec.total_liters) || 0)} L
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default PublicDivisionProgressCard;
