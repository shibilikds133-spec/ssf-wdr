import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, LogOut } from 'lucide-react';
import { getHomeRouteForRole, useAuth } from '../context/AuthContext';
import { BrandText } from './BrandText';
import { PageDocsButton } from './docs/PageDocsButton';
import { SsfLogo } from './SsfLogo';

export function AppLayout({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/sector') ||
    location.pathname.startsWith('/dashboard')
  ) {
    return <>{children}</>;
  }

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-transparent text-ink-900">
      <header className="sticky top-0 inset-x-0 z-30 glass-milk-header text-plum-900 pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        <div className="max-w-6xl mx-auto h-14 px-4 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 truncate hover:opacity-90 transition-opacity"
          >
            <SsfLogo className="h-5 w-auto shrink-0 drop-shadow-xs" />
            <BrandText
              text="SSF Wandoor"
              className="text-plum-900 font-bold tracking-tight text-base"
              ssfClassName="text-plum-950 text-lg"
            />
            <span className="text-ink-400 mx-1.5">•</span>
            <span className="text-ink-600 text-sm font-semibold">
              Payasam Challenge
            </span>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <PageDocsButton
              theme="plum"
              pageKey="public_leaderboard"
              labelBreakpoint="sm"
            />
            {session ? (
              <>
                <Link
                  to={getHomeRouteForRole(session.role)}
                  className="bg-plum-100/80 text-plum-900 border border-plum-200/60 text-xs px-2.5 py-1 rounded-lg font-semibold hover:bg-plum-100 transition-colors"
                >
                  <BrandText text={session.name} />
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-ink-600 hover:text-plum-900 text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="glass-plum text-white hover:opacity-95 font-medium text-xs px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-all shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">{children}</main>
    </div>
  );
}
