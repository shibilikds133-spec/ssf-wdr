import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Droplets,
  FileSpreadsheet,
  ListChecks,
  Plus,
  Search,
  SlidersHorizontal,
  Smartphone,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { SectorDashboardResponse } from '../../types';
import {
  calcLimitSharePercent,
  calcSectorUnitSharePercent,
  formatCurrency,
  formatQuantity,
} from '../../utils/format';
import type { ReportFilterConfig } from '../../utils/reports';

interface SectorDashboardDesktopProps {
  data: SectorDashboardResponse;
  onOpenExportModal: (initialConfig?: Partial<ReportFilterConfig>) => void;
}

const PIXEL_COLUMNS = [
  ['bg-vibrant-amberSoft'],
  ['bg-vibrant-tealSoft', 'bg-vibrant-tealSoft/60'],
  ['bg-forest-900', 'bg-forest-900', 'bg-forest-900/30'],
  ['bg-forest-700', 'bg-forest-900', 'bg-forest-900', 'bg-forest-900/40'],
  ['bg-forest-900', 'bg-vibrant-teal', 'bg-forest-900', 'bg-forest-700', 'bg-forest-700/40'],
  [
    'bg-forest-900',
    'bg-forest-700',
    'bg-vibrant-teal',
    'bg-forest-900/50',
    'bg-forest-900/25',
    'bg-forest-900/10',
  ],
] as const;

const UNIT_BAR_COLORS = [
  'bg-vibrant-amber',
  'bg-vibrant-teal',
  'bg-forest-700',
  'bg-forest-900',
] as const;

