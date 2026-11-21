import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Download, Search, X } from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { supabase } from '../../lib/supabase';
import { PaginationBar } from '../PaginationBar';
import { SelectDropdown } from '../SelectDropdown';
import type {
  FilteredUnitTotals,
  PaginatedUnitsResponse,
  UnitSummaryRow,
} from '../../types';
import { exportToCsv } from '../../utils/csv';
import {
  calcSectorUnitSharePercent,
  formatCurrency,
  formatQuantity,
} from '../../utils/format';

interface SectorUnitsTabProps {
  isDesktop: boolean;
  sector: {
    id: number;
    name: string;
    login_code: string;
  };
  units: UnitSummaryRow[];
  sectorCode: string;
  refreshKey?: number;
  sectorTotalQuantity: number;
  onSelectUnitForEntries: (unitId: number) => void;
  onError?: (msg: string) => void;
}

type SortOption = 'highest' | 'lowest' | 'name';

export function SectorUnitsTab({
  isDesktop,
  sector,
  units,
  sectorCode,
  refreshKey = 0,
  sectorTotalQuantity,
  onSelectUnitForEntries,
  onError,
}: SectorUnitsTabProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sortBy, setSortBy] = useState<SortOption>('highest');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  const [rows, setRows] = useState<UnitSummaryRow[]>(() => units.slice(0, 15));
  const [totalCount, setTotalCount] = useState<number>(units.length);
  const [totalPages, setTotalPages] = useState<number>(
    Math.max(Math.ceil(units.length / 15), 1)
  );
  const [totals, setTotals] = useState<FilteredUnitTotals>(() =>
    units.reduce(
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
  }, [sortBy, debouncedSearch]);

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    let active = true;
    setFetching(true);

    const fetchSectorUnits = async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc(
          'sector_list_units',
          {
            p_code: sectorCode,
            p_search: debouncedSearch,
            p_sort: sortBy,
            p_page: page,
            p_page_size: pageSize,
          }
        );

        if (!active || seq !== requestSeqRef.current) return;

        if (rpcError) {
          onError?.(rpcError.message || 'Failed to load sector units.');
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
          err instanceof Error ? err.message : 'Unable to load sector units.'
        );
      } finally {
        if (active && seq === requestSeqRef.current) {
          setFetching(false);
        }
      }
    };

    void fetchSectorUnits();
    return () => {
      active = false;
    };
  }, [sectorCode, sortBy, debouncedSearch, page, pageSize, refreshKey, onError]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'sector_list_units',
        {
          p_code: sectorCode,
          p_search: debouncedSearch,
          p_sort: sortBy,
          p_page: 1,
          p_page_size: 10000,
        }
      );

      if (rpcError) {
        onError?.(rpcError.message || 'Failed to export sector units.');
        return;
      }

      const res = data as PaginatedUnitsResponse | null;
      const exportRows = res?.items ?? rows;
      exportToCsv(
        `sector_${sector.login_code}_units.csv`,
        [
          'Unit Name',
          'Unit Code',
          'Orders',
          'Quantity (L)',
          'Share of Sector (%)',
          'Cash (INR)',
          'UPI (INR)',
          'Grand Total (INR)',
        ],
        exportRows.map((row) => {
          const qty = Number(row.total_quantity) || 0;
          return [
            row.name,
            row.login_code,
            Number(row.total_entries) || 0,
            qty,
            Number(
              calcSectorUnitSharePercent(qty, sectorTotalQuantity).toFixed(1)
            ),
            Number(row.cash_amount) || 0,
            Number(row.upi_amount) || 0,
            Number(row.total_amount) || 0,
          ];
        })
      );
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : 'Unable to export sector units.'
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters Bar (NO Sector Dropdown) */}
      <div
        className={`relative z-20 glass-leaf-card rounded-2xl p-3.5 ${
          isDesktop ? 'flex items-center gap-3' : 'flex flex-col gap-2.5'
        }`}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-forest-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit or code..."
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-leaf-border bg-white/90 text-forest-950 placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear sector unit search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-forest-400 hover:text-forest-900 p-0.5 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className={isDesktop ? 'flex items-center gap-2' : 'grid grid-cols-1 gap-2'}>
          <SelectDropdown
            value={sortBy}
            onChange={(val) => setSortBy(val as SortOption)}
            ariaLabel="Sort units"
            className={isDesktop ? 'w-44' : 'w-full'}
            options={[
              { value: 'highest', label: 'Highest Quantity' },
              { value: 'lowest', label: 'Lowest Quantity' },
              { value: 'name', label: 'Unit Name (A–Z)' },
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

      {/* Filtered Total Bar */}
      {totalCount > 0 &&
        (isDesktop ? (
          <div className="glass-leaf-card rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-forest-700 border border-leaf-border/70 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-forest-950">Sector Filtered Total:</span>
              <span className="glass-leaf-pill px-2 py-0.5 rounded-full text-[11px] font-semibold text-forest-950">
                {totalCount} units
              </span>
              <span className="text-forest-400">•</span>
              <span className="num font-medium">
                {totals.total_entries} orders
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold num">
              <span>
                Quantity:{' '}
                <strong className="text-forest-950 font-bold">
                  {formatQuantity(totals.total_quantity)} L
                </strong>
              </span>
              <span className="text-forest-400/50">|</span>
              <span>
                Cash:{' '}
                <strong className="text-forest-950 font-bold">
                  {formatCurrency(totals.cash_amount)}
                </strong>
              </span>
              <span className="text-forest-400/50">|</span>
              <span>
                UPI:{' '}
                <strong className="text-forest-950 font-bold">
                  {formatCurrency(totals.upi_amount)}
                </strong>
              </span>
              <span className="text-forest-400/50">|</span>
              <span>
                Grand Total:{' '}
                <strong className="text-forest-950 text-sm font-extrabold">
                  {formatCurrency(totals.total_amount)}
                </strong>
              </span>
            </div>
          </div>
        ) : (
          <div className="glass-forest rounded-2xl p-4 text-white space-y-2 shadow-md">
            <div className="flex items-center justify-between text-xs text-leaf-200/80 uppercase font-medium">
              <span>Filtered Total ({totalCount} units)</span>
              <span className="num font-semibold">
                {totals.total_entries} orders
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-1 border-t border-leaf-200/20">
              <div>
                <span className="text-xs text-leaf-200/75 block">
                  Total Quantity
                </span>
                <span className="text-xl font-bold num text-white">
                  {formatQuantity(totals.total_quantity)} L
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-leaf-200/75 block">
                  Grand Total
                </span>
                <span className="text-xl font-bold num text-leaf-200">
                  {formatCurrency(totals.total_amount)}
                </span>
              </div>
            </div>
          </div>
        ))}

      {isDesktop ? (
        /* DESKTOP TABLE VIEW (NO Sector column) */
        <div
          className={`glass-leaf-table rounded-xl overflow-hidden transition-opacity ${
            fetching ? 'opacity-65' : ''
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="glass-leaf-head text-forest-700 text-xs uppercase tracking-wide border-b border-leaf-border">
                  <th className="py-3.5 px-5 font-semibold">Unit</th>
                  <th className="py-3.5 px-4 font-semibold text-right">
                    Orders
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
              <tbody className="divide-y divide-leaf-border/70">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 px-5 text-center text-sm text-forest-600"
                    >
                      {fetching
                        ? 'Loading units...'
                        : 'No units match your search filter.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isZero = row.total_entries === 0;
                    const share = calcSectorUnitSharePercent(
                      Number(row.total_quantity) || 0,
                      sectorTotalQuantity
                    );
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
                        aria-label={`View orders for ${row.name}`}
                        title={`View orders for ${row.name}`}
                        className="group cursor-pointer hover:bg-leaf-100/70 focus-visible:outline-none focus-visible:bg-forest-50/80 transition-colors"
                      >
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-forest-950">
                              {row.name}
                            </span>
                            <span className="bg-forest-100/90 text-forest-900 font-mono text-[11px] px-1.5 py-0.5 rounded font-medium">
                              {row.login_code}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right num ${
                            isZero ? 'text-forest-400' : 'text-forest-950'
                          }`}
                        >
                          {row.total_entries}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right num font-semibold ${
                            isZero ? 'text-forest-400 font-normal' : 'text-forest-950'
                          }`}
                        >
                          <div>
                            {formatQuantity(Number(row.total_quantity) || 0)} L
                          </div>
                          <div className="text-[11px] font-normal text-forest-600">
                            {share.toFixed(1)}% of sector
                          </div>
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right num ${
                            isZero ? 'text-forest-400' : 'text-forest-950'
                          }`}
                        >
                          {formatCurrency(Number(row.cash_amount) || 0)}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right num ${
                            isZero ? 'text-forest-400' : 'text-forest-950'
                          }`}
                        >
                          {formatCurrency(Number(row.upi_amount) || 0)}
                        </td>
                        <td
                          className={`py-3.5 px-5 text-right num font-semibold whitespace-nowrap ${
                            isZero ? 'text-forest-400 font-normal' : 'text-forest-950'
                          }`}
                        >
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <span>
                              {formatCurrency(Number(row.total_amount) || 0)}
                            </span>
                            <ChevronRight
                              className="w-3.5 h-3.5 text-forest-400 group-hover:text-forest-950 group-hover:translate-x-0.5 transition-all"
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
                  <tr className="glass-leaf-head font-semibold text-forest-950 border-t border-leaf-border">
                    <td className="py-3.5 px-5">
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
        /* MOBILE / TABLET STACKED TOUCH CARDS (NO Sector label) */
        <div
          className={`space-y-3 transition-opacity ${
            fetching ? 'opacity-65' : ''
          }`}
        >
          {rows.length === 0 ? (
            <div className="glass-leaf-card rounded-2xl p-8 text-center text-sm text-forest-600">
              {fetching
                ? 'Loading units...'
                : 'No units match your search filter.'}
            </div>
          ) : (
            rows.map((row) => {
              const isZero = row.total_entries === 0;
              const share = calcSectorUnitSharePercent(
                Number(row.total_quantity) || 0,
                sectorTotalQuantity
              );
              return (
                <div
                  key={row.id}
                  className="glass-leaf-card rounded-2xl p-4 space-y-3"
                >
                  {/* Header: Unit Name + Login Code Pill + Orders Count */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-forest-950 text-base">
                          {row.name}
                        </span>
                        <span className="bg-forest-100 text-forest-900 font-mono text-xs px-2 py-0.5 rounded-md font-semibold">
                          {row.login_code}
                        </span>
                      </div>
                      <span className="text-xs text-forest-600 block mt-0.5 num">
                        {row.total_entries} orders
                      </span>
                    </div>
                  </div>

                  {/* 3-col Qty | Cash | UPI Strip */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-leaf-border/70">
                    <div className="bg-leaf-50 rounded-xl p-2 border border-leaf-border/70">
                      <span className="text-[11px] text-forest-600 block">
                        Qty
                      </span>
                      <span
                        className={`text-sm font-bold num block ${
                          isZero ? 'text-forest-400 font-normal' : 'text-forest-950'
                        }`}
                      >
                        {formatQuantity(Number(row.total_quantity) || 0)} L
                      </span>
                      <span className="text-[10px] text-forest-600 num block">
                        {share.toFixed(1)}% of sector
                      </span>
                    </div>
                    <div className="bg-leaf-50 rounded-xl p-2 border border-leaf-border/70">
                      <span className="text-[11px] text-forest-600 block">
                        Cash
                      </span>
                      <span
                        className={`text-sm font-bold num ${
                          isZero ? 'text-forest-400 font-normal' : 'text-forest-950'
                        }`}
                      >
                        {formatCurrency(Number(row.cash_amount) || 0)}
                      </span>
                    </div>
                    <div className="bg-leaf-50 rounded-xl p-2 border border-leaf-border/70">
                      <span className="text-[11px] text-forest-600 block">
                        UPI
                      </span>
                      <span
                        className={`text-sm font-bold num ${
                          isZero ? 'text-forest-400 font-normal' : 'text-forest-950'
                        }`}
                      >
                        {formatCurrency(Number(row.upi_amount) || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Footer: Grand Total + View Orders Button */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div>
                      <span className="text-[11px] text-forest-600 block">
                        Grand Total
                      </span>
                      <span
                        className={`text-base font-bold num ${
                          isZero ? 'text-forest-400 font-normal' : 'text-forest-950'
                        }`}
                      >
                        {formatCurrency(Number(row.total_amount) || 0)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectUnitForEntries(row.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-forest-900 bg-forest-100/80 hover:bg-forest-100 border border-forest-200 px-3 py-2 rounded-xl transition-colors"
                    >
                      View Orders
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
        theme="sector"
        loading={fetching}
        isDesktop={isDesktop}
      />
    </div>
  );
}
