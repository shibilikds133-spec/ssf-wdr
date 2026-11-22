import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  Crown,
  Lock,
  LogIn,
  PlusCircle,
  RefreshCw,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import type { PublicLeaderboardResponse } from '../../types';
import { formatCurrency, formatQuantity } from '../../utils/format';
import { BrandText } from '../BrandText';
import { PageDocsButton } from '../docs/PageDocsButton';
import { SelectDropdown } from '../SelectDropdown';
import { SsfLogo } from '../SsfLogo';
import { PublicPosterWindow } from './PublicPosterWindow';

interface PublicLeaderboardDesktopProps {
  data: PublicLeaderboardResponse;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenQuickEntry: () => void;
}

type LeaderboardTab = 'SECTORS' | 'UNITS';

function podiumCardClass(rank: number): string {
  if (rank === 1) {
    return 'bg-gradient-to-br from-[#FFF9DB] to-[#FFF1EE] border-[#E6C229] shadow-md';
  }
  if (rank === 2) {
    return 'bg-white/90 border-slate-300 shadow-xs';
  }
  return 'bg-white/88 border-amber-300/80 shadow-xs';
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) {
    return 'bg-[#FCE36D] text-[#4A070A] border border-[#E6C229] shadow-xs';
  }
  if (rank === 2) {
    return 'bg-slate-200 text-slate-800 border border-slate-300';
  }
  if (rank === 3) {
    return 'bg-amber-200/80 text-amber-950 border border-amber-300';
  }
  return 'bg-[#5C0A0E]/[0.07] text-[#4A070A] border border-[#5C0A0E]/12';
}

