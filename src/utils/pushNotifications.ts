import { isAppInstalledStandalone } from './registerSw';

const PUSH_DISMISS_STORAGE_KEY = 'ssf_push_prompt_dismissed_at_v1';
const PUSH_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const PUSH_USER_DISABLED_KEY = 'ssf_push_user_disabled_v1';
const ADMIN_AUTO_UPDATE_PUSH_KEY = 'ssf_admin_auto_update_push_v1';
const ADMIN_AUTO_NOTIFIED_VERSION_KEY = 'ssf_admin_auto_notified_version_v1';

const uiListeners = new Set<() => void>();

function notifyUiListeners(): void {
  for (const listener of uiListeners) {
    listener();
  }
}

export function subscribePushUiState(listener: () => void): () => void {
  uiListeners.add(listener);
  return () => {
    uiListeners.delete(listener);
  };
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isIosNonStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIosDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIosDevice) return false;
  return !isAppInstalledStandalone();
}

export function getNotificationPermission():
  | NotificationPermission
  | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

let cachedRuntimeVapidKey = '';
let pendingVapidKeyPromise: Promise<string> | null = null;

export function getVapidPublicKey(): string {
  const envKey = String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();
  return envKey || cachedRuntimeVapidKey;
}

export async function resolveVapidPublicKey(): Promise<string> {
  const immediate = getVapidPublicKey();
  if (immediate) return immediate;

  if (!pendingVapidKeyPromise) {
    pendingVapidKeyPromise = (async () => {
      try {
        const response = await fetch('/api/push/public-key', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return '';
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          publicKey?: string;
        };
        const key =
          data && data.ok && typeof data.publicKey === 'string'
            ? data.publicKey.trim()
            : '';
        if (key) {
          cachedRuntimeVapidKey = key;
          notifyUiListeners();
        }
        return key;
      } catch {
        return '';
      } finally {
        pendingVapidKeyPromise = null;
      }
    })();
  }

  return pendingVapidKeyPromise;
}

export function getAppBuildVersion(): string {
  const raw = String(import.meta.env.VITE_APP_BUILD_VERSION ?? '').trim();
  return raw || 'dev';
}

function isUserManuallyDisabled(): boolean {
  try {
    return window.localStorage.getItem(PUSH_USER_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function setUserManuallyDisabled(disabled: boolean): void {
  try {
    if (disabled) {
      window.localStorage.setItem(PUSH_USER_DISABLED_KEY, '1');
    } else {
      window.localStorage.removeItem(PUSH_USER_DISABLED_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function isPushDismissCooldownActive(): boolean {
  try {
    const raw = window.localStorage.getItem(PUSH_DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return Date.now() - ts < PUSH_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function markPushPromptDismissed(): void {
  try {
    window.localStorage.setItem(PUSH_DISMISS_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage errors
  }
}

export function getAdminAutoUpdatePushEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(ADMIN_AUTO_UPDATE_PUSH_KEY);
    return raw !== '0';
  } catch {
    return true;
  }
}

export function setAdminAutoUpdatePushEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      ADMIN_AUTO_UPDATE_PUSH_KEY,
      enabled ? '1' : '0'
    );
  } catch {
    // Ignore storage errors
  }
  notifyUiListeners();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getActiveSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (import.meta.env.PROD) {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (!existing) {
      await navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => undefined);
    }
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) =>
        window.setTimeout(() => resolve(null), 5000)
      ),
    ]);
  }

  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing ?? null;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await getActiveSwRegistration();
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function persistSubscriptionOnServer(
  sessionToken: string,
  subscription: PushSubscription
): Promise<void> {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      userAgent: navigator.userAgent,
    }),
  });

  if (!response.ok) {
    let message = 'Unable to register push subscription.';
    try {
      const data = (await response.json()) as { error?: string };
      if (data && typeof data.error === 'string' && data.error) {
        message = data.error;
      }
    } catch {
      // Ignore parse failures
    }
    throw new Error(message);
  }
}

export async function subscribeToPush(
  sessionToken: string
): Promise<{ ok: boolean; error?: string }> {
  if (!sessionToken) {
    return { ok: false, error: 'Active login session is required.' };
  }
  if (!isPushSupported()) {
    return {
      ok: false,
      error: 'Push notifications are not supported on this browser.',
    };
  }
  if (isIosNonStandalone()) {
    return {
      ok: false,
      error:
        'Install the app via Safari Add to Home Screen first to enable notifications on iOS.',
    };
  }

  const vapidPublicKey = await resolveVapidPublicKey();
  if (!vapidPublicKey) {
    return { ok: false, error: 'Push VAPID public key is not configured.' };
  }

  try {
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission !== 'granted') {
      notifyUiListeners();
      return {
        ok: false,
        error:
          permission === 'denied'
            ? 'Notification permission is blocked in browser settings.'
            : 'Notification permission was dismissed.',
      };
    }

    const registration = await getActiveSwRegistration();
    if (!registration) {
      return {
        ok: false,
        error: 'Service Worker is not active yet. Please try again shortly.',
      };
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    setUserManuallyDisabled(false);
    await persistSubscriptionOnServer(sessionToken, subscription);
    notifyUiListeners();
    return { ok: true };
  } catch (err) {
    notifyUiListeners();
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Unable to enable notifications.',
    };
  }
}

