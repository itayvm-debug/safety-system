/**
 * Rate limiting — in-memory, per Vercel instance
 *
 * מגבלות: Vercel Serverless — כל invocation עלולה לרוץ ב-instance נפרד.
 * ה-counter הוא per-instance, לא global. זה מספיק ל-MVP:
 *   - מגביל burst מאותו client לאותו instance
 *   - לא מגביל DDoS מבוזר
 *
 * לשלב עתידי עם Upstash/Redis: להחליף את store בקריאות ל-Redis.
 * ה-interface `RateLimitResult` נשאר זהה.
 */

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

// ניקוי entries ישנות — מניעת memory leak ב-long-running instances
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
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * בודק rate limit עבור מפתח נתון
 * @param key — מזהה ייחודי (IP + endpoint)
 * @param maxRequests — מקסימום בקשות בחלון
 * @param windowMs — גודל חלון זמן במילישניות
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const win = store.get(key);

  if (!win || win.resetAt <= now) {
    // חלון חדש
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (win.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: win.resetAt };
  }

  win.count++;
  return { allowed: true, remaining: maxRequests - win.count, resetAt: win.resetAt };
}

/** מחלץ IP מ-request headers של Vercel */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

// ── פרופילי rate limit מוגדרים מראש ──────────────────────────────

/**
 * מגבלת login: 10 ניסיונות / 15 דקות לכל IP
 */
export function rateLimitLogin(ip: string): RateLimitResult {
  return checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
}

/**
 * מגבלת upload: 30 קבצים / 10 דקות לכל user
 */
export function rateLimitUpload(userId: string): RateLimitResult {
  return checkRateLimit(`upload:${userId}`, 30, 10 * 60 * 1000);
}

/**
 * מגבלת export (PDF/Excel): 5 יצוא / 5 דקות לכל user
 */
export function rateLimitExport(userId: string): RateLimitResult {
  return checkRateLimit(`export:${userId}`, 5, 5 * 60 * 1000);
}

/**
 * מגבלת signed URL: 200 בקשות / דקה לכל user
 */
export function rateLimitSignedUrl(userId: string): RateLimitResult {
  return checkRateLimit(`signed-url:${userId}`, 200, 60 * 1000);
}
