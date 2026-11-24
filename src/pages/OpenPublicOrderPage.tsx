import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { BrandLoadingScreen } from '../components/BrandLoadingScreen';
import { PublicLeaderboardDesktop } from '../components/public/PublicLeaderboardDesktop';
import { PublicLeaderboardMobile } from '../components/public/PublicLeaderboardMobile';
import { useRegisterPageDocs } from '../context/DocsContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { getCached, setCached } from '../lib/cache';
import type { PublicLeaderboardResponse } from '../types';
import { usePortalEdgeTheme } from '../utils/portalEdgeTheme';

const OpenPublicOrderModal = lazy(
  () => import('../components/public/OpenPublicOrderModal')
);

const LEADERBOARD_CACHE_KEY = 'wdr_public_leaderboard_v1';
const LEADERBOARD_CACHE_TTL_MS = 20_000;
const POSTER_PRELOAD_TIMEOUT_MS = 2500;
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

export default function OpenPublicOrderPage() {
  const isDesktop = useIsDesktop();
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
            onClose={() => setOrderModalOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
