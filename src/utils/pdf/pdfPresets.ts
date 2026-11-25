import type { ReportPayload } from '../reports';
import {
  reconcileRollupRows,
  safePercent,
  type ReportShareMode,
} from './pdfAccounting';
import {
  buildFormalPdfFilename,
  formatPdfCurrency,
  formatPdfIstDate,
  formatPdfIstTime,
  formatPdfQuantity,
  formatPdfShortDateTime,
  roundTwo,
} from './pdfTheme';
import {
  buildFormalPdfDocument,
  generateFormalPdf,
  type FormalPdfDocumentConfig,
  type PdfPresetKey,
  type PdfSectionTableConfig,
  type PdfSummaryMetric,
  type PdfTableColumn,
} from './sharedPdfEngine';

interface PaymentFilterContext {
  isUnpaidOnly: boolean;
  isPaidOnly: boolean;
  isPaidCashOnly: boolean;
  isPaidUpiOnly: boolean;
  titleBadge: string;
  statusLabel: string;
  filenameTag: string;
}

function resolvePaymentContext(payload: ReportPayload): PaymentFilterContext {
  const { template, paymentStatus, paymentMode } = payload.config;
  const isUnpaidOnly =
    template === 'UNPAID_DUES' || paymentStatus === 'UNPAID';
  const isPaidCashOnly = !isUnpaidOnly && paymentMode === 'CASH';
  const isPaidUpiOnly = !isUnpaidOnly && paymentMode === 'UPI';
  const isPaidOnly =
    !isUnpaidOnly && (paymentStatus === 'PAID' || paymentMode !== 'ALL');

  if (isUnpaidOnly) {
    return {
      isUnpaidOnly: true,
      isPaidOnly: false,
      isPaidCashOnly: false,
      isPaidUpiOnly: false,
      titleBadge: 'UNPAID ONLY',
      statusLabel: 'Unpaid Only',
      filenameTag: 'Unpaid',
    };
  }
  if (isPaidCashOnly) {
    return {
      isUnpaidOnly: false,
      isPaidOnly: true,
      isPaidCashOnly: true,
      isPaidUpiOnly: false,
      titleBadge: 'PAID — CASH',
      statusLabel: 'Paid (Cash)',
      filenameTag: 'Paid_Cash',
    };
  }
  if (isPaidUpiOnly) {
    return {
      isUnpaidOnly: false,
      isPaidOnly: true,
      isPaidCashOnly: false,
      isPaidUpiOnly: true,
      titleBadge: 'PAID — UPI',
      statusLabel: 'Paid (UPI)',
      filenameTag: 'Paid_UPI',
    };
  }
  if (isPaidOnly) {
    return {
      isUnpaidOnly: false,
      isPaidOnly: true,
      isPaidCashOnly: false,
      isPaidUpiOnly: false,
      titleBadge: 'PAID ONLY',
      statusLabel: 'Paid Only',
      filenameTag: 'Paid',
    };
  }
  return {
    isUnpaidOnly: false,
    isPaidOnly: false,
    isPaidCashOnly: false,
    isPaidUpiOnly: false,
    titleBadge: '',
    statusLabel: 'All Payments',
    filenameTag: '',
  };
}

function formatPdfOrderPayment(
  paymentStatus: 'PAID' | 'UNPAID',
  paymentMode: 'CASH' | 'UPI' | null,
  short = false
): string {
  if (paymentStatus === 'UNPAID') return 'Unpaid';
  if (paymentMode === 'UPI') return short ? 'Paid/UPI' : 'Paid (UPI)';
  if (paymentMode === 'CASH') return short ? 'Paid/Cash' : 'Paid (Cash)';
  return 'Paid';
}

function resolvePresetKey(payload: ReportPayload): PdfPresetKey {
  if (payload.config.template === 'SECTOR_SUMMARY') return 'sector_summary';
  if (payload.config.template === 'UNIT_SUMMARY') return 'unit_summary';
  if (payload.config.template === 'DELIVERY_SHEET') return 'delivery_sheet';
  if (payload.config.template === 'UNPAID_DUES') return 'unpaid_dues';
  if (payload.config.scope === 'DIVISION_DIRECT') return 'division_direct';
  return 'orders_register';
}

function deriveRateSummary(payload: ReportPayload): string {
  const rates = new Set<number>();
  for (const r of payload.orderRows) {
    const rate = roundTwo(Number(r.unitRateApplied) || 0);
    if (rate > 0) rates.add(rate);
  }
  if (rates.size > 1) return 'Mixed Rates';
  if (rates.size === 1) {
    const [onlyRate] = [...rates];
    return `${formatPdfCurrency(onlyRate)} / L`;
  }
  if (payload.unitRate > 0) {
    return `${formatPdfCurrency(payload.unitRate)} / L`;
  }
  return '-';
}

function deriveFilename(
  payload: ReportPayload,
  preset: PdfPresetKey,
  payCtx: PaymentFilterContext
): string {
  const date = new Date(payload.generatedAtIso || Date.now());
  const scopeSlugMap: Record<ReportPayload['config']['scope'], string> = {
    ENTIRE_DIVISION: 'Division',
    DIVISION_DIRECT: 'Division_Direct',
    SECTOR_SPECIFIC:
      payload.scopeSubtitle
        .replace(/^Sector Report\s*[-—]\s*/i, '')
        .split('(')[0] || 'Sector',
    UNIT_SPECIFIC:
      payload.scopeSubtitle
        .replace(/^Unit Report\s*[-—]\s*/i, '')
        .split('(')[0] || 'Unit',
    ENTIRE_SECTOR:
      payload.scopeSubtitle
        .replace(/^Sector Report\s*[-—]\s*/i, '')
        .split('(')[0] || 'Sector',
    THIS_UNIT:
      payload.scopeSubtitle
        .replace(/^Unit Report\s*[-—]\s*/i, '')
        .split('(')[0] || 'Unit',
  };
  const typeMap: Record<PdfPresetKey, string> = {
    delivery_sheet: 'Delivery_Sheet',
    unpaid_dues: 'Unpaid_Dues',
    orders_register: 'Orders_Register',
    division_direct: 'Division_Direct_Orders',
    sector_summary: 'Sector_Summary',
    unit_summary: 'Unit_Summary',
  };
  const baseType = typeMap[preset];
  const taggedType =
    payCtx.filenameTag && preset !== 'unpaid_dues'
      ? `${baseType}_${payCtx.filenameTag}`
      : baseType;

  return buildFormalPdfFilename(
    scopeSlugMap[payload.config.scope],
    taggedType,
    Number.isNaN(date.getTime()) ? new Date() : date
  );
}

/**
 * Strip internal login codes like ` (WDR101)` from formal printed scope subtitles
 * per Security & Hygiene Lock.
 */
function formatFormalScopeSubtitle(rawSubtitle: string): string {
  const cleaned = rawSubtitle.replace(/\s*\([A-Za-z0-9_-]{2,20}\)/g, '').trim();
  return `Palada Payasam Challenge  |  ${cleaned}`;
}

function addCents(a: number, b: number): number {
  return Math.round(a * 100 + b * 100) / 100;
}

/**
 * Build tailored Sector-Wise columns, rows, and grand total row based on the active payment filter.
 */
