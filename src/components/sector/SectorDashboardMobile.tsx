import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileBarChart2,
  ListChecks,
  Search,
  Settings,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { SectorDashboardResponse } from '../../types';
import {
  calcLimitSharePercent,
  formatCurrency,
  formatDateTime,
  formatQuantity,
} from '../../utils/format';
import type { ReportFilterConfig } from '../../utils/reports';
import { BrandText } from '../BrandText';

interface SectorDashboardMobileProps {
  data: SectorDashboardResponse;
  onOpenExportModal: (initialConfig?: Partial<ReportFilterConfig>) => void;
}

export function SectorDashboardMobile({
  data,
  onOpenExportModal,
}: SectorDashboardMobileProps) {
  const { sector, settings, summary, units, entries } = data;

  const [chartMode, setChartMode] = useState<'liters' | 'orders'>('liters');
  const [recentSearch, setRecentSearch] = useState('');

  const totalAmount = Number(summary.total_amount) || 0;
  const totalQuantity = Number(summary.total_quantity) || 0;
  const cashAmount = Number(summary.cash_amount) || 0;
  const upiAmount = Number(summary.upi_amount) || 0;
  const unpaidAmount = Number(summary.unpaid_amount) || 0;
  const unpaidEntries = Number(summary.unpaid_entries) || 0;
  const totalEntries = Number(summary.total_entries) || 0;
  const totalUnits = Number(summary.total_units) || 0;
  const divisionLimit = Math.max(0, Number(settings.division_target) || 0);

  const activeUnitsCount = useMemo(
    () => units.filter((u) => Number(u.total_entries) > 0).length,
    [units]
  );

  const participationPercent =
    totalUnits > 0 ? (activeUnitsCount / totalUnits) * 100 : 0;
  const cappedParticipation = Math.min(100, Math.max(0, participationPercent));
  const divisionSharePercent = calcLimitSharePercent(totalQuantity, divisionLimit);

  const upiPercent =
    totalAmount > 0 ? Math.round((upiAmount / totalAmount) * 100) : 0;
  const cashPercent = totalAmount > 0 ? 100 - upiPercent : 0;

  // Ranked units
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

  const chartItems = useMemo(() => {
    if (chartMode === 'orders') {
      return rankedUnitsByOrders.slice(0, 5).map((u) => ({
        key: `unit-${u.id}`,
        name: u.name,
        quantity: Number(u.total_quantity) || 0,
        orders: Number(u.total_entries) || 0,
        amount: Number(u.total_amount) || 0,
      }));
    }
    return rankedUnitsByQty.slice(0, 5).map((u) => ({
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

  const filteredRecentEntries = useMemo(() => {
    const q = recentSearch.trim().toLowerCase();
    const matched = q
      ? entries.filter((e) =>
          `${e.contributor_name} ${e.unit_name ?? ''}`.toLowerCase().includes(q)
        )
      : entries;
    return matched.slice(0, 4);
  }, [entries, recentSearch]);

  // Radial Ring calculation (Participation Rate)
  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - cappedParticipation / 100);

  return (
    <div className="space-y-3.5 md:space-y-4">
      {/* 1. TOP SECTION: Hero Overview Card & Collections Split */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 md:gap-4">
        {/* CARD 1: Sector Overview (Hero) */}
        <div className="md:col-span-6 glass-forest rounded-2xl p-3.5 sm:p-4 text-white flex flex-col justify-between shadow-sm">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-bold text-white leading-snug truncate">
                <BrandText text={sector.name} />
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0 text-xs font-bold pt-0.5">
              <span className="text-vibrant-amber num">
                ₹{formatQuantity(Number(settings.unit_rate) || 0)}/L
              </span>
              <span className="text-leaf-200/30">·</span>
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

          {/* Numbers + Radial Ring Gauge */}
          <div className="flex items-center justify-between gap-3 mt-2">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase tracking-wider text-leaf-200/70 block font-medium">
                Sector Volume
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold num text-white tracking-tight leading-none mt-0.5">
                {formatQuantity(totalQuantity)} L
              </div>
              <div className="text-lg sm:text-xl font-bold num text-leaf-200 mt-0.5">
                {formatCurrency(totalAmount)}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-leaf-200/80 num">
                <CheckCircle2 className="w-3.5 h-3.5 text-vibrant-teal shrink-0" />
                <span>
                  {totalEntries} orders · {activeUnitsCount}/{totalUnits} units active
                </span>
              </div>
              {/* Highlighted division contribution pill */}
              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-vibrant-amber font-bold text-[11px] num">
                <span className="w-1.5 h-1.5 rounded-full bg-vibrant-amber shrink-0" />
                <span>
                  {divisionLimit > 0
                    ? `${divisionSharePercent.toFixed(1)}% of division limit`
                    : `${activeUnitsCount} active units`}
                </span>
              </div>
            </div>

            {/* Circular Donut Ring Gauge (Participation Rate) */}
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
                    stroke="rgba(224, 255, 194, 0.15)"
                    strokeWidth="6.5"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={ringRadius}
                    fill="none"
                    stroke="#14B8A6"
                    strokeWidth="6.5"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringDashOffset}
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1 pointer-events-none select-none">
                  <span className="text-base sm:text-lg font-black num text-white leading-tight">
                    {participationPercent.toFixed(0)}%
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-semibold text-leaf-200/85 num leading-none mt-0.5 whitespace-nowrap">
                    {activeUnitsCount}/{totalUnits}
                  </span>
                  <span className="text-[7px] sm:text-[8px] uppercase tracking-wider text-leaf-200 font-bold mt-0.5">
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Collections & Payment Split */}
        <div className="md:col-span-6 glass-leaf-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-vibrant-teal text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Wallet className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm font-bold text-forest-950 block leading-tight">
                  Payment Split
                </span>
                <span className="text-[10px] text-forest-600">
                  Sector Collections Breakdown
                </span>
              </div>
            </div>
            <span className="glass-leaf-pill px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-vibrant-teal bg-vibrant-tealSoft">
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
            <div className="h-3 rounded-full bg-leaf-100 overflow-hidden flex border border-leaf-border/60 p-0.5">
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
            <div className="bg-leaf-50/90 rounded-xl p-2 border border-leaf-border/70 border-l-3 border-l-vibrant-amber">
              <span className="text-[10px] uppercase font-semibold text-forest-600 block">
                Cash
              </span>
              <span className="text-sm font-bold text-forest-950 num block mt-0.5 truncate">
                {formatCurrency(cashAmount)}
              </span>
            </div>
            <div className="bg-leaf-50/90 rounded-xl p-2 border border-leaf-border/70 border-l-3 border-l-vibrant-teal">
              <span className="text-[10px] uppercase font-semibold text-forest-600 block">
                UPI
              </span>
              <span className="text-sm font-bold text-forest-950 num block mt-0.5 truncate">
                {formatCurrency(upiAmount)}
              </span>
            </div>
            <div className="bg-leaf-50/90 rounded-xl p-2 border border-leaf-border/70 border-l-3 border-l-vibrant-coral">
              <span className="text-[10px] uppercase font-semibold text-forest-600 block">
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
      <div className="glass-leaf-card rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
        {/* Header with Switcher: By Liters | By Orders */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg glass-forest flex items-center justify-center text-white shrink-0 shadow-xs">
              <TrendingUp className="w-3.5 h-3.5 text-leaf-200" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-forest-950 leading-tight">
                Top Performance
              </h2>
              <p className="text-[10px] text-forest-600 truncate">
                Units ranked in {sector.name}
              </p>
            </div>
          </div>

          {/* Toggle pill */}
          <div className="glass-leaf-pill p-0.5 rounded-full inline-flex text-[11px] shrink-0">
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

        {/* Horizontal Bars */}
        {chartItems.length === 0 ? (
          <p className="text-xs text-forest-600 py-6 text-center">
            No unit data available yet.
          </p>
        ) : (
          <div className="space-y-2 py-1">
            {chartItems.map((item, idx) => {
              const value =
                chartMode === 'orders' ? item.orders : item.quantity;
              const divShareNum = calcLimitSharePercent(
                item.quantity,
                divisionLimit
              );
              const pct =
                chartMode === 'orders'
                  ? maxChartValue > 0 && value > 0
                    ? Math.min(100, Math.max(0, (value / maxChartValue) * 100))
                    : 0
                  : item.quantity > 0
                  ? Math.min(100, Math.max(0, divShareNum))
                  : 0;
              const showLabelInside = pct >= 22;
              const share = divShareNum.toFixed(1);

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
                  className="space-y-1.5 group"
                >
                  {/* Top Row: Rank + Full Name + Share % & Revenue */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 num ${
                          idx === 0
                            ? 'bg-vibrant-goldSoft text-vibrant-gold'
                            : 'bg-leaf-100 text-forest-700'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-forest-950 leading-snug break-words">
                        {item.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 num">
                      <span className="text-xs font-bold text-forest-950">
                        {share}%
                      </span>
                      <span className="text-[10px] text-forest-600">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Full-width Horizontal Bar */}
                  <div className="w-full bg-leaf-100/90 rounded-full h-4 sm:h-5 relative flex items-center p-0.5 overflow-hidden border border-leaf-border/60">
                    <div
                      className={`h-full rounded-full transition-all duration-300 flex items-center justify-end shadow-2xs shrink-0 ${barColor} ${
                        showLabelInside ? 'px-2' : ''
                      }`}
                      style={{
                        width: pct > 0 ? `${pct}%` : '0px',
                        minWidth: value > 0 ? '6px' : '0px',
                      }}
                    >
                      {showLabelInside && (
                        <span className="text-[10px] font-bold num drop-shadow-xs whitespace-nowrap leading-none">
                          {chartMode === 'orders'
                            ? `${item.orders} Orders`
                            : `${formatQuantity(item.quantity)} L`}
                        </span>
                      )}
                    </div>
                    {!showLabelInside && (
                      <span
                        className={`ml-2 text-[10px] font-bold num whitespace-nowrap leading-none ${
                          value > 0 ? 'text-forest-950' : 'text-forest-600'
                        }`}
                      >
                        {chartMode === 'orders'
                          ? `${item.orders} Orders`
                          : `${formatQuantity(item.quantity)} L`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-leaf-border/60 flex items-center justify-between text-xs">
          <span className="text-forest-600 text-[11px]">
            Showing top {Math.min(5, chartItems.length)} units in {sector.name}
          </span>
          <Link
            to="/sector/units"
            className="font-semibold text-forest-900 hover:underline inline-flex items-center gap-1 text-[11px] sm:text-xs"
          >
            View All Units
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* 3. CARD 4: Recent Sector Orders */}
      <div className="glass-leaf-card rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-forest-950">
              Recent Sector Orders
            </h2>
            <p className="text-[10px] text-forest-600">Latest contributors</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3 h-3 text-forest-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={recentSearch}
                onChange={(e) => setRecentSearch(e.target.value)}
                placeholder="Search..."
                aria-label="Search recent sector orders"
                className="pl-7 pr-2.5 py-1 text-[11px] rounded-full border border-leaf-border bg-white/90 text-forest-950 placeholder:text-forest-400 w-28 sm:w-36 focus:outline-none focus:ring-1 focus:ring-forest-400"
              />
            </div>
            <Link
              to="/sector/entries"
              className="text-[11px] font-semibold text-forest-900 hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              View All
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {filteredRecentEntries.length === 0 ? (
          <p className="text-xs text-forest-600 py-3 text-center">
            No recent sector orders found.
          </p>
        ) : (
          <div className="divide-y divide-leaf-border/60">
            {filteredRecentEntries.map((entry) => (
              <div
                key={entry.id}
                className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-forest-950 truncate">
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
                  <div className="text-[10px] text-forest-500 truncate mt-0.5">
                    {entry.unit_name ?? 'Unit'} · {formatDateTime(entry.created_at)}
                  </div>
                </div>

                <div className="text-right shrink-0 num">
                  <div className="text-xs font-bold text-forest-950">
                    {formatQuantity(Number(entry.quantity) || 0)} L
                  </div>
                  <div className="text-[10px] text-forest-600">
                    {formatCurrency(Number(entry.total_amount) || 0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. QUICK ACTIONS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => onOpenExportModal({ scope: 'ENTIRE_SECTOR' })}
          className="glass-leaf-card rounded-xl py-2.5 px-3 text-xs font-semibold text-forest-900 inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          Export Report
        </button>
        <Link
          to="/sector/reports"
          className="glass-leaf-card rounded-xl py-2.5 px-3 text-xs font-semibold text-forest-900 inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors shadow-2xs"
        >
          <FileBarChart2 className="w-3.5 h-3.5" />
          Reports
        </Link>
        <Link
          to="/sector/entries"
          className="glass-leaf-card rounded-xl py-2.5 px-3 text-xs font-semibold text-forest-900 inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors shadow-2xs"
        >
          <ListChecks className="w-3.5 h-3.5" />
          Orders
        </Link>
        <Link
          to="/sector/manage"
          className="glass-forest rounded-xl py-2.5 px-3 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 hover:opacity-95 transition-opacity shadow-sm"
        >
          <Settings className="w-3.5 h-3.5" />
          Manage
        </Link>
      </div>
    </div>
  );
}
