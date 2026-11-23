import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getDocsAccountScope,
  mergeSeenDocPageLists,
  normalizeDocPageKeys,
  writeLocalSeenDocPage,
} from '../utils/docsConfig';
import type { AuthSession, UserRole } from '../types';

async function getSupabase() {
  const mod = await import('../lib/supabase');
  return mod.supabase;
}

function scheduleIdleTask(task: () => void, delayMs = 2000): () => void {
  if (typeof window === 'undefined') return () => {};
  let idleId: number | null = null;
  const win = window as Window & {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  const timerId = window.setTimeout(() => {
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(() => {
        idleId = null;
        task();
      }, { timeout: 2500 });
    } else {
      task();
    }
  }, delayMs);

  return () => {
    window.clearTimeout(timerId);
    if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(idleId);
    }
  };
}

const AUTH_STORAGE_KEY = 'wdr_auth_session_v1';
const AUTH_NOTICE_KEY = 'wdr_auth_notice_v1';
const KB_CHECKED_SESSION_KEY = 'wdr_kb_checked_session';

interface LoginResult {
  ok: boolean;
  error?: string;
  role?: UserRole;
  must_change_password?: boolean;
}

interface FirstLoginResult {
  ok: boolean;
  error?: string;
  role?: UserRole;
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  authNotice: string | null;
  clearAuthNotice: () => void;
  login: (username: string, password: string) => Promise<LoginResult>;
  completeFirstLogin: (
    newPassword: string,
    newUsername?: string
  ) => Promise<FirstLoginResult>;
  logout: (notice?: string) => void;
  handleSessionExpired: (message?: string) => void;
  markDocPageSeen: (pageKey: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function getHomeRouteForRole(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'SECTOR':
      return '/sector';
    case 'UNIT':
      return '/dashboard';
  }
}

export function isSessionExpiredError(errMessage?: string | null): boolean {
  if (!errMessage) return false;
  return (
    errMessage.includes('SESSION_EXPIRED') ||
    errMessage.toLowerCase().includes('session expired')
  );
}

function isValidRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'SECTOR' || value === 'UNIT';
}

function saveSession(nextSession: AuthSession): void {
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
  } catch {
    // Ignore storage errors in private browsing
  }
}

function readNotice(): string | null {
  try {
    const val = window.localStorage.getItem(AUTH_NOTICE_KEY);
    if (val) {
      window.localStorage.removeItem(AUTH_NOTICE_KEY);
      return val;
    }
    return null;
  } catch {
    return null;
  }
}

function saveNotice(msg: string): void {
  try {
    window.localStorage.setItem(AUTH_NOTICE_KEY, msg);
  } catch {
    // Ignore storage errors
  }
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      !isValidRole(record.role) ||
      typeof record.code !== 'string' ||
      typeof record.login_code !== 'string' ||
      typeof record.username !== 'string' ||
      typeof record.name !== 'string' ||
      typeof record.must_change_password !== 'boolean'
    ) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    if (typeof record.expires_at === 'string') {
      const expiresMs = Date.parse(record.expires_at);
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }
    }
    return {
      role: record.role,
      code: record.code,
      login_code: record.login_code,
      username: record.username,
      name: record.name,
      must_change_password:
        record.role === 'UNIT' ? false : record.must_change_password,
      ...(typeof record.token === 'string' ? { token: record.token } : {}),
      ...(typeof record.sector_name === 'string'
        ? { sector_name: record.sector_name }
        : {}),
      ...(typeof record.entity_id === 'number'
        ? { entity_id: record.entity_id }
        : {}),
      ...(typeof record.expires_at === 'string'
        ? { expires_at: record.expires_at }
        : {}),
      ...(Array.isArray(record.seen_doc_pages)
        ? { seen_doc_pages: normalizeDocPageKeys(record.seen_doc_pages) }
        : {}),
      ...(typeof record.help_kb_version === 'number'
        ? { help_kb_version: record.help_kb_version }
        : {}),
    };
  } catch {
    return null;
  }
}

