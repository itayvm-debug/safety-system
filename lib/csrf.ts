/**
 * CSRF helpers — double-submit cookie pattern
 *
 * The primary CSRF defense is SameSite=lax on the session cookie.
 * These helpers provide an additional layer for state-mutating API calls
 * that may be exposed to cross-origin requests in future.
 */

import { createHmac, randomBytes } from 'node:crypto';

const SECRET = process.env.COOKIE_SECRET ?? process.env.SESSION_SECRET ?? 'csrf-fallback-dev-only';

/** Generate a CSRF token tied to the user session id */
export function generateCsrfToken(sessionId: string): string {
  const nonce = randomBytes(16).toString('hex');
  const sig = createHmac('sha256', SECRET)
    .update(`${sessionId}:${nonce}`)
    .digest('hex');
  return `${nonce}.${sig}`;
}

/** Verify a CSRF token. Returns true if valid. */
export function verifyCsrfToken(token: string, sessionId: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const [nonce, sig] = token.split('.');
  if (!nonce || !sig) return false;
  const expected = createHmac('sha256', SECRET)
    .update(`${sessionId}:${nonce}`)
    .digest('hex');
  // Constant-time comparison
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

/** Header name the client should send the token in */
export const CSRF_HEADER = 'x-csrf-token';
