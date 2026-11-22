import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, X } from 'lucide-react';
import { useDocs } from '../context/DocsContext';
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  hasPwaInstalledFlag,
  isAppInstalledStandalone,
  markPwaInstalledFlag,
  subscribePwaInstallEvents,
  type BeforeInstallPromptEvent,
} from '../utils/registerSw';
import { BrandText } from './BrandText';
import { SsfLogo } from './SsfLogo';

const DISMISSED_AT_KEY = 'ssf_pwa_dismissed_at_v1';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 1500;

type BannerMode = 'chromium' | 'ios-safari' | 'ios-other' | null;

interface PortalBannerTheme {
  themeColor: string;
  cardBorder: string;
  cardTint: string;
  titleText: string;
  subtitleText: string;
  primaryBtn: string;
  secondaryBtn: string;
  stepBox: string;
  iconAccent: string;
}

function getBannerTheme(pathname: string): PortalBannerTheme {
  if (pathname.startsWith('/sector')) {
    return {
      themeColor: '#043326',
      cardBorder: 'border-forest-200',
      cardTint: 'bg-leaf-50/90',
      titleText: 'text-forest-950',
      subtitleText: 'text-forest-700',
      primaryBtn: 'glass-forest text-white hover:opacity-95',
      secondaryBtn:
        'border border-leaf-border bg-white/80 text-forest-800 hover:bg-white',
      stepBox: 'bg-leaf-100/80 border border-leaf-border text-forest-900',
      iconAccent: 'text-forest-900',
    };
  }
  if (pathname.startsWith('/dashboard')) {
    return {
      themeColor: '#EC5E27',
      cardBorder: 'border-ember-200',
      cardTint: 'bg-[#FFF9F4]/90',
      titleText: 'text-[#261812]',
      subtitleText: 'text-[#6B5449]',
      primaryBtn: 'glass-orange text-white hover:opacity-95',
      secondaryBtn:
        'border border-[#E5DEC9] bg-white/85 text-[#261812] hover:bg-white',
      stepBox: 'bg-[#FFF1EA]/90 border border-[#FAD4C3] text-[#261812]',
      iconAccent: 'text-[#EC5E27]',
    };
  }
  return {
    themeColor: '#381932',
    cardBorder: 'border-milk-border',
    cardTint: 'bg-milk-50/90',
    titleText: 'text-plum-950',
    subtitleText: 'text-ink-600',
    primaryBtn: 'glass-plum text-white hover:opacity-95',
    secondaryBtn:
      'border border-milk-border bg-white/85 text-plum-900 hover:bg-white',
    stepBox: 'bg-milk-100/85 border border-milk-border text-plum-950',
    iconAccent: 'text-plum-900',
  };
}

function isDismissCooldownActive(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISSED_AT_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return Date.now() - ts < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function persistDismissTimestamp(): void {
  try {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures
  }
}

function detectIosPlatform(): 'ios-safari' | 'ios-other' | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  const isIosDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIosDevice) return null;

  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  return isOtherIosBrowser ? 'ios-other' : 'ios-safari';
}

function IosShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function AddSquareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

