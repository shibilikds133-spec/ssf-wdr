import { useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Building2,
  ExternalLink,
  FileBarChart2,
  LayoutGrid,
  ListChecks,
  LogOut,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { BrandText } from '../BrandText';
import { SsfLogo } from '../SsfLogo';

interface AdminDesktopShellProps {
  children: ReactNode;
  refreshing: boolean;
  pendingResetCount?: number;
  onRefresh: () => void;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/units', label: 'Units', icon: Building2, end: false },
  { to: '/admin/entries', label: 'Entries', icon: ListChecks, end: false },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart2, end: false },
  { to: '/admin/settings', label: 'Settings', icon: Settings, end: false },
] as const;

function getPageLabel(pathname: string): string {
  if (pathname.startsWith('/admin/units')) return 'Units';
  if (pathname.startsWith('/admin/entries')) return 'Entries';
  if (pathname.startsWith('/admin/reports')) return 'Reports';
  if (pathname.startsWith('/admin/settings')) return 'Settings';
  return 'Dashboard';
}

export function AdminDesktopShell({
  children,
  refreshing,
  pendingResetCount = 0,
  onRefresh,
  onLogout,
}: AdminDesktopShellProps) {
  const location = useLocation();
  const activeLabel = getPageLabel(location.pathname);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-transparent text-ink-900">
      <div className="shrink-0 w-full [scrollbar-gutter:stable]">
        <header className="max-w-[1360px] mx-auto px-6 pt-5 pb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Left: SSF Brand Logo + BrandText + Active Page */}
          <div className="flex items-center gap-3 min-w-0 justify-self-start">
            <Link
              to="/admin"
              className="flex items-center justify-center shrink-0 hover:opacity-85 transition-opacity"
              aria-label="Division Admin Dashboard"
            >
              <SsfLogo className="h-6 w-auto shrink-0" />
            </Link>
            <div className="flex items-baseline gap-2 min-w-0">
              <BrandText
                text="SSF Wandoor"
                ssfClassName="text-plum-900 text-lg"
                className="font-bold text-plum-900 text-base truncate"
              />
              <span className="text-ink-400 text-sm">/</span>
              <span className="text-sm font-medium text-ink-600 whitespace-nowrap">
                {activeLabel}
              </span>
            </div>
          </div>

          {/* Center: Floating Pill Nav (Locked Center Column) */}
          <nav
            aria-label="Admin Navigation"
            className="glass-card rounded-full p-1.5 flex items-center gap-1 shadow-sm justify-self-center transform-gpu will-change-transform"
          >
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  isActive
                    ? 'glass-plum text-white rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors duration-150 whitespace-nowrap'
                    : 'border border-transparent text-ink-600 hover:text-plum-900 px-4 py-1.5 text-sm font-medium rounded-full flex items-center gap-1.5 transition-colors duration-150 hover:bg-milk-100/60 whitespace-nowrap'
                }
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
                {to === '/admin/settings' && pendingResetCount > 0 && (
                  <span className="bg-vibrant-coral text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full num leading-tight">
                    {pendingResetCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2 shrink-0 justify-self-end">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh data"
              aria-label="Refresh admin data"
              className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-plum-900 hover:bg-white disabled:opacity-60 transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>

            <Link
              to="/"
              title="Public View"
              aria-label="Open Public Leaderboard"
              className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-plum-900 hover:bg-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>

            <div className="glass-card rounded-full pl-1.5 pr-2.5 py-1 flex items-center gap-2">
              <span className="bg-vibrant-amber text-white w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0">
                AD
              </span>
              <span className="text-xs font-semibold text-plum-900 whitespace-nowrap">
                Division Admin
              </span>
              <button
                type="button"
                onClick={onLogout}
                title="Logout"
                aria-label="Logout"
                className="p-1 rounded-full text-ink-600 hover:text-vibrant-coral hover:bg-vibrant-coralSoft/60 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>
      </div>

      <main
        ref={mainRef}
        className="flex-1 min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="max-w-[1360px] mx-auto px-6 pt-2 pb-10">{children}</div>
      </main>
    </div>
  );
}
