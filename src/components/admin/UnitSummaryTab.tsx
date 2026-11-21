import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Download, Search, X } from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { supabase } from '../../lib/supabase';
import { PaginationBar } from '../PaginationBar';
import { SelectDropdown } from '../SelectDropdown';
import type {
  FilteredUnitTotals,
  PaginatedUnitsResponse,
  SectorOption,
  UnitSummaryRow,
} from '../../types';
import { exportToCsv } from '../../utils/csv';
import {
  calcLimitSharePercent,
  formatCurrency,
  formatQuantity,
} from '../../utils/format';

interface UnitSummaryTabProps {
  isDesktop: boolean;
  unitSummaries: UnitSummaryRow[];
  sectors: SectorOption[];
  divisionLimit: number;
  adminCode: string;
  refreshKey?: number;
  onSelectUnitForEntries: (unitId: number) => void;
  onError?: (msg: string) => void;
}

type SortOption = 'highest' | 'lowest' | 'name';

export function UnitSummaryTab({
  isDesktop,
  unitSummaries,
  sectors,
  divisionLimit,
  adminCode,
  refreshKey = 0,
  onSelectUnitForEntries,
  onError,
}: UnitSummaryTabProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('highest');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  const [rows, setRows] = useState<UnitSummaryRow[]>(() =>
    unitSummaries.slice(0, 15)
  );
  const [totalCount, setTotalCount] = useState<number>(unitSummaries.length);
  const [totalPages, setTotalPages] = useState<number>(
    Math.max(Math.ceil(unitSummaries.length / 15), 1)
  );
  const [totals, setTotals] = useState<FilteredUnitTotals>(() =>
    unitSummaries.reduce(
      (acc, row) => {
        acc.total_entries += Number(row.total_entries) || 0;
        acc.total_quantity += Number(row.total_quantity) || 0;
        acc.cash_amount += Number(row.cash_amount) || 0;
        acc.upi_amount += Number(row.upi_amount) || 0;
        acc.unpaid_amount += Number(row.unpaid_amount) || 0;
        acc.total_amount += Number(row.total_amount) || 0;
        return acc;
      },
      {
        total_entries: 0,
        total_quantity: 0,
        cash_amount: 0,
        upi_amount: 0,
        unpaid_amount: 0,
        total_amount: 0,
      }
    )
  );
  const [fetching, setFetching] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [sectorFilter, sortBy, debouncedSearch]);

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    let active = true;
    setFetching(true);

    const fetchUnits = async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc(
          'admin_list_units',
          {
            p_code: adminCode,
            p_sector_id:
              sectorFilter === 'ALL' ? null : Number(sectorFilter),
            p_search: debouncedSearch,
            p_sort: sortBy,
            p_page: page,
            p_page_size: pageSize,
          }
        );

        if (!active || seq !== requestSeqRef.current) return;

        if (rpcError) {
          onError?.(rpcError.message || 'Failed to load units summary.');
          return;
        }

        const res = data as PaginatedUnitsResponse | null;
        if (!res) return;

        setRows(res.items ?? []);
        setTotalCount(Number(res.total_count) || 0);
        setTotalPages(Math.max(Number(res.total_pages) || 1, 1));
        if (typeof res.page === 'number' && res.page !== page) {
          setPage(res.page);
        }
        if (res.totals) {
          setTotals({
            total_entries: Number(res.totals.total_entries) || 0,
            total_quantity: Number(res.totals.total_quantity) || 0,
            cash_amount: Number(res.totals.cash_amount) || 0,
            upi_amount: Number(res.totals.upi_amount) || 0,
            unpaid_amount: Number(res.totals.unpaid_amount) || 0,
            total_amount: Number(res.totals.total_amount) || 0,
          });
        }
      } catch (err) {
        if (!active || seq !== requestSeqRef.current) return;
        onError?.(
          err instanceof Error ? err.message : 'Unable to load units summary.'
        );
      } finally {
        if (active && seq === requestSeqRef.current) {
          setFetching(false);
        }
      }
    };

    void fetchUnits();
    return () => {
      active = false;
    };
  }, [
    adminCode,
    sectorFilter,
    sortBy,
    debouncedSearch,
    page,
    pageSize,
    refreshKey,
    onError,
  ]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_list_units', {
        p_code: adminCode,
        p_sector_id: sectorFilter === 'ALL' ? null : Number(sectorFilter),
        p_search: debouncedSearch,
        p_sort: sortBy,
        p_page: 1,
        p_page_size: 10000,
      });

      if (rpcError) {
        onError?.(rpcError.message || 'Failed to export unit summary.');
        return;
      }

      const res = data as PaginatedUnitsResponse | null;
      const exportRows = res?.items ?? rows;
      exportToCsv(
        'wandoor_unit_summary.csv',
        [
          'Unit Name',
          'Unit Code',
          'Sector',
          'Entries',
          'Quantity (L)',
          'Cash (INR)',
          'UPI (INR)',
          'Grand Total (INR)',
        ],
        exportRows.map((row) => [
          row.name,
          row.login_code,
          row.sector_name ?? '',
          Number(row.total_entries) || 0,
          Number(row.total_quantity) || 0,
          Number(row.cash_amount) || 0,
          Number(row.upi_amount) || 0,
          Number(row.total_amount) || 0,
        ])
      );
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : 'Unable to export unit summary.'
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div
        className={`relative z-20 glass-card rounded-2xl p-3.5 ${
          isDesktop
            ? 'flex items-center gap-3'
            : 'flex flex-col gap-2.5'
        }`}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit or code..."
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900 placeholder:text-ink-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear unit search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-plum-900 p-0.5 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className={isDesktop ? 'flex items-center gap-2' : 'grid grid-cols-2 gap-2'}>
          <SelectDropdown
            value={sectorFilter}
            onChange={setSectorFilter}
            ariaLabel="Filter by sector"
            className={isDesktop ? 'w-48' : 'w-full'}
            options={[
              { value: 'ALL', label: 'All Sectors' },
              ...sectors.map((s) => ({
                value: String(s.id),
                label: s.name,
              })),
            ]}
          />

          <SelectDropdown
            value={sortBy}
            onChange={(val) => setSortBy(val as SortOption)}
            ariaLabel="Sort units"
            className={isDesktop ? 'w-44' : 'w-full'}
            options={[
              { value: 'highest', label: 'Highest Quantity' },
              { value: 'lowest', label: 'Lowest Quantity' },
              { value: 'name', label: 'Name (A–Z)' },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={totalCount === 0 || exporting}
          className={`${
            isDesktop ? 'ml-auto' : 'w-full'
          } glass-plum text-white hover:opacity-95 text-xs font-medium px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all shadow-sm`}
        >
          <Download className="w-3.5 h-3.5" />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Filtered Total Bar (Right below the Export CSV card) */}
      {totalCount > 0 &&
        (isDesktop ? (
          <div className="glass-card rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-ink-600 border border-milk-border/70 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-plum-900">Filtered Total:</span>
              <span className="glass-pill px-2 py-0.5 rounded-full text-[11px] font-semibold text-plum-900">
                {totalCount} units
              </span>
              <span className="text-ink-400">•</span>
              <span className="num font-medium">
                {totals.total_entries} entries
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold num">
              <span>
                Quantity:{' '}
                <strong className="text-plum-900 font-bold">
                  {formatQuantity(totals.total_quantity)} L
                </strong>
              </span>
              <span className="text-ink-400/50">|</span>
              <span>
                Cash:{' '}
                <strong className="text-ink-900 font-bold">
                  {formatCurrency(totals.cash_amount)}
                </strong>
              </span>
              <span className="text-ink-400/50">|</span>
              <span>
                UPI:{' '}
                <strong className="text-ink-900 font-bold">
                  {formatCurrency(totals.upi_amount)}
                </strong>
              </span>
              <span className="text-ink-400/50">|</span>
              <span>
                Grand Total:{' '}
                <strong className="text-plum-900 text-sm font-extrabold">
                  {formatCurrency(totals.total_amount)}
                </strong>
              </span>
            </div>
          </div>
        ) : (
          <div className="glass-plum rounded-2xl p-4 text-white space-y-2 shadow-md">
            <div className="flex items-center justify-between text-xs text-milk-200/80 uppercase font-medium">
              <span>Filtered Total ({totalCount} units)</span>
              <span className="num font-semibold">
                {totals.total_entries} entries
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-1 border-t border-milk-200/20">
              <div>
                <span className="text-xs text-milk-200/75 block">
                  Total Quantity
                </span>
                <span className="text-xl font-bold num text-white">
                  {formatQuantity(totals.total_quantity)} L
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-milk-200/75 block">
                  Grand Total
                </span>
                <span className="text-xl font-bold num text-milk-200">
                  {formatCurrency(totals.total_amount)}
                </span>
              </div>
            </div>
          </div>
        ))}

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
                  <th className="py-3.5 px-5 font-semibold">Unit</th>
                  <th className="py-3.5 px-4 font-semibold">Sector</th>
                  <th className="py-3.5 px-4 font-semibold text-right">
                    Entries
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-right">
                    Quantity (L)
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-right">Cash</th>
                  <th className="py-3.5 px-4 font-semibold text-right">UPI</th>
                  <th className="py-3.5 pl-4 pr-10 font-semibold text-right">
                    Grand Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-milk-border/70">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 px-5 text-center text-sm text-ink-600"
                    >
                      {fetching
                        ? 'Loading units...'
                        : 'No units match your search or sector filter.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isZero = row.total_entries === 0;
                    return (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectUnitForEntries(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectUnitForEntries(row.id);
                          }
                        }}
                        aria-label={`View entries for ${row.name}`}
                        title={`View entries for ${row.name}`}
                        className="group cursor-pointer hover:bg-milk-100/70 focus-visible:outline-none focus-visible:bg-plum-50/80 transition-colors"
                      >
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-plum-900">
                              {row.name}
                            </span>
                            <span className="bg-plum-100/80 text-plum-900 font-mono text-[11px] px-1.5 py-0.5 rounded font-medium">
                              {row.login_code}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-ink-600 whitespace-nowrap">
                          {row.sector_name ?? '-'}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right num ${
                            isZero ? 'text-ink-400' : 'text-ink-900'
                          }`}
                        >
                          {row.total_entries}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right num font-semibold ${
                            isZero ? 'text-ink-400 font-normal' : 'text-plum-900'
                          }`}
                        >
                          <div>
                            {formatQuantity(Number(row.total_quantity) || 0)} L
                          </div>
                          <div className="text-[11px] font-normal text-ink-600">
                            {calcLimitSharePercent(
                              Number(row.total_quantity) || 0,
                              divisionLimit
                            ).toFixed(1)}
                            % of limit
                          </div>
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right num ${
                            isZero ? 'text-ink-400' : 'text-ink-900'
                          }`}
                        >
                          {formatCurrency(Number(row.cash_amount) || 0)}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right num ${
                            isZero ? 'text-ink-400' : 'text-ink-900'
                          }`}
                        >
                          {formatCurrency(Number(row.upi_amount) || 0)}
                        </td>
                        <td
                          className={`py-3.5 px-5 text-right num font-semibold whitespace-nowrap ${
                            isZero ? 'text-ink-400 font-normal' : 'text-plum-900'
                          }`}
                        >
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <span>
                              {formatCurrency(Number(row.total_amount) || 0)}
                            </span>
                            <ChevronRight
                              className="w-3.5 h-3.5 text-ink-400 group-hover:text-plum-900 group-hover:translate-x-0.5 transition-all"
                              aria-hidden="true"
                            />
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {totalCount > 0 && (
                <tfoot>
                  <tr className="glass-table-head font-semibold text-plum-900 border-t border-milk-border">
                    <td className="py-3.5 px-5" colSpan={2}>
                      Filtered Total ({totalCount} units)
                    </td>
                    <td className="py-3.5 px-4 text-right num">
                      {totals.total_entries}
                    </td>
                    <td className="py-3.5 px-4 text-right num">
                      {formatQuantity(totals.total_quantity)} L
                    </td>
                    <td className="py-3.5 px-4 text-right num">
                      {formatCurrency(totals.cash_amount)}
                    </td>
                    <td className="py-3.5 px-4 text-right num">
                      {formatCurrency(totals.upi_amount)}
                    </td>
                    <td className="py-3.5 pl-4 pr-10 text-right num">
                      {formatCurrency(totals.total_amount)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        /* MOBILE / TABLET STACKED TOUCH CARDS */
        <div
          className={`space-y-3 transition-opacity ${
            fetching ? 'opacity-65' : ''
          }`}
        >
          {rows.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-sm text-ink-600">
              {fetching
                ? 'Loading units...'
                : 'No units match your search or sector filter.'}
            </div>
          ) : (
            rows.map((row) => {
              const isZero = row.total_entries === 0;
              return (
                <div
                  key={row.id}
                  className="glass-card rounded-2xl p-4 space-y-3"
                >
                  {/* Header: Unit Name + Login Code Pill + Sector */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-plum-900 text-base">
                          {row.name}
                        </span>
                        <span className="bg-plum-100 text-plum-900 font-mono text-xs px-2 py-0.5 rounded-md font-semibold">
                          {row.login_code}
                        </span>
                      </div>
                      <span className="text-xs text-ink-600 block mt-0.5">
                        {row.sector_name ?? 'No Sector'} •{' '}
                        <span className="num">{row.total_entries} entries</span>
                      </span>
                    </div>
                  </div>

                  {/* 3-col Qty | Cash | UPI Strip */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-milk-border/70">
                    <div className="bg-milk-50 rounded-xl p-2 border border-milk-border/70">
                      <span className="text-[11px] text-ink-600 block">
                        Qty
                      </span>
                      <span
                        className={`text-sm font-bold num block ${
                          isZero ? 'text-ink-400 font-normal' : 'text-plum-900'
                        }`}
                      >
                        {formatQuantity(Number(row.total_quantity) || 0)} L
                      </span>
                      <span className="text-[10px] text-ink-600 num block">
                        {calcLimitSharePercent(
                          Number(row.total_quantity) || 0,
                          divisionLimit
                        ).toFixed(1)}
                        % of limit
                      </span>
                    </div>
                    <div className="bg-milk-50 rounded-xl p-2 border border-milk-border/70">
                      <span className="text-[11px] text-ink-600 block">
                        Cash
                      </span>
                      <span
                        className={`text-sm font-bold num ${
                          isZero ? 'text-ink-400 font-normal' : 'text-ink-900'
                        }`}
                      >
                        {formatCurrency(Number(row.cash_amount) || 0)}
                      </span>
                    </div>
                    <div className="bg-milk-50 rounded-xl p-2 border border-milk-border/70">
                      <span className="text-[11px] text-ink-600 block">
                        UPI
                      </span>
                      <span
                        className={`text-sm font-bold num ${
                          isZero ? 'text-ink-400 font-normal' : 'text-ink-900'
                        }`}
                      >
                        {formatCurrency(Number(row.upi_amount) || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Footer: Grand Total + View Entries Button */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div>
                      <span className="text-[11px] text-ink-600 block">
                        Grand Total
                      </span>
                      <span
                        className={`text-base font-bold num ${
                          isZero ? 'text-ink-400 font-normal' : 'text-plum-900'
                        }`}
                      >
                        {formatCurrency(Number(row.total_amount) || 0)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectUnitForEntries(row.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-plum-900 bg-plum-100/80 hover:bg-plum-100 border border-plum-200 px-3 py-2 rounded-xl transition-colors"
                    >
                      View Entries
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
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
        pageSizeOptions={[10, 15, 25, 50]}
        theme="admin"
        loading={fetching}
        isDesktop={isDesktop}
      />
    </div>
  );
}
