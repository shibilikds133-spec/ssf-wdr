import type {
  AdminDashboardResponse,
  EntryItem,
  SectorDashboardResponse,
  SectorOption,
  UnitDashboardResponse,
  UnitSummaryRow,
} from '../types';
import {
  calcLimitSharePercent,
  calcSectorUnitSharePercent,
  formatCurrency,
  formatDateTime,
  formatQuantity,
} from './format';

export type ReportPortalRole = 'ADMIN' | 'SECTOR' | 'UNIT';

export type ReportScopeType =
  | 'ENTIRE_DIVISION'
  | 'SECTOR_SPECIFIC'
  | 'UNIT_SPECIFIC'
  | 'DIVISION_DIRECT'
  | 'ENTIRE_SECTOR'
  | 'THIS_UNIT';

export type ReportTemplateType =
  | 'DETAILED_ORDERS'
  | 'DELIVERY_SHEET'
  | 'SECTOR_SUMMARY'
  | 'UNIT_SUMMARY'
  | 'UNPAID_DUES';

export type ReportDatePreset = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'CUSTOM';
export type ReportSortBy = 'LATEST' | 'OLDEST' | 'HIGHEST_QTY' | 'NAME_ASC';

export interface ReportFilterConfig {
  role: ReportPortalRole;
  scope: ReportScopeType;
  sectorId: number | null;
  unitId: number | null;
  template: ReportTemplateType;
  paymentStatus: 'ALL' | 'PAID' | 'UNPAID';
  paymentMode: 'ALL' | 'CASH' | 'UPI';
  datePreset: ReportDatePreset;
  dateFrom: string;
  dateTo: string;
  includeZeroOrderUnits: boolean;
  sortBy: ReportSortBy;
}

export type ReportDataSource =
  | { role: 'ADMIN'; data: AdminDashboardResponse }
  | { role: 'SECTOR'; data: SectorDashboardResponse }
  | { role: 'UNIT'; data: UnitDashboardResponse };

export interface ReportSummaryStats {
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
}

export interface ReportOrderRow {
  serial: number;
  id: number;
  contributorName: string;
  mobileNumber: string;
  sectorId: number | null;
  sectorName: string;
  unitId: number | null;
  unitName: string;
  unitCode: string;
  isDivisionDirect: boolean;
  quantity: number;
  unitRateApplied: number;
  totalAmount: number;
  paymentStatus: 'PAID' | 'UNPAID';
  paymentMode: 'CASH' | 'UPI' | null;
  paymentLabel: string;
  createdAt: string;
  dateLabel: string;
}

export interface ReportUnitSummaryRow {
  rank: number;
  unitId: number;
  unitName: string;
  unitCode: string;
  sectorId: number | null;
  sectorName: string;
  orders: number;
  liters: number;
  sharePercent: number;
  cashAmount: number;
  upiAmount: number;
  unpaidAmount: number;
  unpaidCount: number;
  totalAmount: number;
}

export interface ReportSectorSummaryRow {
  rank: number;
  sectorId: number;
  sectorName: string;
  sectorCode: string;
  activeUnits: number;
  totalUnits: number;
  orders: number;
  liters: number;
  limitSharePercent: number;
  cashAmount: number;
  upiAmount: number;
  unpaidAmount: number;
  unpaidCount: number;
  totalAmount: number;
}

export interface ReportDailyBreakdownRow {
  dateKey: string;
  dateLabel: string;
  totalOrders: number;
  totalLiters: number;
  totalAmount: number;
  cashAmount: number;
  upiAmount: number;
  unpaidAmount: number;
  unpaidCount: number;
}

export interface ReportColumnDef {
  key: string;
  label: string;
  align: 'left' | 'right' | 'center';
  numeric?: boolean;
}

export interface ReportPayload {
  role: ReportPortalRole;
  config: ReportFilterConfig;
  orientation: 'portrait' | 'landscape';
  title: string;
  scopeSubtitle: string;
  challengeTitle: string;
  portalContextLabel: string;
  unitRate: number;
  divisionLimit: number;
  generatedAtIso: string;
  generatedAtLabel: string;
  activeFiltersLabel: string;
  activeFilterTags: string[];
  accentHex: string;
  isSelectionIncomplete: boolean;
  selectionPrompt: string | null;
  showSectorColumn: boolean;
  showUnitColumn: boolean;
  summary: ReportSummaryStats;
  tableTotals: ReportSummaryStats;
  divisionDirectBreakdown: ReportSummaryStats;
  columns: ReportColumnDef[];
  orderRows: ReportOrderRow[];
  unitRows: ReportUnitSummaryRow[];
  sectorRows: ReportSectorSummaryRow[];
  matchedCount: number;
  recordNoun: 'orders' | 'units' | 'sectors';
  filenameBase: string;
  pdfFilename: string;
  csvFilename: string;
  csvHeaders: string[];
  csvRows: (string | number)[][];
  csvTotalRow: (string | number)[];
}

const IST_TIMEZONE = 'Asia/Kolkata';

const PORTAL_ACCENTS: Record<ReportPortalRole, string> = {
  ADMIN: '#381932',
  SECTOR: '#043326',
  UNIT: '#EC5E27',
};

const SCOPE_MATRIX: Record<ReportPortalRole, ReportScopeType[]> = {
  ADMIN: [
    'ENTIRE_DIVISION',
    'SECTOR_SPECIFIC',
    'UNIT_SPECIFIC',
    'DIVISION_DIRECT',
  ],
  SECTOR: ['ENTIRE_SECTOR', 'UNIT_SPECIFIC'],
  UNIT: ['THIS_UNIT'],
};

const TEMPLATE_MATRIX: Record<
  ReportPortalRole,
  Partial<Record<ReportScopeType, ReportTemplateType[]>>
> = {
  ADMIN: {
    ENTIRE_DIVISION: [
      'DETAILED_ORDERS',
      'DELIVERY_SHEET',
      'SECTOR_SUMMARY',
      'UNIT_SUMMARY',
      'UNPAID_DUES',
    ],
    SECTOR_SPECIFIC: [
      'DETAILED_ORDERS',
      'DELIVERY_SHEET',
      'UNIT_SUMMARY',
      'UNPAID_DUES',
    ],
    UNIT_SPECIFIC: ['DETAILED_ORDERS', 'DELIVERY_SHEET', 'UNPAID_DUES'],
    DIVISION_DIRECT: ['DETAILED_ORDERS', 'DELIVERY_SHEET', 'UNPAID_DUES'],
  },
  SECTOR: {
    ENTIRE_SECTOR: [
      'DETAILED_ORDERS',
      'DELIVERY_SHEET',
      'UNIT_SUMMARY',
      'UNPAID_DUES',
    ],
    UNIT_SPECIFIC: ['DETAILED_ORDERS', 'DELIVERY_SHEET', 'UNPAID_DUES'],
  },
  UNIT: {
    THIS_UNIT: ['DELIVERY_SHEET', 'DETAILED_ORDERS', 'UNPAID_DUES'],
  },
};

function finiteOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function roundTwo(value: number): number {
  const safe = finiteOrZero(value);
  return Math.round(safe * 100) / 100;
}

export function isDivisionDirectEntry(entry: EntryItem): boolean {
  return Boolean(entry.is_division_direct) || entry.unit_id == null;
}

export function getAllowedScopes(role: ReportPortalRole): ReportScopeType[] {
  return SCOPE_MATRIX[role];
}

export function getAllowedTemplates(
  role: ReportPortalRole,
  scope: ReportScopeType
): ReportTemplateType[] {
  const roleTemplates = TEMPLATE_MATRIX[role][scope];
  if (roleTemplates && roleTemplates.length > 0) {
    return roleTemplates;
  }
  const fallbackScope = SCOPE_MATRIX[role][0];
  return TEMPLATE_MATRIX[role][fallbackScope] ?? ['DETAILED_ORDERS'];
}

export function getDefaultReportConfig(
  role: ReportPortalRole,
  overrides?: Partial<ReportFilterConfig>
): ReportFilterConfig {
  const defaultScope: ReportScopeType =
    role === 'ADMIN'
      ? 'ENTIRE_DIVISION'
      : role === 'SECTOR'
      ? 'ENTIRE_SECTOR'
      : 'THIS_UNIT';

  const defaultTemplate: ReportTemplateType =
    role === 'UNIT' ? 'DELIVERY_SHEET' : 'DETAILED_ORDERS';

  const base: ReportFilterConfig = {
    scope: defaultScope,
    sectorId: null,
    unitId: null,
    template: defaultTemplate,
    paymentStatus: 'ALL',
    paymentMode: 'ALL',
    datePreset: 'ALL',
    dateFrom: '',
    dateTo: '',
    includeZeroOrderUnits: true,
    sortBy: 'LATEST',
    ...overrides,
    role,
  };

  return normalizeReportConfig(base);
}

export function normalizeReportConfig(
  config: ReportFilterConfig
): ReportFilterConfig {
  const allowedScopes = getAllowedScopes(config.role);
  const scope = allowedScopes.includes(config.scope)
    ? config.scope
    : allowedScopes[0];

  const allowedTemplates = getAllowedTemplates(config.role, scope);
  const template = allowedTemplates.includes(config.template)
    ? config.template
    : allowedTemplates[0];

  let paymentStatus: 'ALL' | 'PAID' | 'UNPAID' = config.paymentStatus;
  let paymentMode: 'ALL' | 'CASH' | 'UPI' = config.paymentMode;

  if (template === 'UNPAID_DUES') {
    paymentStatus = 'UNPAID';
    paymentMode = 'ALL';
  } else if (paymentStatus === 'UNPAID') {
    paymentMode = 'ALL';
  }

  let dateFrom = (config.dateFrom ?? '').trim();
  let dateTo = (config.dateTo ?? '').trim();
  if (
    config.datePreset === 'CUSTOM' &&
    dateFrom !== '' &&
    dateTo !== '' &&
    dateFrom > dateTo
  ) {
    const tmp = dateFrom;
    dateFrom = dateTo;
    dateTo = tmp;
  }

  let sectorId = config.sectorId;
  let unitId = config.unitId;
  if (config.role === 'ADMIN') {
    if (scope === 'ENTIRE_DIVISION' || scope === 'DIVISION_DIRECT') {
      sectorId = null;
      unitId = null;
    } else if (scope === 'SECTOR_SPECIFIC') {
      unitId = null;
    }
  } else if (config.role === 'SECTOR') {
    if (scope === 'ENTIRE_SECTOR') {
      unitId = null;
    }
  }

  return {
    ...config,
    scope,
    sectorId,
    unitId,
    template,
    paymentStatus,
    paymentMode,
    dateFrom,
    dateTo,
    includeZeroOrderUnits:
      typeof config.includeZeroOrderUnits === 'boolean'
        ? config.includeZeroOrderUnits
        : true,
  };
}