export function PublicLeaderboardDesktop({
  data,
  refreshing,
  onRefresh,
  onOpenQuickEntry,
}: PublicLeaderboardDesktopProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('SECTORS');
  const [unitSearch, setUnitSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');

  const { summary, sectors, units } = data;
  const maxSectorLiters = Math.max(
    1,
    ...sectors.map((s) => Number(s.total_liters) || 0)
  );
  const maxUnitLiters = Math.max(
    1,
    ...units.map((u) => Number(u.total_liters) || 0)
  );

  const sectorFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'All Sectors' },
      ...[...sectors]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({
          value: String(s.id),
          label: s.name,
        })),
    ],
    [sectors]
  );

  const filteredUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase();
    return units.filter((u) => {
      if (sectorFilter !== 'ALL' && String(u.sector_id) !== sectorFilter) {
        return false;
      }
      if (!q) return true;
      return `${u.name} ${u.sector_name}`.toLowerCase().includes(q);
    });
  }, [units, unitSearch, sectorFilter]);

  const topSector = sectors[0] ?? null;
  const topUnit = units[0] ?? null;
  const activeUnitsCount = sectors.reduce(
    (sum, s) => sum + s.active_units_count,
    0
  );
  const totalUnitsCount = sectors.reduce(
    (sum, s) => sum + s.total_units_count,
    0
  );
  const progressPct = Math.min(
    100,
    Math.max(0, Number(summary.percent_complete) || 0)
  );

  const activePodiumItems =
    activeTab === 'SECTORS'
      ? sectors.slice(0, 3).map((s, idx) => ({
          key: `sec-${s.id}`,
          rank: idx + 1,
          title: s.name,
          subtitle: `${s.active_units_count}/${s.total_units_count} active units • ${s.total_orders} orders`,
          liters: Number(s.total_liters) || 0,
        }))
      : units.slice(0, 3).map((u, idx) => ({
          key: `unit-${u.id}`,
          rank: idx + 1,
          title: u.name,
          subtitle: `${u.sector_name} • ${u.total_orders} orders`,
          liters: Number(u.total_liters) || 0,
        }));

  return (
    <div className="min-h-screen public-theme-bg flex flex-col">
      {/* Sticky Desktop Top Header */}
      <header className="sticky top-0 z-30 glass-rose-header">
        <div className="max-w-[1440px] mx-auto px-5 xl:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <SsfLogo className="h-8 w-auto shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[#2B0406] truncate">
                  <BrandText text="SSF Wandoor" /> — Palada Payasam Challenge
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C40E16] animate-pulse" />
                  Live
                </span>
              </div>
              <p className="font-ml text-xs text-[#7A2E33]">
                ഡിസംബർ 11 വെള്ളി • ലൈവ് ലീഡർബോർഡ് &amp; ക്വിക്ക് ഓർഡർ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-9 px-3 rounded-full bg-[#FFF8F6]/[0.92] border border-[#5C0A0E]/[0.18] text-xs font-semibold text-[#5C0A0E] inline-flex items-center gap-1.5 hover:bg-white transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              disabled={!summary.orders_open}
              onClick={onOpenQuickEntry}
              className={`h-9 px-4 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                summary.orders_open
                  ? 'glass-crimson text-white shadow-sm hover:opacity-95'
                  : 'bg-[#5C0A0E]/15 border border-[#5C0A0E]/20 text-[#4A070A] cursor-not-allowed'
              }`}
            >
              {summary.orders_open ? (
                <>
                  <PlusCircle className="w-3.5 h-3.5 text-[#FCE36D] shrink-0" />
                  <span>Quick Entry</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Orders Closed</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/login')}
              className="h-9 px-3.5 rounded-full bg-white/90 border border-[#5C0A0E]/[0.20] text-xs font-bold text-[#2B0406] inline-flex items-center gap-1.5 hover:bg-white transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-[#5C0A0E] shrink-0" />
              <span>Portal Login</span>
            </button>

            <PageDocsButton
              theme="public"
              pageKey="public_leaderboard"
              labelBreakpoint="xl"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-5 xl:px-8 py-5 space-y-5">
        {/* Section 1: Compact Top Hero Row (Promotional Poster + Division Live Progress) */}
        <section
          aria-label="Campaign Poster and Live Division Progress"
          className="grid grid-cols-12 gap-5 items-stretch"
        >
          <div className="col-span-12 lg:col-span-7 flex">
            <PublicPosterWindow className="w-full my-auto" />
          </div>

          {/* Division Hero Progress Card */}
          <div className="col-span-12 lg:col-span-5 rounded-3xl glass-crimson text-white p-6 flex flex-col justify-between gap-4 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-crimson-pill text-xs font-bold text-[#FCE36D]">
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                <span>Division Progress</span>
              </span>

              {summary.orders_open ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-300/40 text-xs font-bold text-emerald-100">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Orders Open</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/30 border border-white/25 text-xs font-bold text-amber-200">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Orders Closed</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <p className="text-xs text-white/75 font-medium">
                  Total Payasam
                </p>
                <p className="text-4xl xl:text-5xl font-extrabold tracking-tight num text-white leading-none mt-1.5">
                  {formatQuantity(Number(summary.total_liters))}
                  <span className="text-lg font-bold text-[#FCE36D] ml-1.5">
                    L
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/75 font-medium">
                  Total Orders
                </p>
                <p className="text-3xl xl:text-4xl font-extrabold num text-white leading-none mt-1.5">
                  {summary.total_orders}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-3 w-full rounded-full bg-black/30 overflow-hidden border border-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#FCE36D] via-[#FACC15] to-[#F59E0B] transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-white/85 font-medium num">
                <span>{progressPct.toFixed(1)}% achieved</span>
                <span>
                  Target: {formatQuantity(Number(summary.division_limit))} L
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Status Cards Row */}
        <section
          aria-label="Live Division Statistics"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
            {/* Rate & Status Card */}
            <div className="glass-rose-card rounded-3xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#7A2E33]">
                  Per-Liter Rate
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#5C0A0E]/[0.08] text-[#5C0A0E] font-ml">
                  ഡിസംബർ 11 വെള്ളി
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-extrabold text-[#2B0406] num">
                  {formatCurrency(Number(summary.per_liter_rate))}
                  <span className="text-xs font-semibold text-[#7A2E33] ml-1">
                    / Liter
                  </span>
                </p>
                <p className="font-ml text-xs text-[#7A2E33] mt-1">
                  {summary.orders_open
                    ? 'ക്വിക്ക് എൻട്രിയിലൂടെ പുതിയ ഓർഡറുകൾ നൽകാം'
                    : 'ഓർഡർ സ്വീകരിക്കുന്നത് താൽക്കാലികമായി നിർത്തി'}
                </p>
              </div>
            </div>

            {/* Active Units Card */}
            <div className="glass-rose-card rounded-3xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#7A2E33]">
                  Active Units
                </span>
                <Users className="w-4 h-4 text-[#C40E16]" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-extrabold text-[#2B0406] num">
                  {activeUnitsCount}{' '}
                  <span className="text-sm font-semibold text-[#7A2E33]">
                    / {totalUnitsCount}
                  </span>
                </p>
                <p className="text-xs text-[#7A2E33] mt-1 num">
                  Across {sectors.length} Sectors in Wandoor Division
                </p>
              </div>
            </div>

            {/* #1 Sector Card */}
            <div className="glass-rose-card rounded-3xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#7A2E33]">
                  Leading Sector (#1)
                </span>
                <span className="w-7 h-7 rounded-xl bg-[#FCE36D] text-[#4A070A] inline-flex items-center justify-center shadow-xs">
                  <Crown className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2">
                <p className="text-base font-bold text-[#2B0406] truncate">
                  {topSector ? topSector.name : '—'}
                </p>
                <p className="text-sm font-extrabold text-[#5C0A0E] num mt-0.5">
                  {topSector
                    ? `${formatQuantity(Number(topSector.total_liters))} L (${topSector.total_orders} orders)`
                    : '0 L'}
                </p>
              </div>
            </div>

            {/* #1 Unit Card */}
            <div className="glass-rose-card rounded-3xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#7A2E33]">
                  Leading Unit (#1)
                </span>
                <span className="w-7 h-7 rounded-xl bg-[#5C0A0E]/[0.08] text-[#B45309] inline-flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2">
                <p className="text-base font-bold text-[#2B0406] truncate">
                  {topUnit ? topUnit.name : '—'}
                </p>
                <p className="text-sm font-extrabold text-[#5C0A0E] num mt-0.5">
                  {topUnit
                    ? `${formatQuantity(Number(topUnit.total_liters))} L • ${topUnit.sector_name}`
                    : '0 L'}
                </p>
              </div>
            </div>
        </section>

        {/* Section 3: Full Live Leaderboard Panel */}
        <section
          aria-label="Live Rankings Board"
          className="glass-rose-card rounded-3xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-[#2B0406]">
                Live Standings &amp; Rankings
              </h2>
              <p className="text-xs text-[#7A2E33] mt-0.5">
                Real-time sector and unit rankings across SSF Wandoor Division
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 p-1 rounded-2xl glass-rose-pill">
              <button
                type="button"
                onClick={() => setActiveTab('SECTORS')}
                className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                  activeTab === 'SECTORS'
                    ? 'glass-crimson text-white shadow-sm'
                    : 'text-[#4A070A] hover:bg-white/60'
                }`}
              >
                <Award className="w-3.5 h-3.5 shrink-0" />
                <span>Sectors ({sectors.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('UNITS')}
                className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                  activeTab === 'UNITS'
                    ? 'glass-crimson text-white shadow-sm'
                    : 'text-[#4A070A] hover:bg-white/60'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>Top Units ({units.length})</span>
              </button>
            </div>
          </div>

          {/* Top 3 Podium Cards */}
          {activePodiumItems.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {activePodiumItems.map((item) => (
                <div
                  key={item.key}
                  className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${podiumCardClass(
                    item.rank
                  )}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-9 h-9 rounded-xl text-sm font-extrabold num inline-flex items-center justify-center shrink-0 ${rankBadgeClass(
                        item.rank
                      )}`}
                    >
                      #{item.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#2B0406] truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#7A2E33] truncate num">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <p className="text-base font-extrabold text-[#5C0A0E] num shrink-0">
                    {formatQuantity(item.liters)} L
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Search & Filter Controls for Units Tab */}
          {activeTab === 'UNITS' && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-[#7A2E33]/70 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={unitSearch}
                  onChange={(e) => setUnitSearch(e.target.value)}
                  placeholder="യൂണിറ്റ് അല്ലെങ്കിൽ സെക്ടർ പേര് തിരയുക..."
                  className="w-full pl-9 pr-3 py-2 text-sm font-ml rounded-xl border border-[#5C0A0E]/18 bg-white/95 text-[#2B0406] placeholder:text-[#7A2E33]/50 focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                />
              </div>
              <SelectDropdown
                value={sectorFilter}
                onChange={setSectorFilter}
                options={sectorFilterOptions}
                ariaLabel="Filter units by sector"
                className="w-60"
              />
            </div>
          )}

          {/* Leaderboard Table */}
          {activeTab === 'SECTORS' ? (
            <div className="glass-rose-table rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="glass-rose-head border-b border-[#5C0A0E]/12 text-[11px] font-bold uppercase tracking-wider text-[#7A2E33]">
                  <tr>
                    <th className="py-3 px-4 w-20">Rank</th>
                    <th className="py-3 px-4">Sector</th>
                    <th className="py-3 px-4 text-right">Active Units</th>
                    <th className="py-3 px-4 text-right">Orders</th>
                    <th className="py-3 px-4 text-right w-40">Quantity (L)</th>
                    <th className="py-3 px-4 w-48">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#5C0A0E]/10 text-sm">
                  {sectors.map((sec, idx) => {
                    const rank = idx + 1;
                    const liters = Number(sec.total_liters) || 0;
                    const pct = Math.min(
                      100,
                      Math.round((liters / maxSectorLiters) * 100)
                    );
                    return (
                      <tr
                        key={sec.id}
                        className="hover:bg-white/60 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span
                            className={`w-7 h-7 rounded-lg text-xs font-extrabold num inline-flex items-center justify-center ${rankBadgeClass(
                              rank
                            )}`}
                          >
                            {rank}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-[#2B0406]">
                          <span className="inline-block px-2.5 py-0.5 rounded-lg bg-white/70 backdrop-blur-md border border-[#5C0A0E]/12 shadow-2xs">
                            {sec.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-medium text-[#7A2E33] num">
                          {sec.active_units_count}/{sec.total_units_count}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-[#4A070A] num bg-[#5C0A0E]/[0.02]">
                          {sec.total_orders}
                        </td>
                        <td className="py-3 px-4 text-right font-extrabold text-[#5C0A0E] num bg-[#5C0A0E]/[0.03]">
                          {formatQuantity(liters)} L
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-2 w-full rounded-full bg-[#5C0A0E]/[0.08] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#C40E16] to-[#5C0A0E]"
                              style={{
                                width: `${liters > 0 ? Math.max(4, pct) : 0}%`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="glass-rose-table rounded-2xl overflow-hidden">
              {filteredUnits.length === 0 ? (
                <p className="font-ml text-sm text-center text-[#7A2E33] py-10">
                  തിരയുന്ന പേരിൽ യൂണിറ്റുകളൊന്നും കണ്ടെത്തിയില്ല.
                </p>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="glass-rose-head border-b border-[#5C0A0E]/12 text-[11px] font-bold uppercase tracking-wider text-[#7A2E33]">
                    <tr>
                      <th className="py-3 px-4 w-20">Rank</th>
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4">Sector</th>
                      <th className="py-3 px-4 text-right">Orders</th>
                      <th className="py-3 px-4 text-right w-40">
                        Quantity (L)
                      </th>
                      <th className="py-3 px-4 w-48">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#5C0A0E]/10 text-sm">
                    {filteredUnits.map((unit) => {
                      const globalRank =
                        units.findIndex((u) => u.id === unit.id) + 1;
                      const liters = Number(unit.total_liters) || 0;
                      const pct = Math.min(
                        100,
                        Math.round((liters / maxUnitLiters) * 100)
                      );
                      return (
                        <tr
                          key={unit.id}
                          className="hover:bg-white/60 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <span
                              className={`w-7 h-7 rounded-lg text-xs font-extrabold num inline-flex items-center justify-center ${rankBadgeClass(
                                globalRank
                              )}`}
                            >
                              {globalRank}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-[#2B0406]">
                            {unit.name}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-[#4A070A]">
                            <span className="inline-block px-2 py-0.5 rounded-lg bg-white/70 backdrop-blur-md border border-[#5C0A0E]/12">
                              {unit.sector_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-[#4A070A] num bg-[#5C0A0E]/[0.02]">
                            {unit.total_orders}
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-[#5C0A0E] num bg-[#5C0A0E]/[0.03]">
                            {formatQuantity(liters)} L
                          </td>
                          <td className="py-3 px-4">
                            <div className="h-2 w-full rounded-full bg-[#5C0A0E]/[0.08] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#C40E16] to-[#5C0A0E]"
                                style={{
                                  width: `${liters > 0 ? Math.max(5, pct) : 0}%`,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default PublicLeaderboardDesktop;
