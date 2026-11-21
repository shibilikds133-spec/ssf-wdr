import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { AppLoader } from '../components/AppLoader';
import { ExportReportModal } from '../components/ExportReportModal';
import { MarkPaidModal } from '../components/MarkPaidModal';
import { OrderEntryModal } from '../components/OrderEntryModal';
import { PortalReportsPage } from '../components/reports/PortalReportsPage';
import { UnitDashboardDesktop } from '../components/unit/UnitDashboardDesktop';
import { UnitDashboardMobile } from '../components/unit/UnitDashboardMobile';
import { UnitDesktopShell } from '../components/unit/UnitDesktopShell';
import { UnitMobileShell } from '../components/unit/UnitMobileShell';
import { UnitOrdersTab } from '../components/unit/UnitOrdersTab';
import { isSessionExpiredError, useAuth } from '../context/AuthContext';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { clearCached } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type { EntryItem, UnitDashboardResponse } from '../types';
import type { ReportFilterConfig } from '../utils/reports';

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

export default function UnitDashboardPage() {
  const { session, logout, handleSessionExpired } = useAuth();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();

  const [data, setData] = useState<UnitDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [quickOrderOpen, setQuickOrderOpen] = useState<boolean>(false);
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
          'unit_get_dashboard',
          { p_code: activeCode }
        );

        if (rpcError) {
          if (isSessionExpiredError(rpcError.message)) {
            handleSessionExpired();
            navigate('/login', { replace: true });
            return;
          }
          setError(rpcError.message || 'Failed to load unit dashboard.');
          return;
        }

        if (!rpcData) {
          setError('No unit dashboard data returned.');
          return;
        }

        hasDataRef.current = true;
        setData(rpcData as UnitDashboardResponse);
        setDataVersion((v) => v + 1);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to reach server for unit dashboard.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleSessionExpired, navigate]
  );

  const sessionIdentity =
    session?.role === 'UNIT'
      ? `UNIT:${session.entity_id ?? 0}:${session.login_code}`
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

  if (!session || session.role !== 'UNIT') {
    return null;
  }

  if (loading && !data) {
    return <AppLoader fullScreen message="Loading Unit Portal..." />;
  }

  const unitInfo = data?.unit ?? {
    name: session.name,
    login_code: session.login_code,
    sector_name: session.sector_name ?? 'Unit Portal',
  };

  const isChallengeOpen = data?.settings.is_challenge_open ?? true;

  const handleOpenQuickOrder = () => {
    if (!isChallengeOpen) {
      showToast('error', 'Orders are currently closed by Division Admin.');
      return;
    }
    setQuickOrderOpen(true);
  };

  const content = (
    <>
      {toast && (
        <div
          role="status"
          className={`fixed top-16 right-4 z-50 max-w-sm rounded-xl px-4 py-3 shadow-lg border flex items-center gap-2.5 text-xs font-medium ${
            toast.type === 'success'
              ? 'glass-orange text-white border-white/20'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-cream-50 shrink-0" />
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
        <div className="glass-cream-card rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm font-medium text-vibrant-coral">{error}</p>
          <button
            type="button"
            onClick={() => void fetchDashboard(false)}
            className="glass-orange text-white text-xs font-semibold px-4 py-2 rounded-xl transition-opacity hover:opacity-95"
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
                  <UnitDashboardDesktop
                    data={data}
                    onOpenQuickOrder={handleOpenQuickOrder}
                    onMarkPaid={(entry) => setMarkPaidEntry(entry)}
                    onOpenExportModal={(cfg) =>
                      setExportModalConfig(cfg ?? { scope: 'THIS_UNIT' })
                    }
                  />
                ) : (
                  <UnitDashboardMobile
                    data={data}
                    onOpenQuickOrder={handleOpenQuickOrder}
                    onMarkPaid={(entry) => setMarkPaidEntry(entry)}
                    onOpenExportModal={(cfg) =>
                      setExportModalConfig(cfg ?? { scope: 'THIS_UNIT' })
                    }
                  />
                )
              }
            />
            <Route
              path="orders"
              element={
                <UnitOrdersTab
                  isDesktop={isDesktop}
                  unit={data.unit}
                  settings={data.settings}
                  entries={data.entries}
                  unitCode={session.code}
                  refreshKey={dataVersion}
                  onOpenQuickOrder={handleOpenQuickOrder}
                  onMarkPaid={(entry) => setMarkPaidEntry(entry)}
                  onError={(msg) => showToast('error', msg)}
                />
              }
            />
            <Route
              path="reports"
              element={
                <PortalReportsPage
                  source={{ role: 'UNIT', data }}
                  isDesktop={isDesktop}
                  onToast={showToast}
                />
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>

          {quickOrderOpen && (
            <OrderEntryModal
              mode="UNIT"
              authCode={session.code}
              isDesktop={isDesktop}
              unitRate={Number(data.settings.unit_rate) || 250}
              challengeTitle={data.settings.challenge_title}
              unitName={data.unit.name}
              unitCode={data.unit.login_code}
              onClose={() => setQuickOrderOpen(false)}
              onOrderCreated={() => handleMutated()}
              onSessionExpired={() => {
                handleSessionExpired();
                navigate('/login', { replace: true });
              }}
            />
          )}

          {markPaidEntry && (
            <MarkPaidModal
              portal="UNIT"
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
              source={{ role: 'UNIT', data }}
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
      <UnitDesktopShell
        unit={unitInfo}
        isChallengeOpen={isChallengeOpen}
        refreshing={refreshing}
        onRefresh={() => void fetchDashboard(true)}
        onLogout={handleLogout}
        onOpenQuickOrder={handleOpenQuickOrder}
      >
        {content}
      </UnitDesktopShell>
    );
  }

  return (
    <UnitMobileShell
      unit={unitInfo}
      isChallengeOpen={isChallengeOpen}
      refreshing={refreshing}
      onRefresh={() => void fetchDashboard(true)}
      onLogout={handleLogout}
      onOpenQuickOrder={handleOpenQuickOrder}
    >
      {content}
    </UnitMobileShell>
  );
}