interface AuthLoginResponse {
  valid?: boolean;
  expired?: boolean;
  error?: string;
  role?: unknown;
  code?: unknown;
  token?: unknown;
  login_code?: unknown;
  username?: unknown;
  name?: unknown;
  sector_name?: unknown;
  entity_id?: unknown;
  must_change_password?: unknown;
  seen_doc_pages?: unknown;
  help_kb_version?: unknown;
  admin_whatsapp_phone?: unknown;
  expires_at?: unknown;
}

interface CompleteFirstLoginResponse {
  success?: boolean;
  username?: unknown;
  must_change_password?: unknown;
  code?: unknown;
  token?: unknown;
  expires_at?: unknown;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() =>
    readStoredSession()
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [authNotice, setAuthNotice] = useState<string | null>(() =>
    readNotice()
  );
  const sessionRef = useRef<AuthSession | null>(session);
  sessionRef.current = session;

  const clearAuthNotice = useCallback(() => {
    setAuthNotice(null);
  }, []);

  // 14-day sliding JWT boot refresh (0ms short-circuit + 0 Supabase RPCs when guest)
  useEffect(() => {
    const initial = readStoredSession();
    if (!initial) {
      const cancelIdle = scheduleIdleTask(() => {
        try {
          if (window.sessionStorage.getItem(KB_CHECKED_SESSION_KEY) === '1') {
            return;
          }
          window.sessionStorage.setItem(KB_CHECKED_SESSION_KEY, '1');
        } catch {
          // Ignore sessionStorage errors
        }
        void import('../utils/helpKbDb')
          .then((mod) => mod.syncHelpKbIfNeeded())
          .catch(() => undefined);
      }, 2000);
      return cancelIdle;
    }
    const token = initial.token || initial.code;
    if (!token) return;

    let active = true;
    const refreshSession = async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.rpc('auth_refresh_session', {
          p_token: token,
        });
        if (!active || error) {
          // Keep existing local session on transient network/RPC failure
          return;
        }

        const res = (data ?? null) as AuthLoginResponse | null;
        if (!res) return;

        if (res.valid !== true) {
          try {
            window.localStorage.removeItem(AUTH_STORAGE_KEY);
          } catch {
            // Ignore storage errors
          }
          const expiredMsg = 'Your session expired. Please sign in again.';
          saveNotice(expiredMsg);
          setAuthNotice(expiredMsg);
          setSession(null);
          return;
        }

        if (
          isValidRole(res.role) &&
          typeof res.code === 'string' &&
          typeof res.login_code === 'string' &&
          typeof res.username === 'string' &&
          typeof res.name === 'string'
        ) {
          const serverSeen = normalizeDocPageKeys(res.seen_doc_pages);
          const refreshedBase: AuthSession = {
            role: res.role,
            code: res.code,
            login_code: res.login_code,
            username: res.username,
            name: res.name,
            must_change_password:
              res.role === 'UNIT' ? false : res.must_change_password === true,
            ...(typeof res.token === 'string' ? { token: res.token } : {}),
            ...(typeof res.sector_name === 'string'
              ? { sector_name: res.sector_name }
              : {}),
            ...(typeof res.entity_id === 'number'
              ? { entity_id: res.entity_id }
              : {}),
            ...(typeof res.expires_at === 'string'
              ? { expires_at: res.expires_at }
              : {}),
            ...(typeof res.help_kb_version === 'number'
              ? { help_kb_version: res.help_kb_version }
              : {}),
          };
          const adminPhone =
            typeof res.admin_whatsapp_phone === 'string'
              ? res.admin_whatsapp_phone
              : null;
          const serverKbVersion =
            typeof res.help_kb_version === 'number'
              ? res.help_kb_version
              : undefined;
          void import('../utils/helpKbDb')
            .then((mod) => {
              if (adminPhone) {
                mod.saveCachedAdminWhatsAppPhone(adminPhone);
              }
              return mod.syncHelpKbIfNeeded(serverKbVersion);
            })
            .catch(() => undefined);
          setSession((prev) => {
            if (!prev) return null;
            const sameAccount =
              prev.role === refreshedBase.role &&
              prev.login_code === refreshedBase.login_code;
            const mergedSeen = sameAccount
              ? mergeSeenDocPageLists(prev.seen_doc_pages, serverSeen)
              : serverSeen;
            const refreshed: AuthSession = {
              ...refreshedBase,
              seen_doc_pages: mergedSeen,
            };
            saveSession(refreshed);
            return refreshed;
          });
        }
      } catch {
        // Keep existing local session on transient offline/timeout error
      }
    };

