import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';
import { SYSTEM_VERSION } from '@/lib/system/version';
import { LEGAL } from '@/lib/legal/config';
import { FEATURES } from '@/config/features';

export const runtime = 'nodejs';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const checks: Record<string, { status: 'ok' | 'error'; detail?: string }> = {};

  // DB connectivity
  try {
    const supabase = createServiceClient();
    const { error: dbErr } = await supabase.from('profiles').select('id').limit(1);
    checks.database = dbErr ? { status: 'error', detail: dbErr.message } : { status: 'ok' };
  } catch (e) {
    checks.database = { status: 'error', detail: String(e) };
  }

  // Storage connectivity
  try {
    const supabase = createServiceClient();
    const { error: stErr } = await supabase.storage.listBuckets();
    checks.storage = stErr ? { status: 'error', detail: stErr.message } : { status: 'ok' };
  } catch (e) {
    checks.storage = { status: 'error', detail: String(e) };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');

  return NextResponse.json({
    status: allOk ? 'ok' : 'degraded',
    version: SYSTEM_VERSION,
    timestamp: new Date().toISOString(),
    legalVersions: {
      terms: LEGAL.termsVersion,
      privacy: LEGAL.privacyVersion,
      accessibility: LEGAL.accessibilityVersion,
      effectiveDate: LEGAL.termsEffectiveDate,
    },
    features: {
      mfaEnabled: FEATURES.mfaEnabled,
      durableRateLimiting: FEATURES.durableRateLimitingEnabled,
      externalLegalReview: FEATURES.externalLegalReviewCompleted,
      penetrationTest: FEATURES.penetrationTestCompleted,
    },
    checks,
  }, { status: allOk ? 200 : 503 });
}
