import {
  buildReportPayload,
  getIstDateKey,
  type ReportDataSource,
  type ReportFilterConfig,
  type ReportOrderRow,
  type ReportPayload,
  type ReportUnitSummaryRow,
} from '../reports';
import {
  reconcileOrderEntries,
  reconcileRollupRows,
  type ReportShareMode,
} from './pdfAccounting';
import {
  formatPdfCurrency,
  formatPdfIstDate,
  roundTwo,
} from './pdfTheme';

export interface BuildWhatsAppReportInput {
  source: ReportDataSource;
  config: ReportFilterConfig;
  mode?: ReportShareMode;
  now?: Date;
}

export interface FormattedWhatsAppReport {
  text: string;
  title: string;
  mode: ReportShareMode;
  lineCount: number;
  encodedLength: number;
}

interface WhatsAppPaymentContext {
  isUnpaidOnly: boolean;
  isPaidOnly: boolean;
  isPaidCashOnly: boolean;
  isPaidUpiOnly: boolean;
  statusLine: string;
  titleSuffix: string;
  sectionTag: string;
  orderQualifier: string;
}

const DIVIDER = '━━━━━━━━━━━━━━━━━━';
const IST_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_CAMPAIGN_PERIOD = '22 Nov – 20 Dec 2026';

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function resolvePaymentContext(config: ReportFilterConfig): WhatsAppPaymentContext {
  const isUnpaidOnly =
    config.template === 'UNPAID_DUES' || config.paymentStatus === 'UNPAID';
  const isPaidCashOnly = !isUnpaidOnly && config.paymentMode === 'CASH';
  const isPaidUpiOnly = !isUnpaidOnly && config.paymentMode === 'UPI';
  const isPaidOnly =
    !isUnpaidOnly && (config.paymentStatus === 'PAID' || config.paymentMode !== 'ALL');

  if (isUnpaidOnly) {
    return {
      isUnpaidOnly: true,
      isPaidOnly: false,
      isPaidCashOnly: false,
      isPaidUpiOnly: false,
      statusLine: 'Unpaid Only',
      titleSuffix: 'Unpaid',
      sectionTag: 'UNPAID',
      orderQualifier: 'Unpaid ',
    };
  }
  if (isPaidCashOnly) {
    return {
      isUnpaidOnly: false,
      isPaidOnly: true,
      isPaidCashOnly: true,
      isPaidUpiOnly: false,
      statusLine: 'Paid (Cash)',
      titleSuffix: 'Paid (Cash)',
      sectionTag: 'PAID — CASH',
      orderQualifier: 'Paid ',
    };
  }
  if (isPaidUpiOnly) {
    return {
      isUnpaidOnly: false,
      isPaidOnly: true,
      isPaidCashOnly: false,
      isPaidUpiOnly: true,
      statusLine: 'Paid (UPI)',
      titleSuffix: 'Paid (UPI)',
      sectionTag: 'PAID — UPI',
      orderQualifier: 'Paid ',
    };
  }
  if (isPaidOnly) {
    return {
      isUnpaidOnly: false,
      isPaidOnly: true,
      isPaidCashOnly: false,
      isPaidUpiOnly: false,
      statusLine: 'Paid Only',
      titleSuffix: 'Paid',
      sectionTag: 'PAID',
      orderQualifier: 'Paid ',
    };
  }
  return {
    isUnpaidOnly: false,
    isPaidOnly: false,
    isPaidCashOnly: false,
    isPaidUpiOnly: false,
    statusLine: '',
    titleSuffix: '',
    sectionTag: '',
    orderQualifier: '',
  };
}

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

