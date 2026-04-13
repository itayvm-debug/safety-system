/**
 * api.ts — helpers לאכיפת הרשאות ב-API routes
 */

import { NextResponse } from 'next/server';
import { getSession, SessionPayload } from './session';

type AuthResult =
  | { session: SessionPayload; error: null }
  | { session: null; error: NextResponse };

/** מאמת שיש session תקין (admin או viewer) */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: 'לא מורשה — יש להתחבר תחילה' }, { status: 401 }),
    };
  }
  return { session, error: null };
}

/** מאמת שיש session תקין עם role=admin */
export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireAuth();
  if (result.error) return result;
  if (result.session!.role !== 'admin') {
    return {
      session: null,
      error: NextResponse.json({ error: 'פעולה זו מחייבת הרשאת מנהל' }, { status: 403 }),
    };
  }
  return result;
}
