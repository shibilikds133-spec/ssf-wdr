import type { AuthSession } from '../types';

export type DocPageKey =
  | 'login'
  | 'setup_password'
  | 'admin_dashboard'
  | 'admin_units'
  | 'admin_entries'
  | 'admin_reports'
  | 'admin_settings'
  | 'sector_dashboard'
  | 'sector_units'
  | 'sector_orders'
  | 'sector_reports'
  | 'sector_manage'
  | 'unit_dashboard'
  | 'unit_orders'
  | 'unit_reports'
  | 'public_leaderboard'
  | 'public_order_portal';

export type DocsPortalTheme = 'plum' | 'forest' | 'orange' | 'public';

export interface DocsThemeStyle {
  cardSurface: string;
  cardBorderShadow: string;
  headingText: string;
  bodyText: string;
  iconBadge: string;
  primaryButton: string;
  rowSurface: string;
  rowIconBadge: string;
  portalBadge: string;
  tipStrip: string;
  closeButton: string;
  backdrop: string;
  triggerButton: string;
}

export const DOC_PAGE_THEMES: Record<DocPageKey, DocsPortalTheme> = {
  login: 'plum',
  setup_password: 'plum',
  admin_dashboard: 'plum',
  admin_units: 'plum',
  admin_entries: 'plum',
  admin_reports: 'plum',
  admin_settings: 'plum',
  sector_dashboard: 'forest',
  sector_units: 'forest',
  sector_orders: 'forest',
  sector_reports: 'forest',
  sector_manage: 'forest',
  unit_dashboard: 'orange',
  unit_orders: 'orange',
  unit_reports: 'orange',
  public_leaderboard: 'public',
  public_order_portal: 'public',
};

