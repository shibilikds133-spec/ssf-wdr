import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { supabase } from '../../lib/supabase';
import { InlinePaymentUpdater } from '../InlinePaymentUpdater';
import { PaginationBar } from '../PaginationBar';
import { SelectDropdown } from '../SelectDropdown';
import type {
  EntryItem,
  PaginatedResponse,
  PaymentMode,
  PaymentStatus,
  SectorOption,
  UnitSummaryRow,
} from '../../types';
import { exportToCsv } from '../../utils/csv';
import {
  formatCurrency,
  formatDateTime,
  formatQuantity,
} from '../../utils/format';
import { EntryEditModal } from './EntryEditModal';

interface AllEntriesTabProps {
  isDesktop: boolean;
  entries: EntryItem[];
  sectors: SectorOption[];
  units: UnitSummaryRow[];
  adminCode: string;
  refreshKey?: number;
  initialUnitId: number | 'ALL';
  onClearUnitFilter: () => void;
  onOpenAddOrder: () => void;
  onMutated: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}

export function AllEntriesTab({
  isDesktop,
  entries,
  sectors,
  units,
  adminCode,
  refreshKey = 0,
  initialUnitId,
  onClearUnitFilter,
  onOpenAddOrder,
  onMutated,
  onError,
}: AllEntriesTabProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 100);
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
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
      setSectorFilter('ALL');
      setUnitFilter(String(initialUnitId));
    }
  }, [initialUnitId]);

  const availableUnits = useMemo(() => {
    const sorted = [...units].sort((a, b) => a.name.localeCompare(b.name));
    if (sectorFilter === 'ALL' || sectorFilter === 'DIRECT') {
      return sorted;
    }
    return sorted.filter((u) => String(u.sector_id) === sectorFilter);
  }, [units, sectorFilter]);

  const handleSectorChange = (nextSector: string) => {
    setSectorFilter(nextSector);
    if (nextSector === 'DIRECT') {
      setUnitFilter('DIRECT');
      onClearUnitFilter();
      return;
    }
    if (unitFilter === 'DIRECT') {
      setUnitFilter('ALL');
    }
    if (
      nextSector !== 'ALL' &&
      unitFilter !== 'ALL' &&
      !units.some(
        (u) => String(u.id) === unitFilter && String(u.sector_id) === nextSector
      )
    ) {
      setUnitFilter('ALL');
      onClearUnitFilter();
    }
  };

  const handleUnitChange = (nextUnit: string) => {
    setUnitFilter(nextUnit);
    if (nextUnit === 'ALL') {
      onClearUnitFilter();
    }
  };

  useEffect(() => {
    setPage(1);
  }, [sectorFilter, unitFilter, statusFilter, modeFilter, debouncedSearch]);

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    const controller = new AbortController();
    let active = true;
    setFetching(true);

    const fetchEntries = async () => {
      try {
        const { data, error: rpcError } = await supabase
          .rpc('admin_list_entries', {
            p_code: adminCode,
            p_sector_filter: sectorFilter,
            p_unit_filter: unitFilter,
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
          onError(rpcError.message || 'Failed to load entries.');
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
          err instanceof Error ? err.message : 'Unable to load entries.'
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
    adminCode,
    sectorFilter,
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
    if (unitFilter === 'DIRECT') return 'Division Direct';
    return units.find((u) => String(u.id) === unitFilter)?.name ?? null;
  }, [unitFilter, units]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'admin_list_entries',
        {
          p_code: adminCode,
          p_sector_filter: sectorFilter,
          p_unit_filter: unitFilter,
          p_payment_status: statusFilter,
          p_payment_mode: modeFilter,
          p_search: debouncedSearch,
          p_page: 1,
          p_page_size: 10000,
        }
      );

      if (rpcError) {
        onError(rpcError.message || 'Failed to export entries.');
        return;
      }

      const res = data as PaginatedResponse<EntryItem> | null;
      const exportRows = res?.items ?? rows;
      exportToCsv(
        'wandoor_all_entries.csv',
        [
          'Date & Time',
          'Sector',
          'Unit',
          'Contributor Name',
          'Mobile Number',
          'Quantity (L)',
          'Rate (INR)',
          'Total Amount (INR)',
          'Payment Status',
          'Payment Mode',
        ],
        exportRows.map((entry) => [
          formatDateTime(entry.created_at),
          entry.sector_name ?? '',
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
      onError(err instanceof Error ? err.message : 'Unable to export entries.');
    } finally {
      setExporting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    setDeleting(true);
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_entry', {
        p_code: adminCode,
        p_entry_id: deletingEntry.id,
      });

      if (rpcError) {
        onError(rpcError.message || 'Failed to delete entry.');
        setDeleting(false);
        return;
      }

      setDeletingEntry(null);
      await onMutated('Entry deleted successfully');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to delete entry.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="relative z-20 glass-card rounded-2xl p-3.5 space-y-2.5">
        <div
          className={
            isDesktop
              ? 'flex items-center gap-2.5 flex-wrap'
              : 'flex flex-col gap-2.5'
          }
        >
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, mobile, or unit..."
              className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900 placeholder:text-ink-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear entries search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-plum-900 p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div
            className={
              isDesktop
                ? 'flex items-center gap-2 flex-wrap'
                : 'grid grid-cols-2 gap-2'
            }
          >
            <SelectDropdown
              value={sectorFilter}
              onChange={handleSectorChange}
              ariaLabel="Filter entries by sector"
              className={isDesktop ? 'w-40' : 'w-full'}
              options={[
                { value: 'ALL', label: 'All Sectors' },
                { value: 'DIRECT', label: 'Division Direct' },
                ...sectors.map((s) => ({
                  value: String(s.id),
                  label: s.name,
                })),
              ]}
            />

            <SelectDropdown
              value={unitFilter}
              onChange={handleUnitChange}
              ariaLabel="Filter entries by unit"
              className={isDesktop ? 'w-44' : 'w-full'}
              options={[
                { value: 'ALL', label: 'All Units' },
                { value: 'DIRECT', label: 'Division Direct' },
                ...availableUnits.map((u) => ({
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
              ariaLabel="Filter entries by payment status"
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
              ariaLabel="Filter entries by payment mode"
              className={isDesktop ? 'w-36' : 'w-full'}
              options={[
                { value: 'ALL', label: 'All Modes' },
                { value: 'CASH', label: 'Cash Handover' },
                { value: 'UPI', label: 'UPI' },
              ]}
            />
          </div>

          <div
            className={
              isDesktop ? 'flex items-center gap-2 ml-auto' : 'grid grid-cols-2 gap-2'
            }
          >
            <button
              type="button"
              onClick={onOpenAddOrder}
              className="glass-plum text-white hover:opacity-95 text-xs font-semibold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 transition-opacity shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Order
            </button>

            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={totalCount === 0 || exporting}
              className="glass-pill text-plum-900 hover:bg-white text-xs font-semibold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        {(initialUnitId !== 'ALL' || unitFilter !== 'ALL') && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setUnitFilter('ALL');
                setSectorFilter('ALL');
                onClearUnitFilter();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium glass-pill text-plum-900 hover:bg-white transition-colors"
            >
              <span>Unit: {selectedUnitName ?? `#${unitFilter}`}</span>
              <X className="w-3 h-3 text-ink-400" />
              <span>Clear filter</span>
            </button>
          </div>
        )}
      </div>

      {isDesktop ? (
        /* DESKTOP TABLE VIEW */
        <div
          className={`glass-table rounded-xl overflow-hidden transition-opacity ${
            fetching ? 'opacity-65' : ''
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="glass-table-head text-ink-600 text-xs uppercase tracking-wide border-b border-milk-border">
                  <th className="py-3 px-4 font-semibold">Time</th>
                  <th className="py-3 px-4 font-semibold">Unit / Sector</th>
                  <th className="py-3 px-4 font-semibold">Contributor</th>
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
              <tbody className="divide-y divide-milk-border/70">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 px-4 text-center text-sm text-ink-600"
                    >
                      {fetching
                        ? 'Loading entries...'
                        : 'No entries match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((entry) => {
                    const isDirect =
                      entry.is_division_direct || entry.unit_id == null;

                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-milk-100/60 transition-colors"
                      >
                        <td className="py-3 px-4 text-xs text-ink-600 whitespace-nowrap num">
                          {formatDateTime(entry.created_at)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isDirect ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-plum-100 text-plum-900 border border-plum-200">
                              Division Direct
                            </span>
                          ) : (
                            <>
                              <div className="font-medium text-plum-900">
                                {entry.unit_name ?? '-'}
                              </div>
                              <div className="text-xs text-ink-600">
                                {entry.sector_name ?? '-'}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-ink-900">
                            {entry.contributor_name}
                          </div>
                          <a
                            href={`tel:${entry.mobile_number}`}
                            className="text-xs text-plum-700 hover:underline num"
                          >
                            {entry.mobile_number}
                          </a>
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-plum-900 num whitespace-nowrap">
                          {formatQuantity(Number(entry.quantity) || 0)} L
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-plum-900 num whitespace-nowrap">
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
                              <div className="mr-1">
                                <InlinePaymentUpdater
                                  portal="ADMIN"
                                  authCode={adminCode}
                                  entryId={entry.id}
                                  onPaid={onMutated}
                                  onError={onError}
                                />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingEntry(entry)}
                              title="Edit entry"
                              aria-label={`Edit entry for ${entry.contributor_name}`}
                              className="p-1.5 rounded-lg text-ink-600 hover:text-plum-900 hover:bg-plum-100 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingEntry(entry)}
                              title="Delete entry"
                              aria-label={`Delete entry for ${entry.contributor_name}`}
                              className="p-1.5 rounded-lg text-ink-600 hover:text-vibrant-coral hover:bg-vibrant-coralSoft/60 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
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
            <div className="glass-card rounded-2xl p-8 text-center text-sm text-ink-600">
              {fetching
                ? 'Loading entries...'
                : 'No entries match the current filters.'}
            </div>
          ) : (
            rows.map((entry) => {
              const isDirect =
                entry.is_division_direct || entry.unit_id == null;

              return (
                <div
                  key={entry.id}
                  className="glass-card rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-plum-900 text-base leading-snug">
                        {entry.contributor_name}
                      </h3>
                      <a
                        href={`tel:${entry.mobile_number}`}
                        className="inline-flex items-center gap-1 text-xs text-plum-700 font-medium hover:underline num mt-0.5"
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
                        title="Edit entry"
                        aria-label={`Edit entry for ${entry.contributor_name}`}
                        className="p-2 rounded-xl glass-pill text-ink-600 hover:text-plum-900 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingEntry(entry)}
                        title="Delete entry"
                        aria-label={`Delete entry for ${entry.contributor_name}`}
                        className="p-2 rounded-xl glass-pill text-ink-600 hover:text-vibrant-coral transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-milk-border/70">
                    <div className="bg-milk-50 rounded-xl p-2.5 border border-milk-border/70">
                      <span className="text-[11px] text-ink-600 block">
                        Quantity
                      </span>
                      <span className="text-base font-bold text-plum-900 num">
                        {formatQuantity(Number(entry.quantity) || 0)} L
                      </span>
                    </div>
                    <div className="bg-milk-50 rounded-xl p-2.5 border border-milk-border/70">
                      <span className="text-[11px] text-ink-600 block">
                        Total Amount
                      </span>
                      <span className="text-base font-bold text-plum-900 num">
                        {formatCurrency(Number(entry.total_amount) || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs text-ink-600 pt-0.5">
                    {isDirect ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-plum-100 text-plum-900 border border-plum-200">
                        Division Direct
                      </span>
                    ) : (
                      <span className="font-medium text-ink-900 truncate max-w-[55%]">
                        {entry.unit_name}
                        {entry.sector_name ? ` • ${entry.sector_name}` : ''}
                      </span>
                    )}

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {entry.payment_status === 'UNPAID' && (
                        <InlinePaymentUpdater
                          portal="ADMIN"
                          authCode={adminCode}
                          entryId={entry.id}
                          compact
                          onPaid={onMutated}
                          onError={onError}
                        />
                      )}
                      <span className="text-[11px] num">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
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
        theme="admin"
        loading={fetching}
        isDesktop={isDesktop}
      />

      {editingEntry && (
        <EntryEditModal
          entry={editingEntry}
          adminCode={adminCode}
          isDesktop={isDesktop}
          onClose={() => setEditingEntry(null)}
          onSaved={() => onMutated('Entry updated successfully')}
        />
      )}

      {deletingEntry && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-entry-title"
          className={
            isDesktop
              ? 'fixed inset-0 z-50 bg-plum-950/35 backdrop-blur-sm flex items-center justify-center p-4'
              : 'fixed inset-0 z-50 bg-plum-950/35 backdrop-blur-sm flex items-end justify-center'
          }
        >
          <div
            className={
              isDesktop
                ? 'glass-card bg-white/95 max-w-md w-full rounded-2xl border border-milk-border p-6 shadow-2xl space-y-4'
                : 'glass-card bg-white/98 w-full max-w-xl rounded-t-2xl border-t border-milk-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl space-y-4'
            }
          >
            {!isDesktop && (
              <div className="w-10 h-1 rounded-full bg-milk-border mx-auto" />
            )}
            <div>
              <h2
                id="delete-entry-title"
                className="text-base font-semibold text-plum-900"
              >
                Delete Contribution Entry?
              </h2>
              <p className="text-xs text-ink-600 mt-1">
                This will soft-delete the entry and remove it from totals and
                leaderboards.
              </p>
            </div>

            <div className="glass-pill rounded-xl p-3.5 text-xs space-y-1">
              <div className="font-semibold text-ink-900">
                {deletingEntry.contributor_name}
              </div>
              <div className="text-ink-600">
                {deletingEntry.unit_name ?? 'Division Direct'} •{' '}
                <span className="num">
                  {formatQuantity(Number(deletingEntry.quantity) || 0)} L
                </span>{' '}
                •{' '}
                <span className="num font-medium text-plum-900">
                  {formatCurrency(Number(deletingEntry.total_amount) || 0)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-milk-border text-ink-600 hover:bg-milk-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-vibrant-coral hover:opacity-95 text-white disabled:opacity-50 transition-opacity shadow-sm"
              >
                {deleting ? 'Deleting...' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
