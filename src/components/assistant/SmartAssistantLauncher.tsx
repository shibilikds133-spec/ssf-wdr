import { lazy, Suspense, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BotMessageSquare, X } from 'lucide-react';
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
  plum: 'glass-agent-plum text-[#FDFBF8]',
  forest: 'glass-agent-forest text-[#F9FCF6]',
  orange: 'glass-agent-orange text-[#FDFDF1]',
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
        className={`${positionClass} h-12 w-12 rounded-full relative overflow-hidden flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-95 ${LAUNCHER_STYLES[theme]}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[1.5px] rounded-full bg-gradient-to-b from-white/30 via-white/5 to-transparent"
        />
        {isOpen ? (
          <X className="relative z-10 w-5 h-5" strokeWidth={2.2} />
        ) : (
          <BotMessageSquare
            className="relative z-10 w-[22px] h-[22px] drop-shadow-sm"
            strokeWidth={2.1}
          />
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