export async function syncExistingPushSubscription(
  sessionToken: string
): Promise<void> {
  if (
    !sessionToken ||
    !isPushSupported() ||
    isIosNonStandalone() ||
    Notification.permission !== 'granted' ||
    isUserManuallyDisabled()
  ) {
    return;
  }

  const vapidPublicKey = await resolveVapidPublicKey();
  if (!vapidPublicKey) return;

  try {
    const registration = await getActiveSwRegistration();
    if (!registration) return;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    await persistSubscriptionOnServer(sessionToken, subscription);
    notifyUiListeners();
  } catch {
    // Non-fatal background sync
  }
}

export async function unsubscribeFromPush(options?: {
  userInitiated?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (options?.userInitiated) {
    setUserManuallyDisabled(true);
  }

  try {
    const subscription = await getExistingPushSubscription();
    if (subscription) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
        keepalive: true,
      }).catch(() => undefined);

      await subscription.unsubscribe().catch(() => false);
    }
    notifyUiListeners();
    return { ok: true };
  } catch (err) {
    notifyUiListeners();
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Unable to disable notifications.',
    };
  }
}

export async function sendTestPush(
  sessionToken: string
): Promise<{ ok: boolean; sent?: number; error?: string }> {
  if (!sessionToken) {
    return { ok: false, error: 'Active login session is required.' };
  }

  try {
    const subscription = await getExistingPushSubscription();
    const response = await fetch('/api/push/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        ...(subscription ? { endpoint: subscription.endpoint } : {}),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      sent?: number;
      error?: string;
    };

    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || 'Failed to send test notification.',
      };
    }

    return { ok: true, sent: data.sent ?? 0 };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Unable to send test notification.',
    };
  }
}

export function notifyOrderCreated(
  orderId: number,
  source: 'portal' | 'public' = 'portal'
): void {
  if (
    typeof window === 'undefined' ||
    !Number.isInteger(orderId) ||
    orderId <= 0
  ) {
    return;
  }

  try {
    void fetch('/api/push/order-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, source }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Fire-and-forget: never block order creation flow
  }
}

export interface TriggerAppUpdatePushResult {
  ok: boolean;
  claimed?: boolean;
  alreadyNotified?: boolean;
  sent?: number;
  failed?: number;
  pruned?: number;
  totalSubscribers?: number;
  error?: string;
}

export async function triggerAppUpdatePush(
  sessionToken: string,
  options?: {
    version?: string;
    force?: boolean;
    customMessage?: string;
  }
): Promise<TriggerAppUpdatePushResult> {
  if (!sessionToken) {
    return { ok: false, error: 'Division Admin session is required.' };
  }

  try {
    const response = await fetch('/api/push/notify-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        version: options?.version || getAppBuildVersion(),
        force: options?.force === true,
        customMessage: options?.customMessage,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as TriggerAppUpdatePushResult;
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || 'Unable to send app update notification.',
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Unable to send app update notification.',
    };
  }
}

export async function maybeAutoNotifyAdminAppUpdate(
  sessionToken: string
): Promise<void> {
  if (typeof window === 'undefined' || !sessionToken || !import.meta.env.PROD) {
    return;
  }

  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return;
  }

  if (!getAdminAutoUpdatePushEnabled()) {
    return;
  }

  const buildVersion = getAppBuildVersion();
  if (!buildVersion || buildVersion === 'dev') {
    return;
  }

  try {
    if (
      window.localStorage.getItem(ADMIN_AUTO_NOTIFIED_VERSION_KEY) ===
      buildVersion
    ) {
      return;
    }
  } catch {
    // Continue; server-side claim_app_update_push still guarantees once-per-version
  }

  const result = await triggerAppUpdatePush(sessionToken, {
    version: buildVersion,
    force: false,
  });

  if (result.ok) {
    try {
      window.localStorage.setItem(
        ADMIN_AUTO_NOTIFIED_VERSION_KEY,
        buildVersion
      );
    } catch {
      // Ignore storage errors
    }
  }
}
