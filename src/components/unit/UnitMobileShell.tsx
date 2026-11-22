import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  FileBarChart2,
  LayoutGrid,
  ListChecks,
  LogOut,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { BrandText } from '../BrandText';
import { PageDocsButton } from '../docs/PageDocsButton';
import { SsfLogo } from '../SsfLogo';

interface UnitMobileShellProps {
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

export function UnitMobileShell({
  children,
  unit,
  isChallengeOpen,
  refreshing,
  onRefresh,
  onLogout,
  onOpenQuickOrder,
}: UnitMobileShellProps) {
  const location = useLocation();
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
    <div className="h-[100dvh] overflow-hidden flex flex-col unit-theme-bg text-[#261812]">
      {/* Header */}
      <header className="h-14 shrink-0 z-30 glass-cream-header px-4 sm:px-6 flex items-center justify-between gap-3 transform-gpu">
        <div className="flex items-center gap-2 min-w-0">
          <SsfLogo className="h-5 w-auto shrink-0" />
          <BrandText
            text={headerTitle}
            ssfClassName="text-[#261812] text-base"
            className="text-[#261812] font-bold text-sm truncate"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <PageDocsButton theme="orange" labelBreakpoint="sm" />
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh unit data"
            className="w-9 h-9 rounded-full bg-[#F6F2E7] border border-[#E5DEC9] text-[#261812] flex items-center justify-center hover:bg-white transition-colors disabled:opacity-60 shadow-xs"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Logout"
            className="w-9 h-9 rounded-full bg-[#F6F2E7] border border-[#E5DEC9] text-[#261812] flex items-center justify-center hover:bg-white hover:text-vibrant-coral transition-colors shadow-xs"
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
        aria-label="Unit Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 glass-cream-card bg-white/95 border-t border-[#E5DEC9] pb-[env(safe-area-inset-bottom)] transform-gpu will-change-transform"
      >
        <div className="grid grid-cols-4 h-16 max-w-2xl mx-auto items-center">
          <NavLink
            to="/dashboard"
            end
            className="min-w-0 px-0.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`px-2.5 py-1 rounded-full transition-colors duration-150 ${
                    isActive
                      ? 'bg-[#FFF1EA] text-[#D44B1A]'
                      : 'text-[#6B5449] hover:text-[#261812]'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </span>
                <span
                  className={`truncate max-w-full leading-none ${
                    isActive ? 'text-[#261812]' : 'text-[#6B5449]'
                  }`}
                >
                  Dashboard
                </span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/dashboard/orders"
            className="min-w-0 px-0.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`px-2.5 py-1 rounded-full transition-colors duration-150 ${
                    isActive
                      ? 'bg-[#FFF1EA] text-[#D44B1A]'
                      : 'text-[#6B5449] hover:text-[#261812]'
                  }`}
                >
                  <ListChecks className="w-4 h-4" />
                </span>
                <span
                  className={`truncate max-w-full leading-none ${
                    isActive ? 'text-[#261812]' : 'text-[#6B5449]'
                  }`}
                >
                  Orders
                </span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/dashboard/reports"
            className="min-w-0 px-0.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`px-2.5 py-1 rounded-full transition-colors duration-150 ${
                    isActive
                      ? 'bg-[#FFF1EA] text-[#D44B1A]'
                      : 'text-[#6B5449] hover:text-[#261812]'
                  }`}
                >
                  <FileBarChart2 className="w-4 h-4" />
                </span>
                <span
                  className={`truncate max-w-full leading-none ${
                    isActive ? 'text-[#261812]' : 'text-[#6B5449]'
                  }`}
                >
                  Reports
                </span>
              </>
            )}
          </NavLink>

          <div className="flex items-center justify-center min-w-0 px-1">
            <button
              type="button"
              onClick={onOpenQuickOrder}
              disabled={!isChallengeOpen}
              title={
                isChallengeOpen
                  ? 'Quick Order'
                  : 'Orders Closed by Division Admin'
              }
              className="glass-orange text-white w-full max-w-[92px] px-2.5 py-2 rounded-full text-[11px] font-bold inline-flex items-center justify-center gap-1 shadow-md disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Order</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
