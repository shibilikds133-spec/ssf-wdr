import {
  buildReportPayload,
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

const DIVIDER = '────────────────────';
const IST_TIMEZONE = 'Asia/Kolkata';

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

function formatOrderPaymentShort(
  status: 'PAID' | 'UNPAID',
  mode: 'CASH' | 'UPI' | null
): string {
  if (status === 'UNPAID') return 'Unpaid';
  if (mode === 'UPI') return 'Paid/UPI';
  if (mode === 'CASH') return 'Paid/Cash';
  return 'Paid';
}

function addCents(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(b * 100)) / 100;
}

function buildSectorWiseMessage(
  payload: ReportPayload,
  mode: ReportShareMode,
  updatedLabel: string
): FormattedWhatsAppReport {
  const lines: string[] = [
    '*SSF WANDOOR DIVISION*',
    mode === 'status'
      ? '_Palada Payasam Challenge — Sector Order Status_'
      : '_Palada Payasam Challenge — Detailed Sector Report_',
    `Updated: ${updatedLabel}`,
    '',
  ];

  const rollup = reconcileRollupRows(payload.sectorRows);
  const direct = payload.divisionDirectBreakdown;
  const hasDirect = direct.totalOrders > 0;

  const grandOrders = rollup.orders + (hasDirect ? direct.totalOrders : 0);
  const grandLiters = addCents(rollup.liters, hasDirect ? direct.totalLiters : 0);
  const grandAmount = addCents(rollup.totalAmount, hasDirect ? direct.totalAmount : 0);
  const grandCash = addCents(rollup.cashAmount, hasDirect ? direct.cashAmount : 0);
  const grandUpi = addCents(rollup.upiAmount, hasDirect ? direct.upiAmount : 0);
  const grandUnpaid = addCents(rollup.unpaidAmount, hasDirect ? direct.unpaidAmount : 0);

  if (mode === 'status') {
    lines.push('*SECTOR-WISE STATUS*');
    if (payload.sectorRows.length === 0 && !hasDirect) {
      lines.push('No sector records match the current filters.');
    } else {
      payload.sectorRows.forEach((sec, idx) => {
        const orderWord = sec.orders === 1 ? 'Order' : 'Orders';
        lines.push(
          `${idx + 1}. ${cleanName(sec.sectorName)} : ${formatQtyIn(sec.liters)} (${formatCountIn(sec.orders)} ${orderWord})`
        );
      });
      if (hasDirect) {
        const directWord = direct.totalOrders === 1 ? 'Order' : 'Orders';
        lines.push(
          `Division Direct : ${formatQtyIn(direct.totalLiters)} (${formatCountIn(direct.totalOrders)} ${directWord})`
        );
      }
    }
    lines.push(DIVIDER);
    const totalWord = grandOrders === 1 ? 'Order' : 'Orders';
    lines.push(
      `*TOTAL : ${formatQtyIn(grandLiters)} (${formatCountIn(grandOrders)} ${totalWord})*`
    );
  } else {
    lines.push('*SUMMARY*');
    lines.push(`Total Liters : ${formatQtyIn(grandLiters)}`);
    lines.push(`Total Orders : ${formatCountIn(grandOrders)}`);
    lines.push(`Total Amount : ${formatPdfCurrency(grandAmount)}`);
    lines.push(`Paid (Cash)  : ${formatPdfCurrency(grandCash)}`);
    lines.push(`Paid (UPI)   : ${formatPdfCurrency(grandUpi)}`);
    lines.push(`Unpaid       : ${formatPdfCurrency(grandUnpaid)}`);
    lines.push('');
    lines.push('*SECTOR BREAKDOWN*');
    if (payload.sectorRows.length === 0 && !hasDirect) {
      lines.push('No sector records match the current filters.');
    } else {
      payload.sectorRows.forEach((sec, idx) => {
        const orderWord = sec.orders === 1 ? 'Order' : 'Orders';
        lines.push(
          `${idx + 1}. ${cleanName(sec.sectorName)} — ${formatQtyIn(sec.liters)} (${formatCountIn(sec.orders)} ${orderWord})`
        );
        lines.push(
          `   Total: ${formatPdfCurrency(sec.totalAmount)} | Cash: ${formatPdfCurrency(sec.cashAmount)} | UPI: ${formatPdfCurrency(sec.upiAmount)} | Unpaid: ${formatPdfCurrency(sec.unpaidAmount)}`
        );
      });
      if (hasDirect) {
        const directWord = direct.totalOrders === 1 ? 'Order' : 'Orders';
        lines.push(
          `Division Direct — ${formatQtyIn(direct.totalLiters)} (${formatCountIn(direct.totalOrders)} ${directWord})`
        );
        lines.push(
          `   Total: ${formatPdfCurrency(direct.totalAmount)} | Cash: ${formatPdfCurrency(direct.cashAmount)} | UPI: ${formatPdfCurrency(direct.upiAmount)} | Unpaid: ${formatPdfCurrency(direct.unpaidAmount)}`
        );
      }
    }
    lines.push(DIVIDER);
    const totalWord = grandOrders === 1 ? 'Order' : 'Orders';
    lines.push(
      `*GRAND TOTAL : ${formatQtyIn(grandLiters)} | ${formatCountIn(grandOrders)} ${totalWord} | ${formatPdfCurrency(grandAmount)}*`
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
  updatedLabel: string,
  isSingleSectorScope: boolean
): FormattedWhatsAppReport {
  const subtitle =
    mode === 'status'
      ? '_Palada Payasam Challenge — Unit Order Status_'
      : '_Palada Payasam Challenge — Detailed Unit Report_';

  const lines: string[] = [
    '*SSF WANDOOR DIVISION*',
    subtitle,
    `Updated: ${updatedLabel}`,
    '',
  ];

  // Group all unit rows by Sector
  const sectorGroups = new Map<
    string,
    { sectorName: string; totalLiters: number; units: ReportUnitSummaryRow[] }
  >();
  for (const unit of payload.unitRows) {
    const sName = cleanName(unit.sectorName, 'Other Sector');
    const key = `${unit.sectorId ?? 0}::${sName.toLowerCase()}`;
    const group = sectorGroups.get(key) ?? {
      sectorName: sName,
      totalLiters: 0,
      units: [],
    };
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
    lines.push('');
  } else {
    orderedGroups.forEach((group, gIdx) => {
      lines.push(formatSectorBoldHeader(group.sectorName));
      group.units.forEach((unit, uIdx) => {
        const orderWord = unit.orders === 1 ? 'Order' : 'Orders';
        const safeUnit = cleanName(unit.unitName);
        if (mode === 'status') {
          lines.push(
            `${uIdx + 1}. ${safeUnit} : ${formatQtyIn(unit.liters)} (${formatCountIn(unit.orders)} ${orderWord})`
          );
        } else {
          lines.push(
            `${uIdx + 1}. ${safeUnit} — ${formatQtyIn(unit.liters)} (${formatCountIn(unit.orders)} ${orderWord})`
          );
          lines.push(
            `   Total: ${formatPdfCurrency(unit.totalAmount)} | Cash: ${formatPdfCurrency(unit.cashAmount)} | UPI: ${formatPdfCurrency(unit.upiAmount)} | Unpaid: ${formatPdfCurrency(unit.unpaidAmount)}`
          );
        }
      });
      if (gIdx < orderedGroups.length - 1 || includeDirect) {
        lines.push('');
      }
    });

    if (includeDirect) {
      lines.push('*DIVISION DIRECT*');
      const directWord = direct.totalOrders === 1 ? 'Order' : 'Orders';
      if (mode === 'status') {
        lines.push(
          `Division Direct : ${formatQtyIn(direct.totalLiters)} (${formatCountIn(direct.totalOrders)} ${directWord})`
        );
      } else {
        lines.push(
          `Division Direct — ${formatQtyIn(direct.totalLiters)} (${formatCountIn(direct.totalOrders)} ${directWord})`
        );
        lines.push(
          `   Total: ${formatPdfCurrency(direct.totalAmount)} | Cash: ${formatPdfCurrency(direct.cashAmount)} | UPI: ${formatPdfCurrency(direct.upiAmount)} | Unpaid: ${formatPdfCurrency(direct.unpaidAmount)}`
        );
      }
    }
  }

  lines.push(DIVIDER);
  const totalWord = grandOrders === 1 ? 'Order' : 'Orders';
  if (mode === 'status') {
    const label = isSingleSectorScope ? 'SECTOR TOTAL' : 'TOTAL';
    lines.push(
      `*${label} : ${formatQtyIn(grandLiters)} (${formatCountIn(grandOrders)} ${totalWord})*`
    );
  } else {
    lines.push(
      `*TOTAL : ${formatQtyIn(grandLiters)} | ${formatCountIn(grandOrders)} ${totalWord} | ${formatPdfCurrency(grandAmount)}*`
    );
    lines.push(
      `Cash: ${formatPdfCurrency(grandCash)} | UPI: ${formatPdfCurrency(grandUpi)} | Unpaid: ${formatPdfCurrency(grandUnpaid)}`
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
  updatedLabel: string
): FormattedWhatsAppReport {
  const isDirect = payload.config.scope === 'DIVISION_DIRECT';
  const subtitle = isDirect
    ? mode === 'status'
      ? '_Palada Payasam Challenge — Division Direct Order Status_'
      : '_Palada Payasam Challenge — Division Direct Detailed Report_'
    : mode === 'status'
    ? '_Palada Payasam Challenge — Unit Order Status_'
    : '_Palada Payasam Challenge — Unit Detailed Report_';

  const lines: string[] = [
    '*SSF WANDOOR DIVISION*',
    subtitle,
    `Updated: ${updatedLabel}`,
    '',
  ];

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
    lines.push('*DIVISION DIRECT*');
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
    lines.push(cleanName(unitName));
    if (mode === 'detailed') {
      lines.push('');
    }
  }

  lines.push(`Total Liters : ${formatQtyIn(reconciled.totalLiters)}`);
  lines.push(`Total Orders : ${formatCountIn(reconciled.totalOrders)}`);

  if (mode === 'detailed') {
    lines.push(`Total Amount : ${formatPdfCurrency(reconciled.totalAmount)}`);
    lines.push(`Paid (Cash)  : ${formatPdfCurrency(reconciled.cashAmount)}`);
    lines.push(`Paid (UPI)   : ${formatPdfCurrency(reconciled.upiAmount)}`);
    lines.push(`Unpaid       : ${formatPdfCurrency(reconciled.unpaidAmount)}`);
  }

  // Append customer breakdown on delivery/unpaid/direct order lists
  const includeCustomerRows =
    payload.orderRows.length > 0 &&
    (isDirect ||
      payload.config.template === 'DELIVERY_SHEET' ||
      payload.config.template === 'UNPAID_DUES');

  if (includeCustomerRows) {
    lines.push('');
    lines.push(mode === 'status' ? '*ORDER LIST*' : '*ORDERS BREAKDOWN*');
    payload.orderRows.forEach((order, idx) => {
      const custName = cleanName(order.contributorName);
      if (mode === 'status') {
        lines.push(`${idx + 1}. ${custName} : ${formatQtyIn(order.quantity)}`);
      } else {
        const payLabel = formatOrderPaymentShort(
          order.paymentStatus,
          order.paymentMode
        );
        lines.push(
          `${idx + 1}. ${custName} — ${formatQtyIn(order.quantity)} — ${formatPdfCurrency(order.totalAmount)} (${payLabel})`
        );
      }
    });
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
 * - Enforces bold `*SECTOR*` header + normal-weight unit rows.
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

  // Single-unit or Division Direct scopes
  if (
    currentPayload.config.scope === 'THIS_UNIT' ||
    currentPayload.config.scope === 'UNIT_SPECIFIC' ||
    currentPayload.config.scope === 'DIVISION_DIRECT'
  ) {
    return buildSingleUnitOrDirectMessage(currentPayload, mode, updatedLabel);
  }

  // Division Sector-wise
  if (
    source.role === 'ADMIN' &&
    currentPayload.config.scope === 'ENTIRE_DIVISION' &&
    currentPayload.config.template === 'SECTOR_SUMMARY'
  ) {
    return buildSectorWiseMessage(currentPayload, mode, updatedLabel);
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

  const isSingleSectorScope =
    source.role === 'SECTOR' ||
    currentPayload.config.scope === 'SECTOR_SPECIFIC' ||
    currentPayload.config.scope === 'ENTIRE_SECTOR';

  return buildUnitGroupedMessage(
    unitPayload,
    mode,
    updatedLabel,
    isSingleSectorScope
  );
}
