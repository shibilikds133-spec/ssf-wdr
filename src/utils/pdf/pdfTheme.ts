/**
 * Locked Monochrome Print-Ready Tokens & Formatters for the Formal PDF Engine.
 * Strict Zero-Color / Pure-White (#FFFFFF) Lock: no background fills, no tinted
 * banners, no colored badges, and WinAnsi-safe English typography (`Rs.` currency).
 */

export type RgbColor = readonly [number, number, number];

export const PDF_COLORS = {
  PURE_WHITE: [255, 255, 255] as RgbColor,
  PRIMARY_INK: [17, 24, 39] as RgbColor, // #111827
  SECONDARY_INK: [75, 85, 99] as RgbColor, // #4B5563
  MUTED_INK: [107, 114, 128] as RgbColor, // #6B7280
  STRONG_RULE: [17, 24, 39] as RgbColor, // #111827 (0.6pt - 0.8pt)
  SUBTLE_RULE: [215, 220, 226] as RgbColor, // #D7DCE2 (0.25pt - 0.35pt)
} as const;

export const PDF_LAYOUT = {
  ORG_TITLE: 'SSF WANDOOR DIVISION',
  CAMPAIGN_TITLE: 'Palada Payasam Challenge',
  FONT_FAMILY: 'helvetica',
  MARGIN_LEFT: 14,
  MARGIN_RIGHT: 14,
  MARGIN_TOP: 14,
  MARGIN_BOTTOM: 15,
  FOOTER_RULE_OFFSET_FROM_BOTTOM: 10.5,
  FOOTER_TEXT_OFFSET_FROM_BOTTOM: 6.5,
  CONTINUATION_TOP_Y: 19,
  SIGN_OFF_MIN_SPACE: 28,
  A4_PORTRAIT_WIDTH: 210,
  A4_PORTRAIT_HEIGHT: 297,
  A4_LANDSCAPE_WIDTH: 297,
  A4_LANDSCAPE_HEIGHT: 210,
  /** 210 - 14 - 14 = 182mm */
  USABLE_WIDTH_PORTRAIT: 182,
  /** 297 - 14 - 14 = 269mm */
  USABLE_WIDTH_LANDSCAPE: 269,
  TICK_BOX_SIZE_MM: 3.8,
  TICK_BOX_STROKE_PT: 0.35,
} as const;

export const PDF_TYPE = {
  ORG_SIZE: 9,
  TITLE_SIZE: 14,
  SUBTITLE_SIZE: 9.5,
  META_SIZE: 8,
  SUMMARY_LABEL_SIZE: 7.5,
  SUMMARY_VALUE_SIZE: 10.5,
  TABLE_HEAD_SIZE: 8,
  TABLE_BODY_SIZE: 8.5,
  TABLE_TOTAL_SIZE: 9,
  FOOTER_SIZE: 7.5,
  CONTINUATION_SIZE: 8,
} as const;

/** Point-to-millimeter conversion factor for jsPDF stroke widths. */
export const PT_TO_MM = 0.352778;

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Sanitize text for WinAnsi / built-in Helvetica PDF rendering:
 * - Converts Unicode rupee `₹` to safe ASCII `Rs. ` (prevents broken glyph `¹`)
 * - Normalizes bullets, em-dashes, non-breaking spaces, and smart quotes
 */
export function sanitizePdfText(raw: string | number | null | undefined): string {
  const s = String(raw ?? '');
  return s
    .replace(/₹\s*/g, 'Rs. ')
    .replace(/\u2022/g, '|')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function roundTwo(n: number): number {
  const safe = Number.isFinite(n) ? n : 0;
  return Math.round(safe * 100) / 100;
}

/**
 * Format currency strictly as `Rs. 1,250` (or `Rs. 1,250.50` when non-integer)
 * using Indian digit grouping (`en-IN`). Never emits broken Unicode `₹`.
 */
export function formatPdfCurrency(amount: number): string {
  const rounded = roundTwo(Number.isFinite(amount) ? amount : 0);
  const abs = Math.abs(rounded);
  const hasDecimals = Math.round(abs * 100) % 100 !== 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(abs);
  return rounded < 0 ? `-Rs. ${formatted}` : `Rs. ${formatted}`;
}

/**
 * Format liter quantity cleanly, stripping trailing `.0` / `.00`
 * (e.g. `2` -> `2 L`, `1.5` -> `1.5 L`, `2.25` -> `2.25 L`).
 */
export function formatPdfQuantity(qty: number): string {
  const rounded = roundTwo(Number.isFinite(qty) ? qty : 0);
  const formatted = rounded
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
  return `${formatted} L`;
}

export function formatPdfIstDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST_TIMEZONE,
  }).format(date);
}

export function formatPdfIstTime(date = new Date()): string {
  const t = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TIMEZONE,
  }).format(date);
  return `${t} IST`;
}

export function formatPdfDateKeyYmd(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: IST_TIMEZONE,
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function formatPdfShortDateTime(iso: string): string {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TIMEZONE,
  })
    .format(dt)
    .replace(',', '');
}

/**
 * Deterministic formal filename:
 * `SSF-Wandoor_<Scope>_<ReportType>_YYYY-MM-DD.pdf`
 */
export function buildFormalPdfFilename(
  scope: string,
  reportType: string,
  date = new Date()
): string {
  const cleanPart = (raw: string): string =>
    raw
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Report';
  const ymd = formatPdfDateKeyYmd(date);
  return `SSF-Wandoor_${cleanPart(scope)}_${cleanPart(reportType)}_${ymd}.pdf`;
}
