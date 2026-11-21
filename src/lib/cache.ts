interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

function isValidCacheEntry(value: unknown): value is CacheEntry<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CacheEntry<unknown>).timestamp === 'number' &&
    'data' in value
  );
}

export function getCached<T>(key: string, ttlMs: number): T | null {
  const now = Date.now();
  const mem = memoryCache.get(key);

  if (mem) {
    if (now - mem.timestamp < ttlMs) {
      return mem.data as T;
    }
    memoryCache.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage access errors in private browsing
    }
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isValidCacheEntry(parsed)) {
      window.localStorage.removeItem(key);
      return null;
    }
    if (now - parsed.timestamp < ttlMs) {
      memoryCache.set(key, parsed);
      return parsed.data as T;
    }
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage or parse errors
  }

  return null;
}

export function setCached<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
  };

  memoryCache.set(key, entry);

  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore quota or private-browsing storage errors
  }
}

export function clearCached(key: string): void {
  memoryCache.delete(key);

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage access errors
  }
}
