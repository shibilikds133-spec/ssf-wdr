import { useEffect } from 'react';

export function usePortalThemeColor(
  themeColor: string,
  manifestHref?: string
): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    const prevColor = meta?.getAttribute('content') ?? '#381932';
    if (meta) {
      meta.setAttribute('content', themeColor);
    }

    const manifestLink = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]'
    );
    const prevManifest = manifestLink?.getAttribute('href') ?? '/manifest.webmanifest';
    if (manifestLink && manifestHref) {
      manifestLink.setAttribute('href', manifestHref);
    }

    return () => {
      if (meta) {
        meta.setAttribute('content', prevColor);
      }
      if (manifestLink && manifestHref) {
        manifestLink.setAttribute('href', prevManifest);
      }
    };
  }, [themeColor, manifestHref]);
}
