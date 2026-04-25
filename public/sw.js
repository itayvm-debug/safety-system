// SafeDoc Service Worker v7
// Static assets (icons, logo): cache-first
// Navigation: network-first, fallback to /offline.html on failure
// Supabase / API / _next: always network (never intercepted)
// No navigation-response caching — avoids iOS "body locked" / Cache-Control bugs

const CACHE_VERSION = 'safedoc-v7';
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  '/offline.html',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

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
