// SafeDoc Service Worker v3
// Navigation + app pages: network-first (never serve stale HTML)
// Static assets (icons, logo): cache-first (safe to cache indefinitely)
// Supabase / API / Next.js chunks: always network (never intercepted)

const CACHE_VERSION = 'safedoc-v3';
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  '/offline.html',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// ─── Install: pre-cache shell assets ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    )
  );
  // Activate immediately — do not wait for old SW clients to close
  self.skipWaiting();
});

// ─── Activate: purge old caches, then claim all clients ───────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
        )
      )
      // claim() runs after old caches are gone so clients immediately
      // get the new SW without a page reload being needed on next visit
      .then(() => self.clients.claim())
  );
});

// ─── Message: allow clients to trigger skipWaiting manually ───
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ─── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only intercept GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept: Supabase, API routes, Next.js chunks, briefing templates
  const passThrough =
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/briefing-templates/') ||
    url.pathname.includes('__nextjs');

  if (passThrough) return;

  // Navigation (page loads): network-first, cache for offline reuse
  // On offline: serve cached page (last known data) → fallback to offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION)
              .then((c) => c.put(request, clone))
              .catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => cached ?? caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Static assets (icons, logo, offline page): cache-first → network → cache
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response?.ok && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
