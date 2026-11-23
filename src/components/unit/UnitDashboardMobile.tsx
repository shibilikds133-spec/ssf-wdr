import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileBarChart2,
  KeyRound,
  ListChecks,
  MessageCircle,
  Plus,
  Search,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { EntryItem, UnitDashboardResponse } from '../../types';
import {
  calcLimitSharePercent,
  formatCurrency,
  formatDateTime,
  formatQuantity,
} from '../../utils/format';
import type { ReportFilterConfig } from '../../utils/reports';
import { buildWhatsAppReceiptUrl } from '../../utils/whatsapp';
import { BrandText } from '../BrandText';
import { PushNotificationSettingsCard } from '../PushNotificationSettingsCard';

interface UnitDashboardMobileProps {
  data: UnitDashboardResponse;
  onOpenQuickOrder: () => void;
  onMarkPaid: (entry: EntryItem) => void;
  onOpenExportModal: (initialConfig?: Partial<ReportFilterConfig>) => void;
}

export function UnitDashboardMobile({
  data,
  onOpenQuickOrder,
  onMarkPaid,
  onOpenExportModal,
}: UnitDashboardMobileProps) {
  const { unit, settings, summary, entries } = data;

  const [chartMode, setChartMode] = useState<'daily' | 'buyers'>('daily');
  const [recentSearch, setRecentSearch] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const totalAmount = Number(summary.total_amount) || 0;
  const totalQuantity = Number(summary.total_quantity) || 0;
  const cashAmount = Number(summary.cash_amount) || 0;
  const upiAmount = Number(summary.upi_amount) || 0;
  const unpaidAmount = Number(summary.unpaid_amount) || 0;
  const unpaidEntries = Number(summary.unpaid_entries) || 0;
  const totalEntries = Number(summary.total_entries) || 0;
  const divisionLimit = Math.max(0, Number(settings.division_target) || 0);

  const divisionSharePercent = calcLimitSharePercent(
    totalQuantity,
    divisionLimit
  );
  const cappedShare = Math.min(100, Math.max(0, divisionSharePercent));

  const paidTotal = cashAmount + upiAmount;
  const cashPercent =
    totalAmount > 0 ? Math.round((cashAmount / totalAmount) * 100) : 0;
  const upiPercent =
    totalAmount > 0 ? Math.round((upiAmount / totalAmount) * 100) : 0;

  const chartItems = useMemo(() => {
    if (chartMode === 'buyers') {
      const buyerMap = new Map<
        string,
        { key: string; name: string; quantity: number; amount: number; orders: number }
      >();
      for (const e of entries) {
        const key = `${e.contributor_name.trim().toLowerCase()}|${e.mobile_number.trim()}`;
        const existing = buyerMap.get(key) ?? {
          key,
          name: e.contributor_name,
          quantity: 0,
          amount: 0,
          orders: 0,
        };
        existing.quantity += Number(e.quantity) || 0;
        existing.amount += Number(e.total_amount) || 0;
        existing.orders += 1;
        buyerMap.set(key, existing);
      }
      return [...buyerMap.values()]
        .sort((a, b) =>
          b.quantity !== a.quantity
            ? b.quantity - a.quantity
            : a.name.localeCompare(b.name)
        )
        .slice(0, 5);
    }

    const dayMap = new Map<
      string,
      { key: string; name: string; quantity: number; amount: number; orders: number }
    >();
    for (const e of entries) {
      const dt = new Date(e.created_at);
      if (Number.isNaN(dt.getTime())) continue;
      const dayKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
      }).format(dt);
      const label = new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(dt);

      const existing = dayMap.get(dayKey) ?? {
        key: dayKey,
        name: label,
        quantity: 0,
        amount: 0,
        orders: 0,
      };
      existing.quantity += Number(e.quantity) || 0;
      existing.amount += Number(e.total_amount) || 0;
      existing.orders += 1;
      dayMap.set(dayKey, existing);
    }

    return [...dayMap.values()]
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 7)
      .reverse();
  }, [chartMode, entries]);

  const filteredRecentEntries = useMemo(() => {
    const q = recentSearch.trim().toLowerCase();
    const matched = q
      ? entries.filter((e) =>
          `${e.contributor_name} ${e.mobile_number}`.toLowerCase().includes(q)
        )
      : entries;
    return matched.slice(0, 5);
  }, [entries, recentSearch]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(unit.login_code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1600);
    } catch {
      // Ignore clipboard error
    }
  };

  const openWhatsAppReceipt = (entry: EntryItem) => {
    const url = buildWhatsAppReceiptUrl({
      contributorName: entry.contributor_name,
      mobileNumber: entry.mobile_number,
      unitName: unit.name,
      quantity: Number(entry.quantity) || 0,
      totalAmount: Number(entry.total_amount) || 0,
      paymentStatus: entry.payment_status,
      paymentMode: entry.payment_mode,
      challengeTitle: settings.challenge_title,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Radial Ring calculation (Unit L / Division Limit)
  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - cappedShare / 100);

  return (
    <div className="space-y-3.5 md:space-y-4">
      {/* Global Lock Banner (Conditional) */}
      {!settings.is_challenge_open && (
        <div
          role="alert"
          className="glass-cream-card rounded-2xl px-3.5 py-2.5 border border-vibrant-coral/40 bg-rose-50/85 flex items-start gap-2.5 text-xs text-rose-900 font-medium"
        >
          <AlertTriangle className="w-4 h-4 text-vibrant-coral shrink-0 mt-0.5" />
          <span>
            Orders are currently closed by Division Admin. You can still view
            orders, mark Unpaid orders as Paid, and export your delivery sheet.
          </span>
        </div>
      )}

      {/* 1. TOP SECTION: Hero Overview Card & Collections Split (Mirrors Sector Mobile 1:1) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 md:gap-4">
        {/* CARD 1: Unit Hero */}
        <div className="md:col-span-6 glass-orange rounded-2xl p-4 text-white flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-bold text-white leading-snug truncate">
                <BrandText text={unit.name} />
              </h1>
              <p className="text-[11px] text-white/90 font-medium truncate">
                {unit.sector_name}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 text-xs font-bold">
              <span className="text-white font-bold num">
                ₹{formatQuantity(Number(settings.unit_rate) || 0)}/L
              </span>
              <span className="text-white/50">·</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  settings.is_challenge_open
                    ? 'glass-dark-pill text-white'
                    : 'glass-dark-pill text-rose-200'
                }`}
              >
                {settings.is_challenge_open ? 'Orders Open' : 'Orders Closed'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase tracking-wider text-white/85 block font-semibold">
                Unit Ordered
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold num text-white tracking-tight leading-none mt-0.5">
                {formatQuantity(totalQuantity)} L
              </div>
              <div className="text-lg sm:text-xl font-bold num text-white/95 mt-0.5">
                {formatCurrency(totalAmount)}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/95 font-medium num">
                <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                <span>
                  {totalEntries} orders · {unpaidEntries} unpaid
                </span>
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-dark-pill text-white font-bold text-[11px] num">
                <span>
                  {divisionSharePercent.toFixed(1)}% of{' '}
                  {formatQuantity(divisionLimit)} L limit
                </span>
              </div>
            </div>

            {/* Circular Donut Ring Gauge */}
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
                    stroke="rgba(20, 16, 14, 0.2)"
                    strokeWidth="6.5"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={ringRadius}
                    fill="none"
                    stroke="#14100E"
                    strokeWidth="6.5"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringDashOffset}
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1 pointer-events-none select-none">
                  <span className="text-sm sm:text-base font-black num text-glass-black leading-tight">
                    {divisionSharePercent.toFixed(1)}%
                  </span>
                  <span className="text-[8px] uppercase tracking-wider text-white/95 font-bold mt-0.5">
                    Div Limit
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Collections & 3-Way Payment Split */}
        <div className="md:col-span-6 glass-cream-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-vibrant-teal text-white flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm font-bold text-[#261812] block leading-tight">
                  Payment Split
                </span>
                <span className="text-[10px] text-[#6B5449] num">
                  Paid: {formatCurrency(paidTotal)} · {unpaidEntries} Unpaid
                </span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-vibrant-teal bg-vibrant-tealSoft">
              Live
            </span>
          </div>

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
            <div className="h-3 rounded-full bg-[#F1ECE0] overflow-hidden flex border border-[#E5DEC9] p-0.5">
              <div
                className="h-full bg-vibrant-amber rounded-l-full transition-all duration-300"
                style={{ width: `${cashPercent}%` }}
              />
              <div
                className="h-full bg-vibrant-teal rounded-r-full transition-all duration-300"
                style={{ width: `${upiPercent}%` }}
              />
            </div>
          </div>

          {/* Nested Inner Cards (Distinct Warm Surface) */}
          <div className="grid grid-cols-3 gap-2">
            <div className="unit-inner-card rounded-xl p-2.5 border-l-3 border-l-vibrant-amber">
              <span className="text-[10px] uppercase font-semibold text-[#6B5449] block">
                Cash
              </span>
              <span className="text-sm font-bold text-[#261812] num block mt-0.5 truncate">
                {formatCurrency(cashAmount)}
              </span>
            </div>
            <div className="unit-inner-card rounded-xl p-2.5 border-l-3 border-l-vibrant-teal">
              <span className="text-[10px] uppercase font-semibold text-[#6B5449] block">
                UPI
              </span>
              <span className="text-sm font-bold text-[#261812] num block mt-0.5 truncate">
                {formatCurrency(upiAmount)}
              </span>
            </div>
            <div className="unit-inner-card rounded-xl p-2.5 border-l-3 border-l-vibrant-coral">
              <span className="text-[10px] uppercase font-semibold text-[#6B5449] block">
                Unpaid
              </span>
              <span className="text-sm font-bold text-vibrant-coral num block mt-0.5 truncate">
                {formatCurrency(unpaidAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. COMPACT 2-SQUARE ROW: Public Order Code Box + Quick Actions Box */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-cream-card rounded-2xl p-3.5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="w-7 h-7 rounded-lg bg-[#FFF1EA] border border-[#F8CBB6] flex items-center justify-center text-[#D44B1A] shrink-0">
              <KeyRound className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5449]">
              Order Code
            </span>
          </div>
          <div>
            <div className="text-lg font-extrabold font-mono text-[#261812] tracking-wider num">
              {unit.login_code}
            </div>
            <p className="text-[10px] text-[#6B5449] leading-tight mt-0.5">
              For public page orders
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyCode()}
            className="unit-inner-card hover:bg-white text-[#261812] rounded-xl py-1.5 px-3 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors w-full"
          >
            {codeCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-vibrant-teal" />
                <span className="text-vibrant-teal">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        <div className="glass-cream-card rounded-2xl p-3.5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="w-7 h-7 rounded-lg glass-orange text-white flex items-center justify-center shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5449]">
              Quick Tools
            </span>
          </div>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onOpenQuickOrder}
              disabled={!settings.is_challenge_open}
              className="w-full glass-orange text-white rounded-xl py-1.5 px-3 text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-45"
            >
              <Plus className="w-3.5 h-3.5" />
              Quick Order
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenExportModal({
                  scope: 'THIS_UNIT',
                  template: 'DELIVERY_SHEET',
                })
              }
              className="w-full unit-inner-card hover:bg-white text-[#261812] rounded-xl py-1.5 px-3 text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* 3. CARD 3: Daily Liters | Top Buyers Chart */}
      <div className="glass-cream-card rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg glass-orange flex items-center justify-center text-white shrink-0 shadow-xs">
              <TrendingUp className="w-3.5 h-3.5 text-white" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-[#261812] leading-tight">
                {chartMode === 'daily' ? 'Daily Liters' : 'Top Buyers'}
              </h2>
              <p className="text-[10px] text-[#6B5449] truncate">
                {chartMode === 'daily'
                  ? 'Volume trend by day'
                  : `Top contributors in ${unit.name}`}
              </p>
            </div>
          </div>

          <div className="glass-cream-pill p-0.5 rounded-full inline-flex text-[11px] shrink-0">
            <button
              type="button"
              onClick={() => setChartMode('daily')}
              className={`px-2.5 py-1 rounded-full font-semibold transition-colors ${
                chartMode === 'daily'
                  ? 'glass-orange text-white shadow-xs'
                  : 'text-[#6B5449] hover:text-[#261812]'
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setChartMode('buyers')}
              className={`px-2.5 py-1 rounded-full font-semibold transition-colors ${
                chartMode === 'buyers'
                  ? 'glass-orange text-white shadow-xs'
                  : 'text-[#6B5449] hover:text-[#261812]'
              }`}
            >
              Buyers
            </button>
          </div>
        </div>

        {chartItems.length === 0 ? (
          <div className="unit-inner-card rounded-xl py-6 text-center text-xs text-[#6B5449]">
            No orders recorded yet.
          </div>
        ) : (
          <div className="space-y-2 py-1">
            {chartItems.map((item, idx) => {
              const shareNum = calcLimitSharePercent(
                item.quantity,
                divisionLimit
              );
              const pct =
                item.quantity > 0 ? Math.min(100, Math.max(0, shareNum)) : 0;
              const showLabelInside = pct >= 22;
              const share = shareNum.toFixed(1);
              const barColor =
                idx === 0
                  ? 'bg-[#F46A30] text-white'
                  : idx === 1
                  ? 'bg-[#FF8049] text-white'
                  : idx === 2
                  ? 'bg-[#FF9463] text-white'
                  : 'bg-[#FF9E70] text-white';

              return (
                <div
                  key={item.key}
                  className="flex items-center gap-2 sm:gap-3"
                >
                  <div className="w-20 sm:w-24 shrink-0 flex items-center gap-1.5 min-w-0">
                    <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center bg-[#FFF1EA] text-[#C94514] shrink-0 num">
                      {idx + 1}
                    </span>
                    <span
                      title={item.name}
                      className="text-xs font-semibold text-[#261812] truncate block"
                    >
                      {item.name}
                    </span>
                  </div>

                  <div className="flex-1 bg-[#F6F2E7] rounded-full h-4 sm:h-5 relative flex items-center p-0.5 overflow-hidden border border-[#E5DEC9]">
                    <div
                      className={`h-full rounded-full transition-all duration-300 flex items-center justify-end shadow-2xs shrink-0 ${barColor} ${
                        showLabelInside ? 'px-2' : ''
                      }`}
                      style={{
                        width: pct > 0 ? `${pct}%` : '0px',
                        minWidth: item.quantity > 0 ? '6px' : '0px',
                      }}
                    >
                      {showLabelInside && (
                        <span className="text-[10px] font-bold num whitespace-nowrap leading-none">
                          {formatQuantity(item.quantity)} L
                        </span>
                      )}
                    </div>
                    {!showLabelInside && (
                      <span
                        className={`ml-2 text-[10px] font-bold num whitespace-nowrap leading-none ${
                          item.quantity > 0 ? 'text-[#261812]' : 'text-[#6B5449]'
                        }`}
                      >
                        {formatQuantity(item.quantity)} L
                      </span>
                    )}
                  </div>

                  <div className="w-16 text-right shrink-0 num">
                    <span className="text-xs font-bold text-[#261812] block leading-tight">
                      {share}%
                    </span>
                    <span className="text-[10px] text-[#6B5449] block truncate">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. CARD 4: Recent 5 Orders */}
      <div className="glass-cream-card rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-[#261812]">
              Recent Orders
            </h2>
            <p className="text-[10px] text-[#6B5449]">Latest 5 unit orders</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3 h-3 text-[#8A7063] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={recentSearch}
                onChange={(e) => setRecentSearch(e.target.value)}
                placeholder="Search..."
                aria-label="Search recent unit orders"
                className="pl-7 pr-2.5 py-1 text-[11px] rounded-full border border-[#E5DEC9] bg-[#FBF8EE] text-[#261812] placeholder:text-[#8A7063] w-24 sm:w-32 focus:bg-white"
              />
            </div>
            <Link
              to="/dashboard/orders"
              className="text-[11px] font-semibold text-[#D44B1A] hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              View All
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {filteredRecentEntries.length === 0 ? (
          <div className="unit-inner-card rounded-xl py-4 text-center text-xs text-[#6B5449]">
            No recent orders found.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRecentEntries.map((entry) => (
              <div
                key={entry.id}
                className="unit-inner-card rounded-xl p-3 flex items-center justify-between gap-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-[#261812] truncate">
                      {entry.contributor_name}
                    </span>
                    {entry.payment_status === 'UNPAID' ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-vibrant-coralSoft text-vibrant-coral">
                        Unpaid
                      </span>
                    ) : (
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full ${
                          entry.payment_mode === 'UPI'
                            ? 'bg-vibrant-tealSoft text-vibrant-teal'
                            : 'bg-vibrant-amberSoft text-vibrant-amber'
                        }`}
                      >
                        Paid ·{' '}
                        {entry.payment_mode === 'CASH' ? 'Cash' : 'UPI'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#6B5449] truncate mt-0.5 num">
                    {entry.mobile_number} · {formatDateTime(entry.created_at)}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right num">
                    <div className="text-xs font-bold text-[#261812]">
                      {formatQuantity(Number(entry.quantity) || 0)} L
                    </div>
                    <div className="text-[10px] text-[#6B5449]">
                      {formatCurrency(Number(entry.total_amount) || 0)}
                    </div>
                  </div>

                  {entry.payment_status === 'UNPAID' && (
                    <button
                      type="button"
                      onClick={() => onMarkPaid(entry)}
                      className="px-2 py-1 rounded-lg glass-orange text-white text-[10px] font-bold"
                    >
                      Paid
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openWhatsAppReceipt(entry)}
                    aria-label={`Send WhatsApp receipt to ${entry.contributor_name}`}
                    className="p-1.5 rounded-lg bg-vibrant-tealSoft text-vibrant-teal"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Footer Quick Links to Orders & Reports */}
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          to="/dashboard/orders"
          className="glass-cream-card rounded-xl py-2.5 px-3 text-xs font-semibold text-[#261812] inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors"
        >
          <ListChecks className="w-3.5 h-3.5 text-[#D44B1A]" />
          <span>Orders History</span>
        </Link>
        <Link
          to="/dashboard/reports"
          className="glass-cream-card rounded-xl py-2.5 px-3 text-xs font-semibold text-[#261812] inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors"
        >
          <FileBarChart2 className="w-3.5 h-3.5 text-[#D44B1A]" />
          <span>Reports &amp; PDF</span>
        </Link>
      </div>

      <PushNotificationSettingsCard portal="UNIT" />
    </div>
  );
}
