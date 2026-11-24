import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  RotateCcw,
  Search,
  ShoppingBag,
  Undo2,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { supabase } from '../../lib/supabase';
import type {
  PublicOrderRequest,
  PublicOrderRequestCounts,
  PublicOrderRequestStatus,
  SectorOption,
  UnitSummaryRow,
} from '../../types';
import { formatCurrency, formatQuantity } from '../../utils/format';
import { SelectDropdown } from '../SelectDropdown';
import { ApprovePublicOrderModal } from './ApprovePublicOrderModal';

interface AdminPublicPortalTabProps {
  isDesktop: boolean;
  adminCode: string;
  sectors: SectorOption[];
  units: UnitSummaryRow[];
  refreshKey: number;
  onMutated: (message?: string) => Promise<void> | void;
  onError: (message: string) => void;
  onSessionExpired: () => void;
}

function formatIndianMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '').slice(-10);
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return mobile;
}

function formatCardTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function buildWhatsAppVerifyUrl(req: PublicOrderRequest): string {
  const digits = req.mobile.replace(/\D/g, '').slice(-10);
  const unitText = req.unit_name
    ? ` (${req.unit_name})`
    : ' (Division Direct)';
  const msg = `Assalamu Alaikum ${req.customer_name}, we received your SSF Wandoor Payasam Challenge order request for ${formatQuantity(
    req.quantity
  )} L (${formatCurrency(req.total_amount)})${unitText}. Please confirm your order so we can finalize it.`;
  return `https://wa.me/91${digits}?text=${encodeURIComponent(msg)}`;
}

