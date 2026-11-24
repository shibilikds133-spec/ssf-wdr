import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  Award,
  Loader2,
  PlusCircle,
  RefreshCw,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import type {
  PublicLeaderboardResponse,
  PublicLeaderboardSector,
  PublicLeaderboardUnit,
} from '../../types';
import { formatQuantity } from '../../utils/format';
import { BrandText } from '../BrandText';
import { PageDocsButton } from '../docs/PageDocsButton';
import { PaginationBar } from '../PaginationBar';
import { SelectDropdown } from '../SelectDropdown';
import { SsfLogo } from '../SsfLogo';

interface OpenPublicOrderMobileProps {
  data: PublicLeaderboardResponse;
  refreshing: boolean;
  unitsFetching?: boolean;
  lang: 'ml' | 'en';
  onLangToggle: () => void;
  unitSearch: string;
  onUnitSearchChange: (nextSearch: string) => void;
  sectorFilter: string;
  onSectorFilterChange: (nextSector: string) => void;
  unitPage: number;
  onUnitPageChange: (nextPage: number) => void;
  onRefresh: () => void;
  onOpenPlaceOrder: () => void;
}

type LeaderboardTab = 'SECTORS' | 'UNITS';

function rankBadgeClass(rank: number): string {
  if (rank === 1) {
    return 'bg-[#282B4A] text-[#F8F7F0] border border-[#1E2038] shadow-xs';
  }
  if (rank === 2) {
    return 'bg-[#383C63]/18 text-[#1E2038] border border-[#282B4A]/25';
  }
  if (rank === 3) {
    return 'bg-[#EEEBDA] text-[#1E2038] border border-[#282B4A]/20';
  }
  return 'bg-[#282B4A]/[0.07] text-[#282B4A] border border-[#282B4A]/12';
}

