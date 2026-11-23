import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getHomeRouteForRole, useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';
import { AppLoader } from './AppLoader';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  children: ReactNode;
}

export function ProtectedRoute({
  allowedRoles,
  children,
}: ProtectedRouteProps) {
  const { session, loading } = useAuth();

  if (loading && !session) {
    return <AppLoader fullScreen />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.must_change_password === true && session.role !== 'UNIT') {
    return <Navigate to="/setup-password" replace />;
  }

  if (!allowedRoles.includes(session.role)) {
    return <Navigate to={getHomeRouteForRole(session.role)} replace />;
  }

  return <>{children}</>;
}
