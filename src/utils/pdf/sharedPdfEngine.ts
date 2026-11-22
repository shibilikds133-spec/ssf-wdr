import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type Styles } from 'jspdf-autotable';
import type { ReportShareMode } from './pdfAccounting';
import {
  PDF_COLORS,
  PDF_LAYOUT,
  PDF_TYPE,
  PT_TO_MM,
  sanitizePdfText,
} from './pdfTheme';

export type { ReportShareMode };

export type PdfPresetKey =
  | 'delivery_sheet'
  | 'unpaid_dues'
  | 'orders_register'
  | 'division_direct'
  | 'sector_summary'
  | 'unit_summary';

export interface PdfSummaryMetric {
  label: string;
  value: string;
  align?: 'left' | 'right' | 'center';
}

export interface PdfTableColumn {
  key: string;
  header: string;
  align: 'left' | 'right' | 'center';
  /** Percentage of usable table width (all columns must sum cleanly to 100). */
  widthPercent: number;
  /** Draws a crisp 3.8mm vector tick box in each body row instead of text. */
  tickBox?: boolean;
  bold?: boolean;
}

export interface FormalPdfDocumentConfig {
  preset: PdfPresetKey;
  orientation: 'portrait' | 'landscape';
  reportTitle: string;
  scopeSubtitle: string;
  generatedDate: string;
  generatedTime: string;
  filterSummary: string;
  rateSummary: string;
  summaryMetrics: PdfSummaryMetric[];
  columns: PdfTableColumn[];
  rows: (string | number)[][];
  totalRow: (string | number)[];
  includeSignOff?: boolean;
  showCashHandoverLine?: boolean;
  filename: string;
}

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY?: number;
  };
}

function setStrokePt(doc: jsPDF, pt: number): void {
  doc.setLineWidth(pt * PT_TO_MM);
}

/**
 * Resolve exact column millimeter widths summing strictly to `usableWidth`.
 */
function resolveColumnWidthsMm(
  columns: PdfTableColumn[],
  usableWidth: number
): number[] {
  const totalPct = columns.reduce((s, c) => s + c.widthPercent, 0) || 100;
  const raw = columns.map((c) => (c.widthPercent / totalPct) * usableWidth);
  const rounded = raw.map((w) => Math.round(w * 100) / 100);
  const diff =
    Math.round((usableWidth - rounded.reduce((s, w) => s + w, 0)) * 100) / 100;
  if (rounded.length > 0 && diff !== 0) {
    // Absorb rounding residual into the widest text column (index 1 if present)
    const targetIdx = rounded.length > 1 ? 1 : 0;
    rounded[targetIdx] = Math.round((rounded[targetIdx] + diff) * 100) / 100;
  }
  return rounded;
}

/**
 * Draw Zone 1 (Formal Monochrome Header) on Page 1 and return bottom Y.
 */