export function PwaInstallBanner() {
  const location = useLocation();
  const { isOpen: isDocsOpen } = useDocs();
  const theme = getBannerTheme(location.pathname);

  const [delayReady, setDelayReady] = useState(false);
  const [installed, setInstalled] = useState(
    () => isAppInstalledStandalone() || hasPwaInstalledFlag()
  );
  const [dismissed, setDismissed] = useState(() => isDismissCooldownActive());
  const [deferredEvent, setDeferredEvent] =
    useState<BeforeInstallPromptEvent | null>(() => getDeferredInstallPrompt());
  const [iosKind, setIosKind] = useState<'ios-safari' | 'ios-other' | null>(
    () => detectIosPlatform()
  );
  const [prompting, setPrompting] = useState(false);
  const [entered, setEntered] = useState(false);

  // Sync <meta name="theme-color"> dynamically with active portal
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (meta) {
      meta.content = theme.themeColor;
    }
  }, [theme.themeColor]);

  // Polite delay before showing banner so splash/login isn't interrupted
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDelayReady(true);
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Subscribe to Chromium beforeinstallprompt / appinstalled & standalone state
  useEffect(() => {
    setIosKind(detectIosPlatform());

    const syncState = () => {
      setInstalled(isAppInstalledStandalone() || hasPwaInstalledFlag());
      setDeferredEvent(getDeferredInstallPrompt());
    };

    const unsubscribe = subscribePwaInstallEvents(syncState);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const handleDisplayModeChange = () => syncState();
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      unsubscribe();
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const mode: BannerMode =
    installed || dismissed || !delayReady || isDocsOpen
      ? null
      : deferredEvent
      ? 'chromium'
      : iosKind;

  useEffect(() => {
    if (!mode) {
      setEntered(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  if (!mode) {
    return null;
  }

  const handleDismiss = () => {
    persistDismissTimestamp();
    setEntered(false);
    setDismissed(true);
  };

  const handleInstallClick = async () => {
    if (!deferredEvent || prompting) return;
    setPrompting(true);
    try {
      await deferredEvent.prompt();
      const choice = await deferredEvent.userChoice;
      clearDeferredInstallPrompt();
      setDeferredEvent(null);
      if (choice.outcome === 'accepted') {
        markPwaInstalledFlag();
        setInstalled(true);
      } else {
        persistDismissTimestamp();
        setDismissed(true);
      }
    } catch {
      persistDismissTimestamp();
      setDismissed(true);
    } finally {
      setPrompting(false);
    }
  };

  return (
    <aside
      role="region"
      aria-label="Install Application"
      className="fixed top-3 top-[max(0.75rem,env(safe-area-inset-top))] inset-x-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-[60] pointer-events-none"
    >
      <div
        className={`pointer-events-auto ${theme.cardTint} backdrop-blur-xl border ${theme.cardBorder} rounded-2xl shadow-2xl p-3.5 sm:p-4 transition-all duration-300 ease-out motion-reduce:transition-none ${
          entered
            ? 'translate-y-0 opacity-100'
            : '-translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/95 border border-black/5 shadow-xs flex items-center justify-center shrink-0">
            <SsfLogo className="h-6 w-auto" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2
                  className={`text-sm font-bold leading-snug ${theme.titleText}`}
                >
                  <BrandText text="Install SSF Payasam App" />
                </h2>
                <p className={`text-xs mt-0.5 leading-snug ${theme.subtitleText}`}>
                  {mode === 'chromium'
                    ? 'Faster access & full-screen experience'
                    : mode === 'ios-safari'
                    ? 'Add to your iPhone or iPad Home Screen'
                    : 'Open this page in Safari to add it to your Home Screen'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss install banner"
                className="p-1 rounded-lg text-ink-400 hover:text-ink-900 hover:bg-black/5 transition-colors shrink-0 -mr-1 -mt-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {mode === 'chromium' ? (
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  disabled={prompting}
                  onClick={() => void handleInstallClick()}
                  className={`${theme.primaryBtn} px-4 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-opacity disabled:opacity-60`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{prompting ? 'Installing...' : 'Install'}</span>
                </button>
                <button
                  type="button"
                  disabled={prompting}
                  onClick={handleDismiss}
                  className={`${theme.secondaryBtn} px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors`}
                >
                  Later
                </button>
              </div>
            ) : (
              <div className="mt-2.5 space-y-2">
                <div
                  className={`${theme.stepBox} rounded-xl px-3 py-2 text-[11px] leading-relaxed space-y-1.5`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold num">1.</span>
                    <span className="flex items-center gap-1 flex-wrap">
                      Tap the <strong>Share</strong> button
                      <IosShareIcon
                        className={`w-3.5 h-3.5 inline-block shrink-0 ${theme.iconAccent}`}
                      />
                      in {mode === 'ios-other' ? 'Safari’s' : "Safari's"}{' '}
                      toolbar.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold num">2.</span>
                    <span className="flex items-center gap-1 flex-wrap">
                      Tap <strong>Add to Home Screen</strong>
                      <AddSquareIcon
                        className={`w-3.5 h-3.5 inline-block shrink-0 ${theme.iconAccent}`}
                      />
                      , then tap <strong>Add</strong>.
                    </span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className={`${theme.secondaryBtn} px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors`}
                  >
                    Got it
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default PwaInstallBanner;
