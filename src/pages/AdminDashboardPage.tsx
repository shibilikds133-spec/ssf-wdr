import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { AdminDashboardDesktop } from '../components/admin/AdminDashboardDesktop';
import { AdminDashboardMobile } from '../components/admin/AdminDashboardMobile';
import { AdminDesktopShell } from '../components/admin/AdminDesktopShell';
import { AdminMobileShell } from '../components/admin/AdminMobileShell';
import { AdminSettingsTab } from '../components/admin/AdminSettingsTab';
import { AllEntriesTab } from '../components/admin/AllEntriesTab';
import { UnitSummaryTab } from '../components/admin/UnitSummaryTab';
import { AppLoader } from '../components/AppLoader';
import { ExportReportModal } from '../components/ExportReportModal';
import { MarkPaidModal } from '../components/MarkPaidModal';
import { OrderEntryModal } from '../components/OrderEntryModal';
import { PortalReportsPage } from '../components/reports/PortalReportsPage';
import { isSessionExpiredError, useAuth } from '../context/AuthContext';
import { useRegisterPageDocs } from '../context/DocsContext';
import type { DocPageKey } from '../data/malayalamDocs';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { clearCached } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type { AdminDashboardResponse, EntryItem } from '../types';
import type { ReportFilterConfig } from '../utils/reports';

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

function getAdminDocPageKey(pathname: string): DocPageKey {
  if (pathname.startsWith('/admin/units')) return 'admin_units';
  if (pathname.startsWith('/admin/entries')) return 'admin_entries';
  if (pathname.startsWith('/admin/reports')) return 'admin_reports';
  if (pathname.startsWith('/admin/settings')) return 'admin_settings';
  return 'admin_dashboard';
}

