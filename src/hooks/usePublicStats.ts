import { useCallback, useEffect, useRef, useState } from 'react';
import { clearCached, getCached, setCached } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type { PublicStatsResponse } from '../types';

const CACHE_KEY = 'wdr_public_stats_v1';
const CACHE_TTL_MS = 30_000;

export function usePublicStats() {
  const [data, setData] = useState<PublicStatsResponse | null>(() =>
    getCached<PublicStatsResponse>(CACHE_KEY, CACHE_TTL_MS)
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCached<PublicStatsResponse>(CACHE_KEY, CACHE_TTL_MS)
  );
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  const refresh = useCallback(async (force = false): Promise<void> => {
    if (!force) {
      const cached = getCached<PublicStatsResponse>(CACHE_KEY, CACHE_TTL_MS);
      if (cached) {
        if (mountedRef.current) {
          setData(cached);
          setError(null);
          setLoading(false);
        }
        return;
      }
    } else {
      clearCached(CACHE_KEY);
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_public_stats'
      );

      if (!mountedRef.current) {
        return;
      }

      if (rpcError) {
        setError(rpcError.message || 'Failed to load division statistics.');
        setLoading(false);
        return;
      }

      if (!rpcData) {
        setError('No statistics data returned from server.');
        setLoading(false);
        return;
      }

      const stats = rpcData as PublicStatsResponse;
      setCached(CACHE_KEY, stats);
      setData(stats);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to reach server for public statistics.'
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!getCached<PublicStatsResponse>(CACHE_KEY, CACHE_TTL_MS)) {
      void refresh(false);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
