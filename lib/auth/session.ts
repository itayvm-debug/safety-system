/**
 * session.ts — ניהול session מבוסס HMAC-SHA256 + Web Crypto API
 * עובד ב-Edge runtime (middleware), Node.js (API routes) ו-browser
 * אין צורך ב-packages חיצוניים
 */

import { cookies } from 'next/headers';

export const SESSION_COOKIE_NAME = 'safedoc_session';
export const ROLE_COOKIE_NAME = 'safedoc_role';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 ימים

export interface SessionPayload {
  role: 'admin' | 'viewer';
  phone: string;
  loginAt: number;
}

function encode(s: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(s);
  // .slice() מחזיר ArrayBuffer (לא ArrayBufferLike) — נדרש ל-Web Crypto API
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

async function getHmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET לא מוגדר ב-ENV');
  return crypto.subtle.importKey(
    'raw', encode(secret),
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

/** מאמת token — מחזיר payload אם תקין, null אחרת */
export async function verifySession(token: string): Promise<SessionPayload | null> {
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
    return JSON.parse(new TextDecoder().decode(fromB64Url(data))) as SessionPayload;
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
