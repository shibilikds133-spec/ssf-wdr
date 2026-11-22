import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  MessageCircle,
  Phone,
  RotateCcw,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { supabase } from '../../lib/supabase';
import type {
  CredentialAccountRow,
  PaginatedResponse,
  PasswordResetRequest,
  SectorOption,
  UnitSummaryRow,
} from '../../types';
import { formatDateTime } from '../../utils/format';
import {
  blockNegativeNumericKeys,
  sanitizePositiveInteger,
} from '../../utils/inputGuards';
import {
  buildCredentialShareText,
  buildCredentialShareUrl,
  type CredentialShareParams,
} from '../../utils/whatsapp';
import { BrandText } from '../BrandText';
import { PaginationBar } from '../PaginationBar';
import { SelectDropdown } from '../SelectDropdown';

interface AdminCredentialsSectionProps {
  isDesktop: boolean;
  sectors: SectorOption[];
  unitSummaries: UnitSummaryRow[];
  pendingResetRequests: PasswordResetRequest[];
  adminCode: string;
  refreshKey?: number;
  onMutated: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}

type RoleFilter = 'ALL' | 'SECTOR' | 'UNIT' | 'PENDING';

interface AccountRow {
  key: string;
  accountType: 'SECTOR' | 'UNIT';
  accountId: number;
  name: string;
  subtitle: string;
  username: string;
  loginCode: string;
  contactPhone: string;
  mustChangePassword: boolean;
  hasCustomPassword: boolean;
  isResetPending: boolean;
}

interface ResetOutcome {
  key: string;
  accountType: 'SECTOR' | 'UNIT';
  accountName: string;
  username: string;
  loginCode: string;
  tempPassword: string;
  contactPhone: string;
}