export const DOCS_THEME_STYLES: Record<DocsPortalTheme, DocsThemeStyle> = {
  plum: {
    cardSurface: 'bg-[#FDFBF8]/[0.94] backdrop-blur-md',
    cardBorderShadow: 'border border-[#381932]/[0.18] shadow-lg',
    headingText: 'text-[#210B1D]',
    bodyText: 'text-[#381932]',
    iconBadge: 'bg-[#381932] text-[#FDFBF8]',
    primaryButton: 'bg-[#381932] text-[#FDFBF8] hover:bg-[#210B1D] shadow-sm',
    rowSurface: 'bg-white/75 border border-[#381932]/[0.10]',
    rowIconBadge: 'bg-[#381932]/[0.08] text-[#381932]',
    portalBadge:
      'bg-[#381932]/[0.08] text-[#210B1D] border border-[#381932]/[0.15]',
    tipStrip:
      'bg-[#381932]/[0.06] border border-[#381932]/[0.14] text-[#381932]',
    closeButton:
      'text-[#381932]/80 hover:text-[#210B1D] hover:bg-[#381932]/[0.08]',
    backdrop: 'bg-[#210B1D]/40 backdrop-blur-sm',
    triggerButton:
      'bg-[#FDFBF8]/95 border border-[#381932]/[0.18] text-[#381932] hover:bg-white shadow-xs',
  },
  forest: {
    cardSurface: 'bg-[#F9FCF6]/[0.94] backdrop-blur-md',
    cardBorderShadow: 'border border-[#043326]/[0.18] shadow-lg',
    headingText: 'text-[#021C14]',
    bodyText: 'text-[#043326]',
    iconBadge: 'bg-[#043326] text-[#F9FCF6]',
    primaryButton: 'bg-[#043326] text-[#F9FCF6] hover:bg-[#021C14] shadow-sm',
    rowSurface: 'bg-white/75 border border-[#043326]/[0.10]',
    rowIconBadge: 'bg-[#043326]/[0.08] text-[#043326]',
    portalBadge:
      'bg-[#043326]/[0.08] text-[#021C14] border border-[#043326]/[0.15]',
    tipStrip:
      'bg-[#043326]/[0.06] border border-[#043326]/[0.14] text-[#043326]',
    closeButton:
      'text-[#043326]/80 hover:text-[#021C14] hover:bg-[#043326]/[0.08]',
    backdrop: 'bg-[#021C14]/40 backdrop-blur-sm',
    triggerButton:
      'bg-[#F9FCF6]/95 border border-[#043326]/[0.18] text-[#043326] hover:bg-white shadow-xs',
  },
  orange: {
    cardSurface: 'bg-[#FDFDF1]/[0.95] backdrop-blur-md',
    cardBorderShadow: 'border border-[#EC5E27]/[0.24] shadow-lg',
    headingText: 'text-[#4A1404]',
    bodyText: 'text-[#5C1B07]',
    iconBadge: 'bg-[#EC5E27] text-[#FDFDF1]',
    primaryButton: 'bg-[#EC5E27] text-[#FDFDF1] hover:bg-[#D44B1A] shadow-sm',
    rowSurface: 'bg-white/80 border border-[#EC5E27]/[0.14]',
    rowIconBadge: 'bg-[#EC5E27]/[0.12] text-[#4A1404]',
    portalBadge:
      'bg-[#EC5E27]/[0.12] text-[#4A1404] border border-[#EC5E27]/[0.20]',
    tipStrip:
      'bg-[#EC5E27]/[0.08] border border-[#EC5E27]/[0.18] text-[#5C1B07]',
    closeButton:
      'text-[#5C1B07]/80 hover:text-[#4A1404] hover:bg-[#EC5E27]/[0.10]',
    backdrop: 'bg-[#4A1404]/35 backdrop-blur-sm',
    triggerButton:
      'bg-[#FDFDF1]/95 border border-[#EC5E27]/[0.24] text-[#5C1B07] hover:bg-white shadow-xs',
  },
  public: {
    cardSurface: 'bg-[#FFF8F6]/[0.95] backdrop-blur-md',
    cardBorderShadow: 'border border-[#5C0A0E]/[0.18] shadow-lg',
    headingText: 'text-[#2B0406]',
    bodyText: 'text-[#4A070A]',
    iconBadge: 'bg-gradient-to-br from-[#8F0D14] to-[#5C0A0E] text-white',
    primaryButton:
      'bg-gradient-to-r from-[#8F0D14] to-[#5C0A0E] text-white hover:opacity-95 shadow-sm',
    rowSurface: 'bg-white/85 border border-[#5C0A0E]/[0.12]',
    rowIconBadge: 'bg-[#5C0A0E]/[0.08] text-[#5C0A0E]',
    portalBadge:
      'bg-[#5C0A0E]/[0.08] text-[#2B0406] border border-[#5C0A0E]/[0.16]',
    tipStrip:
      'bg-[#5C0A0E]/[0.06] border border-[#5C0A0E]/[0.15] text-[#4A070A]',
    closeButton:
      'text-[#4A070A]/80 hover:text-[#2B0406] hover:bg-[#5C0A0E]/[0.08]',
    backdrop: 'bg-[#2B0406]/40 backdrop-blur-sm',
    triggerButton:
      'bg-[#FFF8F6]/95 border border-[#5C0A0E]/[0.18] text-[#5C0A0E] hover:bg-white shadow-xs',
  },
};

export const DOCS_SEEN_STORAGE_PREFIX = 'wdr_docs_seen_v1';

export function getDocsAccountScope(session: AuthSession | null): string {
  if (!session) return 'guest';
  if (session.role === 'ADMIN') return `ADMIN:${session.login_code}`;
  return `${session.role}:${session.entity_id ?? 0}:${session.login_code}`;
}

export function normalizeDocPageKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string') {
      const normalized = item.trim().toLowerCase();
      if (normalized) {
        seen.add(normalized);
      }
    }
  }
  return Array.from(seen);
}

export function mergeSeenDocPageLists(
  ...lists: Array<readonly string[] | undefined | null>
): string[] {
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      const normalized = item.trim().toLowerCase();
      if (normalized) {
        seen.add(normalized);
      }
    }
  }
  return Array.from(seen);
}

function getStorageKeyForScope(scope: string): string {
  return `${DOCS_SEEN_STORAGE_PREFIX}:${scope}`;
}

export function readLocalSeenDocPages(scope: string): string[] {
  try {
    const raw = window.localStorage.getItem(getStorageKeyForScope(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return normalizeDocPageKeys(parsed);
  } catch {
    return [];
  }
}

export function writeLocalSeenDocPage(scope: string, pageKey: string): string[] {
  const normalized = pageKey.trim().toLowerCase();
  const current = readLocalSeenDocPages(scope);
  if (!normalized) return current;
  if (current.includes(normalized)) return current;
  const next = [...current, normalized];
  try {
    window.localStorage.setItem(
      getStorageKeyForScope(scope),
      JSON.stringify(next)
    );
  } catch {
    // Ignore storage errors in private browsing
  }
  return next;
}
