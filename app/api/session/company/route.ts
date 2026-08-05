import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ACTIVE_COMPANY_COOKIE_NAME, ACTIVE_COMPANY_MAX_AGE } from '@/lib/auth/active-company';
import { createServiceClient } from '@/lib/supabase/server';

const isProd = process.env.NODE_ENV === 'production';

/**
 * POST /api/session/company
 * Sets the active company cookie after verifying the user is an active member.
 * Body: { company_id: string }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
  }

  let company_id: string | undefined;
  try {
    const body = await request.json();
    company_id = body?.company_id;
  } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו תקין' }, { status: 400 });
  }

  if (!company_id || typeof company_id !== 'string') {
    return NextResponse.json({ error: 'company_id חסר' }, { status: 400 });
  }

  // Server-side membership verification — never trust company_id from browser alone
  const supabase = createServiceClient();
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', session.userId)
    .eq('company_id', company_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'אין גישה לחברה זו' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name:     ACTIVE_COMPANY_COOKIE_NAME,
    value:    company_id,
    httpOnly: true,
    secure:   isProd,
    sameSite: 'lax',
    maxAge:   ACTIVE_COMPANY_MAX_AGE,
    path:     '/',
  });
  return response;
}

/**
 * DELETE /api/session/company
 * Clears the active company cookie (used when switching companies or logging out).
 */
export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name:     ACTIVE_COMPANY_COOKIE_NAME,
    value:    '',
    maxAge:   0,
    path:     '/',
    httpOnly: true,
    sameSite: 'lax',
  });
  return response;
}
