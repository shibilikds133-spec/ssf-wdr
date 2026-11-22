import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Loader2, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocs } from '../context/DocsContext';
import type { UserRole } from '../types';
import { DOCS_THEME_STYLES, type DocsPortalTheme } from '../utils/docsConfig';
import {
  isPwaUpdateAvailable,
  subscribePwaUpdate,
} from '../utils/pwaAutoUpdate';
import {
  getNotificationPermission,
  getVapidPublicKey,
  isIosNonStandalone,
  isPushDismissCooldownActive,
  isPushSupported,
  markPushPromptDismissed,
  subscribePushUiState,
  subscribeToPush,
} from '../utils/pushNotifications';

const SHOW_DELAY_MS = 6000;

const PORTAL_STYLES: Record<
  DocsPortalTheme,
  {
    primaryBtn: string;
    secondaryBtn: string;
  }
> = {
  plum: {
    primaryBtn: 'glass-plum text-white hover:opacity-95',
    secondaryBtn:
      'border border-[#381932]/20 bg-white/80 text-[#381932] hover:bg-white',
  },
  forest: {
    primaryBtn: 'glass-forest text-white hover:opacity-95',
    secondaryBtn:
      'border border-[#043326]/20 bg-white/80 text-[#043326] hover:bg-white',
  },
  orange: {
    primaryBtn: 'glass-orange text-white hover:opacity-95',
    secondaryBtn:
      'border border-[#EC5E27]/25 bg-white/85 text-[#5C1B07] hover:bg-white',
  },
};

const ROLE_COPY: Record<UserRole, string> = {
  ADMIN:
    'ഓരോ 50 ഓർഡർ മൈൽസ്റ്റോണും ആപ്പ് അപ്‌ഡേറ്റുകളും ഉടൻ അറിയാൻ നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യുക.',
  SECTOR:
    'നിങ്ങളുടെ സെക്ടറിലെ ഓരോ 10 ഓർഡറുകളും ആപ്പ് അപ്‌ഡേറ്റുകളും ഉടൻ അറിയാൻ നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യുക.',
  UNIT:
    'നിങ്ങളുടെ യൂണിറ്റിലെ ഓരോ 10 ഓർഡറുകളും (പോർട്ടലിലും പബ്ലിക് പേജിലും) ആപ്പ് അപ്‌ഡേറ്റുകളും ഉടൻ അറിയാൻ നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യുക.',
};

function resolveTheme(role: UserRole): DocsPortalTheme {
  if (role === 'SECTOR') return 'forest';
  if (role === 'UNIT') return 'orange';
  return 'plum';
}

function isPortalPath(pathname: string, role: UserRole): boolean {
  if (role === 'ADMIN') return pathname.startsWith('/admin');
  if (role === 'SECTOR') return pathname.startsWith('/sector');
  return pathname.startsWith('/dashboard');
}

function hasBlockingOverlay(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.querySelector(
      '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'
    )
  );
}

export function PushPermissionModal() {
  const { session } = useAuth();
  const { isOpen: isDocsOpen } = useDocs();
  const { pathname } = useLocation();

  const [delayReady, setDelayReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => isPushDismissCooldownActive());
  const [permission, setPermission] = useState(() =>
    getNotificationPermission()
  );
  const [updatePending, setUpdatePending] = useState(() =>
    isPwaUpdateAvailable()
  );
  const [blockingOverlay, setBlockingOverlay] = useState(() =>
    hasBlockingOverlay()
  );
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  const inAuthenticatedPortal = Boolean(
    session &&
      !session.must_change_password &&
      isPortalPath(pathname, session.role)
  );

  const eligible =
    inAuthenticatedPortal &&
    isPushSupported() &&
    Boolean(getVapidPublicKey()) &&
    !isIosNonStandalone() &&
    permission === 'default' &&
    !dismissed;

  useEffect(() => {
    const syncPermission = () => setPermission(getNotificationPermission());
    const unsubPush = subscribePushUiState(syncPermission);
    const unsubUpdate = subscribePwaUpdate((available) =>
      setUpdatePending(available)
    );
    return () => {
      unsubPush();
      unsubUpdate();
    };
  }, []);

  useEffect(() => {
    if (!eligible) {
      setDelayReady(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setDelayReady(true);
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, session?.role, session?.login_code]);

  useEffect(() => {
    if (!eligible || !delayReady) return;
    setBlockingOverlay(hasBlockingOverlay());
    const interval = window.setInterval(() => {
      setBlockingOverlay(hasBlockingOverlay());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [eligible, delayReady, isDocsOpen, updatePending]);

  const visible =
    eligible && delayReady && !isDocsOpen && !updatePending && !blockingOverlay;

  useEffect(() => {
    if (!visible) {
      setEntered(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [visible]);

  if (!visible || !session) {
    return null;
  }

  const themeKey = resolveTheme(session.role);
  const styles = DOCS_THEME_STYLES[themeKey];
  const cta = PORTAL_STYLES[themeKey];
  const token = session.token || session.code;

  const handleDismiss = () => {
    markPushPromptDismissed();
    setDismissed(true);
  };

  const handleEnable = async () => {
    if (enabling) return;
    setError(null);
    setEnabling(true);
    const result = await subscribeToPush(token);
    setPermission(getNotificationPermission());
    setEnabling(false);

    if (result.ok) {
      setDismissed(true);
      return;
    }

    if (getNotificationPermission() === 'denied') {
      markPushPromptDismissed();
      setDismissed(true);
      return;
    }

    setError(result.error || 'നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യാൻ കഴിഞ്ഞില്ല.');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-permission-title"
      className={`fixed inset-0 z-[65] ${styles.backdrop} flex items-center justify-center p-4 transition-opacity duration-200 motion-reduce:transition-none ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md ${styles.cardSurface} ${styles.cardBorderShadow} rounded-3xl p-6 transition-all duration-200 ease-out motion-reduce:transition-none ${
          entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={handleDismiss}
          disabled={enabling}
          aria-label="പിന്നീട്"
          className={`absolute top-4 right-4 p-1.5 rounded-full transition-colors ${styles.closeButton}`}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div
            className={`w-14 h-14 rounded-2xl ${styles.iconBadge} shadow-md flex items-center justify-center mb-3.5`}
          >
            <Bell className="w-7 h-7" />
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold mb-2.5 ${styles.portalBadge}`}
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>Push Alerts</span>
          </span>

          <h2
            id="push-permission-title"
            className={`font-ml text-lg font-bold ${styles.headingText}`}
          >
            നോട്ടിഫിക്കേഷനുകൾ ഓൺ ചെയ്യുക
          </h2>

          <p
            className={`font-ml text-xs sm:text-sm mt-2 leading-relaxed ${styles.bodyText}`}
          >
            {ROLE_COPY[session.role]}
          </p>

          {error && (
            <p className="font-ml text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mt-3 w-full">
              {error}
            </p>
          )}

          <div className="mt-5 w-full flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              disabled={enabling}
              onClick={() => void handleEnable()}
              className={`flex-1 py-2.5 px-4 rounded-xl font-ml text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-opacity disabled:opacity-75 ${cta.primaryBtn}`}
            >
              {enabling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>സജ്ജീകരിക്കുന്നു...</span>
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4 shrink-0" />
                  <span>നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യുക</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={enabling}
              onClick={handleDismiss}
              className={`sm:w-28 py-2.5 px-4 rounded-xl font-ml text-xs sm:text-sm font-semibold transition-colors ${cta.secondaryBtn}`}
            >
              പിന്നീട്
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PushPermissionModal;
