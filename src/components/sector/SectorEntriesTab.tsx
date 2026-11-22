import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Pencil,
  Phone,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { supabase } from '../../lib/supabase';
import { PaginationBar } from '../PaginationBar';
import { SelectDropdown } from '../SelectDropdown';
import type {
  EntryItem,
  PaginatedResponse,
  PaymentMode,
  PaymentStatus,
  UnitSummaryRow,
} from '../../types';
import { exportToCsv } from '../../utils/csv';
import {
  formatCurrency,
  formatDateTime,
  formatQuantity,
} from '../../utils/format';
import { SectorEntryEditModal } from './SectorEntryEditModal';

interface SectorEntriesTabProps {
  isDesktop: boolean;
  sector: {
    id: number;
    name: string;
    login_code: string;
  };
  entries: EntryItem[];
  units: UnitSummaryRow[];
  sectorCode: string;
  refreshKey?: number;
  initialUnitId: number | 'ALL';
  onClearUnitFilter: () => void;
  onMarkPaid: (entry: EntryItem) => void;
  onMutated: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}

export function SectorEntriesTab({
  isDesktop,
  sector,
  entries,
  units,
  sectorCode,
  refreshKey = 0,
  initialUnitId,
  onClearUnitFilter,
  onMarkPaid,
  onMutated,
  onError,
}: SectorEntriesTabProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 100);
  const [unitFilter, setUnitFilter] = useState<string>(
    initialUnitId === 'ALL' ? 'ALL' : String(initialUnitId)
  );
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [modeFilter, setModeFilter] = useState<'ALL' | PaymentMode>('ALL');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const [rows, setRows] = useState<EntryItem[]>(() => entries.slice(0, 10));
  const [totalCount, setTotalCount] = useState<number>(entries.length);
  const [totalPages, setTotalPages] = useState<number>(
    Math.max(Math.ceil(entries.length / 10), 1)
  );
  const [fetching, setFetching] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const requestSeqRef = useRef(0);

  const [editingEntry, setEditingEntry] = useState<EntryItem | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<EntryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (initialUnitId === 'ALL') {
      setUnitFilter('ALL');
    } else {
      setUnitFilter(String(initialUnitId));
    }
  }, [initialUnitId]);

  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => a.name.localeCompare(b.name)),
    [units]
  );

  const handleUnitChange = (nextUnit: string) => {
    setUnitFilter(nextUnit);
    if (nextUnit === 'ALL') {
      onClearUnitFilter();
    }
  };

  useEffect(() => {
    setPage(1);
  }, [unitFilter, statusFilter, modeFilter, debouncedSearch]);

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    const controller = new AbortController();
    let active = true;
    setFetching(true);

    const fetchEntries = async () => {
      try {
        const { data, error: rpcError } = await supabase
          .rpc('sector_list_entries', {
            p_code: sectorCode,
            p_unit_id: unitFilter === 'ALL' ? null : Number(unitFilter),
            p_payment_status: statusFilter,
            p_payment_mode: modeFilter,
            p_search: debouncedSearch,
            p_page: page,
            p_page_size: pageSize,
          })
          .abortSignal(controller.signal);

        if (!active || seq !== requestSeqRef.current) return;

        if (rpcError) {
          if (controller.signal.aborted) return;
          onError(rpcError.message || 'Failed to load sector orders.');
          return;
        }

        const res = data as PaginatedResponse<EntryItem> | null;
        if (!res) return;

        startTransition(() => {
          setRows(res.items ?? []);
          setTotalCount(Number(res.total_count) || 0);
          setTotalPages(Math.max(Number(res.total_pages) || 1, 1));
          if (typeof res.page === 'number' && res.page !== page) {
            setPage(res.page);
          }
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!active || seq !== requestSeqRef.current) return;
        onError(
          err instanceof Error ? err.message : 'Unable to load sector orders.'
        );
      } finally {
        if (active && seq === requestSeqRef.current) {
          setFetching(false);
        }
      }
    };

    void fetchEntries();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    sectorCode,
    unitFilter,
    statusFilter,
    modeFilter,
    debouncedSearch,
    page,
    pageSize,
    refreshKey,
    onError,
  ]);

  const selectedUnitName = useMemo(() => {
    if (unitFilter === 'ALL') return null;
    return units.find((u) => String(u.id) === unitFilter)?.name ?? null;
  }, [unitFilter, units]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'sector_list_entries',
        {
          p_code: sectorCode,
          p_unit_id: unitFilter === 'ALL' ? null : Number(unitFilter),
          p_payment_status: statusFilter,
          p_payment_mode: modeFilter,
          p_search: debouncedSearch,
          p_page: 1,
          p_page_size: 10000,
        }
      );

      if (rpcError) {
        onError(rpcError.message || 'Failed to export sector orders.');
        return;
      }

      const res = data as PaginatedResponse<EntryItem> | null;
      const exportRows = res?.items ?? rows;
      exportToCsv(
        `sector_${sector.login_code}_orders.csv`,
        [
          'Date & Time',
          'Sector',
          'Unit',
          'Ordered By',
          'Mobile Number',
          'Quantity (L)',
          'Rate (INR)',
          'Total Amount (INR)',
          'Payment Status',
          'Payment Mode',
        ],
        exportRows.map((entry) => [
          formatDateTime(entry.created_at),
          sector.name,
          entry.unit_name ?? '',
          entry.contributor_name,
          entry.mobile_number,
          Number(entry.quantity) || 0,
          Number(entry.unit_rate_applied) || 0,
          Number(entry.total_amount) || 0,
          entry.payment_status,
          entry.payment_mode === 'CASH'
            ? 'Cash Handover'
            : entry.payment_mode ?? '-',
        ])
      );
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Unable to export sector orders.'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    setDeleting(true);
    try {
      const { error: rpcError } = await supabase.rpc('sector_delete_entry', {
        p_code: sectorCode,
        p_entry_id: deletingEntry.id,
      });

      if (rpcError) {
        onError(rpcError.message || 'Failed to delete order.');
        setDeleting(false);
        return;
      }

      setDeletingEntry(null);
      await onMutated('Order deleted successfully');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to delete order.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="relative z-20 glass-leaf-card rounded-2xl p-3.5 space-y-2.5">
        <div
          className={
            isDesktop
              ? 'flex items-center gap-3 flex-wrap'
              : 'flex flex-col gap-2.5'
          }
        >
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-forest-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, mobile, or unit..."
              className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-leaf-border bg-white/90 text-forest-950 placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear orders search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-forest-400 hover:text-forest-900 p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div
            className={
              isDesktop
                ? 'flex items-center gap-2'
                : 'grid grid-cols-1 sm:grid-cols-3 gap-2'
            }
          >
            <SelectDropdown
              value={unitFilter}
              onChange={handleUnitChange}
              ariaLabel="Filter orders by unit"
              className={isDesktop ? 'w-44' : 'w-full'}
              options={[
                { value: 'ALL', label: 'All Units' },
                ...sortedUnits.map((u) => ({
                  value: String(u.id),
                  label: `${u.name} (${u.login_code})`,
                })),
              ]}
            />

            <SelectDropdown
              value={statusFilter}
              onChange={(val) =>
                setStatusFilter(val as 'ALL' | PaymentStatus)
              }
              ariaLabel="Filter orders by payment status"
              className={isDesktop ? 'w-32' : 'w-full'}
              options={[
                { value: 'ALL', label: 'All Status' },
                { value: 'PAID', label: 'Paid' },
                { value: 'UNPAID', label: 'Unpaid' },
              ]}
            />

            <SelectDropdown
              value={modeFilter}
              onChange={(val) => setModeFilter(val as 'ALL' | PaymentMode)}
              ariaLabel="Filter orders by payment mode"
              className={isDesktop ? 'w-36' : 'w-full'}
              options={[
                { value: 'ALL', label: 'All Modes' },
                { value: 'CASH', label: 'Cash Handover' },
                { value: 'UPI', label: 'UPI' },
              ]}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={totalCount === 0 || exporting}
            className={`${
              isDesktop ? 'ml-auto' : 'w-full'
            } glass-forest text-white hover:opacity-95 text-xs font-medium px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all shadow-sm`}
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        {(initialUnitId !== 'ALL' || unitFilter !== 'ALL') && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setUnitFilter('ALL');
                onClearUnitFilter();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium glass-leaf-pill text-forest-900 hover:bg-white transition-colors"
            >
              <span>Unit: {selectedUnitName ?? `#${unitFilter}`}</span>
              <X className="w-3 h-3 text-forest-400" />
              <span>Clear unit filter</span>
            </button>
          </div>
        )}
      </div>

      {isDesktop ? (
        /* DESKTOP TABLE VIEW */
        <div
          className={`glass-leaf-table rounded-xl overflow-hidden transition-opacity ${
            fetching ? 'opacity-65' : ''
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="glass-leaf-head text-forest-700 text-xs uppercase tracking-wide border-b border-leaf-border">
                  <th className="py-3 px-4 font-semibold">Time</th>
                  <th className="py-3 px-4 font-semibold">Unit</th>
                  <th className="py-3 px-4 font-semibold">Ordered By</th>
                  <th className="py-3 px-4 font-semibold text-right">
                    Qty (L)
                  </th>
                  <th className="py-3 px-4 font-semibold text-right">Amount</th>
                  <th className="py-3 px-4 font-semibold">Payment</th>
                  <th className="py-3 px-4 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-leaf-border/70">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 px-4 text-center text-sm text-forest-600"
                    >
                      {fetching
                        ? 'Loading orders...'
                        : 'No orders match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((entry) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-leaf-100/60 transition-colors"
                    >
                      <td className="py-3 px-4 text-xs text-forest-600 whitespace-nowrap num">
                        {formatDateTime(entry.created_at)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-forest-950">
                          {entry.unit_name ?? '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-forest-950">
                          {entry.contributor_name}
                        </div>
                        <a
                          href={`tel:${entry.mobile_number}`}
                          className="text-xs text-forest-700 hover:underline num"
                        >
                          {entry.mobile_number}
                        </a>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-forest-950 num whitespace-nowrap">
                        {formatQuantity(Number(entry.quantity) || 0)} L
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-forest-950 num whitespace-nowrap">
                        {formatCurrency(Number(entry.total_amount) || 0)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {entry.payment_status === 'UNPAID' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-vibrant-coralSoft text-vibrant-coral">
                            Unpaid
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              entry.payment_mode === 'UPI'
                                ? 'bg-vibrant-tealSoft text-vibrant-teal'
                                : 'bg-vibrant-amberSoft text-vibrant-amber'
                            }`}
                          >
                            Paid •{' '}
                            {entry.payment_mode === 'CASH'
                              ? 'Cash Handover'
                              : 'UPI'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {entry.payment_status === 'UNPAID' && (
                            <button
                              type="button"
                              onClick={() => onMarkPaid(entry)}
                              className="px-2.5 py-1 rounded-lg glass-forest text-white text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1 mr-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Mark as Paid
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditingEntry(entry)}
                            title="Edit order"
                            aria-label={`Edit order for ${entry.contributor_name}`}
                            className="p-1.5 rounded-lg text-forest-600 hover:text-forest-950 hover:bg-forest-100 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingEntry(entry)}
                            title="Delete order"
                            aria-label={`Delete order for ${entry.contributor_name}`}
                            className="p-1.5 rounded-lg text-forest-600 hover:text-vibrant-coral hover:bg-vibrant-coralSoft/60 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* MOBILE / TABLET STACKED TRANSACTION CARDS */
        <div
          className={`space-y-3 transition-opacity ${
            fetching ? 'opacity-65' : ''
          }`}
        >
          {rows.length === 0 ? (
            <div className="glass-leaf-card rounded-2xl p-8 text-center text-sm text-forest-600">
              {fetching
                ? 'Loading orders...'
                : 'No orders match the current filters.'}
            </div>
          ) : (
            rows.map((entry) => (
              <div
                key={entry.id}
                className="glass-leaf-card rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-forest-950 text-base leading-snug">
                      {entry.contributor_name}
                    </h3>
                    <a
                      href={`tel:${entry.mobile_number}`}
                      className="inline-flex items-center gap-1 text-xs text-forest-700 font-medium hover:underline num mt-0.5"
                    >
                      <Phone className="w-3 h-3" />
                      {entry.mobile_number}
                    </a>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {entry.payment_status === 'UNPAID' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-vibrant-coralSoft text-vibrant-coral">
                        Unpaid
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          entry.payment_mode === 'UPI'
                            ? 'bg-vibrant-tealSoft text-vibrant-teal'
                            : 'bg-vibrant-amberSoft text-vibrant-amber'
                        }`}
                      >
                        Paid •{' '}
                        {entry.payment_mode === 'CASH' ? 'Cash' : 'UPI'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingEntry(entry)}
                      title="Edit order"
                      aria-label={`Edit order for ${entry.contributor_name}`}
                      className="p-2 rounded-xl glass-leaf-pill text-forest-600 hover:text-forest-950 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingEntry(entry)}
                      title="Delete order"
                      aria-label={`Delete order for ${entry.contributor_name}`}
                      className="p-2 rounded-xl glass-leaf-pill text-forest-600 hover:text-vibrant-coral transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-leaf-border/70">
                  <div className="bg-leaf-50 rounded-xl p-2.5 border border-leaf-border/70">
                    <span className="text-[11px] text-forest-600 block">
                      Quantity
                    </span>
                    <span className="text-base font-bold text-forest-950 num">
                      {formatQuantity(Number(entry.quantity) || 0)} L
                    </span>
                  </div>
                  <div className="bg-leaf-50 rounded-xl p-2.5 border border-leaf-border/70">
                    <span className="text-[11px] text-forest-600 block">
                      Total Amount
                    </span>
                    <span className="text-base font-bold text-forest-950 num">
                      {formatCurrency(Number(entry.total_amount) || 0)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-forest-600 pt-0.5">
                  <span className="font-medium text-forest-950 truncate max-w-[55%]">
                    {entry.unit_name ?? 'Unit'}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.payment_status === 'UNPAID' && (
                      <button
                        type="button"
                        onClick={() => onMarkPaid(entry)}
                        className="px-2.5 py-1 rounded-lg glass-forest text-white text-[11px] font-semibold"
                      >
                        Mark as Paid
                      </button>
                    )}
                    <span className="text-[11px] num">
                      {formatDateTime(entry.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <PaginationBar
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
        pageSizeOptions={[10, 20, 35, 50]}
        theme="sector"
        loading={fetching}
        isDesktop={isDesktop}
      />

      {editingEntry && (
        <SectorEntryEditModal
          entry={editingEntry}
          sectorCode={sectorCode}
          isDesktop={isDesktop}
          onClose={() => setEditingEntry(null)}
          onSaved={() => onMutated('Order updated successfully')}
        />
      )}

      {deletingEntry && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-sector-entry-title"
          className={
            isDesktop
              ? 'fixed inset-0 z-50 bg-forest-950/35 backdrop-blur-sm flex items-center justify-center p-4'
              : 'fixed inset-0 z-50 bg-forest-950/35 backdrop-blur-sm flex items-end justify-center'
          }
        >
          <div
            className={
              isDesktop
                ? 'glass-leaf-card bg-white/95 max-w-md w-full rounded-2xl border border-leaf-border p-6 shadow-2xl space-y-4'
                : 'glass-leaf-card bg-white/98 w-full max-w-xl rounded-t-2xl border-t border-leaf-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl space-y-4'
            }
          >
            {!isDesktop && (
              <div className="w-10 h-1 rounded-full bg-leaf-border mx-auto" />
            )}
            <div>
              <h2
                id="delete-sector-entry-title"
                className="text-base font-semibold text-forest-950"
              >
                Delete Order Entry?
              </h2>
              <p className="text-xs text-forest-600 mt-1">
                This will soft-delete the order and remove it from totals and
                leaderboards.
              </p>
            </div>

            <div className="glass-leaf-pill rounded-xl p-3.5 text-xs space-y-1">
              <div className="font-semibold text-forest-950">
                {deletingEntry.contributor_name}
              </div>
              <div className="text-forest-600">
                {deletingEntry.unit_name} •{' '}
                <span className="num">
                  {formatQuantity(Number(deletingEntry.quantity) || 0)} L
                </span>{' '}
                •{' '}
                <span className="num font-medium text-forest-950">
                  {formatCurrency(Number(deletingEntry.total_amount) || 0)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-leaf-border text-forest-700 hover:bg-leaf-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-vibrant-coral hover:opacity-95 text-white disabled:opacity-50 transition-opacity shadow-sm"
              >
                {deleting ? 'Deleting...' : 'Delete Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
