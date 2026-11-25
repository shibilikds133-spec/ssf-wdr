import { isAppInstalledStandalone } from './registerSw';

const PUSH_DISMISS_STORAGE_KEY = 'ssf_push_prompt_dismissed_at_v1';
const PUBLIC_PUSH_DISMISS_STORAGE_KEY = 'ssf_public_push_dismissed_at_v1';
const OPEN_ORDER_PUSH_DISMISSED_KEY = 'wdr_open_order_push_dismissed_v1';
const OPEN_ORDER_PUSH_OPTED_IN_KEY = 'wdr_open_order_push_opted_in_v1';
const OPEN_ORDER_REQUEST_IDS_KEY = 'wdr_open_order_request_ids_v1';
const MAX_OPEN_ORDER_REQUEST_IDS = 10;
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

export function watchNotificationPermissionChange(
  onChange: (permission: NotificationPermission) => void
): () => void {
  if (
    typeof navigator === 'undefined' ||
    !('permissions' in navigator) ||
    typeof navigator.permissions.query !== 'function'
  ) {
    return () => {};
  }

  let active = true;
  let statusObj: PermissionStatus | null = null;
  const handleChange = () => {
    if (!active) return;
    if (typeof window !== 'undefined' && 'Notification' in window) {
      onChange(Notification.permission);
      notifyUiListeners();
    }
  };

  void navigator.permissions
    .query({ name: 'notifications' as PermissionName })
    .then((status) => {
      if (!active) return;
      statusObj = status;
      status.addEventListener('change', handleChange);
    })
    .catch(() => {
      // Safari / unsupported browsers
    });

  return () => {
    active = false;
    if (statusObj) {
      statusObj.removeEventListener('change', handleChange);
    }
  };
}

export function getDeviceNotificationGuide(): {
  platformLabel: string;
  steps: string[];
} {
  if (typeof navigator === 'undefined') {
    return {
      platformLabel: 'Browser Settings',
      steps: [
        'ബ്രൗസർ അഡ്രസ് ബാറിലെ 🔒 അല്ലെങ്കിൽ ⚙️ (Site Settings) തുറക്കുക.',
        'Notifications എന്നത് "Allow" ആക്കി മാറ്റുക.',
        'ശേഷം താഴെയുള്ള "വീണ്ടും പരിശോധിക്കുക" ബട്ടൺ അമർത്തുക.',
      ],
    };
  }

  const ua = navigator.userAgent || '';
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos) {
    return {
      platformLabel: 'iPhone / iPad Settings',
      steps: [
        'ഫോണിന്റെ Settings → Notifications → SSF Payasam (അല്ലെങ്കിൽ Safari) തുറക്കുക.',
        'Allow Notifications ഓൺ ആക്കുക.',
        'ശേഷം ആപ്പിലേക്ക് തിരികെ വന്ന് "വീണ്ടും പരിശോധിക്കുക" അമർത്തുക.',
      ],
    };
  }

  const isAndroid = /Android/i.test(ua);
  if (isAndroid) {
    return {
      platformLabel: 'Android Chrome / System Settings',
      steps: [
        'മുകളിൽ അഡ്രസ് ബാറിലെ 🔒 / ⓘ (Site settings) ടാപ്പ് ചെയ്ത് Notifications → Allow ആക്കുക.',
        'Chrome-ന് സിസ്റ്റം നോട്ടിഫിക്കേഷൻ ഓഫ് ആണെങ്കിൽ: ഫോൺ Settings → Apps → Chrome → Notifications → Allow ആക്കുക.',
        'ശേഷം താഴെയുള്ള "വീണ്ടും പരിശോധിക്കുക" ബട്ടൺ ടാപ്പ് ചെയ്യുക.',
      ],
    };
  }

  return {
    platformLabel: 'Desktop Chrome / System Settings',
    steps: [
      'അഡ്രസ് ബാറിന് ഇടതുവശത്തെ 🔒 / ⚙️ (Site settings) ക്ലിക്ക് ചെയ്ത് Notifications → Allow ആക്കുക.',
      'സിസ്റ്റം നോട്ടിഫിക്കേഷൻ ഓഫ് ആണെങ്കിൽ Windows/Mac Settings-ൽ Chrome Notifications ഓൺ ആക്കുക.',
      'ശേഷം താഴെയുള്ള "വീണ്ടും പരിശോധിക്കുക" ബട്ടൺ ക്ലിക്ക് ചെയ്യുക.',
    ],
  };
}

