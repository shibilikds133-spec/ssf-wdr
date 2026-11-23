import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Droplets,
  FileSpreadsheet,
  KeyRound,
  ListChecks,
  MessageCircle,
  Plus,
  Search,
  Smartphone,
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
import { InlinePaymentUpdater } from '../InlinePaymentUpdater';
import { PushNotificationSettingsCard } from '../PushNotificationSettingsCard';

interface UnitDashboardDesktopProps {
  data: UnitDashboardResponse;
  unitCode: string;
  onOpenQuickOrder: () => void;
  onOpenExportModal: (initialConfig?: Partial<ReportFilterConfig>) => void;
  onMutated: (msg: string) => Promise<void>;
  onError?: (msg: string) => void;
}

const PIXEL_COLUMNS = [
  ['bg-vibrant-amberSoft'],
  ['bg-vibrant-tealSoft', 'bg-vibrant-tealSoft/60'],
  ['bg-[#FF9F6E]', 'bg-[#F46A30]', 'bg-[#F46A30]/35'],
  ['bg-[#FF8A52]', 'bg-[#F46A30]', 'bg-[#F46A30]', 'bg-[#F46A30]/40'],
  ['bg-[#F46A30]', 'bg-vibrant-teal', 'bg-[#F46A30]', 'bg-[#FF8A52]', 'bg-[#FF8A52]/40'],
  [
    'bg-[#F46A30]',
    'bg-[#FF8A52]',
    'bg-vibrant-teal',
    'bg-[#F46A30]/50',
    'bg-[#F46A30]/25',
    'bg-[#F46A30]/15',
  ],
] as const;

