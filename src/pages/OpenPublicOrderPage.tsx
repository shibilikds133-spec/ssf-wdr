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
import { getCached, setCached } from '../lib/cache';
import type { PublicLeaderboardResponse } from '../types';
import { DOCS_THEME_STYLES } from '../utils/docsConfig';
import { usePortalEdgeTheme } from '../utils/portalEdgeTheme';

const OpenPublicOrderModal = lazy(
  () => import('../components/public/OpenPublicOrderModal')
);

type PushModule = typeof import('../utils/pushNotifications');

const LEADERBOARD_CACHE_KEY = 'wdr_public_leaderboard_v1';
const LEADERBOARD_CACHE_TTL_MS = 20_000;
const POSTER_PRELOAD_TIMEOUT_MS = 2500;
const PUSH_CHECK_IDLE_DELAY_MS = 2000;
const OPEN_ORDER_PUSH_DELAY_MS = 5000;
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
      const parsed = (await edgeRes.json()) as PublicLeaderboardResponse;
      if (parsed && parsed.summary && Array.isArray(parsed.sectors)) {
        return parsed;
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
  }

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

function hasBlockingPopupOnOrderPage(): boolean {
  if (typeof document === 'undefined') return false;
  if (
    document.querySelector(
      '[role="dialog"][aria-modal="true"]:not([data-order-push-modal="true"]), [role="alertdialog"][aria-modal="true"]'
    )
  ) {
    return true;
  }
  if (document.querySelector('section[aria-label*="Smart Help Assistant"]')) {
    return true;
  }
  return false;
}

