export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const INSTALLED_FLAG_KEY = 'ssf_pwa_installed_v1';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let captureInitialized = false;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

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

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function clearDeferredInstallPrompt(): void {
  deferredPrompt = null;
  notifyListeners();
}

export function markPwaInstalledFlag(): void {
  try {
    window.localStorage.setItem(INSTALLED_FLAG_KEY, '1');
  } catch {
    // Ignore storage errors in private browsing
  }
}

export function hasPwaInstalledFlag(): boolean {
  try {
    return window.localStorage.getItem(INSTALLED_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function subscribePwaInstallEvents(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function initPwaInstallCapture(): void {
  if (typeof window === 'undefined' || captureInitialized) return;
  captureInitialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    markPwaInstalledFlag();
    notifyListeners();
  });
}

export function registerServiceWorker(): void {
  if (
    typeof window === 'undefined' ||
    !import.meta.env.PROD ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
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