export function AdminCredentialsSection({
  isDesktop,
  sectors,
  unitSummaries: _unitSummaries,
  pendingResetRequests,
  adminCode,
  refreshKey = 0,
  onMutated,
  onError,
}: AdminCredentialsSectionProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 100);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const [rows, setRows] = useState<AccountRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [fetching, setFetching] = useState<boolean>(false);
  const requestSeqRef = useRef(0);

  // Inline phone editing map: key -> phone string
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [savingPhoneKey, setSavingPhoneKey] = useState<string | null>(null);

  // Reset modal & outcome strip
  const [resetModalAccount, setResetModalAccount] = useState<AccountRow | null>(
    null
  );
  const [customTempPassword, setCustomTempPassword] = useState('');
  const [resettingKey, setResettingKey] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [lastResetResult, setLastResetResult] = useState<ResetOutcome | null>(
    null
  );
  const [recentTempPasswords, setRecentTempPasswords] = useState<
    Record<string, string>
  >({});
  const [shareModalParams, setShareModalParams] =
    useState<CredentialShareParams | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const sortedSectors = useMemo(
    () => [...sectors].sort((a, b) => a.name.localeCompare(b.name)),
    [sectors]
  );

  const selectedSectorName = useMemo(() => {
    if (sectorFilter === 'ALL') return null;
    return sectors.find((s) => String(s.id) === sectorFilter)?.name ?? null;
  }, [sectorFilter, sectors]);

  // Reset to page 1 when filters or debounced search change
  useEffect(() => {
    setPage(1);
  }, [roleFilter, sectorFilter, debouncedSearch]);

  // Server-side filtered + paginated credentials fetch
  useEffect(() => {
    const seq = ++requestSeqRef.current;
    const controller = new AbortController();
    let active = true;
    setFetching(true);

    const fetchCredentials = async () => {
      try {
        const { data, error: rpcError } = await supabase
          .rpc('admin_list_credentials', {
            p_code: adminCode,
            p_role_filter: roleFilter,
            p_sector_id:
              sectorFilter === 'ALL' ? null : Number(sectorFilter),
            p_search: debouncedSearch,
            p_page: page,
            p_page_size: pageSize,
          })
          .abortSignal(controller.signal);

        if (!active || seq !== requestSeqRef.current) return;

        if (rpcError) {
          if (controller.signal.aborted) return;
          onError(rpcError.message || 'Failed to load credentials.');
          return;
        }

        const res = data as PaginatedResponse<CredentialAccountRow> | null;
        if (!res) return;

        const mapped: AccountRow[] = (res.items ?? []).map((item) => ({
          key: `${item.account_type}-${item.account_id}`,
          accountType: item.account_type,
          accountId: item.account_id,
          name: item.name,
          subtitle: item.subtitle,
          username: item.username,
          loginCode: item.login_code,
          contactPhone: item.contact_phone ?? '',
          mustChangePassword: item.must_change_password ?? true,
          hasCustomPassword: item.has_custom_password ?? false,
          isResetPending: item.is_reset_pending ?? false,
        }));

        const nextDrafts: Record<string, string> = {};
        for (const acc of mapped) {
          nextDrafts[acc.key] = acc.contactPhone;
        }

        startTransition(() => {
          setRows(mapped);
          setTotalCount(Number(res.total_count) || 0);
          setTotalPages(Math.max(Number(res.total_pages) || 1, 1));
          if (typeof res.page === 'number' && res.page !== page) {
            setPage(res.page);
          }
          setPhoneDrafts(nextDrafts);
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!active || seq !== requestSeqRef.current) return;
        onError(
          err instanceof Error ? err.message : 'Unable to load credentials.'
        );
      } finally {
        if (active && seq === requestSeqRef.current) {
          setFetching(false);
        }
      }
    };

    void fetchCredentials();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    adminCode,
    roleFilter,
    sectorFilter,
    debouncedSearch,
    page,
    pageSize,
    refreshKey,
    onError,
  ]);

  const handleSectorChange = (nextSector: string) => {
    setSectorFilter(nextSector);
    if (nextSector !== 'ALL' && roleFilter === 'SECTOR') {
      setRoleFilter('UNIT');
    }
  };

  const hasActiveFilter =
    roleFilter !== 'ALL' ||
    sectorFilter !== 'ALL' ||
    debouncedSearch.trim() !== '';

  const executeReset = async (
    accountType: 'SECTOR' | 'UNIT',
    accountId: number,
    accountName: string,
    tempPassword?: string
  ) => {
    const key = `${accountType}-${accountId}`;
    const trimmedTemp = tempPassword?.trim() ?? '';
    if (trimmedTemp && trimmedTemp.length < 4) {
      onError('Temporary password must be at least 4 characters.');
      return;
    }

    setResettingKey(key);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'admin_reset_account_password',
        {
          p_code: adminCode,
          p_account_type: accountType,
          p_account_id: accountId,
          p_temp_password: trimmedTemp || null,
        }
      );

      if (rpcError) {
        onError(rpcError.message || 'Failed to reset password.');
        return;
      }

      const res = data as {
        success?: boolean;
        username?: string;
        temp_password?: string;
        login_code?: string;
        contact_phone?: string;
      } | null;

      if (!res?.success || !res.temp_password) {
        onError('Unexpected reset response.');
        return;
      }

      const outcome: ResetOutcome = {
        key,
        accountType,
        accountName,
        username: res.username ?? accountName,
        loginCode: res.login_code ?? '',
        tempPassword: res.temp_password,
        contactPhone: res.contact_phone ?? '',
      };

      setLastResetResult(outcome);
      setRecentTempPasswords((prev) => ({
        ...prev,
        [key]: res.temp_password!,
      }));
      setResetModalAccount(null);
      setCustomTempPassword('');
      await onMutated(`Password reset for ${accountName}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setResettingKey(null);
    }
  };

  const handleDismissRequest = async (requestId: number) => {
    setDismissingId(requestId);
    try {
      const { error: rpcError } = await supabase.rpc(
        'admin_dismiss_reset_request',
        {
          p_code: adminCode,
          p_request_id: requestId,
        }
      );
      if (rpcError) {
        onError(rpcError.message || 'Failed to dismiss reset request.');
        return;
      }
      await onMutated('Reset request dismissed');
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Unable to dismiss reset request.'
      );
    } finally {
      setDismissingId(null);
    }
  };

  const handleSavePhone = async (acc: AccountRow) => {
    const draft = (phoneDrafts[acc.key] ?? '').trim();
    setSavingPhoneKey(acc.key);
    try {
      const { error: rpcError } = await supabase.rpc(
        'admin_update_account_contact',
        {
          p_code: adminCode,
          p_account_type: acc.accountType,
          p_account_id: acc.accountId,
          p_contact_phone: draft,
        }
      );

      if (rpcError) {
        onError(rpcError.message || 'Failed to update contact phone.');
        return;
      }

      await onMutated(`Contact phone saved for ${acc.name}`);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Unable to save contact phone.'
      );
    } finally {
      setSavingPhoneKey(null);
    }
  };

  const openShareModal = (params: CredentialShareParams) => {
    setShareCopied(false);
    setShareModalParams(params);
  };

  const handleCopyShareText = async () => {
    if (!shareModalParams) return;
    try {
      const text = buildCredentialShareText(shareModalParams);
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      onError('Unable to copy credentials to clipboard.');
    }
  };

  const openWhatsAppShare = (params: CredentialShareParams) => {
    const url = buildCredentialShareUrl(params);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      {/* Pending Reset Requests Auto-Alert Queue */}
      {pendingResetRequests.length > 0 && (
        <div className="glass-card rounded-2xl p-4 sm:p-5 border-2 border-vibrant-coral/40 bg-rose-50/50 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-vibrant-coralSoft text-vibrant-coral flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-plum-950">
                  Pending Password Reset Requests ({pendingResetRequests.length})
                </h2>
                <p className="text-xs text-ink-600">
                  Reset credentials and send the direct WhatsApp login link.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {pendingResetRequests.map((req) => {
              const reqKey = `${req.account_type}-${req.account_id}`;
              const isResetting = resettingKey === reqKey;
              const isDismissing = dismissingId === req.id;

              return (
                <div
                  key={req.id}
                  className="bg-white/95 border border-milk-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-plum-950">
                        <BrandText text={req.account_name} />
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          req.account_type === 'SECTOR'
                            ? 'bg-vibrant-tealSoft text-vibrant-teal'
                            : 'bg-vibrant-amberSoft text-vibrant-amber'
                        }`}
                      >
                        {req.account_type}
                      </span>
                      <span className="font-mono text-[11px] bg-plum-100 text-plum-900 px-1.5 py-0.5 rounded">
                        {req.login_code}
                      </span>
                    </div>
                    <p className="text-xs text-ink-600">
                      User ID:{' '}
                      <span className="font-semibold text-ink-900">
                        <BrandText text={req.username} />
                      </span>{' '}
                      · Requested {formatDateTime(req.requested_at)}
                      {req.contact_phone ? ` · 📞 ${req.contact_phone}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isResetting || isDismissing}
                      onClick={() =>
                        void executeReset(
                          req.account_type,
                          req.account_id,
                          req.account_name
                        )
                      }
                      className="glass-plum text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:opacity-95 disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {isResetting ? 'Resetting...' : 'Reset Password'}
                    </button>
                    <button
                      type="button"
                      disabled={isResetting || isDismissing}
                      onClick={() => void handleDismissRequest(req.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-milk-border bg-white text-ink-600 hover:text-vibrant-coral disabled:opacity-50"
                    >
                      {isDismissing ? '...' : 'Dismiss'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact Result Strip after Resetting Password */}
      {lastResetResult && (
        <div className="glass-card rounded-2xl p-3.5 sm:p-4 border border-vibrant-teal/40 bg-vibrant-tealSoft/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs space-y-0.5">
            <div className="font-bold text-plum-950 flex items-center gap-1.5">
              <Check className="w-4 h-4 text-vibrant-teal" />
              <span>
                Credentials Ready for{' '}
                <BrandText text={lastResetResult.accountName} />
              </span>
            </div>
            <p className="text-ink-900">
              User ID:{' '}
              <span className="font-semibold">{lastResetResult.username}</span>{' '}
              · Temp Password:{' '}
              <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-milk-border">
                {lastResetResult.tempPassword}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                openShareModal({
                  role: lastResetResult.accountType,
                  accountName: lastResetResult.accountName,
                  username: lastResetResult.username,
                  loginCode: lastResetResult.loginCode,
                  passwordToShare: lastResetResult.tempPassword,
                  contactPhone: lastResetResult.contactPhone,
                })
              }
              className="px-3.5 py-2 rounded-xl glass-plum text-white text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5 shadow-xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share Credentials
            </button>
            <button
              type="button"
              onClick={() => setLastResetResult(null)}
              aria-label="Close reset result"
              className="p-1.5 rounded-lg text-ink-600 hover:text-plum-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* All Sectors & Units Credentials Hub */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-plum-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-plum-900" />
              <span>Credentials &amp; WhatsApp Hub</span>
            </h2>
            <p className="text-xs text-ink-600 mt-0.5">
              Manage Sector/Unit User IDs, contact phones, password resets, and
              one-click WhatsApp login links.
            </p>
          </div>
          <span className="glass-pill px-2.5 py-1 rounded-full text-[11px] font-semibold text-plum-900 self-start num shrink-0">
            {totalCount} {totalCount === 1 ? 'account' : 'accounts'}
          </span>
        </div>

        {/* Modern Expanded Filter Toolbar (Backend-Powered) */}
        <div
          className={`relative z-20 ${
            isDesktop
              ? 'flex items-center gap-2.5 flex-wrap'
              : 'flex flex-col gap-2.5'
          }`}
        >
          <div className="relative flex-1 min-w-[210px]">
            <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account, code, phone..."
              className="w-full pl-8 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-milk-border bg-white/90 text-ink-900 placeholder:text-ink-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear account search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-plum-900 p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <SelectDropdown
            value={sectorFilter}
            onChange={handleSectorChange}
            ariaLabel="Filter credentials by sector"
            className={isDesktop ? 'w-56' : 'w-full'}
            options={[
              { value: 'ALL', label: 'All Sectors' },
              ...sortedSectors.map((s) => ({
                value: String(s.id),
                label: `${s.name} (${s.login_code})`,
              })),
            ]}
          />

          <div
            className={`glass-pill p-0.5 rounded-full inline-flex text-[11px] ${
              isDesktop ? 'ml-auto' : 'w-full justify-between'
            }`}
          >
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'SECTOR', label: 'Sectors' },
                { id: 'UNIT', label: 'Units' },
                {
                  id: 'PENDING',
                  label: `Pending${pendingResetRequests.length > 0 ? ` (${pendingResetRequests.length})` : ''}`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRoleFilter(tab.id)}
                className={`${
                  isDesktop ? 'px-3' : 'flex-1 px-2 text-center'
                } py-1.5 rounded-full font-semibold transition-colors whitespace-nowrap ${
                  roleFilter === tab.id
                    ? 'glass-plum text-white shadow-2xs'
                    : 'text-ink-600 hover:text-plum-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Filter Context Bar */}
        {hasActiveFilter && (
          <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 rounded-xl bg-milk-50 border border-milk-border/80 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap text-ink-600">
              <span className="font-semibold text-plum-900">Showing:</span>
              <span>
                {roleFilter === 'SECTOR'
                  ? 'Sectors'
                  : roleFilter === 'UNIT'
                    ? 'Units'
                    : roleFilter === 'PENDING'
                      ? 'Pending Reset Requests'
                      : 'Sectors & Units'}
              </span>
              {selectedSectorName && (
                <span className="glass-pill px-2 py-0.5 rounded-full text-[11px] font-semibold text-plum-900">
                  in {selectedSectorName}
                </span>
              )}
              {debouncedSearch.trim() && (
                <span className="glass-pill px-2 py-0.5 rounded-full text-[11px] font-medium text-ink-900">
                  “{debouncedSearch.trim()}”
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSectorFilter('ALL');
                setRoleFilter('ALL');
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-plum-900 hover:underline shrink-0"
            >
              <X className="w-3 h-3" />
              Reset filters
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-xs text-ink-600 py-6 text-center">
            {fetching
              ? 'Loading matching accounts...'
              : 'No matching accounts found.'}
          </p>
        ) : isDesktop ? (
          <div
            className={`glass-table border border-milk-border rounded-xl overflow-hidden transition-opacity ${
              fetching ? 'opacity-65' : ''
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="glass-table-head text-ink-600 uppercase tracking-wide border-b border-milk-border">
                    <th className="py-2.5 px-3 font-semibold">Account</th>
                    <th className="py-2.5 px-3 font-semibold">User ID</th>
                    <th className="py-2.5 px-3 font-semibold">Code</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Contact Phone</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-milk-border/70">
                  {rows.map((acc) => {
                    const draft = phoneDrafts[acc.key] ?? '';
                    const isPhoneDirty = draft.trim() !== acc.contactPhone.trim();
                    const isSavingPhone = savingPhoneKey === acc.key;
                    const tempPwd = recentTempPasswords[acc.key];
                    const passwordToShare =
                      tempPwd ??
                      (!acc.hasCustomPassword
                        ? acc.loginCode
                        : '(Your custom password)');

                    return (
                      <tr
                        key={acc.key}
                        className="hover:bg-plum-50/60 transition-colors"
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-plum-950">
                              <BrandText text={acc.name} />
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                acc.accountType === 'SECTOR'
                                  ? 'bg-vibrant-tealSoft text-vibrant-teal'
                                  : 'bg-vibrant-amberSoft text-vibrant-amber'
                              }`}
                            >
                              {acc.accountType === 'SECTOR' ? 'Sector' : 'Unit'}
                            </span>
                          </div>
                          <span className="text-[11px] text-ink-600 block">
                            {acc.subtitle}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 font-medium text-ink-900">
                          <BrandText text={acc.username} />
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="bg-plum-100 text-plum-900 font-mono text-[11px] px-2 py-0.5 rounded font-semibold">
                            {acc.loginCode}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {acc.isResetPending ? (
                            <span className="bg-vibrant-coralSoft text-vibrant-coral px-2 py-0.5 rounded-full text-[10px] font-bold">
                              Reset Pending
                            </span>
                          ) : acc.hasCustomPassword ? (
                            <span className="bg-vibrant-tealSoft text-vibrant-teal px-2 py-0.5 rounded-full text-[10px] font-semibold">
                              Custom Password
                            </span>
                          ) : (
                            <span className="bg-vibrant-amberSoft text-vibrant-amber px-2 py-0.5 rounded-full text-[10px] font-semibold">
                              Default Code
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <Phone className="w-3 h-3 text-ink-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type="tel"
                                inputMode="numeric"
                                maxLength={15}
                                value={draft}
                                onKeyDown={blockNegativeNumericKeys}
                                onChange={(e) =>
                                  setPhoneDrafts((prev) => ({
                                    ...prev,
                                    [acc.key]: sanitizePositiveInteger(
                                      e.target.value
                                    ),
                                  }))
                                }
                                placeholder="10-digit phone"
                                aria-label={`Contact phone for ${acc.name}`}
                                className="pl-6 pr-2 py-1 text-xs rounded-lg border border-milk-border bg-white text-ink-900 w-32 num"
                              />
                            </div>
                            {isPhoneDirty && (
                              <button
                                type="button"
                                disabled={isSavingPhone}
                                onClick={() => void handleSavePhone(acc)}
                                className="px-2 py-1 rounded-lg glass-plum text-white text-[11px] font-semibold disabled:opacity-50"
                              >
                                {isSavingPhone ? '...' : 'Save'}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setResetModalAccount(acc);
                                setCustomTempPassword('');
                              }}
                              className="px-2.5 py-1 rounded-lg border border-milk-border bg-white text-plum-900 hover:bg-milk-100 font-semibold inline-flex items-center gap-1 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reset
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openShareModal({
                                  role: acc.accountType,
                                  accountName: acc.name,
                                  username: acc.username,
                                  loginCode: acc.loginCode,
                                  passwordToShare,
                                  contactPhone: draft || acc.contactPhone,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg glass-plum text-white hover:opacity-95 font-semibold inline-flex items-center gap-1 transition-opacity"
                            >
                              <Share2 className="w-3 h-3" />
                              Share
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div
            className={`space-y-2.5 transition-opacity ${
              fetching ? 'opacity-65' : ''
            }`}
          >
            {rows.map((acc) => {
              const draft = phoneDrafts[acc.key] ?? '';
              const isPhoneDirty = draft.trim() !== acc.contactPhone.trim();
              const isSavingPhone = savingPhoneKey === acc.key;
              const tempPwd = recentTempPasswords[acc.key];
              const passwordToShare =
                tempPwd ??
                (!acc.hasCustomPassword
                  ? acc.loginCode
                  : '(Your custom password)');

              return (
                <div
                  key={acc.key}
                  className="bg-milk-50 border border-milk-border rounded-xl p-3 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-plum-950">
                          <BrandText text={acc.name} />
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            acc.accountType === 'SECTOR'
                              ? 'bg-vibrant-tealSoft text-vibrant-teal'
                              : 'bg-vibrant-amberSoft text-vibrant-amber'
                          }`}
                        >
                          {acc.accountType === 'SECTOR' ? 'Sector' : 'Unit'}
                        </span>
                        <span className="bg-plum-100 text-plum-900 font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold">
                          {acc.loginCode}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-600 mt-0.5">
                        User ID:{' '}
                        <span className="font-semibold text-ink-900">
                          <BrandText text={acc.username} />
                        </span>{' '}
                        · {acc.subtitle}
                      </p>
                    </div>

                    {acc.isResetPending ? (
                      <span className="bg-vibrant-coralSoft text-vibrant-coral px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0">
                        Reset Pending
                      </span>
                    ) : acc.hasCustomPassword ? (
                      <span className="bg-vibrant-tealSoft text-vibrant-teal px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0">
                        Custom
                      </span>
                    ) : (
                      <span className="bg-vibrant-amberSoft text-vibrant-amber px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Phone className="w-3 h-3 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={15}
                        value={draft}
                        onKeyDown={blockNegativeNumericKeys}
                        onChange={(e) =>
                          setPhoneDrafts((prev) => ({
                            ...prev,
                            [acc.key]: sanitizePositiveInteger(e.target.value),
                          }))
                        }
                        placeholder="Contact phone (10 digits)"
                        className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded-lg border border-milk-border bg-white text-ink-900 num"
                      />
                    </div>
                    {isPhoneDirty && (
                      <button
                        type="button"
                        disabled={isSavingPhone}
                        onClick={() => void handleSavePhone(acc)}
                        className="px-3 py-1.5 rounded-lg glass-plum text-white text-xs font-semibold"
                      >
                        {isSavingPhone ? '...' : 'Save'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setResetModalAccount(acc);
                        setCustomTempPassword('');
                      }}
                      className="py-1.5 px-3 rounded-lg border border-milk-border bg-white text-plum-900 text-xs font-semibold inline-flex items-center justify-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset Password
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openShareModal({
                          role: acc.accountType,
                          accountName: acc.name,
                          username: acc.username,
                          loginCode: acc.loginCode,
                          passwordToShare,
                          contactPhone: draft || acc.contactPhone,
                        })
                      }
                      className="py-1.5 px-3 rounded-lg glass-plum text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Share
                    </button>
                  </div>
                </div>
              );
            })}
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

      {/* Password Reset Confirmation Modal */}
      {resetModalAccount && (
        <div
          className="fixed inset-0 z-50 bg-plum-950/45 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-reset-modal-title"
        >
          <div className="w-full max-w-md glass-card bg-white/95 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="admin-reset-modal-title"
                  className="text-base font-bold text-plum-950"
                >
                  Reset Password
                </h3>
                <p className="text-xs text-ink-600 mt-0.5">
                  Reset password for{' '}
                  <span className="font-semibold text-ink-900">
                    <BrandText text={resetModalAccount.name} />
                  </span>{' '}
                  ({resetModalAccount.loginCode}). Any active login sessions for
                  this account will be revoked immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetModalAccount(null)}
                aria-label="Close modal"
                className="p-1.5 rounded-full text-ink-600 hover:text-plum-900 hover:bg-milk-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label
                htmlFor="admin-temp-pwd"
                className="block text-xs font-semibold text-ink-900 mb-1"
              >
                Optional Custom Temporary Password
              </label>
              <input
                id="admin-temp-pwd"
                type="text"
                placeholder={`Leave blank to reset to default code (${resetModalAccount.loginCode})`}
                value={customTempPassword}
                onChange={(e) => setCustomTempPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-milk-border bg-white text-ink-900"
              />
              <p className="text-[11px] text-ink-600 mt-1">
                Leave blank to reset back to{' '}
                <span className="font-mono font-semibold">
                  {resetModalAccount.loginCode}
                </span>
                , or enter at least 4 characters. User will be required to
                change password on next login.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setResetModalAccount(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-600 hover:bg-milk-100 border border-milk-border"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resettingKey === resetModalAccount.key}
                onClick={() =>
                  void executeReset(
                    resetModalAccount.accountType,
                    resetModalAccount.accountId,
                    resetModalAccount.name,
                    customTempPassword
                  )
                }
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white glass-plum hover:opacity-95 disabled:opacity-50"
              >
                {resettingKey === resetModalAccount.key
                  ? 'Resetting...'
                  : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Credentials Modal (Preview + Copy + WhatsApp) */}
      {shareModalParams && (
        <div
          className="fixed inset-0 z-50 bg-plum-950/45 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-credentials-modal-title"
        >
          <div className="w-full max-w-md glass-card bg-white/95 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="share-credentials-modal-title"
                  className="text-base font-bold text-plum-950 flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4 text-plum-900" />
                  <span>Share Credentials</span>
                </h3>
                <p className="text-xs text-ink-600 mt-0.5">
                  Send via WhatsApp or copy the login details below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareModalParams(null)}
                aria-label="Close share modal"
                className="p-1.5 rounded-full text-ink-600 hover:text-plum-900 hover:bg-milk-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Compact Account + User ID + Password Summary */}
            <div className="bg-milk-50 border border-milk-border rounded-2xl p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-600">
                  {shareModalParams.role === 'SECTOR' ? 'Sector' : 'Unit'}
                </span>
                <span className="font-bold text-plum-950">
                  <BrandText text={shareModalParams.accountName} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-600">User ID</span>
                <span className="font-semibold text-ink-900">
                  <BrandText text={shareModalParams.username} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-600">Password</span>
                <span className="font-mono font-bold text-plum-900 bg-white px-2 py-0.5 rounded border border-milk-border">
                  {shareModalParams.passwordToShare}
                </span>
              </div>
            </div>

            {/* Visible Share Text Preview */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-600 mb-1">
                Message Preview
              </span>
              <pre className="w-full whitespace-pre-wrap break-words font-sans text-xs bg-white border border-milk-border rounded-xl p-3 text-ink-900 leading-relaxed select-all">
                {buildCredentialShareText(shareModalParams)}
              </pre>
            </div>

            {/* Two Share Options: Copy & WhatsApp */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void handleCopyShareText()}
                className="py-2.5 px-4 rounded-xl border border-milk-border bg-white hover:bg-milk-100 text-plum-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                {shareCopied ? (
                  <>
                    <Check className="w-4 h-4 text-vibrant-teal" />
                    <span className="text-vibrant-teal">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => openWhatsAppShare(shareModalParams)}
                className="py-2.5 px-4 rounded-xl glass-forest text-white hover:opacity-95 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-opacity shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
