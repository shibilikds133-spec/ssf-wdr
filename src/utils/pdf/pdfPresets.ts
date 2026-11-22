import type { ReportPayload } from '../reports';
import {
  reconcileRollupRows,
  safePercent,
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
  type PdfSummaryMetric,
  type PdfTableColumn,
} from './sharedPdfEngine';

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

function deriveFilename(payload: ReportPayload, preset: PdfPresetKey): string {
  const date = new Date(payload.generatedAtIso || Date.now());
  const scopeSlugMap: Record<ReportPayload['config']['scope'], string> = {
    ENTIRE_DIVISION: 'Division',
    DIVISION_DIRECT: 'Division_Direct',
    SECTOR_SPECIFIC: payload.scopeSubtitle.replace(/^Sector Report\s*[-—]\s*/i, '').split('(')[0] || 'Sector',
    UNIT_SPECIFIC: payload.scopeSubtitle.replace(/^Unit Report\s*[-—]\s*/i, '').split('(')[0] || 'Unit',
    ENTIRE_SECTOR: payload.scopeSubtitle.replace(/^Sector Report\s*[-—]\s*/i, '').split('(')[0] || 'Sector',
    THIS_UNIT: payload.scopeSubtitle.replace(/^Unit Report\s*[-—]\s*/i, '').split('(')[0] || 'Unit',
  };
  const typeMap: Record<PdfPresetKey, string> = {
    delivery_sheet: 'Delivery_Sheet',
    unpaid_dues: 'Unpaid_Dues',
    orders_register: 'Orders_Register',
    division_direct: 'Division_Direct_Orders',
    sector_summary: 'Sector_Summary',
    unit_summary: 'Unit_Summary',
  };
  return buildFormalPdfFilename(
    scopeSlugMap[payload.config.scope],
    typeMap[preset],
    Number.isNaN(date.getTime()) ? new Date() : date
  );
}

/**
 * Strip internal login codes like ` (WDR101)` from formal printed scope subtitles
 * per Security & Hygiene Lock (Section 4.4).
 */
function formatFormalScopeSubtitle(rawSubtitle: string): string {
  const cleaned = rawSubtitle.replace(/\s*\([A-Za-z0-9_-]{2,20}\)/g, '').trim();
  return `Palada Payasam Challenge  |  ${cleaned}`;
}

