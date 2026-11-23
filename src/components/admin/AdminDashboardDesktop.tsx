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
import type { AdminDashboardResponse } from '../../types';
import {
  calcLimitSharePercent,
  formatCurrency,
  formatQuantity,
} from '../../utils/format';
import type { ReportFilterConfig } from '../../utils/reports';
import { InlinePaymentUpdater } from '../InlinePaymentUpdater';

interface AdminDashboardDesktopProps {
  data: AdminDashboardResponse;
  adminCode: string;
  onOpenAddOrder: () => void;
  onOpenExportModal: (initialConfig?: Partial<ReportFilterConfig>) => void;
  onMutated: (msg: string) => Promise<void>;
  onError?: (msg: string) => void;
}

const PIXEL_COLUMNS = [
  ['bg-vibrant-amberSoft'],
  ['bg-vibrant-tealSoft', 'bg-vibrant-tealSoft/60'],
  ['bg-plum-900', 'bg-plum-900', 'bg-plum-900/30'],
  ['bg-vibrant-amberMid', 'bg-plum-900', 'bg-plum-900', 'bg-plum-900/40'],
  ['bg-plum-900', 'bg-vibrant-teal', 'bg-plum-900', 'bg-vibrant-amberMid', 'bg-vibrant-amberMid/40'],
  [
    'bg-plum-900',
    'bg-vibrant-amberMid',
    'bg-vibrant-teal',
    'bg-plum-900/50',
    'bg-plum-900/25',
    'bg-plum-900/10',
  ],
] as const;

const SECTOR_BAR_COLORS = [
  'bg-vibrant-amber',
  'bg-vibrant-teal',
  'bg-vibrant-berry',
  'bg-plum-900',
] as const;