function buildSectorTableSpec(
  payload: ReportPayload,
  payCtx: PaymentFilterContext,
  includeDirectRow: boolean
): {
  columns: PdfTableColumn[];
  rows: (string | number)[][];
  totalRow: (string | number)[];
  totals: ReturnType<typeof reconcileRollupRows>;
  grandOrders: number;
  grandLiters: number;
  grandCash: number;
  grandUpi: number;
  grandUnpaid: number;
  grandTotal: number;
} {
  const totals = reconcileRollupRows(payload.sectorRows);
  const direct = payload.divisionDirectBreakdown;
  const hasDirect = includeDirectRow && direct.totalOrders > 0;

  const grandOrders = totals.orders + (hasDirect ? direct.totalOrders : 0);
  const grandLiters = addCents(totals.liters, hasDirect ? direct.totalLiters : 0);
  const grandCash = addCents(totals.cashAmount, hasDirect ? direct.cashAmount : 0);
  const grandUpi = addCents(totals.upiAmount, hasDirect ? direct.upiAmount : 0);
  const grandUnpaid = addCents(
    totals.unpaidAmount,
    hasDirect ? direct.unpaidAmount : 0
  );
  const grandTotal = addCents(
    totals.totalAmount,
    hasDirect ? direct.totalAmount : 0
  );

  if (payCtx.isUnpaidOnly) {
    const columns: PdfTableColumn[] = [
      { key: 'sl', header: 'Sl', align: 'center', widthPercent: 7 },
      { key: 'sectorName', header: 'Sector Name', align: 'left', widthPercent: 34, bold: true },
      { key: 'units', header: 'Units', align: 'center', widthPercent: 12 },
      { key: 'orders', header: 'Unpaid Orders', align: 'right', widthPercent: 14 },
      { key: 'liters', header: 'Liters', align: 'right', widthPercent: 14, bold: true },
      { key: 'unpaid', header: 'Unpaid Due (Rs.)', align: 'right', widthPercent: 19, bold: true },
    ];
    const rows: (string | number)[][] = payload.sectorRows.map((r, idx) => [
      idx + 1,
      r.sectorName,
      `${r.activeUnits}/${r.totalUnits}`,
      r.orders,
      formatPdfQuantity(r.liters),
      formatPdfCurrency(r.unpaidAmount || r.totalAmount),
    ]);
    if (hasDirect) {
      rows.push([
        '-',
        'Division Direct (Unpaid)',
        '-',
        direct.totalOrders,
        formatPdfQuantity(direct.totalLiters),
        formatPdfCurrency(direct.unpaidAmount || direct.totalAmount),
      ]);
    }
    const totalRow = [
      '',
      `GRAND TOTAL UNPAID (${totals.count} SECTORS)`,
      `${totals.activeUnits}/${totals.totalUnits}`,
      grandOrders,
      formatPdfQuantity(grandLiters),
      formatPdfCurrency(grandUnpaid || grandTotal),
    ];
    return {
      columns,
      rows,
      totalRow,
      totals,
      grandOrders,
      grandLiters,
      grandCash,
      grandUpi,
      grandUnpaid,
      grandTotal,
    };
  }

  if (payCtx.isPaidCashOnly || payCtx.isPaidUpiOnly) {
    const modeHeader = payCtx.isPaidCashOnly ? 'Cash Paid (Rs.)' : 'UPI Paid (Rs.)';
    const columns: PdfTableColumn[] = [
      { key: 'sl', header: 'Sl', align: 'center', widthPercent: 7 },
      { key: 'sectorName', header: 'Sector Name', align: 'left', widthPercent: 34, bold: true },
      { key: 'units', header: 'Units', align: 'center', widthPercent: 12 },
      { key: 'orders', header: 'Paid Orders', align: 'right', widthPercent: 14 },
      { key: 'liters', header: 'Liters', align: 'right', widthPercent: 14, bold: true },
      { key: 'paid', header: modeHeader, align: 'right', widthPercent: 19, bold: true },
    ];
    const rows: (string | number)[][] = payload.sectorRows.map((r, idx) => [
      idx + 1,
      r.sectorName,
      `${r.activeUnits}/${r.totalUnits}`,
      r.orders,
      formatPdfQuantity(r.liters),
      formatPdfCurrency(payCtx.isPaidCashOnly ? r.cashAmount : r.upiAmount),
    ]);
    if (hasDirect) {
      rows.push([
        '-',
        `Division Direct (${payCtx.statusLabel})`,
        '-',
        direct.totalOrders,
        formatPdfQuantity(direct.totalLiters),
        formatPdfCurrency(
          payCtx.isPaidCashOnly ? direct.cashAmount : direct.upiAmount
        ),
      ]);
    }
    const totalRow = [
      '',
      `GRAND TOTAL ${payCtx.titleBadge} (${totals.count} SECTORS)`,
      `${totals.activeUnits}/${totals.totalUnits}`,
      grandOrders,
      formatPdfQuantity(grandLiters),
      formatPdfCurrency(payCtx.isPaidCashOnly ? grandCash : grandUpi),
    ];
    return {
      columns,
      rows,
      totalRow,
      totals,
      grandOrders,
      grandLiters,
      grandCash,
      grandUpi,
      grandUnpaid,
      grandTotal,
    };
  }

  if (payCtx.isPaidOnly) {
    const columns: PdfTableColumn[] = [
      { key: 'sl', header: 'Sl', align: 'center', widthPercent: 6 },
      { key: 'sectorName', header: 'Sector Name', align: 'left', widthPercent: 27, bold: true },
      { key: 'units', header: 'Units', align: 'center', widthPercent: 10 },
      { key: 'orders', header: 'Paid Orders', align: 'right', widthPercent: 10 },
      { key: 'liters', header: 'Liters', align: 'right', widthPercent: 11, bold: true },
      { key: 'cash', header: 'Cash (Rs.)', align: 'right', widthPercent: 12 },
      { key: 'upi', header: 'UPI (Rs.)', align: 'right', widthPercent: 12 },
      { key: 'total', header: 'Total Paid (Rs.)', align: 'right', widthPercent: 12, bold: true },
    ];
    const rows: (string | number)[][] = payload.sectorRows.map((r, idx) => [
      idx + 1,
      r.sectorName,
      `${r.activeUnits}/${r.totalUnits}`,
      r.orders,
      formatPdfQuantity(r.liters),
      formatPdfCurrency(r.cashAmount),
      formatPdfCurrency(r.upiAmount),
      formatPdfCurrency(r.totalAmount),
    ]);
    if (hasDirect) {
      rows.push([
        '-',
        'Division Direct (Paid)',
        '-',
        direct.totalOrders,
        formatPdfQuantity(direct.totalLiters),
        formatPdfCurrency(direct.cashAmount),
        formatPdfCurrency(direct.upiAmount),
        formatPdfCurrency(direct.totalAmount),
      ]);
    }
    const totalRow = [
      '',
      `GRAND TOTAL PAID (${totals.count} SECTORS)`,
      `${totals.activeUnits}/${totals.totalUnits}`,
      grandOrders,
      formatPdfQuantity(grandLiters),
      formatPdfCurrency(grandCash),
      formatPdfCurrency(grandUpi),
      formatPdfCurrency(grandTotal),
    ];
    return {
      columns,
      rows,
      totalRow,
      totals,
      grandOrders,
      grandLiters,
      grandCash,
      grandUpi,
      grandUnpaid,
      grandTotal,
    };
  }

  // Full Accounting (ALL Payments)
  const columns: PdfTableColumn[] = [
    { key: 'sl', header: 'Sl', align: 'center', widthPercent: 5 },
    { key: 'sectorName', header: 'Sector Name', align: 'left', widthPercent: 25, bold: true },
    { key: 'units', header: 'Units', align: 'center', widthPercent: 9 },
    { key: 'orders', header: 'Orders', align: 'right', widthPercent: 8 },
    { key: 'liters', header: 'Liters', align: 'right', widthPercent: 10, bold: true },
    { key: 'cash', header: 'Cash (Rs.)', align: 'right', widthPercent: 10.5 },
    { key: 'upi', header: 'UPI (Rs.)', align: 'right', widthPercent: 10.5 },
    { key: 'unpaid', header: 'Unpaid (Rs.)', align: 'right', widthPercent: 10.5 },
    { key: 'total', header: 'Total (Rs.)', align: 'right', widthPercent: 11.5, bold: true },
  ];

  const rows: (string | number)[][] = payload.sectorRows.map((r, idx) => [
    idx + 1,
    r.sectorName,
    `${r.activeUnits}/${r.totalUnits}`,
    r.orders,
    formatPdfQuantity(r.liters),
    formatPdfCurrency(r.cashAmount),
    formatPdfCurrency(r.upiAmount),
    formatPdfCurrency(r.unpaidAmount),
    formatPdfCurrency(r.totalAmount),
  ]);

  if (hasDirect) {
    rows.push([
      '-',
      'Division Direct',
      '-',
      direct.totalOrders,
      formatPdfQuantity(direct.totalLiters),
      formatPdfCurrency(direct.cashAmount),
      formatPdfCurrency(direct.upiAmount),
      formatPdfCurrency(direct.unpaidAmount),
      formatPdfCurrency(direct.totalAmount),
    ]);
  }

  const totalRow = [
    '',
    `GRAND TOTAL (${totals.count} SECTORS)`,
    `${totals.activeUnits}/${totals.totalUnits}`,
    grandOrders,
    formatPdfQuantity(grandLiters),
    formatPdfCurrency(grandCash),
    formatPdfCurrency(grandUpi),
    formatPdfCurrency(grandUnpaid),
    formatPdfCurrency(grandTotal),
  ];

  return {
    columns,
    rows,
    totalRow,
    totals,
    grandOrders,
    grandLiters,
    grandCash,
    grandUpi,
    grandUnpaid,
    grandTotal,
  };
}

