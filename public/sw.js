const CACHE_PREFIX = 'ssf-payasam-';
const CACHE_NAME = 'ssf-payasam-__BUILD_VERSION__';

const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isBypassedRequest(request, url) {
  if (request.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (url.hostname.endsWith('.supabase.co')) return true;

  const path = url.pathname;
  if (
    path === '/sw.js' ||
    path.startsWith('/rest/') ||
    path.startsWith('/auth/') ||
    path.startsWith('/rpc/') ||
    path.startsWith('/api/') ||
    path.startsWith('/functions/') ||
    path.startsWith('/storage/') ||
    path.startsWith('/realtime/')
  ) {
    return true;
  }
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isBypassedRequest(request, url)) {
    return;
  }

  // Network-first for HTML navigations so fresh deployments appear immediately
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil(
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put('/index.html', copy))
            );
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cached =
            (await cache.match('/index.html')) ||
            (await caches.match('/index.html'));
          return cached || Response.error();
        })
    );
    return;
  }

  // Cache-first for Vite immutable hashed bundles
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          event.waitUntil(cache.put(request, response.clone()));
        }
        return response;
      })
    );
    return;
  }

  // Network-first with cache fallback for manifest, icons, favicon
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.svg'
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response && response.ok && response.type === 'basic') {
            event.waitUntil(cache.put(request, response.clone()));
          }
          return response;
        } catch {
          const cached = await cache.match(request);
          return cached || Response.error();
        }
      })
    );
  }
});