function drawPageOneHeader(
  doc: jsPDF,
  config: FormalPdfDocumentConfig,
  pageWidth: number
): number {
  const { MARGIN_LEFT, MARGIN_RIGHT, MARGIN_TOP, ORG_TITLE } = PDF_LAYOUT;
  const usableWidth = pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
  const leftMaxWidth = Math.round(usableWidth * 0.64);
  const rightX = pageWidth - MARGIN_RIGHT;

  // Left Block
  let leftY = MARGIN_TOP + 3;
  doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'bold');
  doc.setFontSize(PDF_TYPE.ORG_SIZE);
  doc.setTextColor(...PDF_COLORS.PRIMARY_INK);
  doc.text(ORG_TITLE, MARGIN_LEFT, leftY, { charSpace: 0.6 });

  leftY += 6;
  doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'bold');
  doc.setFontSize(PDF_TYPE.TITLE_SIZE);
  doc.setTextColor(...PDF_COLORS.PRIMARY_INK);
  const cleanTitle = sanitizePdfText(config.reportTitle).toUpperCase();
  const titleLines = doc.splitTextToSize(cleanTitle, leftMaxWidth) as string[];
  doc.text(titleLines, MARGIN_LEFT, leftY);
  leftY += titleLines.length * 5.2;

  doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'normal');
  doc.setFontSize(PDF_TYPE.SUBTITLE_SIZE);
  doc.setTextColor(...PDF_COLORS.SECONDARY_INK);
  const cleanScope = sanitizePdfText(config.scopeSubtitle);
  const scopeLines = doc.splitTextToSize(cleanScope, leftMaxWidth) as string[];
  doc.text(scopeLines, MARGIN_LEFT, leftY + 0.5);
  leftY += scopeLines.length * 4.2;

  // Right Metadata Block (right-aligned, 35% width)
  const rightMaxWidth = usableWidth - leftMaxWidth - 4;
  let rightY = MARGIN_TOP + 3;
  const metaItems: [string, string][] = [
    ['Generated:', `${config.generatedDate}, ${config.generatedTime}`],
    ['Filter:', sanitizePdfText(config.filterSummary)],
    ['Rate:', sanitizePdfText(config.rateSummary)],
  ];

  for (const [label, val] of metaItems) {
    doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'normal');
    doc.setFontSize(PDF_TYPE.META_SIZE);
    const fullLine = `${label} ${val}`;
    const wrapped = doc.splitTextToSize(fullLine, rightMaxWidth) as string[];
    doc.setTextColor(...PDF_COLORS.SECONDARY_INK);
    if (wrapped.length === 1) {
      // Draw value bold-ish / primary, label secondary
      doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'bold');
      doc.setTextColor(...PDF_COLORS.PRIMARY_INK);
      const valWidth = doc.getTextWidth(val);
      doc.text(val, rightX, rightY, { align: 'right' });

      doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'normal');
      doc.setTextColor(...PDF_COLORS.SECONDARY_INK);
      doc.text(label, rightX - valWidth - 1.5, rightY, { align: 'right' });
      rightY += 4.3;
    } else {
      doc.setTextColor(...PDF_COLORS.PRIMARY_INK);
      doc.text(wrapped, rightX, rightY, { align: 'right' });
      rightY += wrapped.length * 4.0;
    }
  }

  const ruleY = Math.max(leftY, rightY) + 2.5;
  doc.setDrawColor(...PDF_COLORS.STRONG_RULE);
  setStrokePt(doc, 0.8);
  doc.line(MARGIN_LEFT, ruleY, rightX, ruleY);

  return ruleY;
}

/**
 * Draw Zone 2 (Minimal Pure-White Accounting Summary Strip) on Page 1.
 */
function drawSummaryStrip(
  doc: jsPDF,
  metrics: PdfSummaryMetric[],
  startY: number,
  pageWidth: number
): number {
  if (metrics.length === 0) return startY + 2;

  const { MARGIN_LEFT, MARGIN_RIGHT } = PDF_LAYOUT;
  const usableWidth = pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
  const stripTopY = startY + 2;
  const stripHeight = 13.5;
  const stripBottomY = stripTopY + stripHeight;
  const colW = usableWidth / metrics.length;

  // Top & Bottom hairlines (pure white interior - zero fill)
  doc.setDrawColor(...PDF_COLORS.SUBTLE_RULE);
  setStrokePt(doc, 0.35);
  doc.line(MARGIN_LEFT, stripTopY, pageWidth - MARGIN_RIGHT, stripTopY);
  doc.line(MARGIN_LEFT, stripBottomY, pageWidth - MARGIN_RIGHT, stripBottomY);

  metrics.forEach((metric, idx) => {
    const cellX = MARGIN_LEFT + idx * colW;
    if (idx > 0) {
      doc.setDrawColor(...PDF_COLORS.SUBTLE_RULE);
      setStrokePt(doc, 0.25);
      doc.line(cellX, stripTopY + 1.8, cellX, stripBottomY - 1.8);
    }

    const align = metric.align ?? (idx === 0 ? 'left' : 'right');
    const pad = 2.5;
    const textX =
      align === 'right'
        ? cellX + colW - pad
        : align === 'center'
        ? cellX + colW / 2
        : cellX + pad;

    doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'normal');
    doc.setFontSize(PDF_TYPE.SUMMARY_LABEL_SIZE);
    doc.setTextColor(...PDF_COLORS.SECONDARY_INK);
    doc.text(sanitizePdfText(metric.label).toUpperCase(), textX, stripTopY + 4.8, {
      align,
    });

    doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'bold');
    doc.setFontSize(PDF_TYPE.SUMMARY_VALUE_SIZE);
    doc.setTextColor(...PDF_COLORS.PRIMARY_INK);
    doc.text(sanitizePdfText(metric.value), textX, stripTopY + 10.6, {
      align,
    });
  });

  return stripBottomY;
}

