/**
 * Rate limiting — in-memory, per Vercel instance.
 *
 * Used only as a fallback / testing utility. All production rate-limited
 * routes call the durable DB implementations in lib/rate-limit/db.ts.
 *
 * Limitations:
 *   - Counter is per-instance. Vercel may route concurrent requests to
 *     different instances, so this does NOT enforce a global limit.
 *   - State is lost on instance cold-start.
 */

interface Window {
  count:   number;
  resetAt: number;
}

const store = new Map<string, Window>();

function cleanup() {
  const now = Date.now();
  for (const [key, win] of store.entries()) {
    if (win.resetAt < now) store.delete(key);
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanup, 60_000);
  }
}

export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;
  /** Unix timestamp (ms) when the current window resets. */
  resetAt:   number;
}

/**
 * In-memory sliding-window rate check.
 * @param key         Unique rate-limit key (e.g. `login:{ip}`)
 * @param maxRequests Max requests allowed in the window
 * @param windowMs    Window size in milliseconds
 */
export function checkRateLimit(
  key:         string,
  maxRequests: number,
  windowMs:    number
): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const win = store.get(key);

  if (!win || win.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (win.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: win.resetAt };
  }

  win.count++;
  return { allowed: true, remaining: maxRequests - win.count, resetAt: win.resetAt };
}

/** Extracts the client IP from Vercel request headers. */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