export function SectorDashboardDesktop({
  data,
  onOpenExportModal,
}: SectorDashboardDesktopProps) {
  const navigate = useNavigate();
  const { sector, settings, summary, units, entries } = data;

  const [chartMode, setChartMode] = useState<'liters' | 'orders'>('liters');
  const [recentSearch, setRecentSearch] = useState('');

  const totalAmount = Number(summary.total_amount) || 0;
  const totalQuantity = Number(summary.total_quantity) || 0;
  const cashAmount = Number(summary.cash_amount) || 0;
  const upiAmount = Number(summary.upi_amount) || 0;
  const unpaidAmount = Number(summary.unpaid_amount) || 0;
  const unpaidEntries = Number(summary.unpaid_entries) || 0;
  const paidTotal = cashAmount + upiAmount;
  const totalEntries = Number(summary.total_entries) || 0;
  const totalUnits = Number(summary.total_units) || 0;
  const divisionLimit = Math.max(0, Number(settings.division_target) || 0);

  const activeUnitsCount = useMemo(
    () => units.filter((u) => Number(u.total_entries) > 0).length,
    [units]
  );
  const zeroUnitsCount = Math.max(0, totalUnits - activeUnitsCount);

  // Sector Participation Rate (%)
  const participationPercent =
    totalUnits > 0 ? (activeUnitsCount / totalUnits) * 100 : 0;
  const cappedParticipationPercent = Math.min(100, Math.max(0, participationPercent));

  // Division Limit Share (%)
  const divisionSharePercent = calcLimitSharePercent(totalQuantity, divisionLimit);

  const upiPercent =
    totalAmount > 0 ? Math.round((upiAmount / totalAmount) * 100) : 0;

  // Units sorted for ranking
  const rankedUnitsByQty = useMemo(() => {
    return [...units].sort((a, b) => {
      const qA = Number(a.total_quantity) || 0;
      const qB = Number(b.total_quantity) || 0;
      return qB !== qA ? qB - qA : a.name.localeCompare(b.name);
    });
  }, [units]);

  const rankedUnitsByOrders = useMemo(() => {
    return [...units].sort((a, b) => {
      const eA = Number(a.total_entries) || 0;
      const eB = Number(b.total_entries) || 0;
      return eB !== eA ? eB - eA : a.name.localeCompare(b.name);
    });
  }, [units]);

  // Chart items for Top Performance horizontal bars
  const chartItems = useMemo(() => {
    if (chartMode === 'orders') {
      return rankedUnitsByOrders.slice(0, 6).map((u) => ({
        key: `unit-${u.id}`,
        name: u.name,
        quantity: Number(u.total_quantity) || 0,
        orders: Number(u.total_entries) || 0,
        amount: Number(u.total_amount) || 0,
      }));
    }
    return rankedUnitsByQty.slice(0, 6).map((u) => ({
      key: `unit-${u.id}`,
      name: u.name,
      quantity: Number(u.total_quantity) || 0,
      orders: Number(u.total_entries) || 0,
      amount: Number(u.total_amount) || 0,
    }));
  }, [chartMode, rankedUnitsByQty, rankedUnitsByOrders]);

  const maxChartValue = useMemo(() => {
    if (chartMode === 'orders') {
      return Math.max(...chartItems.map((i) => i.orders), 1);
    }
    return Math.max(...chartItems.map((i) => i.quantity), 1);
  }, [chartMode, chartItems]);

  // Top 4 units for left column progress list
  const top4Units = useMemo(() => rankedUnitsByQty.slice(0, 4), [rankedUnitsByQty]);

  // Filtered recent entries
  const filteredRecentEntries = useMemo(() => {
    const q = recentSearch.trim().toLowerCase();
    const matched = q
      ? entries.filter((e) =>
          `${e.contributor_name} ${e.unit_name ?? ''}`.toLowerCase().includes(q)
        )
      : entries;
    return matched.slice(0, 5);
  }, [entries, recentSearch]);

  // SVG Semi-Circular Arc Gauge calculations (Participation Rate)
  const radius = 74;
  const arcLength = Math.PI * radius;
  const progressRatio = cappedParticipationPercent / 100;
  const dashOffset = arcLength * (1 - progressRatio);
  const theta = Math.PI * (1 - progressRatio);
  const knobX = 100 + radius * Math.cos(theta);
  const knobY = 100 - radius * Math.sin(theta);

  return (
    <div>
      {/* ROW 1: 12-Column Top Bento Row */}
      <div className="grid grid-cols-12 gap-5 mb-5">
        {/* Card 1: Total Orders Value (6 cols) */}
        <div className="col-span-6 glass-leaf-card rounded-[22px] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="glass-leaf-pill w-8 h-8 rounded-lg flex items-center justify-center text-forest-900">
                <Wallet className="w-4 h-4" />
              </span>
              <span className="text-sm font-bold text-forest-950">
                Total Orders Value
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="glass-leaf-pill px-3 py-1 rounded-full text-xs font-semibold text-forest-900 num border border-leaf-border shadow-2xs">
                ₹{formatQuantity(Number(settings.unit_rate) || 0)} / L
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border shadow-2xs ${
                  settings.is_challenge_open
                    ? 'bg-teal-50 text-teal-700 border-teal-200/80'
                    : 'bg-rose-50 text-rose-700 border-rose-200/80'
                }`}
              >
                {settings.is_challenge_open ? 'Orders Open' : 'Orders Closed'}
              </span>
            </div>
          </div>

          <div className="flex items-end justify-between gap-4 my-4">
            <div className="min-w-0">
              <div className="text-4xl font-extrabold text-forest-950 tracking-tight num">
                {formatCurrency(totalAmount)}
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-forest-700 num">
                <CheckCircle2 className="w-3.5 h-3.5 text-vibrant-teal shrink-0" />
                <span>
                  {totalEntries} orders across {activeUnitsCount}/{totalUnits} active units
                </span>
              </div>
            </div>

            {/* Ascending Pixel-Block Step Graphic (Forest Theme) */}
            <div aria-hidden="true" className="flex items-end gap-1.5 shrink-0 pb-1">
              {PIXEL_COLUMNS.map((col, colIdx) => (
                <div key={colIdx} className="flex flex-col-reverse gap-1">
                  {col.map((colorClass, tileIdx) => (
                    <span
                      key={tileIdx}
                      className={`w-3.5 h-3.5 rounded-[4px] shadow-2xs ${colorClass}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => navigate('/sector/manage')}
              className="glass-forest text-white rounded-full px-4 py-2 text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Manage Units
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenExportModal({
                  scope: 'ENTIRE_SECTOR',
                  template: 'UNIT_SUMMARY',
                })
              }
              className="bg-forest-900 text-white hover:bg-forest-800 rounded-full px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report
            </button>
            <button
              type="button"
              onClick={() => navigate('/sector/entries')}
              className="glass-leaf-card hover:bg-white text-forest-900 border border-leaf-border rounded-full px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
            >
              <ListChecks className="w-3.5 h-3.5" />
              All Orders
            </button>
          </div>
        </div>

        {/* Card 2: Payment Split (3 cols) */}
        <div className="col-span-3 glass-leaf-card rounded-[22px] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-vibrant-teal text-white flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </span>
              <span className="text-sm font-bold text-forest-950">
                Payment Split
              </span>
            </div>
            <span className="glass-leaf-pill px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-vibrant-teal bg-vibrant-tealSoft">
              Live
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-forest-950 num">
                {formatCurrency(paidTotal)}
              </span>
              <span className="bg-vibrant-tealSoft text-vibrant-teal text-[11px] font-semibold px-2 py-0.5 rounded-full num">
                {upiPercent}% UPI
              </span>
            </div>
            <div className="glass-leaf-pill rounded-xl px-3 py-1.5 text-xs text-forest-700 mt-2.5 num">
              {unpaidEntries > 0
                ? `${unpaidEntries} Unpaid (${formatCurrency(unpaidAmount)})`
                : 'Cash + UPI verified collections'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="border-l-2 border-vibrant-amberMid pl-2">
              <span className="text-[10px] text-forest-600 block">Cash</span>
              <span className="text-xs font-bold text-forest-950 num">
                {formatCurrency(cashAmount)}
              </span>
            </div>
            <div className="border-l-2 border-vibrant-teal pl-2">
              <span className="text-[10px] text-forest-600 block">UPI</span>
              <span className="text-xs font-bold text-forest-950 num">
                {formatCurrency(upiAmount)}
              </span>
            </div>
            <div className="border-l-2 border-vibrant-coral pl-2">
              <span className="text-[10px] text-forest-600 block">Unpaid</span>
              <span className="text-xs font-bold text-vibrant-coral num">
                {formatCurrency(unpaidAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Sector Liters & Division Contribution (3 cols) */}
        <div className="col-span-3 glass-leaf-card rounded-[22px] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-9 h-9 rounded-full bg-vibrant-amber text-white flex items-center justify-center shrink-0">
                <Droplets className="w-4 h-4" />
              </span>
              <span className="text-sm font-bold text-forest-950 leading-tight">
                Sector Volume
              </span>
            </div>
            <span className="bg-vibrant-amberSoft text-vibrant-amber px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 num">
              {totalEntries} orders
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-forest-950 num">
                {formatQuantity(totalQuantity)} L
              </span>
              {divisionLimit > 0 && (
                <span className="bg-forest-100 text-forest-900 text-[11px] font-semibold px-2 py-0.5 rounded-full num">
                  {divisionSharePercent.toFixed(1)}% of division
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-forest-700 num">
              <span>Active: {activeUnitsCount} units</span>
              <span>Inactive: {zeroUnitsCount} units</span>
            </div>
            <div className="h-2 rounded-full bg-leaf-100 overflow-hidden flex my-1.5 border border-leaf-border">
              <div
                className="h-full bg-forest-800 transition-all duration-300"
                style={{ width: `${cappedParticipationPercent}%` }}
              />
              <div className="h-full bg-leaf-border/50 flex-1" />
            </div>
            <div className="flex items-center justify-between text-[11px] text-forest-600 pt-0.5 num">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-forest-800" />
                Participating ({cappedParticipationPercent.toFixed(0)}%)
              </span>
              <span>Total {totalUnits} Units</span>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: 12-Column Main Bento Body */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left Column: Sector Participation Gauge + Top 4 Units Share (4 cols) */}
        <div className="col-span-4 glass-leaf-card rounded-[22px] p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-forest-950">
              Sector Participation
            </h2>
            <Link
              to="/sector/manage"
              title="Manage sector units"
              aria-label="Manage sector units"
              className="w-8 h-8 rounded-full glass-leaf-pill flex items-center justify-center text-forest-900 hover:bg-white transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Inner Dark Forest Participation Card with Semi-Circular SVG Gauge */}
          <div className="glass-forest rounded-[18px] p-5 text-white relative shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-leaf-200/90 font-medium num">
                {cappedParticipationPercent.toFixed(1)}% Active Units
              </span>
              <Link
                to="/sector/units"
                aria-label="View all sector units"
                className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-white" />
              </Link>
            </div>

            <div className="relative flex flex-col items-center pt-1 pb-2">
              <svg
                viewBox="0 0 200 115"
                className="w-full max-w-[230px] overflow-visible"
                aria-hidden="true"
              >
                <path
                  d="M 26 100 A 74 74 0 0 1 174 100"
                  fill="none"
                  stroke="rgba(224, 255, 194, 0.16)"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                <path
                  d="M 26 100 A 74 74 0 0 1 174 100"
                  fill="none"
                  stroke="#14B8A6"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={arcLength}
                  strokeDashoffset={dashOffset}
                />
                <circle
                  cx={knobX}
                  cy={knobY}
                  r="6"
                  fill="#FFFFFF"
                  stroke="#14B8A6"
                  strokeWidth="3"
                />
              </svg>

              <div className="-mt-12 text-center">
                <span className="text-[11px] uppercase tracking-wider text-leaf-200/70 block">
                  Sector Order Volume
                </span>
                <span className="text-2xl font-extrabold num text-white block leading-tight">
                  {formatQuantity(totalQuantity)} L
                </span>
                <span className="text-xs text-leaf-200/90 num">
                  {totalEntries} Orders • {activeUnitsCount}/{totalUnits} Units Active
                </span>
              </div>
            </div>

            <Link
              to="/sector/manage"
              title="Add Unit"
              aria-label="Add new unit"
              className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-leaf-200 text-forest-950 flex items-center justify-center hover:scale-105 transition-transform shadow"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </Link>
          </div>

          {/* Top 4 Leading Units — Share of Sector Volume */}
          <div className="space-y-2.5 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-forest-700 uppercase tracking-wide">
                Top 4 Leading Units
              </span>
              <span className="text-[11px] text-forest-600 num">
                Share of Sector
              </span>
            </div>

            {top4Units.length === 0 ? (
              <div className="bg-leaf-50 border border-leaf-border rounded-xl px-3.5 py-4 text-xs text-forest-700 text-center">
                No units configured yet.
              </div>
            ) : (
              top4Units.map((item, idx) => {
                const qty = Number(item.total_quantity) || 0;
                const share = calcSectorUnitSharePercent(qty, totalQuantity);
                const barColor = UNIT_BAR_COLORS[idx % UNIT_BAR_COLORS.length];
                return (
                  <div
                    key={item.id}
                    className="bg-leaf-50 border border-leaf-border rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-forest-950 truncate block">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-forest-600 num">
                        {formatQuantity(qty)} L · {item.total_entries} orders
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-xs font-semibold text-forest-900 num">
                        {share.toFixed(1)}%
                      </span>
                      <div className="h-1.5 w-16 rounded-full bg-leaf-100 overflow-hidden border border-leaf-border/60">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${Math.min(100, share)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Area (8 cols) */}
        <div className="col-span-8 flex flex-col gap-5">
          {/* Upper Split */}
          <div className="grid grid-cols-12 gap-5">
            {/* Center Card: Top Performance Horizontal Funnel Bar Chart (8 cols) */}
            <div className="col-span-8 glass-leaf-card rounded-[22px] p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg glass-forest flex items-center justify-center text-white shrink-0 shadow-xs">
                    <TrendingUp className="w-4 h-4 text-leaf-200" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-forest-950 leading-tight">
                      Top Performance
                    </h2>
                    <p className="text-[11px] text-forest-600 mt-0.5">
                      Units ranked by order volume in {sector.name}
                    </p>
                  </div>
                </div>

                {/* Toggle: By Liters | By Orders */}
                <div className="glass-leaf-pill p-0.5 rounded-full inline-flex text-xs">
                  <button
                    type="button"
                    onClick={() => setChartMode('liters')}
                    className={`px-3 py-1 rounded-full font-semibold transition-colors ${
                      chartMode === 'liters'
                        ? 'glass-forest text-white shadow-xs'
                        : 'text-forest-700 hover:text-forest-950'
                    }`}
                  >
                    By Liters
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('orders')}
                    className={`px-3 py-1 rounded-full font-semibold transition-colors ${
                      chartMode === 'orders'
                        ? 'glass-forest text-white shadow-xs'
                        : 'text-forest-700 hover:text-forest-950'
                    }`}
                  >
                    By Orders
                  </button>
                </div>
              </div>

              {chartItems.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-forest-700">
                  No unit data available to rank.
                </div>
              ) : (
                <div className="space-y-2.5 my-auto py-1">
                  {chartItems.map((item, idx) => {
                    const value =
                      chartMode === 'orders' ? item.orders : item.quantity;
                    const pct =
                      maxChartValue > 0 && value > 0
                        ? Math.max(18, Math.round((value / maxChartValue) * 100))
                        : 0;
                    const share = calcSectorUnitSharePercent(
                      item.quantity,
                      totalQuantity
                    ).toFixed(1);

                    const barColor =
                      idx === 0
                        ? 'bg-forest-900 text-white'
                        : idx === 1
                        ? 'bg-forest-800 text-white'
                        : idx === 2
                        ? 'bg-forest-700 text-white'
                        : idx === 3
                        ? 'bg-forest-600 text-white'
                        : 'bg-forest-500 text-white';

                    return (
                      <div
                        key={item.key}
                        title={`${item.name} | Ordered: ${formatQuantity(item.quantity)} L | Orders: ${item.orders} | Share of Sector: ${share}% | Amount: ${formatCurrency(item.amount)}`}
                        className="flex items-center gap-3 group"
                      >
                        {/* 1. Name label */}
                        <div className="w-20 sm:w-24 shrink-0 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-forest-700 bg-leaf-100 shrink-0 num">
                            {idx + 1}
                          </span>
                          <span
                            title={item.name}
                            className="text-xs font-semibold text-forest-950 truncate"
                          >
                            {item.name}
                          </span>
                        </div>

                        {/* 2. Horizontal progress track & elongated rounded bar */}
                        <div className="flex-1 bg-leaf-100/90 rounded-xl h-8 relative flex items-center p-1 overflow-hidden border border-leaf-border/60">
                          <div
                            className={`h-full rounded-lg transition-all duration-300 flex items-center justify-end px-3 shadow-2xs ${barColor}`}
                            style={{
                              width: pct > 0 ? `${pct}%` : '24%',
                              minWidth: '60px',
                            }}
                          >
                            <span className="text-xs font-bold num drop-shadow-xs whitespace-nowrap">
                              {chartMode === 'orders'
                                ? `${item.orders} Orders`
                                : `${formatQuantity(item.quantity)} L`}
                            </span>
                          </div>
                        </div>

                        {/* 3. Share % & Total Revenue */}
                        <div className="w-14 text-right shrink-0">
                          <span className="text-xs font-bold text-forest-950 num block">
                            {share}%
                          </span>
                          <span className="text-[10px] text-forest-600 num block truncate">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer summary */}
              <div className="pt-2 border-t border-leaf-border/60 flex items-center justify-between text-xs">
                <span className="text-forest-600">
                  Showing top {Math.min(6, chartItems.length)} units in {sector.name}
                </span>
                <Link
                  to="/sector/units"
                  className="font-semibold text-forest-900 hover:underline inline-flex items-center gap-1"
                >
                  View All Units
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Right Mini-Bento Stack (4 cols) */}
            <div className="col-span-4 flex flex-col gap-4">
              {/* Top Banner Card */}
              <div className="glass-leaf-card rounded-[20px] p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="bg-vibrant-amberSoft text-vibrant-amber text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block mb-1 num">
                    Rate ₹{formatQuantity(Number(settings.unit_rate) || 0)}/L
                  </span>
                  <div className="text-sm font-bold text-forest-950 truncate">
                    Sector Controls
                  </div>
                  <div className="text-xs text-forest-600">
                    Manage units & directory
                  </div>
                </div>
                <Link
                  to="/sector/manage"
                  className="glass-forest text-white text-xs font-semibold px-3.5 py-1.5 rounded-full hover:opacity-95 transition-opacity shrink-0"
                >
                  Manage
                </Link>
              </div>

              {/* Bottom 2 Mini Cards */}
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div className="glass-leaf-card rounded-[20px] p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-medium text-forest-600 block">
                      Total Orders
                    </span>
                    <span className="text-2xl font-extrabold text-forest-950 num mt-1 block">
                      {totalEntries}
                    </span>
                    <span className="bg-vibrant-coralSoft text-vibrant-coral text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block mt-1.5 num">
                      {zeroUnitsCount} at 0 L
                    </span>
                  </div>
                  <Link
                    to="/sector/units"
                    aria-label="View units summary"
                    className="w-8 h-8 rounded-full bg-forest-900 text-white hover:bg-forest-800 flex items-center justify-center ml-auto transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="glass-leaf-card rounded-[20px] p-4 flex flex-col justify-between">
                  <div>
                    <span className="glass-leaf-pill w-8 h-8 rounded-lg flex items-center justify-center text-forest-900 mb-2">
                      <FileSpreadsheet className="w-4 h-4" />
                    </span>
                    <div className="text-xs font-bold text-forest-950">
                      Quick Reports
                    </div>
                    <div className="text-[11px] text-forest-600">PDF &amp; CSV</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenExportModal({
                        scope: 'ENTIRE_SECTOR',
                        template: 'DETAILED_ORDERS',
                      })
                    }
                    className="glass-leaf-pill hover:bg-white text-forest-900 text-xs font-semibold px-3 py-1.5 rounded-full inline-flex items-center justify-center gap-1.5 transition-colors w-full mt-2"
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Wide Card: Recent Orders */}
          <div className="glass-leaf-card rounded-[22px] p-5">
            <div className="flex items-center justify-between gap-3 mb-3.5">
              <h2 className="text-base font-bold text-forest-950">
                Recent Sector Orders
              </h2>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-forest-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={recentSearch}
                    onChange={(e) => setRecentSearch(e.target.value)}
                    placeholder="Search contributor / unit..."
                    aria-label="Search recent sector orders"
                    className="pl-8 pr-3 py-1.5 text-xs rounded-full border border-leaf-border bg-white/90 text-forest-950 placeholder:text-forest-400 w-48"
                  />
                </div>
                <Link
                  to="/sector/entries"
                  className="text-xs font-semibold text-forest-900 hover:underline inline-flex items-center gap-1 shrink-0"
                >
                  View All
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-forest-600 border-b border-leaf-border">
                    <th className="py-2.5 pr-4 font-semibold">Ordered By</th>
                    <th className="py-2.5 px-4 font-semibold">Unit</th>
                    <th className="py-2.5 px-4 font-semibold text-right">
                      Qty (L)
                    </th>
                    <th className="py-2.5 px-4 font-semibold text-right">
                      Amount
                    </th>
                    <th className="py-2.5 pl-4 font-semibold text-right">
                      Mode
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-leaf-border/60">
                  {filteredRecentEntries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-xs text-forest-600"
                      >
                        No recent sector orders found.
                      </td>
                    </tr>
                  ) : (
                    filteredRecentEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="hover:bg-leaf-100/50 transition-colors"
                      >
                        <td className="py-2.5 pr-4 font-medium text-forest-950 whitespace-nowrap">
                          {entry.contributor_name}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-forest-600 whitespace-nowrap">
                          {entry.unit_name ?? '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-forest-950 num whitespace-nowrap">
                          {formatQuantity(Number(entry.quantity) || 0)} L
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-forest-950 num whitespace-nowrap">
                          {formatCurrency(Number(entry.total_amount) || 0)}
                        </td>
                        <td className="py-2.5 pl-4 text-right whitespace-nowrap">
                          {entry.payment_status === 'UNPAID' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-vibrant-coralSoft text-vibrant-coral">
                              Unpaid
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                entry.payment_mode === 'UPI'
                                  ? 'bg-vibrant-tealSoft text-vibrant-teal'
                                  : 'bg-vibrant-amberSoft text-vibrant-amber'
                              }`}
                            >
                              {entry.payment_mode}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
