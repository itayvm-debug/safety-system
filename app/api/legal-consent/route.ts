import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';
import { LEGAL } from '@/lib/legal/config';
import { CONSENT_COOKIE_NAME, CONSENT_COOKIE_MAX_AGE } from '@/lib/auth/consent';
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
  const { error: dbError } = await supabase.from('legal_acceptances').upsert(
    {
      user_id: session!.userId,
      user_email: session!.email,
      terms_version: LEGAL.termsVersion,
      accepted_terms: true,
      accepted_privacy: true,
      ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
      user_agent: request.headers.get('user-agent') ?? null,
    },
    { onConflict: 'user_id,terms_version', ignoreDuplicates: true }
  );

  if (dbError) {
    console.error('[legal-consent] db error:', dbError.message);
    return NextResponse.json({ error: 'שגיאה בשמירת ההסכמה' }, { status: 500 });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: CONSENT_COOKIE_NAME,
    value: LEGAL.termsVersion,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: CONSENT_COOKIE_MAX_AGE,
    path: '/',
  });

  void auditLog({
    user_id: session!.userId,
    user_email: session!.email,
    action: 'legal_consent.accept',
    metadata: { version: LEGAL.termsVersion },
    ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
  });

  return response;
}
