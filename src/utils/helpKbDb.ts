import { supabase } from '../lib/supabase';
import type { HelpKbPayload, StoredHelpKb } from '../types';

const DB_NAME = 'ssf_wandoor_help_kb';
const DB_VERSION = 1;
const STORE_NAME = 'kb_store';
const ACTIVE_KEY = 'active' as const;
const FALLBACK_URL = '/help-kb-fallback.json';

let memoryCache: StoredHelpKb | null = null;
let inflightSync: Promise<void> | null = null;
let inflightFallback: Promise<StoredHelpKb | null> | null = null;
const listeners = new Set<(kb: StoredHelpKb) => void>();

function isValidPayload(raw: unknown): raw is HelpKbPayload {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Record<string, unknown>;
  return (
    Array.isArray(record.categories) &&
    record.categories.length > 0 &&
    Array.isArray(record.items) &&
    record.items.length > 0
  );
}

function isValidStoredKb(raw: unknown): raw is StoredHelpKb {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Record<string, unknown>;
  return (
    record.id === ACTIVE_KEY &&
    typeof record.version === 'number' &&
    isValidPayload(record.payload)
  );
}

function normalizePayload(
  raw: HelpKbPayload,
  updatedAt?: unknown
): HelpKbPayload {
  return {
    categories: raw.categories,
    items: raw.items,
    ...(typeof updatedAt === 'string'
      ? { updated_at: updatedAt }
      : typeof raw.updated_at === 'string'
        ? { updated_at: raw.updated_at }
        : {}),
    ...(typeof raw.admin_phone === 'string'
      ? { admin_phone: raw.admin_phone }
      : {}),
  };
}

function openHelpKbDb(): Promise<IDBDatabase | null> {
  if (
    typeof window === 'undefined' ||
    !('indexedDB' in window) ||
    !window.indexedDB
  ) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export function subscribeHelpKb(
  listener: (kb: StoredHelpKb) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getCachedHelpKb(): Promise<StoredHelpKb | null> {
  if (memoryCache && isValidStoredKb(memoryCache)) {
    return memoryCache;
  }

  const db = await openHelpKbDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(ACTIVE_KEY);

      req.onsuccess = () => {
        const result: unknown = req.result;
        if (isValidStoredKb(result)) {
          memoryCache = result;
          resolve(result);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function saveCachedHelpKb(
  version: number,
  payload: HelpKbPayload
): Promise<void> {
  const record: StoredHelpKb = {
    id: ACTIVE_KEY,
    version,
    payload,
    syncedAt: new Date().toISOString(),
  };

  memoryCache = record;
  for (const listener of listeners) {
    try {
      listener(record);
    } catch {
      // Ignore subscriber errors
    }
  }

  const db = await openHelpKbDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadFallbackHelpKb(): Promise<StoredHelpKb | null> {
  if (inflightFallback) return inflightFallback;

  inflightFallback = (async () => {
    try {
      const existing = await getCachedHelpKb();
      if (existing && existing.version > 0) {
        return existing;
      }

      if (typeof fetch !== 'function') return existing;
      const response = await fetch(FALLBACK_URL, { cache: 'default' });
      if (!response.ok) return existing;

      const parsed: unknown = await response.json();
      if (!isValidPayload(parsed)) return existing;

      // Re-check so we never downgrade a KB synced in parallel
      const latest = await getCachedHelpKb();
      if (latest && latest.version > 0) {
        return latest;
      }

      const normalized = normalizePayload(parsed);
      await saveCachedHelpKb(0, normalized);
      return memoryCache;
    } catch {
      return memoryCache;
    } finally {
      inflightFallback = null;
    }
  })();

  return inflightFallback;
}

export async function getLocalHelpKbOrFallback(): Promise<StoredHelpKb | null> {
  const cached = await getCachedHelpKb();
  if (cached && isValidPayload(cached.payload)) {
    return cached;
  }
  return loadFallbackHelpKb();
}

interface HelpKbSyncRpcResponse {
  up_to_date?: unknown;
  version?: unknown;
  updated_at?: unknown;
  payload?: unknown;
}

export function syncHelpKbIfNeeded(expectedVersion?: number): Promise<void> {
  if (inflightSync) return inflightSync;

  inflightSync = (async () => {
    let cached: StoredHelpKb | null = null;
    try {
      cached = await getCachedHelpKb();
      if (
        typeof expectedVersion === 'number' &&
        cached &&
        cached.version >= expectedVersion
      ) {
        return;
      }

      const { data, error } = await supabase.rpc('get_help_kb_sync', {
        p_client_version: cached?.version ?? 0,
      });

      if (error) {
        if (!cached) {
          await loadFallbackHelpKb();
        }
        return;
      }

      const res = (data ?? null) as HelpKbSyncRpcResponse | null;
      if (
        res &&
        res.up_to_date === false &&
        typeof res.version === 'number' &&
        isValidPayload(res.payload)
      ) {
        await saveCachedHelpKb(
          res.version,
          normalizePayload(res.payload, res.updated_at)
        );
      } else if (!cached) {
        await loadFallbackHelpKb();
      }
    } catch {
      if (!cached) {
        await loadFallbackHelpKb();
      }
    } finally {
      inflightSync = null;
    }
  })();

  return inflightSync;
}
