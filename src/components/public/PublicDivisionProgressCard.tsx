import {
  Award,
  CheckCircle2,
  Crown,
  Lock,
  Navigation2,
  Plus,
  ShoppingBag,
  Trophy,
  Users,
} from 'lucide-react';
import { formatQuantity } from '../../utils/format';

interface PublicDivisionProgressCardProps {
  totalLiters: number;
  totalOrders: number;
  divisionLimit: number;
  percentComplete: number;
  ordersOpen: boolean;
  activeUnitsCount: number;
  totalUnitsCount: number;
  sectorsCount: number;
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
  ordersOpen,
  activeUnitsCount,
  totalUnitsCount,
  sectorsCount,
  topSectorName,
  topSectorLiters = 0,
  onQuickEntry,
  className = '',
}: PublicDivisionProgressCardProps) {
  const safePct = Math.min(100, Math.max(0, Number(percentComplete) || 0));
  const visualPct = safePct > 0 ? Math.max(2.5, safePct) : 0;
  const radius = 76;
  const arcLength = Math.PI * radius;
  const dashOffset = arcLength * (1 - visualPct / 100);
  const pointerAngleDeg = -90 + (safePct / 100) * 180;

  return (
    <div
      className={`rounded-3xl glass-crimson text-white p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-lg ${className}`}
    >
      {/* Top Row: Title + Quick Action / Status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-white/12 border border-white/20 inline-flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-[#FCE36D]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white truncate leading-tight">
              Division Progress
            </h2>
            <p className="text-[11px] text-white/70 num leading-tight">
              Target: {formatQuantity(divisionLimit)} L
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onQuickEntry && ordersOpen && (
            <button
              type="button"
              onClick={onQuickEntry}
              aria-label="Quick Entry"
              title="Quick Entry"
              className="w-8 h-8 rounded-full bg-white/12 hover:bg-white/20 border border-white/20 text-[#FCE36D] inline-flex items-center justify-center transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Middle Row: Big Metric + Status Pill on Left, Semi-Circle Gauge + Arrow on Right */}
      <div className="grid grid-cols-12 gap-3 items-center">
        <div className="col-span-6 space-y-1.5">
          <p className="text-xs text-white/75 font-medium">Total Payasam</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-4xl xl:text-[42px] font-extrabold tracking-tight num text-white leading-none">
              {formatQuantity(totalLiters)}
              <span className="text-lg font-bold text-[#FCE36D] ml-1">L</span>
            </p>

            {ordersOpen ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/25 border border-emerald-300/40 text-[11px] font-bold text-emerald-100 whitespace-nowrap">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Open</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/35 border border-white/25 text-[11px] font-bold text-amber-200 whitespace-nowrap">
                <Lock className="w-3 h-3 shrink-0" />
                <span>Closed</span>
              </span>
            )}
          </div>
          <p className="text-xs text-white/75 font-medium num">
            {safePct.toFixed(1)}% achieved
          </p>
        </div>

        {/* Semi-Circle Arc Gauge + Lucide Navigation2 Pointer */}
        <div className="col-span-6 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-[190px] aspect-[200/112]">
            <svg
              viewBox="0 0 200 112"
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
                  <stop offset="0%" stopColor="#FCE36D" />
                  <stop offset="60%" stopColor="#FACC15" />
                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
              </defs>

              {/* Background Track */}
              <path
                d="M 24 98 A 76 76 0 0 1 176 98"
                fill="none"
                stroke="rgba(255, 255, 255, 0.16)"
                strokeWidth="22"
                strokeLinecap="round"
              />

              {/* Progress Arc */}
              {visualPct > 0 && (
                <path
                  d="M 24 98 A 76 76 0 0 1 176 98"
                  fill="none"
                  stroke="url(#payasamGaugeGrad)"
                  strokeWidth="22"
                  strokeLinecap="round"
                  strokeDasharray={arcLength}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-700 ease-out"
                />
              )}
            </svg>

            {/* Pointer Arrow Icon from lucide-react */}
            <div className="absolute inset-x-0 bottom-2 flex flex-col items-center justify-end pointer-events-none">
              <div
                className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-md transition-transform duration-700 ease-out"
                style={{ transform: `rotate(${pointerAngleDeg}deg)` }}
              >
                <Navigation2
                  className="w-4 h-4 text-[#FCE36D] fill-[#FCE36D]"
                  strokeWidth={2}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Reference-Matched Circular Icon Badges + Summary Pill */}
      <div className="pt-2 border-t border-white/12 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          {/* Orders Circle */}
          <div
            title={`Total Orders: ${totalOrders}`}
            className="relative w-10 h-10 rounded-full bg-white/12 backdrop-blur-md border border-white/20 flex items-center justify-center"
          >
            <ShoppingBag className="w-4 h-4 text-white/90" />
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#FCE36D] text-[#4A070A] text-[10px] font-extrabold num flex items-center justify-center shadow-xs">
              {totalOrders}
            </span>
          </div>

          {/* Active Units Circle */}
          <div
            title={`Active Units: ${activeUnitsCount}/${totalUnitsCount}`}
            className="relative w-10 h-10 rounded-full bg-white/12 backdrop-blur-md border border-white/20 flex items-center justify-center"
          >
            <Users className="w-4 h-4 text-white/90" />
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-white text-[#5C0A0E] text-[10px] font-extrabold num flex items-center justify-center shadow-xs">
              {activeUnitsCount}
            </span>
          </div>

          {/* Sectors Circle */}
          <div
            title={`Sectors: ${sectorsCount}`}
            className="relative w-10 h-10 rounded-full bg-white/12 backdrop-blur-md border border-white/20 flex items-center justify-center"
          >
            <Award className="w-4 h-4 text-white/90" />
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-emerald-400 text-emerald-950 text-[10px] font-extrabold num flex items-center justify-center shadow-xs">
              {sectorsCount}
            </span>
          </div>
        </div>

        {/* Right Leading Sector Glass Pill */}
        <div className="flex-1 min-w-0 rounded-2xl bg-white/12 backdrop-blur-md border border-white/18 px-3 py-1.5 flex items-center gap-2">
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
              <span className="text-[10px] text-white/80 font-medium num truncate">
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
