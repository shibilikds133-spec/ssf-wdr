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
import { formatCurrency, formatQuantity } from '../../utils/format';
import { BrandText } from '../BrandText';
import { PageDocsButton } from '../docs/PageDocsButton';
import { PaginationBar } from '../PaginationBar';
import { SelectDropdown } from '../SelectDropdown';
import { SsfLogo } from '../SsfLogo';

interface OpenPublicOrderDesktopProps {
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

const DesktopSectorRow = memo(function DesktopSectorRow({
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
    <tr className="hover:bg-white/60 transition-colors">
      <td className="py-3 px-4">
        <span
          className={`w-7 h-7 rounded-lg text-xs font-extrabold num inline-flex items-center justify-center ${rankBadgeClass(
            rank
          )}`}
        >
          {rank}
        </span>
      </td>
      <td className="py-3 px-4 font-bold text-[#1E2038]">
        <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[#EEEBDA] border border-[#282B4A]/12">
          {sec.name}
        </span>
      </td>
      <td className="py-3 px-4 text-right text-xs font-medium text-[#5A5E7D] num">
        {sec.active_units_count}/{sec.total_units_count}
      </td>
      <td className="py-3 px-4 text-right font-semibold text-[#282B4A] num">
        {sec.total_orders}
      </td>
      <td className="py-3 px-4 text-right font-extrabold text-[#1E2038] num">
        {formatQuantity(liters)} L
      </td>
      <td className="py-3 px-4">
        <div className="h-2 w-full rounded-full bg-[#282B4A]/[0.10] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#282B4A]"
            style={{ width: `${liters > 0 ? Math.max(1.5, pct) : 0}%` }}
          />
        </div>
      </td>
    </tr>
  );
});

const DesktopUnitRow = memo(function DesktopUnitRow({
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
    <tr className="hover:bg-white/60 transition-colors">
      <td className="py-3 px-4">
        <span
          className={`w-7 h-7 rounded-lg text-xs font-extrabold num inline-flex items-center justify-center ${rankBadgeClass(
            globalRank
          )}`}
        >
          {globalRank}
        </span>
      </td>
      <td className="py-3 px-4 font-bold text-[#1E2038]">{unit.name}</td>
      <td className="py-3 px-4 text-xs font-semibold text-[#5A5E7D]">
        {unit.sector_name}
      </td>
      <td className="py-3 px-4 text-right font-semibold text-[#282B4A] num">
        {unit.total_orders}
      </td>
      <td className="py-3 px-4 text-right font-extrabold text-[#1E2038] num">
        {formatQuantity(liters)} L
      </td>
      <td className="py-3 px-4">
        <div className="h-2 w-full rounded-full bg-[#282B4A]/[0.10] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#282B4A]"
            style={{ width: `${liters > 0 ? Math.max(1.5, pct) : 0}%` }}
          />
        </div>
      </td>
    </tr>
  );
});

export function OpenPublicOrderDesktop({
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
}: OpenPublicOrderDesktopProps) {
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
      <header className="shrink-0 w-full glass-order-header pt-[env(safe-area-inset-top,0px)] [scrollbar-gutter:stable]">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <SsfLogo className="h-6 w-auto shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <BrandText
                text="SSF Wandoor"
                ssfClassName="text-[#1E2038] text-lg"
                className="font-bold text-[#282B4A] text-base truncate"
              />
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#EEEBDA] border border-[#282B4A]/15 text-xs font-bold text-[#1E2038]">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                Live Open Order
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onLangToggle}
              className="h-9 px-3 rounded-full bg-[#EEEBDA] border border-[#282B4A]/18 text-[#1E2038] text-xs font-extrabold hover:bg-[#282B4A]/10 transition-colors"
            >
              {lang === 'ml' ? 'English' : 'മലയാളം'}
            </button>
            <PageDocsButton theme="order" labelBreakpoint="xl" />
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh leaderboard"
              className="h-9 w-9 rounded-full bg-[#F8F7F0]/95 border border-[#282B4A]/18 text-[#282B4A] flex items-center justify-center hover:bg-white transition-colors disabled:opacity-60 shadow-xs"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Main 2-Column Dashboard */}
      <main
        ref={mainRef}
        className="flex-1 min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="max-w-[1360px] mx-auto px-6 py-6 grid grid-cols-12 gap-6 items-start">
          {/* Left 8 Columns: Progress Hero + Interactive Live Leaderboard */}
          <div className="col-span-8 space-y-5">
            {/* Hero Progress Card */}
            <section className="rounded-3xl bg-[#282B4A] text-[#F8F7F0] p-6 shadow-md border border-[#383C63]/40 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#EEEBDA]/80 font-bold">
                    {lang === 'ml'
                      ? 'ഡിവിഷൻ ലൈവ് പുരോഗതി • SSF വണ്ടൂർ'
                      : 'Division Live Progress • SSF Wandoor'}
                  </p>
                  <p className="text-4xl font-extrabold num mt-1">
                    {formatQuantity(summary.total_liters)} L
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EEEBDA]/15 border border-[#EEEBDA]/25 text-sm font-bold num">
                    <Trophy className="w-4 h-4 text-[#EEEBDA]" />
                    {progressPct}%
                  </span>
                  <p className="text-xs text-[#EEEBDA]/80 num mt-1.5">
                    Target: {formatQuantity(summary.division_limit)} L •{' '}
                    {summary.total_orders} orders
                  </p>
                </div>
              </div>

              <div className="h-2.5 w-full rounded-full bg-[#1E2038] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#EEEBDA]"
                  style={{ width: `${Math.max(1.5, progressPct)}%` }}
                />
              </div>
            </section>

            {/* Leaderboard Card */}
            <section className="rounded-3xl glass-order-card overflow-hidden">
              <div className="p-4 border-b border-[#282B4A]/12 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-full p-1 bg-[#EEEBDA] border border-[#282B4A]/14">
                  <button
                    type="button"
                    onClick={() => setActiveTab('SECTORS')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
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
                    className={`px-4 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                      activeTab === 'UNITS'
                        ? 'bg-[#282B4A] text-[#F8F7F0]'
                        : 'text-[#282B4A] hover:text-[#1E2038]'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Units</span>
                  </button>
                </div>

                {activeTab === 'UNITS' && (
                  <div className="flex items-center gap-2">
                    <div className="relative w-56">
                      <Search className="w-4 h-4 text-[#5A5E7D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={unitSearch}
                        onChange={(e) => onUnitSearchChange(e.target.value)}
                        placeholder="Search unit or sector..."
                        className="w-full h-9 pl-9 pr-8 rounded-full bg-white/90 border border-[#282B4A]/16 text-xs text-[#1E2038] placeholder:text-[#5A5E7D]/60 focus:outline-none focus:ring-2 focus:ring-[#282B4A]/20"
                      />
                      {unitsFetching && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#282B4A] absolute right-3 top-1/2 -translate-y-1/2" />
                      )}
                    </div>
                    <div className="w-44">
                      <SelectDropdown
                        value={sectorFilter}
                        onChange={onSectorFilterChange}
                        options={sectorOptions}
                        ariaLabel="Filter units by sector"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#282B4A]/12 text-[11px] uppercase tracking-wider text-[#5A5E7D] bg-[#EEEBDA]/50">
                      <th className="py-2.5 px-4 font-bold">Rank</th>
                      <th className="py-2.5 px-4 font-bold">
                        {activeTab === 'SECTORS' ? 'Sector' : 'Unit'}
                      </th>
                      <th className="py-2.5 px-4 font-bold text-right">
                        {activeTab === 'SECTORS' ? 'Active Units' : 'Sector'}
                      </th>
                      <th className="py-2.5 px-4 font-bold text-right">Orders</th>
                      <th className="py-2.5 px-4 font-bold text-right">Liters</th>
                      <th className="py-2.5 px-4 font-bold w-36">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#282B4A]/10">
                    {activeTab === 'SECTORS'
                      ? sectors.map((sec, idx) => (
                          <DesktopSectorRow
                            key={sec.id}
                            sec={sec}
                            rank={idx + 1}
                            maxSectorLiters={maxSectorLiters}
                          />
                        ))
                      : units.map((u, idx) => (
                          <DesktopUnitRow
                            key={u.id}
                            unit={u}
                            globalRank={
                              u.global_rank ??
                              (currentUnitPage - 1) * pageSize + idx + 1
                            }
                            maxUnitLiters={maxUnitLiters}
                          />
                        ))}
                  </tbody>
                </table>
              </div>

              {activeTab === 'UNITS' && totalUnitPages > 1 && (
                <div className="p-4 border-t border-[#282B4A]/10">
                  <PaginationBar
                    page={currentUnitPage}
                    totalPages={totalUnitPages}
                    totalCount={totalUnitItems}
                    pageSize={pageSize}
                    onPageChange={handleUnitPageChange}
                    isDesktop
                    locale={lang}
                    theme="public"
                  />
                </div>
              )}
            </section>
          </div>

          {/* Right 4 Columns: Sticky Poster + Prominent Place Order CTA */}
          <aside className="col-span-4 sticky top-6 space-y-4">
            <div className="rounded-3xl overflow-hidden border border-[#282B4A]/16 bg-[#282B4A] shadow-md">
              <div className="w-full aspect-[1200/531] overflow-hidden">
                <picture>
                  <source
                    srcSet="/poster-banner-sm.webp 720w, /poster-banner.webp 1200w"
                    sizes="420px"
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

            <div className="rounded-3xl glass-order-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#5A5E7D]">
                  Open Order Portal
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#EEEBDA] border border-[#282B4A]/15 text-xs font-extrabold text-[#1E2038] num">
                  {formatCurrency(summary.per_liter_rate)} / L
                </span>
              </div>
              <h2 className="text-lg font-extrabold text-[#1E2038] font-ml">
                {lang === 'ml'
                  ? 'ഓർഡർ കോഡ് ഇല്ലാതെ പായസം ഓർഡർ ചെയ്യാം'
                  : 'Order Payasam Without an Order Code'}
              </h2>
              <p className="text-xs text-[#5A5E7D] leading-relaxed font-ml">
                {lang === 'ml'
                  ? 'പേര്, മൊബൈൽ നമ്പർ, ആവശ്യമുള്ള ലിറ്റർ എന്നിവ നൽകി ഓർഡർ സമർപ്പിക്കാം. ഡിവിഷൻ കമ്മിറ്റി ഉടൻ ഉറപ്പാക്കുന്നതാണ്.'
                  : 'Submit your order with just your name, mobile number, and quantity. Unit selection is optional.'}
              </p>
              <button
                type="button"
                onClick={onOpenPlaceOrder}
                className="w-full h-12 rounded-2xl bg-[#282B4A] hover:bg-[#1E2038] text-[#F8F7F0] text-sm font-extrabold inline-flex items-center justify-center gap-2 shadow-md transition-colors font-ml"
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>+ Place Order / ഓർഡർ നൽകുക</span>
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