export function UnitDashboardDesktop({
  data,
  unitCode,
  onOpenQuickOrder,
  onOpenExportModal,
  onMutated,
  onError,
}: UnitDashboardDesktopProps) {
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
  const cappedSharePercent = Math.min(100, Math.max(0, divisionSharePercent));

  const paidTotal = cashAmount + upiAmount;
  const upiPercent =
    totalAmount > 0 ? Math.round((upiAmount / totalAmount) * 100) : 0;

  // Daily Liters (last 7 active days) & Top Buyers (top 6)
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
        .slice(0, 6);
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

  // SVG Semi-Circular Arc Gauge calculations (Unit L / Division Limit)
  const radius = 74;
  const arcLength = Math.PI * radius;
  const progressRatio = cappedSharePercent / 100;
  const dashOffset = arcLength * (1 - progressRatio);
  const theta = Math.PI * (1 - progressRatio);
  const knobX = 100 + radius * Math.cos(theta);
  const knobY = 100 - radius * Math.sin(theta);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(unit.login_code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1600);
    } catch {
      // Ignore clipboard failure
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

  return (
    <div className="space-y-5">
      {/* Global Lock Banner (Conditional) */}
      {!settings.is_challenge_open && (
        <div
          role="alert"
          className="glass-cream-card rounded-2xl px-4 py-3 border border-vibrant-coral/40 bg-rose-50/80 flex items-center gap-3 text-xs text-rose-900 font-medium"
        >
          <AlertTriangle className="w-4 h-4 text-vibrant-coral shrink-0" />
          <span>
            Orders are currently closed by Division Admin. You can still view
            orders, mark Unpaid orders as Paid, and export your delivery sheet.
          </span>
        </div>
      )}

      {/* ROW 1: 12-Column Top Bento Row (Mirrors Sector & Division 1:1) */}
      <div className="grid grid-cols-12 gap-5">
        {/* Card 1: Total Orders Value (6 cols) */}
        <div className="col-span-6 glass-cream-card rounded-[22px] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="glass-cream-pill w-8 h-8 rounded-lg flex items-center justify-center text-[#D44B1A]">
                <Wallet className="w-4 h-4" />
              </span>
              <span className="text-sm font-bold text-[#261812]">
                Total Orders Value
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="glass-cream-pill px-3 py-1 rounded-full text-xs font-semibold text-[#261812] num shadow-2xs">
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
              <div className="text-4xl font-extrabold text-[#261812] tracking-tight num">
                {formatCurrency(totalAmount)}
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#6B5449] num">
                <CheckCircle2 className="w-3.5 h-3.5 text-vibrant-teal shrink-0" />
                <span>
                  {totalEntries} orders · {formatQuantity(totalQuantity)} L
                  booked in {unit.name}
                </span>
              </div>
            </div>

            {/* Ascending Pixel-Block Step Graphic */}
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
              onClick={onOpenQuickOrder}
              disabled={!settings.is_challenge_open}
              className="glass-orange text-white rounded-full px-4 py-2 text-xs font-semibold hover:opacity-95 disabled:opacity-45 disabled:cursor-not-allowed transition-opacity inline-flex items-center gap-1.5 shadow-sm"
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
              className="bg-[#261812] text-white hover:bg-[#3F2920] rounded-full px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report
            </button>
            <Link
              to="/dashboard/orders"
              className="unit-inner-card hover:bg-white text-[#261812] rounded-full px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
            >
              <ListChecks className="w-3.5 h-3.5" />
              All Orders
            </Link>
          </div>
        </div>

        {/* Card 2: 3-Way Payment Split (3 cols) */}
        <div className="col-span-3 glass-cream-card rounded-[22px] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-vibrant-teal text-white flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </span>
              <span className="text-sm font-bold text-[#261812]">
                Payment Split
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-vibrant-teal bg-vibrant-tealSoft">
              Live
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-[#261812] num">
                {formatCurrency(paidTotal)}
              </span>
              <span className="bg-vibrant-tealSoft text-vibrant-teal text-[11px] font-semibold px-2 py-0.5 rounded-full num">
                {upiPercent}% UPI
              </span>
            </div>
            <div className="unit-inner-card rounded-xl px-3 py-1.5 text-xs text-[#6B5449] mt-2.5 num">
              {unpaidEntries > 0
                ? `${unpaidEntries} Unpaid (${formatCurrency(unpaidAmount)})`
                : 'All orders collected'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="border-l-2 border-vibrant-amberMid pl-2">
              <span className="text-[10px] text-[#6B5449] block">Cash</span>
              <span className="text-xs font-bold text-[#261812] num">
                {formatCurrency(cashAmount)}
              </span>
            </div>
            <div className="border-l-2 border-vibrant-teal pl-2">
              <span className="text-[10px] text-[#6B5449] block">UPI</span>
              <span className="text-xs font-bold text-[#261812] num">
                {formatCurrency(upiAmount)}
              </span>
            </div>
            <div className="border-l-2 border-vibrant-coral pl-2">
              <span className="text-[10px] text-[#6B5449] block">Unpaid</span>
              <span className="text-xs font-bold text-vibrant-coral num">
                {formatCurrency(unpaidAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Unit Liters & Division Share (3 cols) */}
        <div className="col-span-3 glass-cream-card rounded-[22px] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-9 h-9 rounded-full bg-[#F46A30] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Droplets className="w-4 h-4" />
              </span>
              <span className="text-sm font-bold text-[#261812] leading-tight">
                Unit Volume
              </span>
            </div>
            <span className="bg-[#FFF1EA] text-[#C94514] border border-[#F8CBB6] px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 num">
              {totalEntries} orders
            </span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-[#261812] num">
                {formatQuantity(totalQuantity)} L
              </span>
              <span className="bg-[#FFF1EA] text-[#C94514] text-[11px] font-semibold px-2 py-0.5 rounded-full num">
                {divisionSharePercent.toFixed(1)}% of division
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-[#6B5449] num">
              <span>{cappedSharePercent.toFixed(1)}% Share</span>
              <span>Limit {formatQuantity(divisionLimit)} L</span>
            </div>
            <div className="h-2 rounded-full bg-[#F1ECE0] overflow-hidden flex my-1.5 border border-[#E5DEC9]">
              <div
                className="h-full bg-[#F46A30] transition-all duration-300"
                style={{ width: `${cappedSharePercent}%` }}
              />
              <div className="h-full bg-[#E8E0CB]/60 flex-1" />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#6B5449] pt-0.5 num">
              <span>Rate ₹{formatQuantity(Number(settings.unit_rate) || 0)}/L</span>
              <span>{unpaidEntries} Unpaid</span>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: 12-Column Main Bento Body */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left Column: Division Contribution Gauge + 3-Way Breakdown (4 cols) */}
        <div className="col-span-4 glass-cream-card rounded-[22px] p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#261812]">
              Division Limit Share
            </h2>
            <Link
              to="/dashboard/orders"
              title="View all unit orders"
              aria-label="View all unit orders"
              className="w-8 h-8 rounded-full glass-cream-pill flex items-center justify-center text-[#261812] hover:bg-white transition-colors"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Inner Warm Orange Glass Card with Semi-Circular SVG Gauge */}
          <div className="glass-orange rounded-[18px] p-5 text-white relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-white/90 font-medium num">
                {divisionSharePercent.toFixed(1)}% of Division Limit
              </span>
              <span className="glass-dark-pill text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold num font-mono">
                {unit.login_code}
              </span>
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
                  stroke="rgba(20, 16, 14, 0.2)"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                <path
                  d="M 26 100 A 74 74 0 0 1 174 100"
                  fill="none"
                  stroke="#14100E"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={arcLength}
                  strokeDashoffset={dashOffset}
                />
                <circle
                  cx={knobX}
                  cy={knobY}
                  r="6"
                  fill="#F46A30"
                  stroke="#14100E"
                  strokeWidth="3"
                />
              </svg>

              <div className="-mt-12 text-center">
                <span className="text-[11px] uppercase tracking-wider text-white/85 font-semibold block">
                  Unit Ordered
                </span>
                <span className="text-2xl font-extrabold num text-white block leading-tight">
                  {formatQuantity(totalQuantity)} L
                </span>
                <span className="text-xs text-white/95 font-medium num">
                  {divisionSharePercent.toFixed(1)}% of{' '}
                  {formatQuantity(divisionLimit)} L Limit
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenQuickOrder}
              disabled={!settings.is_challenge_open}
              title={
                settings.is_challenge_open
                  ? 'Add Quick Order'
                  : 'Orders Closed'
              }
              aria-label="Quick Order"
              className="absolute bottom-4 right-4 w-8 h-8 rounded-full glass-dark-pill text-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-40"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* 3-Way Payment Status Breakdown (Distinct Nested Inner Cards) */}
          <div className="space-y-2.5 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#6B5449] uppercase tracking-wide">
                Collections Breakdown
              </span>
              <span className="text-[11px] text-[#6B5449] num">
                {totalEntries} Orders
              </span>
            </div>

            {[
              {
                label: 'Cash Handover',
                amount: cashAmount,
                color: 'bg-vibrant-amber',
                pct: totalAmount > 0 ? (cashAmount / totalAmount) * 100 : 0,
              },
              {
                label: 'UPI / Bank',
                amount: upiAmount,
                color: 'bg-vibrant-teal',
                pct: totalAmount > 0 ? (upiAmount / totalAmount) * 100 : 0,
              },
              {
                label: `Unpaid (${unpaidEntries} pending)`,
                amount: unpaidAmount,
                color: 'bg-vibrant-coral',
                pct: totalAmount > 0 ? (unpaidAmount / totalAmount) * 100 : 0,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="unit-inner-card rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#261812] block truncate">
                    {row.label}
                  </span>
                  <span className="text-[11px] text-[#6B5449] num">
                    {formatCurrency(row.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-xs font-semibold text-[#261812] num">
                    {row.pct.toFixed(0)}%
                  </span>
                  <div className="h-1.5 w-16 rounded-full bg-[#ECE5D3] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.color}`}
                      style={{ width: `${Math.min(100, row.pct)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Area (8 cols) */}
        <div className="col-span-8 flex flex-col gap-5">
          {/* Upper Split */}
          <div className="grid grid-cols-12 gap-5">
            {/* Center Chart Card: Daily Liters | Top Buyers (8 cols) */}
            <div className="col-span-8 glass-cream-card rounded-[22px] p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg glass-orange flex items-center justify-center text-white shrink-0 shadow-xs">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-[#261812] leading-tight">
                      {chartMode === 'daily' ? 'Daily Liters' : 'Top Buyers'}
                    </h2>
                    <p className="text-[11px] text-[#6B5449] mt-0.5">
                      {chartMode === 'daily'
                        ? 'Recent daily order volume in liters'
                        : `Top contributors in ${unit.name}`}
                    </p>
                  </div>
                </div>

                <div className="glass-cream-pill p-0.5 rounded-full inline-flex text-xs">
                  <button
                    type="button"
                    onClick={() => setChartMode('daily')}
                    className={`px-3 py-1 rounded-full font-semibold transition-colors ${
                      chartMode === 'daily'
                        ? 'glass-orange text-white shadow-xs'
                        : 'text-[#6B5449] hover:text-[#261812]'
                    }`}
                  >
                    Daily Liters
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('buyers')}
                    className={`px-3 py-1 rounded-full font-semibold transition-colors ${
                      chartMode === 'buyers'
                        ? 'glass-orange text-white shadow-xs'
                        : 'text-[#6B5449] hover:text-[#261812]'
                    }`}
                  >
                    Top Buyers
                  </button>
                </div>
              </div>

              {chartItems.length === 0 ? (
                <div className="h-48 unit-inner-card rounded-2xl flex items-center justify-center text-xs text-[#6B5449]">
                  No orders recorded yet. Click Quick Order to start.
                </div>
              ) : (
                <div className="space-y-2.5 my-auto py-1">
                  {chartItems.map((item, idx) => {
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
                        ? 'bg-[#F46A30] text-white'
                        : idx === 1
                        ? 'bg-[#FF8049] text-white'
                        : idx === 2
                        ? 'bg-[#FF9463] text-white'
                        : 'bg-[#FF9E70] text-white';

                    return (
                      <div
                        key={item.key}
                        title={`${item.name} | Ordered: ${formatQuantity(item.quantity)} L | Share of Limit: ${share}% | Amount: ${formatCurrency(item.amount)}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="w-24 shrink-0 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-[#C94514] bg-[#FFF1EA] shrink-0 num">
                            {idx + 1}
                          </span>
                          <span
                            title={item.name}
                            className="text-xs font-semibold text-[#261812] truncate"
                          >
                            {item.name}
                          </span>
                        </div>

                        <div className="flex-1 bg-[#F6F2E7] rounded-full h-5 relative flex items-center p-0.5 overflow-hidden border border-[#E5DEC9]">
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
                              <span className="text-[11px] font-bold num whitespace-nowrap leading-none">
                                {formatQuantity(item.quantity)} L
                              </span>
                            )}
                          </div>
                          {!showLabelInside && (
                            <span
                              className={`ml-2 text-[11px] font-bold num whitespace-nowrap leading-none ${
                                item.quantity > 0
                                  ? 'text-[#261812]'
                                  : 'text-[#6B5449]'
                              }`}
                            >
                              {formatQuantity(item.quantity)} L
                            </span>
                          )}
                        </div>

                        <div className="w-16 text-right shrink-0 num">
                          <span className="text-xs font-bold text-[#261812] block">
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

              <div className="pt-2 border-t border-[#E5DEC9] flex items-center justify-between text-xs mt-2">
                <span className="text-[#6B5449]">
                  {chartMode === 'daily'
                    ? `Showing last ${chartItems.length} active days`
                    : `Showing top ${chartItems.length} buyers`}
                </span>
                <Link
                  to="/dashboard/orders"
                  className="font-semibold text-[#D44B1A] hover:underline inline-flex items-center gap-1"
                >
                  View All Orders
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Right Mini-Bento Stack (4 cols) */}
            <div className="col-span-4 flex flex-col gap-4">
              {/* Top Banner Mini Card */}
              <div className="glass-cream-card rounded-[20px] p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="bg-[#FFF1EA] text-[#C94514] border border-[#F8CBB6] text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block mb-1 num">
                    Rate ₹{formatQuantity(Number(settings.unit_rate) || 0)}/L
                  </span>
                  <div className="text-sm font-bold text-[#261812] truncate">
                    Book New Order
                  </div>
                  <div className="text-xs text-[#6B5449]">
                    Direct unit entry
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenQuickOrder}
                  disabled={!settings.is_challenge_open}
                  className="glass-orange text-white text-xs font-semibold px-3.5 py-1.5 rounded-full hover:opacity-95 disabled:opacity-45 transition-opacity shrink-0"
                >
                  + Order
                </button>
              </div>

              {/* Bottom 2 Square Mini Cards: Public Order Code + Delivery CSV */}
              <div className="grid grid-cols-2 gap-4 flex-1">
                {/* Square Box: Public Order Code (Replaces old top banner) */}
                <div className="glass-cream-card rounded-[20px] p-4 flex flex-col justify-between">
                  <div>
                    <span className="w-8 h-8 rounded-lg bg-[#FFF1EA] border border-[#F8CBB6] flex items-center justify-center text-[#D44B1A] mb-2">
                      <KeyRound className="w-4 h-4" />
                    </span>
                    <span className="text-[11px] font-medium text-[#6B5449] block">
                      Order Code
                    </span>
                    <span className="text-xl font-extrabold font-mono text-[#261812] tracking-wide num mt-0.5 block">
                      {unit.login_code}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyCode()}
                    title="Copy Public Order Code"
                    className="unit-inner-card hover:bg-white text-[#261812] text-xs font-semibold px-3 py-1.5 rounded-full inline-flex items-center justify-center gap-1.5 transition-colors w-full mt-2"
                  >
                    {codeCopied ? (
                      <>
                        <Check className="w-3 h-3 text-vibrant-teal" />
                        <span className="text-vibrant-teal">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Square Box: Export Reports */}
                <div className="glass-cream-card rounded-[20px] p-4 flex flex-col justify-between">
                  <div>
                    <span className="glass-cream-pill w-8 h-8 rounded-lg flex items-center justify-center text-[#261812] mb-2">
                      <FileSpreadsheet className="w-4 h-4" />
                    </span>
                    <div className="text-xs font-bold text-[#261812]">
                      Delivery Sheet
                    </div>
                    <div className="text-[11px] text-[#6B5449]">
                      PDF &amp; CSV export
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenExportModal({
                        scope: 'THIS_UNIT',
                        template: 'DELIVERY_SHEET',
                      })
                    }
                    className="unit-inner-card hover:bg-white text-[#261812] text-xs font-semibold px-3 py-1.5 rounded-full inline-flex items-center justify-center gap-1.5 transition-colors w-full mt-2"
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Wide Card: Recent 5 Orders */}
          <div className="glass-cream-card rounded-[22px] p-5">
            <div className="flex items-center justify-between gap-3 mb-3.5">
              <h2 className="text-base font-bold text-[#261812]">
                Recent Orders
              </h2>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#8A7063] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={recentSearch}
                    onChange={(e) => setRecentSearch(e.target.value)}
                    placeholder="Search name or mobile..."
                    aria-label="Search recent unit orders"
                    className="pl-8 pr-3 py-1.5 text-xs rounded-full border border-[#E5DEC9] bg-[#FBF8EE] text-[#261812] placeholder:text-[#8A7063] w-48 focus:bg-white"
                  />
                </div>
                <Link
                  to="/dashboard/orders"
                  className="text-xs font-semibold text-[#D44B1A] hover:underline inline-flex items-center gap-1 shrink-0"
                >
                  View All Orders
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-[#6B5449] border-b border-[#E5DEC9]">
                    <th className="py-2.5 pr-4 font-semibold">Ordered By</th>
                    <th className="py-2.5 px-4 font-semibold text-right">
                      Qty (L)
                    </th>
                    <th className="py-2.5 px-4 font-semibold text-right">
                      Amount
                    </th>
                    <th className="py-2.5 px-4 font-semibold">Payment</th>
                    <th className="py-2.5 pl-4 font-semibold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECE5D3]">
                  {filteredRecentEntries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-xs text-[#6B5449]"
                      >
                        No recent orders found.
                      </td>
                    </tr>
                  ) : (
                    filteredRecentEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="hover:bg-[#FBF8EE] transition-colors"
                      >
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          <div className="font-medium text-[#261812]">
                            {entry.contributor_name}
                          </div>
                          <div className="text-[11px] text-[#6B5449] num">
                            {entry.mobile_number} ·{' '}
                            {formatDateTime(entry.created_at)}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-[#261812] num whitespace-nowrap">
                          {formatQuantity(Number(entry.quantity) || 0)} L
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-[#261812] num whitespace-nowrap">
                          {formatCurrency(Number(entry.total_amount) || 0)}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {entry.payment_status === 'UNPAID' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-vibrant-coralSoft text-vibrant-coral">
                              Unpaid
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                entry.payment_mode === 'UPI'
                                  ? 'bg-vibrant-tealSoft text-vibrant-teal'
                                  : 'bg-vibrant-amberSoft text-vibrant-amber'
                              }`}
                            >
                              Paid ·{' '}
                              {entry.payment_mode === 'CASH'
                                ? 'Cash Handover'
                                : 'UPI'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pl-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {entry.payment_status === 'UNPAID' && (
                              <InlinePaymentUpdater
                                portal="UNIT"
                                authCode={unitCode}
                                entryId={entry.id}
                                compact
                                onPaid={onMutated}
                                onError={onError}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => openWhatsAppReceipt(entry)}
                              title="Send WhatsApp Receipt"
                              aria-label={`Send WhatsApp receipt to ${entry.contributor_name}`}
                              className="p-1.5 rounded-lg bg-vibrant-tealSoft text-vibrant-teal hover:bg-vibrant-teal hover:text-white transition-colors"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      <PushNotificationSettingsCard portal="UNIT" />
    </div>
  );
}
