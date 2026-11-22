import { useState } from 'react';
import { Check, Copy, Loader2, MessageCircle } from 'lucide-react';
import type { ReportShareMode } from '../../utils/pdf/pdfAccounting';
import { buildWhatsAppReportText } from '../../utils/pdf/whatsappFormatter';
import {
  copyWhatsAppReportText,
  deliverWhatsAppReport,
} from '../../utils/pdf/whatsappShare';
import type { ReportDataSource, ReportFilterConfig } from '../../utils/reports';
import { PORTAL_THEME_TOKENS } from './ReportFilterControls';

interface WhatsAppShareActionsProps {
  source: ReportDataSource;
  config: ReportFilterConfig;
  disabled?: boolean;
  compact?: boolean;
  mode?: ReportShareMode;
  onModeChange?: (mode: ReportShareMode) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function WhatsAppShareActions({
  source,
  config,
  disabled = false,
  compact = false,
  mode: controlledMode,
  onModeChange,
  onSuccess,
  onError,
}: WhatsAppShareActionsProps) {
  const theme = PORTAL_THEME_TOKENS[source.role];
  const [internalMode, setInternalMode] = useState<ReportShareMode>('status');
  const mode = controlledMode ?? internalMode;
  const setMode = (next: ReportShareMode) => {
    if (controlledMode === undefined) {
      setInternalMode(next);
    }
    onModeChange?.(next);
  };

  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShareWhatsApp = async () => {
    if (disabled || sharing) return;
    setSharing(true);
    try {
      const formatted = buildWhatsAppReportText({ source, config, mode });
      const res = await deliverWhatsAppReport(formatted.text, formatted.title);
      if (res.method === 'clipboard_fallback') {
        onSuccess?.('Full report copied — paste directly into WhatsApp');
      } else {
        onSuccess?.(
          mode === 'status'
            ? 'Prepared WhatsApp Order Status summary'
            : 'Prepared WhatsApp Detailed Report'
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Share cancelled.') {
        return;
      }
      onError?.(
        err instanceof Error
          ? err.message
          : 'Unable to open WhatsApp share.'
      );
    } finally {
      setSharing(false);
    }
  };

  const handleCopy = async () => {
    if (disabled || sharing) return;
    try {
      const formatted = buildWhatsAppReportText({ source, config, mode });
      await copyWhatsAppReportText(formatted.text);
      setCopied(true);
      onSuccess?.(
        mode === 'status'
          ? 'Copied Order Status text to clipboard'
          : 'Copied Detailed Report text to clipboard'
      );
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      onError?.(
        err instanceof Error
          ? err.message
          : 'Unable to copy WhatsApp message.'
      );
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${
        compact ? 'justify-between sm:justify-end' : ''
      }`}
    >
      {/* Mode Toggle Pill (Order Status [Default] vs Detailed) */}
      <div
        role="group"
        aria-label="WhatsApp and summary share mode"
        className={`${theme.pillSurface} p-0.5 rounded-full inline-flex items-center text-[11px] shrink-0`}
      >
        <button
          type="button"
          onClick={() => setMode('status')}
          className={`px-2.5 py-1 rounded-full font-semibold transition-all whitespace-nowrap ${
            mode === 'status'
              ? `${theme.primaryBtn} shadow-2xs`
              : `${theme.muted} hover:text-ink-900`
          }`}
        >
          Order Status
        </button>
        <button
          type="button"
          onClick={() => setMode('detailed')}
          className={`px-2.5 py-1 rounded-full font-semibold transition-all whitespace-nowrap ${
            mode === 'detailed'
              ? `${theme.primaryBtn} shadow-2xs`
              : `${theme.muted} hover:text-ink-900`
          }`}
        >
          Detailed
        </button>
      </div>

      {/* Direct WhatsApp Share + Quick Copy */}
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled || sharing}
          onClick={() => void handleShareWhatsApp()}
          className="glass-forest text-white hover:opacity-95 text-xs font-semibold px-3.5 py-2 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-opacity shadow-sm whitespace-nowrap"
        >
          {sharing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <MessageCircle className="w-3.5 h-3.5" />
          )}
          <span>{compact ? 'WhatsApp' : 'Share on WhatsApp'}</span>
        </button>

        <button
          type="button"
          disabled={disabled || sharing}
          onClick={() => void handleCopy()}
          title={copied ? 'Copied!' : 'Copy WhatsApp Text'}
          aria-label="Copy WhatsApp report text"
          className={`${theme.pillSurface} hover:bg-white ${theme.heading} text-xs font-semibold px-2.5 py-2 rounded-xl inline-flex items-center justify-center gap-1 disabled:opacity-45 disabled:cursor-not-allowed transition-colors`}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-vibrant-teal" />
              <span className="text-vibrant-teal text-[11px]">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