/**
 * Draw Zone 4 (Formal Sign-Off & Settlement Hairlines) on the final page.
 */
function drawSignOffBlock(
  doc: jsPDF,
  config: FormalPdfDocumentConfig,
  finalTableY: number,
  pageWidth: number,
  pageHeight: number
): void {
  const { MARGIN_LEFT, MARGIN_RIGHT, SIGN_OFF_MIN_SPACE, CONTINUATION_TOP_Y } =
    PDF_LAYOUT;
  const usableWidth = pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
  const maxContentY =
    pageHeight - PDF_LAYOUT.FOOTER_RULE_OFFSET_FROM_BOTTOM - 3;

  const neededHeight = config.showCashHandoverLine
    ? SIGN_OFF_MIN_SPACE + 7
    : SIGN_OFF_MIN_SPACE;

  let blockTopY = finalTableY + 9;
  if (blockTopY + neededHeight > maxContentY) {
    doc.addPage();
    blockTopY = CONTINUATION_TOP_Y + 6;
  }

  if (config.showCashHandoverLine) {
    doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'normal');
    doc.setFontSize(PDF_TYPE.META_SIZE);
    doc.setTextColor(...PDF_COLORS.SECONDARY_INK);
    doc.text(
      'Cash Handover Confirmed: Rs. ______________________',
      MARGIN_LEFT,
      blockTopY
    );
    blockTopY += 9;
  }

  const slots = ['Prepared By', 'Verified By', 'Date & Signature'];
  const gap = 12;
  const slotWidth = (usableWidth - gap * (slots.length - 1)) / slots.length;
  const lineY = blockTopY + 8;

  slots.forEach((label, idx) => {
    const x1 = MARGIN_LEFT + idx * (slotWidth + gap);
    const x2 = x1 + slotWidth;
    doc.setDrawColor(...PDF_COLORS.SUBTLE_RULE);
    setStrokePt(doc, 0.35);
    doc.line(x1, lineY, x2, lineY);

    doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'normal');
    doc.setFontSize(PDF_TYPE.FOOTER_SIZE);
    doc.setTextColor(...PDF_COLORS.MUTED_INK);
    doc.text(label, x1, lineY + 4.2);
  });
}

/**
 * Draw Zone 5 Running Page Footer & Continuation Headers across Pages 1..N.
 */
function drawRunningChrome(
  doc: jsPDF,
  config: FormalPdfDocumentConfig,
  pageWidth: number,
  pageHeight: number
): void {
  const totalPages = doc.getNumberOfPages();
  const {
    MARGIN_LEFT,
    MARGIN_RIGHT,
    ORG_TITLE,
    CAMPAIGN_TITLE,
    FOOTER_RULE_OFFSET_FROM_BOTTOM,
    FOOTER_TEXT_OFFSET_FROM_BOTTOM,
  } = PDF_LAYOUT;
  const rightX = pageWidth - MARGIN_RIGHT;
  const cleanTitle = sanitizePdfText(config.reportTitle);
  const cleanScope = sanitizePdfText(config.scopeSubtitle);

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);

    // Minimal 1-line continuation header on pages 2..N
    if (page > 1) {
      const headerTextY = 11;
      const headerRuleY = 14;
      doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'bold');
      doc.setFontSize(PDF_TYPE.CONTINUATION_SIZE);
      doc.setTextColor(...PDF_COLORS.SECONDARY_INK);
      doc.text(`${ORG_TITLE}  -  ${cleanTitle}`, MARGIN_LEFT, headerTextY);

      doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'normal');
      doc.setFontSize(PDF_TYPE.CONTINUATION_SIZE);
      doc.setTextColor(...PDF_COLORS.MUTED_INK);
      const truncatedScope =
        cleanScope.length > 58 ? `${cleanScope.slice(0, 55)}...` : cleanScope;
      doc.text(truncatedScope, rightX, headerTextY, { align: 'right' });

      doc.setDrawColor(...PDF_COLORS.SUBTLE_RULE);
      setStrokePt(doc, 0.3);
      doc.line(MARGIN_LEFT, headerRuleY, rightX, headerRuleY);
    }

    // Running Footer (every page)
    const ruleY = pageHeight - FOOTER_RULE_OFFSET_FROM_BOTTOM;
    const textY = pageHeight - FOOTER_TEXT_OFFSET_FROM_BOTTOM;

    doc.setDrawColor(...PDF_COLORS.SUBTLE_RULE);
    setStrokePt(doc, 0.3);
    doc.line(MARGIN_LEFT, ruleY, rightX, ruleY);

    doc.setFont(PDF_LAYOUT.FONT_FAMILY, 'normal');
    doc.setFontSize(PDF_TYPE.FOOTER_SIZE);
    doc.setTextColor(...PDF_COLORS.MUTED_INK);
    doc.text(
      `SSF Wandoor Division  |  ${CAMPAIGN_TITLE}`,
      MARGIN_LEFT,
      textY
    );
    doc.text(`Page ${page} of ${totalPages}`, rightX, textY, {
      align: 'right',
    });
  }
}

