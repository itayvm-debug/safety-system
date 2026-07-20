/**
 * api.ts — helpers לאכיפת הרשאות ב-API routes
 *
 * requireAuth  — מאמת session חתום + is_active=true ב-DB (מניעת access לאחר השבתה)
 * requireAdmin — מאמת session חתום + role=admin ב-DB (מניעת access לאחר שינוי הרשאה)
 *
 * DB check מגן מפני:
 *   - session ישן לאחר הורדת הרשאת admin (7 ימי TTL של session ← מסוכן ללא DB check)
 *   - is_active=false שנקבע לאחר login
 *   - משתמש שנמחק (profile not found)
 */

import { NextResponse } from 'next/server';
import { getSession, SessionPayload } from './session';
import { createServiceClient } from '@/lib/supabase/server';

type AuthResult =
  | { session: SessionPayload; error: null }
  | { session: null; error: NextResponse };

/** בדיקת is_active ו-role ב-DB — מקור האמת */
async function verifyProfileDb(
  userId: string
): Promise<{ is_active: boolean; role: string } | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('profiles')
    .select('is_active, role')
    .eq('id', userId)
    .single();
  return data ?? null;
}

/** מאמת session חתום + is_active=true ב-DB */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: 'לא מורשה — יש להתחבר תחילה' }, { status: 401 }),
    };
  }

  const profile = await verifyProfileDb(session.userId);
  if (!profile || !profile.is_active) {
    return {
      session: null,
      error: NextResponse.json(
        { error: 'המשתמש הושבת. פנה למנהל המערכת.' },
        { status: 403 }
      ),
    };
  }

  return { session, error: null };
}

/** מאמת session חתום + role=admin + is_active=true ב-DB */
export async function requireAdmin(): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: 'לא מורשה — יש להתחבר תחילה' }, { status: 401 }),
    };
  }

  // Single DB query — checks both is_active and current role
  const profile = await verifyProfileDb(session.userId);
  if (!profile || !profile.is_active) {
    return {
      session: null,
      error: NextResponse.json(
        { error: 'המשתמש הושבת. פנה למנהל המערכת.' },
        { status: 403 }
      ),
    };
  }
  if (profile.role !== 'admin') {
    return {
      session: null,
      error: NextResponse.json({ error: 'פעולה זו מחייבת הרשאת מנהל' }, { status: 403 }),
    };
  }

  return { session, error: null };
}
