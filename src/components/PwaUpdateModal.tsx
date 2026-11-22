import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { DOCS_THEME_STYLES, type DocsPortalTheme } from '../utils/docsConfig';
import {
  applyPwaUpdate,
  isAppInstalledStandalone,
  isPwaUpdateAvailable,
  subscribePwaUpdate,
} from '../utils/pwaAutoUpdate';
import { SsfLogo } from './SsfLogo';

type UpdateDisplayMode = 'none' | 'pill' | 'modal';

const PORTAL_CTA_CLASSES: Record<
  DocsPortalTheme,
  {
    primaryBtn: string;
    captionText: string;
    pillBorderAccent: string;
  }
> = {
  plum: {
    primaryBtn: 'glass-plum text-white hover:opacity-95',
    captionText: 'text-[#381932]/75',
    pillBorderAccent: 'border-[#381932]/25',
  },
  forest: {
    primaryBtn: 'glass-forest text-white hover:opacity-95',
    captionText: 'text-[#043326]/75',
    pillBorderAccent: 'border-[#043326]/25',
  },
  orange: {
    primaryBtn: 'glass-orange text-white hover:opacity-95',
    captionText: 'text-[#5C1B07]/75',
    pillBorderAccent: 'border-[#EC5E27]/30',
  },
  public: {
    primaryBtn: 'glass-crimson text-white hover:opacity-95',
    captionText: 'text-[#4A070A]/75',
    pillBorderAccent: 'border-[#5C0A0E]/25',
  },
};

function resolvePortalTheme(pathname: string): DocsPortalTheme {
  if (pathname.startsWith('/sector')) return 'forest';
  if (pathname.startsWith('/dashboard')) return 'orange';
  if (pathname === '/') return 'public';
  return 'plum';
}

function isEditableControl(element: Element | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;
  if (element.closest('[data-pwa-update-modal="true"]')) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  if (element instanceof HTMLSelectElement) {
    return !element.disabled;
  }
  if (element instanceof HTMLInputElement) {
    if (element.disabled || element.readOnly) return false;
    const inputType = element.type.toLowerCase();
    return !['button', 'submit', 'reset', 'hidden', 'image'].includes(
      inputType
    );
  }
  return false;
}

function hasActiveFormModal(): boolean {
  if (typeof document === 'undefined') return false;
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  for (const dialog of dialogs) {
    if (dialog.getAttribute('data-pwa-update-modal') === 'true') continue;
    if (
      dialog.querySelector(
        'form, input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select'
      )
    ) {
      return true;
    }
  }
  return false;
}

function isUserInActiveForm(): boolean {
  if (typeof document === 'undefined') return false;
  return isEditableControl(document.activeElement) || hasActiveFormModal();
}

