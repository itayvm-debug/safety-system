/**
 * Browser side of /api/photo-urls: every photo a page asks for within one tick goes out in a
 * single request (per variant), and a signed link is reused for 50 minutes (it is valid for 60),
 * so moving between the list and a card does not ask again and the browser can cache the image.
 *
 * Before 2026-11-19 each card fetched /api/signed-url on its own; one list load in the field
 * was ~170 requests a minute (limit 200, shared with opening documents) and the app stalled.
 *
 * Variants (2026-11-20): 'thumb' = the 192px copy for lists and avatars (~10KB instead of
 * ~160KB; falls back to the original on the server when there is none), 'full' = the original
 * for the detail page and the lightbox.
 */

export type PhotoVariant = 'full' | 'thumb';

const TTL_MS = 50 * 60 * 1000;
const BATCH = 100; // = MAX_PHOTO_BATCH on the server

type Entry = { url: string | null; expires: number };
type Waiting = { path: string; resolve: (url: string | null) => void };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null>>();
const queues: Record<PhotoVariant, Waiting[]> = { full: [], thumb: [] };
const scheduled: Record<PhotoVariant, boolean> = { full: false, thumb: false };
let generation = 0; // bumped on clear: an answer for the previous user/company is not cached

const keyOf = (variant: PhotoVariant, path: string) => `${variant}\u0000${path}`;

export type PhotoFetch = (input: string, init: RequestInit) => Promise<Response>;
let doFetch: PhotoFetch = (input, init) => fetch(input, init);

/** Tests only. */
export function __setPhotoFetch(f: PhotoFetch): void { doFetch = f; }

/** Called with the offline snapshots: on login, logout and company switch. */
export function clearPhotoUrlCache(): void {
  generation++;
  cache.clear();
  inflight.clear();
}

async function flush(variant: PhotoVariant): Promise<void> {
  scheduled[variant] = false;
  const items = queues[variant];
  queues[variant] = [];
  const gen = generation;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    let urls: Record<string, string> = {};
    let ok = false;
    try {
      const res = await doFetch('/api/photo-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(variant === 'full'
          ? { paths: chunk.map((c) => c.path) }
          : { paths: chunk.map((c) => c.path), variant }),
      });
      if (res.ok) {
        urls = ((await res.json()) as { urls?: Record<string, string> }).urls ?? {};
        ok = true;
      }
    } catch {
      // offline or network error: no photo, try again next time
    }
    const now = Date.now();
    for (const { path, resolve } of chunk) {
      const url = urls[path] ?? null;
      const key = keyOf(variant, path);
      // Remember a refusal too (not someone else's photo to retry every render) — but only
      // when the server answered; a failed request is retried on the next render.
      if (ok && gen === generation) cache.set(key, { url, expires: now + TTL_MS });
      if (gen === generation) inflight.delete(key);
      resolve(url);
    }
  }
}

/** Signed link for a record photo, or null (no photo, not allowed, offline). */
export function getPhotoUrl(path: string | null | undefined, variant: PhotoVariant = 'full'): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  if (variant !== 'thumb') variant = 'full'; // e.g. .map(getPhotoUrl) passes the index here
  const key = keyOf(variant, path);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url);
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = new Promise<string | null>((resolve) => {
    queues[variant].push({ path, resolve });
    if (!scheduled[variant]) {
      scheduled[variant] = true;
      setTimeout(() => { void flush(variant); }, 0);
    }
  });
  inflight.set(key, promise);
  return promise;
}
