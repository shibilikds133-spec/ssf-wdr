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
import { useAuth } from './AuthContext';
import {
  DOC_PAGE_THEMES,
  getDocsAccountScope,
  readLocalSeenDocPages,
  type DocPageKey,
  type DocsPortalTheme,
} from '../utils/docsConfig';

export type DocsPresentationMode = 'modal' | 'inline-top';

interface PageRegistration {
  pageKey: DocPageKey;
  theme: DocsPortalTheme;
  mode: DocsPresentationMode;
  suspendAutoOpen: boolean;
}

interface DocsState {
  registration: PageRegistration | null;
  openKey: DocPageKey | null;
}

interface DocsContextValue {
  activePageKey: DocPageKey | null;
  openPageKey: DocPageKey | null;
  activeTheme: DocsPortalTheme;
  presentationMode: DocsPresentationMode;
  isOpen: boolean;
  openDocs: (overrideKey?: DocPageKey) => void;
  closeDocs: () => void;
  toggleDocs: (overrideKey?: DocPageKey) => void;
  hasSeenDocPage: (pageKey: DocPageKey) => boolean;
  registerPage: (reg: PageRegistration) => void;
  unregisterPage: (pageKey: DocPageKey) => void;
}

const DocsContext = createContext<DocsContextValue | undefined>(undefined);