export function getIstDateKey(dateOrIso: Date | string): string {
  if (
    typeof dateOrIso === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateOrIso.trim())
  ) {
    return dateOrIso.trim();
  }
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftIstDateKey(dateKey: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatIstTimestamp(date: Date): string {
  if (Number.isNaN(date.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TIMEZONE,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const dayPeriod = get('dayPeriod').toUpperCase();

  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod} IST`.trim();
}

function formatIstDayLabel(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const dt = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 6, 0, 0)
  );
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST_TIMEZONE,
  }).format(dt);
}

function sanitizeSlug(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned || 'report';
}

function emptySummaryStats(): ReportSummaryStats {
  return {
    totalOrders: 0,
    totalLiters: 0,
    totalAmount: 0,
    paidAmount: 0,
    paidCount: 0,
    cashAmount: 0,
    cashCount: 0,
    upiAmount: 0,
    upiCount: 0,
    unpaidAmount: 0,
    unpaidCount: 0,
  };
}

export function computeSummaryFromEntries(
  entries: EntryItem[]
): ReportSummaryStats {
  const stats = emptySummaryStats();
  for (const entry of entries) {
    if (entry.is_deleted === true) continue;
    const qty = finiteOrZero(entry.quantity);
    const amount = finiteOrZero(entry.total_amount);
    stats.totalOrders += 1;
    stats.totalLiters += qty;
    stats.totalAmount += amount;

    if (entry.payment_status === 'UNPAID') {
      stats.unpaidAmount += amount;
      stats.unpaidCount += 1;
    } else {
      stats.paidAmount += amount;
      stats.paidCount += 1;
      if (entry.payment_mode === 'CASH') {
        stats.cashAmount += amount;
        stats.cashCount += 1;
      } else if (entry.payment_mode === 'UPI') {
        stats.upiAmount += amount;
        stats.upiCount += 1;
      }
    }
  }

  return {
    totalOrders: stats.totalOrders,
    totalLiters: roundTwo(stats.totalLiters),
    totalAmount: roundTwo(stats.totalAmount),
    paidAmount: roundTwo(stats.paidAmount),
    paidCount: stats.paidCount,
    cashAmount: roundTwo(stats.cashAmount),
    cashCount: stats.cashCount,
    upiAmount: roundTwo(stats.upiAmount),
    upiCount: stats.upiCount,
    unpaidAmount: roundTwo(stats.unpaidAmount),
    unpaidCount: stats.unpaidCount,
  };
}

export function buildUnitDailyBreakdown(
  entries: EntryItem[],
  unitId?: number
): ReportDailyBreakdownRow[] {
  const map = new Map<string, ReportDailyBreakdownRow>();
  for (const entry of entries) {
    if (isDivisionDirectEntry(entry)) continue;
    if (unitId != null && entry.unit_id !== unitId) continue;
    const dateKey = getIstDateKey(entry.created_at);
    if (!dateKey) continue;

    const existing = map.get(dateKey) ?? {
      dateKey,
      dateLabel: formatIstDayLabel(dateKey),
      totalOrders: 0,
      totalLiters: 0,
      totalAmount: 0,
      cashAmount: 0,
      upiAmount: 0,
      unpaidAmount: 0,
      unpaidCount: 0,
    };

    const qty = finiteOrZero(entry.quantity);
    const amount = finiteOrZero(entry.total_amount);
    existing.totalOrders += 1;
    existing.totalLiters = roundTwo(existing.totalLiters + qty);
    existing.totalAmount = roundTwo(existing.totalAmount + amount);

    if (entry.payment_status === 'UNPAID') {
      existing.unpaidAmount = roundTwo(existing.unpaidAmount + amount);
      existing.unpaidCount += 1;
    } else if (entry.payment_mode === 'CASH') {
      existing.cashAmount = roundTwo(existing.cashAmount + amount);
    } else if (entry.payment_mode === 'UPI') {
      existing.upiAmount = roundTwo(existing.upiAmount + amount);
    }

    map.set(dateKey, existing);
  }

  return [...map.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function formatPaymentLabel(entry: EntryItem): string {
  if (entry.payment_status === 'UNPAID') return 'Unpaid';
  if (entry.payment_mode === 'CASH') return 'Paid • Cash';
  if (entry.payment_mode === 'UPI') return 'Paid • UPI';
  return 'Paid';
}

function formatPaymentCsvLabel(entry: EntryItem): string {
  if (entry.payment_status === 'UNPAID') return 'Unpaid';
  if (entry.payment_mode === 'CASH') return 'Paid (Cash Handover)';
  if (entry.payment_mode === 'UPI') return 'Paid (UPI)';
  return 'Paid';
}

function buildActiveFilterDescription(config: ReportFilterConfig): {
  tags: string[];
  label: string;
} {
  const tags: string[] = [];

  if (config.template === 'UNPAID_DUES' || config.paymentStatus === 'UNPAID') {
    tags.push('Status: Unpaid Only');
  } else if (config.paymentStatus === 'PAID') {
    const modeSuffix =
      config.paymentMode === 'CASH'
        ? ' (Cash Handover)'
        : config.paymentMode === 'UPI'
        ? ' (UPI)'
        : '';
    tags.push(`Status: Paid${modeSuffix}`);
  } else if (config.paymentMode !== 'ALL') {
    tags.push(
      `Status: Paid (${config.paymentMode === 'CASH' ? 'Cash Handover' : 'UPI'})`
    );
  } else {
    tags.push('Status: All Payments');
  }

  if (config.datePreset === 'TODAY') {
    tags.push('Date: Today');
  } else if (config.datePreset === 'LAST_7_DAYS') {
    tags.push('Date: Last 7 Days');
  } else if (config.datePreset === 'CUSTOM') {
    if (config.dateFrom && config.dateTo) {
      tags.push(
        `Date: ${formatIstDayLabel(config.dateFrom)} to ${formatIstDayLabel(config.dateTo)}`
      );
    } else if (config.dateFrom) {
      tags.push(`Date: From ${formatIstDayLabel(config.dateFrom)}`);
    } else if (config.dateTo) {
      tags.push(`Date: Up to ${formatIstDayLabel(config.dateTo)}`);
    } else {
      tags.push('Date: Custom (All)');
    }
  } else {
    tags.push('Date: All Dates');
  }

  const sortMap: Record<ReportSortBy, string> = {
    LATEST: 'Latest First',
    OLDEST: 'Oldest First',
    HIGHEST_QTY: 'Highest Qty',
    NAME_ASC: 'Name A–Z',
  };
  tags.push(`Sort: ${sortMap[config.sortBy]}`);

  return {
    tags,
    label: tags.join(' • '),
  };
}

function matchesPaymentFilter(
  entry: EntryItem,
  config: ReportFilterConfig
): boolean {
  if (config.paymentStatus === 'UNPAID') {
    return entry.payment_status === 'UNPAID';
  }
  if (config.paymentStatus === 'PAID') {
    if (entry.payment_status !== 'PAID') return false;
    if (config.paymentMode !== 'ALL') {
      return entry.payment_mode === config.paymentMode;
    }
    return true;
  }
  if (config.paymentMode !== 'ALL') {
    return (
      entry.payment_status === 'PAID' &&
      entry.payment_mode === config.paymentMode
    );
  }
  return true;
}

function matchesDateFilter(
  entry: EntryItem,
  config: ReportFilterConfig,
  todayKey: string,
  sevenDaysAgoKey: string
): boolean {
  if (config.datePreset === 'ALL') return true;
  const entryKey = getIstDateKey(entry.created_at);
  if (!entryKey) return false;

  if (config.datePreset === 'TODAY') {
    return entryKey === todayKey;
  }
  if (config.datePreset === 'LAST_7_DAYS') {
    return entryKey >= sevenDaysAgoKey && entryKey <= todayKey;
  }
  if (config.datePreset === 'CUSTOM') {
    if (config.dateFrom && entryKey < config.dateFrom) return false;
    if (config.dateTo && entryKey > config.dateTo) return false;
    return true;
  }
  return true;
}

function sortOrderEntries(
  entries: EntryItem[],
  sortBy: ReportSortBy
): EntryItem[] {
  return [...entries].sort((a, b) => {
    if (sortBy === 'OLDEST') {
      const tDiff =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (Number.isFinite(tDiff) && tDiff !== 0) return tDiff;
      return a.id - b.id;
    }
    if (sortBy === 'HIGHEST_QTY') {
      const qDiff = finiteOrZero(b.quantity) - finiteOrZero(a.quantity);
      if (qDiff !== 0) return qDiff;
      const tDiff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (Number.isFinite(tDiff) && tDiff !== 0) return tDiff;
      return b.id - a.id;
    }
    if (sortBy === 'NAME_ASC') {
      const nDiff = a.contributor_name.localeCompare(b.contributor_name);
      if (nDiff !== 0) return nDiff;
      return a.id - b.id;
    }
    // LATEST
    const tDiff =
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (Number.isFinite(tDiff) && tDiff !== 0) return tDiff;
    return b.id - a.id;
  });
}

function sumUnitRows(rows: ReportUnitSummaryRow[]): ReportSummaryStats {
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const totalLiters = roundTwo(rows.reduce((s, r) => s + r.liters, 0));
  const cashAmount = roundTwo(rows.reduce((s, r) => s + r.cashAmount, 0));
  const upiAmount = roundTwo(rows.reduce((s, r) => s + r.upiAmount, 0));
  const unpaidAmount = roundTwo(rows.reduce((s, r) => s + r.unpaidAmount, 0));
  const unpaidCount = rows.reduce((s, r) => s + r.unpaidCount, 0);
  const totalAmount = roundTwo(rows.reduce((s, r) => s + r.totalAmount, 0));
  const paidAmount = roundTwo(cashAmount + upiAmount);

  return {
    totalOrders,
    totalLiters,
    totalAmount,
    paidAmount,
    paidCount: Math.max(0, totalOrders - unpaidCount),
    cashAmount,
    cashCount: 0,
    upiAmount,
    upiCount: 0,
    unpaidAmount,
    unpaidCount,
  };
}

function sumSectorRows(rows: ReportSectorSummaryRow[]): ReportSummaryStats {
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const totalLiters = roundTwo(rows.reduce((s, r) => s + r.liters, 0));
  const cashAmount = roundTwo(rows.reduce((s, r) => s + r.cashAmount, 0));
  const upiAmount = roundTwo(rows.reduce((s, r) => s + r.upiAmount, 0));
  const unpaidAmount = roundTwo(rows.reduce((s, r) => s + r.unpaidAmount, 0));
  const unpaidCount = rows.reduce((s, r) => s + r.unpaidCount, 0);
  const totalAmount = roundTwo(rows.reduce((s, r) => s + r.totalAmount, 0));
  const paidAmount = roundTwo(cashAmount + upiAmount);

  return {
    totalOrders,
    totalLiters,
    totalAmount,
    paidAmount,
    paidCount: Math.max(0, totalOrders - unpaidCount),
    cashAmount,
    cashCount: 0,
    upiAmount,
    upiCount: 0,
    unpaidAmount,
    unpaidCount,
  };
}

export function buildReportPayload(
  source: ReportDataSource,
  rawConfig: ReportFilterConfig,
  now = new Date()
): ReportPayload {
  const config = normalizeReportConfig({
    ...rawConfig,
    role: source.role,
  });

  const todayKey = getIstDateKey(now);
  const sevenDaysAgoKey = shiftIstDateKey(todayKey, -6);
  const compactDate = todayKey.replace(/-/g, '') || '00000000';
  const generatedAtLabel = formatIstTimestamp(now);
  const generatedAtIso = now.toISOString();

  // Extract portal context, directory & strictly authorized entry pool
  let challengeTitle = 'SSF Wandoor Division Payasam Challenge';
  let portalContextLabel = 'Division Admin';
  let unitRate = 0;
  let divisionLimit = 0;
  let sectorsList: SectorOption[] = [];
  let authorizedUnits: UnitSummaryRow[] = [];
  let authorizedEntries: EntryItem[] = [];

  if (source.role === 'ADMIN') {
    const { data } = source;
    challengeTitle = data.settings.challenge_title || challengeTitle;
    portalContextLabel = 'Division Admin';
    unitRate = finiteOrZero(data.settings.unit_rate);
    divisionLimit = Math.max(0, finiteOrZero(data.settings.division_target));
    sectorsList = data.sectors ?? [];
    authorizedUnits = data.unit_summaries ?? [];
    authorizedEntries = (data.entries ?? []).filter((e) => e.is_deleted !== true);
  } else if (source.role === 'SECTOR') {
    const { data } = source;
    challengeTitle = data.settings.challenge_title || challengeTitle;
    portalContextLabel = `${data.sector.name} (${data.sector.login_code})`;
    unitRate = finiteOrZero(data.settings.unit_rate);
    divisionLimit = Math.max(0, finiteOrZero(data.settings.division_target));
    sectorsList = [
      {
        id: data.sector.id,
        name: data.sector.name,
        login_code: data.sector.login_code,
      },
    ];
    // Strict sector boundary: only units belonging to logged-in sector, zero Division Direct
    authorizedUnits = (data.units ?? []).filter(
      (u) => u.sector_id == null || u.sector_id === data.sector.id
    );
    const allowedUnitIds = new Set(authorizedUnits.map((u) => u.id));
    authorizedEntries = (data.entries ?? []).filter(
      (e) =>
        e.is_deleted !== true &&
        !isDivisionDirectEntry(e) &&
        e.unit_id != null &&
        allowedUnitIds.has(e.unit_id)
    );
    config.sectorId = data.sector.id;
  } else {
    const { data } = source;
    challengeTitle = data.settings.challenge_title || challengeTitle;
    portalContextLabel = `${data.unit.name} (${data.unit.login_code})`;
    unitRate = finiteOrZero(data.settings.unit_rate);
    divisionLimit = Math.max(0, finiteOrZero(data.settings.division_target));
    sectorsList = [
      {
        id: data.unit.sector_id,
        name: data.unit.sector_name,
        login_code: '',
      },
    ];
    authorizedUnits = [
      {
        id: data.unit.id,
        name: data.unit.name,
        login_code: data.unit.login_code,
        sector_id: data.unit.sector_id,
        sector_name: data.unit.sector_name,
        total_entries: finiteOrZero(data.summary.total_entries),
        total_quantity: finiteOrZero(data.summary.total_quantity),
        cash_amount: finiteOrZero(data.summary.cash_amount),
        upi_amount: finiteOrZero(data.summary.upi_amount),
        paid_amount: finiteOrZero(data.summary.paid_amount),
        unpaid_amount: finiteOrZero(data.summary.unpaid_amount),
        unpaid_entries: finiteOrZero(data.summary.unpaid_entries),
        total_amount: finiteOrZero(data.summary.total_amount),
      },
    ];
    // Strict unit boundary: only entries belonging to logged-in unit
    authorizedEntries = (data.entries ?? []).filter(
      (e) =>
        e.is_deleted !== true &&
        !isDivisionDirectEntry(e) &&
        e.unit_id === data.unit.id
    );
    config.scope = 'THIS_UNIT';
    config.sectorId = data.unit.sector_id;
    config.unitId = data.unit.id;
  }

  const unitById = new Map<number, UnitSummaryRow>();
  for (const u of authorizedUnits) {
    unitById.set(u.id, u);
  }
  const sectorById = new Map<number, SectorOption>();
  for (const s of sectorsList) {
    sectorById.set(s.id, s);
  }

  const resolveEntryUnit = (entry: EntryItem): UnitSummaryRow | undefined =>
    entry.unit_id != null ? unitById.get(entry.unit_id) : undefined;

  const resolveEntrySectorId = (entry: EntryItem): number | null => {
    if (isDivisionDirectEntry(entry)) return null;
    if (typeof entry.sector_id === 'number') return entry.sector_id;
    const u = resolveEntryUnit(entry);
    if (u && typeof u.sector_id === 'number') return u.sector_id;
    if (source.role === 'SECTOR') return source.data.sector.id;
    if (source.role === 'UNIT') return source.data.unit.sector_id;
    return null;
  };

  // Validate selected sector/unit against authorized directory
  const selectedSector =
    config.sectorId != null ? sectorById.get(config.sectorId) ?? null : null;
  const selectedUnit =
    config.unitId != null ? unitById.get(config.unitId) ?? null : null;

  let isSelectionIncomplete = false;
  let selectionPrompt: string | null = null;
  if (config.scope === 'SECTOR_SPECIFIC' && !selectedSector) {
    isSelectionIncomplete = true;
    selectionPrompt = 'Select a Sector to preview and export this report.';
  } else if (config.scope === 'UNIT_SPECIFIC' && !selectedUnit) {
    isSelectionIncomplete = true;
    selectionPrompt = 'Select a Unit to preview and export this report.';
  }

  // Scope entry filtering
  let scopedEntries: EntryItem[] = [];
  if (!isSelectionIncomplete) {
    scopedEntries = authorizedEntries.filter((entry) => {
      if (config.scope === 'ENTIRE_DIVISION') {
        return true;
      }
      if (config.scope === 'DIVISION_DIRECT') {
        return isDivisionDirectEntry(entry);
      }
      if (config.scope === 'SECTOR_SPECIFIC') {
        if (isDivisionDirectEntry(entry)) return false;
        return resolveEntrySectorId(entry) === selectedSector?.id;
      }
      if (config.scope === 'UNIT_SPECIFIC') {
        if (isDivisionDirectEntry(entry)) return false;
        return entry.unit_id === selectedUnit?.id;
      }
      if (config.scope === 'ENTIRE_SECTOR') {
        return !isDivisionDirectEntry(entry);
      }
      // THIS_UNIT
      return !isDivisionDirectEntry(entry);
    });
  }

  // Payment & date filtering
  const filteredEntries = scopedEntries.filter(
    (entry) =>
      matchesPaymentFilter(entry, config) &&
      matchesDateFilter(entry, config, todayKey, sevenDaysAgoKey)
  );

  // Executive KPI summary computed strictly from filtered entries
  const summary = computeSummaryFromEntries(filteredEntries);
  const directFilteredEntries = filteredEntries.filter(isDivisionDirectEntry);
  const divisionDirectBreakdown = computeSummaryFromEntries(
    directFilteredEntries
  );

  // Titles & Scope Subtitle
  const templateTitleMap: Record<ReportTemplateType, string> = {
    DETAILED_ORDERS:
      source.role === 'UNIT'
        ? 'Complete Order & Delivery Report'
        : config.scope === 'ENTIRE_DIVISION'
        ? 'Division Master Order Report'
        : 'Detailed Order Report',
    DELIVERY_SHEET: 'Payasam Delivery Sheet',
    SECTOR_SUMMARY: 'Sector-wise Summary Report',
    UNIT_SUMMARY: 'Unit-wise Summary Report',
    UNPAID_DUES:
      source.role === 'UNIT'
        ? 'Unpaid Collection Sheet'
        : 'Unpaid Dues / Pending Collection Report',
  };

  let scopeSubtitle =
    source.role === 'ADMIN' && sectorsList.length > 0
      ? `All Division — All ${sectorsList.length} Sectors (Units & Division Direct)`
      : 'Entire Division (All Sectors, Units & Division Direct)';
  let scopeSlug = 'division';

  if (config.scope === 'DIVISION_DIRECT') {
    scopeSubtitle = 'Division Direct Orders Only';
    scopeSlug = 'division_direct';
  } else if (config.scope === 'SECTOR_SPECIFIC') {
    scopeSubtitle = selectedSector
      ? `Sector Report — ${selectedSector.name} (${selectedSector.login_code})`
      : 'Specific Sector';
    scopeSlug = `sector_${sanitizeSlug(selectedSector?.login_code || 'selected')}`;
  } else if (config.scope === 'UNIT_SPECIFIC') {
    if (selectedUnit) {
      const unitSectorName =
        selectedUnit.sector_name ||
        (source.role === 'SECTOR' ? source.data.sector.name : '');
      scopeSubtitle = unitSectorName
        ? `Unit Report — ${selectedUnit.name} (${selectedUnit.login_code}) • ${unitSectorName}`
        : `Unit Report — ${selectedUnit.name} (${selectedUnit.login_code})`;
      scopeSlug = `unit_${sanitizeSlug(selectedUnit.login_code)}`;
    } else {
      scopeSubtitle = 'Specific Unit';
      scopeSlug = 'unit_selected';
    }
  } else if (config.scope === 'ENTIRE_SECTOR' && source.role === 'SECTOR') {
    scopeSubtitle = `Sector Report — ${source.data.sector.name} (${source.data.sector.login_code})`;
    scopeSlug = `sector_${sanitizeSlug(source.data.sector.login_code)}`;
  } else if (config.scope === 'THIS_UNIT' && source.role === 'UNIT') {
    scopeSubtitle = `Unit Report — ${source.data.unit.name} (${source.data.unit.login_code}) • ${source.data.unit.sector_name}`;
    scopeSlug = `unit_${sanitizeSlug(source.data.unit.login_code)}`;
  }

  const templateSlugMap: Record<ReportTemplateType, string> = {
    DETAILED_ORDERS:
      config.scope === 'ENTIRE_DIVISION' ? 'all_orders' : 'orders',
    DELIVERY_SHEET: 'delivery_sheet',
    SECTOR_SUMMARY: 'sector_summary',
    UNIT_SUMMARY: 'unit_summary',
    UNPAID_DUES: 'unpaid_dues',
  };

  const filenameBase = `ssf_${scopeSlug}_${templateSlugMap[config.template]}_${compactDate}`;
  const pdfFilename = `${filenameBase}.pdf`;
  const csvFilename = `${filenameBase}.csv`;

  const { tags: activeFilterTags, label: activeFiltersLabel } =
    buildActiveFilterDescription(config);

  const showSectorColumn =
    source.role === 'ADMIN' && config.scope === 'ENTIRE_DIVISION';
  const showUnitColumn =
    config.scope === 'ENTIRE_DIVISION' ||
    config.scope === 'SECTOR_SPECIFIC' ||
    config.scope === 'ENTIRE_SECTOR';

  // Build rows & columns by template
  let orderRows: ReportOrderRow[] = [];
  let unitRows: ReportUnitSummaryRow[] = [];
  let sectorRows: ReportSectorSummaryRow[] = [];
  let columns: ReportColumnDef[] = [];
  let tableTotals: ReportSummaryStats = summary;
  let recordNoun: 'orders' | 'units' | 'sectors' = 'orders';
  let csvHeaders: string[] = [];
  let csvRows: (string | number)[][] = [];
  let csvTotalRow: (string | number)[] = [];

  // Helper to build full division sector breakdown (used by SECTOR_SUMMARY and All-Division Detailed Print)
  const buildDivisionSectorSummaryRows = (
    includeZeroOrderSectors: boolean
  ): ReportSectorSummaryRow[] => {
    const sectorUnitsCount = new Map<number, number>();
    const activeUnitSets = new Map<number, Set<number>>();
    for (const u of authorizedUnits) {
      if (typeof u.sector_id === 'number') {
        sectorUnitsCount.set(
          u.sector_id,
          (sectorUnitsCount.get(u.sector_id) ?? 0) + 1
        );
      }
    }

    const aggMap = new Map<
      number,
      {
        sectorId: number;
        sectorName: string;
        sectorCode: string;
        orders: number;
        liters: number;
        cashAmount: number;
        upiAmount: number;
        unpaidAmount: number;
        unpaidCount: number;
        totalAmount: number;
      }
    >();

    for (const s of sectorsList) {
      aggMap.set(s.id, {
        sectorId: s.id,
        sectorName: s.name,
        sectorCode: s.login_code,
        orders: 0,
        liters: 0,
        cashAmount: 0,
        upiAmount: 0,
        unpaidAmount: 0,
        unpaidCount: 0,
        totalAmount: 0,
      });
    }

    // Aggregate ONLY non-Division-Direct entries onto sectors
    for (const entry of filteredEntries) {
      if (isDivisionDirectEntry(entry)) continue;
      const sId = resolveEntrySectorId(entry);
      if (sId == null) continue;
      const existing = aggMap.get(sId) ?? {
        sectorId: sId,
        sectorName: entry.sector_name || `Sector ${sId}`,
        sectorCode: '',
        orders: 0,
        liters: 0,
        cashAmount: 0,
        upiAmount: 0,
        unpaidAmount: 0,
        unpaidCount: 0,
        totalAmount: 0,
      };
      const qty = finiteOrZero(entry.quantity);
      const amount = finiteOrZero(entry.total_amount);
      existing.orders += 1;
      existing.liters += qty;
      existing.totalAmount += amount;
      if (entry.payment_status === 'UNPAID') {
        existing.unpaidAmount += amount;
        existing.unpaidCount += 1;
      } else if (entry.payment_mode === 'CASH') {
        existing.cashAmount += amount;
      } else if (entry.payment_mode === 'UPI') {
        existing.upiAmount += amount;
      }
      aggMap.set(sId, existing);

      if (entry.unit_id != null) {
        const set = activeUnitSets.get(sId) ?? new Set<number>();
        set.add(entry.unit_id);
        activeUnitSets.set(sId, set);
      }
    }

    let list = [...aggMap.values()].map((item) => {
      const liters = roundTwo(item.liters);
      return {
        rank: 0,
        sectorId: item.sectorId,
        sectorName: item.sectorName,
        sectorCode: item.sectorCode,
        activeUnits: activeUnitSets.get(item.sectorId)?.size ?? 0,
        totalUnits: sectorUnitsCount.get(item.sectorId) ?? 0,
        orders: item.orders,
        liters,
        limitSharePercent: roundTwo(calcLimitSharePercent(liters, divisionLimit)),
        cashAmount: roundTwo(item.cashAmount),
        upiAmount: roundTwo(item.upiAmount),
        unpaidAmount: roundTwo(item.unpaidAmount),
        unpaidCount: item.unpaidCount,
        totalAmount: roundTwo(item.totalAmount),
      };
    });

    if (!includeZeroOrderSectors) {
      list = list.filter((s) => s.orders > 0);
    }

    list.sort((a, b) => {
      if (config.sortBy === 'NAME_ASC') {
        return a.sectorName.localeCompare(b.sectorName);
      }
      if (config.sortBy === 'OLDEST') {
        if (a.liters !== b.liters) return a.liters - b.liters;
        return a.sectorName.localeCompare(b.sectorName);
      }
      if (b.liters !== a.liters) return b.liters - a.liters;
      if (b.orders !== a.orders) return b.orders - a.orders;
      return a.sectorName.localeCompare(b.sectorName);
    });

    return list.map((row, idx) => ({ ...row, rank: idx + 1 }));
  };

  if (source.role === 'ADMIN' && config.scope === 'ENTIRE_DIVISION') {
    sectorRows = buildDivisionSectorSummaryRows(
      config.template === 'SECTOR_SUMMARY' ? config.includeZeroOrderUnits : true
    );
  }

  if (config.template === 'SECTOR_SUMMARY') {
    recordNoun = 'sectors';
    tableTotals = sumSectorRows(sectorRows);

    columns = [
      { key: 'rank', label: 'Rank', align: 'center', numeric: true },
      { key: 'sectorName', label: 'Sector Name', align: 'left' },
      { key: 'sectorCode', label: 'Code', align: 'left' },
      { key: 'units', label: 'Active/Total Units', align: 'center', numeric: true },
      { key: 'orders', label: 'Orders', align: 'right', numeric: true },
      { key: 'liters', label: 'Liters (L)', align: 'right', numeric: true },
      { key: 'share', label: '% of Division Limit', align: 'right', numeric: true },
      { key: 'cash', label: 'Cash (₹)', align: 'right', numeric: true },
      { key: 'upi', label: 'UPI (₹)', align: 'right', numeric: true },
      { key: 'unpaid', label: 'Unpaid (₹)', align: 'right', numeric: true },
      { key: 'total', label: 'Total (₹)', align: 'right', numeric: true },
    ];

    csvHeaders = columns.map((c) => c.label);
    csvRows = sectorRows.map((r) => [
      r.rank,
      r.sectorName,
      r.sectorCode,
      `${r.activeUnits}/${r.totalUnits}`,
      r.orders,
      r.liters,
      Number(r.limitSharePercent.toFixed(1)),
      r.cashAmount,
      r.upiAmount,
      r.unpaidAmount,
      r.totalAmount,
    ]);
    const totalActiveUnits = sectorRows.reduce((s, r) => s + r.activeUnits, 0);
    const totalAllUnits = sectorRows.reduce((s, r) => s + r.totalUnits, 0);
    const totalLimitShare = roundTwo(
      calcLimitSharePercent(tableTotals.totalLiters, divisionLimit)
    );
    csvTotalRow = [
      '',
      `Total (${sectorRows.length} Sectors)`,
      '',
      `${totalActiveUnits}/${totalAllUnits}`,
      tableTotals.totalOrders,
      tableTotals.totalLiters,
      Number(totalLimitShare.toFixed(1)),
      tableTotals.cashAmount,
      tableTotals.upiAmount,
      tableTotals.unpaidAmount,
      tableTotals.totalAmount,
    ];
  } else if (config.template === 'UNIT_SUMMARY') {
    recordNoun = 'units';

    const scopedUnits = isSelectionIncomplete
      ? []
      : authorizedUnits.filter((u) => {
          if (config.scope === 'SECTOR_SPECIFIC') {
            return u.sector_id === selectedSector?.id;
          }
          return true;
        });

    const aggMap = new Map<
      number,
      {
        unitId: number;
        unitName: string;
        unitCode: string;
        sectorId: number | null;
        sectorName: string;
        orders: number;
        liters: number;
        cashAmount: number;
        upiAmount: number;
        unpaidAmount: number;
        unpaidCount: number;
        totalAmount: number;
      }
    >();

    for (const u of scopedUnits) {
      const sId =
        typeof u.sector_id === 'number'
          ? u.sector_id
          : source.role === 'SECTOR'
          ? source.data.sector.id
          : null;
      const sName =
        u.sector_name ??
        (sId != null ? sectorById.get(sId)?.name : undefined) ??
        (source.role === 'SECTOR' ? source.data.sector.name : '');
      aggMap.set(u.id, {
        unitId: u.id,
        unitName: u.name,
        unitCode: u.login_code,
        sectorId: sId,
        sectorName: sName,
        orders: 0,
        liters: 0,
        cashAmount: 0,
        upiAmount: 0,
        unpaidAmount: 0,
        unpaidCount: 0,
        totalAmount: 0,
      });
    }

    // Aggregate ONLY non-Division-Direct entries onto units
    for (const entry of filteredEntries) {
      if (isDivisionDirectEntry(entry) || entry.unit_id == null) continue;
      const existing = aggMap.get(entry.unit_id);
      if (!existing) continue;
      const qty = finiteOrZero(entry.quantity);
      const amount = finiteOrZero(entry.total_amount);
      existing.orders += 1;
      existing.liters += qty;
      existing.totalAmount += amount;
      if (entry.payment_status === 'UNPAID') {
        existing.unpaidAmount += amount;
        existing.unpaidCount += 1;
      } else if (entry.payment_mode === 'CASH') {
        existing.cashAmount += amount;
      } else if (entry.payment_mode === 'UPI') {
        existing.upiAmount += amount;
      }
    }

    const totalScopeUnitLiters = [...aggMap.values()].reduce(
      (sum, item) => sum + item.liters,
      0
    );

    let list = [...aggMap.values()].map((item) => {
      const liters = roundTwo(item.liters);
      const share =
        config.scope === 'ENTIRE_DIVISION'
          ? calcLimitSharePercent(liters, divisionLimit)
          : calcSectorUnitSharePercent(liters, totalScopeUnitLiters);
      return {
        rank: 0,
        unitId: item.unitId,
        unitName: item.unitName,
        unitCode: item.unitCode,
        sectorId: item.sectorId,
        sectorName: item.sectorName,
        orders: item.orders,
        liters,
        sharePercent: roundTwo(share),
        cashAmount: roundTwo(item.cashAmount),
        upiAmount: roundTwo(item.upiAmount),
        unpaidAmount: roundTwo(item.unpaidAmount),
        unpaidCount: item.unpaidCount,
        totalAmount: roundTwo(item.totalAmount),
      };
    });

    if (!config.includeZeroOrderUnits) {
      list = list.filter((u) => u.orders > 0);
    }

    list.sort((a, b) => {
      if (config.sortBy === 'NAME_ASC') {
        return a.unitName.localeCompare(b.unitName);
      }
      if (config.sortBy === 'OLDEST') {
        if (a.liters !== b.liters) return a.liters - b.liters;
        return a.unitName.localeCompare(b.unitName);
      }
      if (b.liters !== a.liters) return b.liters - a.liters;
      if (b.orders !== a.orders) return b.orders - a.orders;
      return a.unitName.localeCompare(b.unitName);
    });

    unitRows = list.map((row, idx) => ({ ...row, rank: idx + 1 }));
    tableTotals = sumUnitRows(unitRows);

    columns = [
      { key: 'rank', label: 'Rank', align: 'center', numeric: true },
      { key: 'unitName', label: 'Unit Name', align: 'left' },
      { key: 'unitCode', label: 'Code', align: 'left' },
      ...(showSectorColumn
        ? [{ key: 'sectorName', label: 'Sector', align: 'left' as const }]
        : []),
      { key: 'orders', label: 'Orders', align: 'right', numeric: true },
      { key: 'liters', label: 'Liters (L)', align: 'right', numeric: true },
      {
        key: 'share',
        label:
          config.scope === 'ENTIRE_DIVISION' ? 'Share (%)' : 'Sector Share (%)',
        align: 'right',
        numeric: true,
      },
      { key: 'cash', label: 'Cash (₹)', align: 'right', numeric: true },
      { key: 'upi', label: 'UPI (₹)', align: 'right', numeric: true },
      { key: 'unpaid', label: 'Unpaid (₹)', align: 'right', numeric: true },
      { key: 'total', label: 'Total (₹)', align: 'right', numeric: true },
    ];

    csvHeaders = columns.map((c) => c.label);
    csvRows = unitRows.map((r) => [
      r.rank,
      r.unitName,
      r.unitCode,
      ...(showSectorColumn ? [r.sectorName] : []),
      r.orders,
      r.liters,
      Number(r.sharePercent.toFixed(1)),
      r.cashAmount,
      r.upiAmount,
      r.unpaidAmount,
      r.totalAmount,
    ]);
    const totalShare =
      config.scope === 'ENTIRE_DIVISION'
        ? calcLimitSharePercent(tableTotals.totalLiters, divisionLimit)
        : totalScopeUnitLiters > 0
        ? 100
        : 0;
    csvTotalRow = [
      '',
      `Total (${unitRows.length} Units)`,
      '',
      ...(showSectorColumn ? [''] : []),
      tableTotals.totalOrders,
      tableTotals.totalLiters,
      Number(totalShare.toFixed(1)),
      tableTotals.cashAmount,
      tableTotals.upiAmount,
      tableTotals.unpaidAmount,
      tableTotals.totalAmount,
    ];
  } else {
    // DETAILED_ORDERS, DELIVERY_SHEET, UNPAID_DUES
    recordNoun = 'orders';
    const sorted = sortOrderEntries(filteredEntries, config.sortBy);
    orderRows = sorted.map((entry, idx) => {
      const direct = isDivisionDirectEntry(entry);
      const unitObj = resolveEntryUnit(entry);
      const resolvedSectorId = resolveEntrySectorId(entry);
      const resolvedSectorName = direct
        ? 'Division'
        : entry.sector_name ||
          (resolvedSectorId != null
            ? sectorById.get(resolvedSectorId)?.name
            : undefined) ||
          (source.role === 'SECTOR'
            ? source.data.sector.name
            : source.role === 'UNIT'
            ? source.data.unit.sector_name
            : '-');
      const resolvedUnitName = direct
        ? 'Division Direct'
        : entry.unit_name ||
          unitObj?.name ||
          (source.role === 'UNIT' ? source.data.unit.name : '-');
      const resolvedUnitCode = direct
        ? 'DIRECT'
        : unitObj?.login_code ||
          (source.role === 'UNIT' ? source.data.unit.login_code : '');

      return {
        serial: idx + 1,
        id: entry.id,
        contributorName: entry.contributor_name,
        mobileNumber: entry.mobile_number,
        sectorId: resolvedSectorId,
        sectorName: resolvedSectorName,
        unitId: entry.unit_id ?? null,
        unitName: resolvedUnitName,
        unitCode: resolvedUnitCode,
        isDivisionDirect: direct,
        quantity: roundTwo(finiteOrZero(entry.quantity)),
        unitRateApplied: roundTwo(finiteOrZero(entry.unit_rate_applied)),
        totalAmount: roundTwo(finiteOrZero(entry.total_amount)),
        paymentStatus: entry.payment_status,
        paymentMode: entry.payment_mode,
        paymentLabel: formatPaymentLabel(entry),
        createdAt: entry.created_at,
        dateLabel: formatDateTime(entry.created_at),
      };
    });

    tableTotals = summary;

    if (config.template === 'DELIVERY_SHEET') {
      columns = [
        { key: 'serial', label: '#', align: 'center', numeric: true },
        { key: 'contributorName', label: 'Customer Name', align: 'left' },
        { key: 'mobileNumber', label: 'Mobile', align: 'left', numeric: true },
        ...(showUnitColumn
          ? [{ key: 'unitName', label: 'Unit', align: 'left' as const }]
          : []),
        { key: 'quantity', label: 'Qty (L)', align: 'right', numeric: true },
        { key: 'totalAmount', label: 'Amount (₹)', align: 'right', numeric: true },
        { key: 'paymentLabel', label: 'Payment Status', align: 'left' },
        { key: 'delivered', label: 'Delivered [ ]', align: 'center' },
      ];
      csvHeaders = columns.map((c) => c.label);
      csvRows = orderRows.map((r) => [
        r.serial,
        r.contributorName,
        r.mobileNumber,
        ...(showUnitColumn ? [r.unitName] : []),
        r.quantity,
        r.totalAmount,
        r.paymentLabel,
        '[ ]',
      ]);
      csvTotalRow = [
        '',
        `Total (${orderRows.length} Orders)`,
        '',
        ...(showUnitColumn ? [''] : []),
        tableTotals.totalLiters,
        tableTotals.totalAmount,
        `Paid: ${formatCurrency(tableTotals.paidAmount)} | Unpaid: ${formatCurrency(tableTotals.unpaidAmount)}`,
        '',
      ];
    } else {
      columns = [
        { key: 'serial', label: '#', align: 'center', numeric: true },
        { key: 'contributorName', label: 'Ordered By', align: 'left' },
        { key: 'mobileNumber', label: 'Mobile', align: 'left', numeric: true },
        ...(showSectorColumn
          ? [{ key: 'sectorName', label: 'Sector', align: 'left' as const }]
          : []),
        ...(showUnitColumn
          ? [{ key: 'unitName', label: 'Unit', align: 'left' as const }]
          : []),
        { key: 'quantity', label: 'Qty (L)', align: 'right', numeric: true },
        { key: 'totalAmount', label: 'Amount (₹)', align: 'right', numeric: true },
        { key: 'paymentLabel', label: 'Payment', align: 'left' },
        { key: 'dateLabel', label: 'Date', align: 'left', numeric: true },
      ];
      csvHeaders = columns.map((c) => c.label);
      csvRows = orderRows.map((r) => {
        const entryObj: EntryItem = {
          id: r.id,
          contributor_name: r.contributorName,
          mobile_number: r.mobileNumber,
          quantity: r.quantity,
          unit_rate_applied: r.unitRateApplied,
          total_amount: r.totalAmount,
          payment_status: r.paymentStatus,
          payment_mode: r.paymentMode,
          created_at: r.createdAt,
        };
        return [
          r.serial,
          r.contributorName,
          r.mobileNumber,
          ...(showSectorColumn ? [r.sectorName] : []),
          ...(showUnitColumn ? [r.unitName] : []),
          r.quantity,
          r.totalAmount,
          formatPaymentCsvLabel(entryObj),
          r.dateLabel,
        ];
      });
      csvTotalRow = [
        '',
        `Total (${orderRows.length} Orders)`,
        '',
        ...(showSectorColumn ? [''] : []),
        ...(showUnitColumn ? [''] : []),
        tableTotals.totalLiters,
        tableTotals.totalAmount,
        `Cash: ${formatCurrency(tableTotals.cashAmount)} | UPI: ${formatCurrency(tableTotals.upiAmount)} | Unpaid: ${formatCurrency(tableTotals.unpaidAmount)}`,
        '',
      ];
    }
  }

  const matchedCount =
    config.template === 'SECTOR_SUMMARY'
      ? sectorRows.length
      : config.template === 'UNIT_SUMMARY'
      ? unitRows.length
      : orderRows.length;

  const orientation: 'portrait' | 'landscape' =
    config.template === 'SECTOR_SUMMARY' ||
    config.template === 'UNIT_SUMMARY' ||
    (source.role === 'ADMIN' && config.scope === 'ENTIRE_DIVISION')
      ? 'landscape'
      : 'portrait';

  return {
    role: source.role,
    config,
    orientation,
    title: templateTitleMap[config.template],
    scopeSubtitle,
    challengeTitle,
    portalContextLabel,
    unitRate,
    divisionLimit,
    generatedAtIso,
    generatedAtLabel,
    activeFiltersLabel,
    activeFilterTags,
    accentHex: PORTAL_ACCENTS[source.role],
    isSelectionIncomplete,
    selectionPrompt,
    showSectorColumn,
    showUnitColumn,
    summary,
    tableTotals,
    divisionDirectBreakdown,
    columns,
    orderRows,
    unitRows,
    sectorRows,
    matchedCount,
    recordNoun,
    filenameBase,
    pdfFilename,
    csvFilename,
    csvHeaders,
    csvRows,
    csvTotalRow,
  };
}

export function formatReportSummaryLine(payload: ReportPayload): string {
  const countLabel =
    payload.recordNoun === 'sectors'
      ? `${payload.matchedCount} Sectors`
      : payload.recordNoun === 'units'
      ? `${payload.matchedCount} Units`
      : `${payload.matchedCount} Orders`;
  return `${countLabel} • ${formatQuantity(payload.summary.totalLiters)} L • ${formatCurrency(payload.summary.totalAmount)}`;
}
