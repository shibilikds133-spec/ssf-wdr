import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Bell, Loader2, Sparkles, X } from 'lucide-react';
import { BrandLoadingScreen } from '../components/BrandLoadingScreen';
import { PublicLeaderboardDesktop } from '../components/public/PublicLeaderboardDesktop';
import { PublicLeaderboardMobile } from '../components/public/PublicLeaderboardMobile';
import { useDocs, useRegisterPageDocs } from '../context/DocsContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { usePortalThemeColor } from '../hooks/usePortalThemeColor';
import { clearCached, getCached, setCached } from '../lib/cache';
import type {
  PublicLeaderboardResponse,
  PublicLeaderboardUnit,
} from '../types';
import { DOCS_THEME_STYLES } from '../utils/docsConfig';
import {
  isPwaUpdateAvailable,
  subscribePwaUpdate,
} from '../utils/pwaAutoUpdate';

const PublicQuickEntryModal = lazy(
  () => import('../components/public/PublicQuickEntryModal')
);

type PushModule = typeof import('../utils/pushNotifications');

const LEADERBOARD_CACHE_KEY = 'wdr_public_leaderboard_v1';
const LEADERBOARD_CACHE_TTL_MS = 20_000;
const POSTER_PRELOAD_TIMEOUT_MS = 2500;
const PUSH_CHECK_IDLE_DELAY_MS = 2000;
const PUBLIC_PUSH_DELAY_MS = 6500;
const PUBLIC_UNITS_PAGE_SIZE = 10;

