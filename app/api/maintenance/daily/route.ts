/**
 * GET /api/maintenance/daily — Vercel Cron (vercel.json), CRON_SECRET bearer.
 * Rate-limit cleanup + live database health check + summary of the last day's server errors;
 * e-mails platform admins on a failed check or when errors were recorded.
 * Answers 500 when a check fails so the cron run is marked failed in Vercel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron';
import { runDailyMaintenance } from '@/lib/maintenance/daily';
import { sendAdminAlert } from '@/lib/monitoring/admin-alert';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceClient();
  const result = await runDailyMaintenance(db, (subject, text) => sendAdminAlert(db, subject, text));
  // No e-mail addresses in the response or logs — counts only
  return NextResponse.json(
    {
      ok: result.ok,
      deleted: result.deleted,
      checks: result.checks.length,
      failures: result.failures.length,
      incidents: result.incidents.length,
      alerted: result.alerted,
    },
    { status: result.ok ? 200 : 500 },
  );
}
