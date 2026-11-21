import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLoader } from './components/AppLoader';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';

const PublicPage = lazy(() => import('./pages/PublicPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const FirstLoginSetupPage = lazy(() => import('./pages/FirstLoginSetupPage'));
const UnitDashboardPage = lazy(() => import('./pages/UnitDashboardPage'));
const SectorDashboardPage = lazy(() => import('./pages/SectorDashboardPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  );
}