export function buildFormalPdfConfigFromPayload(
  payload: ReportPayload,
  mode: ReportShareMode = 'detailed'
): FormalPdfDocumentConfig {
  const preset = resolvePresetKey(payload);
  const payCtx = resolvePaymentContext(payload);
  const now = new Date(payload.generatedAtIso || Date.now());
  const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const generatedDate = formatPdfIstDate(safeNow);
  const generatedTime = formatPdfIstTime(safeNow);
  const scopeSubtitle = formatFormalScopeSubtitle(payload.scopeSubtitle);
  const filterSummary = payload.activeFiltersLabel;
  const rateSummary = deriveRateSummary(payload);
  const filename = deriveFilename(payload, preset, payCtx);

  // 1. SECTOR SUMMARY PRESET (Status-Only Portrait OR Full Accounting Landscape)
  if (preset === 'sector_summary') {
    const spec = buildSectorTableSpec(payload, payCtx, false);
    const { totals } = spec;
    const targetPct = safePercent(totals.liters, payload.divisionLimit);

    if (mode === 'status') {
      const ordersMetricLabel = payCtx.isUnpaidOnly
        ? 'Unpaid Orders'
        : payCtx.isPaidOnly
        ? 'Paid Orders'
        : 'Total Orders';
      const summaryMetrics: PdfSummaryMetric[] = [
        { label: 'Total Sectors', value: String(totals.count), align: 'left' },
        {
          label: 'Active Units',
          value: `${totals.activeUnits} / ${totals.totalUnits}`,
          align: 'right',
        },
        { label: ordersMetricLabel, value: String(totals.orders), align: 'right' },
        {
          label: 'Total Liters',
          value: formatPdfQuantity(totals.liters),
          align: 'right',
        },
        ...(payCtx.titleBadge
          ? [{ label: 'Status', value: payCtx.statusLabel, align: 'right' as const }]
          : []),
      ];

      const columns: PdfTableColumn[] = [
        { key: 'rank', header: 'Sl', align: 'center', widthPercent: 10 },
        { key: 'sectorName', header: 'Sector Name', align: 'left', widthPercent: 44, bold: true },
        { key: 'units', header: 'Active / Total Units', align: 'center', widthPercent: 18 },
        { key: 'orders', header: payCtx.isUnpaidOnly ? 'Unpaid Orders' : 'Orders', align: 'right', widthPercent: 13 },
        { key: 'liters', header: 'Liters', align: 'right', widthPercent: 15, bold: true },
      ];

      const rows = payload.sectorRows.map((r, idx) => [
        idx + 1,
        r.sectorName,
        `${r.activeUnits}/${r.totalUnits}`,
        r.orders,
        formatPdfQuantity(r.liters),
      ]);

      const totalRow = [
        '',
        payCtx.isUnpaidOnly
          ? `GRAND TOTAL UNPAID (${totals.count} SECTORS)`
          : payCtx.isPaidOnly
          ? `GRAND TOTAL ${payCtx.titleBadge} (${totals.count} SECTORS)`
          : `GRAND TOTAL (${totals.count} SECTORS)`,
        `${totals.activeUnits}/${totals.totalUnits}`,
        totals.orders,
        formatPdfQuantity(totals.liters),
      ];

      const statusTitle = payCtx.isUnpaidOnly
        ? 'SECTOR-WISE UNPAID ORDER STATUS'
        : payCtx.isPaidOnly
        ? `SECTOR-WISE ORDER STATUS (${payCtx.titleBadge})`
        : 'SECTOR-WISE ORDER STATUS';

      return {
        preset,
        orientation: 'portrait',
        reportTitle: statusTitle,
        scopeSubtitle,
        generatedDate,
        generatedTime,
        filterSummary,
        rateSummary: `${payCtx.statusLabel}  |  Order Status Only`,
        summaryMetrics,
        columns,
        rows,
        totalRow,
        includeSignOff: true,
        showCashHandoverLine: false,
        filename: filename.replace('_Sector_Summary', '_Sector_Order_Status'),
      };
    }

    const summaryMetrics: PdfSummaryMetric[] = payCtx.isUnpaidOnly
      ? [
          { label: 'Total Sectors', value: String(totals.count), align: 'left' },
          {
            label: 'Active Units',
            value: `${totals.activeUnits} / ${totals.totalUnits}`,
            align: 'right',
          },
          { label: 'Unpaid Orders', value: String(totals.orders), align: 'right' },
          {
            label: 'Unpaid Liters',
            value: formatPdfQuantity(totals.liters),
            align: 'right',
          },
          {
            label: 'Total Unpaid Due',
            value: formatPdfCurrency(totals.unpaidAmount || totals.totalAmount),
            align: 'right',
          },
        ]
      : payCtx.isPaidCashOnly || payCtx.isPaidUpiOnly
      ? [
          { label: 'Total Sectors', value: String(totals.count), align: 'left' },
          {
            label: 'Active Units',
            value: `${totals.activeUnits} / ${totals.totalUnits}`,
            align: 'right',
          },
          { label: 'Paid Orders', value: String(totals.orders), align: 'right' },
          {
            label: 'Total Liters',
            value: formatPdfQuantity(totals.liters),
            align: 'right',
          },
          {
            label: payCtx.isPaidCashOnly ? 'Total Cash Paid' : 'Total UPI Paid',
            value: formatPdfCurrency(
              payCtx.isPaidCashOnly ? totals.cashAmount : totals.upiAmount
            ),
            align: 'right',
          },
        ]
      : [
          { label: 'Total Sectors', value: String(totals.count), align: 'left' },
          {
            label: 'Active Units',
            value: `${totals.activeUnits} / ${totals.totalUnits}`,
            align: 'right',
          },
          {
            label: payCtx.isPaidOnly ? 'Paid Orders' : 'Total Orders',
            value: String(totals.orders),
            align: 'right',
          },
          {
            label: 'Total Liters',
            value: formatPdfQuantity(totals.liters),
            align: 'right',
          },
          {
            label: payCtx.isPaidOnly ? 'Total Paid' : 'Total Amount',
            value: formatPdfCurrency(totals.totalAmount),
            align: 'right',
          },
          { label: 'Target %', value: `${targetPct.toFixed(1)}%`, align: 'right' },
        ];

    const detailedTitle = payCtx.isUnpaidOnly
      ? 'SECTOR-WISE UNPAID DUES REPORT'
      : payCtx.isPaidOnly
      ? `SECTOR-WISE SUMMARY REPORT (${payCtx.titleBadge})`
      : 'SECTOR-WISE SUMMARY REPORT';

    return {
      preset,
      orientation: payCtx.isUnpaidOnly || payCtx.isPaidCashOnly || payCtx.isPaidUpiOnly ? 'portrait' : 'landscape',
      reportTitle: detailedTitle,
      scopeSubtitle,
      generatedDate,
      generatedTime,
      filterSummary,
      rateSummary,
      summaryMetrics,
      columns: spec.columns,
      rows: spec.rows,
      totalRow: spec.totalRow,
      includeSignOff: true,
      showCashHandoverLine: !payCtx.isPaidUpiOnly,
      filename,
    };
  }

  // 2. UNIT SUMMARY PRESET (Non-Participating Units OR Status-Only OR Full Accounting)
  if (preset === 'unit_summary') {
    const totals = reconcileRollupRows(payload.unitRows);
    const showSector = payload.showSectorColumn;

    if (payload.config.onlyZeroOrderUnits) {
      const summaryMetrics: PdfSummaryMetric[] = [
        {
          label: 'Non-Participating Units',
          value: String(payload.unitRows.length),
          align: 'left',
        },
        {
          label: 'Participation Status',
          value: 'Not Participated Yet',
          align: 'right',
        },
      ];

      const columns: PdfTableColumn[] = showSector
        ? [
            { key: 'rank', header: 'Sl', align: 'center', widthPercent: 12 },
            { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 54, bold: true },
            { key: 'sectorName', header: 'Sector', align: 'left', widthPercent: 34 },
          ]
        : [
            { key: 'rank', header: 'Sl', align: 'center', widthPercent: 14 },
            { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 86, bold: true },
          ];

      const rows = payload.unitRows.map((r, idx) => [
        idx + 1,
        r.unitName,
        ...(showSector ? [r.sectorName || '-'] : []),
      ]);

      const totalRow = [
        '',
        `TOTAL NON-PARTICIPATING UNITS: ${payload.unitRows.length}`,
        ...(showSector ? [''] : []),
      ];

      return {
        preset,
        orientation: 'portrait',
        reportTitle: 'NON-PARTICIPATING UNITS (NOT PARTICIPATED YET)',
        scopeSubtitle,
        generatedDate,
        generatedTime,
        filterSummary,
        rateSummary: 'Units With Zero Orders  |  Not Participated Yet',
        summaryMetrics,
        columns,
        rows,
        totalRow,
        includeSignOff: true,
        showCashHandoverLine: false,
        filename: filename.replace('_Unit_Summary', '_Non_Participating_Units'),
      };
    }

    if (mode === 'status') {
      const summaryMetrics: PdfSummaryMetric[] = [
        { label: 'Units', value: String(totals.count), align: 'left' },
        { label: 'Active Units', value: String(totals.activeCount), align: 'right' },
        {
          label: payCtx.isUnpaidOnly
            ? 'Unpaid Orders'
            : payCtx.isPaidOnly
            ? 'Paid Orders'
            : 'Total Orders',
          value: String(totals.orders),
          align: 'right',
        },
        {
          label: 'Total Liters',
          value: formatPdfQuantity(totals.liters),
          align: 'right',
        },
        ...(payCtx.titleBadge
          ? [{ label: 'Status', value: payCtx.statusLabel, align: 'right' as const }]
          : []),
      ];

      const columns: PdfTableColumn[] = showSector
        ? [
            { key: 'rank', header: 'Sl', align: 'center', widthPercent: 10 },
            { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 38, bold: true },
            { key: 'sectorName', header: 'Sector', align: 'left', widthPercent: 26 },
            { key: 'orders', header: payCtx.isUnpaidOnly ? 'Unpaid Orders' : 'Orders', align: 'right', widthPercent: 12 },
            { key: 'liters', header: 'Liters', align: 'right', widthPercent: 14, bold: true },
          ]
        : [
            { key: 'rank', header: 'Sl', align: 'center', widthPercent: 10 },
            { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 58, bold: true },
            { key: 'orders', header: payCtx.isUnpaidOnly ? 'Unpaid Orders' : 'Orders', align: 'right', widthPercent: 15 },
            { key: 'liters', header: 'Liters', align: 'right', widthPercent: 17, bold: true },
          ];

      const rows = payload.unitRows.map((r, idx) => [
        idx + 1,
        r.unitName,
        ...(showSector ? [r.sectorName || '-'] : []),
        r.orders,
        formatPdfQuantity(r.liters),
      ]);

      const totalRow = [
        '',
        payCtx.isUnpaidOnly
          ? `GRAND TOTAL UNPAID (${totals.count} UNITS)`
          : payCtx.isPaidOnly
          ? `GRAND TOTAL ${payCtx.titleBadge} (${totals.count} UNITS)`
          : `GRAND TOTAL (${totals.count} UNITS)`,
        ...(showSector ? [''] : []),
        totals.orders,
        formatPdfQuantity(totals.liters),
      ];

      const unitStatusTitle = payCtx.isUnpaidOnly
        ? 'UNIT-WISE UNPAID ORDER STATUS'
        : payCtx.isPaidOnly
        ? `UNIT-WISE ORDER STATUS (${payCtx.titleBadge})`
        : 'UNIT-WISE ORDER STATUS';

      return {
        preset,
        orientation: 'portrait',
        reportTitle: unitStatusTitle,
        scopeSubtitle,
        generatedDate,
        generatedTime,
        filterSummary,
        rateSummary: `${payCtx.statusLabel}  |  Order Status Only`,
        summaryMetrics,
        columns,
        rows,
        totalRow,
        includeSignOff: true,
        showCashHandoverLine: false,
        filename: filename.replace('_Unit_Summary', '_Unit_Order_Status'),
      };
    }

    // Detailed Unit Summary — tailored by payment filter
    if (payCtx.isUnpaidOnly) {
      const summaryMetrics: PdfSummaryMetric[] = [
        { label: 'Units', value: String(totals.count), align: 'left' },
        { label: 'Active Units', value: String(totals.activeCount), align: 'right' },
        { label: 'Unpaid Orders', value: String(totals.orders), align: 'right' },
        { label: 'Unpaid Liters', value: formatPdfQuantity(totals.liters), align: 'right' },
        {
          label: 'Total Unpaid Due',
          value: formatPdfCurrency(totals.unpaidAmount || totals.totalAmount),
          align: 'right',
        },
      ];

      const columns: PdfTableColumn[] = showSector
        ? [
            { key: 'rank', header: 'Sl', align: 'center', widthPercent: 7 },
            { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 28, bold: true },
            { key: 'sectorName', header: 'Sector', align: 'left', widthPercent: 21 },
            { key: 'orders', header: 'Unpaid Orders', align: 'right', widthPercent: 13 },
            { key: 'liters', header: 'Liters', align: 'right', widthPercent: 13, bold: true },
            { key: 'unpaid', header: 'Unpaid Due (Rs.)', align: 'right', widthPercent: 18, bold: true },
          ]
        : [
            { key: 'rank', header: 'Sl', align: 'center', widthPercent: 8 },
            { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 42, bold: true },
            { key: 'orders', header: 'Unpaid Orders', align: 'right', widthPercent: 15 },
            { key: 'liters', header: 'Liters', align: 'right', widthPercent: 15, bold: true },
            { key: 'unpaid', header: 'Unpaid Due (Rs.)', align: 'right', widthPercent: 20, bold: true },
          ];

      const rows = payload.unitRows.map((r, idx) => [
        idx + 1,
        r.unitName,
        ...(showSector ? [r.sectorName || '-'] : []),
        r.orders,
        formatPdfQuantity(r.liters),
        formatPdfCurrency(r.unpaidAmount || r.totalAmount),
      ]);

      const totalRow = [
        '',
        `GRAND TOTAL UNPAID (${totals.count} UNITS)`,
        ...(showSector ? [''] : []),
        totals.orders,
        formatPdfQuantity(totals.liters),
        formatPdfCurrency(totals.unpaidAmount || totals.totalAmount),
      ];

      return {
        preset,
        orientation: 'portrait',
        reportTitle: 'UNIT-WISE UNPAID DUES REPORT',
        scopeSubtitle,
        generatedDate,
        generatedTime,
        filterSummary,
        rateSummary,
        summaryMetrics,
        columns,
        rows,
        totalRow,
        includeSignOff: true,
        showCashHandoverLine: true,
        filename,
      };
    }

    if (payCtx.isPaidCashOnly || payCtx.isPaidUpiOnly) {
      const modeHeader = payCtx.isPaidCashOnly ? 'Cash Paid (Rs.)' : 'UPI Paid (Rs.)';
      const summaryMetrics: PdfSummaryMetric[] = [
        { label: 'Units', value: String(totals.count), align: 'left' },
        { label: 'Active Units', value: String(totals.activeCount), align: 'right' },
        { label: 'Paid Orders', value: String(totals.orders), align: 'right' },
        { label: 'Total Liters', value: formatPdfQuantity(totals.liters), align: 'right' },
        {
          label: payCtx.isPaidCashOnly ? 'Total Cash Paid' : 'Total UPI Paid',
          value: formatPdfCurrency(
            payCtx.isPaidCashOnly ? totals.cashAmount : totals.upiAmount
          ),
          align: 'right',
        },
      ];

      const columns: PdfTableColumn[] = showSector
        ? [
            { key: 'rank', header: 'Sl', align: 'center', widthPercent: 7 },
            { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 28, bold: true },
            { key: 'sectorName', header: 'Sector', align: 'left', widthPercent: 21 },
            { key: 'orders', header: 'Paid Orders', align: 'right', widthPercent: 13 },
            { key: 'liters', header: 'Liters', align: 'right', widthPercent: 13, bold: true },
            { key: 'paid', header: modeHeader, align: 'right', widthPercent: 18, bold: true },
          ]
        : [
            { key: 'rank', header: 'Sl', align: 'center', widthPercent: 8 },
            { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 42, bold: true },
            { key: 'orders', header: 'Paid Orders', align: 'right', widthPercent: 15 },
            { key: 'liters', header: 'Liters', align: 'right', widthPercent: 15, bold: true },
            { key: 'paid', header: modeHeader, align: 'right', widthPercent: 20, bold: true },
          ];

      const rows = payload.unitRows.map((r, idx) => [
        idx + 1,
        r.unitName,
        ...(showSector ? [r.sectorName || '-'] : []),
        r.orders,
        formatPdfQuantity(r.liters),
        formatPdfCurrency(payCtx.isPaidCashOnly ? r.cashAmount : r.upiAmount),
      ]);

      const totalRow = [
        '',
        `GRAND TOTAL ${payCtx.titleBadge} (${totals.count} UNITS)`,
        ...(showSector ? [''] : []),
        totals.orders,
        formatPdfQuantity(totals.liters),
        formatPdfCurrency(
          payCtx.isPaidCashOnly ? totals.cashAmount : totals.upiAmount
        ),
      ];

      return {
        preset,
        orientation: 'portrait',
        reportTitle: `UNIT-WISE SUMMARY REPORT (${payCtx.titleBadge})`,
        scopeSubtitle,
        generatedDate,
        generatedTime,
        filterSummary,
        rateSummary,
        summaryMetrics,
        columns,
        rows,
        totalRow,
        includeSignOff: true,
        showCashHandoverLine: payCtx.isPaidCashOnly,
        filename,
      };
    }

    const summaryMetrics: PdfSummaryMetric[] = payCtx.isPaidOnly
      ? [
          { label: 'Units', value: String(totals.count), align: 'left' },
          { label: 'Active Units', value: String(totals.activeCount), align: 'right' },
          { label: 'Paid Orders', value: String(totals.orders), align: 'right' },
          { label: 'Total Liters', value: formatPdfQuantity(totals.liters), align: 'right' },
          { label: 'Cash', value: formatPdfCurrency(totals.cashAmount), align: 'right' },
          { label: 'UPI', value: formatPdfCurrency(totals.upiAmount), align: 'right' },
          { label: 'Total Paid', value: formatPdfCurrency(totals.totalAmount), align: 'right' },
        ]
      : [
          { label: 'Units', value: String(totals.count), align: 'left' },
          { label: 'Active Units', value: String(totals.activeCount), align: 'right' },
          { label: 'Total Orders', value: String(totals.orders), align: 'right' },
          {
            label: 'Total Liters',
            value: formatPdfQuantity(totals.liters),
            align: 'right',
          },
          {
            label: 'Total Amount',
            value: formatPdfCurrency(totals.totalAmount),
            align: 'right',
          },
          {
            label: 'Unpaid',
            value: formatPdfCurrency(totals.unpaidAmount),
            align: 'right',
          },
        ];

    const columns: PdfTableColumn[] = showSector
      ? [
          { key: 'rank', header: 'Sl', align: 'center', widthPercent: 6 },
          { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 22, bold: true },
          { key: 'sectorName', header: 'Sector', align: 'left', widthPercent: 16 },
          { key: 'orders', header: 'Orders', align: 'right', widthPercent: 8 },
          { key: 'liters', header: 'Liters', align: 'right', widthPercent: 9, bold: true },
          { key: 'cash', header: 'Cash (Rs.)', align: 'right', widthPercent: 9.5 },
          { key: 'upi', header: 'UPI (Rs.)', align: 'right', widthPercent: 9.5 },
          { key: 'unpaid', header: 'Unpaid (Rs.)', align: 'right', widthPercent: 9.5 },
          { key: 'total', header: 'Total (Rs.)', align: 'right', widthPercent: 10.5, bold: true },
        ]
      : [
          { key: 'rank', header: 'Sl', align: 'center', widthPercent: 7 },
          { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 27, bold: true },
          { key: 'orders', header: 'Orders', align: 'right', widthPercent: 9 },
          { key: 'liters', header: 'Liters', align: 'right', widthPercent: 11, bold: true },
          { key: 'cash', header: 'Cash (Rs.)', align: 'right', widthPercent: 11.5 },
          { key: 'upi', header: 'UPI (Rs.)', align: 'right', widthPercent: 11.5 },
          { key: 'unpaid', header: 'Unpaid (Rs.)', align: 'right', widthPercent: 11 },
          { key: 'total', header: 'Total (Rs.)', align: 'right', widthPercent: 12, bold: true },
        ];

    const rows = payload.unitRows.map((r, idx) => [
      idx + 1,
      r.unitName,
      ...(showSector ? [r.sectorName || '-'] : []),
      r.orders,
      formatPdfQuantity(r.liters),
      formatPdfCurrency(r.cashAmount),
      formatPdfCurrency(r.upiAmount),
      formatPdfCurrency(r.unpaidAmount),
      formatPdfCurrency(r.totalAmount),
    ]);

    const totalRow = [
      '',
      payCtx.isPaidOnly
        ? `GRAND TOTAL PAID (${totals.count} UNITS)`
        : `GRAND TOTAL (${totals.count} UNITS)`,
      ...(showSector ? [''] : []),
      totals.orders,
      formatPdfQuantity(totals.liters),
      formatPdfCurrency(totals.cashAmount),
      formatPdfCurrency(totals.upiAmount),
      formatPdfCurrency(totals.unpaidAmount),
      formatPdfCurrency(totals.totalAmount),
    ];

    return {
      preset,
      orientation: showSector ? 'landscape' : 'portrait',
      reportTitle: payCtx.isPaidOnly
        ? `UNIT-WISE SUMMARY REPORT (${payCtx.titleBadge})`
        : 'UNIT-WISE SUMMARY REPORT',
      scopeSubtitle,
      generatedDate,
      generatedTime,
      filterSummary,
      rateSummary,
      summaryMetrics,
      columns,
      rows,
      totalRow,
      includeSignOff: true,
      showCashHandoverLine: true,
      filename,
    };
  }

  // Order-based presets: use precision totals directly from payload.tableTotals
  const t = payload.tableTotals;
  const showUnit = payload.showUnitColumn;
  const showSector = payload.showSectorColumn;

  // 3. DELIVERY SHEET PRESET (A4 Portrait)
  if (preset === 'delivery_sheet') {
    const summaryMetrics: PdfSummaryMetric[] = payCtx.isUnpaidOnly
      ? [
          { label: 'Unpaid Orders', value: String(t.totalOrders), align: 'left' },
          { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
          { label: 'Total Unpaid Due', value: formatPdfCurrency(t.unpaidAmount || t.totalAmount), align: 'right' },
          { label: 'Status', value: 'Unpaid Only', align: 'right' },
        ]
      : payCtx.isPaidOnly
      ? [
          { label: 'Paid Orders', value: String(t.totalOrders), align: 'left' },
          { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
          { label: 'Total Paid', value: formatPdfCurrency(t.paidAmount || t.totalAmount), align: 'right' },
          { label: 'Status', value: payCtx.statusLabel, align: 'right' },
        ]
      : [
          { label: 'Orders', value: String(t.totalOrders), align: 'left' },
          { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
          { label: 'Total Amount', value: formatPdfCurrency(t.totalAmount), align: 'right' },
          { label: 'Paid', value: formatPdfCurrency(t.paidAmount), align: 'right' },
          { label: 'Unpaid', value: formatPdfCurrency(t.unpaidAmount), align: 'right' },
        ];

    const columns: PdfTableColumn[] = showUnit
      ? [
          { key: 'serial', header: '#', align: 'center', widthPercent: 6 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 25, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 15 },
          { key: 'unitName', header: 'Unit', align: 'left', widthPercent: 17 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 9, bold: true },
          { key: 'totalAmount', header: 'Amount', align: 'right', widthPercent: 11 },
          { key: 'paymentLabel', header: 'Payment', align: 'left', widthPercent: 9.5 },
          { key: 'delivered', header: 'Delivered', align: 'center', widthPercent: 7.5, tickBox: true },
        ]
      : [
          { key: 'serial', header: '#', align: 'center', widthPercent: 7 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 31, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 17 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 11, bold: true },
          { key: 'totalAmount', header: 'Amount', align: 'right', widthPercent: 13 },
          { key: 'paymentLabel', header: 'Payment', align: 'left', widthPercent: 12 },
          { key: 'delivered', header: 'Delivered', align: 'center', widthPercent: 9, tickBox: true },
        ];

    const rows = payload.orderRows.map((r) => [
      r.serial,
      r.contributorName,
      r.mobileNumber || '-',
      ...(showUnit ? [r.unitName] : []),
      formatPdfQuantity(r.quantity),
      formatPdfCurrency(r.totalAmount),
      formatPdfOrderPayment(r.paymentStatus, r.paymentMode, true),
      '',
    ]);

    const totalRow = [
      '',
      payCtx.titleBadge
        ? `TOTAL ${payCtx.titleBadge} (${t.totalOrders} ORDERS)`
        : `TOTAL (${t.totalOrders} ORDERS)`,
      '',
      ...(showUnit ? [''] : []),
      formatPdfQuantity(t.totalLiters),
      formatPdfCurrency(t.totalAmount),
      '',
      '',
    ];

    return {
      preset,
      orientation: 'portrait',
      reportTitle: payCtx.titleBadge
        ? `DELIVERY SHEET (${payCtx.titleBadge})`
        : 'DELIVERY SHEET',
      scopeSubtitle,
      generatedDate,
      generatedTime,
      filterSummary,
      rateSummary,
      summaryMetrics,
      columns,
      rows,
      totalRow,
      includeSignOff: true,
      filename,
    };
  }

  // 4. UNPAID DUES COLLECTION LIST PRESET (A4 Portrait)
  if (preset === 'unpaid_dues') {
    const summaryMetrics: PdfSummaryMetric[] = [
      { label: 'Unpaid Orders', value: String(t.unpaidCount || t.totalOrders), align: 'left' },
      { label: 'Unpaid Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
      { label: 'Total Unpaid Due', value: formatPdfCurrency(t.unpaidAmount || t.totalAmount), align: 'right' },
      { label: 'Status', value: 'Unpaid Only', align: 'right' },
    ];

    const columns: PdfTableColumn[] = showUnit
      ? [
          { key: 'serial', header: '#', align: 'center', widthPercent: 6 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 22, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 14 },
          { key: 'unitName', header: 'Unit', align: 'left', widthPercent: 15 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 8 },
          { key: 'totalAmount', header: 'Due Amount', align: 'right', widthPercent: 11, bold: true },
          { key: 'status', header: 'Status', align: 'left', widthPercent: 8 },
          { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 9 },
          { key: 'collected', header: 'Collected', align: 'center', widthPercent: 7, tickBox: true },
        ]
      : [
          { key: 'serial', header: '#', align: 'center', widthPercent: 6.5 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 27.5, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 15 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 9 },
          { key: 'totalAmount', header: 'Due Amount', align: 'right', widthPercent: 13, bold: true },
          { key: 'status', header: 'Status', align: 'left', widthPercent: 9 },
          { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 12 },
          { key: 'collected', header: 'Collected', align: 'center', widthPercent: 8, tickBox: true },
        ];

    const rows = payload.orderRows.map((r) => [
      r.serial,
      r.contributorName,
      r.mobileNumber || '-',
      ...(showUnit ? [r.unitName] : []),
      formatPdfQuantity(r.quantity),
      formatPdfCurrency(r.totalAmount),
      'Unpaid',
      formatPdfShortDateTime(r.createdAt),
      '',
    ]);

    const totalRow = [
      '',
      `TOTAL UNPAID (${t.totalOrders} ORDERS)`,
      '',
      ...(showUnit ? [''] : []),
      formatPdfQuantity(t.totalLiters),
      formatPdfCurrency(t.totalAmount),
      'Unpaid',
      '',
      '',
    ];

    return {
      preset,
      orientation: 'portrait',
      reportTitle: 'UNPAID DUES COLLECTION LIST',
      scopeSubtitle,
      generatedDate,
      generatedTime,
      filterSummary,
      rateSummary,
      summaryMetrics,
      columns,
      rows,
      totalRow,
      includeSignOff: true,
      showCashHandoverLine: true,
      filename,
    };
  }

  // 5. DIVISION DIRECT ORDERS REPORT PRESET (A4 Portrait)
  if (preset === 'division_direct') {
    const summaryMetrics: PdfSummaryMetric[] = payCtx.isUnpaidOnly
      ? [
          { label: 'Unpaid Orders', value: String(t.totalOrders), align: 'left' },
          { label: 'Unpaid Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
          { label: 'Total Unpaid Due', value: formatPdfCurrency(t.unpaidAmount || t.totalAmount), align: 'right' },
          { label: 'Status', value: 'Unpaid Only', align: 'right' },
        ]
      : payCtx.isPaidCashOnly || payCtx.isPaidUpiOnly
      ? [
          { label: 'Paid Orders', value: String(t.totalOrders), align: 'left' },
          { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
          {
            label: payCtx.isPaidCashOnly ? 'Cash Paid' : 'UPI Paid',
            value: formatPdfCurrency(
              payCtx.isPaidCashOnly ? t.cashAmount : t.upiAmount
            ),
            align: 'right',
          },
          { label: 'Status', value: payCtx.statusLabel, align: 'right' },
        ]
      : [
          { label: 'Orders', value: String(t.totalOrders), align: 'left' },
          { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
          { label: 'Total Amount', value: formatPdfCurrency(t.totalAmount), align: 'right' },
          { label: 'Cash', value: formatPdfCurrency(t.cashAmount), align: 'right' },
          { label: 'UPI', value: formatPdfCurrency(t.upiAmount), align: 'right' },
          ...(payCtx.isPaidOnly
            ? []
            : [{ label: 'Unpaid', value: formatPdfCurrency(t.unpaidAmount), align: 'right' as const }]),
        ];

    const columns: PdfTableColumn[] = [
      { key: 'serial', header: '#', align: 'center', widthPercent: 6 },
      { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 15 },
      { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 25, bold: true },
      { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 14 },
      { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 9 },
      { key: 'totalAmount', header: 'Amount', align: 'right', widthPercent: 11, bold: true },
      { key: 'paymentLabel', header: 'Payment Status', align: 'left', widthPercent: 12 },
      { key: 'delivered', header: 'Delivered', align: 'center', widthPercent: 8, tickBox: true },
    ];

    const rows = payload.orderRows.map((r) => [
      r.serial,
      formatPdfShortDateTime(r.createdAt),
      r.contributorName,
      r.mobileNumber || '-',
      formatPdfQuantity(r.quantity),
      formatPdfCurrency(r.totalAmount),
      formatPdfOrderPayment(r.paymentStatus, r.paymentMode),
      '',
    ]);

    const totalRow = [
      '',
      '',
      payCtx.titleBadge
        ? `TOTAL ${payCtx.titleBadge} (${t.totalOrders} ORDERS)`
        : `TOTAL (${t.totalOrders} ORDERS)`,
      '',
      formatPdfQuantity(t.totalLiters),
      formatPdfCurrency(t.totalAmount),
      '',
      '',
    ];

    return {
      preset,
      orientation: 'portrait',
      reportTitle: payCtx.titleBadge
        ? `DIVISION DIRECT ORDERS (${payCtx.titleBadge})`
        : 'DIVISION DIRECT ORDERS REPORT',
      scopeSubtitle,
      generatedDate,
      generatedTime,
      filterSummary,
      rateSummary,
      summaryMetrics,
      columns,
      rows,
      totalRow,
      includeSignOff: true,
      showCashHandoverLine: !payCtx.isPaidUpiOnly,
      filename,
    };
  }

  // 6. ORDERS REGISTER PRESET (Portrait unless Division shows both Sector + Unit)
  const isAllDivisionDetailed =
    payload.config.scope === 'ENTIRE_DIVISION' && payload.sectorRows.length > 0;

  const summaryMetrics: PdfSummaryMetric[] = payCtx.isUnpaidOnly
    ? [
        ...(isAllDivisionDetailed
          ? [{ label: 'Total Sectors', value: String(payload.sectorRows.length), align: 'left' as const }]
          : []),
        {
          label: 'Unpaid Orders',
          value: String(t.totalOrders),
          align: isAllDivisionDetailed ? 'right' : 'left',
        },
        { label: 'Unpaid Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
        { label: 'Total Unpaid Due', value: formatPdfCurrency(t.unpaidAmount || t.totalAmount), align: 'right' },
        { label: 'Status', value: 'Unpaid Only', align: 'right' },
      ]
    : payCtx.isPaidCashOnly || payCtx.isPaidUpiOnly
    ? [
        ...(isAllDivisionDetailed
          ? [{ label: 'Total Sectors', value: String(payload.sectorRows.length), align: 'left' as const }]
          : []),
        {
          label: 'Paid Orders',
          value: String(t.totalOrders),
          align: isAllDivisionDetailed ? 'right' : 'left',
        },
        { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
        {
          label: payCtx.isPaidCashOnly ? 'Cash Paid' : 'UPI Paid',
          value: formatPdfCurrency(
            payCtx.isPaidCashOnly ? t.cashAmount : t.upiAmount
          ),
          align: 'right',
        },
        { label: 'Status', value: payCtx.statusLabel, align: 'right' },
      ]
    : payCtx.isPaidOnly
    ? [
        ...(isAllDivisionDetailed
          ? [{ label: 'Total Sectors', value: String(payload.sectorRows.length), align: 'left' as const }]
          : []),
        {
          label: 'Paid Orders',
          value: String(t.totalOrders),
          align: isAllDivisionDetailed ? 'right' : 'left',
        },
        { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
        { label: 'Cash', value: formatPdfCurrency(t.cashAmount), align: 'right' },
        { label: 'UPI', value: formatPdfCurrency(t.upiAmount), align: 'right' },
        { label: 'Total Paid', value: formatPdfCurrency(t.totalAmount), align: 'right' },
      ]
    : [
        ...(isAllDivisionDetailed
          ? [{ label: 'Total Sectors', value: String(payload.sectorRows.length), align: 'left' as const }]
          : []),
        {
          label: 'Orders',
          value: String(t.totalOrders),
          align: isAllDivisionDetailed ? 'right' : 'left',
        },
        { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
        { label: 'Total Amount', value: formatPdfCurrency(t.totalAmount), align: 'right' },
        { label: 'Cash', value: formatPdfCurrency(t.cashAmount), align: 'right' },
        { label: 'UPI', value: formatPdfCurrency(t.upiAmount), align: 'right' },
        { label: 'Unpaid', value: formatPdfCurrency(t.unpaidAmount), align: 'right' },
      ];

  // Dedicated All-Division Sector-Wise Summary & Listing Table (pure-white monochrome)
  let prefaceTable: PdfSectionTableConfig | undefined;
  let mainTableTitle: string | undefined;

  if (isAllDivisionDetailed) {
    const spec = buildSectorTableSpec(payload, payCtx, true);
    const sectionPrefix = payCtx.isUnpaidOnly
      ? 'Sector-Wise Unpaid Summary'
      : payCtx.isPaidOnly
      ? `Sector-Wise ${payCtx.statusLabel} Summary`
      : 'Sector-Wise Summary & Listing';

    prefaceTable = {
      sectionTitle: `${sectionPrefix} (Total Sectors: ${spec.totals.count})`,
      columns: spec.columns,
      rows: spec.rows,
      totalRow: spec.totalRow,
    };
    mainTableTitle = payCtx.titleBadge
      ? `Detailed Orders Register — ${payCtx.titleBadge} (${t.totalOrders} Orders)`
      : `Detailed Orders Register (${t.totalOrders} Orders)`;
  }

  const columns: PdfTableColumn[] =
    showSector && showUnit
      ? [
          { key: 'serial', header: '#', align: 'center', widthPercent: 5 },
          { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 12.5 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 19.5, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 11.5 },
          { key: 'sectorName', header: 'Sector', align: 'left', widthPercent: 13 },
          { key: 'unitName', header: 'Unit', align: 'left', widthPercent: 14 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 7 },
          { key: 'totalAmount', header: payCtx.isUnpaidOnly ? 'Due Amt' : 'Amount', align: 'right', widthPercent: 8.5, bold: true },
          { key: 'paymentLabel', header: 'Payment Status', align: 'left', widthPercent: 9 },
        ]
      : showUnit
      ? [
          { key: 'serial', header: '#', align: 'center', widthPercent: 6 },
          { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 14 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 22, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 13 },
          { key: 'unitName', header: 'Unit', align: 'left', widthPercent: 16.5 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 8 },
          { key: 'totalAmount', header: payCtx.isUnpaidOnly ? 'Due Amt' : 'Amount', align: 'right', widthPercent: 10, bold: true },
          { key: 'paymentLabel', header: 'Payment Status', align: 'left', widthPercent: 10.5 },
        ]
      : [
          { key: 'serial', header: '#', align: 'center', widthPercent: 6.5 },
          { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 16 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 27.5, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 15 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 9.5 },
          { key: 'totalAmount', header: payCtx.isUnpaidOnly ? 'Due Amt' : 'Amount', align: 'right', widthPercent: 12.5, bold: true },
          { key: 'paymentLabel', header: 'Payment Status', align: 'left', widthPercent: 13 },
        ];

  const rows = payload.orderRows.map((r) => [
    r.serial,
    formatPdfShortDateTime(r.createdAt),
    r.contributorName,
    r.mobileNumber || '-',
    ...(showSector && showUnit ? [r.sectorName] : []),
    ...(showUnit ? [r.unitName] : []),
    formatPdfQuantity(r.quantity),
    formatPdfCurrency(r.totalAmount),
    formatPdfOrderPayment(r.paymentStatus, r.paymentMode),
  ]);

  const totalRow = [
    '',
    '',
    payCtx.titleBadge
      ? `TOTAL ${payCtx.titleBadge} (${t.totalOrders} ORDERS)`
      : `TOTAL (${t.totalOrders} ORDERS)`,
    '',
    ...(showSector && showUnit ? [''] : []),
    ...(showUnit ? [''] : []),
    formatPdfQuantity(t.totalLiters),
    formatPdfCurrency(t.totalAmount),
    payCtx.isUnpaidOnly ? 'Unpaid' : '',
  ];

  const baseOrdersTitle =
    payload.config.scope === 'ENTIRE_DIVISION'
      ? 'DIVISION FULL ORDERS REPORT'
      : 'ORDERS REGISTER';
  const reportTitle = payCtx.isUnpaidOnly
    ? payload.config.scope === 'ENTIRE_DIVISION'
      ? 'DIVISION UNPAID ORDERS REPORT'
      : 'UNPAID ORDERS REGISTER'
    : payCtx.titleBadge
    ? `${baseOrdersTitle} (${payCtx.titleBadge})`
    : baseOrdersTitle;

  return {
    preset,
    orientation: showSector && showUnit ? 'landscape' : 'portrait',
    reportTitle,
    scopeSubtitle,
    generatedDate,
    generatedTime,
    filterSummary,
    rateSummary,
    summaryMetrics,
    prefaceTable,
    mainTableTitle,
    columns,
    rows,
    totalRow,
    includeSignOff: true,
    showCashHandoverLine: !payCtx.isPaidUpiOnly,
    filename,
  };
}

export function buildFormalPdfFromPayload(
  payload: ReportPayload,
  mode: ReportShareMode = 'detailed'
) {
  const docConfig = buildFormalPdfConfigFromPayload(payload, mode);
  return buildFormalPdfDocument(docConfig);
}

export function exportFormalReportPdf(
  payload: ReportPayload,
  mode: ReportShareMode = 'detailed'
): string {
  const docConfig = buildFormalPdfConfigFromPayload(payload, mode);
  return generateFormalPdf(docConfig);
}
