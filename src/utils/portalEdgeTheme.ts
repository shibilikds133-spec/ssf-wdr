import { useLayoutEffect } from 'react';

export type PortalEdgeKey = 'public' | 'order' | 'admin' | 'sector' | 'unit' | 'login';

export interface PortalEdgeThemeConfig {
  key: PortalEdgeKey;
  themeColor: string;
  edgeTop: string;
  edgeBottom: string;
  canvasBg: string;
  manifestHref: string;
  canvasClass: string;
}

export const PORTAL_EDGE_THEMES: Record<PortalEdgeKey, PortalEdgeThemeConfig> = {
  public: {
    key: 'public',
    themeColor: '#FFF8F6',
    edgeTop: '#FFF8F6',
    edgeBottom: '#FFF8F6',
    canvasBg: '#FFF8F6',
    manifestHref: '/manifest-public.webmanifest',
    canvasClass: 'portal-canvas-public',
  },
  order: {
    key: 'order',
    themeColor: '#F8F7F0',
    edgeTop: '#F8F7F0',
    edgeBottom: '#F8F7F0',
    canvasBg: '#F8F7F0',
    manifestHref: '/manifest-public.webmanifest',
    canvasClass: 'portal-canvas-order',
  },
  admin: {
    key: 'admin',
    themeColor: '#F8F3EC',
    edgeTop: '#F8F3EC',
    edgeBottom: '#FDFBF8',
    canvasBg: '#FDFBF8',
    manifestHref: '/manifest.webmanifest',
    canvasClass: 'portal-canvas-plum',
  },
  sector: {
    key: 'sector',
    themeColor: '#F1F7EB',
    edgeTop: '#F1F7EB',
    edgeBottom: '#F9FCF6',
    canvasBg: '#F9FCF6',
    manifestHref: '/manifest.webmanifest',
    canvasClass: 'portal-canvas-sector',
  },
  unit: {
    key: 'unit',
    themeColor: '#FDFBF4',
    edgeTop: '#FDFBF4',
    edgeBottom: '#F6F2E7',
    canvasBg: '#F6F2E7',
    manifestHref: '/manifest.webmanifest',
    canvasClass: 'portal-canvas-unit',
  },
  login: {
    key: 'login',
    themeColor: '#FDFBF8',
    edgeTop: '#FDFBF8',
    edgeBottom: '#FDFBF8',
    canvasBg: '#FDFBF8',
    manifestHref: '/manifest.webmanifest',
    canvasClass: 'portal-canvas-plum',
  },
};

export function resolvePortalEdgeKey(pathname: string): PortalEdgeKey {
  if (pathname.startsWith('/order') || pathname.startsWith('/public-order')) {
    return 'order';
  }
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/sector')) return 'sector';
  if (pathname.startsWith('/dashboard')) return 'unit';
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup-password')
  ) {
    return 'login';
  }
  return 'public';
}

function getConfig(
  keyOrPathname: PortalEdgeKey | string
): PortalEdgeThemeConfig {
  if (keyOrPathname in PORTAL_EDGE_THEMES) {
    return PORTAL_EDGE_THEMES[keyOrPathname as PortalEdgeKey];
  }
  return PORTAL_EDGE_THEMES[resolvePortalEdgeKey(keyOrPathname)];
}

export function applyPortalEdgeTheme(
  keyOrPathname: PortalEdgeKey | string
): PortalEdgeThemeConfig {
  const config = getConfig(keyOrPathname);
  if (typeof document === 'undefined') return config;

  const root = document.documentElement;
  root.style.backgroundColor = config.canvasBg;
  root.style.setProperty('--portal-edge-top', config.edgeTop);
  root.style.setProperty('--portal-edge-bottom', config.edgeBottom);
  root.style.setProperty('--portal-bg', config.canvasBg);

  if (document.body) {
    document.body.style.backgroundColor = config.canvasBg;
  }

  const allThemeMetas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  let themeMeta = document.getElementById(
    'dynamic-theme-color'
  ) as HTMLMetaElement | null;

  if (!themeMeta && allThemeMetas.length > 0) {
    themeMeta = allThemeMetas[0];
    themeMeta.id = 'dynamic-theme-color';
  }

  // Remove any duplicate conflicting theme-color tags so Android/iOS stay in sync
  for (const meta of allThemeMetas) {
    if (meta !== themeMeta) {
      meta.remove();
    }
  }

  if (!themeMeta) {
    themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    themeMeta.id = 'dynamic-theme-color';
    document.head.appendChild(themeMeta);
  }

  if (themeMeta.getAttribute('content') !== config.themeColor) {
    themeMeta.setAttribute('content', config.themeColor);
  }

  const manifestLink = document.querySelector<HTMLLinkElement>(
    'link[rel="manifest"]'
  );
  if (
    manifestLink &&
    manifestLink.getAttribute('href') !== config.manifestHref
  ) {
    manifestLink.setAttribute('href', config.manifestHref);
  }

  return config;
}

export function usePortalEdgeTheme(
  keyOrPathname: PortalEdgeKey | string
): PortalEdgeThemeConfig {
  const config = getConfig(keyOrPathname);

  useLayoutEffect(() => {
    applyPortalEdgeTheme(config.key);
  }, [config.key]);

  return config;
}
