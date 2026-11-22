import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Loader2, Sparkles, X } from 'lucide-react';
import { BrandLoadingScreen } from '../components/BrandLoadingScreen';
import { PublicLeaderboardDesktop } from '../components/public/PublicLeaderboardDesktop';
import { PublicLeaderboardMobile } from '../components/public/PublicLeaderboardMobile';
import { PublicQuickEntryModal } from '../components/public/PublicQuickEntryModal';
import { useDocs, useRegisterPageDocs } from '../context/DocsContext';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { usePortalThemeColor } from '../hooks/usePortalThemeColor';
import { clearCached, getCached, setCached } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type { PublicLeaderboardResponse } from '../types';
import { DOCS_THEME_STYLES } from '../utils/docsConfig';
import {
  getNotificationPermission,
  getVapidPublicKey,
  isIosNonStandalone,
  isPublicPushDismissCooldownActive,
  isPushSupported,
  markPublicPushPromptDismissed,
  resolveVapidPublicKey,
  subscribePublicPush,
  subscribePushUiState,
} from '../utils/pushNotifications';
import {
  isPwaUpdateAvailable,
  subscribePwaUpdate,
} from '../utils/pwaAutoUpdate';

const LEADERBOARD_CACHE_KEY = 'wdr_public_leaderboard_v1';
const LEADERBOARD_CACHE_TTL_MS = 20_000;
const POSTER_PRELOAD_TIMEOUT_MS = 2500;
const PUBLIC_PUSH_DELAY_MS = 6500;

function preloadResponsivePoster(): Promise<void> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(done, POSTER_PRELOAD_TIMEOUT_MS);
    const img = new Image();
    img.src =
      window.innerWidth <= 768 ? '/poster-banner-sm.webp' : '/poster-banner.webp';

    const finishDecode = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(done, done);
      } else {
        done();
      }
    };

    if (img.complete) {
      finishDecode();
    } else {
      img.onload = finishDecode;
      img.onerror = done;
    }
  });
}

function hasBlockingPopupOnPublic(): boolean {
  if (typeof document === 'undefined') return false;
  if (
    document.querySelector(
      '[role="dialog"][aria-modal="true"]:not([data-public-push-modal="true"]), [role="alertdialog"][aria-modal="true"]'
    )
  ) {
    return true;
  }
  if (document.querySelector('section[aria-label*="Smart Help Assistant"]')) {
    return true;
  }
  return false;
}

