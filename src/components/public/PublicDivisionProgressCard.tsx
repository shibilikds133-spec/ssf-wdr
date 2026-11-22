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

interface PublicDivisionProgressCardProps {
  totalLiters: number;
  totalOrders: number;
  divisionLimit: number;
  percentComplete: number;
  upiPercent: number;
  cashPercent: number;
  ordersOpen: boolean;
  topSectorName?: string;
  topSectorLiters?: number;
  onQuickEntry?: () => void;
  className?: string;
}

export function PublicDivisionProgressCard({
  totalLiters,
  totalOrders,
  divisionLimit,
  percentComplete,
  upiPercent,
  cashPercent,
  ordersOpen,
  topSectorName,
  topSectorLiters = 0,
  onQuickEntry,
  className = '',
}: PublicDivisionProgressCardProps) {
  const safePct = Math.min(100, Math.max(0, Number(percentComplete) || 0));
  const visualPct = safePct > 0 ? Math.max(3, safePct) : 0;
  const radius = 74;
  const arcLength = Math.PI * radius;
  const dashOffset = arcLength * (1 - visualPct / 100);
  const pointerAngleDeg = -90 + (safePct / 100) * 180;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl glass-crimson text-white p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-xl ${className}`}
    >
      {/* Top Frosted Specular Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.12] to-transparent"
      />

      {/* Top Row: Title + Quick Entry Plus */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-2xl bg-white/14 backdrop-blur-xl border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] inline-flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-[#FCE36D]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white truncate leading-tight">
              Division Progress
            </h2>
            <p className="text-[11px] text-white/75 num leading-tight">
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
            className="w-9 h-9 rounded-full bg-white/14 hover:bg-white/24 backdrop-blur-xl border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] text-[#FCE36D] inline-flex items-center justify-center transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Middle Row: Metric + Status on Left, Frosted Semi-Circle Gauge + Big Arrow on Right */}
      <div className="relative z-10 grid grid-cols-12 gap-3 items-center">
        <div className="col-span-6 space-y-2">
          <p className="text-xs text-white/80 font-medium">Total Payasam</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-4xl xl:text-[44px] font-extrabold tracking-tight num text-white leading-none drop-shadow-xs">
              {formatQuantity(totalLiters)}
              <span className="text-lg font-bold text-[#FCE36D] ml-1">L</span>
            </p>

            {ordersOpen ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-400/20 backdrop-blur-md border border-emerald-300/45 text-[11px] font-bold text-emerald-100 whitespace-nowrap shadow-xs">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Open</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/35 backdrop-blur-md border border-white/25 text-[11px] font-bold text-amber-200 whitespace-nowrap">
                <Lock className="w-3 h-3 shrink-0" />
                <span>Closed</span>
              </span>
            )}
          </div>
          <p className="text-xs text-white/80 font-semibold num">
            {safePct.toFixed(1)}% achieved
          </p>
        </div>

        {/* Semi-Circle Glass Gauge + Big Navigation2 Arrow */}
        <div className="col-span-6 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-[200px] aspect-[200/116]">
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
                  <stop offset="45%" stopColor="#FCE36D" />
                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
                <filter
                  id="payasamGaugeGlow"
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feDropShadow
                    dx="0"
                    dy="2"
                    stdDeviation="4"
                    floodColor="#FCE36D"
                    floodOpacity="0.45"
                  />
                </filter>
              </defs>

              {/* Outer Glass Rim */}
              <path
                d="M 26 98 A 74 74 0 0 1 174 98"
                fill="none"
                stroke="rgba(255, 255, 255, 0.22)"
                strokeWidth="28"
                strokeLinecap="round"
              />

              {/* Frosted Track */}
              <path
                d="M 26 98 A 74 74 0 0 1 174 98"
                fill="none"
                stroke="rgba(43, 4, 6, 0.42)"
                strokeWidth="24"
                strokeLinecap="round"
              />

              {/* Progress Arc with Gold Glow */}
              {visualPct > 0 && (
                <path
                  d="M 26 98 A 74 74 0 0 1 174 98"
                  fill="none"
                  stroke="url(#payasamGaugeGrad)"
                  strokeWidth="24"
                  strokeLinecap="round"
                  strokeDasharray={arcLength}
                  strokeDashoffset={dashOffset}
                  filter="url(#payasamGaugeGlow)"
                  className="transition-all duration-700 ease-out"
                />
              )}
            </svg>

            {/* Bigger Center Frosted Hub + Navigation2 Arrow */}
            <div className="absolute inset-x-0 bottom-1.5 flex flex-col items-center justify-end pointer-events-none">
              <div
                className="w-14 h-14 rounded-full bg-white/14 backdrop-blur-xl border border-white/30 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.45),0_8px_20px_-4px_rgba(0,0,0,0.35)] flex items-center justify-center transition-transform duration-700 ease-out"
                style={{ transform: `rotate(${pointerAngleDeg}deg)` }}
              >
                <Navigation2
                  className="w-7 h-7 text-[#FCE36D] fill-[#FCE36D] drop-shadow-sm"
                  strokeWidth={2}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: UPI %, Cash %, Orders + Leading Sector Glass Pill */}
      <div className="relative z-10 pt-2.5 border-t border-white/15 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 shrink-0">
          {/* 1. UPI % Circle */}
          <div
            title={`UPI Share: ${upiPercent}%`}
            className="relative w-11 h-11 rounded-full bg-white/14 backdrop-blur-xl border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] flex items-center justify-center"
          >
            <QrCode className="w-4 h-4 text-white" />
            <span className="absolute -top-1.5 -right-2 min-w-[26px] h-5 px-1.5 rounded-full bg-[#FCE36D] text-[#4A070A] text-[10px] font-extrabold num flex items-center justify-center shadow-sm border border-white/50">
              {upiPercent}%
            </span>
          </div>

          {/* 2. Cash Handover % Circle */}
          <div
            title={`Cash Handover Share: ${cashPercent}%`}
            className="relative w-11 h-11 rounded-full bg-white/14 backdrop-blur-xl border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] flex items-center justify-center"
          >
            <Wallet className="w-4 h-4 text-white" />
            <span className="absolute -top-1.5 -right-2 min-w-[26px] h-5 px-1.5 rounded-full bg-white text-[#5C0A0E] text-[10px] font-extrabold num flex items-center justify-center shadow-sm border border-white/60">
              {cashPercent}%
            </span>
          </div>

          {/* 3. Total Orders Circle */}
          <div
            title={`Total Orders: ${totalOrders}`}
            className="relative w-11 h-11 rounded-full bg-white/14 backdrop-blur-xl border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] flex items-center justify-center"
          >
            <ShoppingBag className="w-4 h-4 text-white" />
            <span className="absolute -top-1.5 -right-2 min-w-[22px] h-5 px-1.5 rounded-full bg-emerald-400 text-emerald-950 text-[10px] font-extrabold num flex items-center justify-center shadow-sm border border-white/50">
              {totalOrders}
            </span>
          </div>
        </div>

        {/* Leading Sector Glass Pill */}
        <div className="flex-1 min-w-0 rounded-2xl bg-white/14 backdrop-blur-xl border border-white/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] px-3 py-1.5 flex items-center gap-2">
          <span className="w-7 h-7 rounded-xl bg-[#FCE36D] text-[#4A070A] inline-flex items-center justify-center shrink-0 shadow-xs">
            <Crown className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-white truncate">
              {topSectorName || 'Wandoor Division'}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.2 rounded-full bg-[#FCE36D] text-[#4A070A] text-[10px] font-extrabold num leading-tight">
                #1
              </span>
              <span className="text-[10px] text-white/85 font-medium num truncate">
                {formatQuantity(topSectorLiters)} L leading
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PublicDivisionProgressCard;