function cleanName(raw: string | null | undefined, fallback = '-'): string {
  const s = String(raw ?? '')
    .replace(/[*_`~]/g, '')
    .replace(/\s*\([A-Za-z0-9_-]{2,20}\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || fallback;
}

function formatSectorBoldHeader(sectorName: string): string {
  const cleaned = cleanName(sectorName, 'SECTOR').toUpperCase();
  const withSuffix = /\bSECTOR\b/.test(cleaned) ? cleaned : `${cleaned} SECTOR`;
  return `*${withSuffix}*`;
}

function formatCountIn(count: number): string {
  const safe = Number.isFinite(count) ? Math.round(count) : 0;
  return new Intl.NumberFormat('en-IN').format(safe);
}

function formatOrdersLabel(count: number, qualifier = ''): string {
  const safe = Number.isFinite(count) ? Math.round(count) : 0;
  return `${formatCountIn(safe)} ${qualifier}${safe === 1 ? 'Order' : 'Orders'}`;
}

function formatQtyIn(qty: number): string {
  const rounded = roundTwo(Number.isFinite(qty) ? qty : 0);
  const cents = Math.round(rounded * 100);
  const decDigits = cents % 100 === 0 ? 0 : cents % 10 === 0 ? 1 : 2;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decDigits,
    maximumFractionDigits: 2,
  }).format(rounded);
  return `${formatted} L`;
}

function formatUpdatedTimestamp(date: Date): string {
  const datePart = formatPdfIstDate(date);
  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TIMEZONE,
  }).format(date);
  return `${datePart}, ${timePart}`;
}

function parseIsoParts(
  iso: string
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatCompactRange(fromIso: string, toIso: string): string {
  const a = parseIsoParts(fromIso);
  const b = parseIsoParts(toIso);
  if (!a && !b) return DEFAULT_CAMPAIGN_PERIOD;
  if (a && !b) {
    return `From ${pad2(a.day)} ${SHORT_MONTHS[a.month - 1]} ${a.year}`;
  }
  if (!a && b) {
    return `Up to ${pad2(b.day)} ${SHORT_MONTHS[b.month - 1]} ${b.year}`;
  }
  if (!a || !b) return DEFAULT_CAMPAIGN_PERIOD;

  if (a.year === b.year && a.month === b.month && a.day === b.day) {
    return `${pad2(a.day)} ${SHORT_MONTHS[a.month - 1]} ${a.year}`;
  }
  if (a.year === b.year) {
    return `${pad2(a.day)} ${SHORT_MONTHS[a.month - 1]} – ${pad2(b.day)} ${SHORT_MONTHS[b.month - 1]} ${b.year}`;
  }
  return `${pad2(a.day)} ${SHORT_MONTHS[a.month - 1]} ${a.year} – ${pad2(b.day)} ${SHORT_MONTHS[b.month - 1]} ${b.year}`;
}

function shiftIsoDays(iso: string, deltaDays: number): string {
  const p = parseIsoParts(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.year, p.month - 1, p.day + deltaDays));
  const y = dt.getUTCFullYear();
  const m = pad2(dt.getUTCMonth() + 1);
  const d = pad2(dt.getUTCDate());
  return `${y}-${m}-${d}`;
}

function formatPeriodLabel(config: ReportFilterConfig, now: Date): string {
  const todayKey = getIstDateKey(now);
  if (config.datePreset === 'TODAY') {
    return `${formatCompactRange(todayKey, todayKey)} (Today)`;
  }
  if (config.datePreset === 'LAST_7_DAYS') {
    return formatCompactRange(shiftIsoDays(todayKey, -6), todayKey);
  }
  if (config.datePreset === 'CUSTOM') {
    if (config.dateFrom || config.dateTo) {
      return formatCompactRange(config.dateFrom, config.dateTo);
    }
  }
  return DEFAULT_CAMPAIGN_PERIOD;
}

function formatOrderPaymentShort(
  status: 'PAID' | 'UNPAID',
  mode: 'CASH' | 'UPI' | null
): string {
  if (status === 'UNPAID') return 'Unpaid';
  if (mode === 'UPI') return 'Paid (UPI)';
  if (mode === 'CASH') return 'Paid (Cash)';
  return 'Paid';
}

function addCents(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(b * 100)) / 100;
}

function buildHeaderLines(
  subtitle: string,
  periodLabel: string,
  updatedLabel: string,
  payCtx: WhatsAppPaymentContext
): string[] {
  const lines = ['*SSF WANDOOR DIVISION*', `Payasam Challenge — ${subtitle}`];
  if (payCtx.statusLine) {
    lines.push(`Status : ${payCtx.statusLine}`);
  }
  lines.push(`Period : ${periodLabel}`);
  lines.push(`Updated: ${updatedLabel}`);
  lines.push(DIVIDER);
  return lines;
}

function buildDetailedRowAmountLines(
  payCtx: WhatsAppPaymentContext,
  amounts: { cash: number; upi: number; unpaid: number; total: number }
): string[] {
  if (payCtx.isUnpaidOnly) {
    return [
      `    Status: Unpaid | Due: *${formatPdfCurrency(amounts.unpaid || amounts.total)}*`,
    ];
  }
  if (payCtx.isPaidCashOnly) {
    return [
      `    Paid (Cash): *${formatPdfCurrency(amounts.cash || amounts.total)}*`,
    ];
  }
  if (payCtx.isPaidUpiOnly) {
    return [
      `    Paid (UPI): *${formatPdfCurrency(amounts.upi || amounts.total)}*`,
    ];
  }
  if (payCtx.isPaidOnly) {
    return [
      `    Cash: ${formatPdfCurrency(amounts.cash)} | UPI: ${formatPdfCurrency(amounts.upi)}`,
      `    Paid Total: *${formatPdfCurrency(amounts.total)}*`,
    ];
  }
  return [
    `    Cash: ${formatPdfCurrency(amounts.cash)} | UPI: ${formatPdfCurrency(amounts.upi)} | Unpaid: ${formatPdfCurrency(amounts.unpaid)}`,
    `    Total: *${formatPdfCurrency(amounts.total)}*`,
  ];
}

function buildDetailedGrandTotalLines(
  payCtx: WhatsAppPaymentContext,
  params: {
    orders: number;
    liters: number;
    cash: number;
    upi: number;
    unpaid: number;
    total: number;
  }
): string[] {
  if (payCtx.isUnpaidOnly) {
    return [
      DIVIDER,
      '*GRAND TOTAL (UNPAID)*',
      `Unpaid Orders : ${formatCountIn(params.orders)} | Liters : ${formatQtyIn(params.liters)}`,
      `*TOTAL UNPAID : ${formatPdfCurrency(params.unpaid || params.total)}*`,
    ];
  }
  if (payCtx.isPaidCashOnly) {
    return [
      DIVIDER,
      '*GRAND TOTAL (PAID — CASH)*',
      `Paid Orders : ${formatCountIn(params.orders)} | Liters : ${formatQtyIn(params.liters)}`,
      `*TOTAL CASH : ${formatPdfCurrency(params.cash || params.total)}*`,
    ];
  }
  if (payCtx.isPaidUpiOnly) {
    return [
      DIVIDER,
      '*GRAND TOTAL (PAID — UPI)*',
      `Paid Orders : ${formatCountIn(params.orders)} | Liters : ${formatQtyIn(params.liters)}`,
      `*TOTAL UPI  : ${formatPdfCurrency(params.upi || params.total)}*`,
    ];
  }
  if (payCtx.isPaidOnly) {
    return [
      DIVIDER,
      '*GRAND TOTAL (PAID)*',
      `Paid Orders : ${formatCountIn(params.orders)} | Liters : ${formatQtyIn(params.liters)}`,
      `Cash        : ${formatPdfCurrency(params.cash)}`,
      `UPI         : ${formatPdfCurrency(params.upi)}`,
      `*TOTAL PAID : ${formatPdfCurrency(params.total)}*`,
    ];
  }
  return [
    DIVIDER,
    '*GRAND TOTAL*',
    `Orders : ${formatCountIn(params.orders)} | Liters : ${formatQtyIn(params.liters)}`,
    `Cash   : ${formatPdfCurrency(params.cash)}`,
    `UPI    : ${formatPdfCurrency(params.upi)}`,
    `Unpaid : ${formatPdfCurrency(params.unpaid)}`,
    `*TOTAL : ${formatPdfCurrency(params.total)}*`,
  ];
}

function buildStatusGrandTotalLines(
  payCtx: WhatsAppPaymentContext,
  orders: number,
  liters: number
): string[] {
  const orderLabel = payCtx.isUnpaidOnly
    ? 'TOTAL UNPAID ORDERS'
    : payCtx.isPaidOnly
    ? 'TOTAL PAID ORDERS'
    : 'TOTAL ORDERS';
  const literLabel = payCtx.isUnpaidOnly ? 'TOTAL UNPAID LITERS' : 'TOTAL LITERS';
  return [
    DIVIDER,
    `*${orderLabel} : ${formatCountIn(orders)}*`,
    `*${literLabel} : ${formatQtyIn(liters)}*`,
  ];
}

function buildSectorWiseMessage(
  payload: ReportPayload,
  mode: ReportShareMode,
  periodLabel: string,
  updatedLabel: string,
  payCtx: WhatsAppPaymentContext
): FormattedWhatsAppReport {
  const subtitle =
    mode === 'status'
      ? payCtx.titleSuffix
        ? `Sector ${payCtx.titleSuffix} Order Status`
        : 'Sector Order Status'
      : payCtx.titleSuffix
      ? `Sector ${payCtx.titleSuffix} Detailed Report`
      : 'Detailed Report';

  const lines = buildHeaderLines(subtitle, periodLabel, updatedLabel, payCtx);

  const rollup = reconcileRollupRows(payload.sectorRows);
  const direct = payload.divisionDirectBreakdown;
  const hasDirect = direct.totalOrders > 0;

  const grandOrders = rollup.orders + (hasDirect ? direct.totalOrders : 0);
  const grandLiters = addCents(rollup.liters, hasDirect ? direct.totalLiters : 0);
  const grandAmount = addCents(rollup.totalAmount, hasDirect ? direct.totalAmount : 0);
  const grandCash = addCents(rollup.cashAmount, hasDirect ? direct.cashAmount : 0);
  const grandUpi = addCents(rollup.upiAmount, hasDirect ? direct.upiAmount : 0);
  const grandUnpaid = addCents(rollup.unpaidAmount, hasDirect ? direct.unpaidAmount : 0);

  const sectorCount = payload.sectorRows.length;
  const tagPrefix = payCtx.sectionTag ? `${payCtx.sectionTag} — ` : '';

  if (mode === 'status') {
    lines.push(`*${tagPrefix}SECTOR-WISE SUMMARY (${sectorCount} SECTORS)*`);
    lines.push('');
    if (sectorCount === 0 && !hasDirect) {
      lines.push('No sector records match the current filters.');
    } else {
      payload.sectorRows.forEach((sec, idx) => {
        lines.push(
          `${pad2(idx + 1)}. ${cleanName(sec.sectorName)} — ${formatOrdersLabel(sec.orders, payCtx.orderQualifier)} | ${formatQtyIn(sec.liters)}`
        );
      });
      if (hasDirect) {
        lines.push(
          `Division Direct — ${formatOrdersLabel(direct.totalOrders, payCtx.orderQualifier)} | ${formatQtyIn(direct.totalLiters)}`
        );
      }
    }
    lines.push(...buildStatusGrandTotalLines(payCtx, grandOrders, grandLiters));
  } else {
    lines.push(`*${tagPrefix}SECTOR-WISE DETAILED (${sectorCount} SECTORS)*`);
    lines.push('');
    if (sectorCount === 0 && !hasDirect) {
      lines.push('No sector records match the current filters.');
    } else {
      payload.sectorRows.forEach((sec, idx) => {
        lines.push(
          `${pad2(idx + 1)}. *${cleanName(sec.sectorName)}* — ${formatOrdersLabel(sec.orders, payCtx.orderQualifier)} | ${formatQtyIn(sec.liters)}`
        );
        lines.push(
          ...buildDetailedRowAmountLines(payCtx, {
            cash: sec.cashAmount,
            upi: sec.upiAmount,
            unpaid: sec.unpaidAmount,
            total: sec.totalAmount,
          })
        );
        if (idx < sectorCount - 1 || hasDirect) {
          lines.push('');
        }
      });
      if (hasDirect) {
        lines.push(
          `*Division Direct* — ${formatOrdersLabel(direct.totalOrders, payCtx.orderQualifier)} | ${formatQtyIn(direct.totalLiters)}`
        );
        lines.push(
          ...buildDetailedRowAmountLines(payCtx, {
            cash: direct.cashAmount,
            upi: direct.upiAmount,
            unpaid: direct.unpaidAmount,
            total: direct.totalAmount,
          })
        );
      }
    }
    lines.push(
      ...buildDetailedGrandTotalLines(payCtx, {
        orders: grandOrders,
        liters: grandLiters,
        cash: grandCash,
        upi: grandUpi,
        unpaid: grandUnpaid,
        total: grandAmount,
      })
    );
  }

  const text = lines.join('\n');
  return {
    text,
    title: `SSF Wandoor Division — ${subtitle}`,
    mode,
    lineCount: lines.length,
    encodedLength: encodeURIComponent(text).length,
  };
}

function buildUnitGroupedMessage(
  payload: ReportPayload,
  mode: ReportShareMode,
  periodLabel: string,
  updatedLabel: string,
  payCtx: WhatsAppPaymentContext
): FormattedWhatsAppReport {
  const subtitle =
    mode === 'status'
      ? payCtx.titleSuffix
        ? `${payCtx.titleSuffix} Unit Order Status`
        : 'Unit Order Status'
      : payCtx.titleSuffix
      ? `${payCtx.titleSuffix} Detailed Report`
      : 'Detailed Report';

  const lines = buildHeaderLines(subtitle, periodLabel, updatedLabel, payCtx);

  // Group all unit rows by Sector
  const sectorGroups = new Map<
    string,
    {
      sectorName: string;
      totalOrders: number;
      totalLiters: number;
      units: ReportUnitSummaryRow[];
    }
  >();
  for (const unit of payload.unitRows) {
    const sName = cleanName(unit.sectorName, 'Other Sector');
    const key = `${unit.sectorId ?? 0}::${sName.toLowerCase()}`;
    const group = sectorGroups.get(key) ?? {
      sectorName: sName,
      totalOrders: 0,
      totalLiters: 0,
      units: [],
    };
    group.totalOrders += unit.orders;
    group.totalLiters = addCents(group.totalLiters, unit.liters);
    group.units.push(unit);
    sectorGroups.set(key, group);
  }

  const orderedGroups = [...sectorGroups.values()].sort((a, b) => {
    if (b.totalLiters !== a.totalLiters) return b.totalLiters - a.totalLiters;
    return a.sectorName.localeCompare(b.sectorName);
  });

  const rollup = reconcileRollupRows(payload.unitRows);
  const includeDirect =
    payload.config.scope === 'ENTIRE_DIVISION' &&
    payload.divisionDirectBreakdown.totalOrders > 0;
  const direct = payload.divisionDirectBreakdown;

  const grandOrders = rollup.orders + (includeDirect ? direct.totalOrders : 0);
  const grandLiters = addCents(rollup.liters, includeDirect ? direct.totalLiters : 0);
  const grandAmount = addCents(rollup.totalAmount, includeDirect ? direct.totalAmount : 0);
  const grandCash = addCents(rollup.cashAmount, includeDirect ? direct.cashAmount : 0);
  const grandUpi = addCents(rollup.upiAmount, includeDirect ? direct.upiAmount : 0);
  const grandUnpaid = addCents(rollup.unpaidAmount, includeDirect ? direct.unpaidAmount : 0);

  if (orderedGroups.length === 0 && !includeDirect) {
    lines.push('No unit records match the current filters.');
  } else {
    orderedGroups.forEach((group, gIdx) => {
      lines.push(
        `${formatSectorBoldHeader(group.sectorName)} (${formatOrdersLabel(group.totalOrders, payCtx.orderQualifier)} | ${formatQtyIn(group.totalLiters)})`
      );
      group.units.forEach((unit, uIdx) => {
        const safeUnit = cleanName(unit.unitName);
        if (mode === 'status') {
          lines.push(
            `${pad2(uIdx + 1)}. ${safeUnit} — ${formatOrdersLabel(unit.orders, payCtx.orderQualifier)} | ${formatQtyIn(unit.liters)}`
          );
        } else {
          lines.push(
            `${pad2(uIdx + 1)}. ${safeUnit} — ${formatOrdersLabel(unit.orders, payCtx.orderQualifier)} | ${formatQtyIn(unit.liters)}`
          );
          lines.push(
            ...buildDetailedRowAmountLines(payCtx, {
              cash: unit.cashAmount,
              upi: unit.upiAmount,
              unpaid: unit.unpaidAmount,
              total: unit.totalAmount,
            })
          );
        }
      });
      if (gIdx < orderedGroups.length - 1 || includeDirect) {
        lines.push('');
      }
    });

    if (includeDirect) {
      lines.push(
        `*DIVISION DIRECT* (${formatOrdersLabel(direct.totalOrders, payCtx.orderQualifier)} | ${formatQtyIn(direct.totalLiters)})`
      );
      if (mode === 'status') {
        lines.push(
          `01. Division Direct — ${formatOrdersLabel(direct.totalOrders, payCtx.orderQualifier)} | ${formatQtyIn(direct.totalLiters)}`
        );
      } else {
        lines.push(
          `01. Division Direct — ${formatOrdersLabel(direct.totalOrders, payCtx.orderQualifier)} | ${formatQtyIn(direct.totalLiters)}`
        );
        lines.push(
          ...buildDetailedRowAmountLines(payCtx, {
            cash: direct.cashAmount,
            upi: direct.upiAmount,
            unpaid: direct.unpaidAmount,
            total: direct.totalAmount,
          })
        );
      }
    }
  }

  if (mode === 'status') {
    lines.push(...buildStatusGrandTotalLines(payCtx, grandOrders, grandLiters));
  } else {
    lines.push(
      ...buildDetailedGrandTotalLines(payCtx, {
        orders: grandOrders,
        liters: grandLiters,
        cash: grandCash,
        upi: grandUpi,
        unpaid: grandUnpaid,
        total: grandAmount,
      })
    );
  }

  const text = lines.join('\n');
  return {
    text,
    title: `SSF Wandoor Division — ${subtitle}`,
    mode,
    lineCount: lines.length,
    encodedLength: encodeURIComponent(text).length,
  };
}

/**
 * Customer-level Delivery Sheet or Unpaid Dues list for Sector/Division/Unit scopes.
 * - Delivery Sheet includes `[ ]` handover markers + customer name + qty + payment status (+ mobile & amount in Detailed mode).
 * - Unpaid Dues includes explicit `Unpaid` status + customer name + qty (+ mobile & due amount in Detailed mode).
 */
function buildCustomerOrderListMessage(
  payload: ReportPayload,
  mode: ReportShareMode,
  periodLabel: string,
  updatedLabel: string,
  payCtx: WhatsAppPaymentContext
): FormattedWhatsAppReport {
  const isDelivery = payload.config.template === 'DELIVERY_SHEET';
  const isUnpaidTemplate = payload.config.template === 'UNPAID_DUES';
  const isDirect = payload.config.scope === 'DIVISION_DIRECT';
  const isMultiUnit =
    payload.config.scope === 'ENTIRE_DIVISION' ||
    payload.config.scope === 'SECTOR_SPECIFIC' ||
    payload.config.scope === 'ENTIRE_SECTOR';

  const subtitle = isDelivery
    ? payCtx.titleSuffix
      ? `Delivery Sheet (${payCtx.titleSuffix})`
      : 'Delivery Sheet'
    : isUnpaidTemplate
    ? 'Unpaid Dues List'
    : isDirect
    ? payCtx.titleSuffix
      ? `Division Direct — ${payCtx.titleSuffix} Orders`
      : mode === 'status'
      ? 'Division Direct Order Status'
      : 'Division Direct Detailed Report'
    : payCtx.titleSuffix
    ? `Unit ${payCtx.titleSuffix} Orders`
    : mode === 'status'
    ? 'Unit Order Status'
    : 'Unit Detailed Report';

  const lines = buildHeaderLines(subtitle, periodLabel, updatedLabel, payCtx);

  const orderInputs = payload.orderRows.map((r) => ({
    quantity: r.quantity,
    unit_rate_applied: r.unitRateApplied,
    total_amount: r.totalAmount,
    payment_status: r.paymentStatus,
    payment_mode: r.paymentMode,
    is_deleted: false,
  }));
  const reconciled = reconcileOrderEntries(orderInputs, payload.unitRate);

  const renderOrderRowLines = (order: ReportOrderRow, idx: number): string[] => {
    const custName = cleanName(order.contributorName);
    const payLabel = formatOrderPaymentShort(
      order.paymentStatus,
      order.paymentMode
    );
    const prefix = isDelivery ? `[ ] ${pad2(idx + 1)}.` : `${pad2(idx + 1)}.`;
    const unitTag =
      isMultiUnit && !order.isDivisionDirect && order.unitName
        ? ` (${cleanName(order.unitName)})`
        : '';

    if (mode === 'status') {
      // Strictly ZERO money in Default Status mode, while preserving payment status / delivery state
      return [
        `${prefix} ${custName}${unitTag} — ${formatQtyIn(order.quantity)} | ${payLabel}`,
      ];
    }

    const phonePart = order.mobileNumber ? `Ph: ${order.mobileNumber} | ` : '';
    const amountLabel =
      order.paymentStatus === 'UNPAID' ? 'Due' : 'Total';
    return [
      `${prefix} ${custName}${unitTag} — ${formatQtyIn(order.quantity)}`,
      `    ${phonePart}${payLabel} | ${amountLabel}: *${formatPdfCurrency(order.totalAmount)}*`,
    ];
  };

  if (isMultiUnit) {
    // Group customer rows by Sector (Bold *SECTOR*) so multi-sector lists stay cleanly organized
    const groups = new Map<
      string,
      { sectorName: string; isDirectGroup: boolean; orders: ReportOrderRow[]; totalLiters: number }
    >();

    for (const row of payload.orderRows) {
      const isDirectRow = row.isDivisionDirect;
      const sName = isDirectRow
        ? 'Division Direct'
        : cleanName(row.sectorName, 'Other Sector');
      const key = isDirectRow ? '__direct__' : `${row.sectorId ?? 0}::${sName.toLowerCase()}`;
      const existing = groups.get(key) ?? {
        sectorName: sName,
        isDirectGroup: isDirectRow,
        orders: [],
        totalLiters: 0,
      };
      existing.orders.push(row);
      existing.totalLiters = addCents(existing.totalLiters, row.quantity);
      groups.set(key, existing);
    }

    const orderedGroups = [...groups.values()].sort((a, b) => {
      if (a.isDirectGroup !== b.isDirectGroup) return a.isDirectGroup ? 1 : -1;
      return a.sectorName.localeCompare(b.sectorName);
    });

    if (orderedGroups.length === 0) {
      lines.push('No matching orders found.');
    } else {
      orderedGroups.forEach((group, gIdx) => {
        const heading = group.isDirectGroup
          ? '*DIVISION DIRECT*'
          : formatSectorBoldHeader(group.sectorName);
        lines.push(
          `${heading} (${formatOrdersLabel(group.orders.length, payCtx.orderQualifier)} | ${formatQtyIn(group.totalLiters)})`
        );
        group.orders.forEach((order, oIdx) => {
          lines.push(...renderOrderRowLines(order, oIdx));
        });
        if (gIdx < orderedGroups.length - 1) {
          lines.push('');
        }
      });
    }
  } else {
    if (isDirect) {
      lines.push(
        `*DIVISION DIRECT* (${formatOrdersLabel(reconciled.totalOrders, payCtx.orderQualifier)} | ${formatQtyIn(reconciled.totalLiters)})`
      );
    } else {
      const sectorName =
        payload.orderRows[0]?.sectorName ||
        payload.unitRows[0]?.sectorName ||
        extractSectorFromScopeSubtitle(payload.scopeSubtitle) ||
        'Sector';
      const unitName =
        payload.orderRows[0]?.unitName ||
        payload.unitRows[0]?.unitName ||
        extractUnitFromScopeSubtitle(payload.scopeSubtitle) ||
        'Unit';
      lines.push(formatSectorBoldHeader(sectorName));
      lines.push(
        `${cleanName(unitName)} — ${formatOrdersLabel(reconciled.totalOrders, payCtx.orderQualifier)} | ${formatQtyIn(reconciled.totalLiters)}`
      );
    }

    if (payload.orderRows.length > 0) {
      lines.push('');
      const listHeading = isDelivery
        ? `*DELIVERY LIST (${formatCountIn(payload.orderRows.length)})*`
        : payCtx.isUnpaidOnly
        ? `*UNPAID ORDERS (${formatCountIn(payload.orderRows.length)})*`
        : payCtx.isPaidOnly
        ? `*${payCtx.sectionTag} ORDERS (${formatCountIn(payload.orderRows.length)})*`
        : mode === 'status'
        ? `*ORDER LIST (${formatCountIn(payload.orderRows.length)})*`
        : `*ORDERS DETAILED (${formatCountIn(payload.orderRows.length)})*`;
      lines.push(listHeading);
      payload.orderRows.forEach((order, idx) => {
        lines.push(...renderOrderRowLines(order, idx));
      });
    }
  }

  if (mode === 'status') {
    lines.push(
      ...buildStatusGrandTotalLines(
        payCtx,
        reconciled.totalOrders,
        reconciled.totalLiters
      )
    );
  } else {
    lines.push(
      ...buildDetailedGrandTotalLines(payCtx, {
        orders: reconciled.totalOrders,
        liters: reconciled.totalLiters,
        cash: reconciled.cashAmount,
        upi: reconciled.upiAmount,
        unpaid: reconciled.unpaidAmount,
        total: reconciled.totalAmount,
      })
    );
  }

  const text = lines.join('\n');
  return {
    text,
    title: `SSF Wandoor Division — ${subtitle}`,
    mode,
    lineCount: lines.length,
    encodedLength: encodeURIComponent(text).length,
  };
}

function extractSectorFromScopeSubtitle(subtitle: string): string {
  // Formats like: "Unit Report — Pallipadi (WDR101) • Kodasseri Sector"
  if (subtitle.includes('•')) {
    return subtitle.split('•')[1]?.trim() ?? '';
  }
  return '';
}

function extractUnitFromScopeSubtitle(subtitle: string): string {
  // Formats like: "Unit Report — Pallipadi (WDR101) • Kodasseri Sector"
  const afterDash = subtitle.split(/[—-]/).slice(1).join('-').trim();
  const beforeBullet = afterDash.split('•')[0]?.trim() ?? '';
  return beforeBullet.replace(/\s*\([^)]*\)/g, '').trim();
}

/**
 * Pure structured WhatsApp formatter integrated with the shared PDF report engine.
 * - Default mode is `'status'` (`Order Status` only — strictly ZERO money).
 * - Opt-in `'detailed'` mode shares full accounting breakdown matching `pdfAccounting.ts`.
 * - Every report type (Unpaid, Paid Cash/UPI, Delivery Sheet, Sector/Unit Summary, Detailed Orders)
 *   carries its own explicit status header, tailored row fields, and totals.
 * - Enforces zero-padded `01.` numbering, `━━━━━━━━━━━━━━━━━━` dividers, bold `*SECTOR*`
 *   headers + normal-weight unit rows, and zero exposed `Order Code`.
 * - Uses full filtered dataset (never truncated to 10-per-page UI pagination).
 */
export function buildWhatsAppReportText({
  source,
  config,
  mode = 'status',
  now = new Date(),
}: BuildWhatsAppReportInput): FormattedWhatsAppReport {
  const updatedLabel = formatUpdatedTimestamp(now);
  const currentPayload = buildReportPayload(source, config, now);
  const periodLabel = formatPeriodLabel(currentPayload.config, now);
  const payCtx = resolvePaymentContext(currentPayload.config);

  // Delivery Sheet (all portals/scopes) or Single-Unit / Division Direct scopes -> customer-level list
  if (
    currentPayload.config.template === 'DELIVERY_SHEET' ||
    currentPayload.config.scope === 'THIS_UNIT' ||
    currentPayload.config.scope === 'UNIT_SPECIFIC' ||
    currentPayload.config.scope === 'DIVISION_DIRECT'
  ) {
    return buildCustomerOrderListMessage(
      currentPayload,
      mode,
      periodLabel,
      updatedLabel,
      payCtx
    );
  }

  // Unpaid Dues on a Sector scope -> customer-level Unpaid Dues collection list
  if (
    currentPayload.config.template === 'UNPAID_DUES' &&
    (currentPayload.config.scope === 'SECTOR_SPECIFIC' ||
      currentPayload.config.scope === 'ENTIRE_SECTOR')
  ) {
    return buildCustomerOrderListMessage(
      currentPayload,
      mode,
      periodLabel,
      updatedLabel,
      payCtx
    );
  }

  // Division Sector-wise
  if (
    source.role === 'ADMIN' &&
    currentPayload.config.scope === 'ENTIRE_DIVISION' &&
    currentPayload.config.template === 'SECTOR_SUMMARY'
  ) {
    return buildSectorWiseMessage(
      currentPayload,
      mode,
      periodLabel,
      updatedLabel,
      payCtx
    );
  }

  // Division Unit-wise / Specific Sector / Sector Portal -> Unit list grouped under Bold Sector header
  const unitPayload =
    currentPayload.config.template === 'UNIT_SUMMARY'
      ? currentPayload
      : buildReportPayload(
          source,
          { ...currentPayload.config, template: 'UNIT_SUMMARY' },
          now
        );

  return buildUnitGroupedMessage(
    unitPayload,
    mode,
    periodLabel,
    updatedLabel,
    payCtx
  );
}
