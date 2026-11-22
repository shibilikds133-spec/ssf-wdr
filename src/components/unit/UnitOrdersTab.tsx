import { startTransition, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  MessageCircle,
  Phone,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { supabase } from '../../lib/supabase';
import type {
  AppSettings,
  EntryItem,
  PaginatedResponse,
  PaymentMode,
  PaymentStatus,
} from '../../types';
import { exportToCsv } from '../../utils/csv';
import {
  formatCurrency,
  formatDateTime,
  formatQuantity,
} from '../../utils/format';
import { buildWhatsAppReceiptUrl } from '../../utils/whatsapp';
import { PaginationBar } from '../PaginationBar';
import { SelectDropdown } from '../SelectDropdown';

interface UnitOrdersTabProps {
  isDesktop: boolean;
  unit: {
    name: string;
    login_code: string;
    sector_name: string;
  };
  settings: AppSettings;
  entries: EntryItem[];
  unitCode: string;
  refreshKey?: number;
  onOpenQuickOrder: () => void;
  onMarkPaid: (entry: EntryItem) => void;
  onError?: (msg: string) => void;
}

export function UnitOrdersTab({
  isDesktop,
  unit,
  settings,
  entries,
  unitCode,
  refreshKey = 0,
  onOpenQuickOrder,
  onMarkPaid,
  onError,
}: UnitOrdersTabProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 100);
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

  useEffect(() => {
    setPage(1);
  }, [statusFilter, modeFilter, debouncedSearch]);

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    const controller = new AbortController();
    let active = true;
    setFetching(true);

    const fetchOrders = async () => {
      try {
        const { data, error: rpcError } = await supabase
          .rpc('unit_list_entries', {
            p_code: unitCode,
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
          onError?.(rpcError.message || 'Failed to load unit orders.');
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
        onError?.(
          err instanceof Error ? err.message : 'Unable to load unit orders.'
        );
      } finally {
        if (active && seq === requestSeqRef.current) {
          setFetching(false);
        }
      }
    };

    void fetchOrders();
    return () => {
      active = false;
      controller.abort();
    };
  }, [unitCode, statusFilter, modeFilter, debouncedSearch, page, pageSize, refreshKey, onError]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'unit_list_entries',
        {
          p_code: unitCode,
          p_payment_status: statusFilter,
          p_payment_mode: modeFilter,
          p_search: debouncedSearch,
          p_page: 1,
          p_page_size: 10000,
        }
      );

      if (rpcError) {
        onError?.(rpcError.message || 'Failed to export delivery sheet.');
        return;
      }

      const res = data as PaginatedResponse<EntryItem> | null;
      const exportRows = res?.items ?? rows;
      exportToCsv(
        `unit_${unit.login_code}_orders.csv`,
        [
          'Date & Time',
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
          unit.name,
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
      onError?.(
        err instanceof Error ? err.message : 'Unable to export delivery sheet.'
      );
    } finally {
      setExporting(false);
    }
  };

  const openWhatsAppReceipt = (entry: EntryItem) => {
    const url = buildWhatsAppReceiptUrl({
      contributorName: entry.contributor_name,
      mobileNumber: entry.mobile_number,
      unitName: unit.name,
      quantity: Number(entry.quantity) || 0,
      totalAmount: Number(entry.total_amount) || 0,
      paymentStatus: entry.payment_status,
      paymentMode: entry.payment_mode,
      challengeTitle: settings.challenge_title,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="relative z-20 glass-cream-card rounded-2xl p-3.5 space-y-2.5">
        <div
          className={
            isDesktop ? 'flex items-center gap-3' : 'flex flex-col gap-2.5'
          }
        >
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#6B5449]/65 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer name or mobile..."
              className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-[#E5DEC9] bg-[#FBF8EE] text-[#261812] placeholder:text-[#6B5449]/60 focus:bg-white focus:border-[#F46A30]/60 focus:outline-none transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear orders search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B5449]/65 hover:text-[#261812] p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div
            className={
              isDesktop ? 'flex items-center gap-2' : 'grid grid-cols-2 gap-2'
            }
          >
            <SelectDropdown
              value={statusFilter}
              onChange={(val) =>
                setStatusFilter(val as 'ALL' | PaymentStatus)
              }
              ariaLabel="Filter orders by payment status"
              className={isDesktop ? 'w-36' : 'w-full'}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'PAID', label: 'Paid' },
                { value: 'UNPAID', label: 'Unpaid' },
              ]}
            />

            <SelectDropdown
              value={modeFilter}
              onChange={(val) => setModeFilter(val as 'ALL' | PaymentMode)}
              ariaLabel="Filter orders by payment mode"
              className={isDesktop ? 'w-40' : 'w-full'}
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
              onClick={() => void handleExport()}
              disabled={totalCount === 0 || exporting}
              className="glass-cream-pill text-[#261812] hover:bg-white text-xs font-semibold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Exporting...' : 'Export Delivery CSV'}
            </button>

            <button
              type="button"
              onClick={onOpenQuickOrder}
              disabled={!settings.is_challenge_open}
              className="glass-orange text-white hover:opacity-95 text-xs font-semibold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-45 transition-opacity shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Quick Order
            </button>
          </div>
        </div>
      </div>

      {isDesktop ? (
        /* DESKTOP TABLE VIEW */
        <div
          className={`glass-cream-table rounded-xl overflow-hidden transition-opacity ${
            fetching ? 'opacity-65' : ''
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="glass-cream-head text-[#6B5449] text-xs uppercase tracking-wide border-b border-[#E5DEC9]">
                  <th className="py-3 px-4 font-semibold">Date &amp; Time</th>
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-4 font-semibold">Mobile</th>
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
              <tbody className="divide-y divide-[#E5DEC9]/75">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 px-4 text-center text-sm text-[#6B5449]"
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
                      className="hover:bg-[#FBF8EE] transition-colors"
                    >
                      <td className="py-3 px-4 text-xs text-[#6B5449] whitespace-nowrap num">
                        {formatDateTime(entry.created_at)}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#261812] whitespace-nowrap">
                        {entry.contributor_name}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <a
                          href={`tel:${entry.mobile_number}`}
                          className="text-xs text-[#C94514] hover:underline num"
                        >
                          {entry.mobile_number}
                        </a>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[#261812] num whitespace-nowrap">
                        {formatQuantity(Number(entry.quantity) || 0)} L
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[#261812] num whitespace-nowrap">
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
                        <div className="inline-flex items-center gap-1.5">
                          {entry.payment_status === 'UNPAID' && (
                            <button
                              type="button"
                              onClick={() => onMarkPaid(entry)}
                              className="px-2.5 py-1 rounded-lg glass-orange text-white text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Mark as Paid
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openWhatsAppReceipt(entry)}
                            title="Resend WhatsApp Receipt"
                            aria-label={`Send WhatsApp receipt to ${entry.contributor_name}`}
                            className="p-1.5 rounded-lg bg-vibrant-tealSoft text-vibrant-teal hover:bg-vibrant-teal hover:text-white transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
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
        /* MOBILE / TABLET STACKED ORDER CARDS */
        <div
          className={`space-y-3 transition-opacity ${
            fetching ? 'opacity-65' : ''
          }`}
        >
          {rows.length === 0 ? (
            <div className="glass-cream-card rounded-2xl p-8 text-center text-sm text-[#6B5449]">
              {fetching
                ? 'Loading orders...'
                : 'No orders match the current filters.'}
            </div>
          ) : (
            rows.map((entry) => (
              <div
                key={entry.id}
                className="glass-cream-card rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-[#261812] text-base leading-snug">
                      {entry.contributor_name}
                    </h3>
                    <a
                      href={`tel:${entry.mobile_number}`}
                      className="inline-flex items-center gap-1 text-xs text-[#C94514] font-medium hover:underline num mt-0.5"
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
                        {entry.payment_mode === 'CASH'
                          ? 'Cash Handover'
                          : 'UPI'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E5DEC9]">
                  <div className="unit-inner-card rounded-xl p-2.5">
                    <span className="text-[11px] text-[#6B5449] block">
                      Quantity
                    </span>
                    <span className="text-base font-bold text-[#261812] num">
                      {formatQuantity(Number(entry.quantity) || 0)} L
                    </span>
                  </div>
                  <div className="unit-inner-card rounded-xl p-2.5">
                    <span className="text-[11px] text-[#6B5449] block">
                      Total Amount
                    </span>
                    <span className="text-base font-bold text-[#261812] num">
                      {formatCurrency(Number(entry.total_amount) || 0)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[11px] text-[#6B5449] num">
                    {formatDateTime(entry.created_at)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {entry.payment_status === 'UNPAID' && (
                      <button
                        type="button"
                        onClick={() => onMarkPaid(entry)}
                        className="px-3 py-1.5 rounded-xl glass-orange text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark as Paid
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openWhatsAppReceipt(entry)}
                      className="p-2 rounded-xl bg-vibrant-tealSoft text-vibrant-teal"
                      aria-label={`Send WhatsApp receipt to ${entry.contributor_name}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
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
        theme="unit"
        loading={fetching}
        isDesktop={isDesktop}
      />
    </div>
  );
}