export default function AdminDashboardPage() {
  const { session, logout, handleSessionExpired } = useAuth();
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnitIdForEntries, setSelectedUnitIdForEntries] = useState<
    number | 'ALL'
  >('ALL');
  const [addOrderOpen, setAddOrderOpen] = useState<boolean>(false);
  const [exportModalConfig, setExportModalConfig] = useState<
    Partial<ReportFilterConfig> | null
  >(null);
  const [markPaidEntry, setMarkPaidEntry] = useState<EntryItem | null>(null);
  const [dataVersion, setDataVersion] = useState<number>(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const hasDataRef = useRef<boolean>(false);
  const sessionCodeRef = useRef<string | null>(session?.code ?? null);
  sessionCodeRef.current = session?.code ?? null;

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const fetchDashboard = useCallback(
    async (isManualRefresh = false) => {
      const activeCode = sessionCodeRef.current;
      if (!activeCode) return;

      if (isManualRefresh) {
        setRefreshing(true);
      } else if (!hasDataRef.current) {
        setLoading(true);
      }
      setError(null);

      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'admin_get_dashboard',
          { p_code: activeCode }
        );

        if (rpcError) {
          if (isSessionExpiredError(rpcError.message)) {
            handleSessionExpired();
            navigate('/login', { replace: true });
            return;
          }
          setError(rpcError.message || 'Failed to load admin dashboard.');
          return;
        }

        if (!rpcData) {
          setError('No dashboard data returned.');
          return;
        }

        hasDataRef.current = true;
        setData(rpcData as AdminDashboardResponse);
        setDataVersion((v) => v + 1);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to reach server for admin dashboard.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleSessionExpired, navigate]
  );

  const sessionIdentity =
    session?.role === 'ADMIN' ? `ADMIN:${session.login_code}` : null;

  useEffect(() => {
    if (sessionIdentity) {
      void fetchDashboard(false);
    }
    // Fetch on initial mount or account identity change (not on sliding JWT rotation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdentity]);

  const handleMutated = useCallback(
    async (successMessage?: string) => {
      clearCached('wdr_public_stats_v1');
      await fetchDashboard(true);
      if (successMessage) {
        showToast('success', successMessage);
      }
    },
    [fetchDashboard, showToast]
  );

  const handleLogout = useCallback(() => {
    logout();
    navigate('/', { replace: true });
  }, [logout, navigate]);

  const activeDocPageKey = getAdminDocPageKey(location.pathname);
  const suspendDocsAutoOpen =
    !session ||
    session.role !== 'ADMIN' ||
    loading ||
    !data ||
    addOrderOpen ||
    Boolean(markPaidEntry) ||
    Boolean(exportModalConfig);

  useRegisterPageDocs(session?.role === 'ADMIN' ? activeDocPageKey : null, {
    theme: 'plum',
    suspendAutoOpen: suspendDocsAutoOpen,
  });

  if (!session || session.role !== 'ADMIN') {
    return null;
  }

  if (loading && !data) {
    return <AppLoader fullScreen message="Loading Dashboard..." />;
  }

  const content = (
    <>
      {toast && (
        <div
          role="status"
          className={`fixed top-16 right-4 z-50 max-w-sm rounded-xl px-4 py-3 shadow-lg border flex items-center gap-2.5 text-xs font-medium ${
            toast.type === 'success'
              ? 'glass-plum text-white border-white/20'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-vibrant-tealMid shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-vibrant-coral shrink-0" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
            className="text-current/70 hover:text-current"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && !data ? (
        <div className="glass-card rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm font-medium text-vibrant-coral">{error}</p>
          <button
            type="button"
            onClick={() => void fetchDashboard(false)}
            className="glass-plum text-white text-xs font-semibold px-4 py-2 rounded-xl transition-opacity hover:opacity-95"
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <>
          {error && (
            <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-3">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void fetchDashboard(true)}
                className="underline font-semibold"
              >
                Retry
              </button>
            </div>
          )}

          <Routes>
            <Route
              index
              element={
                isDesktop ? (
                  <AdminDashboardDesktop
                    data={data}
                    onOpenAddOrder={() => setAddOrderOpen(true)}
                    onOpenExportModal={(cfg) =>
                      setExportModalConfig(cfg ?? { scope: 'ENTIRE_DIVISION' })
                    }
                  />
                ) : (
                  <AdminDashboardMobile
                    data={data}
                    onOpenAddOrder={() => setAddOrderOpen(true)}
                    onOpenExportModal={(cfg) =>
                      setExportModalConfig(cfg ?? { scope: 'ENTIRE_DIVISION' })
                    }
                  />
                )
              }
            />
            <Route
              path="units"
              element={
                <UnitSummaryTab
                  isDesktop={isDesktop}
                  unitSummaries={data.unit_summaries}
                  sectors={data.sectors}
                  divisionLimit={Number(data.settings.division_target) || 0}
                  adminCode={session.code}
                  refreshKey={dataVersion}
                  onSelectUnitForEntries={(unitId) => {
                    setSelectedUnitIdForEntries(unitId);
                    navigate('/admin/entries');
                  }}
                  onError={(msg) => showToast('error', msg)}
                />
              }
            />
            <Route
              path="entries"
              element={
                <AllEntriesTab
                  isDesktop={isDesktop}
                  entries={data.entries}
                  sectors={data.sectors}
                  units={data.unit_summaries}
                  adminCode={session.code}
                  refreshKey={dataVersion}
                  initialUnitId={selectedUnitIdForEntries}
                  onClearUnitFilter={() => setSelectedUnitIdForEntries('ALL')}
                  onOpenAddOrder={() => setAddOrderOpen(true)}
                  onMarkPaid={(entry) => setMarkPaidEntry(entry)}
                  onMutated={handleMutated}
                  onError={(msg) => showToast('error', msg)}
                />
              }
            />
            <Route
              path="reports"
              element={
                <PortalReportsPage
                  source={{ role: 'ADMIN', data }}
                  isDesktop={isDesktop}
                  onToast={showToast}
                />
              }
            />
            <Route
              path="settings"
              element={
                <AdminSettingsTab
                  isDesktop={isDesktop}
                  settings={data.settings}
                  sectors={data.sectors}
                  unitSummaries={data.unit_summaries}
                  pendingResetRequests={data.pending_reset_requests ?? []}
                  adminCode={session.code}
                  refreshKey={dataVersion}
                  onMutated={handleMutated}
                  onError={(msg) => showToast('error', msg)}
                />
              }
            />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>

          {addOrderOpen && (
            <OrderEntryModal
              mode="ADMIN"
              authCode={session.code}
              isDesktop={isDesktop}
              unitRate={Number(data.settings.unit_rate) || 250}
              challengeTitle={data.settings.challenge_title}
              sectors={data.sectors}
              units={data.unit_summaries}
              onClose={() => setAddOrderOpen(false)}
              onOrderCreated={() => handleMutated()}
              onSessionExpired={() => {
                handleSessionExpired();
                navigate('/login', { replace: true });
              }}
            />
          )}

          {markPaidEntry && (
            <MarkPaidModal
              portal="ADMIN"
              authCode={session.code}
              entry={markPaidEntry}
              isDesktop={isDesktop}
              onClose={() => setMarkPaidEntry(null)}
              onPaid={(msg) => handleMutated(msg)}
              onSessionExpired={() => {
                handleSessionExpired();
                navigate('/login', { replace: true });
              }}
            />
          )}

          {exportModalConfig && (
            <ExportReportModal
              source={{ role: 'ADMIN', data }}
              isDesktop={isDesktop}
              initialConfig={exportModalConfig}
              onClose={() => setExportModalConfig(null)}
              onExportSuccess={(msg) => showToast('success', msg)}
              onExportError={(msg) => showToast('error', msg)}
            />
          )}
        </>
      ) : null}
    </>
  );

  if (isDesktop) {
    return (
      <AdminDesktopShell
        refreshing={refreshing}
        pendingResetCount={data?.pending_reset_requests?.length ?? 0}
        onRefresh={() => void fetchDashboard(true)}
        onLogout={handleLogout}
      >
        {content}
      </AdminDesktopShell>
    );
  }

  return (
    <AdminMobileShell
      isChallengeOpen={data?.settings.is_challenge_open ?? true}
      refreshing={refreshing}
      pendingResetCount={data?.pending_reset_requests?.length ?? 0}
      onRefresh={() => void fetchDashboard(true)}
      onLogout={handleLogout}
    >
      {content}
    </AdminMobileShell>
  );
}
