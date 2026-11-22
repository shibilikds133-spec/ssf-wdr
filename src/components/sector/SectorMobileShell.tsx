import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Building2,
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

interface SectorMobileShellProps {
  children: ReactNode;
  sector: {
    id: number;
    name: string;
    login_code: string;
  };
  isChallengeOpen: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

const MOBILE_TABS = [
  { to: '/sector', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/sector/units', label: 'Units', icon: Building2, end: false },
  { to: '/sector/entries', label: 'Orders', icon: ListChecks, end: false },
  { to: '/sector/reports', label: 'Reports', icon: FileBarChart2, end: false },
  { to: '/sector/manage', label: 'Manage', icon: SlidersHorizontal, end: false },
] as const;

export function SectorMobileShell({
  children,
  sector,
  isChallengeOpen,
  refreshing,
  onRefresh,
  onLogout,
}: SectorMobileShellProps) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col sector-theme-bg text-[#10241C]">
      {/* Header */}
      <header className="h-14 shrink-0 z-30 glass-leaf-header px-4 sm:px-6 flex items-center justify-between gap-2 transform-gpu">
        <div className="flex items-center gap-2.5 min-w-0">
          <SsfLogo className="h-5 w-auto shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <BrandText
              text="SSF Wandoor"
              ssfClassName="text-forest-950 text-base"
              className="text-forest-900 font-bold text-sm truncate"
            />
            <span className="text-leaf-border">·</span>
            <span className="text-xs font-bold text-forest-950 truncate max-w-[100px]">
              {sector.name}
            </span>
            <span className="bg-leaf-100 text-forest-800 border border-leaf-border text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 num">
              {sector.login_code}
            </span>
            <span
              title={isChallengeOpen ? 'Orders Open' : 'Orders Closed'}
              aria-label={isChallengeOpen ? 'Orders Open' : 'Orders Closed'}
              className={`w-2 h-2 rounded-full shrink-0 ${
                isChallengeOpen ? 'bg-vibrant-tealMid shadow-xs' : 'bg-vibrant-coral shadow-xs'
              }`}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PageDocsButton theme="forest" labelBreakpoint="sm" />
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh sector data"
            className="w-9 h-9 rounded-full bg-leaf-100/90 border border-leaf-border text-forest-900 flex items-center justify-center hover:bg-white transition-colors disabled:opacity-60 shadow-xs"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Logout"
            className="w-9 h-9 rounded-full bg-leaf-100/90 border border-leaf-border text-forest-900 flex items-center justify-center hover:bg-white hover:text-vibrant-coral transition-colors shadow-xs"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main
        ref={mainRef}
        className="flex-1 min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="px-4 sm:px-6 pt-4 pb-24 max-w-4xl mx-auto">
          {children}
        </div>
      </main>

      {/* Bottom Navigation Bar */}
      <nav
        aria-label="Sector Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 glass-leaf-card bg-white/95 border-t border-leaf-border pb-[env(safe-area-inset-bottom)] transform-gpu will-change-transform"
      >
        <div className="grid grid-cols-5 h-16 max-w-2xl mx-auto">
          {MOBILE_TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="min-w-0 px-0.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`px-2.5 py-1 rounded-full transition-colors duration-150 ${
                      isActive
                        ? 'bg-forest-100 text-forest-950'
                        : 'text-forest-600 hover:text-forest-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span
                    className={`truncate max-w-full leading-none ${
                      isActive ? 'text-forest-950' : 'text-forest-600'
                    }`}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
