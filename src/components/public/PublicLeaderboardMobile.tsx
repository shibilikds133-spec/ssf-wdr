import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  Lock,
  LogIn,
  PlusCircle,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import type { PublicLeaderboardResponse } from '../../types';
import { formatQuantity } from '../../utils/format';
import { BrandText } from '../BrandText';
import { PageDocsButton } from '../docs/PageDocsButton';
import { SelectDropdown } from '../SelectDropdown';
import { SsfLogo } from '../SsfLogo';
import { PublicDivisionProgressCard } from './PublicDivisionProgressCard';
import { PublicPosterWindow } from './PublicPosterWindow';

interface PublicLeaderboardMobileProps {
  data: PublicLeaderboardResponse;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenQuickEntry: () => void;
}

type LeaderboardTab = 'SECTORS' | 'UNITS';

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

export function PublicLeaderboardMobile({
  data,
  refreshing,
  onRefresh,
  onOpenQuickEntry,
}: PublicLeaderboardMobileProps) {
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

  const progressPct = Math.min(100, Math.max(0, Number(summary.percent_complete) || 0));

  return (
    <div className="min-h-dvh public-theme-bg flex flex-col">
      {/* Compact Sticky Edge-to-Edge Top Header */}
      <header className="sticky top-0 z-30 glass-rose-header pt-[env(safe-area-inset-top)]">
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SsfLogo className="h-6 w-auto shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <BrandText
                  text="SSF Wandoor"
                  className="text-sm font-bold text-[#2B0406] truncate"
                />
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-800 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C40E16] animate-pulse" />
                  Live
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh leaderboard"
              className="w-9 h-9 rounded-full bg-[#FFF8F6]/[0.92] backdrop-blur-xl border border-[#5C0A0E]/[0.18] text-[#5C0A0E] inline-flex items-center justify-center hover:bg-white transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>

            <button
              type="button"
              onClick={() => navigate('/login')}
              className="h-9 px-3 rounded-full glass-crimson text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-opacity"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span>Login</span>
            </button>

            <PageDocsButton theme="public" pageKey="public_leaderboard" />
          </div>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="flex-1 px-3 pt-2.5 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] space-y-3">
        {/* Slot 1: Top Promotional Poster Window (Contact Removed) */}
        <PublicPosterWindow />

        {/* Slot 2: Live Division Status & Semi-Circle Gauge Hero Card */}
        <PublicDivisionProgressCard
          totalLiters={Number(summary.total_liters) || 0}
          totalOrders={summary.total_orders}
          divisionLimit={Number(summary.division_limit) || 1000}
          percentComplete={progressPct}
          upiPercent={Number(summary.upi_percent) || 0}
          cashPercent={Number(summary.cash_percent) || 0}
          ordersOpen={Boolean(summary.orders_open)}
          topSectors={sectors.slice(0, 5)}
          onQuickEntry={onOpenQuickEntry}
        />

        {/* Slot 3: Interactive Live Leaderboard Tabs (Sectors | Top Units) */}
        <section
          aria-label="Live Rankings"
          className="glass-rose-card rounded-3xl p-3 space-y-2.5"
        >
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl glass-rose-pill">
            <button
              type="button"
              onClick={() => setActiveTab('SECTORS')}
              className={`py-2 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
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
              className={`py-2 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'UNITS'
                  ? 'glass-crimson text-white shadow-sm'
                  : 'text-[#4A070A] hover:bg-white/60'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Top Units ({units.length})</span>
            </button>
          </div>

          {activeTab === 'SECTORS' ? (
            <div className="space-y-2.5">
              {sectors.map((sec, idx) => {
                const rank = idx + 1;
                const liters = Number(sec.total_liters) || 0;
                const pct = Math.min(
                  100,
                  Math.round((liters / maxSectorLiters) * 100)
                );
                return (
                  <div
                    key={sec.id}
                    className="rounded-2xl bg-white/70 backdrop-blur-xl border border-[#5C0A0E]/15 p-3 space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_14px_-6px_rgba(92,10,14,0.08)]"
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-xl text-xs font-extrabold num inline-flex items-center justify-center shrink-0 ${rankBadgeClass(
                            rank
                          )}`}
                        >
                          {rank}
                        </span>
                        <div className="min-w-0">
                          <span className="inline-block max-w-full px-2 py-0.5 rounded-lg bg-[#5C0A0E]/[0.06] backdrop-blur-md border border-[#5C0A0E]/12 text-xs sm:text-sm font-bold text-[#2B0406] truncate">
                            {sec.name}
                          </span>
                          <p className="text-[11px] text-[#7A2E33] num mt-0.5">
                            {sec.active_units_count}/{sec.total_units_count}{' '}
                            active units • {sec.total_orders} orders
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold text-[#5C0A0E] num">
                          {formatQuantity(liters)} L
                        </p>
                      </div>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-[#5C0A0E]/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#C40E16] to-[#5C0A0E]"
                        style={{ width: `${liters > 0 ? Math.max(4, pct) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Unit Search & Sector Filter */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#7A2E33]/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={unitSearch}
                    onChange={(e) => setUnitSearch(e.target.value)}
                    placeholder="യൂണിറ്റ് അല്ലെങ്കിൽ സെക്ടർ തിരയുക..."
                    className="w-full pl-8 pr-3 py-2 text-xs font-ml rounded-xl border border-[#5C0A0E]/18 bg-white/95 text-[#2B0406] placeholder:text-[#7A2E33]/50 focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                  />
                </div>
                <SelectDropdown
                  value={sectorFilter}
                  onChange={setSectorFilter}
                  options={sectorFilterOptions}
                  ariaLabel="Filter units by sector"
                />
              </div>

              {filteredUnits.length === 0 ? (
                <p className="font-ml text-xs text-center text-[#7A2E33] py-6">
                  തിരയുന്ന പേരിൽ യൂണിറ്റുകളൊന്നും കണ്ടെത്തിയില്ല.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredUnits.map((unit) => {
                    const globalRank =
                      units.findIndex((u) => u.id === unit.id) + 1;
                    const liters = Number(unit.total_liters) || 0;
                    const pct = Math.min(
                      100,
                      Math.round((liters / maxUnitLiters) * 100)
                    );
                    return (
                      <div
                        key={unit.id}
                        className="rounded-2xl bg-white/70 backdrop-blur-xl border border-[#5C0A0E]/15 p-3 flex items-center justify-between gap-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_14px_-6px_rgba(92,10,14,0.08)]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-7 h-7 rounded-xl text-xs font-extrabold num inline-flex items-center justify-center shrink-0 ${rankBadgeClass(
                              globalRank
                            )}`}
                          >
                            {globalRank}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#2B0406] truncate">
                              {unit.name}
                            </p>
                            <p className="text-[11px] text-[#7A2E33] truncate num">
                              <span className="inline-block px-1.5 py-0.2 rounded bg-[#5C0A0E]/[0.06] border border-[#5C0A0E]/10 text-[#4A070A] font-semibold mr-1">
                                {unit.sector_name}
                              </span>
                              • {unit.total_orders} orders
                            </p>
                            <div className="mt-1 h-1 w-24 rounded-full bg-[#5C0A0E]/[0.08] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#C40E16] to-[#5C0A0E]"
                                style={{
                                  width: `${liters > 0 ? Math.max(6, pct) : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <span className="text-sm font-extrabold text-[#5C0A0E] num shrink-0">
                          {formatQuantity(liters)} L
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Edge-to-Edge Bottom Navigation Bar — SINGLE BUTTON ONLY (MANDATORY) */}
      <nav
        aria-label="Quick Entry Navigation"
        className="fixed bottom-0 inset-x-0 z-40 glass-rose-header border-t border-[#5C0A0E]/15 border-b-0 px-4 pt-2.5 pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))]"
      >
        {summary.orders_open ? (
          <button
            type="button"
            onClick={onOpenQuickEntry}
            className="w-full py-3 px-5 rounded-2xl glass-crimson text-white font-ml text-sm font-bold inline-flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-transform"
          >
            <PlusCircle className="w-4 h-4 text-[#FCE36D] shrink-0" />
            <span>ക്വിക്ക് എൻട്രി (Quick Entry)</span>
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="w-full py-3 px-5 rounded-2xl bg-[#5C0A0E]/15 border border-[#5C0A0E]/20 text-[#4A070A] font-ml text-sm font-bold inline-flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <Lock className="w-4 h-4 shrink-0" />
            <span>ഓർഡറുകൾ ക്ലോസ് ചെയ്തു</span>
          </button>
        )}
      </nav>
    </div>
  );
}

export default PublicLeaderboardMobile;
