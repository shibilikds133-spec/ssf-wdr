import type { EntryItem } from '../../types';
import { formatPdfCurrency, roundTwo } from './pdfTheme';

export type ReportShareMode = 'status' | 'detailed';

export interface ReconciledOrderSummary {
  totalOrders: number;
  totalLiters: number;
  totalAmount: number;
  paidAmount: number;
  paidCount: number;
  cashAmount: number;
  cashCount: number;
  upiAmount: number;
  upiCount: number;
  unpaidAmount: number;
  unpaidCount: number;
  /** True when cashAmount + upiAmount + unpaidAmount matches totalAmount to the paisa. */
  isReconciled: boolean;
  /** Formatted rate indicator (e.g. `Rs. 250 / L` or `Mixed Rates`). */
  rateLabel: string;
}

export interface ReconciledEntityTotals {
  count: number;
  activeCount: number;
  totalUnits: number;
  activeUnits: number;
  orders: number;
  liters: number;
  cashAmount: number;
  upiAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  totalAmount: number;
  isReconciled: boolean;
}

function toCents(n: number | null | undefined): number {
  const val = typeof n === 'number' && Number.isFinite(n) ? n : Number(n) || 0;
  return Number.isFinite(val) ? Math.round(val * 100) : 0;
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function safePercent(part: number, total: number): number {
  const safePart = Number.isFinite(part) ? part : 0;
  const safeTotal = Number.isFinite(total) ? total : 0;
  if (safeTotal <= 0) return 0;
  return roundTwo((safePart / safeTotal) * 100);
}

/**
 * Filter out soft-deleted entries as a strict defensive guard before any calculation.
 */
export function filterActiveEntries<T extends { is_deleted?: boolean }>(
  entries: readonly T[]
): T[] {
  return entries.filter((entry) => entry.is_deleted !== true);
}

/**
 * Compute exact cent-integer accounting totals for order entries.
 * Sums `entry.total_amount` directly (never qty * currentRate) so historical
 * rate changes preserve exact financial reconciliation:
 *   totalAmount === cashAmount + upiAmount + unpaidAmount
 */
export function reconcileOrderEntries(
  entries: readonly Pick<
    EntryItem,
    | 'quantity'
    | 'unit_rate_applied'
    | 'total_amount'
    | 'payment_status'
    | 'payment_mode'
    | 'is_deleted'
  >[],
  fallbackRate = 0
): ReconciledOrderSummary {
  const active = filterActiveEntries(entries);
  let litersCents = 0;
  let cashCents = 0;
  let upiCents = 0;
  let otherPaidCents = 0;
  let unpaidCents = 0;
  let totalAmountCents = 0;
  let paidCount = 0;
  let cashCount = 0;
  let upiCount = 0;
  let unpaidCount = 0;
  const distinctRates = new Set<number>();

  for (const entry of active) {
    const qtyCents = toCents(entry.quantity);
    const amountCents = toCents(entry.total_amount);
    const rate = roundTwo(Number(entry.unit_rate_applied) || 0);
    if (rate > 0) distinctRates.add(rate);

    litersCents += qtyCents;
    totalAmountCents += amountCents;

    if (entry.payment_status === 'UNPAID') {
      unpaidCents += amountCents;
      unpaidCount += 1;
    } else {
      paidCount += 1;
      if (entry.payment_mode === 'CASH') {
        cashCents += amountCents;
        cashCount += 1;
      } else if (entry.payment_mode === 'UPI') {
        upiCents += amountCents;
        upiCount += 1;
      } else {
        otherPaidCents += amountCents;
      }
    }
  }

  const paidCents = cashCents + upiCents + otherPaidCents;
  const isReconciled = paidCents + unpaidCents === totalAmountCents;

  let rateLabel = '-';
  if (distinctRates.size > 1) {
    rateLabel = 'Mixed Rates';
  } else if (distinctRates.size === 1) {
    const [onlyRate] = [...distinctRates];
    rateLabel = `${formatPdfCurrency(onlyRate)} / L`;
  } else if (fallbackRate > 0) {
    rateLabel = `${formatPdfCurrency(fallbackRate)} / L`;
  }

  return {
    totalOrders: active.length,
    totalLiters: fromCents(litersCents),
    totalAmount: fromCents(totalAmountCents),
    paidAmount: fromCents(paidCents),
    paidCount,
    cashAmount: fromCents(cashCents),
    cashCount,
    upiAmount: fromCents(upiCents),
    upiCount,
    unpaidAmount: fromCents(unpaidCents),
    unpaidCount,
    isReconciled,
    rateLabel,
  };
}

export interface RollupRowInput {
  orders: number;
  liters: number;
  cashAmount: number;
  upiAmount: number;
  unpaidAmount: number;
  totalAmount: number;
  activeUnits?: number;
  totalUnits?: number;
}

/**
 * Reconcile Sector or Unit rollup rows using exact integer-cent math.
 */
export function reconcileRollupRows(
  rows: readonly RollupRowInput[]
): ReconciledEntityTotals {
  let orders = 0;
  let litersCents = 0;
  let cashCents = 0;
  let upiCents = 0;
  let unpaidCents = 0;
  let totalAmountCents = 0;
  let activeCount = 0;
  let totalUnits = 0;
  let activeUnits = 0;

  for (const row of rows) {
    orders += row.orders;
    if (row.orders > 0) activeCount += 1;
    totalUnits += row.totalUnits ?? 1;
    activeUnits += row.activeUnits ?? (row.orders > 0 ? 1 : 0);

    litersCents += toCents(row.liters);
    cashCents += toCents(row.cashAmount);
    upiCents += toCents(row.upiAmount);
    unpaidCents += toCents(row.unpaidAmount);
    totalAmountCents += toCents(row.totalAmount);
  }

  const paidCents = cashCents + upiCents;
  return {
    count: rows.length,
    activeCount,
    totalUnits,
    activeUnits,
    orders,
    liters: fromCents(litersCents),
    cashAmount: fromCents(cashCents),
    upiAmount: fromCents(upiCents),
    paidAmount: fromCents(paidCents),
    unpaidAmount: fromCents(unpaidCents),
    totalAmount: fromCents(totalAmountCents),
    isReconciled: cashCents + upiCents + unpaidCents === totalAmountCents,
  };
}
