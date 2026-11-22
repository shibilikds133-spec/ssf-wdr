import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Building2,
  FileBarChart2,
  LayoutGrid,
  ListChecks,
  LogOut,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { BrandText } from '../BrandText';
import { PageDocsButton } from '../docs/PageDocsButton';
import { SsfLogo } from '../SsfLogo';

interface AdminMobileShellProps {
  children: ReactNode;
  isChallengeOpen: boolean;
  refreshing: boolean;
  pendingResetCount?: number;
  onRefresh: () => void;
  onLogout: () => void;
}

const MOBILE_TABS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/units', label: 'Units', icon: Building2, end: false },
  { to: '/admin/entries', label: 'Entries', icon: ListChecks, end: false },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart2, end: false },
  { to: '/admin/settings', label: 'Settings', icon: Settings, end: false },
] as const;

export function AdminMobileShell({
  children,
  isChallengeOpen,
  refreshing,
  pendingResetCount = 0,
  onRefresh,
  onLogout,
}: AdminMobileShellProps) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-transparent text-ink-900">
      <header className="shrink-0 z-30 glass-milk-header pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] transform-gpu">
        <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <SsfLogo className="h-5 w-auto shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <BrandText
                text="SSF Wandoor"
                ssfClassName="text-plum-950 text-lg"
                className="text-plum-900 font-bold text-base truncate"
              />
              <span
                title={isChallengeOpen ? 'Orders Open' : 'Orders Closed'}
                aria-label={isChallengeOpen ? 'Orders Open' : 'Orders Closed'}
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isChallengeOpen ? 'bg-vibrant-tealMid shadow-xs' : 'bg-vibrant-coral shadow-xs'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PageDocsButton theme="plum" labelBreakpoint="sm" />
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh admin data"
              className="w-9 h-9 rounded-full bg-milk-100/90 border border-milk-border text-plum-900 flex items-center justify-center hover:bg-milk-200 transition-colors disabled:opacity-60 shadow-xs"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Logout"
              className="w-9 h-9 rounded-full bg-milk-100/90 border border-milk-border text-plum-900 flex items-center justify-center hover:bg-milk-200 hover:text-vibrant-coral transition-colors shadow-xs"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        className="flex-1 min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] sm:pl-[calc(1.5rem+env(safe-area-inset-left,0px))] sm:pr-[calc(1.5rem+env(safe-area-inset-right,0px))] pt-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-w-4xl mx-auto">
          {children}
        </div>
      </main>

      <nav
        aria-label="Admin Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 glass-card bg-[#FDFBF8]/95 border-t border-milk-border border-b-0 border-x-0 pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] transform-gpu will-change-transform"
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
                    className={`relative px-2.5 py-1 rounded-full transition-colors duration-150 ${
                      isActive
                        ? 'bg-plum-100 text-plum-900'
                        : 'text-ink-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {to === '/admin/settings' && pendingResetCount > 0 && (
                      <span
                        aria-label={`${pendingResetCount} pending reset requests`}
                        className="absolute -top-0.5 right-1 w-2.5 h-2.5 rounded-full bg-vibrant-coral ring-2 ring-white"
                      />
                    )}
                  </span>
                  <span
                    className={`truncate max-w-full leading-none ${
                      isActive ? 'text-plum-900' : 'text-ink-600'
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
