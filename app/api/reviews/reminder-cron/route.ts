/**
 * GET /api/reviews/reminder-cron
 * Fires at 06:00 UTC and 07:00 UTC every Thursday (vercel.json: "0 6,7 * * 4").
 * Israel switches between IDT (UTC+3, summer) and IST (UTC+2, winter), so one
 * of the two UTC firings always lands at Israel 09:00 and the other does not.
 *
 * IDEMPOTENCY
 * ───────────
 * The timezone guard (israelHour() === 9) filters out the wrong-hour firing.
 * For the valid firing, review_reminder_log provides durable idempotency:
 *   INSERT … ON CONFLICT DO NOTHING on (company_id, week_start, reminder_type)
 * ensures at-most-once delivery per company per week, even under concurrent
 * invocations, Vercel cron retries, or manual duplicate calls at 09:xx IST.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { getWeekStart } from '@/lib/reviews/week';
import { israelHour } from '@/lib/reviews/cronHelpers';
import { buildReviewReminderHtml, buildReviewReminderSubject } from '@/lib/reviews/reminderEmail';

export const runtime = 'nodejs';

const REMINDER_TYPE = 'weekly_review';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // DST-safe guard: only proceed at Israel local 09:xx.
  const hour = israelHour();
  if (hour !== 9) {
    console.log(`[reviews-reminder] skipped — Israel hour=${hour} (expected 9)`);
    return NextResponse.json({ skipped: true, reason: 'not 09:00 Israel time', israel_hour: hour });
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
  let skippedIdempotent = 0;
  const errors: string[] = [];

  for (const company of companies ?? []) {
    const settings = company.settings as Record<string, unknown> | null;
    const features = settings?.features as Record<string, unknown> | null;
    if (!features?.employeeReviews) continue;

    try {
      // ── Idempotency claim ─────────────────────────────────────────
      // INSERT ... ON CONFLICT DO NOTHING is atomic at DB level.
      // If the row already exists (this week's reminder was already sent),
      // the insert returns nothing and we skip.  Race-safe: concurrent
      // calls both attempt the same INSERT; the unique constraint ensures
      // exactly one succeeds.
      const { error: logErr } = await supabase
        .from('review_reminder_log')
        .insert({
          company_id:    company.id,
          week_start:    weekStart,
          reminder_type: REMINDER_TYPE,
        });

      if (logErr) {
        // Postgres unique-violation code 23505 means already sent this week
        if (logErr.code === '23505') {
          console.log(`[reviews-reminder] ${company.id}: already sent for week ${weekStart} — skipping`);
          skippedIdempotent++;
          continue;
        }
        // Table missing or other error → log but still try to send
        console.error(`[reviews-reminder] idempotency log failed (${logErr.code}): ${logErr.message}`);
      }

      // ── Check if there is anything to remind about ────────────────
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

      const totalWorkers   = assignmentsRes.count ?? 0;
      const submittedCount = reviewsRes.count ?? 0;

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

      await resend.emails.send({ from: fromEmail, to: recipients, subject, html });

      // Update the log row with the actual recipient count
      await supabase
        .from('review_reminder_log')
        .update({ recipients_count: recipients.length })
        .eq('company_id', company.id)
        .eq('week_start', weekStart)
        .eq('reminder_type', REMINDER_TYPE);

      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[reviews-reminder] company ${company.id} error:`, msg);
      errors.push(`${company.id}: ${msg}`);
    }
  }

  console.log(`[reviews-reminder] week ${weekStart}: sent=${sent} skipped_idempotent=${skippedIdempotent}`);
  return NextResponse.json({ week_start: weekStart, sent, skipped_idempotent: skippedIdempotent, errors });
}
