// SafeDoc Service Worker emergency-v6
// Emergency minimal build — no navigation caching, no offline routing.
// Caches only static icons/logo for "add to home screen" appearance.
// All page/API requests pass straight through to the network.

const CACHE_VERSION = 'safedoc-emergency-v6';

const PRECACHE = [
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// ─── Install: cache only safe static assets ───────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// ─── Activate: wipe every old safedoc-* cache ─────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('safedoc-') && k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Message ──────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ─── Fetch: icons only — everything else passes through ───────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only serve icons from cache; all other requests go straight to network
  const isIcon =
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/logo.png';

  if (!isIcon) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
