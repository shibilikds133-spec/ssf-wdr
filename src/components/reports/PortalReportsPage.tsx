import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  MessageCircle,
  PackageCheck,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { exportReportCsv } from '../../utils/csv';
import { exportReportPdf } from '../../utils/exportPdf';
import { formatCurrency, formatQuantity } from '../../utils/format';
import type { ReportShareMode } from '../../utils/pdf/pdfAccounting';
import { buildWhatsAppReportText } from '../../utils/pdf/whatsappFormatter';
import { deliverWhatsAppReport } from '../../utils/pdf/whatsappShare';
import {
  buildReportPayload,
  buildUnitDailyBreakdown,
  getDefaultReportConfig,
  isDivisionDirectEntry,
  type ReportDataSource,
  type ReportFilterConfig,
  type ReportOrderRow,
  type ReportPayload,
  type ReportPortalRole,
  type ReportSectorSummaryRow,
  type ReportTemplateType,
  type ReportUnitSummaryRow,
} from '../../utils/reports';
import { BrandText } from '../BrandText';
import { PaginationBar } from '../PaginationBar';
import {
  PORTAL_THEME_TOKENS,
  ReportFilterControls,
} from './ReportFilterControls';
import { WhatsAppShareActions } from './WhatsAppShareActions';

interface PortalReportsPageProps {
  source: ReportDataSource;
  isDesktop: boolean;
  onToast?: (type: 'success' | 'error', message: string) => void;
}

interface ReportPresetItem {
  id: string;
  label: string;
  subtitle: string;
  icon: typeof ClipboardList;
  patch: Partial<ReportFilterConfig>;
}

const PRESETS_BY_ROLE: Record<ReportPortalRole, ReportPresetItem[]> = {
  ADMIN: [
    {
      id: 'div-master',
      label: 'All Division — Detailed Print',
      subtitle: 'All sectors listed + full order register',
      icon: Building2,
      patch: { scope: 'ENTIRE_DIVISION', template: 'DETAILED_ORDERS', paymentStatus: 'ALL', paymentMode: 'ALL' },
    },
    {
      id: 'div-sectors',
      label: 'Sector-wise Ranking',
      subtitle: 'Sectors vs division limit',
      icon: Layers,
      patch: { scope: 'ENTIRE_DIVISION', template: 'SECTOR_SUMMARY', paymentStatus: 'ALL', paymentMode: 'ALL' },
    },
    {
      id: 'div-units',
      label: 'All Units Summary',
      subtitle: 'Ranked unit collections',
      icon: BarChart3,
      patch: { scope: 'ENTIRE_DIVISION', template: 'UNIT_SUMMARY', paymentStatus: 'ALL', paymentMode: 'ALL' },
    },
    {
      id: 'div-non-participating',
      label: 'Not Participated Units',
      subtitle: 'Units with 0 orders yet',
      icon: Clock,
      patch: {
        scope: 'ENTIRE_DIVISION',
        template: 'UNIT_SUMMARY',
        paymentStatus: 'ALL',
        paymentMode: 'ALL',
        includeZeroOrderUnits: true,
        onlyZeroOrderUnits: true,
        sortBy: 'NAME_ASC',
      },
    },
    {
      id: 'div-direct',
      label: 'Division Direct Orders',
      subtitle: 'Direct division entries only',
      icon: ShieldCheck,
      patch: { scope: 'DIVISION_DIRECT', template: 'DETAILED_ORDERS', paymentStatus: 'ALL', paymentMode: 'ALL' },
    },
    {
      id: 'div-unpaid',
      label: 'All Unpaid Dues',
      subtitle: 'Pending collections list',
      icon: Clock,
      patch: { scope: 'ENTIRE_DIVISION', template: 'UNPAID_DUES', paymentStatus: 'UNPAID', paymentMode: 'ALL' },
    },
  ],
  SECTOR: [
    {
      id: 'sec-full',
      label: 'Full Sector Report',
      subtitle: 'All orders across sector units',
      icon: Layers,
      patch: { scope: 'ENTIRE_SECTOR', template: 'DETAILED_ORDERS', paymentStatus: 'ALL', paymentMode: 'ALL' },
    },
    {
      id: 'sec-units',
      label: 'Sector Units Summary',
      subtitle: 'Units ranked with % share',
      icon: BarChart3,
      patch: { scope: 'ENTIRE_SECTOR', template: 'UNIT_SUMMARY', paymentStatus: 'ALL', paymentMode: 'ALL' },
    },
    {
      id: 'sec-non-participating',
      label: 'Not Participated Units',
      subtitle: 'Units with 0 orders yet',
      icon: Clock,
      patch: {
        scope: 'ENTIRE_SECTOR',
        template: 'UNIT_SUMMARY',
        paymentStatus: 'ALL',
        paymentMode: 'ALL',
        includeZeroOrderUnits: true,
        onlyZeroOrderUnits: true,
        sortBy: 'NAME_ASC',
      },
    },
    {
      id: 'sec-delivery',
      label: 'Sector Delivery Sheet',
      subtitle: 'Handover sheet with checkboxes',
      icon: PackageCheck,
      patch: { scope: 'ENTIRE_SECTOR', template: 'DELIVERY_SHEET', paymentStatus: 'ALL', paymentMode: 'ALL' },
    },
    {
      id: 'sec-unpaid',
      label: 'Sector Unpaid Dues',
      subtitle: 'Pending collections in sector',
      icon: Clock,
      patch: { scope: 'ENTIRE_SECTOR', template: 'UNPAID_DUES', paymentStatus: 'UNPAID', paymentMode: 'ALL' },
    },
  ],
  UNIT: [
    {
      id: 'unit-delivery',
      label: 'Unit Delivery Sheet',
      subtitle: 'Distribution sheet with ticks',
      icon: PackageCheck,
      patch: { scope: 'THIS_UNIT', template: 'DELIVERY_SHEET', paymentStatus: 'ALL', paymentMode: 'ALL' },
    },
    {
      id: 'unit-log',
      label: 'Complete Order Log',
      subtitle: 'All orders & reconciliation',
      icon: ClipboardList,
      patch: { scope: 'THIS_UNIT', template: 'DETAILED_ORDERS', paymentStatus: 'ALL', paymentMode: 'ALL' },
    },
    {
      id: 'unit-paid',
      label: 'Paid Orders Summary',
      subtitle: 'Verified Cash & UPI orders',
      icon: CheckCircle2,
      patch: { scope: 'THIS_UNIT', template: 'DETAILED_ORDERS', paymentStatus: 'PAID', paymentMode: 'ALL' },
    },
    {
      id: 'unit-unpaid',
      label: 'Unpaid Collection Sheet',
      subtitle: 'Pending customers only',
      icon: Clock,
      patch: { scope: 'THIS_UNIT', template: 'UNPAID_DUES', paymentStatus: 'UNPAID', paymentMode: 'ALL' },
    },
  ],
};

