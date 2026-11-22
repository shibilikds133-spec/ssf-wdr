import { lazy, Suspense, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { HelpAssistantRole } from '../../types';
import type { DocsPortalTheme } from '../../utils/docsConfig';

const SmartAssistantDrawer = lazy(() => import('./SmartAssistantDrawer'));

interface AssistantRouteMeta {
  theme: DocsPortalTheme;
  role: HelpAssistantRole;
  hasMobileBottomNav: boolean;
}

function getAssistantRouteMeta(pathname: string): AssistantRouteMeta {
  if (pathname.startsWith('/admin')) {
    return { theme: 'plum', role: 'ADMIN', hasMobileBottomNav: true };
  }
  if (pathname.startsWith('/sector')) {
    return { theme: 'forest', role: 'SECTOR', hasMobileBottomNav: true };
  }
  if (pathname.startsWith('/dashboard')) {
    return { theme: 'orange', role: 'UNIT', hasMobileBottomNav: true };
  }
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup-password')
  ) {
    return { theme: 'plum', role: 'LOGIN', hasMobileBottomNav: false };
  }
  return { theme: 'plum', role: 'PUBLIC', hasMobileBottomNav: false };
}

const LAUNCHER_STYLES: Record<DocsPortalTheme, string> = {
  plum: 'bg-[#381932]/[0.92] text-[#FDFBF8] ring-1 ring-[#FFF3E6]/35 shadow-lg shadow-[#240F20]/30 hover:bg-[#240F20]',
  forest:
    'bg-[#043326]/[0.92] text-[#F9FCF6] ring-1 ring-[#E0FFC2]/35 shadow-lg shadow-[#022118]/30 hover:bg-[#022118]',
  orange:
    'bg-[#EC5E27]/[0.95] text-[#FDFDF1] ring-1 ring-white/40 shadow-lg shadow-[#5C1B07]/30 hover:bg-[#D44B1A]',
};

export function SmartAssistantLauncher() {
  const location = useLocation();
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const { theme, role, hasMobileBottomNav } = getAssistantRouteMeta(
    location.pathname
  );

  const positionClass = hasMobileBottomNav
    ? 'fixed right-3.5 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-5 lg:right-5 z-[45]'
    : 'fixed right-4 bottom-4 sm:bottom-5 sm:right-5 z-[45]';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Smart Help Assistant"
        aria-expanded={isOpen}
        title="സഹായി (Smart Help)"
        className={`${positionClass} h-11 w-11 rounded-full backdrop-blur-md flex items-center justify-center transition-transform duration-150 active:scale-95 ${LAUNCHER_STYLES[theme]}`}
      >
        {isOpen ? (
          <X className="w-5 h-5" />
        ) : (
          <Sparkles className="w-5 h-5" />
        )}
      </button>

      {isOpen && (
        <Suspense fallback={null}>
          <SmartAssistantDrawer
            theme={theme}
            role={role}
            hasMobileBottomNav={hasMobileBottomNav}
            session={session}
            onClose={() => setIsOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}

export default SmartAssistantLauncher;
