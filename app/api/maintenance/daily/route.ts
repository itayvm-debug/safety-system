/**
 * GET /api/maintenance/daily — Vercel Cron (vercel.json), CRON_SECRET bearer.
 * Rate-limit cleanup + live database health check; e-mails platform admins on failure.
 * Answers 500 when a check fails so the cron run is marked failed in Vercel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron';
import { runDailyMaintenance } from '@/lib/maintenance/daily';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceClient();

  const sendAlert = async (subject: string, text: string): Promise<number> => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.REPORT_FROM_EMAIL;
    if (!apiKey || !from) {
      console.error('[daily-maintenance] RESEND_API_KEY / REPORT_FROM_EMAIL missing — alert not sent');
      return 0;
    }
    const { data: admins } = await db.from('profiles').select('email').eq('role', 'admin').eq('is_active', true);
    const to = (admins ?? []).map((a) => a.email).filter((e): e is string => typeof e === 'string' && e.includes('@'));
    if (to.length === 0) return 0;
    const { error } = await new Resend(apiKey).emails.send({ from: `SafeDoc <${from}>`, to, subject, text });
    if (error) throw new Error(error.message);
    return to.length;
  };

  const result = await runDailyMaintenance(db, sendAlert);
  // No e-mail addresses in the response or logs — counts only
  return NextResponse.json(
    { ok: result.ok, deleted: result.deleted, checks: result.checks.length, failures: result.failures.length, alerted: result.alerted },
    { status: result.ok ? 200 : 500 },
  );
}