/**
 * Build the formal monochrome A4 PDF document using jsPDF + jspdf-autotable (`plain` theme).
 * Separated from `doc.save()` so verification tests can inspect page count and output bytes.
 */
export function buildFormalPdfDocument(
  config: FormalPdfDocumentConfig
): JsPdfWithAutoTable {
  const doc = new jsPDF({
    orientation: config.orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  }) as JsPdfWithAutoTable;

  const pageWidth =
    config.orientation === 'landscape'
      ? PDF_LAYOUT.A4_LANDSCAPE_WIDTH
      : PDF_LAYOUT.A4_PORTRAIT_WIDTH;
  const pageHeight =
    config.orientation === 'landscape'
      ? PDF_LAYOUT.A4_LANDSCAPE_HEIGHT
      : PDF_LAYOUT.A4_PORTRAIT_HEIGHT;
  const usableWidth = pageWidth - PDF_LAYOUT.MARGIN_LEFT - PDF_LAYOUT.MARGIN_RIGHT;

  // Zone 1 & Zone 2 (Page 1 Top)
  const zone1BottomY = drawPageOneHeader(doc, config, pageWidth);
  const zone2BottomY = drawSummaryStrip(
    doc,
    config.summaryMetrics,
    zone1BottomY,
    pageWidth
  );

  // Zone 3 (Formal Monochrome AutoTable)
  const colWidths = resolveColumnWidthsMm(config.columns, usableWidth);
  const columnStyles: Record<number, Partial<Styles>> = {};
  config.columns.forEach((col, idx) => {
    columnStyles[idx] = {
      cellWidth: colWidths[idx],
      halign: col.align,
      fontStyle: col.bold ? 'bold' : 'normal',
    };
  });

  const headRow = [
    config.columns.map((c) => sanitizePdfText(c.header).toUpperCase()),
  ];

  const tickColIndices = new Set<number>(
    config.columns
      .map((c, idx) => (c.tickBox ? idx : -1))
      .filter((idx) => idx >= 0)
  );

  const sanitizedBody =
    config.rows.length > 0
      ? config.rows.map((row) =>
          row.map((val, colIdx) =>
            tickColIndices.has(colIdx) ? '' : sanitizePdfText(val)
          )
        )
      : [
          config.columns.map((_, idx) =>
            idx === 1 ? 'No matching records found for selected filters.' : ''
          ),
        ];

  const sanitizedFoot =
    config.rows.length > 0 && config.totalRow.length === config.columns.length
      ? [config.totalRow.map((val) => sanitizePdfText(val))]
      : [];

  autoTable(doc, {
    startY: zone2BottomY + 4,
    margin: {
      top: PDF_LAYOUT.CONTINUATION_TOP_Y,
      left: PDF_LAYOUT.MARGIN_LEFT,
      right: PDF_LAYOUT.MARGIN_RIGHT,
      bottom: PDF_LAYOUT.MARGIN_BOTTOM,
    },
    tableWidth: usableWidth,
    theme: 'plain',
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    styles: {
      font: PDF_LAYOUT.FONT_FAMILY,
      fontSize: PDF_TYPE.TABLE_BODY_SIZE,
      textColor: [...PDF_COLORS.PRIMARY_INK],
      fillColor: [...PDF_COLORS.PURE_WHITE],
      lineWidth: 0,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: PDF_LAYOUT.FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: PDF_TYPE.TABLE_HEAD_SIZE,
      textColor: [...PDF_COLORS.PRIMARY_INK],
      fillColor: [...PDF_COLORS.PURE_WHITE],
      cellPadding: { top: 2.2, right: 2, bottom: 2.5, left: 2 },
      valign: 'middle',
    },
    bodyStyles: {
      fillColor: [...PDF_COLORS.PURE_WHITE],
      textColor: [...PDF_COLORS.PRIMARY_INK],
    },
    alternateRowStyles: {
      fillColor: [...PDF_COLORS.PURE_WHITE],
    },
    footStyles: {
      font: PDF_LAYOUT.FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: PDF_TYPE.TABLE_TOTAL_SIZE,
      textColor: [...PDF_COLORS.PRIMARY_INK],
      fillColor: [...PDF_COLORS.PURE_WHITE],
      cellPadding: { top: 2.8, right: 2, bottom: 2.8, left: 2 },
      valign: 'middle',
    },
    columnStyles,
    head: headRow,
    body: sanitizedBody,
    foot: sanitizedFoot,
    didParseCell: (data: CellHookData) => {
      // Match header/footer alignment strictly to column alignment
      const colCfg = config.columns[data.column.index];
      if (colCfg) {
        data.cell.styles.halign = colCfg.align;
      }
      // Enforce zero colored fills anywhere
      data.cell.styles.fillColor = [...PDF_COLORS.PURE_WHITE];
    },
    didDrawCell: (data: CellHookData) => {
      const { cell, section, column } = data;
      const x1 = cell.x;
      const x2 = cell.x + cell.width;
      const yTop = cell.y;
      const yBottom = cell.y + cell.height;

      if (section === 'head') {
        doc.setDrawColor(...PDF_COLORS.STRONG_RULE);
        setStrokePt(doc, 0.6);
        doc.line(x1, yBottom, x2, yBottom);
        return;
      }

      if (section === 'body') {
        doc.setDrawColor(...PDF_COLORS.SUBTLE_RULE);
        setStrokePt(doc, 0.25);
        doc.line(x1, yBottom, x2, yBottom);

        if (config.rows.length > 0 && tickColIndices.has(column.index)) {
          const boxSize = PDF_LAYOUT.TICK_BOX_SIZE_MM;
          const boxX = cell.x + (cell.width - boxSize) / 2;
          const boxY = cell.y + (cell.height - boxSize) / 2;
          doc.setFillColor(...PDF_COLORS.PURE_WHITE);
          doc.setDrawColor(...PDF_COLORS.SECONDARY_INK);
          setStrokePt(doc, PDF_LAYOUT.TICK_BOX_STROKE_PT);
          doc.rect(boxX, boxY, boxSize, boxSize, 'FD');
        }
        return;
      }

      if (section === 'foot') {
        doc.setDrawColor(...PDF_COLORS.STRONG_RULE);
        setStrokePt(doc, 0.6);
        doc.line(x1, yTop, x2, yTop);
        setStrokePt(doc, 0.8);
        doc.line(x1, yBottom, x2, yBottom);
      }
    },
  });

  // Zone 4 (Sign-Off / Settlement on final page)
  if (config.includeSignOff !== false) {
    const finalY = doc.lastAutoTable?.finalY ?? zone2BottomY + 20;
    drawSignOffBlock(doc, config, finalY, pageWidth, pageHeight);
  }

  // Zone 5 (Running Footer + Continuation Headers across 1..N)
  drawRunningChrome(doc, config, pageWidth, pageHeight);

  return doc;
}

export { buildWhatsAppReportText } from './whatsappFormatter';
export { copyWhatsAppReportText, deliverWhatsAppReport } from './whatsappShare';

/**
 * Generate and trigger browser download of a formal monochrome A4 PDF.
 */
export function generateFormalPdf(config: FormalPdfDocumentConfig): string {
  const doc = buildFormalPdfDocument(config);
  doc.save(config.filename);
  return config.filename;
}
