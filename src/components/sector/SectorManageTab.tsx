import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Lock,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { supabase } from '../../lib/supabase';
import type {
  AppSettings,
  PaginatedUnitsResponse,
  PasswordResetRequest,
  UnitSummaryRow,
} from '../../types';
import {
  downloadSampleSectorUnitsCsv,
  parseSectorUnitsCsv,
} from '../../utils/csv';
import { formatQuantity } from '../../utils/format';
import {
  blockNegativeNumericKeys,
  sanitizePositiveInteger,
} from '../../utils/inputGuards';
import { BrandText } from '../BrandText';
import { PaginationBar } from '../PaginationBar';
import { PushNotificationSettingsCard } from '../PushNotificationSettingsCard';
import { SectorCredentialsSection } from './SectorCredentialsSection';

interface SectorManageTabProps {
  isDesktop: boolean;
  sector: {
    id: number;
    name: string;
    login_code: string;
  };
  settings: AppSettings;
  units: UnitSummaryRow[];
  pendingResetRequests?: PasswordResetRequest[];
  sectorCode: string;
  refreshKey?: number;
  onMutated: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}

export function SectorManageTab({
  isDesktop,
  sector,
  settings,
  units,
  pendingResetRequests = [],
  sectorCode,
  refreshKey = 0,
  onMutated,
  onError,
}: SectorManageTabProps) {
  // Card 1: Quick Add / Rename Unit
  const [unitName, setUnitName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [savingUnit, setSavingUnit] = useState(false);

  // Card 2: Bulk CSV Import
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvRows, setCsvRows] = useState<
    { unit_name: string; unit_code: string }[]
  >([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [importingCsv, setImportingCsv] = useState(false);

  // Card 3: Directory actions & server-side search/pagination
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDeleteUnitId, setConfirmDeleteUnitId] = useState<number | null>(
    null
  );
  const [deletingUnitId, setDeletingUnitId] = useState<number | null>(null);
  const [dirSearch, setDirSearch] = useState('');
  const debouncedDirSearch = useDebouncedValue(dirSearch, 100);
  const [dirPage, setDirPage] = useState<number>(1);
  const [dirPageSize, setDirPageSize] = useState<number>(10);
  const [dirRows, setDirRows] = useState<UnitSummaryRow[]>(() =>
    units.slice(0, 10)
  );
  const [dirTotalCount, setDirTotalCount] = useState<number>(units.length);
  const [dirTotalPages, setDirTotalPages] = useState<number>(
    Math.max(Math.ceil(units.length / 10), 1)
  );
  const [dirFetching, setDirFetching] = useState<boolean>(false);
  const dirReqSeqRef = useRef(0);

  // Mobile accordion state (all cards collapsed by default)
  const [mobileExpandedCard, setMobileExpandedCard] = useState<
    'credentials' | 'quick' | 'csv' | 'directory' | 'rules' | null
  >(null);

  const toggleMobileCard = (
    card: 'credentials' | 'quick' | 'csv' | 'directory' | 'rules'
  ) => {
    setMobileExpandedCard((prev) => (prev === card ? null : card));
  };

  useEffect(() => {
    setDirPage(1);
  }, [debouncedDirSearch]);

  useEffect(() => {
    const seq = ++dirReqSeqRef.current;
    const controller = new AbortController();
    let active = true;
    setDirFetching(true);

    const fetchDirUnits = async () => {
      try {
        const { data, error: rpcError } = await supabase
          .rpc('sector_list_units', {
            p_code: sectorCode,
            p_search: debouncedDirSearch,
            p_sort: 'code',
            p_page: dirPage,
            p_page_size: dirPageSize,
          })
          .abortSignal(controller.signal);

        if (!active || seq !== dirReqSeqRef.current) return;

        if (rpcError) {
          if (controller.signal.aborted) return;
          onError(rpcError.message || 'Failed to load sector directory.');
          return;
        }

        const res = data as PaginatedUnitsResponse | null;
        if (!res) return;

        startTransition(() => {
          setDirRows(res.items ?? []);
          setDirTotalCount(Number(res.total_count) || 0);
          setDirTotalPages(Math.max(Number(res.total_pages) || 1, 1));
          if (typeof res.page === 'number' && res.page !== dirPage) {
            setDirPage(res.page);
          }
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!active || seq !== dirReqSeqRef.current) return;
        onError(
          err instanceof Error
            ? err.message
            : 'Unable to load sector directory.'
        );
      } finally {
        if (active && seq === dirReqSeqRef.current) {
          setDirFetching(false);
        }
      }
    };

    void fetchDirUnits();
    return () => {
      active = false;
      controller.abort();
    };
  }, [sectorCode, debouncedDirSearch, dirPage, dirPageSize, refreshKey, onError]);

  const handleSaveUnit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanName = unitName.trim();
    const cleanCode = unitCode.trim().toUpperCase();

    if (!cleanName) {
      onError('Unit name is required.');
      return;
    }
    if (!cleanCode) {
      onError('Unit login code is required.');
      return;
    }

    setSavingUnit(true);
    try {
      const { error: rpcError } = await supabase.rpc('sector_upsert_unit', {
        p_code: sectorCode,
        p_unit_name: cleanName,
        p_unit_code: cleanCode,
        p_contact_phone: contactPhone.trim(),
      });

      if (rpcError) {
        onError(rpcError.message || 'Failed to save unit.');
        return;
      }

      setUnitName('');
      setUnitCode('');
      setContactPhone('');
      await onMutated(`Unit ${cleanCode} saved successfully`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save unit.');
    } finally {
      setSavingUnit(false);
    }
  };

  const handleCsvFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setCsvRows([]);
      setCsvErrors([]);
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseSectorUnitsCsv(text);
      setCsvRows(parsed.rows);
      setCsvErrors(parsed.errors);
    } catch (err) {
      setCsvRows([]);
      setCsvErrors([
        err instanceof Error ? err.message : 'Failed to read CSV file.',
      ]);
    }
  };

  const handleConfirmBulkImport = async () => {
    if (csvRows.length === 0) return;

    setImportingCsv(true);
    try {
      const { error: rpcError } = await supabase.rpc(
        'sector_bulk_upsert_units',
        {
          p_code: sectorCode,
          p_rows: csvRows,
        }
      );

      if (rpcError) {
        onError(rpcError.message || 'Bulk CSV import failed.');
        return;
      }

      const count = csvRows.length;
      setCsvRows([]);
      setCsvErrors([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await onMutated(`Imported ${count} units successfully`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Bulk CSV import failed.');
    } finally {
      setImportingCsv(false);
    }
  };

  const handleCopyCode = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1600);
    } catch {
      onError('Unable to copy code to clipboard.');
    }
  };

  const handleDeleteUnit = async (unitId: number) => {
    setDeletingUnitId(unitId);
    try {
      const { error: rpcError } = await supabase.rpc('sector_delete_unit', {
        p_code: sectorCode,
        p_unit_id: unitId,
      });

      if (rpcError) {
        onError(rpcError.message || 'Failed to delete unit.');
        return;
      }

      setConfirmDeleteUnitId(null);
      await onMutated('Unit deleted successfully');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to delete unit.');
    } finally {
      setDeletingUnitId(null);
    }
  };

  // --- Shared Sub-renderers ---

  const quickUnitContent = (
    <form onSubmit={handleSaveUnit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label
            htmlFor="sector-unit-name"
            className="block text-xs font-semibold text-forest-950 mb-1"
          >
            Unit Name
          </label>
          <input
            id="sector-unit-name"
            type="text"
            required
            placeholder="e.g. Unit Alpha"
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            disabled={savingUnit}
            className="w-full px-3 py-2 text-sm rounded-xl border border-leaf-border bg-white text-forest-950 placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900"
          />
        </div>

        <div>
          <label
            htmlFor="sector-unit-code"
            className="block text-xs font-semibold text-forest-950 mb-1"
          >
            Unit Login Code
          </label>
          <input
            id="sector-unit-code"
            type="text"
            required
            placeholder="e.g. WDR21"
            value={unitCode}
            onChange={(e) => setUnitCode(e.target.value.toUpperCase())}
            disabled={savingUnit}
            className="w-full px-3 py-2 text-sm rounded-xl border border-leaf-border bg-white text-forest-950 font-mono uppercase placeholder:normal-case placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900"
          />
        </div>

        <div>
          <label
            htmlFor="sector-unit-phone"
            className="block text-xs font-semibold text-forest-950 mb-1"
          >
            Contact Phone (Optional)
          </label>
          <input
            id="sector-unit-phone"
            type="tel"
            inputMode="numeric"
            maxLength={15}
            placeholder="e.g. 9876543210"
            value={contactPhone}
            onKeyDown={blockNegativeNumericKeys}
            onChange={(e) =>
              setContactPhone(sanitizePositiveInteger(e.target.value))
            }
            disabled={savingUnit}
            className="w-full px-3 py-2 text-sm rounded-xl border border-leaf-border bg-white text-forest-950 num placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900"
          />
        </div>
      </div>

      <p className="text-[11px] text-forest-600">
        Enter an existing Unit Code in {sector.name} to rename it, or a new code to register a unit under this sector.
      </p>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={savingUnit}
          className="px-4 py-2 text-xs font-semibold rounded-xl glass-forest text-white hover:opacity-95 disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          {savingUnit ? 'Saving...' : 'Save Unit'}
        </button>
      </div>
    </form>
  );

  const csvImportContent = (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-forest-600">
          Upload a 2-column CSV (<code className="font-mono text-forest-900">Unit Name, Unit Code</code>) for {sector.name}.
        </p>
        <button
          type="button"
          onClick={downloadSampleSectorUnitsCsv}
          className="text-xs font-semibold text-forest-900 bg-leaf-100 hover:bg-leaf-200/70 border border-leaf-border px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download Sample CSV
        </button>
      </div>

      <div>
        <label
          htmlFor="sector-csv-file"
          className="block text-xs font-semibold text-forest-950 mb-1"
        >
          Select CSV File
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            id="sector-csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleCsvFileChange(e)}
            disabled={importingCsv}
            className="block w-full text-xs text-forest-700 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border file:border-leaf-border file:text-xs file:font-semibold file:bg-leaf-100 file:text-forest-950 hover:file:bg-forest-100 cursor-pointer"
          />
        </div>
      </div>

      {csvErrors.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 space-y-1">
          <p className="font-bold">CSV Validation Errors:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {csvErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {csvRows.length > 0 && (
        <div className="space-y-2.5">
          <div className="max-h-48 overflow-y-auto border border-leaf-border rounded-xl bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-leaf-100 text-forest-700 border-b border-leaf-border">
                  <th className="py-2 px-3 font-semibold">Unit Name</th>
                  <th className="py-2 px-3 font-semibold">Unit Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-leaf-border/60">
                {csvRows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="py-2 px-3 font-medium text-forest-950">
                      {row.unit_name}
                    </td>
                    <td className="py-2 px-3 font-mono text-forest-900">
                      {row.unit_code}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleConfirmBulkImport()}
              disabled={importingCsv || csvErrors.length > 0}
              className="px-4 py-2 text-xs font-semibold rounded-xl glass-forest text-white hover:opacity-95 disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              {importingCsv
                ? 'Importing...'
                : `Confirm Import (${csvRows.length} Units)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const directoryContent = (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-forest-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={dirSearch}
          onChange={(e) => setDirSearch(e.target.value)}
          placeholder="Search unit or code..."
          className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-leaf-border bg-white/90 text-forest-950 placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900"
        />
        {dirSearch && (
          <button
            type="button"
            onClick={() => setDirSearch('')}
            aria-label="Clear directory search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-forest-400 hover:text-forest-900 p-0.5 rounded-full"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {dirRows.length === 0 ? (
        <p className="text-xs text-forest-600 py-4 text-center">
          {dirFetching
            ? 'Loading units...'
            : units.length === 0
              ? `No units registered in ${sector.name} yet.`
              : 'No matching units found.'}
        </p>
      ) : (
        <div
          className={`divide-y divide-leaf-border/60 border border-leaf-border rounded-xl bg-white/80 overflow-hidden transition-opacity ${
            dirFetching ? 'opacity-65' : ''
          }`}
        >
          {dirRows.map((unit) => {
            const hasOrders = Number(unit.total_entries) > 0;
            const isConfirmingDelete = confirmDeleteUnitId === unit.id;
            const isDeleting = deletingUnitId === unit.id;
            const isCopied = copiedKey === `u-${unit.id}`;

            return (
              <div
                key={unit.id}
                className="p-3 flex items-center justify-between gap-3 hover:bg-leaf-50/70 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-forest-950 truncate">
                      {unit.name}
                    </span>
                    <span className="bg-forest-100 text-forest-900 font-mono text-xs px-2 py-0.5 rounded font-semibold num">
                      {unit.login_code}
                    </span>
                  </div>
                  <span className="text-[11px] text-forest-600 num block mt-0.5">
                    {unit.total_entries} orders ·{' '}
                    {formatQuantity(Number(unit.total_quantity) || 0)} L
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyCode(`u-${unit.id}`, unit.login_code)
                    }
                    title="Copy login code"
                    aria-label={`Copy login code ${unit.login_code}`}
                    className="p-2 rounded-lg border border-leaf-border bg-white text-forest-700 hover:text-forest-950 hover:bg-leaf-100 transition-colors"
                  >
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 text-vibrant-teal" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDeleteUnit(unit.id)}
                        disabled={isDeleting}
                        className="px-2.5 py-1.5 rounded-lg bg-vibrant-coral text-white text-[11px] font-bold hover:opacity-95 disabled:opacity-50"
                      >
                        {isDeleting ? '...' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteUnitId(null)}
                        disabled={isDeleting}
                        className="px-2 py-1.5 rounded-lg border border-leaf-border bg-white text-forest-700 text-[11px] font-medium hover:bg-leaf-100"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={hasOrders}
                      onClick={() => setConfirmDeleteUnitId(unit.id)}
                      title={
                        hasOrders
                          ? 'Has active orders'
                          : `Delete unit ${unit.name}`
                      }
                      aria-label={`Delete unit ${unit.name}`}
                      className={`p-2 rounded-lg border transition-colors ${
                        hasOrders
                          ? 'border-leaf-border/50 text-forest-400 cursor-not-allowed bg-leaf-50/50'
                          : 'border-leaf-border bg-white text-forest-600 hover:text-vibrant-coral hover:bg-vibrant-coralSoft/50'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaginationBar
        page={dirPage}
        totalPages={dirTotalPages}
        totalCount={dirTotalCount}
        pageSize={dirPageSize}
        onPageChange={setDirPage}
        onPageSizeChange={(nextSize) => {
          setDirPageSize(nextSize);
          setDirPage(1);
        }}
        pageSizeOptions={[10, 15, 25]}
        theme="sector"
        loading={dirFetching}
        isDesktop={isDesktop}
      />
    </div>
  );

  const divisionRulesContent = (
    <div className="space-y-3">
      <div className="bg-leaf-50/90 border border-leaf-border rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-forest-600">Challenge Title</span>
          <span className="text-xs font-bold text-forest-950 text-right">
            <BrandText text={settings.challenge_title} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-leaf-border/60">
          <span className="text-xs text-forest-600">Current Unit Rate</span>
          <span className="text-xs font-bold text-forest-950 num">
            ₹{formatQuantity(Number(settings.unit_rate) || 0)} / L
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-leaf-border/60">
          <span className="text-xs text-forest-600">Order Status</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              settings.is_challenge_open
                ? 'bg-vibrant-tealSoft text-vibrant-teal'
                : 'bg-vibrant-coralSoft text-vibrant-coral'
            }`}
          >
            {settings.is_challenge_open ? 'Orders Open' : 'Orders Closed'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-forest-600 bg-leaf-100/70 rounded-xl px-3 py-2 border border-leaf-border/70">
        <Lock className="w-3.5 h-3.5 text-forest-700 shrink-0" />
        <span>
          Global rate and order cut-off are managed by Division Admin.
        </span>
      </div>
    </div>
  );

  // Desktop Grid Layout
  if (isDesktop) {
    return (
      <div className="space-y-5">
        <SectorCredentialsSection
          isDesktop={isDesktop}
          sectorName={sector.name}
          units={units}
          pendingResetRequests={pendingResetRequests}
          sectorCode={sectorCode}
          refreshKey={refreshKey}
          onMutated={onMutated}
          onError={onError}
        />

        <div className="grid grid-cols-12 gap-5">
        {/* Left Column (7 cols): Quick Add + Bulk CSV + Division Rules */}
        <div className="col-span-7 space-y-5">
          <div className="glass-leaf-card rounded-[22px] p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-forest-950">
                Quick Add / Rename Unit
              </h2>
              <p className="text-xs text-forest-600">
                Register or rename units strictly within {sector.name}
              </p>
            </div>
            {quickUnitContent}
          </div>

          <div className="glass-leaf-card rounded-[22px] p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-forest-950">
                Bulk CSV Import ({sector.name} Only)
              </h2>
              <p className="text-xs text-forest-600">
                Import multiple units using a 2-column CSV file
              </p>
            </div>
            {csvImportContent}
          </div>

          <div className="glass-leaf-card rounded-[22px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-forest-950">
                  Division Rules (Read-Only)
                </h2>
                <p className="text-xs text-forest-600">
                  Active global challenge configuration
                </p>
              </div>
              <span className="glass-leaf-pill px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-forest-700 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> Read-Only
              </span>
            </div>
            {divisionRulesContent}
          </div>

          <PushNotificationSettingsCard portal="SECTOR" />
        </div>

        {/* Right Column (5 cols): Sector Units Directory */}
        <div className="col-span-5">
          <div className="glass-leaf-card rounded-[22px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-forest-950">
                  Sector Units Directory
                </h2>
                <p className="text-xs text-forest-600">
                  {units.length} units in {sector.name}
                </p>
              </div>
              <span className="glass-leaf-pill px-2.5 py-0.5 rounded-full text-xs font-bold text-forest-950 num">
                {sector.login_code}
              </span>
            </div>
            {directoryContent}
          </div>
        </div>
      </div>
      </div>
    );
  }

  // Mobile Accordion Layout (All cards collapsed by default)
  return (
    <div className="space-y-3">
      {/* Card 0: Unit Credentials & WhatsApp Hub */}
      <div className="glass-leaf-card rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleMobileCard('credentials')}
          aria-expanded={mobileExpandedCard === 'credentials'}
          className="w-full p-4 flex items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-forest-950">
                Unit Credentials &amp; WhatsApp Hub
              </h2>
              {pendingResetRequests.length > 0 && (
                <span className="bg-vibrant-coral text-white text-[10px] font-bold px-2 py-0.5 rounded-full num">
                  {pendingResetRequests.length} pending
                </span>
              )}
            </div>
            <p className="text-[11px] text-forest-600 mt-0.5">
              {units.length} units · User IDs, phones, password resets &amp; WhatsApp
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-forest-700 shrink-0 transition-transform duration-200 ${
              mobileExpandedCard === 'credentials' ? 'rotate-180' : ''
            }`}
          />
        </button>
        {mobileExpandedCard === 'credentials' && (
          <div className="px-4 pb-4 pt-3 border-t border-leaf-border/60">
            <SectorCredentialsSection
              isDesktop={isDesktop}
              sectorName={sector.name}
              units={units}
              pendingResetRequests={pendingResetRequests}
              sectorCode={sectorCode}
              refreshKey={refreshKey}
              embedded={true}
              onMutated={onMutated}
              onError={onError}
            />
          </div>
        )}
      </div>

      {/* Card 1: Quick Add / Rename Unit */}
      <div className="glass-leaf-card rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleMobileCard('quick')}
          aria-expanded={mobileExpandedCard === 'quick'}
          className="w-full p-4 flex items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-sm font-bold text-forest-950">
              Quick Add / Rename Unit
            </h2>
            <p className="text-[11px] text-forest-600 mt-0.5">
              Create or rename a unit in {sector.name}
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-forest-700 transition-transform duration-200 ${
              mobileExpandedCard === 'quick' ? 'rotate-180' : ''
            }`}
          />
        </button>
        {mobileExpandedCard === 'quick' && (
          <div className="px-4 pb-4 pt-2 border-t border-leaf-border/60">
            {quickUnitContent}
          </div>
        )}
      </div>

      {/* Card 2: Bulk CSV Import */}
      <div className="glass-leaf-card rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleMobileCard('csv')}
          aria-expanded={mobileExpandedCard === 'csv'}
          className="w-full p-4 flex items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-sm font-bold text-forest-950">
              Bulk CSV Import
            </h2>
            <p className="text-[11px] text-forest-600 mt-0.5">
              Upload 2-column CSV (Unit Name, Unit Code)
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-forest-700 transition-transform duration-200 ${
              mobileExpandedCard === 'csv' ? 'rotate-180' : ''
            }`}
          />
        </button>
        {mobileExpandedCard === 'csv' && (
          <div className="px-4 pb-4 pt-2 border-t border-leaf-border/60">
            {csvImportContent}
          </div>
        )}
      </div>

      {/* Card 3: Sector Units Directory */}
      <div className="glass-leaf-card rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleMobileCard('directory')}
          aria-expanded={mobileExpandedCard === 'directory'}
          className="w-full p-4 flex items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-sm font-bold text-forest-950">
              Sector Units Directory
            </h2>
            <p className="text-[11px] text-forest-600 mt-0.5">
              {units.length} units · Copy codes or remove unused units
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-forest-700 transition-transform duration-200 ${
              mobileExpandedCard === 'directory' ? 'rotate-180' : ''
            }`}
          />
        </button>
        {mobileExpandedCard === 'directory' && (
          <div className="px-4 pb-4 pt-2 border-t border-leaf-border/60">
            {directoryContent}
          </div>
        )}
      </div>

      {/* Card 4: Division Rules (Read-Only) */}
      <div className="glass-leaf-card rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleMobileCard('rules')}
          aria-expanded={mobileExpandedCard === 'rules'}
          className="w-full p-4 flex items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-sm font-bold text-forest-950">
              Division Rules (Read-Only)
            </h2>
            <p className="text-[11px] text-forest-600 mt-0.5">
              Rate ₹{formatQuantity(Number(settings.unit_rate) || 0)}/L ·{' '}
              {settings.is_challenge_open ? 'Orders Open' : 'Orders Closed'}
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-forest-700 transition-transform duration-200 ${
              mobileExpandedCard === 'rules' ? 'rotate-180' : ''
            }`}
          />
        </button>
        {mobileExpandedCard === 'rules' && (
          <div className="px-4 pb-4 pt-2 border-t border-leaf-border/60">
            {divisionRulesContent}
          </div>
        )}
      </div>

      <PushNotificationSettingsCard portal="SECTOR" />
    </div>
  );
}
