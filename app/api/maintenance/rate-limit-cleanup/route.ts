/**
 * GET /api/maintenance/rate-limit-cleanup
 * Daily Vercel Cron. Deletes rate_limit_events older than 24 hours, so raw client
 * IPs (personal data, see supabase/migrations/durable-rate-limiting.sql) are not
 * kept longer than the longest rate-limit window needs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron';

export const runtime = 'nodejs';

/** Must stay above the longest window in lib/rate-limit/db.ts (login: 15 minutes). */
const RATE_LIMIT_RETENTION_HOURS = 24;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('rate_limit_cleanup', {
    p_max_age_hours: RATE_LIMIT_RETENTION_HOURS,
  });

  if (error) {
    console.error('[rate-limit-cleanup] failed:', error.message);
    return NextResponse.json({ error: 'cleanup failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: typeof data === 'number' ? data : 0 });
}
