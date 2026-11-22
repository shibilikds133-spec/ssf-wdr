import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileBarChart2,
  ListChecks,
  Plus,
  Search,
  Settings,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { AdminDashboardResponse } from '../../types';
import {
  calcLimitSharePercent,
  formatCurrency,
  formatDateTime,
  formatQuantity,
} from '../../utils/format';
import type { ReportFilterConfig } from '../../utils/reports';
import { BrandText } from '../BrandText';

interface AdminDashboardMobileProps {
  data: AdminDashboardResponse;
  onOpenAddOrder: () => void;
  onOpenExportModal: (initialConfig?: Partial<ReportFilterConfig>) => void;
}

export function AdminDashboardMobile({
  data,
  onOpenAddOrder,
  onOpenExportModal,
}: AdminDashboardMobileProps) {
  const { settings, summary, sectors, unit_summaries, entries } = data;

  const [chartMode, setChartMode] = useState<'units' | 'sectors'>('units');
  const [recentSearch, setRecentSearch] = useState('');

  const totalAmount = Number(summary.total_amount) || 0;
  const totalQuantity = Number(summary.total_quantity) || 0;
  const cashAmount = Number(summary.cash_amount) || 0;
  const upiAmount = Number(summary.upi_amount) || 0;
  const unpaidAmount = Number(summary.unpaid_amount) || 0;
  const unpaidEntries = Number(summary.unpaid_entries) || 0;
  const divisionLimit = Math.max(0, Number(settings.division_target) || 0);

  const activeUnitsCount = useMemo(
    () => unit_summaries.filter((u) => u.total_entries > 0).length,
    [unit_summaries]
  );

  const limitPercent = calcLimitSharePercent(totalQuantity, divisionLimit);
  const cappedLimitPercent = Math.min(100, Math.max(0, limitPercent));
  const isAboveLimit = divisionLimit > 0 && totalQuantity > divisionLimit;
  const remainingLiters = Math.max(0, divisionLimit - totalQuantity);
  const excessLiters = Math.max(0, totalQuantity - divisionLimit);

  const upiPercent =
    totalAmount > 0 ? Math.round((upiAmount / totalAmount) * 100) : 0;
  const cashPercent = totalAmount > 0 ? 100 - upiPercent : 0;

  // Sector totals aggregation
  const sectorStats = useMemo(() => {
    const map = new Map<
      number,
      { id: number; name: string; quantity: number; amount: number }
    >();
    for (const s of sectors || []) {
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

  // Top units sorted by quantity
  const topUnits = useMemo(() => {
    return [...unit_summaries]
      .sort((a, b) => {
        const qA = Number(a.total_quantity) || 0;
        const qB = Number(b.total_quantity) || 0;
        return qB !== qA ? qB - qA : a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }, [unit_summaries]);

  // Chart items for Top Performance horizontal bars
  const chartItems = useMemo(() => {
    if (chartMode === 'sectors') {
      return sectorStats.slice(0, 5).map((s) => ({
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

  const maxChartQty = useMemo(
    () => Math.max(...chartItems.map((i) => i.quantity), 1),
    [chartItems]
  );

  // Filtered recent entries
  const filteredRecentEntries = useMemo(() => {
    const q = recentSearch.trim().toLowerCase();
    const matched = q
      ? entries.filter((e) =>
          `${e.contributor_name} ${e.unit_name ?? ''} ${e.sector_name ?? ''}`
            .toLowerCase()
            .includes(q)
        )
      : entries;
    return matched.slice(0, 4);
  }, [entries, recentSearch]);

  // Radial Ring calculation (compact, sleek ring)
  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - cappedLimitPercent / 100);

  return (
    <div className="space-y-3.5 md:space-y-4">
      {/* 1. TOP SECTION: Hero Overview Card & Collections Split */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 md:gap-4">
        {/* CARD 1: Division Order Limit & Revenue (Hero) */}
        <div className="md:col-span-6 glass-plum rounded-2xl p-3.5 sm:p-4 text-white flex flex-col justify-between shadow-sm">
          {/* Header row: Title + Rate & Status (Division Overview removed) */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-sm sm:text-base font-bold text-white leading-snug min-w-0 flex-1">
              <BrandText text={settings.challenge_title} />
            </h1>

            <div className="flex items-center gap-2 shrink-0 text-xs font-bold">
              <span className="text-vibrant-amber num">
                ₹{formatQuantity(Number(settings.unit_rate) || 0)}/L
              </span>
              <span className="text-white/30">·</span>
              <span
                className={
                  settings.is_challenge_open
                    ? 'text-vibrant-teal'
                    : 'text-vibrant-coral'
                }
              >
                {settings.is_challenge_open ? 'Orders Open' : 'Orders Closed'}
              </span>
            </div>
          </div>

          {/* Numbers + Compact Radial Ring Gauge */}
          <div className="flex items-center justify-between gap-3 mt-2">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase tracking-wider text-milk-200/70 block font-medium">
                Total Ordered
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold num text-white tracking-tight leading-none mt-0.5">
                {formatQuantity(totalQuantity)} L
              </div>
              <div className="text-lg sm:text-xl font-bold num text-milk-200 mt-0.5">
                {formatCurrency(totalAmount)}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-milk-200/80 num">
                <CheckCircle2 className="w-3.5 h-3.5 text-vibrant-teal shrink-0" />
                <span>
                  {summary.total_entries} orders · {activeUnitsCount}/
                  {summary.total_units} active
                </span>
              </div>
              {/* Highlighted Remaining / Excess Liters with Orange font and subtle glass pill */}
              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-vibrant-amber font-bold text-[11px] num">
                <span className="w-1.5 h-1.5 rounded-full bg-vibrant-amber shrink-0" />
                <span>
                  {isAboveLimit
                    ? `+${formatQuantity(excessLiters)} L above limit`
                    : `${formatQuantity(remainingLiters)} L remaining to limit`}
                </span>
              </div>
            </div>

            {/* Circular Donut Ring Gauge (Compact with Limit inside) */}
            <div className="shrink-0 flex items-center justify-center self-center">
              <div className="relative w-[84px] h-[84px] min-w-[84px] sm:w-[92px] sm:h-[92px] sm:min-w-[92px] shrink-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 80 80"
                  className="w-full h-full -rotate-90 transform shrink-0 block"
                  aria-hidden="true"
                >
                  <circle
                    cx="40"
                    cy="40"
                    r={ringRadius}
                    fill="none"
                    stroke="rgba(255, 243, 230, 0.15)"
                    strokeWidth="6.5"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={ringRadius}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="6.5"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringDashOffset}
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1 pointer-events-none select-none">
                  <span className="text-base sm:text-lg font-black num text-white leading-tight">
                    {limitPercent.toFixed(0)}%
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-semibold text-milk-200/85 num leading-none mt-0.5 whitespace-nowrap">
                    of {formatQuantity(divisionLimit)} L
                  </span>
                  <span className="text-[7px] sm:text-[8px] uppercase tracking-wider text-vibrant-amber font-bold mt-0.5">
                    Limit
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Collections & Payment Split (Unified, No Redundancy) */}
        <div className="md:col-span-6 glass-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-vibrant-teal text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Wallet className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm font-bold text-plum-900 block leading-tight">
                  Payment Split
                </span>
                <span className="text-[10px] text-ink-600">
                  Verified Collections Breakdown
                </span>
              </div>
            </div>
            <span className="glass-pill px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-vibrant-teal bg-vibrant-tealSoft">
              Live
            </span>
          </div>

          {/* Visual Dual-Colored Split Progress Bar */}
          <div className="my-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold num">
              <span className="text-vibrant-amber font-bold inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-vibrant-amber inline-block" />
                Cash ({cashPercent}%)
              </span>
              <span className="text-vibrant-teal font-bold inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-vibrant-teal inline-block" />
                UPI ({upiPercent}%)
              </span>
            </div>
            <div className="h-3 rounded-full bg-milk-100 overflow-hidden flex border border-milk-border/60 p-0.5">
              <div
                className="h-full bg-vibrant-amber rounded-l-full transition-all duration-300"
                style={{ width: `${cashPercent}%` }}
                title={`Cash: ${cashPercent}% (${formatCurrency(cashAmount)})`}
              />
              <div
                className="h-full bg-vibrant-teal rounded-r-full transition-all duration-300"
                style={{ width: `${upiPercent}%` }}
                title={`UPI: ${upiPercent}% (${formatCurrency(upiAmount)})`}
              />
            </div>
          </div>

          {/* Cash, UPI & Unpaid Value Breakdown Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-milk-50/90 rounded-xl p-2 border border-milk-border/70 border-l-3 border-l-vibrant-amber">
              <span className="text-[10px] uppercase font-semibold text-ink-600 block">
                Cash
              </span>
              <span className="text-sm font-bold text-plum-900 num block mt-0.5 truncate">
                {formatCurrency(cashAmount)}
              </span>
            </div>
            <div className="bg-milk-50/90 rounded-xl p-2 border border-milk-border/70 border-l-3 border-l-vibrant-teal">
              <span className="text-[10px] uppercase font-semibold text-ink-600 block">
                UPI
              </span>
              <span className="text-sm font-bold text-plum-900 num block mt-0.5 truncate">
                {formatCurrency(upiAmount)}
              </span>
            </div>
            <div className="bg-milk-50/90 rounded-xl p-2 border border-milk-border/70 border-l-3 border-l-vibrant-coral">
              <span className="text-[10px] uppercase font-semibold text-ink-600 block">
                Unpaid ({unpaidEntries})
              </span>
              <span className="text-sm font-bold text-vibrant-coral num block mt-0.5 truncate">
                {formatCurrency(unpaidAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CARD 3: Top Performance Funnel Bar Chart */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
        {/* Header with Switcher */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg glass-plum flex items-center justify-center text-white shrink-0 shadow-xs">
              <TrendingUp className="w-3.5 h-3.5 text-vibrant-amberMid" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-plum-900 leading-tight">
                Top Performance
              </h2>
              <p className="text-[10px] text-ink-600 truncate">
                Ranked by liters ordered (% of division limit)
              </p>
            </div>
          </div>

          {/* Toggle pill */}
          <div className="glass-pill p-0.5 rounded-full inline-flex text-[11px] shrink-0">
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

        {/* Horizontal Bars */}
        {chartItems.length === 0 ? (
          <p className="text-xs text-ink-600 py-6 text-center">
            No {chartMode} data available yet.
          </p>
        ) : (
          <div className="space-y-2 py-1">
            {chartItems.map((item, idx) => {
              const pct =
                maxChartQty > 0 && item.quantity > 0
                  ? Math.min(100, Math.max(3, Math.round((item.quantity / maxChartQty) * 100)))
                  : 0;
              const showLabelInside = pct >= 22;
              const share = calcLimitSharePercent(
                item.quantity,
                divisionLimit
              ).toFixed(1);

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
                  className="space-y-1.5 group"
                >
                  {/* Top Row: Rank + Full Name + Share % & Revenue */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 num ${
                          idx === 0
                            ? 'bg-vibrant-goldSoft text-vibrant-gold'
                            : 'bg-milk-200 text-ink-600'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-plum-900 leading-snug break-words">
                        {item.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 num">
                      <span className="text-xs font-bold text-plum-900">
                        {share}%
                      </span>
                      <span className="text-[10px] text-ink-600">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Full-width Horizontal Bar */}
                  <div className="w-full bg-milk-100/90 rounded-xl h-7 relative flex items-center p-1 overflow-hidden border border-milk-border/60">
                    <div
                      className={`h-full rounded-lg transition-all duration-300 flex items-center justify-end shadow-2xs shrink-0 ${barColor} ${
                        showLabelInside ? 'px-2.5' : ''
                      }`}
                      style={{
                        width: pct > 0 ? `${pct}%` : '6px',
                      }}
                    >
                      {showLabelInside && (
                        <span className="text-[11px] font-bold num drop-shadow-xs whitespace-nowrap">
                          {formatQuantity(item.quantity)} L
                        </span>
                      )}
                    </div>
                    {!showLabelInside && (
                      <span
                        className={`ml-2 text-[11px] font-bold num whitespace-nowrap ${
                          item.quantity > 0 ? 'text-plum-900' : 'text-ink-600'
                        }`}
                      >
                        {formatQuantity(item.quantity)} L
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-milk-border/60 flex items-center justify-between text-xs">
          <span className="text-ink-600 text-[11px]">
            Showing top {Math.min(5, chartItems.length)} {chartMode}
          </span>
          <Link
            to="/admin/units"
            className="font-semibold text-plum-900 hover:underline inline-flex items-center gap-1 text-[11px] sm:text-xs"
          >
            View All Units
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* 3. CARD 4: Recent Activity & Contributor Search */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-plum-900">
              Recent Entries
            </h2>
            <p className="text-[10px] text-ink-600">Latest contributors</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3 h-3 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={recentSearch}
                onChange={(e) => setRecentSearch(e.target.value)}
                placeholder="Search..."
                aria-label="Search recent entries"
                className="pl-7 pr-2.5 py-1 text-[11px] rounded-full border border-milk-border bg-white/90 text-ink-900 placeholder:text-ink-400 w-28 sm:w-36 focus:outline-none focus:ring-1 focus:ring-plum-400"
              />
            </div>
            <Link
              to="/admin/entries"
              className="text-[11px] font-semibold text-plum-900 hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              View All
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {filteredRecentEntries.length === 0 ? (
          <p className="text-xs text-ink-600 py-3 text-center">
            No recent entries found.
          </p>
        ) : (
          <div className="divide-y divide-milk-border/60">
            {filteredRecentEntries.map((entry) => (
              <div
                key={entry.id}
                className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-ink-900 truncate">
                      {entry.contributor_name}
                    </span>
                    {entry.payment_status === 'UNPAID' ? (
                      <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full shrink-0 bg-vibrant-coralSoft text-vibrant-coral">
                        Unpaid
                      </span>
                    ) : (
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full shrink-0 ${
                          entry.payment_mode === 'UPI'
                            ? 'bg-vibrant-tealSoft text-vibrant-teal'
                            : 'bg-vibrant-amberSoft text-vibrant-amber'
                        }`}
                      >
                        {entry.payment_mode}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-ink-500 truncate mt-0.5">
                    {entry.is_division_direct || entry.unit_id == null
                      ? 'Division Direct'
                      : entry.unit_name ?? 'Unit'}{' '}
                    · {formatDateTime(entry.created_at)}
                  </div>
                </div>

                <div className="text-right shrink-0 num">
                  <div className="text-xs font-bold text-plum-900">
                    {formatQuantity(Number(entry.quantity) || 0)} L
                  </div>
                  <div className="text-[10px] text-ink-600">
                    {formatCurrency(Number(entry.total_amount) || 0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. QUICK ACTIONS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={onOpenAddOrder}
          className="col-span-2 sm:col-span-1 glass-plum rounded-xl py-2.5 px-3 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 hover:opacity-95 transition-opacity shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Order
        </button>
        <button
          type="button"
          onClick={() => onOpenExportModal({ scope: 'ENTIRE_DIVISION' })}
          className="glass-card rounded-xl py-2.5 px-3 text-xs font-semibold text-plum-900 inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          Export Report
        </button>
        <Link
          to="/admin/reports"
          className="glass-card rounded-xl py-2.5 px-3 text-xs font-semibold text-plum-900 inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors shadow-2xs"
        >
          <FileBarChart2 className="w-3.5 h-3.5" />
          Reports
        </Link>
        <Link
          to="/admin/entries"
          className="glass-card rounded-xl py-2.5 px-3 text-xs font-semibold text-plum-900 inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors shadow-2xs"
        >
          <ListChecks className="w-3.5 h-3.5" />
          Entries
        </Link>
        <Link
          to="/admin/settings"
          className="glass-card rounded-xl py-2.5 px-3 text-xs font-semibold text-plum-900 inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors shadow-2xs"
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </Link>
      </div>
    </div>
  );
}
