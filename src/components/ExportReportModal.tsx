import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportReportCsv } from '../utils/csv';
import { exportReportPdf } from '../utils/exportPdf';
import { formatCurrency } from '../utils/format';
import {
  buildReportPayload,
  formatReportSummaryLine,
  getDefaultReportConfig,
  type ReportDataSource,
  type ReportFilterConfig,
} from '../utils/reports';
import { BrandText } from './BrandText';
import {
  PORTAL_THEME_TOKENS,
  ReportFilterControls,
} from './reports/ReportFilterControls';

interface ExportReportModalProps {
  source: ReportDataSource;
  isDesktop: boolean;
  initialConfig?: Partial<ReportFilterConfig>;
  onClose: () => void;
  onExportSuccess?: (message: string) => void;
  onExportError?: (message: string) => void;
}

export function ExportReportModal({
  source,
  isDesktop,
  initialConfig,
  onClose,
  onExportSuccess,
  onExportError,
}: ExportReportModalProps) {
  const navigate = useNavigate();
  const theme = PORTAL_THEME_TOKENS[source.role];

  const [config, setConfig] = useState<ReportFilterConfig>(() =>
    getDefaultReportConfig(source.role, initialConfig)
  );
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    setConfig(getDefaultReportConfig(source.role, initialConfig));
  }, [source.role, initialConfig]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !generatingPdf) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [generatingPdf, onClose]);

  const payload = useMemo(
    () => buildReportPayload(source, config),
    [source, config]
  );

  const canExport = !payload.isSelectionIncomplete && payload.matchedCount > 0;

  const portalContextSubtitle =
    source.role === 'ADMIN'
      ? 'Division Admin'
      : source.role === 'SECTOR'
      ? `${source.data.sector.name} (${source.data.sector.login_code})`
      : `${source.data.unit.name} (${source.data.unit.login_code})`;

  const reportsRoute =
    source.role === 'ADMIN'
      ? '/admin/reports'
      : source.role === 'SECTOR'
      ? '/sector/reports'
      : '/dashboard/reports';

  const handleExportPdf = async () => {
    if (!canExport || generatingPdf) return;
    setGeneratingPdf(true);
    try {
      const filename = await exportReportPdf(payload);
      onExportSuccess?.(`Downloaded PDF (${filename || payload.pdfFilename})`);
    } catch (err) {
      onExportError?.(
        err instanceof Error ? err.message : 'Unable to generate PDF export.'
      );
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleExportCsv = () => {
    if (!canExport) return;
    try {
      exportReportCsv(payload);
      onExportSuccess?.(`Exported CSV (${payload.csvFilename})`);
    } catch (err) {
      onExportError?.(
        err instanceof Error ? err.message : 'Unable to export CSV.'
      );
    }
  };

  const handleOpenReportsPage = () => {
    onClose();
    navigate(reportsRoute);
  };

  const handleColorBar =
    source.role === 'UNIT'
      ? 'bg-cream-border'
      : source.role === 'SECTOR'
      ? 'bg-leaf-border'
      : 'bg-milk-border';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-report-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !generatingPdf) {
          onClose();
        }
      }}
      className={
        isDesktop
          ? 'fixed inset-0 z-50 bg-ink-900/45 backdrop-blur-md flex items-center justify-center p-4 transition-opacity'
          : 'fixed inset-0 z-50 bg-ink-900/45 backdrop-blur-md flex items-end justify-center transition-opacity'
      }
    >
      <div
        className={
          isDesktop
            ? `${theme.cardSurface} bg-white/95 max-w-2xl w-full max-h-[90dvh] rounded-2xl border ${theme.border} shadow-2xl flex flex-col overflow-hidden`
            : `${theme.cardSurface} bg-white/98 w-full max-w-xl max-h-[92dvh] rounded-t-2xl border-t ${theme.border} shadow-2xl flex flex-col overflow-hidden`
        }
      >
        {/* Sticky Modal Header */}
        <div
          className={`shrink-0 px-5 pt-4 pb-3 border-b ${theme.border} bg-white/80 backdrop-blur-sm`}
        >
          {!isDesktop && (
            <div
              className={`w-10 h-1 rounded-full ${handleColorBar} mx-auto mb-3`}
            />
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-9 h-9 rounded-xl ${theme.primaryBtn} flex items-center justify-center shrink-0 shadow-xs`}
              >
                <FileDown className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2
                  id="export-report-modal-title"
                  className={`text-base font-bold leading-tight ${theme.heading}`}
                >
                  Export Report
                </h2>
                <p className={`text-xs truncate mt-0.5 ${theme.muted}`}>
                  <BrandText text={portalContextSubtitle} />
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={generatingPdf}
              aria-label="Close export modal"
              className="p-1.5 rounded-lg text-ink-600 hover:bg-black/5 transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Interior */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <ReportFilterControls
            source={source}
            config={config}
            onChange={setConfig}
            compact
          />

          {/* Live Matching Summary Strip */}
          {payload.isSelectionIncomplete ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-2.5 flex items-center gap-2 text-xs text-amber-900 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{payload.selectionPrompt}</span>
            </div>
          ) : payload.matchedCount === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-2.5 flex items-center gap-2 text-xs text-amber-900 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>No records match the current filters</span>
            </div>
          ) : (
            <div
              className={`${theme.pillSurface} rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5`}
            >
              <div className={`text-xs font-bold num ${theme.heading}`}>
                {formatReportSummaryLine(payload)}
              </div>
              <div className={`text-[11px] num font-semibold ${theme.muted}`}>
                Paid {formatCurrency(payload.summary.paidAmount)} • Unpaid{' '}
                <span
                  className={
                    payload.summary.unpaidAmount > 0
                      ? 'text-vibrant-coral font-bold'
                      : ''
                  }
                >
                  {formatCurrency(payload.summary.unpaidAmount)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Modal Footer */}
        <div
          className={`shrink-0 px-5 py-3.5 border-t ${theme.border} bg-white/90 backdrop-blur-sm ${
            !isDesktop ? 'pb-[calc(0.9rem+env(safe-area-inset-bottom))]' : ''
          }`}
        >
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <button
              type="button"
              onClick={handleOpenReportsPage}
              className={`text-xs font-semibold ${theme.accentText} hover:underline inline-flex items-center justify-center sm:justify-start gap-1 py-1`}
            >
              <span>Open Full Reports Page</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <div className="grid grid-cols-2 sm:flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!canExport || generatingPdf}
                className={`${theme.pillSurface} hover:bg-white ${theme.heading} text-xs font-semibold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-colors`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={!canExport || generatingPdf}
                className={`${theme.primaryBtn} hover:opacity-95 text-xs font-semibold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-opacity shadow-sm`}
              >
                {generatingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                <span>{generatingPdf ? 'Preparing PDF...' : 'Export PDF'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