function renderPaymentPill(
  paymentStatus: 'PAID' | 'UNPAID',
  paymentMode: 'CASH' | 'UPI' | null
) {
  if (paymentStatus === 'UNPAID') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-vibrant-coralSoft text-vibrant-coral whitespace-nowrap">
        Unpaid
      </span>
    );
  }
  const isUpi = paymentMode === 'UPI';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
        isUpi
          ? 'bg-vibrant-tealSoft text-vibrant-teal'
          : 'bg-vibrant-amberSoft text-vibrant-amber'
      }`}
    >
      Paid • {paymentMode === 'CASH' ? 'Cash' : paymentMode === 'UPI' ? 'UPI' : 'Paid'}
    </span>
  );
}

export function PortalReportsPage({
  source,
  isDesktop,
  onToast,
}: PortalReportsPageProps) {
  const theme = PORTAL_THEME_TOKENS[source.role];
  const presets = PRESETS_BY_ROLE[source.role];

  const [config, setConfig] = useState<ReportFilterConfig>(() =>
    getDefaultReportConfig(source.role)
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(
    presets[0]?.id ?? null
  );
  const [shareMode, setShareMode] = useState<ReportShareMode>('status');
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);

  // Section 3 directory state (Admin / Sector)
  const [directoryTab, setDirectoryTab] = useState<'sectors' | 'units'>(
    'sectors'
  );
  const [directorySearch, setDirectorySearch] = useState('');
  const debouncedDirectorySearch = useDebouncedValue(directorySearch, 100);
  const [directorySectorFilter, setDirectorySectorFilter] =
    useState<string>('ALL');
  const [directoryTemplate, setDirectoryTemplate] =
    useState<ReportTemplateType>(
      source.role === 'SECTOR' ? 'DELIVERY_SHEET' : 'DETAILED_ORDERS'
    );
  const [dirUnitPage, setDirUnitPage] = useState<number>(1);
  const [dirUnitPageSize, setDirUnitPageSize] = useState<number>(10);

  useEffect(() => {
    setDirUnitPage(1);
  }, [debouncedDirectorySearch, directorySectorFilter, directoryTab]);

  const payload = useMemo(
    () => buildReportPayload(source, config),
    [source, config]
  );

  const canExport = !payload.isSelectionIncomplete && payload.matchedCount > 0;

  const triggerPdf = async (targetPayload: ReportPayload, key: string) => {
    if (generatingKey) return;
    setGeneratingKey(key);
    try {
      const filename = await exportReportPdf(targetPayload, shareMode);
      onToast?.('success', `Downloaded PDF (${filename || targetPayload.pdfFilename})`);
    } catch (err) {
      onToast?.(
        'error',
        err instanceof Error ? err.message : 'Failed to generate PDF report.'
      );
    } finally {
      setGeneratingKey(null);
    }
  };

  const triggerWhatsApp = async (
    targetConfig: ReportFilterConfig,
    key: string
  ) => {
    if (generatingKey) return;
    setGeneratingKey(key);
    try {
      const formatted = buildWhatsAppReportText({
        source,
        config: targetConfig,
        mode: shareMode,
      });
      const res = await deliverWhatsAppReport(formatted.text, formatted.title);
      if (res.method === 'clipboard_fallback') {
        onToast?.(
          'success',
          'Full report copied — paste directly into WhatsApp'
        );
      } else {
        onToast?.(
          'success',
          shareMode === 'status'
            ? 'Prepared WhatsApp Order Status summary'
            : 'Prepared WhatsApp Detailed Report'
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Share cancelled.') {
        return;
      }
      onToast?.(
        'error',
        err instanceof Error ? err.message : 'Failed to open WhatsApp share.'
      );
    } finally {
      setGeneratingKey(null);
    }
  };

  const triggerCsv = (targetPayload: ReportPayload) => {
    try {
      exportReportCsv(targetPayload);
      onToast?.('success', `Exported CSV (${targetPayload.csvFilename})`);
    } catch (err) {
      onToast?.(
        'error',
        err instanceof Error ? err.message : 'Failed to export CSV.'
      );
    }
  };

  const applyPreset = (preset: ReportPresetItem) => {
    setActivePresetId(preset.id);
    setConfig(getDefaultReportConfig(source.role, preset.patch));
  };

  const handlePresetQuickExport = async (
    preset: ReportPresetItem,
    format: 'pdf' | 'csv' | 'whatsapp'
  ) => {
    const presetConfig = getDefaultReportConfig(source.role, preset.patch);
    setActivePresetId(preset.id);
    setConfig(presetConfig);
    const presetPayload = buildReportPayload(source, presetConfig);
    if (presetPayload.matchedCount === 0) {
      onToast?.('error', 'No records match this preset.');
      return;
    }
    if (format === 'pdf') {
      await triggerPdf(presetPayload, `preset-${preset.id}`);
    } else if (format === 'whatsapp') {
      await triggerWhatsApp(presetConfig, `preset-wa-${preset.id}`);
    } else {
      triggerCsv(presetPayload);
    }
  };

  // Directory datasets (strictly portal-isolated, computed from live entries)
  const sectorDirectoryRows = useMemo(() => {
    if (source.role !== 'ADMIN') return [];
    const sectors = source.data.sectors ?? [];
    const units = source.data.unit_summaries ?? [];
    const entries = source.data.entries ?? [];

    const unitToSector = new Map<number, number>();
    const totalUnitsBySector = new Map<number, number>();
    for (const u of units) {
      if (typeof u.sector_id === 'number') {
        unitToSector.set(u.id, u.sector_id);
        totalUnitsBySector.set(
          u.sector_id,
          (totalUnitsBySector.get(u.sector_id) ?? 0) + 1
        );
      }
    }

    const agg = new Map<
      number,
      { orders: number; liters: number; unpaidCount: number; amount: number }
    >();
    for (const e of entries) {
      if (isDivisionDirectEntry(e)) continue;
      const sId =
        typeof e.sector_id === 'number'
          ? e.sector_id
          : e.unit_id != null
          ? unitToSector.get(e.unit_id)
          : undefined;
      if (sId == null) continue;
      const curr = agg.get(sId) ?? {
        orders: 0,
        liters: 0,
        unpaidCount: 0,
        amount: 0,
      };
      curr.orders += 1;
      curr.liters += Number(e.quantity) || 0;
      curr.amount += Number(e.total_amount) || 0;
      if (e.payment_status === 'UNPAID') curr.unpaidCount += 1;
      agg.set(sId, curr);
    }

    const q = debouncedDirectorySearch.trim().toLowerCase();
    return sectors
      .map((s) => {
        const stats = agg.get(s.id) ?? {
          orders: 0,
          liters: 0,
          unpaidCount: 0,
          amount: 0,
        };
        return {
          id: s.id,
          name: s.name,
          code: s.login_code,
          totalUnits: totalUnitsBySector.get(s.id) ?? 0,
          orders: stats.orders,
          liters: Math.round(stats.liters * 100) / 100,
          unpaidCount: stats.unpaidCount,
          amount: Math.round(stats.amount * 100) / 100,
        };
      })
      .filter((s) =>
        !q ? true : `${s.name} ${s.code}`.toLowerCase().includes(q)
      )
      .sort((a, b) =>
        b.liters !== a.liters ? b.liters - a.liters : a.name.localeCompare(b.name)
      );
  }, [source, debouncedDirectorySearch]);

  const unitDirectoryRows = useMemo(() => {
    if (source.role === 'UNIT') return [];
    const units =
      source.role === 'ADMIN'
        ? source.data.unit_summaries ?? []
        : (source.data.units ?? []).filter(
            (u) => u.sector_id == null || u.sector_id === source.data.sector.id
          );

    const q = debouncedDirectorySearch.trim().toLowerCase();
    return units
      .filter((u) => {
        if (
          source.role === 'ADMIN' &&
          directorySectorFilter !== 'ALL' &&
          String(u.sector_id) !== directorySectorFilter
        ) {
          return false;
        }
        if (!q) return true;
        return `${u.name} ${u.login_code} ${u.sector_name ?? ''}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const qDiff = (Number(b.total_quantity) || 0) - (Number(a.total_quantity) || 0);
        if (qDiff !== 0) return qDiff;
        return a.name.localeCompare(b.name);
      });
  }, [source, debouncedDirectorySearch, directorySectorFilter]);

  const unitDailyBreakdown = useMemo(() => {
    if (source.role !== 'UNIT') return [];
    return buildUnitDailyBreakdown(
      source.data.entries ?? [],
      source.data.unit.id
    );
  }, [source]);

  const handleQuickEntityExport = async (
    entityType: 'SECTOR' | 'UNIT',
    entityId: number,
    format: 'pdf' | 'csv' | 'whatsapp'
  ) => {
    const effectiveTemplate: ReportTemplateType =
      entityType === 'UNIT' && directoryTemplate === 'UNIT_SUMMARY'
        ? 'DELIVERY_SHEET'
        : directoryTemplate;

    const entityConfig = getDefaultReportConfig(source.role, {
      scope: entityType === 'SECTOR' ? 'SECTOR_SPECIFIC' : 'UNIT_SPECIFIC',
      sectorId: entityType === 'SECTOR' ? entityId : null,
      unitId: entityType === 'UNIT' ? entityId : null,
      template: effectiveTemplate,
    });
    const entityPayload = buildReportPayload(source, entityConfig);
    if (entityPayload.matchedCount === 0) {
      onToast?.('error', 'No matching orders found for this selection.');
      return;
    }
    if (format === 'pdf') {
      await triggerPdf(entityPayload, `dir-${entityType}-${entityId}`);
    } else if (format === 'whatsapp') {
      await triggerWhatsApp(entityConfig, `dir-wa-${entityType}-${entityId}`);
    } else {
      triggerCsv(entityPayload);
    }
  };

  const handleUnitDailyExport = async (
    dateKey: string,
    format: 'pdf' | 'csv' | 'whatsapp'
  ) => {
    const dayConfig = getDefaultReportConfig('UNIT', {
      scope: 'THIS_UNIT',
      template: 'DELIVERY_SHEET',
      datePreset: 'CUSTOM',
      dateFrom: dateKey,
      dateTo: dateKey,
    });
    const dayPayload = buildReportPayload(source, dayConfig);
    if (dayPayload.matchedCount === 0) {
      onToast?.('error', 'No orders found for this date.');
      return;
    }
    if (format === 'pdf') {
      await triggerPdf(dayPayload, `day-${dateKey}`);
    } else if (format === 'whatsapp') {
      await triggerWhatsApp(dayConfig, `day-wa-${dateKey}`);
    } else {
      triggerCsv(dayPayload);
    }
  };

  const portalTitle =
    source.role === 'ADMIN'
      ? 'SSF Wandoor Division Reports'
      : source.role === 'SECTOR'
      ? `${source.data.sector.name} Reports`
      : `${source.data.unit.name} Reports`;

  const portalSubtitle =
    source.role === 'ADMIN'
      ? 'Generate formal A4 PDFs and Excel-ready CSV exports across sectors, units, and division direct entries.'
      : source.role === 'SECTOR'
      ? `Export ${source.data.sector.name} (${source.data.sector.login_code}) unit summaries, delivery sheets, and unpaid dues.`
      : `Export delivery sheets, payment reconciliation, and unpaid collection lists for ${source.data.unit.name} (${source.data.unit.login_code}).`;

  const previewOrders: ReportOrderRow[] = payload.orderRows.slice(0, 25);
  const previewUnits: ReportUnitSummaryRow[] = payload.unitRows.slice(0, 25);
  const previewSectors: ReportSectorSummaryRow[] = payload.sectorRows.slice(
    0,
    25
  );

  const dirUnitTotalCount = unitDirectoryRows.length;
  const dirUnitTotalPages = Math.max(
    1,
    Math.ceil(dirUnitTotalCount / dirUnitPageSize)
  );
  const safeDirUnitPage = Math.min(Math.max(1, dirUnitPage), dirUnitTotalPages);
  const visibleUnitsDirectory = unitDirectoryRows.slice(
    (safeDirUnitPage - 1) * dirUnitPageSize,
    safeDirUnitPage * dirUnitPageSize
  );

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div
        className={`${theme.cardSurface} rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`w-10 h-10 rounded-xl ${theme.primaryBtn} flex items-center justify-center shrink-0 shadow-xs`}
          >
            <FileBarChart2 className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className={`text-base sm:text-lg font-extrabold leading-tight ${theme.heading}`}>
              <BrandText text={portalTitle} />
            </h1>
            <p className={`text-xs mt-0.5 ${theme.muted}`}>
              <BrandText text={portalSubtitle} />
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`${theme.pillSurface} px-3 py-1 rounded-full text-xs font-semibold num ${theme.heading}`}
          >
            Rate ₹{formatQuantity(payload.unitRate)}/L
          </span>
        </div>
      </div>

      {/* SECTION 1: Quick Report Presets Strip */}
      <section aria-label="Quick Report Presets" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-xs font-bold uppercase tracking-wider ${theme.muted}`}>
            1-Click Report Presets
          </h2>
          <span className={`text-[11px] ${theme.muted}`}>
            Select to preview or export immediately
          </span>
        </div>

        <div
          className={`grid gap-2.5 ${
            presets.length === 5
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {presets.map((preset) => {
            const Icon = preset.icon;
            const isActive = activePresetId === preset.id;
            const isSpinning = generatingKey === `preset-${preset.id}`;
            return (
              <div
                key={preset.id}
                role="button"
                tabIndex={0}
                onClick={() => applyPreset(preset)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    applyPreset(preset);
                  }
                }}
                className={`${theme.cardSurface} rounded-2xl p-3.5 cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                  isActive
                    ? theme.activeOptionCard
                    : 'hover:bg-white/95'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive
                        ? theme.primaryBtn
                        : `${theme.pillSurface} ${theme.heading}`
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className={`text-xs font-bold leading-snug ${theme.heading}`}>
                      {preset.label}
                    </div>
                    <div className={`text-[10px] leading-snug mt-0.5 ${theme.muted}`}>
                      {preset.subtitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1 border-t border-black/5">
                  <button
                    type="button"
                    disabled={generatingKey !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handlePresetQuickExport(preset, 'pdf');
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-opacity ${theme.primaryBtn} hover:opacity-95 disabled:opacity-50`}
                  >
                    {isSpinning ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <FileText className="w-3 h-3" />
                    )}
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handlePresetQuickExport(preset, 'csv');
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors ${theme.pillSurface} ${theme.heading} hover:bg-white`}
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    disabled={generatingKey !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handlePresetQuickExport(preset, 'whatsapp');
                    }}
                    title="Share on WhatsApp"
                    aria-label={`Share ${preset.label} on WhatsApp`}
                    className="py-1.5 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 glass-forest text-white hover:opacity-95 disabled:opacity-50 transition-opacity"
                  >
                    <MessageCircle className="w-3 h-3" />
                    <span>WA</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: Interactive Report Builder + Live Preview Table */}
      <section
        aria-label="Interactive Report Builder"
        className={`${theme.cardSurface} rounded-2xl p-4 sm:p-5 space-y-5`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-black/5">
          <div>
            <h2 className={`text-sm sm:text-base font-bold ${theme.heading}`}>
              Interactive Report Builder
            </h2>
            <p className={`text-xs mt-0.5 ${theme.muted}`}>
              Configure scope, report template, and filters — preview updates live below.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setActivePresetId(presets[0]?.id ?? null);
              setConfig(getDefaultReportConfig(source.role));
            }}
            className={`${theme.pillSurface} px-3 py-1.5 rounded-xl text-xs font-semibold ${theme.heading} hover:bg-white transition-colors self-start sm:self-auto`}
          >
            Reset Filters
          </button>
        </div>

        <ReportFilterControls
          source={source}
          config={config}
          onChange={(next) => {
            setActivePresetId(null);
            setConfig(next);
          }}
        />

        {/* Live 6-Metric KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className={`${theme.innerCard} rounded-xl p-3`}>
            <span className={`text-[10px] font-bold uppercase block ${theme.muted}`}>
              Filtered Orders
            </span>
            <span className={`text-lg font-extrabold num block mt-0.5 ${theme.heading}`}>
              {payload.summary.totalOrders}
            </span>
          </div>
          <div className={`${theme.innerCard} rounded-xl p-3`}>
            <span className={`text-[10px] font-bold uppercase block ${theme.muted}`}>
              Total Liters
            </span>
            <span className={`text-lg font-extrabold num block mt-0.5 ${theme.heading}`}>
              {formatQuantity(payload.summary.totalLiters)} L
            </span>
          </div>
          <div className={`${theme.innerCard} rounded-xl p-3 border-l-2 border-l-vibrant-amber`}>
            <span className={`text-[10px] font-bold uppercase block ${theme.muted}`}>
              Cash Handover
            </span>
            <span className={`text-lg font-extrabold num block mt-0.5 ${theme.heading}`}>
              {formatCurrency(payload.summary.cashAmount)}
            </span>
          </div>
          <div className={`${theme.innerCard} rounded-xl p-3 border-l-2 border-l-vibrant-teal`}>
            <span className={`text-[10px] font-bold uppercase block ${theme.muted}`}>
              UPI
            </span>
            <span className={`text-lg font-extrabold num block mt-0.5 ${theme.heading}`}>
              {formatCurrency(payload.summary.upiAmount)}
            </span>
          </div>
          <div className={`${theme.innerCard} rounded-xl p-3 border-l-2 border-l-vibrant-coral`}>
            <span className={`text-[10px] font-bold uppercase block ${theme.muted}`}>
              Unpaid ({payload.summary.unpaidCount})
            </span>
            <span className="text-lg font-extrabold num block mt-0.5 text-vibrant-coral">
              {formatCurrency(payload.summary.unpaidAmount)}
            </span>
          </div>
          <div className={`${theme.innerCard} rounded-xl p-3`}>
            <span className={`text-[10px] font-bold uppercase block ${theme.muted}`}>
              Grand Total
            </span>
            <span className={`text-lg font-extrabold num block mt-0.5 ${theme.heading}`}>
              {formatCurrency(payload.summary.totalAmount)}
            </span>
          </div>
        </div>

        {/* Action Header above Live Preview */}
        <div
          className={`${theme.innerCard} rounded-xl p-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3`}
        >
          <div className="min-w-0 space-y-1">
            <div className={`text-sm font-bold ${theme.heading}`}>
              <BrandText text={payload.title} /> —{' '}
              <span className="font-semibold">
                <BrandText text={payload.scopeSubtitle} />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {payload.activeFilterTags.map((tag) => (
                <span
                  key={tag}
                  className={`${theme.pillSurface} px-2 py-0.5 rounded-full text-[10px] font-semibold ${theme.muted}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
            <WhatsAppShareActions
              source={source}
              config={config}
              mode={shareMode}
              onModeChange={setShareMode}
              disabled={!canExport || generatingKey !== null}
              onSuccess={(msg) => onToast?.('success', msg)}
              onError={(msg) => onToast?.('error', msg)}
            />

            <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!canExport || generatingKey !== null}
                onClick={() => triggerCsv(payload)}
                className={`${theme.pillSurface} hover:bg-white ${theme.heading} text-xs font-semibold px-4 py-2 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-colors`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Download CSV</span>
              </button>

              <button
                type="button"
                disabled={!canExport || generatingKey !== null}
                onClick={() => void triggerPdf(payload, 'builder-pdf')}
                className={`${theme.primaryBtn} hover:opacity-95 text-xs font-semibold px-4 py-2 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-opacity shadow-sm`}
              >
                {generatingKey === 'builder-pdf' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                <span>
                  {generatingKey === 'builder-pdf'
                    ? 'Preparing PDF...'
                    : 'Download PDF'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Division Direct reconciliation banner on Admin summaries */}
        {source.role === 'ADMIN' &&
          config.scope === 'ENTIRE_DIVISION' &&
          (config.template === 'SECTOR_SUMMARY' ||
            config.template === 'UNIT_SUMMARY') &&
          payload.divisionDirectBreakdown.totalOrders > 0 && (
            <div className="rounded-xl border border-plum-200 bg-plum-50/85 px-3.5 py-2.5 text-xs text-plum-900 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                Division Direct Reconciliation (Excluded from individual Sector/Unit rows):
              </span>
              <span className="num font-bold">
                {payload.divisionDirectBreakdown.totalOrders} orders •{' '}
                {formatQuantity(payload.divisionDirectBreakdown.totalLiters)} L •{' '}
                {formatCurrency(payload.divisionDirectBreakdown.totalAmount)}
              </span>
            </div>
          )}

        {/* Live On-Screen Preview */}
        {payload.isSelectionIncomplete ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-6 text-center text-xs font-semibold text-amber-900 flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{payload.selectionPrompt}</span>
          </div>
        ) : payload.matchedCount === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-6 text-center text-xs font-semibold text-amber-900 flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>No records match the current filters</span>
          </div>
        ) : isDesktop ? (
          <div className={`${theme.tableSurface} rounded-xl overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className={`${theme.tableHead} text-[11px] uppercase tracking-wide`}>
                    {payload.columns.map((col) => (
                      <th
                        key={col.key}
                        className={`py-3 px-3.5 font-semibold whitespace-nowrap ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {config.template === 'SECTOR_SUMMARY' &&
                    previewSectors.map((row) => (
                      <tr key={row.sectorId} className="hover:bg-black/[0.02]">
                        <td className="py-2.5 px-3.5 text-center font-bold num">
                          {row.rank}
                        </td>
                        <td className={`py-2.5 px-3.5 font-semibold ${theme.heading}`}>
                          <BrandText text={row.sectorName} />
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-xs num">
                          {row.sectorCode || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 text-center num">
                          {row.activeUnits}/{row.totalUnits}
                        </td>
                        <td className="py-2.5 px-3.5 text-right num">
                          {row.orders}
                        </td>
                        <td className={`py-2.5 px-3.5 text-right font-semibold num ${theme.heading}`}>
                          {formatQuantity(row.liters)} L
                        </td>
                        <td className="py-2.5 px-3.5 text-right num">
                          {row.limitSharePercent.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3.5 text-right num">
                          {formatCurrency(row.cashAmount)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right num">
                          {formatCurrency(row.upiAmount)}
                        </td>
                        <td
                          className={`py-2.5 px-3.5 text-right num ${
                            row.unpaidAmount > 0
                              ? 'text-vibrant-coral font-semibold'
                              : ''
                          }`}
                        >
                          {formatCurrency(row.unpaidAmount)}
                        </td>
                        <td className={`py-2.5 px-3.5 text-right font-bold num ${theme.heading}`}>
                          {formatCurrency(row.totalAmount)}
                        </td>
                      </tr>
                    ))}

                  {config.template === 'UNIT_SUMMARY' &&
                    previewUnits.map((row) => (
                      <tr key={row.unitId} className="hover:bg-black/[0.02]">
                        <td className="py-2.5 px-3.5 text-center font-bold num">
                          {row.rank}
                        </td>
                        <td className={`py-2.5 px-3.5 font-semibold ${theme.heading}`}>
                          <BrandText text={row.unitName} />
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-xs num">
                          {row.unitCode || '-'}
                        </td>
                        {payload.showSectorColumn && (
                          <td className={`py-2.5 px-3.5 text-xs ${theme.muted}`}>
                            <BrandText text={row.sectorName || '-'} />
                          </td>
                        )}
                        <td className="py-2.5 px-3.5 text-right num">
                          {row.orders}
                        </td>
                        <td className={`py-2.5 px-3.5 text-right font-semibold num ${theme.heading}`}>
                          {formatQuantity(row.liters)} L
                        </td>
                        <td className="py-2.5 px-3.5 text-right num">
                          {row.sharePercent.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3.5 text-right num">
                          {formatCurrency(row.cashAmount)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right num">
                          {formatCurrency(row.upiAmount)}
                        </td>
                        <td
                          className={`py-2.5 px-3.5 text-right num ${
                            row.unpaidAmount > 0
                              ? 'text-vibrant-coral font-semibold'
                              : ''
                          }`}
                        >
                          {formatCurrency(row.unpaidAmount)}
                        </td>
                        <td className={`py-2.5 px-3.5 text-right font-bold num ${theme.heading}`}>
                          {formatCurrency(row.totalAmount)}
                        </td>
                      </tr>
                    ))}

                  {config.template !== 'SECTOR_SUMMARY' &&
                    config.template !== 'UNIT_SUMMARY' &&
                    previewOrders.map((row) => (
                      <tr key={row.id} className="hover:bg-black/[0.02]">
                        <td className="py-2.5 px-3.5 text-center num text-xs">
                          {row.serial}
                        </td>
                        <td className={`py-2.5 px-3.5 font-semibold ${theme.heading}`}>
                          {row.contributorName}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-xs num whitespace-nowrap">
                          {row.mobileNumber}
                        </td>
                        {payload.showSectorColumn &&
                          config.template !== 'DELIVERY_SHEET' && (
                            <td className={`py-2.5 px-3.5 text-xs ${theme.muted}`}>
                              <BrandText text={row.sectorName} />
                            </td>
                          )}
                        {payload.showUnitColumn && (
                          <td className="py-2.5 px-3.5 text-xs whitespace-nowrap">
                            {row.isDivisionDirect ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-plum-100 text-plum-900">
                                Division Direct
                              </span>
                            ) : (
                              <BrandText text={row.unitName} />
                            )}
                          </td>
                        )}
                        <td className={`py-2.5 px-3.5 text-right font-semibold num whitespace-nowrap ${theme.heading}`}>
                          {formatQuantity(row.quantity)} L
                        </td>
                        <td className={`py-2.5 px-3.5 text-right font-semibold num whitespace-nowrap ${theme.heading}`}>
                          {formatCurrency(row.totalAmount)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {renderPaymentPill(row.paymentStatus, row.paymentMode)}
                        </td>
                        {config.template === 'DELIVERY_SHEET' ? (
                          <td className="py-2.5 px-3.5 text-center">
                            <span
                              aria-hidden="true"
                              className="inline-block w-4 h-4 rounded border border-ink-400 bg-white align-middle"
                            />
                          </td>
                        ) : (
                          <td className={`py-2.5 px-3.5 text-xs num whitespace-nowrap ${theme.muted}`}>
                            {row.dateLabel}
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className={`${theme.tableHead} px-4 py-2.5 text-xs font-semibold flex flex-wrap items-center justify-between gap-2`}>
              <span className="num">
                {payload.matchedCount > 25
                  ? `Showing 25 of ${payload.matchedCount} records — export PDF/CSV for complete report`
                  : `Showing all ${payload.matchedCount} matching ${payload.recordNoun}`}
              </span>
              <span className={`num font-bold ${theme.heading}`}>
                Table Total: {formatQuantity(payload.tableTotals.totalLiters)} L •{' '}
                {formatCurrency(payload.tableTotals.totalAmount)}
              </span>
            </div>
          </div>
        ) : (
          /* Mobile Stacked Preview Cards */
          <div className="space-y-2.5">
            {config.template === 'SECTOR_SUMMARY' &&
              previewSectors.map((row) => (
                <div
                  key={row.sectorId}
                  className={`${theme.innerCard} rounded-xl p-3 space-y-1.5`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-xs flex items-center gap-1.5 min-w-0">
                      <span className={`${theme.badgeSoft} px-1.5 py-0.5 rounded num text-[10px]`}>
                        #{row.rank}
                      </span>
                      <span className={`truncate ${theme.heading}`}>
                        <BrandText text={row.sectorName} />
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-semibold num shrink-0">
                      {row.sectorCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs num pt-1 border-t border-black/5">
                    <span className={theme.muted}>
                      {row.activeUnits}/{row.totalUnits} units • {row.orders} ord
                    </span>
                    <span className={`font-bold ${theme.heading}`}>
                      {formatQuantity(row.liters)} L •{' '}
                      {formatCurrency(row.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}

            {config.template === 'UNIT_SUMMARY' &&
              previewUnits.map((row) => (
                <div
                  key={row.unitId}
                  className={`${theme.innerCard} rounded-xl p-3 space-y-1.5`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-xs flex items-center gap-1.5 min-w-0">
                      <span className={`${theme.badgeSoft} px-1.5 py-0.5 rounded num text-[10px]`}>
                        #{row.rank}
                      </span>
                      <span className={`truncate ${theme.heading}`}>
                        <BrandText text={row.unitName} />
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-semibold num shrink-0">
                      {row.unitCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs num pt-1 border-t border-black/5">
                    <span className={theme.muted}>
                      {row.orders} ord • {row.sharePercent.toFixed(1)}%
                    </span>
                    <span className={`font-bold ${theme.heading}`}>
                      {formatQuantity(row.liters)} L •{' '}
                      {formatCurrency(row.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}

            {config.template !== 'SECTOR_SUMMARY' &&
              config.template !== 'UNIT_SUMMARY' &&
              previewOrders.map((row) => (
                <div
                  key={row.id}
                  className={`${theme.innerCard} rounded-xl p-3 space-y-1.5`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`text-xs font-bold truncate ${theme.heading}`}>
                        <span className="num opacity-60 mr-1">#{row.serial}</span>
                        {row.contributorName}
                      </div>
                      <div className={`text-[11px] num ${theme.muted}`}>
                        {row.mobileNumber}
                        {payload.showUnitColumn
                          ? ` • ${row.isDivisionDirect ? 'Division Direct' : row.unitName}`
                          : ''}
                      </div>
                    </div>
                    {renderPaymentPill(row.paymentStatus, row.paymentMode)}
                  </div>
                  <div className="flex items-center justify-between text-xs num pt-1 border-t border-black/5">
                    <span className={theme.muted}>{row.dateLabel}</span>
                    <span className={`font-bold ${theme.heading}`}>
                      {formatQuantity(row.quantity)} L •{' '}
                      {formatCurrency(row.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}

            <div className={`${theme.pillSurface} rounded-xl px-3.5 py-2.5 text-center text-xs font-semibold num ${theme.heading}`}>
              {payload.matchedCount > 25
                ? `Showing 25 of ${payload.matchedCount} records — export PDF/CSV for complete report`
                : `Showing all ${payload.matchedCount} matching ${payload.recordNoun}`}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: Quick Individual Directory Export (Division & Sector) OR Daily Breakdown (Unit) */}
      {source.role !== 'UNIT' ? (
        <section
          aria-label="Quick Individual Directory Export"
          className={`${theme.cardSurface} rounded-2xl p-4 sm:p-5 space-y-4`}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className={`text-sm sm:text-base font-bold ${theme.heading}`}>
                Quick Individual{' '}
                {source.role === 'ADMIN' ? 'Sector / Unit' : 'Unit'} Export
              </h2>
              <p className={`text-xs mt-0.5 ${theme.muted}`}>
                {source.role === 'ADMIN'
                  ? 'Export individual sector or unit PDF & CSV sheets in one click without reconfiguring dropdowns.'
                  : `Fast 1-click PDF & CSV exports for each unit inside ${source.data.sector.name}.`}
              </p>
            </div>

            {source.role === 'ADMIN' && (
              <div className={`${theme.pillSurface} p-1 rounded-xl inline-flex gap-1 self-start md:self-auto`}>
                <button
                  type="button"
                  onClick={() => setDirectoryTab('sectors')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors num ${
                    directoryTab === 'sectors'
                      ? theme.primaryBtn
                      : `${theme.muted} hover:text-black`
                  }`}
                >
                  Sectors ({source.data.sectors.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDirectoryTab('units')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors num ${
                    directoryTab === 'units'
                      ? theme.primaryBtn
                      : `${theme.muted} hover:text-black`
                  }`}
                >
                  Units ({source.data.unit_summaries.length})
                </button>
              </div>
            )}
          </div>

          {/* Search, Sector Filter & Quick Template Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${theme.muted}`}
              />
              <input
                type="text"
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                placeholder={
                  source.role === 'ADMIN' && directoryTab === 'sectors'
                    ? 'Search sector name or code...'
                    : 'Search unit name or code...'
                }
                className={`w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border ${theme.border} bg-white/90 ${theme.heading} ${theme.inputFocus}`}
              />
              {directorySearch && (
                <button
                  type="button"
                  onClick={() => setDirectorySearch('')}
                  aria-label="Clear directory search"
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 ${theme.muted}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {source.role === 'ADMIN' && directoryTab === 'units' && (
              <select
                aria-label="Filter directory units by sector"
                value={directorySectorFilter}
                onChange={(e) => setDirectorySectorFilter(e.target.value)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border ${theme.border} bg-white ${theme.heading} ${theme.inputFocus}`}
              >
                <option value="ALL">All Sectors</option>
                {source.data.sectors.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name} ({s.login_code})
                  </option>
                ))}
              </select>
            )}

            <div className={`${theme.pillSurface} p-1 rounded-xl flex items-center gap-1 overflow-x-auto`}>
              {(
                [
                  { id: 'DELIVERY_SHEET', label: 'Delivery Sheet' },
                  { id: 'DETAILED_ORDERS', label: 'Detailed Orders' },
                  { id: 'UNPAID_DUES', label: 'Unpaid Dues' },
                  ...(source.role === 'ADMIN' && directoryTab === 'sectors'
                    ? [{ id: 'UNIT_SUMMARY' as const, label: 'Units Summary' }]
                    : []),
                ] as { id: ReportTemplateType; label: string }[]
              ).map((opt) => {
                const active = directoryTemplate === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDirectoryTemplate(opt.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                      active
                        ? theme.primaryBtn
                        : `${theme.muted} hover:text-black`
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Directory Rows */}
          {source.role === 'ADMIN' && directoryTab === 'sectors' ? (
            sectorDirectoryRows.length === 0 ? (
              <div className={`${theme.innerCard} rounded-xl p-6 text-center text-xs ${theme.muted}`}>
                No matching sectors found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {sectorDirectoryRows.map((sec) => {
                  const busy = generatingKey === `dir-SECTOR-${sec.id}`;
                  return (
                    <div
                      key={sec.id}
                      className={`${theme.innerCard} rounded-xl p-3.5 flex items-center justify-between gap-3`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs sm:text-sm font-bold truncate ${theme.heading}`}>
                            <BrandText text={sec.name} />
                          </span>
                          <span className={`${theme.badgeSoft} font-mono text-[10px] font-bold px-1.5 py-0.5 rounded num`}>
                            {sec.code}
                          </span>
                        </div>
                        <div className={`text-[11px] num mt-1 flex items-center gap-2 flex-wrap ${theme.muted}`}>
                          <span>{formatQuantity(sec.liters)} L</span>
                          <span>•</span>
                          <span>{sec.orders} orders</span>
                          <span>•</span>
                          <span>{sec.totalUnits} units</span>
                          {sec.unpaidCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-vibrant-coralSoft text-vibrant-coral">
                              {sec.unpaidCount} unpaid
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={sec.orders === 0 || generatingKey !== null}
                          onClick={() =>
                            void handleQuickEntityExport('SECTOR', sec.id, 'pdf')
                          }
                          className={`${theme.primaryBtn} px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-40`}
                        >
                          {busy ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <FileText className="w-3 h-3" />
                          )}
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          disabled={sec.orders === 0}
                          onClick={() =>
                            void handleQuickEntityExport('SECTOR', sec.id, 'csv')
                          }
                          className={`${theme.pillSurface} ${theme.heading} px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 hover:bg-white disabled:opacity-40`}
                        >
                          <FileSpreadsheet className="w-3 h-3" />
                          <span>CSV</span>
                        </button>
                        <button
                          type="button"
                          disabled={sec.orders === 0 || generatingKey !== null}
                          onClick={() =>
                            void handleQuickEntityExport(
                              'SECTOR',
                              sec.id,
                              'whatsapp'
                            )
                          }
                          title={`Share ${sec.name} on WhatsApp`}
                          aria-label={`Share ${sec.name} on WhatsApp`}
                          className="glass-forest text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 hover:opacity-95 disabled:opacity-40"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>WA</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : visibleUnitsDirectory.length === 0 ? (
            <div className={`${theme.innerCard} rounded-xl p-6 text-center text-xs ${theme.muted}`}>
              No matching units found.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {visibleUnitsDirectory.map((u) => {
                  const ordersCount = Number(u.total_entries) || 0;
                  const litersCount = Number(u.total_quantity) || 0;
                  const unpaidCount = Number(u.unpaid_entries) || 0;
                  const busy = generatingKey === `dir-UNIT-${u.id}`;
                  return (
                    <div
                      key={u.id}
                      className={`${theme.innerCard} rounded-xl p-3.5 flex items-center justify-between gap-3`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs sm:text-sm font-bold truncate ${theme.heading}`}>
                            <BrandText text={u.name} />
                          </span>
                          <span className={`${theme.badgeSoft} font-mono text-[10px] font-bold px-1.5 py-0.5 rounded num`}>
                            {u.login_code}
                          </span>
                        </div>
                        <div className={`text-[11px] num mt-1 flex items-center gap-1.5 flex-wrap ${theme.muted}`}>
                          {source.role === 'ADMIN' && u.sector_name && (
                            <>
                              <span className="truncate max-w-[140px]">
                                <BrandText text={u.sector_name} />
                              </span>
                              <span>•</span>
                            </>
                          )}
                          <span>{formatQuantity(litersCount)} L</span>
                          <span>•</span>
                          <span>{ordersCount} orders</span>
                          {unpaidCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-vibrant-coralSoft text-vibrant-coral">
                              {unpaidCount} unpaid
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={ordersCount === 0 || generatingKey !== null}
                          onClick={() =>
                            void handleQuickEntityExport('UNIT', u.id, 'pdf')
                          }
                          className={`${theme.primaryBtn} px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-40`}
                        >
                          {busy ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <FileText className="w-3 h-3" />
                          )}
                          <span>
                            {source.role === 'SECTOR' ? 'Delivery PDF' : 'PDF'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={ordersCount === 0}
                          onClick={() =>
                            void handleQuickEntityExport('UNIT', u.id, 'csv')
                          }
                          className={`${theme.pillSurface} ${theme.heading} px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 hover:bg-white disabled:opacity-40`}
                        >
                          <FileSpreadsheet className="w-3 h-3" />
                          <span>CSV</span>
                        </button>
                        <button
                          type="button"
                          disabled={ordersCount === 0 || generatingKey !== null}
                          onClick={() =>
                            void handleQuickEntityExport(
                              'UNIT',
                              u.id,
                              'whatsapp'
                            )
                          }
                          title={`Share ${u.name} on WhatsApp`}
                          aria-label={`Share ${u.name} on WhatsApp`}
                          className="glass-forest text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 hover:opacity-95 disabled:opacity-40"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>WA</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <PaginationBar
                page={safeDirUnitPage}
                totalPages={dirUnitTotalPages}
                totalCount={dirUnitTotalCount}
                pageSize={dirUnitPageSize}
                onPageChange={setDirUnitPage}
                onPageSizeChange={(nextSize) => {
                  setDirUnitPageSize(nextSize);
                  setDirUnitPage(1);
                }}
                pageSizeOptions={[10, 15, 25, 50]}
                theme={source.role === 'ADMIN' ? 'admin' : 'sector'}
                isDesktop={isDesktop}
              />
            </div>
          )}
        </section>
      ) : (
        /* UNIT PORTAL ONLY: Compact Date-wise Daily Breakdown Summary Card */
        <section
          aria-label="Date-wise Daily Breakdown"
          className={`${theme.cardSurface} rounded-2xl p-4 sm:p-5 space-y-3.5`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-8 h-8 rounded-lg ${theme.primaryBtn} flex items-center justify-center shrink-0`}
              >
                <Calendar className="w-4 h-4" />
              </span>
              <div>
                <h2 className={`text-sm sm:text-base font-bold ${theme.heading}`}>
                  Date-wise Daily Breakdown
                </h2>
                <p className={`text-xs ${theme.muted}`}>
                  Quick daily delivery sheet exports for{' '}
                  <BrandText text={source.data.unit.name} />
                </p>
              </div>
            </div>
            <span className={`${theme.badgeSoft} px-2.5 py-0.5 rounded-full text-[11px] font-bold num`}>
              {unitDailyBreakdown.length} active days
            </span>
          </div>

          {unitDailyBreakdown.length === 0 ? (
            <div className={`${theme.innerCard} rounded-xl p-6 text-center text-xs ${theme.muted}`}>
              No unit orders recorded yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {unitDailyBreakdown.map((day) => {
                const busy = generatingKey === `day-${day.dateKey}`;
                return (
                  <div
                    key={day.dateKey}
                    className={`${theme.innerCard} rounded-xl p-3.5 flex items-center justify-between gap-3`}
                  >
                    <div className="min-w-0">
                      <div className={`text-xs sm:text-sm font-bold num ${theme.heading}`}>
                        {day.dateLabel}
                      </div>
                      <div className={`text-[11px] num mt-1 flex items-center gap-1.5 flex-wrap ${theme.muted}`}>
                        <span>{day.totalOrders} orders</span>
                        <span>•</span>
                        <span>{formatQuantity(day.totalLiters)} L</span>
                        <span>•</span>
                        <span className={`font-bold ${theme.heading}`}>
                          {formatCurrency(day.totalAmount)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={generatingKey !== null}
                        onClick={() =>
                          void handleUnitDailyExport(day.dateKey, 'pdf')
                        }
                        className={`${theme.primaryBtn} px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-45`}
                      >
                        {busy ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        <span>PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleUnitDailyExport(day.dateKey, 'csv')
                        }
                        className={`${theme.pillSurface} ${theme.heading} px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 hover:bg-white`}
                      >
                        <FileSpreadsheet className="w-3 h-3" />
                        <span>CSV</span>
                      </button>
                      <button
                        type="button"
                        disabled={generatingKey !== null}
                        onClick={() =>
                          void handleUnitDailyExport(day.dateKey, 'whatsapp')
                        }
                        title={`Share ${day.dateLabel} on WhatsApp`}
                        aria-label={`Share ${day.dateLabel} on WhatsApp`}
                        className="glass-forest text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 hover:opacity-95 disabled:opacity-45"
                      >
                        <MessageCircle className="w-3 h-3" />
                        <span>WA</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