export default function PublicPage() {
  const isDesktop = useIsDesktop();
  const { isOpen: isDocsOpen } = useDocs();

  usePortalThemeColor('#FFF8F6', '/manifest-public.webmanifest');
  useRegisterPageDocs('public_leaderboard', 'public');

  const [data, setData] = useState<PublicLeaderboardResponse | null>(() =>
    getCached<PublicLeaderboardResponse>(
      LEADERBOARD_CACHE_KEY,
      LEADERBOARD_CACHE_TTL_MS
    )
  );
  const [posterReady, setPosterReady] = useState(false);
  const [loading, setLoading] = useState<boolean>(
    () =>
      !getCached<PublicLeaderboardResponse>(
        LEADERBOARD_CACHE_KEY,
        LEADERBOARD_CACHE_TTL_MS
      )
  );
  const [error, setError] = useState<string | null>(null);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);

  // Public Push Permission Prompt states
  const [pushVapReady, setPushVapReady] = useState(() =>
    Boolean(getVapidPublicKey())
  );
  const [pushPermission, setPushPermission] = useState(() =>
    getNotificationPermission()
  );
  const [pushDismissed, setPushDismissed] = useState(() =>
    isPublicPushDismissCooldownActive()
  );
  const [updatePending, setUpdatePending] = useState(() =>
    isPwaUpdateAvailable()
  );
  const [otherPopupOpen, setOtherPopupOpen] = useState(false);
  const [pushDelayReady, setPushDelayReady] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const publicPushStartAtRef = useRef<number | null>(null);

  const loadLeaderboard = useCallback(async (force = false): Promise<void> => {
    if (!force) {
      const cached = getCached<PublicLeaderboardResponse>(
        LEADERBOARD_CACHE_KEY,
        LEADERBOARD_CACHE_TTL_MS
      );
      if (cached) {
        if (mountedRef.current) {
          setData(cached);
          setError(null);
          setLoading(false);
        }
        return;
      }
    } else {
      clearCached(LEADERBOARD_CACHE_KEY);
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'public_get_leaderboard'
      );
      if (!mountedRef.current) return;

      if (rpcError) {
        setError(rpcError.message || 'Unable to load live leaderboard.');
        return;
      }

      if (!rpcData) {
        setError('No leaderboard data returned from server.');
        return;
      }

      const leaderboard = rpcData as PublicLeaderboardResponse;
      setCached(LEADERBOARD_CACHE_KEY, leaderboard);
      setData(leaderboard);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect for live leaderboard.'
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Concurrent initial load: decode poster + fetch live leaderboard
  useEffect(() => {
    mountedRef.current = true;
    void preloadResponsivePoster().then(() => {
      if (mountedRef.current) {
        setPosterReady(true);
      }
    });
    void loadLeaderboard(false);

    return () => {
      mountedRef.current = false;
    };
  }, [loadLeaderboard]);

  // Background periodic live refresh (every 60s when visible)
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !quickEntryOpen) {
        void loadLeaderboard(true);
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadLeaderboard, quickEntryOpen]);

  // Public push availability & listeners
  useEffect(() => {
    if (!pushVapReady && isPushSupported()) {
      void resolveVapidPublicKey().then((key) => {
        if (mountedRef.current && key) {
          setPushVapReady(true);
        }
      });
    }
    const unsubPush = subscribePushUiState(() => {
      setPushPermission(getNotificationPermission());
    });
    const unsubUpdate = subscribePwaUpdate((available) => {
      setUpdatePending(available);
    });
    return () => {
      unsubPush();
      unsubUpdate();
    };
  }, [pushVapReady]);

  const pushEligible =
    posterReady &&
    Boolean(data) &&
    isPushSupported() &&
    pushVapReady &&
    !isIosNonStandalone() &&
    pushPermission === 'default' &&
    !pushDismissed;

  useEffect(() => {
    if (!pushEligible) {
      setOtherPopupOpen(false);
      return;
    }
    setOtherPopupOpen(hasBlockingPopupOnPublic());
    const interval = window.setInterval(() => {
      setOtherPopupOpen(hasBlockingPopupOnPublic());
    }, 500);
    return () => window.clearInterval(interval);
  }, [pushEligible, isDocsOpen, quickEntryOpen, updatePending]);

  const hasBlocker =
    isDocsOpen || quickEntryOpen || updatePending || otherPopupOpen;

  useEffect(() => {
    if (!pushEligible) {
      publicPushStartAtRef.current = null;
      setPushDelayReady(false);
      return;
    }

    if (publicPushStartAtRef.current === null) {
      publicPushStartAtRef.current = Date.now();
    }

    const elapsed = Date.now() - publicPushStartAtRef.current;
    const remaining = Math.max(0, PUBLIC_PUSH_DELAY_MS - elapsed);
    if (remaining === 0) {
      setPushDelayReady(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setPushDelayReady(true);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [pushEligible]);

  const showPushModal = pushEligible && pushDelayReady && !hasBlocker;

  const handleDismissPublicPush = () => {
    markPublicPushPromptDismissed();
    setPushDismissed(true);
  };

  const handleEnablePublicPush = async () => {
    if (pushEnabling) return;
    setPushError(null);
    setPushEnabling(true);
    const res = await subscribePublicPush();
    setPushPermission(getNotificationPermission());
    setPushEnabling(false);

    if (res.ok || getNotificationPermission() === 'denied') {
      return;
    }
    setPushError(res.error || 'നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യാൻ കഴിഞ്ഞില്ല.');
  };

  if ((!posterReady || loading) && !data) {
    return <BrandLoadingScreen />;
  }

  if (error && !data) {
    return (
      <div className="min-h-dvh public-theme-bg flex items-center justify-center p-6">
        <div className="glass-rose-card rounded-3xl p-6 max-w-sm w-full text-center space-y-4">
          <p className="font-ml text-sm font-bold text-[#2B0406]">
            ലൈവ് ഡാറ്റ ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല
          </p>
          <p className="text-xs text-[#7A2E33]">{error}</p>
          <button
            type="button"
            onClick={() => void loadLeaderboard(true)}
            className="w-full py-2.5 px-4 rounded-xl glass-crimson text-white font-ml text-xs font-bold"
          >
            വീണ്ടും ശ്രമിക്കുക
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <BrandLoadingScreen />;
  }

  const publicStyles = DOCS_THEME_STYLES.public;

  return (
    <>
      {isDesktop ? (
        <PublicLeaderboardDesktop
          data={data}
          refreshing={loading}
          onRefresh={() => void loadLeaderboard(true)}
          onOpenQuickEntry={() => setQuickEntryOpen(true)}
        />
      ) : (
        <PublicLeaderboardMobile
          data={data}
          refreshing={loading}
          onRefresh={() => void loadLeaderboard(true)}
          onOpenQuickEntry={() => setQuickEntryOpen(true)}
        />
      )}

      {quickEntryOpen && (
        <PublicQuickEntryModal
          sectors={data.sectors}
          units={data.units}
          perLiterRate={Number(data.summary.per_liter_rate) || 250}
          challengeTitle={
            data.summary.challenge_title ||
            'SSF Wandoor Division Payasam Challenge'
          }
          ordersOpen={Boolean(data.summary.orders_open)}
          onClose={() => setQuickEntryOpen(false)}
          onOrderCreated={() => loadLeaderboard(true)}
        />
      )}

      {showPushModal && (
        <div
          role="dialog"
          aria-modal="true"
          data-public-push-modal="true"
          aria-labelledby="public-push-title"
          className={`fixed inset-0 z-[65] ${publicStyles.backdrop} flex items-center justify-center p-4`}
          onClick={handleDismissPublicPush}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-[#FFF8F6]/[0.94] backdrop-blur-2xl border border-[#5C0A0E]/[0.20] shadow-[0_24px_64px_-12px_rgba(43,4,6,0.38)] rounded-3xl p-6 text-center"
          >
            <button
              type="button"
              onClick={handleDismissPublicPush}
              disabled={pushEnabling}
              aria-label="പിന്നീട്"
              className={`absolute top-4 right-4 p-1.5 rounded-full transition-colors ${publicStyles.closeButton}`}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl glass-crimson text-white shadow-lg flex items-center justify-center mb-3.5">
                <Bell className="w-7 h-7 text-white" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full glass-crimson text-white text-[11px] font-semibold mb-2.5">
                <Sparkles className="w-3 h-3 text-[#FCE36D] shrink-0" />
                <span>Live Milestone Alerts</span>
              </span>

              <h2
                id="public-push-title"
                className="font-ml text-lg font-bold text-[#2B0406]"
              >
                ലൈവ് അപ്‌ഡേറ്റുകൾ ഉടൻ അറിയാം!
              </h2>

              <p className="font-ml text-xs sm:text-sm mt-2 leading-relaxed text-[#4A070A]">
                ചലഞ്ചിലെ പ്രധാന മൈൽസ്റ്റോണുകളും പുതിയ ആപ്പ് അപ്‌ഡേറ്റുകളും തൽക്ഷണം ലഭിക്കാൻ നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യുക.
              </p>

              {pushError && (
                <p className="font-ml text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mt-3 w-full">
                  {pushError}
                </p>
              )}

              <div className="mt-5 w-full flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={pushEnabling}
                  onClick={() => void handleEnablePublicPush()}
                  className="flex-1 py-2.5 px-4 rounded-xl glass-crimson text-white font-ml text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm hover:opacity-95 disabled:opacity-75"
                >
                  {pushEnabling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0 text-white" />
                      <span>സജ്ജീകരിക്കുന്നു...</span>
                    </>
                  ) : (
                    <>
                      <Bell className="w-4 h-4 shrink-0 text-white" />
                      <span>നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യുക</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={pushEnabling}
                  onClick={handleDismissPublicPush}
                  className="sm:w-28 py-2.5 px-4 rounded-xl border border-[#5C0A0E]/20 bg-white/85 text-[#2B0406] font-ml text-xs sm:text-sm font-semibold hover:bg-white transition-colors"
                >
                  പിന്നീട്
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
