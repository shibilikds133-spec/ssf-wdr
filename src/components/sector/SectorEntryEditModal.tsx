import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { EntryItem, PaymentMode, PaymentStatus } from '../../types';
import { formatCurrency } from '../../utils/format';
import {
  blockNegativeNumericKeys,
  sanitizePositiveDecimal,
  sanitizePositiveInteger,
} from '../../utils/inputGuards';

interface SectorEntryEditModalProps {
  entry: EntryItem;
  sectorCode: string;
  isDesktop: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function SectorEntryEditModal({
  entry,
  sectorCode,
  isDesktop,
  onClose,
  onSaved,
}: SectorEntryEditModalProps) {
  const [contributorName, setContributorName] = useState(entry.contributor_name);
  const [mobileNumber, setMobileNumber] = useState(entry.mobile_number);
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    entry.payment_status ?? 'PAID'
  );
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(
    entry.payment_mode ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedQty = Number.parseFloat(quantity);
  const rate = Number(entry.unit_rate_applied) || 0;
  const previewTotal =
    Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty * rate : 0;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const cleanName = contributorName.trim();
    const digits = sanitizePositiveInteger(mobileNumber);

    if (!cleanName) {
      setError('Ordered by name is required.');
      return;
    }
    if (digits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }
    if (paymentStatus === 'PAID' && !paymentMode) {
      setError('Please select Cash Handover or UPI for Paid orders.');
      return;
    }

    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('sector_update_entry', {
        p_code: sectorCode,
        p_entry_id: entry.id,
        p_contributor_name: cleanName,
        p_mobile_number: digits,
        p_quantity: parsedQty,
        p_payment_mode: paymentStatus === 'PAID' ? paymentMode : null,
        p_payment_status: paymentStatus,
      });

      if (rpcError) {
        setError(rpcError.message || 'Failed to update order.');
        setSaving(false);
        return;
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save order changes.'
      );
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-sector-entry-title"
      className={
        isDesktop
          ? 'fixed inset-0 z-50 bg-forest-950/35 backdrop-blur-sm flex items-center justify-center p-4'
          : 'fixed inset-0 z-50 bg-forest-950/35 backdrop-blur-sm flex items-end justify-center'
      }
    >
      <div
        className={
          isDesktop
            ? 'glass-leaf-card bg-white/95 max-w-md w-full rounded-2xl border border-leaf-border p-6 shadow-2xl'
            : 'glass-leaf-card bg-white/98 w-full max-w-xl rounded-t-2xl border-t border-leaf-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl max-h-[92vh] overflow-y-auto'
        }
      >
        {!isDesktop && (
          <div className="w-10 h-1 rounded-full bg-leaf-border mx-auto mb-4" />
        )}

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="edit-sector-entry-title"
              className="text-base font-semibold text-forest-950"
            >
              Edit Order Entry
            </h2>
            <p className="text-xs text-forest-600 mt-0.5">
              {entry.unit_name ?? 'Unit'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close edit modal"
            className="p-1.5 rounded-lg text-forest-600 hover:text-forest-950 hover:bg-leaf-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label
              htmlFor="sector-edit-contributor-name"
              className="block text-xs font-medium text-forest-950 mb-1"
            >
              Ordered By
            </label>
            <input
              id="sector-edit-contributor-name"
              type="text"
              required
              value={contributorName}
              onChange={(e) => setContributorName(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 text-sm rounded-xl border border-leaf-border bg-white text-forest-950 focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900"
            />
          </div>

          <div>
            <label
              htmlFor="sector-edit-mobile-number"
              className="block text-xs font-medium text-forest-950 mb-1"
            >
              Mobile Number
            </label>
            <input
              id="sector-edit-mobile-number"
              type="tel"
              inputMode="numeric"
              maxLength={15}
              required
              value={mobileNumber}
              onKeyDown={blockNegativeNumericKeys}
              onChange={(e) =>
                setMobileNumber(sanitizePositiveInteger(e.target.value))
              }
              disabled={saving}
              className="w-full px-3 py-2 text-sm rounded-xl border border-leaf-border bg-white text-forest-950 num focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sector-edit-quantity"
                className="block text-xs font-medium text-forest-950 mb-1"
              >
                Quantity (L)
              </label>
              <input
                id="sector-edit-quantity"
                type="text"
                inputMode="decimal"
                required
                value={quantity}
                onKeyDown={blockNegativeNumericKeys}
                onChange={(e) =>
                  setQuantity(sanitizePositiveDecimal(e.target.value))
                }
                disabled={saving}
                className="w-full px-3 py-2 text-sm rounded-xl border border-leaf-border bg-white text-forest-950 num focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-forest-950 mb-1">
                Payment Status
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {(['PAID', 'UNPAID'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setPaymentStatus(status);
                      if (status === 'UNPAID') setPaymentMode(null);
                    }}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-colors ${
                      paymentStatus === status
                        ? 'glass-forest text-white border-transparent'
                        : 'bg-white text-forest-700 border-leaf-border hover:bg-leaf-100'
                    }`}
                  >
                    {status === 'PAID' ? 'Paid' : 'Unpaid'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {paymentStatus === 'PAID' && (
            <div>
              <span className="block text-xs font-medium text-forest-950 mb-1">
                Payment Method *
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'UPI'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={saving}
                    onClick={() => setPaymentMode(mode)}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-colors ${
                      paymentMode === mode
                        ? 'glass-forest text-white border-transparent'
                        : 'bg-white text-forest-700 border-leaf-border hover:bg-leaf-100'
                    }`}
                  >
                    {mode === 'CASH' ? 'Cash Handover' : 'UPI'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="glass-leaf-pill rounded-xl p-3.5 flex items-center justify-between text-xs">
            <span className="text-forest-600 num">
              Rate: {formatCurrency(rate)}/L
            </span>
            <span className="font-semibold text-forest-950 num">
              Updated Total: {formatCurrency(previewTotal)}
            </span>
          </div>

          {error && (
            <p
              role="alert"
              className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-leaf-border text-forest-700 hover:bg-leaf-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold rounded-xl glass-forest hover:opacity-95 text-white disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
