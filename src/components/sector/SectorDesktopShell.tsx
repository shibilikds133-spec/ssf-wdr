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
  SlidersHorizontal,
} from 'lucide-react';
import { BrandText } from '../BrandText';
import { PageDocsButton } from '../docs/PageDocsButton';
import { SsfLogo } from '../SsfLogo';

interface SectorDesktopShellProps {
  children: ReactNode;
  sector: {
    id: number;
    name: string;
    login_code: string;
  };
  refreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { to: '/sector', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/sector/units', label: 'Units', icon: Building2, end: false },
  { to: '/sector/entries', label: 'Orders', icon: ListChecks, end: false },
  { to: '/sector/reports', label: 'Reports', icon: FileBarChart2, end: false },
  { to: '/sector/manage', label: 'Manage', icon: SlidersHorizontal, end: false },
] as const;

function getPageLabel(pathname: string): string {
  if (pathname.startsWith('/sector/units')) return 'Units';
  if (pathname.startsWith('/sector/entries')) return 'Orders';
  if (pathname.startsWith('/sector/reports')) return 'Reports';
  if (pathname.startsWith('/sector/manage')) return 'Manage';
  return 'Dashboard';
}

export function SectorDesktopShell({
  children,
  sector,
  refreshing,
  onRefresh,
  onLogout,
}: SectorDesktopShellProps) {
  const location = useLocation();
  const activeLabel = getPageLabel(location.pathname);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className="h-screen overflow-hidden flex flex-col sector-theme-bg text-[#10241C]">
      <div className="shrink-0 w-full [scrollbar-gutter:stable]">
        <header className="max-w-[1360px] mx-auto px-6 pt-5 pb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Left: SSF Brand Logo + BrandText + Sector Name + Active Page */}
          <div className="flex items-center gap-3 min-w-0 justify-self-start">
            <Link
              to="/sector"
              className="flex items-center justify-center shrink-0 hover:opacity-85 transition-opacity"
              aria-label="Sector Portal Dashboard"
            >
              <SsfLogo className="h-6 w-auto shrink-0" />
            </Link>
            <div className="flex items-baseline gap-2 min-w-0">
              <BrandText
                text="SSF Wandoor"
                ssfClassName="text-forest-950 text-lg"
                className="font-bold text-forest-900 text-base truncate"
              />
              <span className="text-leaf-border text-sm">/</span>
              <span className="text-sm font-semibold text-forest-900 truncate">
                {sector.name}
              </span>
              <span className="text-leaf-border text-sm">/</span>
              <span className="text-sm font-medium text-forest-600 whitespace-nowrap">
                {activeLabel}
              </span>
            </div>
          </div>

          {/* Center: Floating Pill Nav (Forest/Leaf, Locked Center Column) */}
          <nav
            aria-label="Sector Navigation"
            className="glass-leaf-card rounded-full p-1.5 flex items-center gap-1 shadow-sm justify-self-center transform-gpu will-change-transform"
          >
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  isActive
                    ? 'glass-forest text-white rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors duration-150 shadow-xs whitespace-nowrap'
                    : 'border border-transparent text-forest-700 hover:text-forest-950 px-4 py-1.5 text-sm font-medium rounded-full flex items-center gap-1.5 transition-colors duration-150 hover:bg-leaf-100/70 whitespace-nowrap'
                }
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2 shrink-0 justify-self-end">
            <PageDocsButton theme="forest" labelBreakpoint="xl" />

            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh sector data"
              aria-label="Refresh sector data"
              className="w-9 h-9 rounded-full glass-leaf-card flex items-center justify-center text-forest-900 hover:bg-white disabled:opacity-60 transition-colors shadow-2xs"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>

            <Link
              to="/"
              title="Public View"
              aria-label="Open Public Leaderboard"
              className="w-9 h-9 rounded-full glass-leaf-card flex items-center justify-center text-forest-900 hover:bg-white transition-colors shadow-2xs"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>

            {/* Sector Profile Pill with Login Code */}
            <div className="glass-leaf-card rounded-full pl-1.5 pr-2.5 py-1 flex items-center gap-2 shadow-2xs">
              <span className="bg-forest-900 text-leaf-200 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 num">
                SEC
              </span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-bold text-forest-950 truncate max-w-[120px]">
                  {sector.name}
                </span>
                <span className="bg-leaf-100 text-forest-800 border border-leaf-border text-[10px] font-bold px-1.5 py-0.2 rounded-full num">
                  {sector.login_code}
                </span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                title="Logout"
                aria-label="Logout"
                className="p-1 rounded-full text-forest-600 hover:text-vibrant-coral hover:bg-vibrant-coralSoft/60 transition-colors ml-1"
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
