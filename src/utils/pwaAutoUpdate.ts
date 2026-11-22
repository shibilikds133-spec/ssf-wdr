const VISIBILITY_CHECK_THROTTLE_MS = 3 * 60 * 1000;
const PERIODIC_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const FALLBACK_RELOAD_TIMEOUT_MS = 2500;
const PRELOAD_RELOAD_STORAGE_KEY = 'ssf_pwa_preload_reload_at_v1';
const PRELOAD_RELOAD_COOLDOWN_MS = 60 * 1000;

let activeRegistration: ServiceWorkerRegistration | null = null;
let waitingWorker: ServiceWorker | null = null;
let updateAvailable = false;
let isApplyingUpdate = false;
let isRefreshing = false;
let lastUpdateCheckAt = 0;
let initialized = false;
let controllerChangeBound = false;
let preloadRecoveryBound = false;
let fallbackReloadTimer: number | null = null;

const trackedWorkers = new WeakSet<ServiceWorker>();
const listeners = new Set<(available: boolean) => void>();

export function isAppInstalledStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  const standaloneMedia =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches);

  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;

  const androidAppReferrer =
    typeof document !== 'undefined' &&
    document.referrer.startsWith('android-app://');

  return Boolean(standaloneMedia || iosStandalone || androidAppReferrer);
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(updateAvailable);
  }
}

function markUpdateAvailable(worker: ServiceWorker | null): void {
  if (worker) {
    waitingWorker = worker;
  }

  // Only show the update modal inside installed PWA standalone mode.
  // Regular browser tabs activate the new SW silently in the background.
  if (!isAppInstalledStandalone()) {
    const target = worker ?? activeRegistration?.waiting ?? waitingWorker;
    if (
      target &&
      target.state !== 'activated' &&
      target.state !== 'redundant'
    ) {
      try {
        target.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        // Ignore postMessage errors; next load will activate the new SW
      }
    }
    return;
  }

  if (!updateAvailable) {
    updateAvailable = true;
    notifyListeners();
  }
}

function clearFallbackTimer(): void {
  if (fallbackReloadTimer !== null) {
    window.clearTimeout(fallbackReloadTimer);
    fallbackReloadTimer = null;
  }
}

function performGuardedReload(): void {
  if (isRefreshing) return;
  isRefreshing = true;
  clearFallbackTimer();
  window.location.reload();
}

function handleControllerChange(): void {
  if (!isApplyingUpdate) return;
  performGuardedReload();
}

function bindControllerChangeListener(): void {
  if (controllerChangeBound || !('serviceWorker' in navigator)) return;
  controllerChangeBound = true;
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    handleControllerChange
  );
}

function watchInstallingWorker(worker: ServiceWorker): void {
  if (trackedWorkers.has(worker)) return;
  trackedWorkers.add(worker);

  const checkInstalled = () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      markUpdateAvailable(activeRegistration?.waiting ?? worker);
    }
  };

  checkInstalled();
  worker.addEventListener('statechange', checkInstalled);
}

function initVitePreloadErrorRecovery(): void {
  if (typeof window === 'undefined' || preloadRecoveryBound) return;
  preloadRecoveryBound = true;

  window.addEventListener('vite:preloadError', (event: Event) => {
    try {
      const raw = window.sessionStorage.getItem(PRELOAD_RELOAD_STORAGE_KEY);
      if (raw) {
        const lastReloadAt = Number(raw);
        if (
          Number.isFinite(lastReloadAt) &&
          Date.now() - lastReloadAt < PRELOAD_RELOAD_COOLDOWN_MS
        ) {
          return;
        }
      }
      window.sessionStorage.setItem(
        PRELOAD_RELOAD_STORAGE_KEY,
        String(Date.now())
      );
    } catch {
      // Avoid unguarded reloads when sessionStorage is unavailable
      return;
    }

    event.preventDefault();
    const pendingWorker = activeRegistration?.waiting ?? waitingWorker;
    if (pendingWorker) {
      applyPwaUpdate();
    } else {
      performGuardedReload();
    }
  });
}

export function isPwaUpdateAvailable(): boolean {
  return updateAvailable;
}

export function subscribePwaUpdate(
  listener: (available: boolean) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function checkForPwaUpdate(force = false): void {
  if (!activeRegistration || isApplyingUpdate || isRefreshing) return;

  if (activeRegistration.waiting) {
    markUpdateAvailable(activeRegistration.waiting);
    return;
  }

  if (navigator.onLine === false) return;

  const now = Date.now();
  if (!force && now - lastUpdateCheckAt < VISIBILITY_CHECK_THROTTLE_MS) {
    return;
  }

  lastUpdateCheckAt = now;
  void activeRegistration.update().catch(() => undefined);
}

export function applyPwaUpdate(): void {
  if (typeof window === 'undefined' || isRefreshing || isApplyingUpdate) return;
  isApplyingUpdate = true;

  const targetWorker = activeRegistration?.waiting ?? waitingWorker;
  if (
    !('serviceWorker' in navigator) ||
    !targetWorker ||
    targetWorker.state === 'activated' ||
    targetWorker.state === 'redundant'
  ) {
    performGuardedReload();
    return;
  }

  bindControllerChangeListener();
  fallbackReloadTimer = window.setTimeout(
    performGuardedReload,
    FALLBACK_RELOAD_TIMEOUT_MS
  );

  try {
    targetWorker.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    performGuardedReload();
  }
}

export function initPwaAutoUpdate(): void {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  let shouldForceUpdateCheck = false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkUpdate') === '1') {
      shouldForceUpdateCheck = true;
      params.delete('checkUpdate');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${
        nextSearch ? `?${nextSearch}` : ''
      }${window.location.hash}`;
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  } catch {
    // Ignore history/URL parsing errors
  }

  initVitePreloadErrorRecovery();

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  if (shouldForceUpdateCheck) {
    navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => {
        if (!reg) return;
        activeRegistration = reg;
        if (reg.waiting) {
          markUpdateAvailable(reg.waiting);
        } else {
          checkForPwaUpdate(true);
        }
      })
      .catch(() => undefined);
  }

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CHECK_PWA_UPDATE') {
      checkForPwaUpdate(true);
    }
  });

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        activeRegistration = registration;
        bindControllerChangeListener();

        if (registration.waiting) {
          markUpdateAvailable(registration.waiting);
        }

        if (registration.installing) {
          watchInstallingWorker(registration.installing);
        }

        registration.addEventListener('updatefound', () => {
          if (registration.installing) {
            watchInstallingWorker(registration.installing);
          }
        });

        checkForPwaUpdate(true);

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            checkForPwaUpdate(false);
          }
        });

        window.setInterval(() => {
          if (document.visibilityState === 'visible') {
            checkForPwaUpdate(true);
          }
        }, PERIODIC_CHECK_INTERVAL_MS);
      })
      .catch(() => {
        // Non-fatal: app continues normally without SW
      });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