export function AdminDashboardDesktop({
  data,
  adminCode,
  onOpenAddOrder,
  onOpenExportModal,
  onMutated,
  onError,
}: AdminDashboardDesktopProps) {
  const navigate = useNavigate();
  const { settings, summary, sectors, unit_summaries, entries } = data;

  const [chartMode, setChartMode] = useState<'sectors' | 'units'>('units');
  const [leftListMode, setLeftListMode] = useState<'units' | 'sectors'>('units');
  const [recentSearch, setRecentSearch] = useState('');

  const totalAmount = Number(summary.total_amount) || 0;
  const totalQuantity = Number(summary.total_quantity) || 0;
  const cashAmount = Number(summary.cash_amount) || 0;
  const upiAmount = Number(summary.upi_amount) || 0;
  const unpaidAmount = Number(summary.unpaid_amount) || 0;
  const unpaidEntries = Number(summary.unpaid_entries) || 0;
  const paidTotal = cashAmount + upiAmount;
  const divisionLimit = Math.max(0, Number(settings.division_target) || 0);

  const activeUnitsCount = useMemo(
    () => unit_summaries.filter((u) => u.total_entries > 0).length,
    [unit_summaries]
  );
  const zeroUnitsCount = Math.max(0, summary.total_units - activeUnitsCount);

  const upiPercent =
    totalAmount > 0 ? Math.round((upiAmount / totalAmount) * 100) : 0;
  const limitPercent = calcLimitSharePercent(totalQuantity, divisionLimit);
  const cappedLimitPercent = Math.min(100, Math.max(0, limitPercent));
  const isAboveLimit = divisionLimit > 0 && totalQuantity > divisionLimit;
  const remainingLiters = Math.max(0, divisionLimit - totalQuantity);
  const excessLiters = Math.max(0, totalQuantity - divisionLimit);

  // Aggregate sector totals across all configured sectors
  const sectorStats = useMemo(() => {
    const map = new Map<
      number,
      { id: number; name: string; quantity: number; amount: number }
    >();
    for (const s of sectors) {
      map.set(s.id, { id: s.id, name: s.name, quantity: 0, amount: 0 });
    }
    for (const u of unit_summaries) {
      if (typeof u.sector_id === 'number') {
        const existing = map.get(u.sector_id) ?? {
          id: u.sector_id,
          name: u.sector_name ?? `Sector ${u.sector_id}`,
          quantity: 0,
          amount: 0,
        };
        existing.quantity += Number(u.total_quantity) || 0;
        existing.amount += Number(u.total_amount) || 0;
        map.set(u.sector_id, existing);
      }
    }
    return [...map.values()].sort((a, b) =>
      b.quantity !== a.quantity
        ? b.quantity - a.quantity
        : a.name.localeCompare(b.name)
    );
  }, [sectors, unit_summaries]);

  const topUnits = useMemo(() => {
    return [...unit_summaries]
      .sort((a, b) => {
        const qA = Number(a.total_quantity) || 0;
        const qB = Number(b.total_quantity) || 0;
        return qB !== qA ? qB - qA : a.name.localeCompare(b.name);
      })
      .slice(0, 6);
  }, [unit_summaries]);

  const chartItems = useMemo(() => {
    if (chartMode === 'sectors') {
      return sectorStats.slice(0, 6).map((s) => ({
        key: `sec-${s.id}`,
        name: s.name,
        quantity: s.quantity,
        amount: s.amount,
      }));
    }
    return topUnits.map((u) => ({
      key: `unit-${u.id}`,
      name: u.name,
      quantity: Number(u.total_quantity) || 0,
      amount: Number(u.total_amount) || 0,
    }));
  }, [chartMode, sectorStats, topUnits]);

  const leftListItems = useMemo(() => {
    if (leftListMode === 'sectors') {
      return sectorStats.slice(0, 4).map((s) => ({
        key: `lsec-${s.id}`,
        name: s.name,
        quantity: s.quantity,
      }));
    }
    return topUnits.slice(0, 4).map((u) => ({
      key: `lunit-${u.id}`,
      name: u.name,
      quantity: Number(u.total_quantity) || 0,
    }));
  }, [leftListMode, sectorStats, topUnits]);

  const filteredRecentEntries = useMemo(() => {
    const q = recentSearch.trim().toLowerCase();
    const matched = q
      ? entries.filter((e) =>
          `${e.contributor_name} ${e.unit_name ?? ''} ${e.sector_name ?? ''}`
            .toLowerCase()
            .includes(q)
        )
      : entries;
    return matched.slice(0, 5);
  }, [entries, recentSearch]);

  // SVG Semi-Circular Arc Gauge calculations (viewBox 0 0 200 115)
  const radius = 74;
  const arcLength = Math.PI * radius;
  const progressRatio = cappedLimitPercent / 100;
  const dashOffset = arcLength * (1 - progressRatio);
  const theta = Math.PI * (1 - progressRatio);
  const knobX = 100 + radius * Math.cos(theta);
  const knobY = 100 - radius * Math.sin(theta);

  return (
    <div>
      {/* ROW 1: 12-Column Top Bento Row */}
      <div className="grid grid-cols-12 gap-5 mb-5">
        {/* Card 1: Total Orders Value (6 cols) */}
        <div className="col-span-6 glass-card rounded-[22px] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="glass-pill w-8 h-8 rounded-lg flex items-center justify-center text-plum-900">
                <Wallet className="w-4 h-4" />
              </span>
              <span className="text-sm font-semibold text-plum-900">
                Total Orders Value
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="glass-pill px-3 py-1 rounded-full text-xs font-semibold text-plum-900 num border border-milk-border/70 shadow-2xs">
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
              <div className="text-4xl font-extrabold text-plum-900 tracking-tight num">
                {formatCurrency(totalAmount)}
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-600 num">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>
                  {summary.total_entries} orders across {activeUnitsCount}/
                  {summary.total_units} active units
                </span>
              </div>
            </div>

            {/* Decorative Ascending Pixel-Block Step Graphic */}
            <div
              aria-hidden="true"
              className="flex items-end gap-1.5 shrink-0 pb-1"
            >
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
              onClick={onOpenAddOrder}
              className="glass-plum text-white rounded-full px-4 py-2 text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Order
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenExportModal({
                  scope: 'ENTIRE_DIVISION',
                  template: 'UNIT_SUMMARY',
                })
              }
              className="bg-ink-900 text-white hover:bg-plum-900 rounded-full px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/entries')}
              className="glass-card hover:bg-white text-plum-900 border border-milk-border rounded-full px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
            >
              <ListChecks className="w-3.5 h-3.5" />
              All Entries
            </button>
          </div>
        </div>

        {/* Card 2: Payment Split (3 cols) */}
        <div className="col-span-3 glass-card rounded-[22px] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-vibrant-teal text-white flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </span>
              <span className="text-sm font-semibold text-plum-900">
                Payment Split
              </span>
            </div>
            <span className="glass-pill px-2.5 py-0.5 rounded-full text-[11px] font-medium text-ink-600">
              Live
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-plum-900 num">
                {formatCurrency(paidTotal)}
              </span>
              <span className="bg-vibrant-tealSoft text-vibrant-teal text-[11px] font-semibold px-2 py-0.5 rounded-full num">
                {upiPercent}% UPI
              </span>
            </div>
            <div className="glass-pill rounded-xl px-3 py-1.5 text-xs text-ink-600 mt-2.5 num">
              {unpaidEntries > 0
                ? `${unpaidEntries} Unpaid (${formatCurrency(unpaidAmount)})`
                : 'Cash + UPI verified collections'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="border-l-2 border-vibrant-amberMid pl-2">
              <span className="text-[10px] text-ink-600 block">Cash</span>
              <span className="text-xs font-bold text-plum-900 num">
                {formatCurrency(cashAmount)}
              </span>
            </div>
            <div className="border-l-2 border-vibrant-teal pl-2">
              <span className="text-[10px] text-ink-600 block">UPI</span>
              <span className="text-xs font-bold text-plum-900 num">
                {formatCurrency(upiAmount)}
              </span>
            </div>
            <div className="border-l-2 border-vibrant-coral pl-2">
              <span className="text-[10px] text-ink-600 block">Unpaid</span>
              <span className="text-xs font-bold text-vibrant-coral num">
                {formatCurrency(unpaidAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Total Liters Ordered (3 cols) */}
        <div className="col-span-3 glass-card rounded-[22px] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-9 h-9 rounded-full bg-vibrant-amber text-white flex items-center justify-center shrink-0">
                <Droplets className="w-4 h-4" />
              </span>
              <span className="text-sm font-semibold text-plum-900 leading-tight">
                Total Liters Ordered
              </span>
            </div>
            <span className="glass-pill px-2.5 py-0.5 rounded-full text-[11px] font-medium text-ink-600 shrink-0">
              Limit
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-plum-900 num">
                {formatQuantity(totalQuantity)} L
              </span>
              <span className="bg-vibrant-amberSoft text-vibrant-amber text-[11px] font-semibold px-2 py-0.5 rounded-full num">
                {limitPercent.toFixed(1)}% of limit
              </span>
            </div>
          </div>

          <div>
            {isAboveLimit ? (
              <>
                <div className="flex items-center justify-between text-[11px] font-medium text-ink-600 num">
                  <span>100%</span>
                  <span className="bg-vibrant-amber text-white font-semibold px-2 py-0.5 rounded-full">
                    +{formatQuantity(excessLiters)} L above limit
                  </span>
                </div>
                <div className="h-2 rounded-full bg-milk-100 overflow-hidden flex my-1.5">
                  <div className="h-full w-full bg-vibrant-amber" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-ink-600 pt-0.5 num">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-vibrant-amber" />
                    Ordered
                  </span>
                  <span>Limit {formatQuantity(divisionLimit)} L</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px] font-medium text-ink-600 num">
                  <span>{cappedLimitPercent.toFixed(0)}%</span>
                  <span>{formatQuantity(remainingLiters)} L left</span>
                </div>
                <div className="h-2 rounded-full bg-milk-100 overflow-hidden flex my-1.5">
                  <div
                    className="h-full bg-vibrant-amber transition-all duration-300"
                    style={{ width: `${cappedLimitPercent}%` }}
                  />
                  <div className="h-full bg-vibrant-gold/40 flex-1" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-ink-600 pt-0.5 num">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-vibrant-amber" />
                    Ordered
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-vibrant-gold/50" />
                    Remaining ({formatQuantity(remainingLiters)} L left)
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ROW 2: 12-Column Main Bento Body */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left Column: Division Order Limit + Top 4 Leading Units/Sectors (4 cols) */}
        <div className="col-span-4 glass-card rounded-[22px] p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-plum-900">
              Division Order Limit
            </h2>
            <Link
              to="/admin/settings"
              title="Limit settings"
              aria-label="Manage division order limit"
              className="w-8 h-8 rounded-full glass-pill flex items-center justify-center text-plum-900 hover:bg-white transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Inner Dark Plum Limit Card with Semi-Circular SVG Gauge */}
          <div className="glass-plum rounded-[18px] p-5 text-white relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-milk-200/80 font-medium num">
                {limitPercent.toFixed(1)}% of limit
              </span>
              <Link
                to="/admin/units"
                aria-label="View units breakdown"
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
                  stroke="rgba(255, 243, 230, 0.16)"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                <path
                  d="M 26 100 A 74 74 0 0 1 174 100"
                  fill="none"
                  stroke="#F59E0B"
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
                  stroke="#F59E0B"
                  strokeWidth="3"
                />
              </svg>

              <div className="-mt-12 text-center">
                <span className="text-[11px] uppercase tracking-wider text-milk-200/70 block">
                  Total Ordered
                </span>
                <span className="text-2xl font-extrabold num text-white block leading-tight">
                  {formatQuantity(totalQuantity)} L
                </span>
                <span className="text-xs text-milk-200/80 num">
                  / {formatQuantity(divisionLimit)} L limit
                </span>
              </div>
            </div>

            <Link
              to="/admin/settings"
              title="Edit limit"
              aria-label="Edit division order limit"
              className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-vibrant-amberMid text-plum-950 flex items-center justify-center hover:scale-105 transition-transform shadow"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </Link>
          </div>

          {/* Top 4 Leading Units / Sectors — share of Division Limit */}
          <div className="space-y-2.5 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-600 uppercase tracking-wide">
                Top 4 Leading {leftListMode === 'units' ? 'Units' : 'Sectors'}
              </span>
              <div className="glass-pill p-0.5 rounded-full inline-flex text-[11px]">
                {(['units', 'sectors'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLeftListMode(mode)}
                    className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors ${
                      leftListMode === mode
                        ? 'glass-plum text-white'
                        : 'text-ink-600 hover:text-plum-900'
                    }`}
                  >
                    {mode === 'units' ? 'Units' : 'Sectors'}
                  </button>
                ))}
              </div>
            </div>

            {leftListItems.length === 0 ? (
              <div className="bg-milk-50 border border-milk-border rounded-xl px-3.5 py-4 text-xs text-ink-600 text-center">
                No {leftListMode} configured yet.
              </div>
            ) : (
              leftListItems.map((item, idx) => {
                const share = calcLimitSharePercent(item.quantity, divisionLimit);
                const barColor =
                  SECTOR_BAR_COLORS[idx % SECTOR_BAR_COLORS.length];
                return (
                  <div
                    key={item.key}
                    className="bg-milk-50 border border-milk-border rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-ink-900 leading-snug break-words block">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-ink-600 num">
                        {formatQuantity(item.quantity)} L
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-xs font-semibold text-plum-900 num">
                        {share.toFixed(1)}%
                      </span>
                      <div className="h-1.5 w-16 rounded-full bg-milk-100 overflow-hidden">
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
            <div className="col-span-8 glass-card rounded-[22px] p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg glass-plum flex items-center justify-center text-white shrink-0 shadow-xs">
                    <TrendingUp className="w-4 h-4 text-vibrant-amberMid" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-plum-900 leading-tight">
                      Top Performance
                    </h2>
                    <p className="text-[11px] text-ink-600 mt-0.5">
                      Ranked by liters ordered (% of division limit)
                    </p>
                  </div>
                </div>

                <div className="glass-pill p-0.5 rounded-full inline-flex text-xs">
                  <button
                    type="button"
                    onClick={() => setChartMode('units')}
                    className={`px-3 py-1 rounded-full font-semibold transition-colors ${
                      chartMode === 'units'
                        ? 'glass-plum text-white shadow-xs'
                        : 'text-ink-600 hover:text-plum-900'
                    }`}
                  >
                    Top Units
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('sectors')}
                    className={`px-3 py-1 rounded-full font-semibold transition-colors ${
                      chartMode === 'sectors'
                        ? 'glass-plum text-white shadow-xs'
                        : 'text-ink-600 hover:text-plum-900'
                    }`}
                  >
                    Sectors
                  </button>
                </div>
              </div>

              {chartItems.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-ink-600">
                  No data available to rank.
                </div>
              ) : (
                <div className="space-y-2.5 my-auto py-1">
                  {chartItems.slice(0, 5).map((item, idx) => {
                    const shareNum = calcLimitSharePercent(
                      item.quantity,
                      divisionLimit
                    );
                    const pct =
                      item.quantity > 0
                        ? Math.min(100, Math.max(0, shareNum))
                        : 0;
                    const showLabelInside = pct >= 18;
                    const share = shareNum.toFixed(1);

                    const barColor =
                      idx === 0
                        ? 'bg-plum-900 text-white'
                        : idx === 1
                        ? 'bg-plum-800 text-white'
                        : idx === 2
                        ? 'bg-plum-700 text-white'
                        : idx === 3
                        ? 'bg-plum-600 text-white'
                        : 'bg-plum-600/80 text-white';

                    return (
                      <div
                        key={item.key}
                        title={`${item.name} | Ordered: ${formatQuantity(item.quantity)} L | Share of Limit: ${share}% | Amount: ${formatCurrency(item.amount)}`}
                        className="flex items-center gap-3 group"
                      >
                        {/* 1. Name label */}
                        <div className="w-40 lg:w-48 shrink-0 flex items-center gap-1.5 min-w-0">
                          <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-ink-600 bg-milk-200 shrink-0 num">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-semibold text-plum-900 leading-snug break-words">
                            {item.name}
                          </span>
                        </div>

                        {/* 2. Horizontal progress track & proportional rounded bar */}
                        <div className="flex-1 bg-milk-100/90 rounded-full h-5 relative flex items-center p-0.5 overflow-hidden border border-milk-border/60">
                          <div
                            className={`h-full rounded-full transition-all duration-300 flex items-center justify-end shadow-2xs shrink-0 ${barColor} ${
                              showLabelInside ? 'px-2.5' : ''
                            }`}
                            style={{
                              width: pct > 0 ? `${pct}%` : '0px',
                              minWidth: item.quantity > 0 ? '6px' : '0px',
                            }}
                          >
                            {showLabelInside && (
                              <span className="text-[11px] font-bold num drop-shadow-xs whitespace-nowrap leading-none">
                                {formatQuantity(item.quantity)} L
                              </span>
                            )}
                          </div>
                          {!showLabelInside && (
                            <span
                              className={`ml-2 text-[11px] font-bold num whitespace-nowrap leading-none ${
                                item.quantity > 0
                                  ? 'text-plum-900'
                                  : 'text-ink-600'
                              }`}
                            >
                              {formatQuantity(item.quantity)} L
                            </span>
                          )}
                        </div>

                        {/* 3. Share % & Total Revenue */}
                        <div className="w-14 text-right shrink-0">
                          <span className="text-xs font-bold text-plum-900 num block">
                            {share}%
                          </span>
                          <span className="text-[10px] text-ink-600 num block truncate">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer summary */}
              <div className="pt-2 border-t border-milk-border/60 flex items-center justify-between text-xs">
                <span className="text-ink-600">
                  Showing top {Math.min(5, chartItems.length)} {chartMode}
                </span>
                <Link
                  to="/admin/units"
                  className="font-semibold text-plum-900 hover:underline inline-flex items-center gap-1"
                >
                  View Details
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Right Mini-Bento Stack (4 cols) */}
            <div className="col-span-4 flex flex-col gap-4">
              {/* Top Banner Card */}
              <div className="glass-card rounded-[20px] p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="bg-vibrant-amberSoft text-vibrant-amber text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block mb-1 num">
                    Rate ₹{formatQuantity(Number(settings.unit_rate) || 0)}/L
                  </span>
                  <div className="text-sm font-bold text-plum-900 truncate">
                    Challenge Controls
                  </div>
                  <div className="text-xs text-ink-600">
                    Lock or update limits
                  </div>
                </div>
                <Link
                  to="/admin/settings"
                  className="glass-plum text-white text-xs font-semibold px-3.5 py-1.5 rounded-full hover:opacity-95 transition-opacity shrink-0"
                >
                  Manage
                </Link>
              </div>

              {/* Bottom 2 Mini Cards */}
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div className="glass-card rounded-[20px] p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-medium text-ink-600 block">
                      Total Entries
                    </span>
                    <span className="text-2xl font-extrabold text-plum-900 num mt-1 block">
                      {summary.total_entries}
                    </span>
                    <span className="bg-vibrant-coralSoft text-vibrant-coral text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block mt-1.5 num">
                      {zeroUnitsCount} at 0 L
                    </span>
                  </div>
                  <Link
                    to="/admin/units"
                    aria-label="View units summary"
                    className="w-8 h-8 rounded-full bg-ink-900 text-white hover:bg-plum-900 flex items-center justify-center ml-auto transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="glass-card rounded-[20px] p-4 flex flex-col justify-between">
                  <div>
                    <span className="glass-pill w-8 h-8 rounded-lg flex items-center justify-center text-plum-900 mb-2">
                      <FileSpreadsheet className="w-4 h-4" />
                    </span>
                    <div className="text-xs font-bold text-plum-900">
                      Quick Reports
                    </div>
                    <div className="text-[11px] text-ink-600">PDF &amp; CSV</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenExportModal({
                        scope: 'ENTIRE_DIVISION',
                        template: 'DETAILED_ORDERS',
                      })
                    }
                    className="glass-pill hover:bg-white text-plum-900 text-xs font-semibold px-3 py-1.5 rounded-full inline-flex items-center justify-center gap-1.5 transition-colors w-full mt-2"
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Wide Card: Recent Entries */}
          <div className="glass-card rounded-[22px] p-5">
            <div className="flex items-center justify-between gap-3 mb-3.5">
              <h2 className="text-base font-bold text-plum-900">
                Recent Entries
              </h2>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={recentSearch}
                    onChange={(e) => setRecentSearch(e.target.value)}
                    placeholder="Search..."
                    aria-label="Search recent entries"
                    className="pl-8 pr-3 py-1.5 text-xs rounded-full border border-milk-border bg-white/90 text-ink-900 placeholder:text-ink-400 w-44"
                  />
                </div>
                <Link
                  to="/admin/entries"
                  className="text-xs font-semibold text-plum-900 hover:underline inline-flex items-center gap-1 shrink-0"
                >
                  View All
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-ink-600 border-b border-milk-border">
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
                <tbody className="divide-y divide-milk-border/60">
                  {filteredRecentEntries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-xs text-ink-600"
                      >
                        No recent entries found.
                      </td>
                    </tr>
                  ) : (
                    filteredRecentEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="hover:bg-milk-100/50 transition-colors"
                      >
                        <td className="py-2.5 pr-4 font-medium text-ink-900 whitespace-nowrap">
                          {entry.contributor_name}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-ink-600 whitespace-nowrap">
                          {entry.is_division_direct || entry.unit_id == null ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-plum-100 text-plum-900">
                              Division Direct
                            </span>
                          ) : (
                            entry.unit_name ?? '-'
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-plum-900 num whitespace-nowrap">
                          {formatQuantity(Number(entry.quantity) || 0)} L
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-plum-900 num whitespace-nowrap">
                          {formatCurrency(Number(entry.total_amount) || 0)}
                        </td>
                        <td className="py-2.5 pl-4 text-right whitespace-nowrap">
                          {entry.payment_status === 'UNPAID' ? (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-vibrant-coralSoft text-vibrant-coral">
                                Unpaid
                              </span>
                              <InlinePaymentUpdater
                                portal="ADMIN"
                                authCode={adminCode}
                                entryId={entry.id}
                                compact
                                onPaid={onMutated}
                                onError={onError}
                              />
                            </div>
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