export function PwaUpdateModal() {
  const { pathname } = useLocation();
  const themeKey = resolvePortalTheme(pathname);
  const styles = DOCS_THEME_STYLES[themeKey];
  const portalCta = PORTAL_CTA_CLASSES[themeKey];

  const [isStandalone, setIsStandalone] = useState<boolean>(() =>
    isAppInstalledStandalone()
  );
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(() =>
    isAppInstalledStandalone() ? isPwaUpdateAvailable() : false
  );
  const [displayMode, setDisplayMode] = useState<UpdateDisplayMode>(() =>
    isAppInstalledStandalone() && isPwaUpdateAvailable()
      ? isUserInActiveForm()
        ? 'pill'
        : 'modal'
      : 'none'
  );
  const [applying, setApplying] = useState(false);
  const [entered, setEntered] = useState(false);

  const applyingRef = useRef(false);
  const pillInteractingRef = useRef(false);

  const handleApplyUpdate = useCallback(() => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    applyPwaUpdate();
  }, []);

  // Track standalone display mode so regular browser tabs never show the update popup
  useEffect(() => {
    setIsStandalone(isAppInstalledStandalone());
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const wcoQuery = window.matchMedia('(display-mode: window-controls-overlay)');
    const handleChange = () => setIsStandalone(isAppInstalledStandalone());
    standaloneQuery.addEventListener?.('change', handleChange);
    wcoQuery.addEventListener?.('change', handleChange);
    return () => {
      standaloneQuery.removeEventListener?.('change', handleChange);
      wcoQuery.removeEventListener?.('change', handleChange);
    };
  }, []);

  // Subscribe to Service Worker waiting updates
  useEffect(() => {
    if (isPwaUpdateAvailable()) {
      setUpdateAvailable(true);
    }
    return subscribePwaUpdate((available) => {
      setUpdateAvailable(available);
    });
  }, []);

  // Synchronously decide initial surface when an update arrives in standalone PWA
  useEffect(() => {
    if (!isStandalone || !updateAvailable) return;
    setDisplayMode((prev) => {
      if (prev !== 'none') return prev;
      return isUserInActiveForm() ? 'pill' : 'modal';
    });
  }, [isStandalone, updateAvailable]);

  // Escalate from top floating pill to mandatory center modal once form/input finishes
  useEffect(() => {
    if (displayMode !== 'pill') return;

    let escalationTimer: number | null = null;
    let rafId: number | null = null;

    const clearEscalationTimer = () => {
      if (escalationTimer !== null) {
        window.clearTimeout(escalationTimer);
        escalationTimer = null;
      }
    };

    const scheduleEscalationCheck = () => {
      if (applyingRef.current || pillInteractingRef.current) return;

      if (
        isUserInActiveForm() ||
        document.activeElement?.closest('[data-pwa-update-modal="true"]')
      ) {
        clearEscalationTimer();
        return;
      }

      clearEscalationTimer();
      escalationTimer = window.setTimeout(() => {
        escalationTimer = null;
        if (applyingRef.current || pillInteractingRef.current) return;
        if (document.activeElement?.closest('[data-pwa-update-modal="true"]')) {
          return;
        }
        if (!isUserInActiveForm()) {
          setDisplayMode('modal');
        }
      }, 180);
    };

    const handleFocusIn = () => {
      if (isUserInActiveForm()) {
        clearEscalationTimer();
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Element &&
        event.relatedTarget.closest('[data-pwa-update-modal="true"]')
      ) {
        clearEscalationTimer();
        return;
      }
      scheduleEscalationCheck();
    };

    const handleFormSubmit = () => {
      scheduleEscalationCheck();
    };

    const observer = new MutationObserver(() => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        scheduleEscalationCheck();
      });
    });

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('submit', handleFormSubmit, true);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearEscalationTimer();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('submit', handleFormSubmit, true);
      observer.disconnect();
    };
  }, [displayMode]);

  // Smooth frame-aligned entrance without layout shift
  useEffect(() => {
    if (displayMode === 'none') {
      setEntered(false);
      return;
    }
    setEntered(false);
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [displayMode]);

  // Mandatory Escape handling when modal is open: dismiss triggers immediate update
  useEffect(() => {
    if (displayMode !== 'modal') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleApplyUpdate();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayMode, handleApplyUpdate]);

  if (!isStandalone || displayMode === 'none') {
    return null;
  }

  if (displayMode === 'pill') {
    return (
      <aside
        data-pwa-update-modal="true"
        role="status"
        aria-live="polite"
        onPointerDown={() => {
          pillInteractingRef.current = true;
          window.setTimeout(() => {
            pillInteractingRef.current = false;
          }, 400);
        }}
        className="fixed top-3 top-[max(0.75rem,env(safe-area-inset-top))] inset-x-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-xl z-[80] pointer-events-none"
      >
        <div
          className={`pointer-events-auto ${styles.cardSurface} ${styles.cardBorderShadow} ${portalCta.pillBorderAccent} rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 transition-all duration-300 ease-out motion-reduce:transition-none ${
            entered ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/95 border border-black/5 shadow-sm flex items-center justify-center shrink-0">
                <SsfLogo className="h-5 w-auto" />
              </div>
              <p
                className={`font-ml text-xs sm:text-[13px] font-semibold leading-snug ${styles.headingText}`}
              >
                പുതിയ അപ്ഡേറ്റ് ലഭ്യമാണ് — ഫോം പൂർത്തിയാക്കിയ ഉടൻ അപ്ഡേറ്റ് ചെയ്യുക
              </p>
            </div>

            <button
              type="button"
              disabled={applying}
              onClick={handleApplyUpdate}
              className={`${portalCta.primaryBtn} font-ml px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-opacity disabled:opacity-75 shrink-0 w-full sm:w-auto`}
            >
              {applying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>അപ്ഡേറ്റ് ചെയ്യുന്നു...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>ഇപ്പോൾ അപ്ഡേറ്റ് ചെയ്യുക</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div
      data-pwa-update-modal="true"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pwa-update-modal-title"
      aria-describedby="pwa-update-modal-desc"
      onClick={handleApplyUpdate}
      className={`fixed inset-0 z-[80] ${styles.backdrop} flex items-center justify-center p-4 transition-opacity duration-200 motion-reduce:transition-none ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md ${styles.cardSurface} ${styles.cardBorderShadow} rounded-3xl p-6 sm:p-7 transition-all duration-200 ease-out motion-reduce:transition-none ${
          entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <button
          type="button"
          disabled={applying}
          onClick={handleApplyUpdate}
          aria-label="അപ്ഡേറ്റ് ചെയ്ത് തുടരുക"
          className={`absolute top-4 right-4 p-1.5 rounded-full transition-colors disabled:opacity-50 ${styles.closeButton}`}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="w-16 h-16 rounded-2xl bg-white/95 border border-black/5 shadow-md flex items-center justify-center">
              <SsfLogo className="h-9 w-auto" />
            </div>
            <span
              className={`absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl ${styles.iconBadge} border-2 border-white shadow-sm flex items-center justify-center`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${applying ? 'animate-spin' : ''}`}
              />
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold mb-2.5 ${styles.portalBadge}`}
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>SSF Payasam App</span>
          </span>

          <h2
            id="pwa-update-modal-title"
            className={`font-ml text-lg sm:text-xl font-bold ${styles.headingText}`}
          >
            പുതിയ അപ്ഡേറ്റ് ലഭ്യമാണ്
          </h2>

          <p
            id="pwa-update-modal-desc"
            className={`font-ml text-xs sm:text-sm mt-2 leading-relaxed ${styles.bodyText}`}
          >
            ആപ്പിൽ പുതിയ സൗകര്യങ്ങളും തിരുത്തലുകളും ചേർത്തിട്ടുണ്ട്. മികച്ച പ്രവർത്തനത്തിനായി ഇപ്പോൾ അപ്ഡേറ്റ് ചെയ്യുക.
          </p>

          <button
            type="button"
            disabled={applying}
            onClick={handleApplyUpdate}
            className={`mt-6 w-full py-3 px-5 rounded-2xl font-ml text-sm sm:text-[15px] font-bold inline-flex items-center justify-center gap-2 shadow-md transition-opacity disabled:opacity-80 ${portalCta.primaryBtn}`}
          >
            {applying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>അപ്ഡേറ്റ് ചെയ്യുന്നു...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>ഇപ്പോൾ അപ്ഡേറ്റ് ചെയ്യുക</span>
              </>
            )}
          </button>

          <p
            className={`font-ml text-[11px] sm:text-xs font-medium mt-3 ${portalCta.captionText}`}
          >
            തുടരുന്നതിന് അപ്ഡേറ്റ് നിർബന്ധമാണ്
          </p>
        </div>
      </div>
    </div>
  );
}

export default PwaUpdateModal;