export function buildFormalPdfConfigFromPayload(
  payload: ReportPayload
): FormalPdfDocumentConfig {
  const preset = resolvePresetKey(payload);
  const now = new Date(payload.generatedAtIso || Date.now());
  const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const generatedDate = formatPdfIstDate(safeNow);
  const generatedTime = formatPdfIstTime(safeNow);
  const scopeSubtitle = formatFormalScopeSubtitle(payload.scopeSubtitle);
  const filterSummary = payload.activeFiltersLabel;
  const rateSummary = deriveRateSummary(payload);
  const filename = deriveFilename(payload, preset);

  // 1. SECTOR SUMMARY PRESET (9 columns -> A4 Landscape)
  if (preset === 'sector_summary') {
    const totals = reconcileRollupRows(payload.sectorRows);
    const targetPct = safePercent(totals.liters, payload.divisionLimit);

    const summaryMetrics: PdfSummaryMetric[] = [
      { label: 'Sectors', value: String(totals.count), align: 'left' },
      {
        label: 'Active Units',
        value: `${totals.activeUnits} / ${totals.totalUnits}`,
        align: 'right',
      },
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
      { label: 'Target %', value: `${targetPct.toFixed(1)}%`, align: 'right' },
    ];

    const columns: PdfTableColumn[] = [
      { key: 'rank', header: 'Rank', align: 'center', widthPercent: 6 },
      { key: 'sectorName', header: 'Sector Name', align: 'left', widthPercent: 26, bold: true },
      { key: 'units', header: 'Units', align: 'center', widthPercent: 9 },
      { key: 'orders', header: 'Orders', align: 'right', widthPercent: 8 },
      { key: 'liters', header: 'Liters', align: 'right', widthPercent: 10, bold: true },
      { key: 'cash', header: 'Cash', align: 'right', widthPercent: 10 },
      { key: 'upi', header: 'UPI', align: 'right', widthPercent: 10 },
      { key: 'unpaid', header: 'Unpaid', align: 'right', widthPercent: 10 },
      { key: 'total', header: 'Total', align: 'right', widthPercent: 11, bold: true },
    ];

    const rows = payload.sectorRows.map((r) => [
      r.rank,
      r.sectorName,
      `${r.activeUnits}/${r.totalUnits}`,
      r.orders,
      formatPdfQuantity(r.liters),
      formatPdfCurrency(r.cashAmount),
      formatPdfCurrency(r.upiAmount),
      formatPdfCurrency(r.unpaidAmount),
      formatPdfCurrency(r.totalAmount),
    ]);

    const totalRow = [
      '',
      `GRAND TOTAL (${totals.count} SECTORS)`,
      `${totals.activeUnits}/${totals.totalUnits}`,
      totals.orders,
      formatPdfQuantity(totals.liters),
      formatPdfCurrency(totals.cashAmount),
      formatPdfCurrency(totals.upiAmount),
      formatPdfCurrency(totals.unpaidAmount),
      formatPdfCurrency(totals.totalAmount),
    ];

    return {
      preset,
      orientation: 'landscape',
      reportTitle: 'SECTOR-WISE SUMMARY REPORT',
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

  // 2. UNIT SUMMARY PRESET (9 cols on Division -> Landscape; 8 cols on Sector -> Portrait)
  if (preset === 'unit_summary') {
    const totals = reconcileRollupRows(payload.unitRows);
    const showSector = payload.showSectorColumn;

    const summaryMetrics: PdfSummaryMetric[] = [
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
          { key: 'rank', header: 'Rank', align: 'center', widthPercent: 6 },
          { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 22, bold: true },
          { key: 'sectorName', header: 'Sector', align: 'left', widthPercent: 16 },
          { key: 'orders', header: 'Orders', align: 'right', widthPercent: 8 },
          { key: 'liters', header: 'Liters', align: 'right', widthPercent: 9, bold: true },
          { key: 'cash', header: 'Cash', align: 'right', widthPercent: 9.5 },
          { key: 'upi', header: 'UPI', align: 'right', widthPercent: 9.5 },
          { key: 'unpaid', header: 'Unpaid', align: 'right', widthPercent: 9.5 },
          { key: 'total', header: 'Total', align: 'right', widthPercent: 10.5, bold: true },
        ]
      : [
          { key: 'rank', header: 'Rank', align: 'center', widthPercent: 7 },
          { key: 'unitName', header: 'Unit Name', align: 'left', widthPercent: 27, bold: true },
          { key: 'orders', header: 'Orders', align: 'right', widthPercent: 9 },
          { key: 'liters', header: 'Liters', align: 'right', widthPercent: 11, bold: true },
          { key: 'cash', header: 'Cash', align: 'right', widthPercent: 11.5 },
          { key: 'upi', header: 'UPI', align: 'right', widthPercent: 11.5 },
          { key: 'unpaid', header: 'Unpaid', align: 'right', widthPercent: 11 },
          { key: 'total', header: 'Total', align: 'right', widthPercent: 12, bold: true },
        ];

    const rows = payload.unitRows.map((r) => [
      r.rank,
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
      `GRAND TOTAL (${totals.count} UNITS)`,
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
      reportTitle: 'UNIT-WISE SUMMARY REPORT',
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
    const summaryMetrics: PdfSummaryMetric[] = [
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
      `TOTAL (${t.totalOrders} ORDERS)`,
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
      reportTitle: 'DELIVERY SHEET',
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
      { label: 'Total Due Amount', value: formatPdfCurrency(t.unpaidAmount || t.totalAmount), align: 'right' },
    ];

    const columns: PdfTableColumn[] = showUnit
      ? [
          { key: 'serial', header: '#', align: 'center', widthPercent: 6 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 24, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 14 },
          { key: 'unitName', header: 'Unit', align: 'left', widthPercent: 17 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 8.5 },
          { key: 'totalAmount', header: 'Due Amount', align: 'right', widthPercent: 11.5, bold: true },
          { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 11.5 },
          { key: 'collected', header: 'Collected', align: 'center', widthPercent: 7.5, tickBox: true },
        ]
      : [
          { key: 'serial', header: '#', align: 'center', widthPercent: 7 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 30, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 16 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 10 },
          { key: 'totalAmount', header: 'Due Amount', align: 'right', widthPercent: 14, bold: true },
          { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 14 },
          { key: 'collected', header: 'Collected', align: 'center', widthPercent: 9, tickBox: true },
        ];

    const rows = payload.orderRows.map((r) => [
      r.serial,
      r.contributorName,
      r.mobileNumber || '-',
      ...(showUnit ? [r.unitName] : []),
      formatPdfQuantity(r.quantity),
      formatPdfCurrency(r.totalAmount),
      formatPdfShortDateTime(r.createdAt),
      '',
    ]);

    const totalRow = [
      '',
      `TOTAL (${t.totalOrders} ORDERS)`,
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
    const summaryMetrics: PdfSummaryMetric[] = [
      { label: 'Orders', value: String(t.totalOrders), align: 'left' },
      { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
      { label: 'Total Amount', value: formatPdfCurrency(t.totalAmount), align: 'right' },
      { label: 'Cash', value: formatPdfCurrency(t.cashAmount), align: 'right' },
      { label: 'UPI', value: formatPdfCurrency(t.upiAmount), align: 'right' },
      { label: 'Unpaid', value: formatPdfCurrency(t.unpaidAmount), align: 'right' },
    ];

    const columns: PdfTableColumn[] = [
      { key: 'serial', header: '#', align: 'center', widthPercent: 6 },
      { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 15 },
      { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 25, bold: true },
      { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 14 },
      { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 9 },
      { key: 'totalAmount', header: 'Amount', align: 'right', widthPercent: 11, bold: true },
      { key: 'paymentLabel', header: 'Payment Mode', align: 'left', widthPercent: 12 },
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
      `TOTAL (${t.totalOrders} ORDERS)`,
      '',
      formatPdfQuantity(t.totalLiters),
      formatPdfCurrency(t.totalAmount),
      '',
      '',
    ];

    return {
      preset,
      orientation: 'portrait',
      reportTitle: 'DIVISION DIRECT ORDERS REPORT',
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

  // 6. ORDERS REGISTER PRESET (Portrait unless Division shows both Sector + Unit)
  const summaryMetrics: PdfSummaryMetric[] = [
    { label: 'Orders', value: String(t.totalOrders), align: 'left' },
    { label: 'Total Liters', value: formatPdfQuantity(t.totalLiters), align: 'right' },
    { label: 'Total Amount', value: formatPdfCurrency(t.totalAmount), align: 'right' },
    { label: 'Cash', value: formatPdfCurrency(t.cashAmount), align: 'right' },
    { label: 'UPI', value: formatPdfCurrency(t.upiAmount), align: 'right' },
    { label: 'Unpaid', value: formatPdfCurrency(t.unpaidAmount), align: 'right' },
  ];

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
          { key: 'totalAmount', header: 'Amount', align: 'right', widthPercent: 8.5, bold: true },
          { key: 'paymentLabel', header: 'Payment Mode', align: 'left', widthPercent: 9 },
        ]
      : showUnit
      ? [
          { key: 'serial', header: '#', align: 'center', widthPercent: 6 },
          { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 14 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 22, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 13 },
          { key: 'unitName', header: 'Unit', align: 'left', widthPercent: 16.5 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 8 },
          { key: 'totalAmount', header: 'Amount', align: 'right', widthPercent: 10, bold: true },
          { key: 'paymentLabel', header: 'Payment Mode', align: 'left', widthPercent: 10.5 },
        ]
      : [
          { key: 'serial', header: '#', align: 'center', widthPercent: 6.5 },
          { key: 'dateLabel', header: 'Date', align: 'left', widthPercent: 16 },
          { key: 'contributorName', header: 'Customer Name', align: 'left', widthPercent: 27.5, bold: true },
          { key: 'mobileNumber', header: 'Mobile', align: 'left', widthPercent: 15 },
          { key: 'quantity', header: 'Qty (L)', align: 'right', widthPercent: 9.5 },
          { key: 'totalAmount', header: 'Amount', align: 'right', widthPercent: 12.5, bold: true },
          { key: 'paymentLabel', header: 'Payment Mode', align: 'left', widthPercent: 13 },
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
    `TOTAL (${t.totalOrders} ORDERS)`,
    '',
    ...(showSector && showUnit ? [''] : []),
    ...(showUnit ? [''] : []),
    formatPdfQuantity(t.totalLiters),
    formatPdfCurrency(t.totalAmount),
    '',
  ];

  const reportTitle =
    payload.config.scope === 'ENTIRE_DIVISION'
      ? 'DIVISION FULL ORDERS REPORT'
      : 'ORDERS REGISTER';

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
    columns,
    rows,
    totalRow,
    includeSignOff: true,
    showCashHandoverLine: true,
    filename,
  };
}

export function buildFormalPdfFromPayload(payload: ReportPayload) {
  const docConfig = buildFormalPdfConfigFromPayload(payload);
  return buildFormalPdfDocument(docConfig);
}

export function exportFormalReportPdf(payload: ReportPayload): string {
  const docConfig = buildFormalPdfConfigFromPayload(payload);
  return generateFormalPdf(docConfig);
}
