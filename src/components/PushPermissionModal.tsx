import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Bell,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocs } from '../context/DocsContext';
import type { UserRole } from '../types';
import { DOCS_THEME_STYLES, type DocsPortalTheme } from '../utils/docsConfig';
import {
  isPwaUpdateAvailable,
  subscribePwaUpdate,
} from '../utils/pwaAutoUpdate';
import {
  getDeviceNotificationGuide,
  getNotificationPermission,
  getVapidPublicKey,
  isIosNonStandalone,
  isPushDismissCooldownActive,
  isPushSupported,
  markPushPromptDismissed,
  resolveVapidPublicKey,
  subscribePushUiState,
  subscribeToPush,
  watchNotificationPermissionChange,
} from '../utils/pushNotifications';

const SHOW_DELAY_MS = 8000;

const PORTAL_STYLES: Record<
  DocsPortalTheme,
  {
    glassSurface: string;
    accentPill: string;
    iconBadge: string;
    primaryBtn: string;
    secondaryBtn: string;
    topGlow: string;
  }
> = {
  plum: {
    glassSurface:
      'bg-[#FDFBF8]/[0.88] backdrop-blur-2xl border border-[#381932]/[0.20] shadow-[0_24px_64px_-12px_rgba(33,11,29,0.38),inset_0_1px_0_rgba(255,255,255,0.95)]',
    accentPill:
      'glass-plum text-white border border-white/25 shadow-sm',
    iconBadge:
      'glass-plum text-white shadow-lg ring-4 ring-[#381932]/10',
    primaryBtn: 'glass-plum text-white hover:opacity-95',
    secondaryBtn:
      'border border-[#381932]/20 bg-white/85 text-[#210B1D] hover:bg-white',
    topGlow:
      'from-[#381932]/[0.14] via-[#381932]/[0.04] to-transparent',
  },
  forest: {
    glassSurface:
      'bg-[#F9FCF6]/[0.88] backdrop-blur-2xl border border-[#043326]/[0.20] shadow-[0_24px_64px_-12px_rgba(2,28,20,0.38),inset_0_1px_0_rgba(255,255,255,0.95)]',
    accentPill:
      'glass-forest text-white border border-white/25 shadow-sm',
    iconBadge:
      'glass-forest text-white shadow-lg ring-4 ring-[#043326]/10',
    primaryBtn: 'glass-forest text-white hover:opacity-95',
    secondaryBtn:
      'border border-[#043326]/20 bg-white/85 text-[#021C14] hover:bg-white',
    topGlow:
      'from-[#043326]/[0.14] via-[#043326]/[0.04] to-transparent',
  },
  orange: {
    glassSurface:
      'bg-[#FDFDF1]/[0.90] backdrop-blur-2xl border border-[#EC5E27]/[0.26] shadow-[0_24px_64px_-12px_rgba(143,45,13,0.32),inset_0_1px_0_rgba(255,255,255,0.95)]',
    accentPill:
      'glass-orange text-white border border-white/30 shadow-sm',
    iconBadge:
      'glass-orange text-white shadow-lg ring-4 ring-[#EC5E27]/15',
    primaryBtn: 'glass-orange text-white hover:opacity-95',
    secondaryBtn:
      'border border-[#EC5E27]/25 bg-white/85 text-[#4A1404] hover:bg-white',
    topGlow:
      'from-[#EC5E27]/[0.16] via-[#EC5E27]/[0.05] to-transparent',
  },
  public: {
    glassSurface:
      'bg-[#FFF8F6]/[0.92] backdrop-blur-2xl border border-[#5C0A0E]/[0.20] shadow-[0_24px_64px_-12px_rgba(92,10,14,0.34),inset_0_1px_0_rgba(255,255,255,0.95)]',
    accentPill:
      'glass-crimson text-white border border-white/25 shadow-sm',
    iconBadge:
      'glass-crimson text-white shadow-lg ring-4 ring-[#5C0A0E]/15',
    primaryBtn: 'glass-crimson text-white hover:opacity-95',
    secondaryBtn:
      'border border-[#5C0A0E]/20 bg-white/85 text-[#2B0406] hover:bg-white',
    topGlow:
      'from-[#C40E16]/[0.14] via-[#5C0A0E]/[0.04] to-transparent',
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

function hasOtherBlockingOverlay(): boolean {
  if (typeof document === 'undefined') return false;
  if (
    document.querySelector(
      '[role="dialog"][aria-modal="true"]:not([data-push-permission-modal="true"]), [role="alertdialog"][aria-modal="true"]:not([data-push-permission-modal="true"])'
    )
  ) {
    return true;
  }
  if (
    document.querySelector(
      'aside[aria-label="Install Application"], section[aria-label*="Smart Help Assistant"]'
    )
  ) {
    return true;
  }
  return false;
}

export function PushPermissionModal() {
  const { session } = useAuth();
  const { isOpen: isDocsOpen } = useDocs();
  const { pathname } = useLocation();

  const [delayReady, setDelayReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => isPushDismissCooldownActive());
  const [vapidReady, setVapidReady] = useState(() => Boolean(getVapidPublicKey()));
  const [permission, setPermission] = useState(() =>
    getNotificationPermission()
  );
  const [updatePending, setUpdatePending] = useState(() =>
    isPwaUpdateAvailable()
  );
  const [otherBlockingOverlay, setOtherBlockingOverlay] = useState(() =>
    hasOtherBlockingOverlay()
  );
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  const inAuthenticatedPortal = Boolean(
    session &&
      !session.must_change_password &&
      isPortalPath(pathname, session.role)
  );

  useEffect(() => {
    if (!inAuthenticatedPortal || vapidReady) return;
    let active = true;
    void resolveVapidPublicKey().then((key) => {
      if (active && key) {
        setVapidReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [inAuthenticatedPortal, vapidReady]);

  const eligible =
    inAuthenticatedPortal &&
    isPushSupported() &&
    vapidReady &&
    !isIosNonStandalone() &&
    (permission === 'default' || permission === 'denied') &&
    !dismissed;

  const token = session?.token || session?.code || '';

  const handleEnable = useCallback(async () => {
    if (enabling || !token) return;
    setError(null);
    setEnabling(true);
    const result = await subscribeToPush(token);
    const latestPerm = getNotificationPermission();
    setPermission(latestPerm);
    setEnabling(false);

    if (result.ok) {
      setDismissed(true);
      return;
    }

    if (latestPerm === 'denied') {
      // Keep modal open and show the Chrome/System permission unblock guide
      setError(
        'ബ്രൗസറിലോ സിസ്റ്റത്തിലോ നോട്ടിഫിക്കേഷൻ ഓഫ് ആണ്. താഴെ കാണുന്ന സ്റ്റെപ്പുകൾ വഴി Allow ചെയ്ത ശേഷം വീണ്ടും ശ്രമിക്കുക.'
      );
      return;
    }

    setError(result.error || 'നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യാൻ കഴിഞ്ഞില്ല.');
  }, [enabling, token]);

  useEffect(() => {
    const syncPermission = () => setPermission(getNotificationPermission());
    const unsubPush = subscribePushUiState(syncPermission);
    const unsubUpdate = subscribePwaUpdate((available) =>
      setUpdatePending(available)
    );
    const unsubPermWatch = watchNotificationPermissionChange((nextPerm) => {
      setPermission(nextPerm);
      if (nextPerm === 'granted' && inAuthenticatedPortal && !dismissed) {
        void handleEnable();
      }
    });
    return () => {
      unsubPush();
      unsubUpdate();
      unsubPermWatch();
    };
  }, [inAuthenticatedPortal, dismissed, handleEnable]);

  useEffect(() => {
    if (!eligible) {
      setOtherBlockingOverlay(false);
      return;
    }
    setOtherBlockingOverlay(hasOtherBlockingOverlay());
    const interval = window.setInterval(() => {
      setOtherBlockingOverlay(hasOtherBlockingOverlay());
    }, 500);
    return () => window.clearInterval(interval);
  }, [eligible, isDocsOpen, updatePending]);

  const hasAnyOtherPopup = isDocsOpen || updatePending || otherBlockingOverlay;

  // Start the 8-second countdown only after all other popups/modals are closed
  useEffect(() => {
    if (!eligible || hasAnyOtherPopup) {
      setDelayReady(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setDelayReady(true);
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, hasAnyOtherPopup, session?.role, session?.login_code]);

  const visible = eligible && delayReady && !hasAnyOtherPopup;

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
  const isBlocked = permission === 'denied';
  const deviceGuide = isBlocked ? getDeviceNotificationGuide() : null;

  const handleDismiss = () => {
    markPushPromptDismissed();
    setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-push-permission-modal="true"
      aria-labelledby="push-permission-title"
      className={`fixed inset-0 z-[65] ${styles.backdrop} flex items-center justify-center p-4 transition-opacity duration-200 motion-reduce:transition-none ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md overflow-hidden ${cta.glassSurface} rounded-3xl p-6 transition-all duration-200 ease-out motion-reduce:transition-none ${
          entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${cta.topGlow}`}
        />

        <button
          type="button"
          onClick={handleDismiss}
          disabled={enabling}
          aria-label="പിന്നീട്"
          className={`relative z-10 ml-auto flex items-center justify-center p-1.5 rounded-full transition-colors ${styles.closeButton}`}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative z-10 flex flex-col items-center text-center -mt-2">
          <div
            className={`w-14 h-14 rounded-2xl ${cta.iconBadge} flex items-center justify-center mb-3.5`}
          >
            <Bell className="w-7 h-7 text-white" />
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-semibold tracking-wide mb-3 text-white ${cta.accentPill}`}
          >
            <Sparkles className="w-3 h-3 shrink-0 text-white" />
            <span className="text-white">Push Alerts</span>
          </span>

          <h2
            id="push-permission-title"
            className={`font-ml text-lg font-bold ${styles.headingText}`}
          >
            {isBlocked
              ? 'സിസ്റ്റം നോട്ടിഫിക്കേഷൻ അലോ ചെയ്യുക'
              : 'നോട്ടിഫിക്കേഷനുകൾ ഓൺ ചെയ്യുക'}
          </h2>

          <p
            className={`font-ml text-xs sm:text-sm mt-2 leading-relaxed ${styles.bodyText}`}
          >
            {isBlocked
              ? 'നിങ്ങളുടെ ബ്രൗസറിലോ ഫോൺ/സിസ്റ്റം സെറ്റിംഗ്സിലോ നോട്ടിഫിക്കേഷനുകൾ ബ്ലോക്ക് ചെയ്തിരിക്കുകയാണ്. ഓർഡർ അപ്‌ഡേറ്റുകൾ ലഭിക്കാൻ ദയവായി ഇത് Allow ചെയ്യുക.'
              : ROLE_COPY[session.role]}
          </p>

          {isBlocked && deviceGuide && (
            <div
              className={`mt-3.5 w-full rounded-2xl p-3.5 text-left ${styles.tipStrip}`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-bold mb-1.5">
                <Settings2 className="w-3.5 h-3.5 shrink-0" />
                <span>{deviceGuide.platformLabel}</span>
              </div>
              <ol className="font-ml text-[11px] sm:text-xs space-y-1 list-decimal list-inside leading-relaxed">
                {deviceGuide.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {error && (
            <p className="font-ml text-xs text-rose-700 bg-rose-50/95 border border-rose-200 rounded-xl px-3 py-2 mt-3 w-full">
              {error}
            </p>
          )}

          <div className="mt-5 w-full flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              disabled={enabling}
              onClick={() => void handleEnable()}
              className={`flex-1 py-2.5 px-4 rounded-xl font-ml text-xs sm:text-sm font-bold text-white inline-flex items-center justify-center gap-2 shadow-sm transition-opacity disabled:opacity-75 ${cta.primaryBtn}`}
            >
              {enabling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 text-white" />
                  <span className="text-white">പരിശോധിക്കുന്നു...</span>
                </>
              ) : isBlocked ? (
                <>
                  <RefreshCw className="w-4 h-4 shrink-0 text-white" />
                  <span className="text-white">Allow ചെയ്തു — വീണ്ടും ശ്രമിക്കുക</span>
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4 shrink-0 text-white" />
                  <span className="text-white">നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യുക</span>
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
