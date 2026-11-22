import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { AppLoader } from '../components/AppLoader';
import { ExportReportModal } from '../components/ExportReportModal';
import { MarkPaidModal } from '../components/MarkPaidModal';
import { PortalReportsPage } from '../components/reports/PortalReportsPage';
import { SectorDashboardDesktop } from '../components/sector/SectorDashboardDesktop';
import { SectorDashboardMobile } from '../components/sector/SectorDashboardMobile';
import { SectorDesktopShell } from '../components/sector/SectorDesktopShell';
import { SectorEntriesTab } from '../components/sector/SectorEntriesTab';
import { SectorManageTab } from '../components/sector/SectorManageTab';
import { SectorMobileShell } from '../components/sector/SectorMobileShell';
import { SectorUnitsTab } from '../components/sector/SectorUnitsTab';
import { isSessionExpiredError, useAuth } from '../context/AuthContext';
import { useRegisterPageDocs } from '../context/DocsContext';
import type { DocPageKey } from '../data/malayalamDocs';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { clearCached } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type { EntryItem, SectorDashboardResponse } from '../types';
import type { ReportFilterConfig } from '../utils/reports';

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

function getSectorDocPageKey(pathname: string): DocPageKey {
  if (pathname.startsWith('/sector/units')) return 'sector_units';
  if (
    pathname.startsWith('/sector/entries') ||
    pathname.startsWith('/sector/orders')
  ) {
    return 'sector_orders';
  }
  if (pathname.startsWith('/sector/reports')) return 'sector_reports';
  if (pathname.startsWith('/sector/manage')) return 'sector_manage';
  return 'sector_dashboard';
}

export default function SectorDashboardPage() {
  const { session, logout, handleSessionExpired } = useAuth();
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState<SectorDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnitIdForEntries, setSelectedUnitIdForEntries] = useState<
    number | 'ALL'
  >('ALL');
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
          'sector_get_dashboard',
          { p_code: activeCode }
        );

        if (rpcError) {
          if (isSessionExpiredError(rpcError.message)) {
            handleSessionExpired();
            navigate('/login', { replace: true });
            return;
          }
          setError(rpcError.message || 'Failed to load sector dashboard.');
          return;
        }

        if (!rpcData) {
          setError('No sector dashboard data returned.');
          return;
        }

        hasDataRef.current = true;
        setData(rpcData as SectorDashboardResponse);
        setDataVersion((v) => v + 1);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to reach server for sector dashboard.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleSessionExpired, navigate]
  );

  const sessionIdentity =
    session?.role === 'SECTOR'
      ? `SECTOR:${session.entity_id ?? 0}:${session.login_code}`
      : null;

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

  const activeDocPageKey = getSectorDocPageKey(location.pathname);
  const suspendDocsAutoOpen =
    !session ||
    session.role !== 'SECTOR' ||
    loading ||
    !data ||
    Boolean(markPaidEntry) ||
    Boolean(exportModalConfig);

  useRegisterPageDocs(session?.role === 'SECTOR' ? activeDocPageKey : null, {
    theme: 'forest',
    suspendAutoOpen: suspendDocsAutoOpen,
  });

  if (!session || session.role !== 'SECTOR') {
    return null;
  }

  if (loading && !data) {
    return <AppLoader fullScreen message="Loading Sector Portal..." />;
  }

  const sectorInfo = data?.sector ?? {
    id: session.entity_id ?? 0,
    name: session.sector_name ?? session.name,
    login_code: session.login_code,
  };

  const content = (
    <>
      {toast && (
        <div
          role="status"
          className={`fixed top-16 right-4 z-50 max-w-sm rounded-xl px-4 py-3 shadow-lg border flex items-center gap-2.5 text-xs font-medium ${
            toast.type === 'success'
              ? 'glass-forest text-white border-white/20'
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
        <div className="glass-leaf-card rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm font-medium text-vibrant-coral">{error}</p>
          <button
            type="button"
            onClick={() => void fetchDashboard(false)}
            className="glass-forest text-white text-xs font-semibold px-4 py-2 rounded-xl transition-opacity hover:opacity-95"
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
                  <SectorDashboardDesktop
                    data={data}
                    onOpenExportModal={(cfg) =>
                      setExportModalConfig(cfg ?? { scope: 'ENTIRE_SECTOR' })
                    }
                  />
                ) : (
                  <SectorDashboardMobile
                    data={data}
                    onOpenExportModal={(cfg) =>
                      setExportModalConfig(cfg ?? { scope: 'ENTIRE_SECTOR' })
                    }
                  />
                )
              }
            />
            <Route
              path="units"
              element={
                <SectorUnitsTab
                  isDesktop={isDesktop}
                  sector={data.sector}
                  units={data.units}
                  sectorCode={session.code}
                  refreshKey={dataVersion}
                  sectorTotalQuantity={Number(data.summary.total_quantity) || 0}
                  onSelectUnitForEntries={(unitId) => {
                    setSelectedUnitIdForEntries(unitId);
                    navigate('/sector/entries');
                  }}
                  onError={(msg) => showToast('error', msg)}
                />
              }
            />
            <Route
              path="entries"
              element={
                <SectorEntriesTab
                  isDesktop={isDesktop}
                  sector={data.sector}
                  entries={data.entries}
                  units={data.units}
                  sectorCode={session.code}
                  refreshKey={dataVersion}
                  initialUnitId={selectedUnitIdForEntries}
                  onClearUnitFilter={() => setSelectedUnitIdForEntries('ALL')}
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
                  source={{ role: 'SECTOR', data }}
                  isDesktop={isDesktop}
                  onToast={showToast}
                />
              }
            />
            <Route
              path="manage"
              element={
                <SectorManageTab
                  isDesktop={isDesktop}
                  sector={data.sector}
                  settings={data.settings}
                  units={data.units}
                  pendingResetRequests={data.pending_reset_requests ?? []}
                  sectorCode={session.code}
                  refreshKey={dataVersion}
                  onMutated={handleMutated}
                  onError={(msg) => showToast('error', msg)}
                />
              }
            />
            <Route path="*" element={<Navigate to="/sector" replace />} />
          </Routes>

          {markPaidEntry && (
            <MarkPaidModal
              portal="SECTOR"
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
              source={{ role: 'SECTOR', data }}
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
      <SectorDesktopShell
        sector={sectorInfo}
        refreshing={refreshing}
        onRefresh={() => void fetchDashboard(true)}
        onLogout={handleLogout}
      >
        {content}
      </SectorDesktopShell>
    );
  }

  return (
    <SectorMobileShell
      sector={sectorInfo}
      isChallengeOpen={data?.settings.is_challenge_open ?? true}
      refreshing={refreshing}
      onRefresh={() => void fetchDashboard(true)}
      onLogout={handleLogout}
    >
      {content}
    </SectorMobileShell>
  );
}
