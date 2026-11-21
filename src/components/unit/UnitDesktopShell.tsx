import { useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ExternalLink,
  FileBarChart2,
  LayoutGrid,
  ListChecks,
  LogOut,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { BrandText } from '../BrandText';
import { SsfLogo } from '../SsfLogo';

interface UnitDesktopShellProps {
  children: ReactNode;
  unit: {
    name: string;
    login_code: string;
    sector_name: string;
  };
  isChallengeOpen: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenQuickOrder: () => void;
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/dashboard/orders', label: 'Orders', icon: ListChecks, end: false },
  { to: '/dashboard/reports', label: 'Reports', icon: FileBarChart2, end: false },
] as const;

function getPageLabel(pathname: string): string {
  if (pathname.startsWith('/dashboard/orders')) return 'Orders';
  if (pathname.startsWith('/dashboard/reports')) return 'Reports';
  return 'Dashboard';
}

export function UnitDesktopShell({
  children,
  unit,
  isChallengeOpen,
  refreshing,
  onRefresh,
  onLogout,
  onOpenQuickOrder,
}: UnitDesktopShellProps) {
  const location = useLocation();
  const activeLabel = getPageLabel(location.pathname);
  const mainRef = useRef<HTMLElement | null>(null);
  const headerTitle = /^\s*ssf\b/i.test(unit.name)
    ? unit.name
    : `SSF ${unit.name}`;

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className="h-screen overflow-hidden flex flex-col unit-theme-bg text-[#261812]">
      <div className="shrink-0 w-full [scrollbar-gutter:stable]">
        <header className="max-w-[1360px] mx-auto px-6 pt-5 pb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Left: SSF Brand Logo + SSF <Unit Name> + Active Page */}
          <div className="flex items-center gap-3 min-w-0 justify-self-start">
            <Link
              to="/dashboard"
              className="flex items-center justify-center shrink-0 hover:opacity-85 transition-opacity"
              aria-label="Unit Portal Dashboard"
            >
              <SsfLogo className="h-6 w-auto shrink-0" />
            </Link>
            <div className="flex items-center gap-2 min-w-0">
              <BrandText
                text={headerTitle}
                ssfClassName="text-[#261812] text-lg"
                className="font-bold text-[#261812] text-base truncate"
              />
              <span className="text-[#C8BFA8] text-sm">/</span>
              <span className="text-sm font-medium text-[#6B5449] whitespace-nowrap">
                {activeLabel}
              </span>
            </div>
          </div>

          {/* Center: Floating Pill Nav (Orange & Milk, Locked Center Column) */}
          <nav
            aria-label="Unit Navigation"
            className="glass-cream-card rounded-full p-1.5 flex items-center gap-1 shadow-sm justify-self-center transform-gpu will-change-transform"
          >
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  isActive
                    ? 'glass-orange text-white rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors duration-150 shadow-xs whitespace-nowrap'
                    : 'border border-transparent text-[#6B5449] hover:text-[#261812] px-4 py-1.5 text-sm font-medium rounded-full flex items-center gap-1.5 transition-colors duration-150 hover:bg-[#F6F2E7] whitespace-nowrap'
                }
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2 shrink-0 justify-self-end">
            <button
              type="button"
              onClick={onOpenQuickOrder}
              disabled={!isChallengeOpen}
              title={
                isChallengeOpen
                  ? 'Add a new direct unit order'
                  : 'Orders are currently closed by Division Admin'
              }
              className="glass-orange text-white rounded-full px-4 py-2 text-xs font-semibold hover:opacity-95 disabled:opacity-45 disabled:cursor-not-allowed transition-opacity inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Quick Order</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh unit data"
              aria-label="Refresh unit data"
              className="w-9 h-9 rounded-full glass-cream-card flex items-center justify-center text-[#261812] hover:bg-white disabled:opacity-60 transition-colors shadow-2xs"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>

            <Link
              to="/"
              title="Public View"
              aria-label="Open Public Leaderboard"
              className="w-9 h-9 rounded-full glass-cream-card flex items-center justify-center text-[#261812] hover:bg-white transition-colors shadow-2xs"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>

            {/* Unit Profile Pill */}
            <div className="glass-cream-card rounded-full pl-1.5 pr-2.5 py-1 flex items-center gap-2 shadow-2xs">
              <span className="glass-orange text-white w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0">
                UN
              </span>
              <span className="text-xs font-bold text-[#261812] truncate max-w-[120px]">
                {unit.name}
              </span>
              <button
                type="button"
                onClick={onLogout}
                title="Logout"
                aria-label="Logout"
                className="p-1 rounded-full text-[#7A5647] hover:text-vibrant-coral hover:bg-vibrant-coralSoft/60 transition-colors ml-0.5"
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
