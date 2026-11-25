import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  PaymentMode,
  PaymentStatus,
  PublicOrderRequest,
  SectorOption,
  UnitSummaryRow,
} from '../../types';
import { formatCurrency, formatQuantity } from '../../utils/format';
import {
  notifyOrderCreated,
  notifyPublicOrderApproved,
} from '../../utils/pushNotifications';
import { SelectDropdown } from '../SelectDropdown';

interface ApprovePublicOrderModalProps {
  request: PublicOrderRequest;
  adminCode: string;
  sectors: SectorOption[];
  units: UnitSummaryRow[];
  onClose: () => void;
  onApproved: (message: string) => void;
  onSessionExpired: () => void;
}

export function ApprovePublicOrderModal({
  request,
  adminCode,
  sectors,
  units,
  onClose,
  onApproved,
  onSessionExpired,
}: ApprovePublicOrderModalProps) {
  const [selectedSectorId, setSelectedSectorId] = useState<string>(
    request.sector_id ? String(request.sector_id) : 'ALL'
  );
  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    request.unit_id ? String(request.unit_id) : ''
  );
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('UNPAID');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  const filteredUnits = useMemo(() => {
    const base =
      selectedSectorId === 'ALL'
        ? units
        : units.filter((u) => String(u.sector_id) === selectedSectorId);
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [units, selectedSectorId]);

  const sectorOptions = useMemo(
    () => [
      { value: 'ALL', label: 'All Sectors' },
      ...[...sectors]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({
          value: String(s.id),
          label: s.name,
        })),
    ],
    [sectors]
  );

  const unitOptions = useMemo(
    () => [
      { value: '', label: 'Division Direct (No Unit)' },
      ...filteredUnits.map((u) => ({
        value: String(u.id),
        label: u.name,
      })),
    ],
    [filteredUnits]
  );

  const handleSectorChange = (nextSector: string) => {
    setSelectedSectorId(nextSector);
    if (
      nextSector !== 'ALL' &&
      selectedUnitId &&
      !units.some(
        (u) =>
          String(u.id) === selectedUnitId && String(u.sector_id) === nextSector
      )
    ) {
      setSelectedUnitId('');
    }
  };

  const assignedUnitName = useMemo(() => {
    if (!selectedUnitId) return 'Division Direct';
    const found = units.find((u) => String(u.id) === selectedUnitId);
    return found ? `${found.name} (${found.sector_name})` : 'Selected Unit';
  }, [selectedUnitId, units]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'admin_approve_public_order_request',
        {
          p_token: adminCode,
          p_request_id: request.id,
          p_unit_id: selectedUnitId ? Number(selectedUnitId) : null,
          p_payment_status: paymentStatus,
          p_payment_mode: paymentStatus === 'PAID' ? paymentMode : null,
        }
      );

      if (rpcError) {
        if (rpcError.message.toLowerCase().includes('unauthorized')) {
          onSessionExpired();
          return;
        }
        setError(rpcError.message || 'Failed to approve order request.');
        return;
      }

      const res = data as { entry_id?: number } | null;
      if (res?.entry_id) {
        notifyOrderCreated(res.entry_id, 'public');
      }
      notifyPublicOrderApproved(adminCode, request.id);

      onApproved(
        `Approved ${request.customer_name}'s order (${formatQuantity(
          request.quantity
        )} L) into ${assignedUnitName}.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Network error while approving order.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="approve-public-order-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-plum-950/45 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#FDFBF8] border border-milk-border shadow-2xl text-ink-900 overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
        {/* Warning Header */}
        <div className="px-5 py-4 bg-amber-50 border-b border-amber-200/80 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </span>
            <div>
              <h3
                id="approve-public-order-title"
                className="text-sm font-extrabold text-amber-950"
              >
                Confirm Order Approval
              </h3>
              <p className="text-xs text-amber-900/85 mt-0.5 leading-snug">
                This will add the order directly to the official Division/Unit
                totals and Live Leaderboard.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full hover:bg-amber-200/50 text-amber-900 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-semibold text-red-800"
            >
              {error}
            </div>
          )}

          {/* Summary Box */}
          <div className="rounded-2xl bg-milk-100/80 border border-milk-border p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-ink-500">Customer</span>
              <span className="font-bold text-ink-900">
                {request.customer_name}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-ink-500">Mobile</span>
              <span className="font-semibold text-ink-800 num">
                +91 {request.mobile}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-ink-500">Quantity</span>
              <span className="font-extrabold text-plum-900 num">
                {formatQuantity(request.quantity)} L
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-ink-500">Total Amount</span>
              <span className="font-extrabold text-plum-900 num">
                {formatCurrency(request.total_amount)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-ink-500">Assigned Unit</span>
              <span className="font-bold text-plum-900">{assignedUnitName}</span>
            </div>
          </div>

          {/* Final Unit Check */}
          <div className="space-y-1.5">
            <span className="block text-xs font-bold text-ink-700">
              Assign / Verify Unit
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <SelectDropdown
                value={selectedSectorId}
                onChange={handleSectorChange}
                options={sectorOptions}
                ariaLabel="Verify Sector"
              />
              <SelectDropdown
                value={selectedUnitId}
                onChange={setSelectedUnitId}
                options={unitOptions}
                ariaLabel="Verify Unit"
              />
            </div>
          </div>

          {/* Payment Status Selector */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-ink-700">
              Payment Status
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentStatus('UNPAID')}
                className={`h-10 rounded-xl text-xs font-bold border transition-colors ${
                  paymentStatus === 'UNPAID'
                    ? 'bg-plum-900 text-white border-plum-900 shadow-xs'
                    : 'bg-white text-ink-700 border-milk-border hover:bg-milk-100'
                }`}
              >
                Unpaid (Default)
              </button>
              <button
                type="button"
                onClick={() => setPaymentStatus('PAID')}
                className={`h-10 rounded-xl text-xs font-bold border transition-colors ${
                  paymentStatus === 'PAID'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                    : 'bg-white text-ink-700 border-milk-border hover:bg-milk-100'
                }`}
              >
                Paid (Cash / UPI)
              </button>
            </div>

            {paymentStatus === 'PAID' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPaymentMode('CASH')}
                  className={`h-9 rounded-xl text-xs font-bold border transition-colors ${
                    paymentMode === 'CASH'
                      ? 'bg-plum-800 text-white border-plum-800'
                      : 'bg-white text-ink-700 border-milk-border'
                  }`}
                >
                  Cash Handover
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('UPI')}
                  className={`h-9 rounded-xl text-xs font-bold border transition-colors ${
                    paymentMode === 'UPI'
                      ? 'bg-plum-800 text-white border-plum-800'
                      : 'bg-white text-ink-700 border-milk-border'
                  }`}
                >
                  UPI
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-11 px-4 rounded-2xl bg-milk-100 hover:bg-milk-200 text-ink-700 text-xs font-bold transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="flex-1 h-11 rounded-2xl bg-plum-900 hover:bg-plum-950 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Approving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Add Order</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