const MobileSectorCard = memo(function MobileSectorCard({
  sec,
  rank,
  maxSectorLiters,
}: {
  sec: PublicLeaderboardSector;
  rank: number;
  maxSectorLiters: number;
}) {
  const liters = Number(sec.total_liters) || 0;
  const pct = Math.min(100, (liters / maxSectorLiters) * 100);
  return (
    <div className="rounded-2xl glass-order-card p-3 space-y-2">
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
            <span className="inline-block max-w-full px-2 py-0.5 rounded-lg bg-[#EEEBDA] border border-[#282B4A]/12 text-xs sm:text-sm font-bold text-[#1E2038] truncate">
              {sec.name}
            </span>
            <p className="text-[11px] text-[#5A5E7D] num mt-0.5">
              {sec.active_units_count}/{sec.total_units_count} active units •{' '}
              {sec.total_orders} orders
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-extrabold text-[#1E2038] num">
            {formatQuantity(liters)} L
          </p>
        </div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-[#282B4A]/[0.10] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#282B4A]"
          style={{ width: `${liters > 0 ? Math.max(1.5, pct) : 0}%` }}
        />
      </div>
    </div>
  );
});

const MobileUnitCard = memo(function MobileUnitCard({
  unit,
  globalRank,
  maxUnitLiters,
}: {
  unit: PublicLeaderboardUnit;
  globalRank: number;
  maxUnitLiters: number;
}) {
  const liters = Number(unit.total_liters) || 0;
  const pct = Math.min(100, (liters / maxUnitLiters) * 100);
  return (
    <div className="rounded-2xl glass-order-card p-3 flex items-center justify-between gap-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-7 h-7 rounded-xl text-xs font-extrabold num inline-flex items-center justify-center shrink-0 ${rankBadgeClass(
            globalRank
          )}`}
        >
          {globalRank}
        </span>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-bold text-[#1E2038] truncate">
            {unit.name}
          </p>
          <p className="text-[11px] text-[#5A5E7D] truncate">
            {unit.sector_name} • {unit.total_orders} orders
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-extrabold text-[#1E2038] num">
          {formatQuantity(liters)} L
        </p>
        <div className="w-16 h-1 rounded-full bg-[#282B4A]/[0.10] overflow-hidden mt-1 ml-auto">
          <div
            className="h-full rounded-full bg-[#282B4A]"
            style={{ width: `${liters > 0 ? Math.max(2, pct) : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
});

export function OpenPublicOrderMobile({
  data,
  refreshing,
  unitsFetching = false,
  lang,
  onLangToggle,
  unitSearch,
  onUnitSearchChange,
  sectorFilter,
  onSectorFilterChange,
  unitPage,
  onUnitPageChange,
  onRefresh,
  onOpenPlaceOrder,
}: OpenPublicOrderMobileProps) {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('SECTORS');
  const mainRef = useRef<HTMLElement | null>(null);
  const { summary, sectors } = data;
  const units = data.items ?? data.units ?? [];
  const totalUnitPages = data.total_pages ?? 1;
  const totalUnitItems = data.total_count ?? units.length;
  const currentUnitPage = data.current_page ?? data.page ?? unitPage;
  const pageSize = data.page_size ?? 10;

  const maxSectorLiters = useMemo(() => {
    const top = sectors[0]?.total_liters ?? 0;
    return top > 0 ? top : 1;
  }, [sectors]);

  const maxUnitLiters = useMemo(() => {
    if (data.max_unit_liters && data.max_unit_liters > 0) {
      return data.max_unit_liters;
    }
    const top = units[0]?.total_liters ?? 0;
    return top > 0 ? top : 1;
  }, [data.max_unit_liters, units]);

  const sectorOptions = useMemo(
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

  const handleUnitPageChange = useCallback(
    (nextPage: number) => {
      onUnitPageChange(nextPage);
      mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [onUnitPageChange]
  );

  const progressPct = Math.min(100, Math.max(0, Number(summary.percent_complete) || 0));

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-transparent text-[#282B4A]">
      {/* Top Header — NO Login Button */}
      <header className="shrink-0 z-30 glass-order-header pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] transform-gpu">
        <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SsfLogo className="h-5 w-auto shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
              <BrandText
                text="SSF Wandoor"
                ssfClassName="text-[#1E2038] text-lg"
                className="text-[#282B4A] font-bold text-base truncate"
              />
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EEEBDA] border border-[#282B4A]/15 text-[10px] font-bold text-[#1E2038] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Live
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onLangToggle}
              className="h-9 px-2.5 rounded-full bg-[#EEEBDA] border border-[#282B4A]/18 text-[#1E2038] text-[11px] font-extrabold hover:bg-[#282B4A]/10 transition-colors"
              aria-label="Toggle language"
            >
              {lang === 'ml' ? 'EN' : 'മലയാളം'}
            </button>
            <PageDocsButton theme="order" labelBreakpoint="sm" />
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh leaderboard"
              className="w-9 h-9 rounded-full bg-[#F8F7F0]/95 border border-[#282B4A]/18 text-[#282B4A] flex items-center justify-center hover:bg-white transition-colors disabled:opacity-60 shadow-xs"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main
        ref={mainRef}
        className="flex-1 min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] max-w-3xl mx-auto space-y-4">
          {/* Reduced Campaign Poster Window */}
          <div className="rounded-2xl overflow-hidden border border-[#282B4A]/16 bg-[#282B4A] shadow-sm">
            <div className="w-full aspect-[1200/531] overflow-hidden">
              <picture>
                <source
                  srcSet="/poster-banner-sm.webp 720w, /poster-banner.webp 1200w"
                  sizes="(max-width: 768px) 100vw, 768px"
                  type="image/webp"
                />
                <img
                  src="/poster-banner.jpg"
                  alt="SSF വണ്ടൂർ ഡിവിഷൻ പാലട പായസം ചലഞ്ച് പോസ്റ്റർ"
                  width={1200}
                  height={531}
                  decoding="async"
                  fetchPriority="high"
                  className="w-full h-full object-cover select-none"
                />
              </picture>
            </div>
          </div>

          {/* Live Division Progress Hero Card */}
          <section className="rounded-3xl bg-[#282B4A] text-[#F8F7F0] p-4 sm:p-5 shadow-md border border-[#383C63]/40 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#EEEBDA]/80 font-bold">
                  {lang === 'ml'
                    ? 'ഡിവിഷൻ ലൈവ് പുരോഗതി'
                    : 'Division Live Progress'}
                </p>
                <p className="text-2xl sm:text-3xl font-extrabold num mt-0.5">
                  {formatQuantity(summary.total_liters)} L
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EEEBDA]/15 border border-[#EEEBDA]/25 text-xs font-bold num">
                  <Trophy className="w-3.5 h-3.5 text-[#EEEBDA]" />
                  {progressPct}%
                </span>
                <p className="text-[11px] text-[#EEEBDA]/80 num mt-1">
                  Target: {formatQuantity(summary.division_limit)} L
                </p>
              </div>
            </div>

            <div className="h-2 w-full rounded-full bg-[#1E2038] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#EEEBDA]"
                style={{ width: `${Math.max(1.5, progressPct)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-[#EEEBDA]/90 pt-0.5">
              <span className="num font-semibold">
                {summary.total_orders} confirmed orders
              </span>
              <button
                type="button"
                onClick={onOpenPlaceOrder}
                className="px-3 py-1 rounded-full bg-[#EEEBDA] text-[#1E2038] text-xs font-extrabold hover:bg-white transition-colors font-ml"
              >
                + ഓർഡർ നൽകുക
              </button>
            </div>
          </section>

          {/* Interactive Live Leaderboard */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-full p-1 bg-[#EEEBDA] border border-[#282B4A]/14">
                <button
                  type="button"
                  onClick={() => setActiveTab('SECTORS')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                    activeTab === 'SECTORS'
                      ? 'bg-[#282B4A] text-[#F8F7F0]'
                      : 'text-[#282B4A] hover:text-[#1E2038]'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Sectors ({sectors.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('UNITS')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                    activeTab === 'UNITS'
                      ? 'bg-[#282B4A] text-[#F8F7F0]'
                      : 'text-[#282B4A] hover:text-[#1E2038]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Units</span>
                </button>
              </div>
            </div>

            {activeTab === 'SECTORS' ? (
              <div className="space-y-2.5">
                {sectors.map((sec, idx) => (
                  <MobileSectorCard
                    key={sec.id}
                    sec={sec}
                    rank={idx + 1}
                    maxSectorLiters={maxSectorLiters}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#5A5E7D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={unitSearch}
                      onChange={(e) => onUnitSearchChange(e.target.value)}
                      placeholder="Search unit or sector..."
                      className="w-full h-10 pl-9 pr-8 rounded-2xl bg-white/90 border border-[#282B4A]/16 text-xs text-[#1E2038] placeholder:text-[#5A5E7D]/60 focus:outline-none focus:ring-2 focus:ring-[#282B4A]/20"
                    />
                    {unitsFetching && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#282B4A] absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                  <SelectDropdown
                    value={sectorFilter}
                    onChange={onSectorFilterChange}
                    options={sectorOptions}
                    ariaLabel="Filter units by sector"
                  />
                </div>

                {units.length === 0 ? (
                  <div className="rounded-2xl glass-order-card p-6 text-center text-xs text-[#5A5E7D]">
                    No units found matching your search.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {units.map((u, idx) => (
                      <MobileUnitCard
                        key={u.id}
                        unit={u}
                        globalRank={
                          u.global_rank ??
                          (currentUnitPage - 1) * pageSize + idx + 1
                        }
                        maxUnitLiters={maxUnitLiters}
                      />
                    ))}
                  </div>
                )}

                {totalUnitPages > 1 && (
                  <PaginationBar
                    page={currentUnitPage}
                    totalPages={totalUnitPages}
                    totalCount={totalUnitItems}
                    pageSize={pageSize}
                    onPageChange={handleUnitPageChange}
                    isDesktop={false}
                    locale={lang}
                    theme="public"
                  />
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Single-Button Edge-to-Edge Bottom Navigation Bar */}
      <nav
        aria-label="Place Order Navigation"
        className="fixed bottom-0 inset-x-0 z-40 bg-[#F8F7F0]/95 backdrop-blur-md border-t border-[#282B4A]/14 pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] transform-gpu"
      >
        <div className="h-16 px-4 max-w-md mx-auto flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenPlaceOrder}
            className="w-full h-11 rounded-full bg-[#282B4A] hover:bg-[#1E2038] text-[#F8F7F0] text-sm font-extrabold inline-flex items-center justify-center gap-2 shadow-md transition-colors font-ml"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>+ ഓർഡർ നൽകുക / Place Order</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
