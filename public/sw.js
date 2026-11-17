// SafeDoc Service Worker v8
// Cached (cache-first): only same-origin static files without a query string —
//   the offline page, the manifest, images, icons and fonts.
// Navigation: network-first, fallback to /offline.html on failure. Never cached.
// Everything else is not intercepted and always goes to the network: API routes,
//   /_next/, Supabase, briefing templates, and the RSC payloads that Next.js fetches
//   for in-app navigation (for example /workers/<id>?_rsc=…).
//
// v7 cached those RSC payloads cache-first. `_rsc` is a stable hash of the router
// state, so opening a page again through an in-app link served the payload saved on
// its first visit: a worker card showed old documents and briefings although the
// database and the worker list were up to date, even across logins and company
// switches on the same device. Activating v8 deletes the v7 cache.

const CACHE_VERSION = 'safedoc-v8';
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  '/offline.html',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

const STATIC_FILE = /\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/i;

/** Only files that are the same for every user and every visit may be cached. */
function isCacheableStatic(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (url.search) return false;                          // ?_rsc=… and any other variant
  if (request.headers.get('RSC') === '1') return false;  // Next.js server component payload
  return url.pathname === OFFLINE_URL || url.pathname === '/manifest.json' || STATIC_FILE.test(url.pathname);
}

// ─── Install: pre-cache offline page + static assets ──────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// ─── Activate: purge every old safedoc-* cache ────────────────
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

// ─── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Pass through: Supabase, API routes, Next.js data, briefing templates
  const passThrough =
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/briefing-templates/') ||
    url.pathname.includes('__nextjs');

  if (passThrough) return;

  // Navigation: go to network, show offline.html if completely offline.
  // We deliberately do NOT cache navigation responses — that caused "body locked" on iOS.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        return (await caches.match(OFFLINE_URL)) ?? Response.error();
      })
    );
    return;
  }

  // Page data (RSC), and anything else that is not a known static file: network only.
  if (!isCacheableStatic(request, url)) return;

  // Static assets (icons, logo, offline page): cache-first → network → update cache
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
