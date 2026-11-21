import type { AdminSummary, AppSettings } from '../../types';
import { formatCurrency, formatQuantity } from '../../utils/format';
import { Smartphone, Users } from 'lucide-react';

interface AdminOverviewCardsProps {
  summary: AdminSummary;
  settings: AppSettings;
  activeUnitsCount: number;
}

export function AdminOverviewCards({
  summary,
  settings,
  activeUnitsCount,
}: AdminOverviewCardsProps) {
  const totalQuantity = Number(summary.total_quantity) || 0;
  const targetQuantity = Number(settings.division_target) || 0;
  const rawPercent =
    targetQuantity > 0 ? (totalQuantity / targetQuantity) * 100 : 0;
  const barPercent = Math.min(100, Math.max(0, rawPercent));

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Card 1: Plum Hero Card */}
      <div className="glass-plum rounded-2xl p-3.5 sm:p-5 text-white relative overflow-hidden transition-all duration-200 aspect-square sm:aspect-auto flex flex-col justify-between">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-wider text-milk-200/80 font-medium">
            Total Collection
          </p>
          <div className="mt-1.5 sm:mt-2 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2 flex-wrap">
            <span className="text-xl sm:text-2xl font-bold num text-white leading-tight">
              {formatQuantity(totalQuantity)} L
            </span>
            <span className="text-xl sm:text-2xl font-bold num text-milk-200 leading-tight">
              {formatCurrency(Number(summary.total_amount) || 0)}
            </span>
          </div>
        </div>

        <div>
          <div className="bg-milk-200/15 border border-milk-200/15 h-1.5 sm:h-2 rounded-full overflow-hidden mt-2 sm:mt-3.5">
            <div
              className="h-full bg-milk-200 rounded-full transition-all duration-300"
              style={{ width: `${barPercent}%` }}
            />
          </div>
          <p className="text-[11px] sm:text-xs text-milk-200/75 mt-1.5 sm:mt-2 num leading-snug">
            {rawPercent.toFixed(1)}% of {formatQuantity(targetQuantity)} L target
          </p>
        </div>
      </div>

      {/* Card 2: Cash in Hand */}
      <div className="glass-card rounded-2xl p-3.5 sm:p-5 transition-all duration-200 hover:bg-white/90 hover:shadow-md aspect-square sm:aspect-auto flex flex-col justify-between relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] sm:text-xs font-medium text-ink-600 leading-tight">
            Cash in Hand
          </p>
          <div className="glass-pill w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-plum-900 shrink-0">
            <span className="text-xs font-bold font-serif">₹</span>
          </div>
        </div>
        <p className="text-xl sm:text-2xl font-bold num text-plum-900 leading-tight break-words">
          {formatCurrency(Number(summary.cash_amount) || 0)}
        </p>
        <p className="text-[11px] sm:text-xs text-ink-600 leading-snug">
          Physical cash collected
        </p>
      </div>

      {/* Card 3: Bank / UPI */}
      <div className="glass-card rounded-2xl p-3.5 sm:p-5 transition-all duration-200 hover:bg-white/90 hover:shadow-md aspect-square sm:aspect-auto flex flex-col justify-between relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] sm:text-xs font-medium text-ink-600 leading-tight">
            Bank / UPI
          </p>
          <div className="glass-pill w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-plum-900 shrink-0">
            <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <p className="text-xl sm:text-2xl font-bold num text-plum-900 leading-tight break-words">
          {formatCurrency(Number(summary.upi_amount) || 0)}
        </p>
        <p className="text-[11px] sm:text-xs text-ink-600 leading-snug">
          Digital UPI collections
        </p>
      </div>

      {/* Card 4: Entries & Active Units */}
      <div className="glass-card rounded-2xl p-3.5 sm:p-5 transition-all duration-200 hover:bg-white/90 hover:shadow-md aspect-square sm:aspect-auto flex flex-col justify-between relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] sm:text-xs font-medium text-ink-600 leading-tight">
            Entries &amp; Participation
          </p>
          <div className="glass-pill w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-plum-900 shrink-0">
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <p className="text-xl sm:text-2xl font-bold num text-plum-900 leading-tight break-words">
          {summary.total_entries} Entries
        </p>
        <p className="text-[11px] sm:text-xs text-ink-600 leading-snug num">
          {activeUnitsCount} of {summary.total_units} units active
        </p>
      </div>
    </div>
  );
}