async function fetchPublicLeaderboardPage(params: {
  page: number;
  pageSize: number;
  search: string;
  sectorFilter: string;
  fresh?: boolean;
  signal?: AbortSignal;
}): Promise<PublicLeaderboardResponse> {
  const { page, pageSize, search, sectorFilter, fresh, signal } = params;
  const sectorId =
    sectorFilter !== 'ALL' && sectorFilter !== '' ? Number(sectorFilter) : null;

  // 1. Try Cloudflare Pages Edge Function (/api/public/leaderboard)
  try {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      search: search.trim(),
      sectorId: sectorId ? String(sectorId) : '',
      ...(fresh ? { fresh: '1' } : {}),
    });
    const edgeRes = await fetch(`/api/public/leaderboard?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    const contentType = edgeRes.headers.get('content-type') || '';
    if (edgeRes.ok && contentType.toLowerCase().includes('application/json')) {
      const parsed = (await edgeRes.json()) as PublicLeaderboardResponse & {
        ok?: boolean;
        error?: string;
      };
      if (parsed && parsed.summary && Array.isArray(parsed.sectors)) {
        return parsed;
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    // Fall back to direct Supabase RPC (e.g. local Vite dev)
  }

  // 2. Direct Supabase RPC fallback (dynamically imported so 0 KB loads in prod)
  const { supabase } = await import('../lib/supabase');
  let rpcBuilder = supabase.rpc('get_public_leaderboard_page', {
    p_page: page,
    p_page_size: pageSize,
    p_search: search.trim(),
    p_sector_id: sectorId,
  });
  if (signal && typeof rpcBuilder.abortSignal === 'function') {
    rpcBuilder = rpcBuilder.abortSignal(signal);
  }

  const { data: rpcData, error: rpcError } = await rpcBuilder;
  if (rpcError) {
    throw new Error(rpcError.message || 'Unable to load live leaderboard.');
  }
  if (!rpcData) {
    throw new Error('No leaderboard data returned from server.');
  }
  return rpcData as PublicLeaderboardResponse;
}

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
  const dataRef = useRef<PublicLeaderboardResponse | null>(data);
  dataRef.current = data;

  const [posterReady, setPosterReady] = useState(false);
  const [loading, setLoading] = useState<boolean>(
    () =>
      !getCached<PublicLeaderboardResponse>(
        LEADERBOARD_CACHE_KEY,
        LEADERBOARD_CACHE_TTL_MS
      )
  );
  const [unitsFetching, setUnitsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [quickEntryUnits, setQuickEntryUnits] = useState<
    PublicLeaderboardUnit[]
  >([]);

  // Backend search, sector filter & 10-per-page pagination state
  const [unitSearch, setUnitSearch] = useState('');
  const debouncedUnitSearch = useDebouncedValue(unitSearch, 100);
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [unitPage, setUnitPage] = useState(1);

  // Public Push Permission Prompt states (deferred until idle)
  const pushModRef = useRef<PushModule | null>(null);
  const [pushSupportedState, setPushSupportedState] = useState(false);
  const [pushVapReady, setPushVapReady] = useState(false);
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | 'unsupported'
  >('unsupported');
  const [pushDismissed, setPushDismissed] = useState(true);
  const [updatePending, setUpdatePending] = useState(() =>
    isPwaUpdateAvailable()
  );
  const [otherPopupOpen, setOtherPopupOpen] = useState(false);
  const [pushDelayReady, setPushDelayReady] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const publicPushStartAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reqSeqRef = useRef(0);

  const handleUnitSearchChange = useCallback((nextSearch: string) => {
    setUnitSearch(nextSearch);
    setUnitPage(1);
  }, []);

  const handleSectorFilterChange = useCallback((nextSector: string) => {
    setSectorFilter(nextSector);
    setUnitPage(1);
  }, []);

  const handleUnitPageChange = useCallback((nextPage: number) => {
    setUnitPage(nextPage);
  }, []);

  const loadLeaderboard = useCallback(
    async (force = false): Promise<void> => {
      const isDefaultQuery =
        unitPage === 1 &&
        debouncedUnitSearch.trim() === '' &&
        sectorFilter === 'ALL';

      if (!force && isDefaultQuery) {
        const cached = getCached<PublicLeaderboardResponse>(
          LEADERBOARD_CACHE_KEY,
          LEADERBOARD_CACHE_TTL_MS
        );
        if (
          cached &&
          Array.isArray(cached.units) &&
          cached.units.length <= PUBLIC_UNITS_PAGE_SIZE
        ) {
          if (mountedRef.current) {
            setData(cached);
            setError(null);
            setLoading(false);
            setUnitsFetching(false);
          }
          return;
        }
      } else if (force) {
        clearCached(LEADERBOARD_CACHE_KEY);
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const seq = ++reqSeqRef.current;

      if (mountedRef.current) {
        if (!dataRef.current || force) {
          setLoading(true);
        }
        setUnitsFetching(true);
        setError(null);
      }

      try {
        const leaderboard = await fetchPublicLeaderboardPage({
          page: unitPage,
          pageSize: PUBLIC_UNITS_PAGE_SIZE,
          search: debouncedUnitSearch,
          sectorFilter,
          fresh: force,
          signal: controller.signal,
        });

        if (!mountedRef.current || seq !== reqSeqRef.current) return;

        if (isDefaultQuery) {
          setCached(LEADERBOARD_CACHE_KEY, leaderboard);
        }

        startTransition(() => {
          setData(leaderboard);
          if (
            typeof leaderboard.current_page === 'number' &&
            leaderboard.current_page !== unitPage
          ) {
            setUnitPage(leaderboard.current_page);
          }
          setError(null);
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (!mountedRef.current || seq !== reqSeqRef.current) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to connect for live leaderboard.'
        );
      } finally {
        if (mountedRef.current && seq === reqSeqRef.current) {
          setLoading(false);
          setUnitsFetching(false);
        }
      }
    },
    [unitPage, debouncedUnitSearch, sectorFilter]
  );

  const handleRefresh = useCallback(() => {
    void loadLeaderboard(true);
  }, [loadLeaderboard]);

  const handleOpenQuickEntry = useCallback(() => {
    setQuickEntryOpen(true);
  }, []);

  const handleCloseQuickEntry = useCallback(() => {
    setQuickEntryOpen(false);
  }, []);

  const handleOrderCreated = useCallback(
    () => loadLeaderboard(true),
    [loadLeaderboard]
  );

  // Initial poster decode
  useEffect(() => {
    mountedRef.current = true;
    void preloadResponsivePoster().then(() => {
      if (mountedRef.current) {
        setPosterReady(true);
      }
    });

    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Fetch paginated leaderboard whenever page, debounced search (100ms), or sector filter changes
  useEffect(() => {
    void loadLeaderboard(false);
  }, [loadLeaderboard]);

  // Lazy-fetch complete 92-unit list only when Quick Entry modal is opened
  useEffect(() => {
    if (!quickEntryOpen || quickEntryUnits.length >= 20) return;
    let active = true;
    void fetchPublicLeaderboardPage({
      page: 1,
      pageSize: 100,
      search: '',
      sectorFilter: 'ALL',
    })
      .then((res) => {
        if (active && Array.isArray(res.units) && res.units.length > 0) {
          setQuickEntryUnits(res.units);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [quickEntryOpen, quickEntryUnits.length]);

  // Background periodic live refresh (every 60s when visible)
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !quickEntryOpen) {
        void loadLeaderboard(true);
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadLeaderboard, quickEntryOpen]);

  // Subscribe to PWA update flag (lightweight in-memory pub/sub)
  useEffect(() => {
    return subscribePwaUpdate((available) => {
      setUpdatePending(available);
    });
  }, []);

  // Defer push-support check & dynamic pushNotifications import until after boot (2000ms + idle)
  useEffect(() => {
    let active = true;
    let unsubPush: (() => void) | null = null;
    let idleId: number | null = null;
    const win = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const runPushCheck = () => {
      if (!active) return;
      void import('../utils/pushNotifications')
        .then((mod) => {
          if (!active) return;
          pushModRef.current = mod;
          const supported = mod.isPushSupported() && !mod.isIosNonStandalone();
          setPushSupportedState(supported);
          setPushPermission(mod.getNotificationPermission());
          setPushDismissed(mod.isPublicPushDismissCooldownActive());

          const existingKey = Boolean(mod.getVapidPublicKey());
          if (existingKey) {
            setPushVapReady(true);
          } else if (supported && mod.getNotificationPermission() === 'default') {
            void mod.resolveVapidPublicKey().then((key) => {
              if (active && mountedRef.current && key) {
                setPushVapReady(true);
              }
            });
          }

          unsubPush = mod.subscribePushUiState(() => {
            if (active) {
              setPushPermission(mod.getNotificationPermission());
            }
          });
        })
        .catch(() => undefined);
    };

    const timer = window.setTimeout(() => {
      if (typeof win.requestIdleCallback === 'function') {
        idleId = win.requestIdleCallback(runPushCheck, { timeout: 2500 });
      } else {
        runPushCheck();
      }
    }, PUSH_CHECK_IDLE_DELAY_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId);
      }
      unsubPush?.();
    };
  }, []);

  const pushEligible =
    posterReady &&
    Boolean(data) &&
    pushSupportedState &&
    pushVapReady &&
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

  const handleDismissPublicPush = useCallback(() => {
    pushModRef.current?.markPublicPushPromptDismissed();
    setPushDismissed(true);
  }, []);

  const handleEnablePublicPush = useCallback(async () => {
    if (pushEnabling) return;
    setPushError(null);
    setPushEnabling(true);
    const mod =
      pushModRef.current ?? (await import('../utils/pushNotifications'));
    pushModRef.current = mod;
    const res = await mod.subscribePublicPush();
    setPushPermission(mod.getNotificationPermission());
    setPushEnabling(false);

    if (res.ok || mod.getNotificationPermission() === 'denied') {
      return;
    }
    setPushError(res.error || 'നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യാൻ കഴിഞ്ഞില്ല.');
  }, [pushEnabling]);

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
            onClick={handleRefresh}
            className="w-full py-2.5 px-4 rounded-xl glass-crimson-solid text-white font-ml text-xs font-bold"
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
          unitsFetching={unitsFetching}
          unitSearch={unitSearch}
          onUnitSearchChange={handleUnitSearchChange}
          sectorFilter={sectorFilter}
          onSectorFilterChange={handleSectorFilterChange}
          unitPage={unitPage}
          onUnitPageChange={handleUnitPageChange}
          onRefresh={handleRefresh}
          onOpenQuickEntry={handleOpenQuickEntry}
        />
      ) : (
        <PublicLeaderboardMobile
          data={data}
          refreshing={loading}
          unitsFetching={unitsFetching}
          unitSearch={unitSearch}
          onUnitSearchChange={handleUnitSearchChange}
          sectorFilter={sectorFilter}
          onSectorFilterChange={handleSectorFilterChange}
          unitPage={unitPage}
          onUnitPageChange={handleUnitPageChange}
          onRefresh={handleRefresh}
          onOpenQuickEntry={handleOpenQuickEntry}
        />
      )}

      {quickEntryOpen && (
        <Suspense fallback={null}>
          <PublicQuickEntryModal
            sectors={data.sectors}
            units={quickEntryUnits.length > 0 ? quickEntryUnits : data.units}
            perLiterRate={Number(data.summary.per_liter_rate) || 250}
            challengeTitle={
              data.summary.challenge_title ||
              'SSF Wandoor Division Payasam Challenge'
            }
            ordersOpen={Boolean(data.summary.orders_open)}
            onClose={handleCloseQuickEntry}
            onOrderCreated={handleOrderCreated}
          />
        </Suspense>
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
            className="relative w-full max-w-md bg-[#FFF8F6]/[0.95] backdrop-blur-lg border border-[#5C0A0E]/[0.20] shadow-xl rounded-3xl p-6 text-center gpu-chrome"
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
              <div className="w-14 h-14 rounded-2xl glass-crimson-solid text-white shadow-md flex items-center justify-center mb-3.5">
                <Bell className="w-7 h-7 text-white" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full glass-crimson-solid text-white text-[11px] font-semibold mb-2.5">
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
                  className="flex-1 py-2.5 px-4 rounded-xl glass-crimson-solid text-white font-ml text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm hover:opacity-95 disabled:opacity-75"
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
