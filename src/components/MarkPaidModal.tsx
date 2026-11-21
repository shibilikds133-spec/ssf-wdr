import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { isSessionExpiredError } from '../context/AuthContext';
import { clearCached } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type { EntryItem, PaymentMode } from '../types';
import { formatCurrency, formatQuantity } from '../utils/format';

interface MarkPaidModalProps {
  portal: 'UNIT' | 'SECTOR' | 'ADMIN';
  authCode: string;
  entry: EntryItem;
  isDesktop: boolean;
  onClose: () => void;
  onPaid: (msg: string) => Promise<void>;
  onSessionExpired?: (msg?: string) => void;
}

export function MarkPaidModal({
  portal,
  authCode,
  entry,
  isDesktop,
  onClose,
  onPaid,
  onSessionExpired,
}: MarkPaidModalProps) {
  const [selectedMode, setSelectedMode] = useState<PaymentMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUnit = portal === 'UNIT';
  const isSector = portal === 'SECTOR';

  const borderClass = isUnit
    ? 'border-cream-border'
    : isSector
    ? 'border-leaf-border'
    : 'border-milk-border';
  const pillBgClass = isUnit
    ? 'bg-cream-100'
    : isSector
    ? 'bg-leaf-100'
    : 'bg-milk-50';
  const headingClass = isUnit
    ? 'text-ember-950'
    : isSector
    ? 'text-forest-950'
    : 'text-plum-950';
  const primaryBtnClass = isUnit
    ? 'glass-orange text-white'
    : isSector
    ? 'glass-forest text-white'
    : 'glass-plum text-white';
  const cardSurfaceClass = isUnit
    ? 'glass-cream-card'
    : isSector
    ? 'glass-leaf-card'
    : 'glass-card';

  const handleConfirm = async () => {
    setError(null);
    if (!selectedMode) {
      setError('Please select Cash Handover or UPI.');
      return;
    }

    const rpcName = isUnit
      ? 'unit_mark_entry_paid'
      : isSector
      ? 'sector_mark_entry_paid'
      : 'admin_mark_entry_paid';

    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc(rpcName, {
        p_code: authCode,
        p_entry_id: entry.id,
        p_payment_mode: selectedMode,
      });

      if (rpcError) {
        if (isSessionExpiredError(rpcError.message)) {
          onSessionExpired?.();
          return;
        }
        setError(rpcError.message || 'Failed to mark order as paid.');
        setSaving(false);
        return;
      }

      clearCached('wdr_public_stats_v1');
      await onPaid(
        `Order marked Paid (${selectedMode === 'CASH' ? 'Cash Handover' : 'UPI'})`
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update payment status.'
      );
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mark-paid-modal-title"
      className={
        isDesktop
          ? 'fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-md flex items-center justify-center p-4'
          : 'fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-md flex items-end justify-center'
      }
    >
      <div
        className={
          isDesktop
            ? `${cardSurfaceClass} bg-white/95 max-w-md w-full rounded-2xl border ${borderClass} p-6 shadow-2xl space-y-4`
            : `${cardSurfaceClass} bg-white/98 w-full max-w-xl rounded-t-2xl border-t ${borderClass} p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl space-y-4`
        }
      >
        {!isDesktop && (
          <div className={`w-10 h-1 rounded-full ${isUnit ? 'bg-cream-border' : isSector ? 'bg-leaf-border' : 'bg-milk-border'} mx-auto`} />
        )}

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="mark-paid-modal-title"
              className={`text-base font-bold ${headingClass}`}
            >
              Mark Order as Paid
            </h2>
            <p className="text-xs text-ink-600 mt-0.5">
              Select how payment was received for this order.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-ink-600 hover:bg-black/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Order Summary */}
        <div
          className={`${pillBgClass} border ${borderClass} rounded-xl p-3.5 text-xs space-y-1`}
        >
          <div className={`font-bold text-sm ${headingClass}`}>
            {entry.contributor_name}
          </div>
          <div className="flex items-center justify-between text-ink-600 num">
            <span>{formatQuantity(Number(entry.quantity) || 0)} L</span>
            <span className={`text-sm font-extrabold ${headingClass}`}>
              {formatCurrency(Number(entry.total_amount) || 0)}
            </span>
          </div>
        </div>

        {/* Cash Handover vs UPI Cards (starts unselected) */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSelectedMode('CASH');
              setError(null);
            }}
            className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all ${
              selectedMode === 'CASH'
                ? `${primaryBtnClass} border-transparent shadow-sm`
                : `bg-white ${borderClass} text-ink-900 hover:bg-black/[0.02]`
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span>Cash Handover</span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSelectedMode('UPI');
              setError(null);
            }}
            className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all ${
              selectedMode === 'UPI'
                ? `${primaryBtnClass} border-transparent shadow-sm`
                : `bg-white ${borderClass} text-ink-900 hover:bg-black/[0.02]`
            }`}
          >
            <Smartphone className="w-5 h-5" />
            <span>UPI</span>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border ${borderClass} text-ink-600 hover:bg-black/[0.03] transition-colors`}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !selectedMode}
            onClick={() => void handleConfirm()}
            className={`px-4 py-2 text-xs font-semibold rounded-xl ${primaryBtnClass} hover:opacity-95 disabled:opacity-50 transition-opacity inline-flex items-center gap-1.5 shadow-sm`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{saving ? 'Updating...' : 'Confirm Paid'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