export default function OpenPublicOrderPage() {
  const isDesktop = useIsDesktop();
  const { isOpen: isDocsOpen } = useDocs();
  usePortalEdgeTheme('public');
  useRegisterPageDocs('public_order_portal');

  const [data, setData] = useState<PublicLeaderboardResponse | null>(() =>
    getCached<PublicLeaderboardResponse>(
      LEADERBOARD_CACHE_KEY,
      LEADERBOARD_CACHE_TTL_MS
    )
  );
  const [posterReady, setPosterReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unitsFetching, setUnitsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  const [unitSearch, setUnitSearch] = useState('');
  const debouncedSearch = useDebouncedValue(unitSearch, 100);
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [unitPage, setUnitPage] = useState(1);

  // Isolated order-approval-only push notification prompt state
  const pushModRef = useRef<PushModule | null>(null);
  const [pushSupportedState, setPushSupportedState] = useState(false);
  const [pushVapReady, setPushVapReady] = useState(false);
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | 'unsupported'
  >('unsupported');
  const [pushDismissed, setPushDismissed] = useState(true);
  const [otherPopupOpen, setOtherPopupOpen] = useState(false);
  const [pushDelayReady, setPushDelayReady] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const pushStartAtRef = useRef<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    void preloadResponsivePoster().then(() => {
      if (active) setPosterReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const loadLeaderboard = useCallback(
    async (opts?: { fresh?: boolean; isManual?: boolean }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (opts?.isManual) {
        setRefreshing(true);
      } else {
        setUnitsFetching(true);
      }
      setError(null);

      try {
        const res = await fetchPublicLeaderboardPage({
          page: unitPage,
          pageSize: PUBLIC_UNITS_PAGE_SIZE,
          search: debouncedSearch,
          sectorFilter,
          fresh: opts?.fresh,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        startTransition(() => {
          setData(res);
        });
        if (unitPage === 1 && !debouncedSearch && sectorFilter === 'ALL') {
          setCached(LEADERBOARD_CACHE_KEY, res);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof Error ? err.message : 'Unable to load leaderboard.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false);
          setUnitsFetching(false);
        }
      }
    },
    [unitPage, debouncedSearch, sectorFilter]
  );

  useEffect(() => {
    void loadLeaderboard();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadLeaderboard]);

  const handleSearchChange = useCallback((next: string) => {
    setUnitSearch(next);
    setUnitPage(1);
  }, []);

  const handleSectorChange = useCallback((next: string) => {
    setSectorFilter(next);
    setUnitPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    void loadLeaderboard({ fresh: true, isManual: true });
  }, [loadLeaderboard]);

  useEffect(() => {
    let active = true;
    let unsubPush: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      if (!active) return;
      void import('../utils/pushNotifications')
        .then((mod) => {
          if (!active) return;
          pushModRef.current = mod;
          const supported = mod.isPushSupported() && !mod.isIosNonStandalone();
          setPushSupportedState(supported);
          setPushPermission(mod.getNotificationPermission());
          setPushDismissed(mod.isOpenOrderPushPromptDismissed());

          const existingKey = Boolean(mod.getVapidPublicKey());
          if (existingKey) {
            setPushVapReady(true);
          } else if (supported && mod.getNotificationPermission() === 'default') {
            void mod.resolveVapidPublicKey().then((key) => {
              if (active && key) setPushVapReady(true);
            });
          }

          unsubPush = mod.subscribePushUiState(() => {
            if (active) {
              setPushPermission(mod.getNotificationPermission());
            }
          });
        })
        .catch(() => undefined);
    }, PUSH_CHECK_IDLE_DELAY_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
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
    setOtherPopupOpen(hasBlockingPopupOnOrderPage());
    const interval = window.setInterval(() => {
      setOtherPopupOpen(hasBlockingPopupOnOrderPage());
    }, 500);
    return () => window.clearInterval(interval);
  }, [pushEligible, isDocsOpen, orderModalOpen]);

  useEffect(() => {
    if (!pushEligible) {
      pushStartAtRef.current = null;
      setPushDelayReady(false);
      return;
    }
    if (pushStartAtRef.current === null) {
      pushStartAtRef.current = Date.now();
    }
    const elapsed = Date.now() - pushStartAtRef.current;
    const remaining = Math.max(0, OPEN_ORDER_PUSH_DELAY_MS - elapsed);
    if (remaining === 0) {
      setPushDelayReady(true);
      return;
    }
    const timer = window.setTimeout(() => setPushDelayReady(true), remaining);
    return () => window.clearTimeout(timer);
  }, [pushEligible]);

  const showOrderPushModal =
    pushEligible &&
    pushDelayReady &&
    !isDocsOpen &&
    !orderModalOpen &&
    !otherPopupOpen;

  const handleDismissOrderPush = useCallback(() => {
    pushModRef.current?.markOpenOrderPushPromptDismissed();
    setPushDismissed(true);
  }, []);

  const handleEnableOrderPush = useCallback(async () => {
    if (pushEnabling) return;
    setPushError(null);
    setPushEnabling(true);
    const mod =
      pushModRef.current ?? (await import('../utils/pushNotifications'));
    pushModRef.current = mod;
    const res = await mod.subscribeOpenOrderPush();
    setPushPermission(mod.getNotificationPermission());
    setPushEnabling(false);
    if (res.ok || mod.getNotificationPermission() === 'denied') {
      return;
    }
    setPushError(res.error || 'നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യാൻ കഴിഞ്ഞില്ല.');
  }, [pushEnabling]);

  if (!data || !posterReady) {
    if (error && !data) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center p-6 public-theme-bg text-[#2B0406]">
          <div className="rounded-3xl glass-rose-card p-6 max-w-sm w-full text-center space-y-3 shadow-sm">
            <p className="text-sm font-bold">{error}</p>
            <button
              type="button"
              onClick={handleRefresh}
              className="px-4 py-2 rounded-full glass-crimson-solid text-white text-xs font-bold"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return <BrandLoadingScreen />;
  }

  return (
    <>
      {isDesktop ? (
        <PublicLeaderboardDesktop
          data={data}
          refreshing={refreshing}
          unitsFetching={unitsFetching}
          unitSearch={unitSearch}
          onUnitSearchChange={handleSearchChange}
          sectorFilter={sectorFilter}
          onSectorFilterChange={handleSectorChange}
          unitPage={unitPage}
          onUnitPageChange={setUnitPage}
          onRefresh={handleRefresh}
          onOpenQuickEntry={() => setOrderModalOpen(true)}
          isOpenOrderPortal
        />
      ) : (
        <PublicLeaderboardMobile
          data={data}
          refreshing={refreshing}
          unitsFetching={unitsFetching}
          unitSearch={unitSearch}
          onUnitSearchChange={handleSearchChange}
          sectorFilter={sectorFilter}
          onSectorFilterChange={handleSectorChange}
          unitPage={unitPage}
          onUnitPageChange={setUnitPage}
          onRefresh={handleRefresh}
          onOpenQuickEntry={() => setOrderModalOpen(true)}
          isOpenOrderPortal
        />
      )}

      {orderModalOpen && (
        <Suspense fallback={null}>
          <OpenPublicOrderModal
            perLiterRate={Number(data.summary.per_liter_rate) || 250}
            initialSectors={data.sectors.map((s) => ({
              id: s.id,
              name: s.name,
            }))}
            onClose={() => setOrderModalOpen(false)}
          />
        </Suspense>
      )}

      {showOrderPushModal && (
        <div
          role="dialog"
          aria-modal="true"
          data-order-push-modal="true"
          aria-labelledby="order-push-title"
          className={`fixed inset-0 z-[65] ${DOCS_THEME_STYLES.public.backdrop} flex items-center justify-center pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]`}
          onClick={handleDismissOrderPush}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-[#FFF8F6]/[0.95] backdrop-blur-lg border border-[#5C0A0E]/[0.20] shadow-xl rounded-3xl p-6 text-center gpu-chrome"
          >
            <button
              type="button"
              onClick={handleDismissOrderPush}
              disabled={pushEnabling}
              aria-label="പിന്നീട്"
              className={`absolute top-4 right-4 p-1.5 rounded-full transition-colors ${DOCS_THEME_STYLES.public.closeButton}`}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl glass-crimson-solid text-white shadow-md flex items-center justify-center mb-3.5">
                <Bell className="w-7 h-7 text-white" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full glass-crimson-solid text-white text-[11px] font-semibold mb-2.5">
                <Sparkles className="w-3 h-3 text-[#FCE36D] shrink-0" />
                <span>Order Approval Alert</span>
              </span>

              <h2
                id="order-push-title"
                className="font-ml text-lg font-bold text-[#2B0406]"
              >
                നിങ്ങളുടെ ഓർഡർ സ്വീകരിക്കുമ്പോൾ ഉടൻ അറിയാം!
              </h2>

              <p className="font-ml text-xs sm:text-sm mt-2 leading-relaxed text-[#4A070A]">
                ഇത് ഓൺ ആക്കി വെച്ചാൽ, നിങ്ങൾ നൽകുന്ന ഓർഡർ ഡിവിഷൻ കമ്മിറ്റി
                സ്വീകരിക്കുമ്പോൾ (Approve ചെയ്യുമ്പോൾ) അപ്പോൾ തന്നെ ഫോണിൽ അറിയിപ്പ്
                ലഭിക്കും. മറ്റു നോട്ടിഫിക്കേഷനുകളോ ഓർഡർ കോഡ് മെസ്സേജുകളോ ഒന്നും
                വരില്ല.
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
                  onClick={() => void handleEnableOrderPush()}
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
                      <span>അറിയിപ്പ് ഓൺ ചെയ്യുക</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={pushEnabling}
                  onClick={handleDismissOrderPush}
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
