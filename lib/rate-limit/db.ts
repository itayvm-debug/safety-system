/**
 * Durable rate limiting backed by Supabase/Postgres.
 *
 * Uses the rate_limit_check() SQL function (see migrations/durable-rate-limiting.sql),
 * which implements a sliding-window counter with pg_advisory_xact_lock for atomicity.
 * Safe across multiple Vercel serverless instances — state is persisted in Postgres.
 *
 * Key design choices:
 *   - IP addresses are SHA-256 hashed before passing as the `key` parameter so
 *     raw IPs are never stored in the opaque key column. The raw IP is still
 *     passed separately to the `ip` column (INET) for operational monitoring.
 *     See the migration for the privacy/GDPR notes on the ip column.
 *   - User-based limits (export, upload, signed-url) pass user_id as both the
 *     key and the user_id column — no hashing needed since user_id is a UUID.
 *   - Fail-open on DB errors: if the DB is unreachable the request is allowed.
 *     Adjust the fallback in checkRateLimitDb() to fail-closed if your threat
 *     model requires it.
 */

import { createHash }         from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import type { RateLimitResult } from './index';

/** SHA-256 hex digest of a string. Used to avoid storing raw IPs as keys. */
function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Returns the IP string if it looks like a valid address, otherwise null.
 * Prevents passing 'unknown' (the getClientIp fallback) to the INET column.
 */
function safeInet(ip: string | undefined): string | null {
  // Accept IPv4 (digits and dots) and IPv6 (hex digits and colons).
  // This is intentionally permissive — Postgres will reject malformed INETs.
  if (!ip || ip === 'unknown') return null;
  return ip;
}

/**
 * Core durable rate-limit check.
 *
 * @param key           Opaque identifier for the rate-limited entity.
 *                      For IP limits: pass hashKey(ip). For user limits: pass userId.
 * @param action        Action name ('login', 'export', 'upload', 'signed-url').
 * @param maxRequests   Maximum requests allowed within the window.
 * @param windowSeconds Sliding window size in seconds.
 * @param ipRaw         Raw client IP string, stored for monitoring. Nullable.
 * @param userId        Authenticated user UUID. Nullable.
 */
export async function checkRateLimitDb(
  key:           string,
  action:        string,
  maxRequests:   number,
  windowSeconds: number,
  ipRaw?:        string,
  userId?:       string
): Promise<RateLimitResult> {
  const db = createServiceClient();
  const ip = safeInet(ipRaw);

  const { data, error } = await db.rpc('rate_limit_check', {
    p_key:            key,
    p_action:         action,
    p_window_seconds: windowSeconds,
    p_max_requests:   maxRequests,
    p_ip:             ip,
    p_user_id:        userId ?? null,
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    // Fail-open: allow the request if the DB function is unreachable.
    // This happens before the durable-rate-limiting migration has been applied,
    // or during a transient DB outage. Change to fail-closed here if required.
    return {
      allowed:   true,
      remaining: maxRequests - 1,
      resetAt:   Date.now() + windowSeconds * 1_000,
    };
  }

  const row = data[0] as { allowed: boolean; remaining: number; reset_at: string };
  return {
    allowed:   row.allowed,
    remaining: Math.max(0, row.remaining),
    // reset_at from Postgres is a TIMESTAMPTZ — Supabase client returns ISO string.
    resetAt:   new Date(row.reset_at).getTime(),
  };
}

/**
 * Login rate limit: 10 attempts / 15 minutes per IP.
 *
 * IP is hashed for the key so the `key` column contains no raw PII.
 * The raw IP is still stored in the `ip` INET column for incident response.
 */
export async function rateLimitLoginDb(ip: string): Promise<RateLimitResult> {
  return checkRateLimitDb(
    hashKey(ip),   // hashed key — no raw IP in the opaque key column
    'login',
    10,
    15 * 60,
    ip,            // raw IP → stored in the ip INET column (GDPR: PII)
    undefined
  );
}

/**
 * Export rate limit: 5 ZIP exports / 5 minutes per authenticated user.
 */
export async function rateLimitExportDb(userId: string): Promise<RateLimitResult> {
  return checkRateLimitDb(userId, 'export', 5, 5 * 60, undefined, userId);
}

/**
 * Upload rate limit: 30 file uploads / 10 minutes per authenticated user.
 */
export async function rateLimitUploadDb(userId: string): Promise<RateLimitResult> {
  return checkRateLimitDb(userId, 'upload', 30, 10 * 60, undefined, userId);
}

/**
 * Signed-URL rate limit: 200 requests / 1 minute per authenticated user.
 * High limit to accommodate gallery views that fetch many signed URLs at once.
 */
export async function rateLimitSignedUrlDb(userId: string): Promise<RateLimitResult> {
  return checkRateLimitDb(userId, 'signed-url', 200, 60, undefined, userId);
}
