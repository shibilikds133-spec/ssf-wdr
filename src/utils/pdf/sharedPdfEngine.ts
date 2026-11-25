import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type Styles } from 'jspdf-autotable';
import type { ReportShareMode } from './pdfAccounting';
import {
  PDF_COLORS,
  PDF_LAYOUT,
  PDF_TYPE,
  PT_TO_MM,
  sanitizePdfText,
  type RgbColor,
} from './pdfTheme';

const MALAYALAM_RE = /[\u0D00-\u0D7F]/;
const PX_PER_MM = 96 / 25.4;
const CANVAS_TEXT_SCALE = 4;

interface RenderedUnicodeText {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
  lineCount: number;
}

function hasMalayalam(text: string): boolean {
  return MALAYALAM_RE.test(text);
}

function renderUnicodeTextImage(params: {
  text: string;
  fontSizePt: number;
  bold?: boolean;
  color: RgbColor;
  maxWidthMm: number;
  align?: 'left' | 'right' | 'center';
}): RenderedUnicodeText | null {
  if (typeof document === 'undefined') return null;

  const {
    text,
    fontSizePt,
    bold = false,
    color,
    maxWidthMm,
    align = 'left',
  } = params;
  const clean = text.trim();
  if (!clean) return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const fontPx = (fontSizePt * 96) / 72;
  const fontSpec = `${bold ? '700' : '500'} ${fontPx}px "Noto Sans Malayalam", "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.font = fontSpec;

  const maxWidthPx = Math.max(24, maxWidthMm * PX_PER_MM);
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidthPx) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (ctx.measureText(word).width <= maxWidthPx) {
        current = word;
      } else {
        // Hard-wrap overly long unbroken token
        let chunk = '';
        for (const ch of word) {
          const next = chunk + ch;
          if (ctx.measureText(next).width > maxWidthPx && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = next;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) return null;

  const lineWidths = lines.map((l) => ctx.measureText(l).width);
  const contentWidthPx = Math.min(maxWidthPx, Math.max(...lineWidths) + 2);
  const lineHeightPx = fontPx * 1.38;
  const contentHeightPx = Math.max(lineHeightPx, lines.length * lineHeightPx + 1);

  canvas.width = Math.max(1, Math.ceil(contentWidthPx * CANVAS_TEXT_SCALE));
  canvas.height = Math.max(1, Math.ceil(contentHeightPx * CANVAS_TEXT_SCALE));

  ctx.scale(CANVAS_TEXT_SCALE, CANVAS_TEXT_SCALE);
  ctx.font = fontSpec;
  ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;

  const drawX =
    align === 'right'
      ? contentWidthPx - 1
      : align === 'center'
      ? contentWidthPx / 2
      : 1;

  lines.forEach((line, idx) => {
    const drawY = (idx + 0.5) * lineHeightPx + 0.5;
    ctx.fillText(line, drawX, drawY);
  });

  return {
    dataUrl: canvas.toDataURL('image/png'),
    widthMm: contentWidthPx / PX_PER_MM,
    heightMm: contentHeightPx / PX_PER_MM,
    lineCount: lines.length,
  };
}

function drawSmartLine(
  doc: jsPDF,
  text: string,
  x: number,
  baselineY: number,
  opts: {
    fontSizePt: number;
    bold?: boolean;
    color: RgbColor;
    maxWidthMm: number;
    align?: 'left' | 'right' | 'center';
  }
): number {
  const { fontSizePt, bold = false, color, maxWidthMm, align = 'left' } = opts;
  if (hasMalayalam(text)) {
    const rendered = renderUnicodeTextImage({
      text,
      fontSizePt,
      bold,
      color,
      maxWidthMm,
      align,
    });
    if (rendered) {
      const drawX =
        align === 'right'
          ? x - rendered.widthMm
          : align === 'center'
          ? x - rendered.widthMm / 2
          : x;
      const topY = baselineY - (fontSizePt * PT_TO_MM) * 0.92;
      doc.addImage(
        rendered.dataUrl,
        'PNG',
        drawX,
        topY,
        rendered.widthMm,
        rendered.heightMm
      );
      return rendered.heightMm;
    }
  }

  doc.setFont(PDF_LAYOUT.FONT_FAMILY, bold ? 'bold' : 'normal');
  doc.setFontSize(fontSizePt);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, maxWidthMm) as string[];
  doc.text(lines, x, baselineY, { align });
  return lines.length * (fontSizePt * PT_TO_MM * 1.28);
}

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

export interface PdfSectionTableConfig {
  sectionTitle: string;
  columns: PdfTableColumn[];
  rows: (string | number)[][];
  totalRow: (string | number)[];
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
  /** Optional preface summary table rendered before the main table (e.g. All-Division Sector Listing). */
  prefaceTable?: PdfSectionTableConfig;
  /** Optional section heading rendered above the main table when a preface table is present. */
  mainTableTitle?: string;
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
  const cleanTitle = sanitizePdfText(config.reportTitle).toUpperCase();
  const titleHeight = drawSmartLine(doc, cleanTitle, MARGIN_LEFT, leftY, {
    fontSizePt: PDF_TYPE.TITLE_SIZE,
    bold: true,
    color: PDF_COLORS.PRIMARY_INK,
    maxWidthMm: leftMaxWidth,
  });
  leftY += Math.max(5.2, titleHeight + 0.6);

  const cleanScope = sanitizePdfText(config.scopeSubtitle);
  const scopeHeight = drawSmartLine(doc, cleanScope, MARGIN_LEFT, leftY + 0.5, {
    fontSizePt: PDF_TYPE.SUBTITLE_SIZE,
    bold: false,
    color: PDF_COLORS.SECONDARY_INK,
    maxWidthMm: leftMaxWidth,
  });
  leftY += Math.max(4.2, scopeHeight + 0.4);

  // Right Metadata Block (right-aligned, 35% width)
  const rightMaxWidth = usableWidth - leftMaxWidth - 4;
  let rightY = MARGIN_TOP + 3;
  const metaItems: [string, string][] = [
    ['Generated:', `${config.generatedDate}, ${config.generatedTime}`],
    ['Filter:', sanitizePdfText(config.filterSummary)],
    ['Rate:', sanitizePdfText(config.rateSummary)],
  ];

  for (const [label, val] of metaItems) {
    if (hasMalayalam(val) || hasMalayalam(label)) {
      const h = drawSmartLine(doc, `${label} ${val}`, rightX, rightY, {
        fontSizePt: PDF_TYPE.META_SIZE,
        bold: false,
        color: PDF_COLORS.PRIMARY_INK,
        maxWidthMm: rightMaxWidth,
        align: 'right',
      });
      rightY += Math.max(4.3, h + 0.6);
      continue;
    }

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

    drawSmartLine(doc, sanitizePdfText(metric.label).toUpperCase(), textX, stripTopY + 4.8, {
      fontSizePt: PDF_TYPE.SUMMARY_LABEL_SIZE,
      bold: false,
      color: PDF_COLORS.SECONDARY_INK,
      maxWidthMm: colW - 5,
      align,
    });

    drawSmartLine(doc, sanitizePdfText(metric.value), textX, stripTopY + 10.6, {
      fontSizePt: PDF_TYPE.SUMMARY_VALUE_SIZE,
      bold: true,
      color: PDF_COLORS.PRIMARY_INK,
      maxWidthMm: colW - 5,
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
      drawSmartLine(doc, `${ORG_TITLE}  -  ${cleanTitle}`, MARGIN_LEFT, headerTextY, {
        fontSizePt: PDF_TYPE.CONTINUATION_SIZE,
        bold: true,
        color: PDF_COLORS.SECONDARY_INK,
        maxWidthMm: pageWidth - MARGIN_LEFT - MARGIN_RIGHT - 65,
      });

      const truncatedScope =
        cleanScope.length > 58 ? `${cleanScope.slice(0, 55)}...` : cleanScope;
      drawSmartLine(doc, truncatedScope, rightX, headerTextY, {
        fontSizePt: PDF_TYPE.CONTINUATION_SIZE,
        bold: false,
        color: PDF_COLORS.MUTED_INK,
        maxWidthMm: 62,
        align: 'right',
      });

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
 * Render a pure-white monochrome AutoTable section and return its final bottom Y.
 */
function renderMonochromeTableSection(
  doc: JsPdfWithAutoTable,
  params: {
    startY: number;
    usableWidth: number;
    columns: PdfTableColumn[];
    rows: (string | number)[][];
    totalRow: (string | number)[];
    emptyMessage: string;
  }
): number {
  const { startY, usableWidth, columns, rows, totalRow, emptyMessage } = params;
  const colWidths = resolveColumnWidthsMm(columns, usableWidth);
  const columnStyles: Record<number, Partial<Styles>> = {};
  columns.forEach((col, idx) => {
    columnStyles[idx] = {
      cellWidth: colWidths[idx],
      halign: col.align,
      fontStyle: col.bold ? 'bold' : 'normal',
    };
  });

  const headRow = [columns.map((c) => sanitizePdfText(c.header).toUpperCase())];

  const tickColIndices = new Set<number>(
    columns.map((c, idx) => (c.tickBox ? idx : -1)).filter((idx) => idx >= 0)
  );

  const sanitizedBody =
    rows.length > 0
      ? rows.map((row) =>
          row.map((val, colIdx) =>
            tickColIndices.has(colIdx) ? '' : sanitizePdfText(val)
          )
        )
      : [columns.map((_, idx) => (idx === 1 ? emptyMessage : ''))];

  const sanitizedFoot =
    rows.length > 0 && totalRow.length === columns.length
      ? [totalRow.map((val) => sanitizePdfText(val))]
      : [];

  const malayalamCells = new Map<
    string,
    {
      rendered: RenderedUnicodeText;
      align: 'left' | 'right' | 'center';
    }
  >();

  autoTable(doc, {
    startY,
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
      const colCfg = columns[data.column.index];
      const align = colCfg?.align ?? 'left';
      if (colCfg) {
        data.cell.styles.halign = align;
      }
      data.cell.styles.fillColor = [...PDF_COLORS.PURE_WHITE];

      const rawText =
        typeof data.cell.raw === 'string'
          ? data.cell.raw
          : Array.isArray(data.cell.text)
          ? data.cell.text.join(' ')
          : '';
      if (rawText && hasMalayalam(rawText)) {
        const fontSizePt =
          data.section === 'head'
            ? PDF_TYPE.TABLE_HEAD_SIZE
            : data.section === 'foot'
            ? PDF_TYPE.TABLE_TOTAL_SIZE
            : PDF_TYPE.TABLE_BODY_SIZE;
        const bold =
          data.section === 'head' ||
          data.section === 'foot' ||
          Boolean(colCfg?.bold);
        const colW = colWidths[data.column.index] ?? 30;
        const rendered = renderUnicodeTextImage({
          text: rawText,
          fontSizePt,
          bold,
          color: PDF_COLORS.PRIMARY_INK,
          maxWidthMm: Math.max(8, colW - 4),
          align,
        });
        if (rendered) {
          malayalamCells.set(
            `${data.section}:${data.row.index}:${data.column.index}`,
            { rendered, align }
          );
          data.cell.text = [''];
          data.cell.styles.minCellHeight = Math.max(
            data.cell.styles.minCellHeight || 0,
            rendered.heightMm + 4.4
          );
        }
      }
    },
    didDrawCell: (data: CellHookData) => {
      const { cell, section, column } = data;
      const x1 = cell.x;
      const x2 = cell.x + cell.width;
      const yTop = cell.y;
      const yBottom = cell.y + cell.height;

      const mlCell = malayalamCells.get(
        `${section}:${data.row.index}:${column.index}`
      );
      if (mlCell) {
        const { rendered, align } = mlCell;
        const pad = 2;
        const drawX =
          align === 'right'
            ? x2 - pad - rendered.widthMm
            : align === 'center'
            ? x1 + (cell.width - rendered.widthMm) / 2
            : x1 + pad;
        const drawY = yTop + (cell.height - rendered.heightMm) / 2;
        doc.addImage(
          rendered.dataUrl,
          'PNG',
          drawX,
          drawY,
          rendered.widthMm,
          rendered.heightMm
        );
      }

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

        if (rows.length > 0 && tickColIndices.has(column.index)) {
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

  return doc.lastAutoTable?.finalY ?? startY + 12;
}

function drawSectionHeading(
  doc: jsPDF,
  title: string,
  y: number,
  pageWidth: number,
  pageHeight: number
): number {
  const { MARGIN_LEFT, MARGIN_RIGHT, CONTINUATION_TOP_Y } = PDF_LAYOUT;
  const maxY = pageHeight - PDF_LAYOUT.FOOTER_RULE_OFFSET_FROM_BOTTOM - 16;
  let headingY = y;
  if (headingY > maxY) {
    doc.addPage();
    headingY = CONTINUATION_TOP_Y + 2;
  }

  drawSmartLine(doc, sanitizePdfText(title).toUpperCase(), MARGIN_LEFT, headingY, {
    fontSizePt: PDF_TYPE.META_SIZE,
    bold: true,
    color: PDF_COLORS.PRIMARY_INK,
    maxWidthMm: pageWidth - MARGIN_LEFT - MARGIN_RIGHT,
  });

  doc.setDrawColor(...PDF_COLORS.SUBTLE_RULE);
  setStrokePt(doc, 0.3);
  doc.line(MARGIN_LEFT, headingY + 1.5, pageWidth - MARGIN_RIGHT, headingY + 1.5);

  return headingY + 3.5;
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

  // Optional Preface Table (e.g. All-Division Sector-Wise Listing right after Summary Strip)
  let mainTableStartY = zone2BottomY + 4;
  if (config.prefaceTable && config.prefaceTable.rows.length > 0) {
    const prefaceStartY = drawSectionHeading(
      doc,
      config.prefaceTable.sectionTitle,
      zone2BottomY + 6.5,
      pageWidth,
      pageHeight
    );
    const prefaceEndY = renderMonochromeTableSection(doc, {
      startY: prefaceStartY,
      usableWidth,
      columns: config.prefaceTable.columns,
      rows: config.prefaceTable.rows,
      totalRow: config.prefaceTable.totalRow,
      emptyMessage: 'No sector records found.',
    });

    mainTableStartY = config.mainTableTitle
      ? drawSectionHeading(
          doc,
          config.mainTableTitle,
          prefaceEndY + 8,
          pageWidth,
          pageHeight
        )
      : prefaceEndY + 6;
  }

  // Zone 3 (Main Formal Monochrome AutoTable)
  const finalY = renderMonochromeTableSection(doc, {
    startY: mainTableStartY,
    usableWidth,
    columns: config.columns,
    rows: config.rows,
    totalRow: config.totalRow,
    emptyMessage: 'No matching records found for selected filters.',
  });

  // Zone 4 (Sign-Off / Settlement on final page)
  if (config.includeSignOff !== false) {
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