let cachedRuntimeVapidKey = '';
let pendingVapidKeyPromise: Promise<string> | null = null;
let missingBuildVapidWarned = false;
let serverSubscriptionSynced: boolean | null = null;
let lastPushSyncError: string | null = null;

function warnMissingBuildVapidKeyOnce(): void {
  if (missingBuildVapidWarned || typeof window === 'undefined') return;
  if (!String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()) {
    missingBuildVapidWarned = true;
    console.error(
      '[Push] VITE_VAPID_PUBLIC_KEY is missing in this build. Set VITE_VAPID_PUBLIC_KEY in Cloudflare Pages Build Environment Variables and .env.'
    );
  }
}

export function hasBuildVapidPublicKey(): boolean {
  return Boolean(String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim());
}

export function getVapidPublicKey(): string {
  const envKey = String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();
  if (!envKey) {
    warnMissingBuildVapidKeyOnce();
  }
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
        if (!response.ok) {
          console.error(
            `[Push] Runtime VAPID key endpoint /api/push/public-key returned HTTP ${response.status}.`
          );
          return '';
        }
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
        } else {
          console.error(
            '[Push] /api/push/public-key returned an empty VAPID public key.'
          );
        }
        return key;
      } catch (err) {
        console.error('[Push] Failed to fetch /api/push/public-key:', err);
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

export function isPublicPushDismissCooldownActive(): boolean {
  try {
    const raw = window.localStorage.getItem(PUBLIC_PUSH_DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return Date.now() - ts < PUSH_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function markPublicPushPromptDismissed(): void {
  try {
    window.localStorage.setItem(
      PUBLIC_PUSH_DISMISS_STORAGE_KEY,
      String(Date.now())
    );
  } catch {
    // Ignore storage errors
  }
}

export function isOpenOrderPushPromptDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(OPEN_ORDER_PUSH_DISMISSED_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return Date.now() - ts < PUSH_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function markOpenOrderPushPromptDismissed(): void {
  try {
    window.localStorage.setItem(
      OPEN_ORDER_PUSH_DISMISSED_KEY,
      String(Date.now())
    );
  } catch {
    // Ignore storage errors
  }
}

export function isOpenOrderPushOptedIn(): boolean {
  try {
    return window.localStorage.getItem(OPEN_ORDER_PUSH_OPTED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

function setOpenOrderPushOptedIn(optedIn: boolean): void {
  try {
    if (optedIn) {
      window.localStorage.setItem(OPEN_ORDER_PUSH_OPTED_IN_KEY, '1');
    } else {
      window.localStorage.removeItem(OPEN_ORDER_PUSH_OPTED_IN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getRememberedOpenOrderRequestIds(): string[] {
  try {
    const raw = window.localStorage.getItem(OPEN_ORDER_REQUEST_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      .slice(0, MAX_OPEN_ORDER_REQUEST_IDS);
  } catch {
    return [];
  }
}

export function rememberOpenOrderRequestId(requestId: string): void {
  const clean = requestId.trim();
  if (!clean) return;
  try {
    const current = getRememberedOpenOrderRequestIds().filter(
      (id) => id !== clean
    );
    const next = [clean, ...current].slice(0, MAX_OPEN_ORDER_REQUEST_IDS);
    window.localStorage.setItem(OPEN_ORDER_REQUEST_IDS_KEY, JSON.stringify(next));
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

function matchesApplicationServerKey(
  subscription: PushSubscription,
  expectedBytes: Uint8Array<ArrayBuffer>
): boolean {
  const existingKey = subscription.options?.applicationServerKey;
  if (!existingKey) return true;
  const actual = new Uint8Array(existingKey);
  if (actual.byteLength !== expectedBytes.byteLength) return false;
  for (let i = 0; i < actual.byteLength; i += 1) {
    if (actual[i] !== expectedBytes[i]) return false;
  }
  return true;
}

async function getOrCreateMatchedSubscription(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription> {
  const expectedKey = urlBase64ToUint8Array(vapidPublicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing && !matchesApplicationServerKey(existing, expectedKey)) {
    await existing.unsubscribe().catch(() => false);
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expectedKey,
    });
  }
  return (
    existing ??
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expectedKey,
    })
  );
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
        window.setTimeout(() => resolve(null), 8000)
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

export interface PushDiagnosticsSnapshot {
  supported: boolean;
  iosNonStandalone: boolean;
  permission: NotificationPermission | 'unsupported';
  serviceWorkerState: 'Active' | 'Not Ready' | 'Unsupported';
  hasLocalSubscription: boolean;
  serverSynced: boolean;
  hasBuildVapidKey: boolean;
  hasResolvedVapidKey: boolean;
  lastError: string | null;
}

export async function getPushDiagnostics(): Promise<PushDiagnosticsSnapshot> {
  const supported = isPushSupported();
  const iosNonStandalone = isIosNonStandalone();
  const permission = getNotificationPermission();
  const hasBuildVapidKey = hasBuildVapidPublicKey();
  const hasResolvedVapidKey = Boolean(getVapidPublicKey());

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return {
      supported,
      iosNonStandalone,
      permission,
      serviceWorkerState: 'Unsupported',
      hasLocalSubscription: false,
      serverSynced: false,
      hasBuildVapidKey,
      hasResolvedVapidKey,
      lastError: lastPushSyncError,
    };
  }

  let serviceWorkerState: 'Active' | 'Not Ready' | 'Unsupported' = 'Not Ready';
  let hasLocalSubscription = false;

  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (reg && reg.active) {
      serviceWorkerState = 'Active';
      if (supported && !iosNonStandalone) {
        const sub = await reg.pushManager.getSubscription().catch(() => null);
        hasLocalSubscription = Boolean(sub);
      }
    }
  } catch {
    serviceWorkerState = 'Not Ready';
  }

  const serverSynced =
    hasLocalSubscription &&
    permission === 'granted' &&
    serverSubscriptionSynced !== false;

  return {
    supported,
    iosNonStandalone,
    permission,
    serviceWorkerState,
    hasLocalSubscription,
    serverSynced,
    hasBuildVapidKey,
    hasResolvedVapidKey,
    lastError: lastPushSyncError,
  };
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
    serverSubscriptionSynced = false;
    let message = `Unable to register push subscription (HTTP ${response.status}).`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data && typeof data.error === 'string' && data.error) {
        message = data.error;
      }
    } catch {
      // Ignore parse failures
    }
    lastPushSyncError = message;
    throw new Error(message);
  }

  serverSubscriptionSynced = true;
  lastPushSyncError = null;
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

  if (Notification.permission === 'denied') {
    notifyUiListeners();
    return {
      ok: false,
      error: 'Notification permission is blocked in browser settings.',
    };
  }

  try {
    // Request permission FIRST directly from the user-gesture click path
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

    const vapidPublicKey = await resolveVapidPublicKey();
    if (!vapidPublicKey) {
      const msg =
        'Push VAPID public key is not configured (VITE_VAPID_PUBLIC_KEY / /api/push/public-key).';
      lastPushSyncError = msg;
      serverSubscriptionSynced = false;
      notifyUiListeners();
      return { ok: false, error: msg };
    }

    const registration = await getActiveSwRegistration();
    if (!registration) {
      const msg =
        'Service Worker is not active yet. Please reload or use production build and try again.';
      lastPushSyncError = msg;
      serverSubscriptionSynced = false;
      notifyUiListeners();
      return { ok: false, error: msg };
    }

    const subscription = await getOrCreateMatchedSubscription(
      registration,
      vapidPublicKey
    );

    setUserManuallyDisabled(false);
    await persistSubscriptionOnServer(sessionToken, subscription);
    notifyUiListeners();
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to enable notifications.';
    lastPushSyncError = message;
    serverSubscriptionSynced = false;
    notifyUiListeners();
    return {
      ok: false,
      error: message,
    };
  }
}

export async function subscribePublicPush(): Promise<{
  ok: boolean;
  error?: string;
}> {
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

  if (Notification.permission === 'denied') {
    notifyUiListeners();
    return {
      ok: false,
      error: 'Notification permission is blocked in browser settings.',
    };
  }

  try {
    // Request permission FIRST directly from the user-gesture click path
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

    const vapidPublicKey = await resolveVapidPublicKey();
    if (!vapidPublicKey) {
      return { ok: false, error: 'Push VAPID public key is not configured.' };
    }

    const registration = await getActiveSwRegistration();
    if (!registration) {
      return {
        ok: false,
        error: 'Service Worker is not active yet. Please try again shortly.',
      };
    }

    const subscription = await getOrCreateMatchedSubscription(
      registration,
      vapidPublicKey
    );

    const response = await fetch('/api/push/subscribe-public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
      }),
    });

    if (!response.ok) {
      let message = 'Unable to register public push subscription.';
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

export async function subscribeOpenOrderPush(
  requestId?: string
): Promise<{ ok: boolean; error?: string }> {
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

  if (Notification.permission === 'denied') {
    notifyUiListeners();
    return {
      ok: false,
      error: 'Notification permission is blocked in browser settings.',
    };
  }

  try {
    // Request permission FIRST directly from the user-gesture click path
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

    const vapidPublicKey = await resolveVapidPublicKey();
    if (!vapidPublicKey) {
      return { ok: false, error: 'Push VAPID public key is not configured.' };
    }

    const registration = await getActiveSwRegistration();
    if (!registration) {
      return {
        ok: false,
        error: 'Service Worker is not active yet. Please try again shortly.',
      };
    }

    const subscription = await getOrCreateMatchedSubscription(
      registration,
      vapidPublicKey
    );

    if (requestId) {
      rememberOpenOrderRequestId(requestId);
    }
    const requestIds = Array.from(
      new Set([
        ...(requestId ? [requestId] : []),
        ...getRememberedOpenOrderRequestIds(),
      ])
    ).slice(0, MAX_OPEN_ORDER_REQUEST_IDS);

    const response = await fetch('/api/push/subscribe-order-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        requestIds,
        userAgent: navigator.userAgent,
      }),
    });

    if (!response.ok) {
      let message = 'Unable to enable order approval notifications.';
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

    setOpenOrderPushOptedIn(true);
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

export async function attachExistingOpenOrderPush(
  requestId: string
): Promise<boolean> {
  if (
    !requestId ||
    !isPushSupported() ||
    isIosNonStandalone() ||
    Notification.permission !== 'granted' ||
    !isOpenOrderPushOptedIn()
  ) {
    return false;
  }

  const vapidPublicKey = await resolveVapidPublicKey();
  if (!vapidPublicKey) return false;

  try {
    const registration = await getActiveSwRegistration();
    if (!registration) return false;

    const subscription = await getOrCreateMatchedSubscription(
      registration,
      vapidPublicKey
    );

    const response = await fetch('/api/push/subscribe-order-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        requestIds: [requestId],
        userAgent: navigator.userAgent,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function notifyPublicOrderApproved(
  sessionToken: string,
  requestId: string
): void {
  if (
    typeof window === 'undefined' ||
    !sessionToken ||
    !requestId
  ) {
    return;
  }

  try {
    void fetch('/api/push/public-order-approved', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ requestId }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Fire-and-forget: never block admin approval flow
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

    const subscription = await getOrCreateMatchedSubscription(
      registration,
      vapidPublicKey
    );

    await persistSubscriptionOnServer(sessionToken, subscription);
    notifyUiListeners();
  } catch (err) {
    serverSubscriptionSynced = false;
    lastPushSyncError =
      err instanceof Error ? err.message : 'Background push sync failed.';
    notifyUiListeners();
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
    serverSubscriptionSynced = false;
    lastPushSyncError = null;
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
): Promise<{ ok: boolean; sent?: number; failed?: number; error?: string }> {
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
      failed?: number;
      error?: string;
    };

    if (!response.ok || !data.ok) {
      const errorMsg =
        data.error || `Failed to send test notification (HTTP ${response.status}).`;
      lastPushSyncError = errorMsg;
      notifyUiListeners();
      return {
        ok: false,
        sent: data.sent ?? 0,
        failed: data.failed ?? 0,
        error: errorMsg,
      };
    }

    lastPushSyncError = null;
    serverSubscriptionSynced = true;
    notifyUiListeners();
    return { ok: true, sent: data.sent ?? 0, failed: data.failed ?? 0 };
  } catch (err) {
    const errorMsg =
      err instanceof Error
        ? err.message
        : 'Unable to send test notification.';
    lastPushSyncError = errorMsg;
    notifyUiListeners();
    return {
      ok: false,
      error: errorMsg,
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
