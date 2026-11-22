import {
  startTransition,
  useEffect,
  useMemo,
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
  MessageCircle,
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
  CsvImportRow,
  PaginatedUnitsResponse,
  PasswordResetRequest,
  SectorOption,
  UnitSummaryRow,
} from '../../types';
import { downloadSampleUnitsCsv, parseUnitsCsv } from '../../utils/csv';
import {
  blockNegativeNumericKeys,
  sanitizePositiveDecimal,
  sanitizePositiveInteger,
} from '../../utils/inputGuards';
import { PaginationBar } from '../PaginationBar';
import { PushNotificationSettingsCard } from '../PushNotificationSettingsCard';
import { SelectDropdown } from '../SelectDropdown';
import { saveCachedAdminWhatsAppPhone } from '../../utils/helpKbDb';
import { AdminCredentialsSection } from './AdminCredentialsSection';

interface AdminSettingsTabProps {
  isDesktop: boolean;
  settings: AppSettings;
  sectors: SectorOption[];
  unitSummaries: UnitSummaryRow[];
  pendingResetRequests?: PasswordResetRequest[];
  adminCode: string;
  refreshKey?: number;
  onMutated: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}

export function AdminSettingsTab({
  isDesktop,
  settings,
  sectors,
  unitSummaries,
  pendingResetRequests = [],
  adminCode,
  refreshKey = 0,
  onMutated,
  onError,
}: AdminSettingsTabProps) {
  // Card 1: Challenge settings state
  const [challengeTitle, setChallengeTitle] = useState(
    settings.challenge_title
  );
  const [unitRate, setUnitRate] = useState(String(settings.unit_rate));
  const [divisionTarget, setDivisionTarget] = useState(
    String(settings.division_target)
  );
  const [adminWhatsappPhone, setAdminWhatsappPhone] = useState(
    settings.admin_whatsapp_phone ?? ''
  );
  const [isChallengeOpen, setIsChallengeOpen] = useState(
    settings.is_challenge_open
  );
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setChallengeTitle(settings.challenge_title);
    setUnitRate(String(settings.unit_rate));
    setDivisionTarget(String(settings.division_target));
    setAdminWhatsappPhone(settings.admin_whatsapp_phone ?? '');
    setIsChallengeOpen(settings.is_challenge_open);
  }, [settings]);

  // Card 2: Bulk CSV import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvRows, setCsvRows] = useState<CsvImportRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [importingCsv, setImportingCsv] = useState(false);

  // Card 3: Quick Add Unit & Directory state
  const [quickSectorName, setQuickSectorName] = useState('');
  const [quickSectorCode, setQuickSectorCode] = useState('');
  const [quickSectorPhone, setQuickSectorPhone] = useState('');
  const [quickUnitName, setQuickUnitName] = useState('');
  const [quickUnitCode, setQuickUnitCode] = useState('');
  const [quickUnitPhone, setQuickUnitPhone] = useState('');
  const [savingQuickUnit, setSavingQuickUnit] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDeleteUnitId, setConfirmDeleteUnitId] = useState<number | null>(
    null
  );
  const [deletingUnitId, setDeletingUnitId] = useState<number | null>(null);
  const [confirmDeleteSectorId, setConfirmDeleteSectorId] = useState<
    number | null
  >(null);
  const [deletingSectorId, setDeletingSectorId] = useState<number | null>(null);

  // Card 3 Directory Server-Side Search, Sector Filter & Pagination
  const [dirSearch, setDirSearch] = useState('');
  const debouncedDirSearch = useDebouncedValue(dirSearch, 100);
  const [dirSectorFilter, setDirSectorFilter] = useState<string>('ALL');
  const [dirPage, setDirPage] = useState<number>(1);
  const [dirPageSize, setDirPageSize] = useState<number>(10);
  const [dirRows, setDirRows] = useState<UnitSummaryRow[]>(() =>
    unitSummaries.slice(0, 10)
  );
  const [dirTotalCount, setDirTotalCount] = useState<number>(
    unitSummaries.length
  );
  const [dirTotalPages, setDirTotalPages] = useState<number>(
    Math.max(Math.ceil(unitSummaries.length / 10), 1)
  );
  const [dirFetching, setDirFetching] = useState<boolean>(false);
  const dirReqSeqRef = useRef(0);

  // Mobile accordion state (collapsed by default so all 3 cards are visible at a glance)
  const [mobileExpandedCard, setMobileExpandedCard] = useState<
    'settings' | 'csv' | 'units' | null
  >(null);

  const toggleMobileCard = (card: 'settings' | 'csv' | 'units') => {
    setMobileExpandedCard((prev) => (prev === card ? null : card));
  };

  const sectorUnitCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const unit of unitSummaries) {
      if (typeof unit.sector_id === 'number') {
        counts.set(unit.sector_id, (counts.get(unit.sector_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [unitSummaries]);

  const sortedSectors = useMemo(
    () => [...sectors].sort((a, b) => a.name.localeCompare(b.name)),
    [sectors]
  );

  useEffect(() => {
    setDirPage(1);
  }, [dirSectorFilter, debouncedDirSearch]);

  useEffect(() => {
    const seq = ++dirReqSeqRef.current;
    const controller = new AbortController();
    let active = true;
    setDirFetching(true);

    const fetchDirUnits = async () => {
      try {
        const { data, error: rpcError } = await supabase
          .rpc('admin_list_units', {
            p_code: adminCode,
            p_sector_id:
              dirSectorFilter === 'ALL' ? null : Number(dirSectorFilter),
            p_search: debouncedDirSearch,
            p_sort: 'code',
            p_page: dirPage,
            p_page_size: dirPageSize,
          })
          .abortSignal(controller.signal);

        if (!active || seq !== dirReqSeqRef.current) return;

        if (rpcError) {
          if (controller.signal.aborted) return;
          onError(rpcError.message || 'Failed to load units directory.');
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
            : 'Unable to load units directory.'
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
  }, [
    adminCode,
    dirSectorFilter,
    debouncedDirSearch,
    dirPage,
    dirPageSize,
    refreshKey,
    onError,
  ]);

  const handleSaveSettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const rateNum = Number.parseFloat(unitRate);
    const targetNum = Number.parseFloat(divisionTarget);
    const titleTrimmed = challengeTitle.trim();
    const cleanAdminPhone = adminWhatsappPhone.replace(/\D/g, '').slice(0, 15);

    if (!titleTrimmed) {
      onError('Challenge title is required.');
      return;
    }
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      onError('Unit rate must be greater than zero.');
      return;
    }
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      onError('Division limit must be greater than zero.');
      return;
    }
    if (cleanAdminPhone.length > 0 && cleanAdminPhone.length < 10) {
      onError(
        'Admin WhatsApp number must be at least 10 digits (or leave empty).'
      );
      return;
    }

    setSavingSettings(true);
    try {
      const { error: rpcError } = await supabase.rpc('admin_update_settings', {
        p_code: adminCode,
        p_unit_rate: rateNum,
        p_division_target: targetNum,
        p_challenge_title: titleTrimmed,
        p_is_challenge_open: isChallengeOpen,
        p_admin_whatsapp_phone: cleanAdminPhone,
      });

      if (rpcError) {
        onError(rpcError.message || 'Failed to save challenge settings.');
        return;
      }

      saveCachedAdminWhatsAppPhone(cleanAdminPhone);
      await onMutated('Challenge settings saved');
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Unable to save challenge settings.'
      );
    } finally {
      setSavingSettings(false);
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
      const parsed = parseUnitsCsv(text);
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
        'admin_bulk_upsert_units',
        {
          p_code: adminCode,
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

  const handleQuickAddUnit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const row: CsvImportRow = {
      sector_name: quickSectorName.trim(),
      sector_code: quickSectorCode.trim().toUpperCase(),
      unit_name: quickUnitName.trim(),
      unit_code: quickUnitCode.trim().toUpperCase(),
      ...(quickSectorPhone.trim()
        ? { sector_phone: quickSectorPhone.trim() }
        : {}),
      ...(quickUnitPhone.trim() ? { unit_phone: quickUnitPhone.trim() } : {}),
    };

    if (
      !row.sector_name ||
      !row.sector_code ||
      !row.unit_name ||
      !row.unit_code
    ) {
      onError('All 4 unit & sector fields are required.');
      return;
    }

    setSavingQuickUnit(true);
    try {
      const { error: rpcError } = await supabase.rpc(
        'admin_bulk_upsert_units',
        {
          p_code: adminCode,
          p_rows: [row],
        }
      );

      if (rpcError) {
        onError(rpcError.message || 'Failed to save unit.');
        return;
      }

      setQuickSectorName('');
      setQuickSectorCode('');
      setQuickSectorPhone('');
      setQuickUnitName('');
      setQuickUnitCode('');
      setQuickUnitPhone('');
      await onMutated('Unit saved successfully');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save unit.');
    } finally {
      setSavingQuickUnit(false);
    }
  };

  const handleCopyCode = async (key: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1500);
    } catch {
      onError('Unable to copy code to clipboard.');
    }
  };

  const handleDeleteUnit = async (unitId: number) => {
    setDeletingUnitId(unitId);
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_unit', {
        p_code: adminCode,
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

  const handleDeleteSector = async (sectorId: number) => {
    setDeletingSectorId(sectorId);
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_sector', {
        p_code: adminCode,
        p_sector_id: sectorId,
      });

      if (rpcError) {
        onError(rpcError.message || 'Failed to delete sector.');
        return;
      }

      setConfirmDeleteSectorId(null);
      await onMutated('Sector deleted successfully');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to delete sector.');
    } finally {
      setDeletingSectorId(null);
    }
  };

  const isCard1Open = isDesktop || mobileExpandedCard === 'settings';
  const isCard2Open = isDesktop || mobileExpandedCard === 'csv';
  const isCard3Open = isDesktop || mobileExpandedCard === 'units';

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <AdminCredentialsSection
        isDesktop={isDesktop}
        sectors={sectors}
        unitSummaries={unitSummaries}
        pendingResetRequests={pendingResetRequests}
        adminCode={adminCode}
        refreshKey={refreshKey}
        onMutated={onMutated}
        onError={onError}
      />

      <div
        className={
          isDesktop ? 'grid grid-cols-12 gap-5 items-stretch' : 'space-y-3.5'
        }
      >
        {/* Card 1: Challenge Settings & Global Lock */}
        <form
          onSubmit={handleSaveSettings}
          className={`${
            isDesktop
              ? 'col-span-6 p-6 flex flex-col justify-between space-y-4 h-full'
              : 'overflow-hidden'
          } glass-card rounded-2xl`}
        >
          {!isDesktop ? (
            <button
              type="button"
              onClick={() => toggleMobileCard('settings')}
              className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-milk-100/50 transition-colors"
            >
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-plum-900 truncate">
                  Challenge Settings &amp; Global Lock
                </h2>
                <p className="text-xs text-ink-600 truncate mt-0.5">
                  ₹{unitRate || '0'}/L • {divisionTarget || '0'} L •{' '}
                  {isChallengeOpen ? 'Orders Open' : 'Orders Closed'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    isChallengeOpen
                      ? 'bg-vibrant-tealSoft text-vibrant-teal'
                      : 'bg-vibrant-coralSoft text-vibrant-coral'
                  }`}
                >
                  {isChallengeOpen ? 'Orders Open' : 'Orders Closed'}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-plum-900 transition-transform duration-200 ${
                    isCard1Open ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
          ) : (
            <div>
              <h2 className="text-base font-semibold text-plum-900">
                Challenge Settings &amp; Global Lock
              </h2>
              <p className="text-xs text-ink-600 mt-0.5">
                Configure division pricing, order limit, and cut-off availability.
              </p>
            </div>
          )}

          {isCard1Open && (
            <div
              className={
                isDesktop
                  ? 'space-y-4 flex-1 flex flex-col justify-between'
                  : 'px-4 pb-4 space-y-4 border-t border-milk-border/60 pt-3'
              }
            >
              <div className="space-y-4 flex-1">
                <div>
                  <label
                    htmlFor="settings-title"
                    className="block text-xs font-medium text-ink-900 mb-1"
                  >
                    Challenge Title
                  </label>
                  <input
                    id="settings-title"
                    type="text"
                    required
                    value={challengeTitle}
                    onChange={(e) => setChallengeTitle(e.target.value)}
                    disabled={savingSettings}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900 focus:border-plum-900 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="settings-rate"
                      className="block text-xs font-medium text-ink-900 mb-1"
                    >
                      Unit Rate (₹ per Liter)
                    </label>
                    <input
                      id="settings-rate"
                      type="text"
                      inputMode="decimal"
                      required
                      value={unitRate}
                      onKeyDown={blockNegativeNumericKeys}
                      onChange={(e) =>
                        setUnitRate(sanitizePositiveDecimal(e.target.value))
                      }
                      disabled={savingSettings}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900 num focus:border-plum-900 transition-colors"
                    />
                    <p className="text-[11px] text-ink-600 mt-1">
                      Applied to new orders only.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="settings-target"
                      className="block text-xs font-medium text-ink-900 mb-1"
                    >
                      Division Limit (Liters)
                    </label>
                    <input
                      id="settings-target"
                      type="text"
                      inputMode="decimal"
                      required
                      value={divisionTarget}
                      onKeyDown={blockNegativeNumericKeys}
                      onChange={(e) =>
                        setDivisionTarget(sanitizePositiveDecimal(e.target.value))
                      }
                      disabled={savingSettings}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900 num focus:border-plum-900 transition-colors"
                    />
                    <p className="text-[11px] text-ink-600 mt-1">
                      Division-wide pre-order limit.
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="settings-admin-whatsapp"
                    className="flex items-center gap-1.5 text-xs font-medium text-ink-900 mb-1"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>Main Admin WhatsApp Number</span>
                  </label>
                  <input
                    id="settings-admin-whatsapp"
                    type="tel"
                    inputMode="numeric"
                    maxLength={15}
                    placeholder="e.g. 9876543210"
                    value={adminWhatsappPhone}
                    onChange={(e) =>
                      setAdminWhatsappPhone(
                        e.target.value.replace(/\D/g, '').slice(0, 15)
                      )
                    }
                    disabled={savingSettings}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900 num focus:border-plum-900 transition-colors"
                  />
                  <p className="text-[11px] text-ink-600 mt-1">
                    Smart Help Assistant forwards user doubts directly to this WhatsApp number. Leave blank to open WhatsApp without a fixed recipient.
                  </p>
                </div>

                <div className="flex flex-col justify-between bg-milk-50 border border-milk-border rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="block text-xs font-semibold text-ink-900">
                        Accept New Orders (Cut-off Switch)
                      </span>
                      <span className="text-[11px] text-ink-600 mt-0.5 block">
                        {isChallengeOpen
                          ? 'Units can submit orders'
                          : 'Orders Closed'}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isChallengeOpen}
                      aria-label="Accept New Orders (Cut-off Switch)"
                      disabled={savingSettings}
                      onClick={() => setIsChallengeOpen((prev) => !prev)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                        isChallengeOpen ? 'bg-plum-900' : 'bg-ink-400/40'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isChallengeOpen ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  {!isChallengeOpen && (
                    <p className="text-[11px] font-medium text-vibrant-coral mt-2">
                      Orders are currently closed for all units.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="glass-plum hover:opacity-95 text-white text-xs font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-opacity shadow-sm"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Card 2: Bulk CSV Import */}
        <div
          className={`${
            isDesktop
              ? 'col-span-6 p-6 flex flex-col justify-between space-y-4 h-full'
              : 'overflow-hidden'
          } glass-card rounded-2xl`}
        >
          {!isDesktop ? (
            <button
              type="button"
              onClick={() => toggleMobileCard('csv')}
              className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-milk-100/50 transition-colors"
            >
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-plum-900 truncate">
                  Bulk CSV Import (Sectors &amp; Units)
                </h2>
                <p className="text-xs text-ink-600 truncate mt-0.5">
                  Upload CSV to batch configure sectors &amp; units
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {csvRows.length > 0 && (
                  <span className="bg-vibrant-tealSoft text-vibrant-teal px-2 py-0.5 rounded-full text-[11px] font-semibold">
                    {csvRows.length} Rows
                  </span>
                )}
                <ChevronDown
                  className={`w-4 h-4 text-plum-900 transition-transform duration-200 ${
                    isCard2Open ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-plum-900">
                  Bulk CSV Import (Sectors &amp; Units)
                </h2>
                <p className="text-xs text-ink-600 mt-0.5">
                  Upload CSV to batch configure sectors and units.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadSampleUnitsCsv}
                className="border border-plum-900/30 text-plum-900 hover:bg-milk-100 text-xs font-semibold px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                Download Sample CSV
              </button>
            </div>
          )}

          {isCard2Open && (
            <div
              className={
                isDesktop
                  ? 'space-y-3.5 flex-1 flex flex-col justify-between'
                  : 'px-4 pb-4 space-y-3.5 border-t border-milk-border/60 pt-3'
              }
            >
              {!isDesktop && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={downloadSampleUnitsCsv}
                    className="border border-plum-900/30 text-plum-900 hover:bg-milk-100 text-xs font-semibold px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Sample CSV
                  </button>
                </div>
              )}

              <div className="bg-milk-50 border border-milk-border rounded-xl p-3 flex items-center justify-between gap-2">
                <div>
                  <span className="block text-xs font-semibold text-ink-900">
                    Required Columns
                  </span>
                  <span className="text-[11px] font-mono text-ink-600 block">
                    sector_name, sector_code, unit_name, unit_code
                  </span>
                  <span className="text-[10px] text-ink-600 block mt-0.5">
                    Optional: <code className="font-mono">sector_phone, unit_phone</code>
                  </span>
                </div>
                <span className="text-[10px] bg-plum-100/70 text-plum-900 font-medium px-2 py-0.5 rounded-md border border-plum-200/50 shrink-0">
                  CSV Only
                </span>
              </div>

              <label className="flex-1 min-h-[140px] flex flex-col items-center justify-center border-2 border-dashed border-plum-200/70 rounded-xl p-5 bg-milk-50/70 hover:bg-milk-100/60 hover:border-plum-400 cursor-pointer transition-colors text-center">
                <Upload className="w-5 h-5 text-plum-700 mb-1.5" />
                <span className="text-xs font-semibold text-plum-900">
                  Select CSV file to validate and preview
                </span>
                <span className="text-[11px] text-ink-600 mt-0.5">
                  Drag &amp; drop or click to browse files
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => void handleCsvFileChange(e)}
                  className="mt-3 max-w-full text-xs text-ink-600 file:mr-2.5 file:py-1 file:px-3 file:rounded-lg file:border file:border-milk-border file:text-xs file:font-semibold file:bg-white file:text-plum-900 hover:file:bg-plum-50"
                />
              </label>

              {csvErrors.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-semibold text-rose-800">
                    CSV Validation Errors
                  </p>
                  <ul className="list-disc list-inside text-xs text-rose-700 space-y-0.5">
                    {csvErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {csvRows.length > 0 && (
                <div className="space-y-3">
                  <div className="glass-table border border-milk-border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-40">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="glass-table-head text-ink-600 uppercase border-b border-milk-border sticky top-0">
                            <th className="py-2 px-3 font-semibold">Sector</th>
                            <th className="py-2 px-3 font-semibold">S. Code</th>
                            <th className="py-2 px-3 font-semibold">Unit</th>
                            <th className="py-2 px-3 font-semibold">U. Code</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-milk-border/70">
                          {csvRows.slice(0, 10).map((row, idx) => (
                            <tr key={`${row.unit_code}-${idx}`}>
                              <td className="py-2 px-3 text-ink-900">
                                {row.sector_name}
                              </td>
                              <td className="py-2 px-3 font-mono text-plum-900">
                                {row.sector_code}
                              </td>
                              <td className="py-2 px-3 font-medium text-ink-900">
                                {row.unit_name}
                              </td>
                              <td className="py-2 px-3 font-mono text-plum-900">
                                {row.unit_code}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {csvRows.length > 10 && (
                      <div className="bg-milk-50 px-3 py-1.5 text-[11px] text-ink-600 border-t border-milk-border">
                        Showing 10 of {csvRows.length} rows
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => void handleConfirmBulkImport()}
                  disabled={csvRows.length === 0 || importingCsv}
                  className="glass-plum hover:opacity-95 text-white text-xs font-semibold px-5 py-2.5 rounded-xl disabled:opacity-40 transition-opacity shadow-sm"
                >
                  {importingCsv
                    ? 'Importing...'
                    : csvRows.length > 0
                    ? `Confirm Bulk Import (${csvRows.length} Units)`
                    : 'Upload & Import CSV'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Quick Add / Update Unit & Units/Sectors Directory */}
      <div
        className={`${
          isDesktop ? 'p-6 space-y-5' : isCard3Open ? '' : 'overflow-hidden'
        } glass-card rounded-2xl`}
      >
        {!isDesktop ? (
          <button
            type="button"
            onClick={() => toggleMobileCard('units')}
            className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-milk-100/50 transition-colors"
          >
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-plum-900 truncate">
                Quick Add / Update Unit &amp; Directory
              </h2>
              <p className="text-xs text-ink-600 truncate mt-0.5">
                {unitSummaries.length} units • {sectors.length} sectors configured
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="glass-pill px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-plum-900">
                {unitSummaries.length} Units
              </span>
              <ChevronDown
                className={`w-4 h-4 text-plum-900 transition-transform duration-200 ${
                  isCard3Open ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>
        ) : (
          <div>
            <h2 className="text-base font-semibold text-plum-900">
              Quick Add / Update Unit &amp; Directory
            </h2>
            <p className="text-xs text-ink-600 mt-0.5">
              Add or update individual units, copy access codes, or clean up
              unused sectors and units.
            </p>
          </div>
        )}

        {isCard3Open && (
          <div
            className={
              isDesktop
                ? 'space-y-5'
                : 'px-4 pb-4 space-y-4 border-t border-milk-border/60 pt-3'
            }
          >

        <form
          onSubmit={handleQuickAddUnit}
          className={`grid ${
            isDesktop ? 'grid-cols-7' : 'grid-cols-1 sm:grid-cols-2'
          } gap-2.5 items-end bg-milk-50 border border-milk-border rounded-xl p-3.5`}
        >
          <div>
            <label
              htmlFor="quick-sector-name"
              className="block text-[11px] font-medium text-ink-900 mb-1"
            >
              Sector Name
            </label>
            <input
              id="quick-sector-name"
              type="text"
              required
              placeholder="Sector 1"
              value={quickSectorName}
              onChange={(e) => setQuickSectorName(e.target.value)}
              disabled={savingQuickUnit}
              className="w-full px-2.5 py-2 text-xs rounded-xl border border-milk-border bg-white text-ink-900"
            />
          </div>

          <div>
            <label
              htmlFor="quick-sector-code"
              className="block text-[11px] font-medium text-ink-900 mb-1"
            >
              Sector Code
            </label>
            <input
              id="quick-sector-code"
              type="text"
              required
              placeholder="WDR101"
              value={quickSectorCode}
              onChange={(e) => setQuickSectorCode(e.target.value)}
              disabled={savingQuickUnit}
              className="w-full px-2.5 py-2 text-xs uppercase font-mono rounded-xl border border-milk-border bg-white text-ink-900 placeholder:normal-case placeholder:font-sans"
            />
          </div>

          <div>
            <label
              htmlFor="quick-sector-phone"
              className="block text-[11px] font-medium text-ink-900 mb-1"
            >
              Sector Phone
            </label>
            <input
              id="quick-sector-phone"
              type="tel"
              inputMode="numeric"
              maxLength={15}
              placeholder="Optional"
              value={quickSectorPhone}
              onKeyDown={blockNegativeNumericKeys}
              onChange={(e) =>
                setQuickSectorPhone(sanitizePositiveInteger(e.target.value))
              }
              disabled={savingQuickUnit}
              className="w-full px-2.5 py-2 text-xs rounded-xl border border-milk-border bg-white text-ink-900 num"
            />
          </div>

          <div>
            <label
              htmlFor="quick-unit-name"
              className="block text-[11px] font-medium text-ink-900 mb-1"
            >
              Unit Name
            </label>
            <input
              id="quick-unit-name"
              type="text"
              required
              placeholder="Unit 4"
              value={quickUnitName}
              onChange={(e) => setQuickUnitName(e.target.value)}
              disabled={savingQuickUnit}
              className="w-full px-2.5 py-2 text-xs rounded-xl border border-milk-border bg-white text-ink-900"
            />
          </div>

          <div>
            <label
              htmlFor="quick-unit-code"
              className="block text-[11px] font-medium text-ink-900 mb-1"
            >
              Unit Code
            </label>
            <input
              id="quick-unit-code"
              type="text"
              required
              placeholder="WDR4"
              value={quickUnitCode}
              onChange={(e) => setQuickUnitCode(e.target.value)}
              disabled={savingQuickUnit}
              className="w-full px-2.5 py-2 text-xs uppercase font-mono rounded-xl border border-milk-border bg-white text-ink-900 placeholder:normal-case placeholder:font-sans"
            />
          </div>

          <div>
            <label
              htmlFor="quick-unit-phone"
              className="block text-[11px] font-medium text-ink-900 mb-1"
            >
              Unit Phone
            </label>
            <input
              id="quick-unit-phone"
              type="tel"
              inputMode="numeric"
              maxLength={15}
              placeholder="Optional"
              value={quickUnitPhone}
              onKeyDown={blockNegativeNumericKeys}
              onChange={(e) =>
                setQuickUnitPhone(sanitizePositiveInteger(e.target.value))
              }
              disabled={savingQuickUnit}
              className="w-full px-2.5 py-2 text-xs rounded-xl border border-milk-border bg-white text-ink-900 num"
            />
          </div>

          <button
            type="submit"
            disabled={savingQuickUnit}
            className={`${
              isDesktop ? '' : 'sm:col-span-2'
            } glass-plum hover:opacity-95 text-white text-xs font-semibold px-3 py-2 rounded-xl inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-opacity`}
          >
            <Plus className="w-3.5 h-3.5" />
            {savingQuickUnit ? 'Saving...' : 'Save Unit'}
          </button>
        </form>

        {/* Sectors Directory Strip */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600">
            Sectors Directory ({sectors.length})
          </h3>
          {sectors.length === 0 ? (
            <p className="text-xs text-ink-600">No sectors configured yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sectors.map((sec) => {
                const unitCount = sectorUnitCounts.get(sec.id) ?? 0;
                const copyKey = `sector-${sec.id}`;
                const isConfirming = confirmDeleteSectorId === sec.id;
                const isDeleting = deletingSectorId === sec.id;

                return (
                  <div
                    key={sec.id}
                    className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-milk-50 border border-milk-border text-xs"
                  >
                    <span className="font-medium text-plum-900">
                      {sec.name}
                    </span>
                    <span className="bg-plum-100 text-plum-900 font-mono text-[11px] px-1.5 py-0.5 rounded">
                      {sec.login_code}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(copyKey, sec.login_code)}
                      title="Copy sector code"
                      className="text-ink-600 hover:text-plum-900 transition-colors"
                    >
                      {copiedKey === copyKey ? (
                        <Check className="w-3.5 h-3.5 text-vibrant-teal" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {unitCount === 0 &&
                      (isConfirming ? (
                        <div className="inline-flex items-center gap-1 pl-1 border-l border-milk-border">
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => void handleDeleteSector(sec.id)}
                            className="text-[11px] font-semibold text-vibrant-coral hover:underline disabled:opacity-50"
                          >
                            {isDeleting ? '...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => setConfirmDeleteSectorId(null)}
                            className="text-[11px] text-ink-600 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSectorId(sec.id)}
                          title="Delete empty sector"
                          aria-label={`Delete sector ${sec.name}`}
                          className="text-ink-400 hover:text-vibrant-coral transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Units Directory: Desktop Table vs Mobile Cards (Backend Filtered + Paginated) */}
        <div className="space-y-3">
          <div
            className={`relative z-20 flex ${
              isDesktop
                ? 'items-center justify-between gap-3'
                : 'flex-col gap-2'
            }`}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600">
              Units Directory ({dirTotalCount})
            </h3>

            <div
              className={`flex ${
                isDesktop ? 'items-center gap-2' : 'flex-col sm:flex-row gap-2'
              }`}
            >
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={dirSearch}
                  onChange={(e) => setDirSearch(e.target.value)}
                  placeholder="Search unit or code..."
                  className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-milk-border bg-white/90 text-ink-900 placeholder:text-ink-400"
                />
                {dirSearch && (
                  <button
                    type="button"
                    onClick={() => setDirSearch('')}
                    aria-label="Clear directory search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-plum-900 p-0.5 rounded-full"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <SelectDropdown
                value={dirSectorFilter}
                onChange={setDirSectorFilter}
                ariaLabel="Filter units directory by sector"
                className={isDesktop ? 'w-48' : 'w-full sm:w-48'}
                options={[
                  { value: 'ALL', label: 'All Sectors' },
                  ...sortedSectors.map((s) => ({
                    value: String(s.id),
                    label: s.name,
                  })),
                ]}
              />
            </div>
          </div>

          {isDesktop ? (
            <div
              className={`glass-table border border-milk-border rounded-xl overflow-hidden transition-opacity ${
                dirFetching ? 'opacity-65' : ''
              }`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="glass-table-head text-ink-600 text-xs uppercase tracking-wide border-b border-milk-border">
                      <th className="py-2.5 px-4 font-semibold">Sector</th>
                      <th className="py-2.5 px-4 font-semibold">Unit Name</th>
                      <th className="py-2.5 px-4 font-semibold">Login Code</th>
                      <th className="py-2.5 px-4 font-semibold text-right">
                        Entries
                      </th>
                      <th className="py-2.5 px-4 font-semibold text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-milk-border/70">
                    {dirRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-8 px-4 text-center text-xs text-ink-600"
                        >
                          {dirFetching
                            ? 'Loading units...'
                            : 'No matching units found.'}
                        </td>
                      </tr>
                    ) : (
                      dirRows.map((unit) => {
                        const copyKey = `unit-${unit.id}`;
                        const hasEntries = unit.total_entries > 0;
                        const isConfirming = confirmDeleteUnitId === unit.id;
                        const isDeleting = deletingUnitId === unit.id;

                        return (
                          <tr
                            key={unit.id}
                            className="hover:bg-plum-50/70 transition-colors"
                          >
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="text-ink-900">
                                  {unit.sector_name ?? '-'}
                                </span>
                                {unit.sector_code && (
                                  <span className="bg-milk-100 text-ink-600 font-mono text-[11px] px-1.5 py-0.5 rounded border border-milk-border">
                                    {unit.sector_code}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 font-medium text-plum-900 whitespace-nowrap">
                              {unit.name}
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <span className="bg-plum-100 text-plum-900 font-mono text-xs px-2 py-0.5 rounded">
                                  {unit.login_code}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopyCode(copyKey, unit.login_code)
                                  }
                                  title="Copy login code"
                                  className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-plum-900 transition-colors"
                                >
                                  {copiedKey === copyKey ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-vibrant-teal" />
                                      <span className="text-[11px] text-vibrant-teal font-medium">
                                        Copied
                                      </span>
                                    </>
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right num text-ink-600">
                              {unit.total_entries}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              {isConfirming ? (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => void handleDeleteUnit(unit.id)}
                                    className="text-xs font-semibold text-vibrant-coral hover:underline disabled:opacity-50"
                                  >
                                    {isDeleting ? 'Deleting...' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => setConfirmDeleteUnitId(null)}
                                    className="text-xs text-ink-600 hover:underline"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={hasEntries}
                                  onClick={() => setConfirmDeleteUnitId(unit.id)}
                                  title={
                                    hasEntries
                                      ? 'Has active entries'
                                      : 'Delete unit'
                                  }
                                  aria-label={`Delete unit ${unit.name}`}
                                  className="p-1.5 rounded-lg text-ink-600 hover:text-vibrant-coral hover:bg-vibrant-coralSoft/60 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-600 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
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
            <div
              className={`space-y-2.5 transition-opacity ${
                dirFetching ? 'opacity-65' : ''
              }`}
            >
              {dirRows.length === 0 ? (
                <p className="text-xs text-ink-600 py-4 text-center">
                  {dirFetching
                    ? 'Loading units...'
                    : 'No matching units found.'}
                </p>
              ) : (
                dirRows.map((unit) => {
                  const copyKey = `unit-${unit.id}`;
                  const hasEntries = unit.total_entries > 0;
                  const isConfirming = confirmDeleteUnitId === unit.id;
                  const isDeleting = deletingUnitId === unit.id;

                  return (
                    <div
                      key={unit.id}
                      className="bg-milk-50 border border-milk-border rounded-xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-plum-900">
                            {unit.name}
                          </span>
                          <span className="bg-plum-100 text-plum-900 font-mono text-[11px] px-1.5 py-0.5 rounded font-semibold">
                            {unit.login_code}
                          </span>
                        </div>
                        <p className="text-xs text-ink-600 mt-0.5 num">
                          {unit.sector_name ?? '-'} • {unit.total_entries}{' '}
                          entries
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyCode(copyKey, unit.login_code)
                          }
                          title="Copy login code"
                          aria-label={`Copy login code ${unit.login_code}`}
                          className="p-2 rounded-lg bg-white border border-milk-border text-ink-600 hover:text-plum-900"
                        >
                          {copiedKey === copyKey ? (
                            <Check className="w-3.5 h-3.5 text-vibrant-teal" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1.5 pl-1">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => void handleDeleteUnit(unit.id)}
                              className="text-xs font-semibold text-vibrant-coral"
                            >
                              {isDeleting ? '...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => setConfirmDeleteUnitId(null)}
                              className="text-xs text-ink-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={hasEntries}
                            onClick={() => setConfirmDeleteUnitId(unit.id)}
                            title={
                              hasEntries ? 'Has active entries' : 'Delete unit'
                            }
                            aria-label={`Delete unit ${unit.name}`}
                            className="p-2 rounded-lg bg-white border border-milk-border text-ink-600 hover:text-vibrant-coral disabled:opacity-35 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
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
            pageSizeOptions={[10, 15, 25, 50]}
            theme="admin"
            loading={dirFetching}
            isDesktop={isDesktop}
          />
        </div>
      </div>
    )}
  </div>

  <PushNotificationSettingsCard portal="ADMIN" />
</div>
);
}