export function AdminPublicPortalTab({
  isDesktop,
  adminCode,
  sectors,
  units,
  refreshKey,
  onMutated,
  onError,
  onSessionExpired,
}: AdminPublicPortalTabProps) {
  const [statusView, setStatusView] =
    useState<PublicOrderRequestStatus>('pending');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 100);

  const [requests, setRequests] = useState<PublicOrderRequest[]>([]);
  const [counts, setCounts] = useState<PublicOrderRequestCounts>({
    pending_count: 0,
    approved_count: 0,
    cancelled_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<PublicOrderRequest | null>(
    null
  );
  const [undoCancelledTarget, setUndoCancelledTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'admin_get_public_order_requests',
        {
          p_token: adminCode,
          p_status: statusView,
          p_search: debouncedSearch.trim(),
        }
      );

      if (rpcError) {
        if (rpcError.message.toLowerCase().includes('unauthorized')) {
          onSessionExpired();
          return;
        }
        onError(rpcError.message || 'Failed to load public portal orders.');
        return;
      }

      const parsed = data as {
        requests?: PublicOrderRequest[];
        counts?: PublicOrderRequestCounts;
      } | null;

      setRequests(Array.isArray(parsed?.requests) ? parsed.requests : []);
      if (parsed?.counts) {
        setCounts(parsed.counts);
      }
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : 'Network error loading public portal orders.'
      );
    } finally {
      setLoading(false);
    }
  }, [adminCode, statusView, debouncedSearch, onError, onSessionExpired]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests, refreshKey]);

  const sortedSectors = useMemo(
    () => [...sectors].sort((a, b) => a.name.localeCompare(b.name)),
    [sectors]
  );

  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => a.name.localeCompare(b.name)),
    [units]
  );

  const handleInlineUnitUpdate = async (
    req: PublicOrderRequest,
    nextUnitIdStr: string
  ) => {
    const nextUnitId = nextUnitIdStr ? Number(nextUnitIdStr) : null;
    setBusyId(req.id);
    try {
      const { error: rpcError } = await supabase.rpc(
        'admin_update_public_request_unit',
        {
          p_token: adminCode,
          p_request_id: req.id,
          p_unit_id: nextUnitId,
        }
      );
      if (rpcError) {
        if (rpcError.message.toLowerCase().includes('unauthorized')) {
          onSessionExpired();
          return;
        }
        onError(rpcError.message || 'Failed to update unit.');
        return;
      }
      await fetchRequests();
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Network error updating unit.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (req: PublicOrderRequest) => {
    setBusyId(req.id);
    try {
      const { error: rpcError } = await supabase.rpc(
        'admin_cancel_public_order_request',
        {
          p_token: adminCode,
          p_request_id: req.id,
        }
      );
      if (rpcError) {
        if (rpcError.message.toLowerCase().includes('unauthorized')) {
          onSessionExpired();
          return;
        }
        onError(rpcError.message || 'Failed to cancel request.');
        return;
      }
      setUndoCancelledTarget({ id: req.id, name: req.customer_name });
      await fetchRequests();
      await onMutated();
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Network error cancelling request.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleResetToPending = async (
    reqId: string,
    customerName: string,
    wasApproved: boolean
  ) => {
    if (
      wasApproved &&
      !window.confirm(
        `Revert ${customerName}'s approved order back to Pending? This will remove it from official totals and the Live Leaderboard.`
      )
    ) {
      return;
    }
    setBusyId(reqId);
    try {
      const { error: rpcError } = await supabase.rpc(
        'admin_reset_public_order_request',
        {
          p_token: adminCode,
          p_request_id: reqId,
        }
      );
      if (rpcError) {
        if (rpcError.message.toLowerCase().includes('unauthorized')) {
          onSessionExpired();
          return;
        }
        onError(rpcError.message || 'Failed to reset request.');
        return;
      }
      setUndoCancelledTarget(null);
      await fetchRequests();
      await onMutated(
        `Moved ${customerName}'s request back to Pending.`
      );
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Network error resetting request.'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Action & View Switcher Bar */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-2xl bg-plum-900 text-white flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-plum-950">
                Public Portal Orders
              </h2>
              <p className="text-xs text-ink-500">
                Review open `/order` requests before adding them to official
                totals
              </p>
            </div>
          </div>

          {/* Search Input (100ms debounced) */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, unit..."
              className="w-full h-10 pl-9 pr-3 rounded-2xl bg-white/90 border border-milk-border text-xs text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-plum-800/20"
            />
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusView('pending')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
              statusView === 'pending'
                ? 'glass-plum text-white shadow-xs'
                : 'bg-milk-100 text-ink-700 hover:bg-milk-200 border border-milk-border'
            }`}
          >
            Pending ({counts.pending_count})
          </button>
          <button
            type="button"
            onClick={() => setStatusView('approved')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
              statusView === 'approved'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-milk-100 text-ink-700 hover:bg-milk-200 border border-milk-border'
            }`}
          >
            Approved ({counts.approved_count})
          </button>
          <button
            type="button"
            onClick={() => setStatusView('cancelled')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
              statusView === 'cancelled'
                ? 'bg-red-700 text-white shadow-xs'
                : 'bg-milk-100 text-ink-700 hover:bg-milk-200 border border-milk-border'
            }`}
          >
            Cancelled ({counts.cancelled_count})
          </button>
        </div>
      </div>

      {/* Undo Cancel Banner */}
      {undoCancelledTarget && (
        <div className="rounded-2xl bg-plum-950 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-xs shadow-md">
          <span>
            Moved <strong>{undoCancelledTarget.name}</strong> to Cancelled.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                void handleResetToPending(
                  undoCancelledTarget.id,
                  undoCancelledTarget.name,
                  false
                )
              }
              className="px-3 py-1 rounded-full bg-white text-plum-950 font-bold inline-flex items-center gap-1 hover:bg-milk-100"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
            <button
              type="button"
              onClick={() => setUndoCancelledTarget(null)}
              className="text-white/75 hover:text-white px-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="glass-card rounded-3xl p-10 flex items-center justify-center gap-2 text-xs font-semibold text-ink-500">
          <Loader2 className="w-4 h-4 animate-spin text-plum-800" />
          <span>Loading {statusView} requests...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="glass-card rounded-3xl p-10 text-center space-y-1.5">
          <p className="text-sm font-bold text-ink-800">
            No {statusView} public portal orders
          </p>
          <p className="text-xs text-ink-500">
            {statusView === 'pending'
              ? 'New orders submitted from /order will appear here for verification.'
              : `No ${statusView} requests match your current filter.`}
          </p>
        </div>
      ) : (
        <div
          className={`grid gap-3 ${
            isDesktop ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {requests.map((req) => {
            const isBusy = busyId === req.id;
            const digits = req.mobile.replace(/\D/g, '').slice(-10);
            const activeSectorId = req.sector_id ? String(req.sector_id) : 'ALL';
            const unitChoices =
              activeSectorId === 'ALL'
                ? sortedUnits
                : sortedUnits.filter(
                    (u) => String(u.sector_id) === activeSectorId
                  );

            return (
              <div
                key={req.id}
                className="glass-card rounded-3xl p-4 space-y-3 border border-milk-border"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-plum-950 truncate">
                      {req.customer_name}
                    </h3>
                    <p className="text-[11px] text-ink-500 mt-0.5">
                      {formatCardTimestamp(req.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2.5 py-1 rounded-full bg-plum-900/10 text-plum-950 text-xs font-extrabold num">
                      {formatQuantity(req.quantity)} L
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-milk-200 text-plum-950 text-xs font-extrabold num">
                      {formatCurrency(req.total_amount)}
                    </span>
                  </div>
                </div>

                {/* Phone Row */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-ink-800 num">
                    {formatIndianMobile(req.mobile)}
                  </span>
                  {req.status !== 'pending' && (
                    <span className="text-[11px] font-semibold text-ink-500">
                      {req.unit_name
                        ? `${req.unit_name}${
                            req.sector_name ? ` (${req.sector_name})` : ''
                          }`
                        : 'Division Direct'}
                    </span>
                  )}
                </div>

                {/* Inline Unit Assignment / Correction Selector (Pending View) */}
                {req.status === 'pending' && (
                  <div className="rounded-2xl bg-milk-100/75 border border-milk-border p-2.5 space-y-1.5">
                    <span className="block text-[11px] font-bold text-ink-600">
                      Unit Assignment
                    </span>
                    <div
                      className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${
                        isBusy ? 'opacity-60 pointer-events-none' : ''
                      }`}
                    >
                      <SelectDropdown
                        value={activeSectorId}
                        onChange={(nextSec) => {
                          if (nextSec === 'ALL') {
                            void handleInlineUnitUpdate(req, '');
                          } else {
                            const firstInSector = sortedUnits.find(
                              (u) => String(u.sector_id) === nextSec
                            );
                            if (firstInSector) {
                              void handleInlineUnitUpdate(
                                req,
                                String(firstInSector.id)
                              );
                            }
                          }
                        }}
                        options={[
                          { value: 'ALL', label: 'All Sectors' },
                          ...sortedSectors.map((s) => ({
                            value: String(s.id),
                            label: s.name,
                          })),
                        ]}
                        ariaLabel="Select sector for request"
                      />
                      <SelectDropdown
                        value={req.unit_id ? String(req.unit_id) : ''}
                        onChange={(nextUnit) =>
                          void handleInlineUnitUpdate(req, nextUnit)
                        }
                        options={[
                          {
                            value: '',
                            label: 'No Unit Selected (Division Direct)',
                          },
                          ...unitChoices.map((u) => ({
                            value: String(u.id),
                            label: u.name,
                          })),
                        ]}
                        ariaLabel="Select unit for request"
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <a
                    href={`tel:+91${digits}`}
                    className="h-9 px-3 rounded-xl bg-milk-100 hover:bg-milk-200 border border-milk-border text-ink-800 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>
                  <a
                    href={buildWhatsAppVerifyUrl(req)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>

                  {req.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setApproveTarget(req)}
                        className="flex-1 h-9 px-3 rounded-xl bg-plum-900 hover:bg-plum-950 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleCancel(req)}
                        className="h-9 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    </>
                  )}

                  {req.status === 'approved' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void handleResetToPending(
                          req.id,
                          req.customer_name,
                          true
                        )
                      }
                      className="ml-auto h-9 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset to Pending</span>
                    </button>
                  )}

                  {req.status === 'cancelled' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void handleResetToPending(
                          req.id,
                          req.customer_name,
                          false
                        )
                      }
                      className="ml-auto h-9 px-3 rounded-xl bg-plum-900 hover:bg-plum-950 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore to Pending</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {approveTarget && (
        <ApprovePublicOrderModal
          request={approveTarget}
          adminCode={adminCode}
          sectors={sectors}
          units={units}
          onClose={() => setApproveTarget(null)}
          onApproved={async (msg) => {
            setApproveTarget(null);
            await fetchRequests();
            await onMutated(msg);
          }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </div>
  );
}
