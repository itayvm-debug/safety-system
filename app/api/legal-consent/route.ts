import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';
import { LEGAL } from '@/lib/legal/config';
import { CONSENT_COOKIE_NAME, CONSENT_COOKIE_MAX_AGE, CURRENT_CONSENT_VERSION } from '@/lib/auth/consent';
import { auditLog } from '@/lib/audit/log';

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { accepted_terms, accepted_privacy } = body as Record<string, unknown>;

  if (!accepted_terms || !accepted_privacy) {
    return NextResponse.json(
      { error: 'יש לאשר את תנאי השימוש ומדיניות הפרטיות' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // שלב 1: בדיקה אם כבר קיימת הסכמה תקפה — ה-DB הוא מקור האמת
  const { data: existing } = await supabase
    .from('legal_acceptances')
    .select('id')
    .eq('user_id', session!.userId)
    .eq('terms_version', LEGAL.termsVersion)
    .eq('privacy_version', LEGAL.privacyVersion)
    .limit(1)
    .maybeSingle();

  if (!existing) {
    // שלב 2: יצירת רשומה חדשה
    const { error: dbError } = await supabase.from('legal_acceptances').insert({
      user_id:        session!.userId,
      user_email:     session!.email,
      terms_version:  LEGAL.termsVersion,
      privacy_version: LEGAL.privacyVersion,
      accepted_terms:  true,
      accepted_privacy: true,
      ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
      user_agent: request.headers.get('user-agent') ?? null,
    });

    if (dbError) {
      // שגיאת unique constraint (23505) = race condition — הרשומה נוצרה במקביל; המשך כרגיל
      if (!dbError.code?.includes('23505')) {
        console.error('[legal-consent] db error:', dbError.message);
        return NextResponse.json({ error: 'שגיאה בשמירת ההסכמה' }, { status: 500 });
      }
    } else {
      // רשומה חדשה נוצרה — Audit פעם אחת בלבד
      void auditLog({
        user_id:    session!.userId,
        user_email: session!.email,
        action:     'legal_consent.accept',
        metadata:   { terms_version: LEGAL.termsVersion, privacy_version: LEGAL.privacyVersion },
        ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
      });
    }
  }
  // אם existing !== null: הרשומה כבר קיימת — אין INSERT ואין Audit נוסף

  const isProd = process.env.NODE_ENV === 'production';
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name:     CONSENT_COOKIE_NAME,
    value:    CURRENT_CONSENT_VERSION,
    httpOnly: true,
    secure:   isProd,
    sameSite: 'lax',
    maxAge:   CONSENT_COOKIE_MAX_AGE,
    path:     '/',
  });

  return response;
}