    void refreshSession();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      const trimmedUser = username.trim();
      const trimmedPass = password.trim();
      if (!trimmedUser || !trimmedPass) {
        return { ok: false, error: 'User ID and password are required.' };
      }

      setLoading(true);
      setAuthNotice(null);
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.rpc('auth_login', {
          p_username: trimmedUser,
          p_password: trimmedPass,
        });

        if (error) {
          return {
            ok: false,
            error: error.message || 'Unable to sign in. Please try again.',
          };
        }

        const result = (data ?? null) as AuthLoginResponse | null;
        if (
          !result ||
          result.valid !== true ||
          !isValidRole(result.role) ||
          typeof result.code !== 'string' ||
          typeof result.login_code !== 'string' ||
          typeof result.username !== 'string' ||
          typeof result.name !== 'string'
        ) {
          return {
            ok: false,
            error:
              typeof result?.error === 'string' && result.error
                ? result.error
                : 'Invalid credentials. Please try again.',
          };
        }

        const mustChange =
          result.role === 'UNIT' ? false : result.must_change_password === true;
        const nextSession: AuthSession = {
          role: result.role,
          code: result.code,
          login_code: result.login_code,
          username: result.username,
          name: result.name,
          must_change_password: mustChange,
          seen_doc_pages: normalizeDocPageKeys(result.seen_doc_pages),
          ...(typeof result.token === 'string' ? { token: result.token } : {}),
          ...(typeof result.sector_name === 'string'
            ? { sector_name: result.sector_name }
            : {}),
          ...(typeof result.entity_id === 'number'
            ? { entity_id: result.entity_id }
            : {}),
          ...(typeof result.expires_at === 'string'
            ? { expires_at: result.expires_at }
            : {}),
          ...(typeof result.help_kb_version === 'number'
            ? { help_kb_version: result.help_kb_version }
            : {}),
        };

