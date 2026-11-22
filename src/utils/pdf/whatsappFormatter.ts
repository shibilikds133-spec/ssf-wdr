import {
  buildReportPayload,
  getIstDateKey,
  type ReportDataSource,
  type ReportFilterConfig,
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

function formatOrdersLabel(count: number): string {
  const safe = Number.isFinite(count) ? Math.round(count) : 0;
  return `${formatCountIn(safe)} ${safe === 1 ? 'Order' : 'Orders'}`;
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
  updatedLabel: string
): string[] {
  return [
    '*SSF WANDOOR DIVISION*',
    `Payasam Challenge — ${subtitle}`,
    `Period : ${periodLabel}`,
    `Updated: ${updatedLabel}`,
    DIVIDER,
  ];
}

function buildDetailedGrandTotalLines(params: {
  orders: number;
  liters: number;
  cash: number;
  upi: number;
  unpaid: number;
  total: number;
}): string[] {
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

function buildStatusGrandTotalLines(orders: number, liters: number): string[] {
  return [
    DIVIDER,
    `*TOTAL ORDERS : ${formatCountIn(orders)}*`,
    `*TOTAL LITERS : ${formatQtyIn(liters)}*`,
  ];
}

function buildSectorWiseMessage(
  payload: ReportPayload,
  mode: ReportShareMode,
  periodLabel: string,
  updatedLabel: string
): FormattedWhatsAppReport {
  const lines = buildHeaderLines(
    mode === 'status' ? 'Sector Order Status' : 'Detailed Report',
    periodLabel,
    updatedLabel
  );

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

  if (mode === 'status') {
    lines.push(`*SECTOR-WISE SUMMARY (${sectorCount} SECTORS)*`);
    lines.push('');
    if (sectorCount === 0 && !hasDirect) {
      lines.push('No sector records match the current filters.');
    } else {
      payload.sectorRows.forEach((sec, idx) => {
        lines.push(
          `${pad2(idx + 1)}. ${cleanName(sec.sectorName)} — ${formatOrdersLabel(sec.orders)} | ${formatQtyIn(sec.liters)}`
        );
      });
      if (hasDirect) {
        lines.push(
          `Division Direct — ${formatOrdersLabel(direct.totalOrders)} | ${formatQtyIn(direct.totalLiters)}`
        );
      }
    }
    lines.push(...buildStatusGrandTotalLines(grandOrders, grandLiters));
  } else {
    lines.push(`*SECTOR-WISE DETAILED (${sectorCount} SECTORS)*`);
    lines.push('');
    if (sectorCount === 0 && !hasDirect) {
      lines.push('No sector records match the current filters.');
    } else {
      payload.sectorRows.forEach((sec, idx) => {
        lines.push(
          `${pad2(idx + 1)}. *${cleanName(sec.sectorName)}* — ${formatOrdersLabel(sec.orders)} | ${formatQtyIn(sec.liters)}`
        );
        lines.push(
          `    Cash: ${formatPdfCurrency(sec.cashAmount)} | UPI: ${formatPdfCurrency(sec.upiAmount)} | Unpaid: ${formatPdfCurrency(sec.unpaidAmount)}`
        );
        lines.push(`    Total: *${formatPdfCurrency(sec.totalAmount)}*`);
        if (idx < sectorCount - 1 || hasDirect) {
          lines.push('');
        }
      });
      if (hasDirect) {
        lines.push(
          `*Division Direct* — ${formatOrdersLabel(direct.totalOrders)} | ${formatQtyIn(direct.totalLiters)}`
        );
        lines.push(
          `    Cash: ${formatPdfCurrency(direct.cashAmount)} | UPI: ${formatPdfCurrency(direct.upiAmount)} | Unpaid: ${formatPdfCurrency(direct.unpaidAmount)}`
        );
        lines.push(`    Total: *${formatPdfCurrency(direct.totalAmount)}*`);
      }
    }
    lines.push(
      ...buildDetailedGrandTotalLines({
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
    title: 'SSF Wandoor Division — Sector Report',
    mode,
    lineCount: lines.length,
    encodedLength: encodeURIComponent(text).length,
  };
}

function buildUnitGroupedMessage(
  payload: ReportPayload,
  mode: ReportShareMode,
  periodLabel: string,
  updatedLabel: string
): FormattedWhatsAppReport {
  const lines = buildHeaderLines(
    mode === 'status' ? 'Unit Order Status' : 'Detailed Report',
    periodLabel,
    updatedLabel
  );

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
        `${formatSectorBoldHeader(group.sectorName)} (${formatOrdersLabel(group.totalOrders)} | ${formatQtyIn(group.totalLiters)})`
      );
      group.units.forEach((unit, uIdx) => {
        const safeUnit = cleanName(unit.unitName);
        if (mode === 'status') {
          lines.push(
            `${pad2(uIdx + 1)}. ${safeUnit} — ${formatOrdersLabel(unit.orders)} | ${formatQtyIn(unit.liters)}`
          );
        } else {
          lines.push(
            `${pad2(uIdx + 1)}. ${safeUnit} — ${formatOrdersLabel(unit.orders)} | ${formatQtyIn(unit.liters)}`
          );
          lines.push(
            `    Cash: ${formatPdfCurrency(unit.cashAmount)} | UPI: ${formatPdfCurrency(unit.upiAmount)} | Unpaid: ${formatPdfCurrency(unit.unpaidAmount)}`
          );
          lines.push(`    Total: *${formatPdfCurrency(unit.totalAmount)}*`);
        }
      });
      if (gIdx < orderedGroups.length - 1 || includeDirect) {
        lines.push('');
      }
    });

    if (includeDirect) {
      lines.push(
        `*DIVISION DIRECT* (${formatOrdersLabel(direct.totalOrders)} | ${formatQtyIn(direct.totalLiters)})`
      );
      if (mode === 'status') {
        lines.push(
          `01. Division Direct — ${formatOrdersLabel(direct.totalOrders)} | ${formatQtyIn(direct.totalLiters)}`
        );
      } else {
        lines.push(
          `01. Division Direct — ${formatOrdersLabel(direct.totalOrders)} | ${formatQtyIn(direct.totalLiters)}`
        );
        lines.push(
          `    Cash: ${formatPdfCurrency(direct.cashAmount)} | UPI: ${formatPdfCurrency(direct.upiAmount)} | Unpaid: ${formatPdfCurrency(direct.unpaidAmount)}`
        );
        lines.push(`    Total: *${formatPdfCurrency(direct.totalAmount)}*`);
      }
    }
  }

  if (mode === 'status') {
    lines.push(...buildStatusGrandTotalLines(grandOrders, grandLiters));
  } else {
    lines.push(
      ...buildDetailedGrandTotalLines({
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
    title: 'SSF Wandoor Division — Unit Report',
    mode,
    lineCount: lines.length,
    encodedLength: encodeURIComponent(text).length,
  };
}

function buildSingleUnitOrDirectMessage(
  payload: ReportPayload,
  mode: ReportShareMode,
  periodLabel: string,
  updatedLabel: string
): FormattedWhatsAppReport {
  const isDirect = payload.config.scope === 'DIVISION_DIRECT';
  const subtitle = isDirect
    ? mode === 'status'
      ? 'Division Direct Order Status'
      : 'Division Direct Detailed Report'
    : mode === 'status'
    ? 'Unit Order Status'
    : 'Unit Detailed Report';

  const lines = buildHeaderLines(subtitle, periodLabel, updatedLabel);

  // Reconcile using cent-integer math from pdfAccounting directly
  const orderInputs = payload.orderRows.map((r) => ({
    quantity: r.quantity,
    unit_rate_applied: r.unitRateApplied,
    total_amount: r.totalAmount,
    payment_status: r.paymentStatus,
    payment_mode: r.paymentMode,
    is_deleted: false,
  }));
  const reconciled = reconcileOrderEntries(orderInputs, payload.unitRate);

  if (isDirect) {
    lines.push(
      `*DIVISION DIRECT* (${formatOrdersLabel(reconciled.totalOrders)} | ${formatQtyIn(reconciled.totalLiters)})`
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
      `${cleanName(unitName)} — ${formatOrdersLabel(reconciled.totalOrders)} | ${formatQtyIn(reconciled.totalLiters)}`
    );
  }

  // Append customer breakdown on delivery/unpaid/direct/detailed order lists
  const includeCustomerRows =
    payload.orderRows.length > 0 &&
    (isDirect ||
      payload.config.template === 'DELIVERY_SHEET' ||
      payload.config.template === 'UNPAID_DUES' ||
      payload.config.template === 'DETAILED_ORDERS');

  if (includeCustomerRows) {
    lines.push('');
    lines.push(
      mode === 'status'
        ? `*ORDER LIST (${formatCountIn(payload.orderRows.length)})*`
        : `*ORDERS DETAILED (${formatCountIn(payload.orderRows.length)})*`
    );
    payload.orderRows.forEach((order, idx) => {
      const custName = cleanName(order.contributorName);
      if (mode === 'status') {
        lines.push(`${pad2(idx + 1)}. ${custName} — ${formatQtyIn(order.quantity)}`);
      } else {
        const payLabel = formatOrderPaymentShort(
          order.paymentStatus,
          order.paymentMode
        );
        lines.push(`${pad2(idx + 1)}. ${custName} — ${formatQtyIn(order.quantity)}`);
        lines.push(
          `    ${payLabel} | Total: *${formatPdfCurrency(order.totalAmount)}*`
        );
      }
    });
  }

  if (mode === 'status') {
    lines.push(
      ...buildStatusGrandTotalLines(reconciled.totalOrders, reconciled.totalLiters)
    );
  } else {
    lines.push(
      ...buildDetailedGrandTotalLines({
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
    title: isDirect
      ? 'SSF Wandoor Division — Division Direct'
      : 'SSF Wandoor Division — Unit Report',
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

  // Single-unit or Division Direct scopes
  if (
    currentPayload.config.scope === 'THIS_UNIT' ||
    currentPayload.config.scope === 'UNIT_SPECIFIC' ||
    currentPayload.config.scope === 'DIVISION_DIRECT'
  ) {
    return buildSingleUnitOrDirectMessage(
      currentPayload,
      mode,
      periodLabel,
      updatedLabel
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
      updatedLabel
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

  return buildUnitGroupedMessage(unitPayload, mode, periodLabel, updatedLabel);
}
