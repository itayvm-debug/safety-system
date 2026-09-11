/**
 * GET /api/reviews/reminder-cron
 * Cron job: runs Thursday 13:00 UTC (≈15:00 IST / 16:00 IDT) — sends review reminder emails to owners of
 * companies that have employeeReviews enabled and have incomplete reviews for
 * the current week.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { getWeekStart } from '@/lib/reviews/week';
import { buildReviewReminderHtml, buildReviewReminderSubject } from '@/lib/reviews/reminderEmail';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey    = process.env.RESEND_API_KEY;
  const fromEmail = process.env.REPORT_FROM_EMAIL;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!apiKey || !fromEmail) {
    console.error('[reviews-reminder] missing env vars');
    return NextResponse.json({ error: 'Email not configured' }, { status: 500 });
  }

  const resend = new Resend(apiKey);
  const supabase = createServiceClient();
  const weekStart = getWeekStart();

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, settings')
    .eq('is_active', true);

  let sent = 0;
  const errors: string[] = [];

  for (const company of companies ?? []) {
    const settings = company.settings as Record<string, unknown> | null;
    const features = settings?.features as Record<string, unknown> | null;
    if (!features?.employeeReviews) continue;

    try {
      const [assignmentsRes, reviewsRes, ownersRes] = await Promise.all([
        supabase
          .from('worker_review_assignments')
          .select('worker_id', { count: 'exact' })
          .eq('company_id', company.id)
          .eq('week_start', weekStart),
        supabase
          .from('worker_weekly_reviews')
          .select('worker_id', { count: 'exact' })
          .eq('company_id', company.id)
          .eq('week_start', weekStart)
          .not('submitted_at', 'is', null),
        supabase
          .from('company_members')
          .select('user_id')
          .eq('company_id', company.id)
          .eq('role', 'owner')
          .eq('is_active', true),
      ]);

      const totalWorkers    = assignmentsRes.count ?? 0;
      const submittedCount  = reviewsRes.count ?? 0;

      if (totalWorkers === 0 || submittedCount >= totalWorkers) continue;

      const ownerIds = (ownersRes.data ?? []).map(m => m.user_id);
      if (ownerIds.length === 0) continue;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('report_email')
        .in('id', ownerIds)
        .eq('is_active', true)
        .not('report_email', 'is', null)
        .neq('report_email', '');

      const recipients = (profiles ?? []).map(p => p.report_email as string);
      if (recipients.length === 0) continue;

      const subject = buildReviewReminderSubject(company.name as string, weekStart);
      const html    = buildReviewReminderHtml(
        company.name as string, weekStart, totalWorkers, submittedCount, appUrl
      );

      await resend.emails.send({
        from:    fromEmail,
        to:      recipients,
        subject,
        html,
      });

      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[reviews-reminder] company ${company.id} error:`, msg);
      errors.push(`${company.id}: ${msg}`);
    }
  }

  console.log(`[reviews-reminder] week ${weekStart}: sent ${sent} reminder emails`);
  return NextResponse.json({ week_start: weekStart, sent, errors });
}
