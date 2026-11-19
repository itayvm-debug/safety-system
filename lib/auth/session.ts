/**
 * session.ts — ניהול session מבוסס HMAC-SHA256 + Web Crypto API
 * עובד ב-Edge runtime (middleware), Node.js (API routes) ו-browser
 * אין צורך ב-packages חיצוניים
 */

import { cookies } from 'next/headers';

export const SESSION_COOKIE_NAME = 'safedoc_session';
export const ROLE_COOKIE_NAME = 'safedoc_role';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 ימים

/** Server-side session lifetime — the same 7 days as the cookie, enforced from loginAt (P1·2) */
export const SESSION_MAX_AGE_MS = COOKIE_MAX_AGE * 1000;
/** Tolerated clock skew for a loginAt slightly in the future */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** True when the payload's loginAt is present and within the allowed lifetime. */
export function isSessionFresh(payload: Pick<SessionPayload, 'loginAt'>, now = Date.now()): boolean {
  const loginAt = payload.loginAt;
  if (typeof loginAt !== 'number' || !Number.isFinite(loginAt)) return false;
  if (loginAt > now + CLOCK_SKEW_MS) return false;
  return now - loginAt <= SESSION_MAX_AGE_MS;
}

export interface SessionPayload {
  userId: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  loginAt: number;
  /** Platform admin past the MFA deadline without a factor: only the enrolment page is reachable. */
  mfaSetupRequired?: boolean;
}

function encode(s: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(s);
  // .slice() מחזיר ArrayBuffer (לא ArrayBufferLike) — נדרש ל-Web Crypto API
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

/** HMAC key from SESSION_SECRET; `purpose` derives a separate key (e.g. the MFA pending token). */
async function getHmacKey(purpose = ''): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET לא מוגדר ב-ENV');
  return crypto.subtle.importKey(
    'raw', encode(`${secret}${purpose}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  );
}

function toB64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64Url(s: string): ArrayBuffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - padded.length % 4) % 4;
  const u8 = Uint8Array.from(atob(padded + '='.repeat(pad)), c => c.charCodeAt(0));
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

/** חותם על payload — מחזיר token */
export async function signSession(payload: SessionPayload): Promise<string> {
  const key = await getHmacKey();
  const data = toB64Url(encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', key, encode(data));
  return `${data}.${toB64Url(sig)}`;
}

/**
 * מאמת token — מחזיר payload אם החתימה תקינה וה-session לא פג, null אחרת.
 * The cookie's max-age is only a browser hint; a copied token is refused here
 * once loginAt is older than SESSION_MAX_AGE_MS.
 */
export async function verifySession(token: string, now = Date.now()): Promise<SessionPayload | null> {
  try {
    const key = await getHmacKey();
    const dot = token.lastIndexOf('.');
    if (dot < 0) return null;
    const data = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const valid = await crypto.subtle.verify(
      'HMAC', key, fromB64Url(sig), encode(data)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(data))) as SessionPayload;
    if (!isSessionFresh(payload, now)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Two-factor: short-lived token between the password step and the code step ──
// Signed with a key derived for this purpose only, so it can never pass as a session token
// (and a session token can never pass as this one).

interface MfaPendingPayload { purpose: 'mfa_pending'; userId: string; exp: number }

const getMfaPendingKey = () => getHmacKey(':mfa-pending:v1');

export async function signMfaPending(userId: string, maxAgeSeconds: number, now = Date.now()): Promise<string> {
  const payload: MfaPendingPayload = { purpose: 'mfa_pending', userId, exp: now + maxAgeSeconds * 1000 };
  const data = toB64Url(encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await getMfaPendingKey(), encode(data));
  return `${data}.${toB64Url(sig)}`;
}

export async function verifyMfaPending(token: string | undefined, now = Date.now()): Promise<string | null> {
  try {
    if (!token) return null;
    const dot = token.lastIndexOf('.');
    if (dot < 0) return null;
    const data = token.slice(0, dot);
    const ok = await crypto.subtle.verify('HMAC', await getMfaPendingKey(), fromB64Url(token.slice(dot + 1)), encode(data));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64Url(data))) as Partial<MfaPendingPayload>;
    if (p.purpose !== 'mfa_pending' || typeof p.userId !== 'string' || typeof p.exp !== 'number' || p.exp < now) return null;
    return p.userId;
  } catch {
    return null;
  }
}

/** קריאת session ב-Server Components ו-Route Handlers */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}
