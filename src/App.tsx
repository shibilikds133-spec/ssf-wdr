import { lazy, Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AppLoader } from './components/AppLoader';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SmartAssistantLauncher } from './components/assistant/SmartAssistantLauncher';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DocsProvider, useDocs } from './context/DocsContext';
import { usePortalEdgeTheme } from './utils/portalEdgeTheme';
import {
  isAppInstalledStandalone,
  isPwaUpdateAvailable,
  subscribePwaUpdate,
} from './utils/pwaAutoUpdate';
import { hasPwaInstalledFlag } from './utils/registerSw';

const PwaInstallBanner = lazy(() => import('./components/PwaInstallBanner'));
const PushPermissionModal = lazy(
  () => import('./components/PushPermissionModal')
);
const PageDocsModal = lazy(() => import('./components/docs/PageDocsModal'));
const PwaUpdateModal = lazy(() => import('./components/PwaUpdateModal'));
const PublicPage = lazy(() => import('./pages/PublicPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const FirstLoginSetupPage = lazy(() => import('./pages/FirstLoginSetupPage'));
const UnitDashboardPage = lazy(() => import('./pages/UnitDashboardPage'));
const SectorDashboardPage = lazy(() => import('./pages/SectorDashboardPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));

function isAuthenticatedPortalRoute(pathname: string, role?: string): boolean {
  if (role === 'ADMIN') return pathname.startsWith('/admin');
  if (role === 'SECTOR') return pathname.startsWith('/sector');
  if (role === 'UNIT') return pathname.startsWith('/dashboard');
  return false;
}

function PortalEdgeBackdrop() {
  const { pathname } = useLocation();
  const theme = usePortalEdgeTheme(pathname);

  return (
    <div
      aria-hidden="true"
      data-portal-edge={theme.key}
      className={`fixed inset-0 -z-10 pointer-events-none min-h-[100lvh] w-full ${theme.canvasClass}`}
    />
  );
}

/**
 * Mounts global modals/banners strictly on-demand so 0 KB of Docs, Push,
 * Install Banner, or Update Modal chunks load on `/` initial boot.
 */
function LazyGlobalOverlays() {
  const { session } = useAuth();
  const { isOpen: isDocsOpen, presentationMode } = useDocs();
  const { pathname } = useLocation();

  const [updateWaiting, setUpdateWaiting] = useState<boolean>(
    () => isAppInstalledStandalone() && isPwaUpdateAvailable()
  );
  const [installBannerReady, setInstallBannerReady] = useState(false);

  useEffect(() => {
    const sync = (available: boolean) => {
      setUpdateWaiting(available && isAppInstalledStandalone());
    };
    sync(isPwaUpdateAvailable());
    return subscribePwaUpdate(sync);
  }, []);

  // Defer PWA Install Banner chunk load until after initial paint / idle (2000ms)
  useEffect(() => {
    if (isAppInstalledStandalone() || hasPwaInstalledFlag()) {
      return;
    }
    const timer = window.setTimeout(() => {
      setInstallBannerReady(true);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, []);

  const shouldLoadDocsModal = isDocsOpen && presentationMode === 'modal';
  const shouldLoadPortalPushModal = Boolean(
    session &&
      !session.must_change_password &&
      isAuthenticatedPortalRoute(pathname, session.role)
  );

  return (
    <>
      {installBannerReady && (
        <Suspense fallback={null}>
          <PwaInstallBanner />
        </Suspense>
      )}
      {shouldLoadDocsModal && (
        <Suspense fallback={null}>
          <PageDocsModal />
        </Suspense>
      )}
      <SmartAssistantLauncher />
      {shouldLoadPortalPushModal && (
        <Suspense fallback={null}>
          <PushPermissionModal />
        </Suspense>
      )}
      {updateWaiting && (
        <Suspense fallback={null}>
          <PwaUpdateModal />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PortalEdgeBackdrop />
      <AuthProvider>
        <DocsProvider>
          <Suspense fallback={<AppLoader fullScreen />}>
            <Routes>
              <Route path="/" element={<PublicPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup-password" element={<FirstLoginSetupPage />} />
              <Route
                path="/dashboard/*"
                element={
                  <ProtectedRoute allowedRoles={['UNIT']}>
                    <UnitDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sector/*"
                element={
                  <ProtectedRoute allowedRoles={['SECTOR']}>
                    <SectorDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <LazyGlobalOverlays />
        </DocsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
