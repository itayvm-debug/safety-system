import { timingSafeEqual } from 'crypto';

/**
 * Vercel Cron authorization (P1·4).
 *
 * Accepts only `Authorization: Bearer <CRON_SECRET>`. When CRON_SECRET is not
 * configured every request is refused — previously `Bearer undefined` matched.
 * The comparison runs in constant time.
 */
export function isAuthorizedCronRequest(authHeader: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authHeader);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