        // Guard: logging in marks 'login' docs seen in localStorage even if card wasn't dismissed manually
        writeLocalSeenDocPage('guest', 'login');
        saveSession(nextSession);
        setSession(nextSession);
        const adminPhone =
          typeof result.admin_whatsapp_phone === 'string'
            ? result.admin_whatsapp_phone
            : null;
        const serverKbVersion =
          typeof result.help_kb_version === 'number'
            ? result.help_kb_version
            : undefined;
        void import('../utils/helpKbDb')
          .then((mod) => {
            if (adminPhone) {
              mod.saveCachedAdminWhatsAppPhone(adminPhone);
            }
            return mod.syncHelpKbIfNeeded(serverKbVersion);
          })
          .catch(() => undefined);
        return {
          ok: true,
          role: nextSession.role,
          must_change_password: mustChange,
        };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Unable to sign in. Please try again.',
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const completeFirstLogin = useCallback(
    async (
      newPassword: string,
      newUsername?: string
    ): Promise<FirstLoginResult> => {
      if (!session) {
        return { ok: false, error: 'Session expired. Please sign in again.' };
      }

      if (session.role === 'UNIT') {
        return {
          ok: false,
          error:
            'Unit portal password cannot be changed manually; use your Unit Order Code.',
        };
      }

      const token = session.token ?? session.code;
      const trimmedNewUsername = newUsername?.trim() ?? '';

      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.rpc(
          'auth_complete_first_login',
          {
            p_token: token,
            p_new_password: newPassword.trim(),
            p_new_username: trimmedNewUsername || null,
          }
        );

        if (error) {
          return {
            ok: false,
            error: error.message || 'Unable to update password.',
          };
        }

        const res = (data ?? null) as CompleteFirstLoginResponse | null;
        if (!res || res.success !== true) {
          return { ok: false, error: 'Unable to update password.' };
        }

        const freshToken =
          typeof res.token === 'string' && res.token
            ? res.token
            : typeof res.code === 'string' && res.code
              ? res.code
              : session.token;

        const updatedSession: AuthSession = {
          ...session,
          code:
            typeof res.code === 'string' && res.code ? res.code : session.code,
          username:
            typeof res.username === 'string' && res.username
              ? res.username
              : session.username,
          must_change_password: false,
          ...(freshToken ? { token: freshToken } : {}),
          ...(typeof res.expires_at === 'string'
            ? { expires_at: res.expires_at }
            : {}),
        };

        saveSession(updatedSession);
        setSession(updatedSession);
        return { ok: true, role: updatedSession.role };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Unable to update password.',
        };
      }
    },
    [session]
  );

  const pushIdentityKey =
    session && !session.must_change_password
      ? `${session.role}:${session.entity_id ?? 0}:${session.login_code}`
      : null;

  useEffect(() => {
    if (!pushIdentityKey) return;
    const activeSession = sessionRef.current;
    const token = activeSession?.token || activeSession?.code;
    if (!token) return;
    const isAdmin = activeSession?.role === 'ADMIN';

    void import('../utils/pushNotifications')
      .then((mod) => {
        void mod.syncExistingPushSubscription(token);
        if (isAdmin) {
          void mod.maybeAutoNotifyAdminAppUpdate(token);
        }
      })
      .catch(() => undefined);
  }, [pushIdentityKey]);

  const logout = useCallback(
    (notice?: string): void => {
      void import('../utils/pushNotifications')
        .then((mod) => mod.unsubscribeFromPush())
        .catch(() => undefined);
      const token = session?.token || session?.code;
      if (token) {
        void getSupabase()
          .then((sb) => sb.rpc('auth_logout', { p_token: token }))
          .catch(() => undefined);
      }
      try {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        // Ignore storage access errors
      }
      if (notice) {
        saveNotice(notice);
        setAuthNotice(notice);
      }
      setSession(null);
    },
    [session?.token, session?.code]
  );

  const handleSessionExpired = useCallback(
    (message = 'Your session expired. Please sign in again.') => {
      try {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        // Ignore storage access errors
      }
      saveNotice(message);
      setAuthNotice(message);
      setSession(null);
    },
    []
  );

  const markDocPageSeen = useCallback(async (pageKey: string): Promise<void> => {
    const key = pageKey.trim().toLowerCase();
    if (!key) return;

    const currentSession = sessionRef.current;
    const scope = getDocsAccountScope(currentSession);
    writeLocalSeenDocPage(scope, key);
    if (key === 'login' || key === 'public_leaderboard') {
      writeLocalSeenDocPage('guest', key);
    }

    if (!currentSession) return;

    const alreadyInSession = Boolean(
      currentSession.seen_doc_pages?.includes(key)
    );

    if (!alreadyInSession) {
      setSession((prev) => {
        if (!prev) return prev;
        const nextSeen = mergeSeenDocPageLists(prev.seen_doc_pages, [key]);
        if (
          prev.seen_doc_pages &&
          prev.seen_doc_pages.length === nextSeen.length
        ) {
          return prev;
        }
        const updated: AuthSession = { ...prev, seen_doc_pages: nextSeen };
        saveSession(updated);
        return updated;
      });
    }

    const authCode = currentSession.token || currentSession.code;
    if (!authCode || alreadyInSession) return;

    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc('auth_mark_doc_page_seen', {
        p_code: authCode,
        p_page_key: key,
      });
      if (error || !data || typeof data !== 'object') return;
      const record = data as { seen_doc_pages?: unknown };
      const serverSeen = normalizeDocPageKeys(record.seen_doc_pages);
      if (serverSeen.length === 0) return;

      setSession((prev) => {
        if (
          !prev ||
          prev.role !== currentSession.role ||
          prev.login_code !== currentSession.login_code
        ) {
          return prev;
        }
        const merged = mergeSeenDocPageLists(prev.seen_doc_pages, serverSeen);
        const updated: AuthSession = { ...prev, seen_doc_pages: merged };
        saveSession(updated);
        return updated;
      });
    } catch {
      // Non-blocking background sync; localStorage already holds seen state
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      authNotice,
      clearAuthNotice,
      login,
      completeFirstLogin,
      logout,
      handleSessionExpired,
      markDocPageSeen,
    }),
    [
      session,
      loading,
      authNotice,
      clearAuthNotice,
      login,
      completeFirstLogin,
      logout,
      handleSessionExpired,
      markDocPageSeen,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
