import { useState } from 'react';
import { CheckCircle2, Loader2, Smartphone, Wallet, X } from 'lucide-react';
import { isSessionExpiredError } from '../context/AuthContext';
import { clearCached } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type { PaymentMode } from '../types';

export interface InlinePaymentUpdaterProps {
  portal: 'ADMIN' | 'SECTOR' | 'UNIT';
  authCode: string;
  entryId: number;
  compact?: boolean;
  onPaid: (msg: string) => Promise<void> | void;
  onError?: (msg: string) => void;
  onSessionExpired?: () => void;
}

const PORTAL_STYLES = {
  ADMIN: {
    triggerBtn: 'glass-plum text-white hover:opacity-95',
    pillWrap: 'bg-milk-50/95 border border-milk-border',
    cashBtn:
      'bg-vibrant-amberSoft text-vibrant-amber hover:bg-vibrant-amber hover:text-white border border-vibrant-amber/25',
    upiBtn:
      'bg-vibrant-tealSoft text-vibrant-teal hover:bg-vibrant-teal hover:text-white border border-vibrant-teal/25',
    closeBtn: 'text-ink-600 hover:text-plum-950 hover:bg-milk-200/70',
    savingText: 'text-plum-900',
  },
  SECTOR: {
    triggerBtn: 'glass-forest text-white hover:opacity-95',
    pillWrap: 'bg-leaf-50/95 border border-leaf-border',
    cashBtn:
      'bg-vibrant-amberSoft text-vibrant-amber hover:bg-vibrant-amber hover:text-white border border-vibrant-amber/25',
    upiBtn:
      'bg-vibrant-tealSoft text-vibrant-teal hover:bg-vibrant-teal hover:text-white border border-vibrant-teal/25',
    closeBtn: 'text-forest-600 hover:text-forest-950 hover:bg-leaf-200/70',
    savingText: 'text-forest-900',
  },
  UNIT: {
    triggerBtn: 'glass-orange text-white hover:opacity-95',
    pillWrap: 'bg-[#FFF9F4]/95 border border-[#E5DEC9]',
    cashBtn:
      'bg-vibrant-amberSoft text-vibrant-amber hover:bg-vibrant-amber hover:text-white border border-vibrant-amber/25',
    upiBtn:
      'bg-vibrant-tealSoft text-vibrant-teal hover:bg-vibrant-teal hover:text-white border border-vibrant-teal/25',
    closeBtn: 'text-[#6B5449] hover:text-[#261812] hover:bg-[#F6F2E7]',
    savingText: 'text-[#D44B1A]',
  },
} as const;

export function InlinePaymentUpdater({
  portal,
  authCode,
  entryId,
  compact = false,
  onPaid,
  onError,
  onSessionExpired,
}: InlinePaymentUpdaterProps) {
  const [expanded, setExpanded] = useState(false);
  const [savingMode, setSavingMode] = useState<PaymentMode | null>(null);
  const styles = PORTAL_STYLES[portal];

  const handleSelectMode = async (mode: PaymentMode) => {
    if (savingMode) return;
    setSavingMode(mode);

    const rpcName =
      portal === 'UNIT'
        ? 'unit_mark_entry_paid'
        : portal === 'SECTOR'
        ? 'sector_mark_entry_paid'
        : 'admin_mark_entry_paid';

    try {
      const { error: rpcError } = await supabase.rpc(rpcName, {
        p_code: authCode,
        p_entry_id: entryId,
        p_payment_mode: mode,
      });

      if (rpcError) {
        if (isSessionExpiredError(rpcError.message)) {
          onSessionExpired?.();
          return;
        }
        onError?.(rpcError.message || 'Failed to update payment status.');
        setSavingMode(null);
        return;
      }

      clearCached('wdr_public_stats_v1');
      clearCached('wdr_public_leaderboard_v1');
      await onPaid(
        `Order marked Paid (${mode === 'CASH' ? 'Cash Handover' : 'UPI'})`
      );
      setExpanded(false);
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : 'Unable to update payment status.'
      );
    } finally {
      setSavingMode(null);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`${styles.triggerBtn} ${
          compact
            ? 'px-2 py-0.5 rounded-full text-[10px]'
            : 'px-2.5 py-1 rounded-lg text-xs'
        } font-semibold transition-opacity inline-flex items-center gap-1 whitespace-nowrap shrink-0`}
      >
        <CheckCircle2 className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>{compact ? 'Mark Paid' : 'Mark as Paid'}</span>
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Select payment mode"
      className={`inline-flex items-center gap-1 rounded-full ${
        compact ? 'p-0.5' : 'p-0.5 pl-1'
      } ${styles.pillWrap} shadow-2xs shrink-0`}
    >
      <button
        type="button"
        disabled={savingMode !== null}
        onClick={() => void handleSelectMode('CASH')}
        className={`${styles.cashBtn} ${
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
        } rounded-full font-bold inline-flex items-center gap-1 transition-colors disabled:opacity-60 whitespace-nowrap`}
      >
        {savingMode === 'CASH' ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Wallet className="w-3 h-3" />
        )}
        <span>Cash</span>
      </button>

      <button
        type="button"
        disabled={savingMode !== null}
        onClick={() => void handleSelectMode('UPI')}
        className={`${styles.upiBtn} ${
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
        } rounded-full font-bold inline-flex items-center gap-1 transition-colors disabled:opacity-60 whitespace-nowrap`}
      >
        {savingMode === 'UPI' ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Smartphone className="w-3 h-3" />
        )}
        <span>UPI</span>
      </button>

      <button
        type="button"
        disabled={savingMode !== null}
        onClick={() => setExpanded(false)}
        aria-label="Cancel payment update"
        className={`p-1 rounded-full transition-colors disabled:opacity-40 ${styles.closeBtn}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export default InlinePaymentUpdater;
