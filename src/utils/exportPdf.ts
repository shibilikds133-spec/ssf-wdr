import {
  calcLimitSharePercent,
  formatCurrency,
  formatQuantity,
} from './format';
import type { ReportPayload, ReportPortalRole } from './reports';

interface PdfThemePalette {
  accent: string;
  accentSoft: string;
  accentBorder: string;
  headerBg: string;
  textDark: string;
  textMuted: string;
}

const PDF_THEMES: Record<ReportPortalRole, PdfThemePalette> = {
  ADMIN: {
    accent: '#381932',
    accentSoft: '#FAF6F9',
    accentBorder: '#E7DCE4',
    headerBg: '#F8F3EC',
    textDark: '#22141F',
    textMuted: '#63535F',
  },
  SECTOR: {
    accent: '#043326',
    accentSoft: '#F4FAF7',
    accentBorder: '#D4E7DF',
    headerBg: '#F1F7EB',
    textDark: '#10241C',
    textMuted: '#3E5B4E',
  },
  UNIT: {
    accent: '#EC5E27',
    accentSoft: '#FFF6F2',
    accentBorder: '#FAD4C3',
    headerBg: '#FBF8EE',
    textDark: '#261812',
    textMuted: '#6B5449',
  },
};

function escapeHtml(raw: string | number | null | undefined): string {
  const str = String(raw ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBrandHtml(raw: string): string {
  return raw
    .split(/(SSF)/g)
    .map((part) =>
      part === 'SSF'
        ? '<span class="ssf-mark">SSF</span>'
        : escapeHtml(part)
    )
    .join('');
}

function renderPaymentBadge(
  paymentStatus: 'PAID' | 'UNPAID',
  paymentMode: 'CASH' | 'UPI' | null
): string {
  if (paymentStatus === 'UNPAID') {
    return '<span class="badge badge-unpaid">Unpaid</span>';
  }
  if (paymentMode === 'UPI') {
    return '<span class="badge badge-upi">Paid • UPI</span>';
  }
  if (paymentMode === 'CASH') {
    return '<span class="badge badge-cash">Paid • Cash</span>';
  }
  return '<span class="badge badge-cash">Paid</span>';
}

function buildTableBodyHtml(payload: ReportPayload): string {
  if (payload.matchedCount === 0) {
    return `
      <tr>
        <td colspan="${payload.columns.length}" class="empty-cell">
          No records match the selected filters.
        </td>
      </tr>
    `;
  }

  if (payload.config.template === 'SECTOR_SUMMARY') {
    return payload.sectorRows
      .map(
        (row) => `
        <tr>
          <td class="center num">${row.rank}</td>
          <td class="strong">${renderBrandHtml(row.sectorName)}</td>
          <td class="mono">${escapeHtml(row.sectorCode || '-')}</td>
          <td class="center num">${row.activeUnits}/${row.totalUnits}</td>
          <td class="right num">${row.orders}</td>
          <td class="right num strong">${escapeHtml(formatQuantity(row.liters))} L</td>
          <td class="right num">${row.limitSharePercent.toFixed(1)}%</td>
          <td class="right num">${escapeHtml(formatCurrency(row.cashAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(row.upiAmount))}</td>
          <td class="right num ${row.unpaidAmount > 0 ? 'unpaid-text' : ''}">${escapeHtml(formatCurrency(row.unpaidAmount))}</td>
          <td class="right num strong">${escapeHtml(formatCurrency(row.totalAmount))}</td>
        </tr>
      `
      )
      .join('');
  }

  if (payload.config.template === 'UNIT_SUMMARY') {
    return payload.unitRows
      .map(
        (row) => `
        <tr>
          <td class="center num">${row.rank}</td>
          <td class="strong">${renderBrandHtml(row.unitName)}</td>
          <td class="mono">${escapeHtml(row.unitCode || '-')}</td>
          ${
            payload.showSectorColumn
              ? `<td>${renderBrandHtml(row.sectorName || '-')}</td>`
              : ''
          }
          <td class="right num">${row.orders}</td>
          <td class="right num strong">${escapeHtml(formatQuantity(row.liters))} L</td>
          <td class="right num">${row.sharePercent.toFixed(1)}%</td>
          <td class="right num">${escapeHtml(formatCurrency(row.cashAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(row.upiAmount))}</td>
          <td class="right num ${row.unpaidAmount > 0 ? 'unpaid-text' : ''}">${escapeHtml(formatCurrency(row.unpaidAmount))}</td>
          <td class="right num strong">${escapeHtml(formatCurrency(row.totalAmount))}</td>
        </tr>
      `
      )
      .join('');
  }

  if (payload.config.template === 'DELIVERY_SHEET') {
    return payload.orderRows
      .map(
        (row) => `
        <tr>
          <td class="center num">${row.serial}</td>
          <td class="strong">${escapeHtml(row.contributorName)}</td>
          <td class="num mono">${escapeHtml(row.mobileNumber)}</td>
          ${
            payload.showUnitColumn
              ? `<td>${
                  row.isDivisionDirect
                    ? '<span class="direct-pill">Division Direct</span>'
                    : renderBrandHtml(row.unitName)
                }</td>`
              : ''
          }
          <td class="right num strong">${escapeHtml(formatQuantity(row.quantity))} L</td>
          <td class="right num strong">${escapeHtml(formatCurrency(row.totalAmount))}</td>
          <td>${renderPaymentBadge(row.paymentStatus, row.paymentMode)}</td>
          <td class="center"><span class="tick-box" aria-hidden="true"></span></td>
        </tr>
      `
      )
      .join('');
  }

  // DETAILED_ORDERS or UNPAID_DUES
  return payload.orderRows
    .map(
      (row) => `
      <tr>
        <td class="center num">${row.serial}</td>
        <td class="strong">${escapeHtml(row.contributorName)}</td>
        <td class="num mono">${escapeHtml(row.mobileNumber)}</td>
        ${
          payload.showSectorColumn
            ? `<td>${renderBrandHtml(row.sectorName)}</td>`
            : ''
        }
        ${
          payload.showUnitColumn
            ? `<td>${
                row.isDivisionDirect
                  ? '<span class="direct-pill">Division Direct</span>'
                  : renderBrandHtml(row.unitName)
              }</td>`
            : ''
        }
        <td class="right num strong">${escapeHtml(formatQuantity(row.quantity))} L</td>
        <td class="right num strong">${escapeHtml(formatCurrency(row.totalAmount))}</td>
        <td>${renderPaymentBadge(row.paymentStatus, row.paymentMode)}</td>
        <td class="num muted-cell">${escapeHtml(row.dateLabel)}</td>
      </tr>
    `
    )
    .join('');
}

function buildTableFooterHtml(payload: ReportPayload): string {
  if (payload.matchedCount === 0) return '';

  const t = payload.tableTotals;
  const isDivisionSummaryWithDirect =
    payload.role === 'ADMIN' &&
    payload.config.scope === 'ENTIRE_DIVISION' &&
    (payload.config.template === 'SECTOR_SUMMARY' ||
      payload.config.template === 'UNIT_SUMMARY') &&
    payload.divisionDirectBreakdown.totalOrders > 0;

  if (payload.config.template === 'SECTOR_SUMMARY') {
    const activeTotal = payload.sectorRows.reduce(
      (s, r) => s + r.activeUnits,
      0
    );
    const unitsTotal = payload.sectorRows.reduce((s, r) => s + r.totalUnits, 0);
    const subtotalShare = calcLimitSharePercent(
      t.totalLiters,
      payload.divisionLimit
    );

    const rows: string[] = [
      `
      <tr class="total-row">
        <td colspan="3" class="strong">${
          isDivisionSummaryWithDirect
            ? `Subtotal (${payload.sectorRows.length} Sectors)`
            : `Grand Total (${payload.sectorRows.length} Sectors)`
        }</td>
        <td class="center num">${activeTotal}/${unitsTotal}</td>
        <td class="right num">${t.totalOrders}</td>
        <td class="right num">${escapeHtml(formatQuantity(t.totalLiters))} L</td>
        <td class="right num">${subtotalShare.toFixed(1)}%</td>
        <td class="right num">${escapeHtml(formatCurrency(t.cashAmount))}</td>
        <td class="right num">${escapeHtml(formatCurrency(t.upiAmount))}</td>
        <td class="right num">${escapeHtml(formatCurrency(t.unpaidAmount))}</td>
        <td class="right num">${escapeHtml(formatCurrency(t.totalAmount))}</td>
      </tr>
    `,
    ];

    if (isDivisionSummaryWithDirect) {
      const direct = payload.divisionDirectBreakdown;
      const grand = payload.summary;
      const directShare = calcLimitSharePercent(
        direct.totalLiters,
        payload.divisionLimit
      );
      const grandShare = calcLimitSharePercent(
        grand.totalLiters,
        payload.divisionLimit
      );
      rows.push(`
        <tr class="direct-row">
          <td colspan="3">Division Direct Orders (No Sector)</td>
          <td class="center">—</td>
          <td class="right num">${direct.totalOrders}</td>
          <td class="right num">${escapeHtml(formatQuantity(direct.totalLiters))} L</td>
          <td class="right num">${directShare.toFixed(1)}%</td>
          <td class="right num">${escapeHtml(formatCurrency(direct.cashAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(direct.upiAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(direct.unpaidAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(direct.totalAmount))}</td>
        </tr>
        <tr class="grand-row">
          <td colspan="3" class="strong">Division Grand Total</td>
          <td class="center num">${activeTotal}/${unitsTotal}</td>
          <td class="right num">${grand.totalOrders}</td>
          <td class="right num">${escapeHtml(formatQuantity(grand.totalLiters))} L</td>
          <td class="right num">${grandShare.toFixed(1)}%</td>
          <td class="right num">${escapeHtml(formatCurrency(grand.cashAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(grand.upiAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(grand.unpaidAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(grand.totalAmount))}</td>
        </tr>
      `);
    }

    return `<tfoot>${rows.join('')}</tfoot>`;
  }

  if (payload.config.template === 'UNIT_SUMMARY') {
    const labelColSpan = payload.showSectorColumn ? 4 : 3;
    const subtotalShare =
      payload.config.scope === 'ENTIRE_DIVISION'
        ? calcLimitSharePercent(t.totalLiters, payload.divisionLimit)
        : t.totalLiters > 0
        ? 100
        : 0;

    const rows: string[] = [
      `
      <tr class="total-row">
        <td colspan="${labelColSpan}" class="strong">${
          isDivisionSummaryWithDirect
            ? `Subtotal (${payload.unitRows.length} Units)`
            : `Grand Total (${payload.unitRows.length} Units)`
        }</td>
        <td class="right num">${t.totalOrders}</td>
        <td class="right num">${escapeHtml(formatQuantity(t.totalLiters))} L</td>
        <td class="right num">${subtotalShare.toFixed(1)}%</td>
        <td class="right num">${escapeHtml(formatCurrency(t.cashAmount))}</td>
        <td class="right num">${escapeHtml(formatCurrency(t.upiAmount))}</td>
        <td class="right num">${escapeHtml(formatCurrency(t.unpaidAmount))}</td>
        <td class="right num">${escapeHtml(formatCurrency(t.totalAmount))}</td>
      </tr>
    `,
    ];

    if (isDivisionSummaryWithDirect) {
      const direct = payload.divisionDirectBreakdown;
      const grand = payload.summary;
      const directShare = calcLimitSharePercent(
        direct.totalLiters,
        payload.divisionLimit
      );
      const grandShare = calcLimitSharePercent(
        grand.totalLiters,
        payload.divisionLimit
      );
      rows.push(`
        <tr class="direct-row">
          <td colspan="${labelColSpan}">Division Direct Orders (No Unit)</td>
          <td class="right num">${direct.totalOrders}</td>
          <td class="right num">${escapeHtml(formatQuantity(direct.totalLiters))} L</td>
          <td class="right num">${directShare.toFixed(1)}%</td>
          <td class="right num">${escapeHtml(formatCurrency(direct.cashAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(direct.upiAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(direct.unpaidAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(direct.totalAmount))}</td>
        </tr>
        <tr class="grand-row">
          <td colspan="${labelColSpan}" class="strong">Division Grand Total</td>
          <td class="right num">${grand.totalOrders}</td>
          <td class="right num">${escapeHtml(formatQuantity(grand.totalLiters))} L</td>
          <td class="right num">${grandShare.toFixed(1)}%</td>
          <td class="right num">${escapeHtml(formatCurrency(grand.cashAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(grand.upiAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(grand.unpaidAmount))}</td>
          <td class="right num">${escapeHtml(formatCurrency(grand.totalAmount))}</td>
        </tr>
      `);
    }

    return `<tfoot>${rows.join('')}</tfoot>`;
  }

  if (payload.config.template === 'DELIVERY_SHEET') {
    const labelColSpan = 3 + (payload.showUnitColumn ? 1 : 0);
    return `
      <tfoot>
        <tr class="total-row">
          <td colspan="${labelColSpan}" class="strong">Grand Total (${t.totalOrders} Orders)</td>
          <td class="right num">${escapeHtml(formatQuantity(t.totalLiters))} L</td>
          <td class="right num">${escapeHtml(formatCurrency(t.totalAmount))}</td>
          <td colspan="2" class="num">
            Paid: ${escapeHtml(formatCurrency(t.paidAmount))} &nbsp;•&nbsp; Unpaid: ${escapeHtml(formatCurrency(t.unpaidAmount))}
          </td>
        </tr>
      </tfoot>
    `;
  }

  // DETAILED_ORDERS or UNPAID_DUES
  const labelColSpan =
    3 + (payload.showSectorColumn ? 1 : 0) + (payload.showUnitColumn ? 1 : 0);
  return `
    <tfoot>
      <tr class="total-row">
        <td colspan="${labelColSpan}" class="strong">Grand Total (${t.totalOrders} Orders)</td>
        <td class="right num">${escapeHtml(formatQuantity(t.totalLiters))} L</td>
        <td class="right num">${escapeHtml(formatCurrency(t.totalAmount))}</td>
        <td colspan="2" class="num">
          Cash: ${escapeHtml(formatCurrency(t.cashAmount))} &nbsp;•&nbsp; UPI: ${escapeHtml(formatCurrency(t.upiAmount))} &nbsp;•&nbsp; Unpaid: ${escapeHtml(formatCurrency(t.unpaidAmount))}
        </td>
      </tr>
    </tfoot>
  `;
}

export function buildReportPrintHtml(payload: ReportPayload): string {
  const theme = PDF_THEMES[payload.role];
  const s = payload.summary;
  const pageSize =
    payload.orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';

  const reconciliationStrip =
    payload.role === 'UNIT' && payload.config.template === 'DETAILED_ORDERS'
      ? `
      <div class="reconciliation-strip">
        <span class="rec-title">Payment Reconciliation:</span>
        <span class="rec-item num">Cash Handover: <strong>${escapeHtml(formatCurrency(s.cashAmount))}</strong> (${s.cashCount} orders)</span>
        <span class="rec-sep">•</span>
        <span class="rec-item num">UPI: <strong>${escapeHtml(formatCurrency(s.upiAmount))}</strong> (${s.upiCount} orders)</span>
        <span class="rec-sep">•</span>
        <span class="rec-item num rec-unpaid">Unpaid Pending: <strong>${escapeHtml(formatCurrency(s.unpaidAmount))}</strong> (${s.unpaidCount} orders)</span>
      </div>
    `
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(payload.filenameBase)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    @page {
      size: ${pageSize};
      margin: 11mm 10mm 14mm 10mm;
      @bottom-left {
        content: "Generated from SSF Wandoor Payasam Challenge Portal";
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 8px;
        color: #6B7280;
      }
      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 8px;
        font-weight: 600;
        color: #374151;
      }
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      margin: 0;
      padding: 0;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      color: ${theme.textDark};
      background: #FFFFFF;
      font-size: 10px;
      line-height: 1.4;
    }

    .ssf-mark {
      font-family: 'Cooper Black', 'Cooper Std Black', 'Caprasimo', Georgia, serif;
      font-weight: 400;
      letter-spacing: 0.02em;
    }

    .num {
      font-variant-numeric: tabular-nums;
    }

    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9px;
    }

    .no-print {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 16px;
      background: ${theme.headerBg};
      border-bottom: 1px solid ${theme.accentBorder};
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .no-print-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-print {
      background: ${theme.accent};
      color: #FFFFFF;
      border: none;
      border-radius: 8px;
      padding: 7px 14px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }

    .btn-close {
      background: #FFFFFF;
      color: ${theme.textDark};
      border: 1px solid ${theme.accentBorder};
      border-radius: 8px;
      padding: 7px 12px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .sheet {
      max-width: 100%;
      padding: 14px 18px 18px;
    }

    .accent-bar {
      height: 5px;
      width: 100%;
      border-radius: 999px;
      background: ${theme.accent};
      margin-bottom: 11px;
    }

    .brand-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      padding-bottom: 10px;
      border-bottom: 1.5px solid ${theme.accentBorder};
    }

    .brand-eyebrow {
      font-size: 12.5px;
      font-weight: 800;
      color: ${theme.accent};
      letter-spacing: 0.01em;
      margin-bottom: 2px;
    }

    .report-title {
      font-size: 18px;
      font-weight: 800;
      color: ${theme.textDark};
      margin: 0;
      line-height: 1.2;
    }

    .scope-subtitle {
      font-size: 11px;
      font-weight: 600;
      color: ${theme.textMuted};
      margin-top: 3px;
    }

    .header-badge {
      background: ${theme.accentSoft};
      border: 1px solid ${theme.accentBorder};
      color: ${theme.accent};
      border-radius: 8px;
      padding: 6px 10px;
      text-align: right;
      white-space: nowrap;
      font-size: 9.5px;
      font-weight: 700;
    }

    .header-badge span {
      display: block;
      font-size: 8.5px;
      font-weight: 600;
      color: ${theme.textMuted};
    }

    .meta-strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      background: ${theme.headerBg};
      border: 1px solid ${theme.accentBorder};
      border-radius: 8px;
      padding: 6px 10px;
      margin-top: 9px;
      font-size: 9px;
      color: ${theme.textMuted};
    }

    .meta-strip strong {
      color: ${theme.textDark};
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
      margin-bottom: 10px;
    }

    .kpi-box {
      background: ${theme.accentSoft};
      border: 1px solid ${theme.accentBorder};
      border-top: 2.5px solid ${theme.accent};
      border-radius: 8px;
      padding: 7px 9px;
    }

    .kpi-label {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: ${theme.textMuted};
    }

    .kpi-value {
      font-size: 13px;
      font-weight: 800;
      color: ${theme.textDark};
      margin-top: 2px;
      line-height: 1.2;
    }

    .kpi-sub {
      font-size: 8px;
      color: ${theme.textMuted};
      margin-top: 2px;
    }

    .kpi-box-unpaid {
      border-top-color: #E11D48;
      background: #FFF5F6;
      border-color: #FECDD3;
    }

    .kpi-box-unpaid .kpi-value {
      color: #BE123C;
    }

    .reconciliation-strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      background: #FFFFFF;
      border: 1px solid ${theme.accentBorder};
      border-radius: 8px;
      padding: 6px 10px;
      margin-bottom: 10px;
      font-size: 9.5px;
      color: ${theme.textDark};
    }

    .rec-title {
      font-weight: 700;
      color: ${theme.accent};
    }

    .rec-sep {
      color: #9CA3AF;
    }

    .rec-unpaid {
      color: #BE123C;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      border: 1px solid ${theme.accentBorder};
      border-radius: 8px;
    }

    thead {
      display: table-header-group;
    }

    thead th {
      background: ${theme.headerBg};
      color: ${theme.textDark};
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 6px 7px;
      border-bottom: 1.5px solid ${theme.accentBorder};
      text-align: left;
      white-space: nowrap;
    }

    tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    tbody tr:nth-child(even) {
      background: #FAFAFA;
    }

    tbody td {
      padding: 5.5px 7px;
      border-bottom: 1px solid #ECEAE6;
      font-size: 9.5px;
      vertical-align: middle;
    }

    tfoot tr.total-row td {
      background: ${theme.headerBg};
      color: ${theme.textDark};
      font-weight: 700;
      padding: 7px;
      border-top: 1.5px solid ${theme.accent};
      font-size: 9.5px;
    }

    tfoot tr.direct-row td {
      background: #FAF6F9;
      color: ${theme.textDark};
      font-weight: 600;
      padding: 6px 7px;
      border-top: 1px solid ${theme.accentBorder};
      font-size: 9.5px;
    }

    tfoot tr.grand-row td {
      background: ${theme.accent};
      color: #FFFFFF;
      font-weight: 800;
      padding: 7.5px 7px;
      font-size: 10px;
    }

    .left { text-align: left; }
    .right { text-align: right; }
    .center { text-align: center; }
    .strong { font-weight: 700; }
    .muted-cell { color: ${theme.textMuted}; font-size: 8.8px; white-space: nowrap; }
    .unpaid-text { color: #BE123C; font-weight: 700; }

    .badge {
      display: inline-block;
      padding: 1.5px 6px;
      border-radius: 999px;
      font-size: 8.5px;
      font-weight: 700;
      white-space: nowrap;
    }

    .badge-cash {
      background: #FEF3C7;
      color: #B45309;
    }

    .badge-upi {
      background: #CCFBF1;
      color: #0F766E;
    }

    .badge-unpaid {
      background: #FFE4E6;
      color: #BE123C;
    }

    .direct-pill {
      display: inline-block;
      padding: 1.5px 6px;
      border-radius: 999px;
      font-size: 8.5px;
      font-weight: 700;
      background: #F5EEF3;
      color: #381932;
      border: 1px solid #E7DCE4;
      white-space: nowrap;
    }

    .tick-box {
      display: inline-block;
      width: 13px;
      height: 13px;
      border: 1.4px solid #374151;
      border-radius: 3px;
      background: #FFFFFF;
      vertical-align: middle;
    }

    .empty-cell {
      text-align: center;
      padding: 18px;
      color: ${theme.textMuted};
      font-weight: 600;
    }

    .doc-footer {
      margin-top: 12px;
      padding-top: 7px;
      border-top: 1px solid ${theme.accentBorder};
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 8.5px;
      color: ${theme.textMuted};
    }

    @media print {
      .no-print {
        display: none !important;
      }
      .sheet {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div style="font-size: 12px; font-weight: 700; color: ${theme.textDark};">
      ${renderBrandHtml(payload.title)} — <span style="font-weight: 600; color: ${theme.textMuted};">${escapeHtml(payload.pdfFilename)}</span>
    </div>
    <div class="no-print-actions">
      <button type="button" class="btn-print" onclick="window.print()">Print / Save as PDF</button>
      <button type="button" class="btn-close" onclick="window.close()">Close</button>
    </div>
  </div>

  <div class="sheet">
    <div class="accent-bar"></div>

    <header class="brand-header">
      <div>
        <div class="brand-eyebrow">
          <span class="ssf-mark">SSF</span> Wandoor Division — Payasam Challenge
        </div>
        <h1 class="report-title">${renderBrandHtml(payload.title)}</h1>
        <div class="scope-subtitle">${renderBrandHtml(payload.scopeSubtitle)}</div>
      </div>
      <div class="header-badge num">
        <span>Portal Scope</span>
        ${renderBrandHtml(payload.portalContextLabel)}
      </div>
    </header>

    <div class="meta-strip">
      <span class="num"><strong>Generated:</strong> ${escapeHtml(payload.generatedAtLabel)}</span>
      <span>•</span>
      <span><strong>Filters:</strong> ${escapeHtml(payload.activeFiltersLabel)}</span>
      <span>•</span>
      <span class="num"><strong>Unit Rate:</strong> ₹${escapeHtml(formatQuantity(payload.unitRate))}/L</span>
    </div>

    <section class="kpi-grid" aria-label="Executive Summary">
      <div class="kpi-box">
        <div class="kpi-label">Total Orders</div>
        <div class="kpi-value num">${s.totalOrders}</div>
        <div class="kpi-sub num">${s.paidCount} paid • ${s.unpaidCount} unpaid</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Total Liters (L)</div>
        <div class="kpi-value num">${escapeHtml(formatQuantity(s.totalLiters))} L</div>
        <div class="kpi-sub num">${
          payload.divisionLimit > 0
            ? `${calcLimitSharePercent(s.totalLiters, payload.divisionLimit).toFixed(1)}% of division limit`
            : 'Filtered volume'
        }</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Total Value</div>
        <div class="kpi-value num">${escapeHtml(formatCurrency(s.totalAmount))}</div>
        <div class="kpi-sub num">₹${escapeHtml(formatQuantity(payload.unitRate))}/L base rate</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Paid (Cash / UPI)</div>
        <div class="kpi-value num">${escapeHtml(formatCurrency(s.paidAmount))}</div>
        <div class="kpi-sub num">Cash ${escapeHtml(formatCurrency(s.cashAmount))} • UPI ${escapeHtml(formatCurrency(s.upiAmount))}</div>
      </div>
      <div class="kpi-box kpi-box-unpaid">
        <div class="kpi-label">Unpaid Pending</div>
        <div class="kpi-value num">${escapeHtml(formatCurrency(s.unpaidAmount))}</div>
        <div class="kpi-sub num">${s.unpaidCount} pending order(s)</div>
      </div>
    </section>

    ${reconciliationStrip}

    <table>
      <thead>
        <tr>
          ${payload.columns
            .map(
              (col) =>
                `<th class="${col.align}${col.numeric ? ' num' : ''}">${escapeHtml(col.label)}</th>`
            )
            .join('')}
        </tr>
      </thead>
      <tbody>
        ${buildTableBodyHtml(payload)}
      </tbody>
      ${buildTableFooterHtml(payload)}
    </table>

    <footer class="doc-footer">
      <span>Generated from <span class="ssf-mark">SSF</span> Wandoor Payasam Challenge Portal</span>
      <span class="num">${escapeHtml(payload.pdfFilename)} • ${escapeHtml(payload.generatedAtLabel)}</span>
    </footer>
  </div>
</body>
</html>`;
}

function isMobileOrTouchBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    ua
  );
  const coarsePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.innerWidth < 1024;
  return mobileUa || coarsePointer;
}

async function waitForPrintReadiness(doc: Document): Promise<void> {
  const fontsReady = (doc as Document & { fonts?: { ready: Promise<unknown> } })
    .fonts?.ready;
  if (!fontsReady) return;
  await Promise.race([
    fontsReady.catch(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, 400)),
  ]);
}

function printViaHiddenIframe(
  html: string,
  filenameBase: string
): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const iframeWin = iframe.contentWindow;
    const iframeDoc = iframeWin?.document ?? iframe.contentDocument;

    if (!iframeWin || !iframeDoc) {
      iframe.remove();
      resolve();
      return;
    }

    const previousTitle = document.title;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.title = previousTitle;
      window.setTimeout(() => {
        iframe.remove();
      }, 250);
      resolve();
    };

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    const triggerPrint = async () => {
      await waitForPrintReadiness(iframeDoc);
      document.title = filenameBase;
      iframeWin.addEventListener('afterprint', cleanup, { once: true });
      window.addEventListener('afterprint', cleanup, { once: true });
      window.setTimeout(cleanup, 60000);
      try {
        iframeWin.focus();
        iframeWin.print();
      } finally {
        window.setTimeout(() => {
          document.title = previousTitle;
        }, 1200);
      }
    };

    window.setTimeout(() => {
      void triggerPrint();
    }, 80);
  });
}

export async function exportReportPdf(payload: ReportPayload): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const html = buildReportPrintHtml(payload);

  if (isMobileOrTouchBrowser()) {
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      await waitForPrintReadiness(printWin.document);
      window.setTimeout(() => {
        try {
          printWin.focus();
          printWin.print();
        } catch {
          // User can tap the sticky "Print / Save as PDF" button in the preview bar
        }
      }, 150);
      return;
    }
  }

  await printViaHiddenIframe(html, payload.filenameBase);
}