export function DocsProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading, markDocPageSeen } = useAuth();
  const [state, setState] = useState<DocsState>({
    registration: null,
    openKey: null,
  });
  const [seenVersion, setSeenVersion] = useState<number>(0);

  const stateRef = useRef<DocsState>(state);
  stateRef.current = state;

  const activePageKey = state.registration?.pageKey ?? null;
  const openPageKey = state.openKey;
  const isOpen = openPageKey !== null;
  const suspendAutoOpen = state.registration?.suspendAutoOpen ?? false;

  const targetKeyForTheme = openPageKey ?? activePageKey;
  const activeTheme: DocsPortalTheme =
    state.registration &&
    (!openPageKey || openPageKey === state.registration.pageKey)
      ? state.registration.theme
      : targetKeyForTheme
      ? DOC_PAGE_THEMES[targetKeyForTheme]
      : 'plum';

  const presentationMode: DocsPresentationMode =
    state.registration &&
    openPageKey === state.registration.pageKey &&
    state.registration.mode === 'inline-top'
      ? 'inline-top'
      : 'modal';

  const mergedSeenSet = useMemo(() => {
    const scope = getDocsAccountScope(session);
    const localAccountSeen = readLocalSeenDocPages(scope);
    const guestSeen =
      activePageKey === 'login' || activePageKey === 'public_leaderboard'
        ? readLocalSeenDocPages('guest')
        : [];
    return new Set<string>([
      ...localAccountSeen,
      ...guestSeen,
      ...(session?.seen_doc_pages ?? []),
    ]);
    // seenVersion forces re-read right after localStorage updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activePageKey, seenVersion]);

  const hasSeenDocPage = useCallback(
    (pageKey: DocPageKey): boolean => {
      const key = pageKey.trim().toLowerCase();
      if (mergedSeenSet.has(key)) return true;
      if (key === 'login' || key === 'public_leaderboard') {
        return readLocalSeenDocPages('guest').includes(key);
      }
      return false;
    },
    [mergedSeenSet]
  );

  const registerPage = useCallback((next: PageRegistration) => {
    setState((prev) => {
      const keyChanged = prev.registration?.pageKey !== next.pageKey;
      const unchanged =
        !keyChanged &&
        prev.registration?.theme === next.theme &&
        prev.registration?.mode === next.mode &&
        prev.registration?.suspendAutoOpen === next.suspendAutoOpen;
      if (unchanged) return prev;
      return {
        registration: next,
        openKey: keyChanged ? null : prev.openKey,
      };
    });
  }, []);

  const unregisterPage = useCallback((pageKey: DocPageKey) => {
    setState((prev) => {
      if (prev.registration?.pageKey !== pageKey) return prev;
      return {
        registration: null,
        openKey: prev.openKey === pageKey ? null : prev.openKey,
      };
    });
  }, []);

  const openDocs = useCallback((overrideKey?: DocPageKey) => {
    setState((prev) => {
      const targetKey = overrideKey ?? prev.registration?.pageKey ?? null;
      if (!targetKey) return prev;
      if (prev.openKey === targetKey) return prev;
      return {
        ...prev,
        openKey: targetKey,
      };
    });
  }, []);

  const closeDocs = useCallback(() => {
    const current = stateRef.current;
    const closingKey = current.openKey ?? current.registration?.pageKey ?? null;
    setState((prev) => (prev.openKey === null ? prev : { ...prev, openKey: null }));
    if (closingKey) {
      setSeenVersion((v) => v + 1);
      void markDocPageSeen(closingKey);
    }
  }, [markDocPageSeen]);

  const toggleDocs = useCallback(
    (overrideKey?: DocPageKey) => {
      const current = stateRef.current;
      const targetKey = overrideKey ?? current.registration?.pageKey ?? null;
      if (!targetKey) return;
      if (current.openKey === targetKey) {
        closeDocs();
      } else {
        openDocs(targetKey);
      }
    },
    [closeDocs, openDocs]
  );

  // Per-page first-time auto-open ONLY (250ms settle, never repeats once seen)
  useEffect(() => {
    if (!activePageKey || suspendAutoOpen || authLoading || isOpen) {
      return;
    }
    if (hasSeenDocPage(activePageKey)) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setState((prev) => {
        if (
          prev.registration?.pageKey !== activePageKey ||
          prev.registration?.suspendAutoOpen ||
          prev.openKey !== null
        ) {
          return prev;
        }
        return {
          ...prev,
          openKey: activePageKey,
        };
      });
    }, 250);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [activePageKey, suspendAutoOpen, authLoading, isOpen, hasSeenDocPage]);

  const value = useMemo<DocsContextValue>(
    () => ({
      activePageKey,
      openPageKey,
      activeTheme,
      presentationMode,
      isOpen,
      openDocs,
      closeDocs,
      toggleDocs,
      hasSeenDocPage,
      registerPage,
      unregisterPage,
    }),
    [
      activePageKey,
      openPageKey,
      activeTheme,
      presentationMode,
      isOpen,
      openDocs,
      closeDocs,
      toggleDocs,
      hasSeenDocPage,
      registerPage,
      unregisterPage,
    ]
  );

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) {
    throw new Error('useDocs must be used within a DocsProvider');
  }
  return ctx;
}

export interface UseRegisterPageDocsOptions {
  theme?: DocsPortalTheme;
  mode?: DocsPresentationMode;
  suspendAutoOpen?: boolean;
}

export function useRegisterPageDocs(
  pageKey: DocPageKey | null,
  optionsOrTheme: UseRegisterPageDocsOptions | DocsPortalTheme = {}
): void {
  const options: UseRegisterPageDocsOptions =
    typeof optionsOrTheme === 'string'
      ? { theme: optionsOrTheme }
      : optionsOrTheme;
  const { registerPage, unregisterPage } = useDocs();
  const theme =
    options.theme ?? (pageKey ? DOC_PAGE_THEMES[pageKey] : 'plum');
  const mode = options.mode ?? 'modal';
  const suspendAutoOpen = options.suspendAutoOpen ?? false;

  useEffect(() => {
    if (!pageKey) {
      return;
    }
    registerPage({ pageKey, theme, mode, suspendAutoOpen });
  }, [pageKey, theme, mode, suspendAutoOpen, registerPage]);

  useEffect(() => {
    if (!pageKey) {
      return;
    }
    return () => {
      unregisterPage(pageKey);
    };
  }, [pageKey, unregisterPage]);
}
