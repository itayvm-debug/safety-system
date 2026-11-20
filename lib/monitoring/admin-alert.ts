/**
 * E-mail to the active platform admins (profiles.role = 'admin'). Used by the daily cron and by
 * the immediate server-error alert.
 *
 * Recipients are remembered for 6 hours in this server instance: when the database is the thing
 * that is down, the alert can still go out to the admins seen on an earlier request.
 */
import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';

const RECIPIENTS_TTL_MS = 6 * 60 * 60 * 1000;
let cachedRecipients: { to: string[]; at: number } | null = null;

/** Tests only. */
export function __resetAlertRecipients(): void { cachedRecipients = null; }

async function adminRecipients(db: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await db.from('profiles').select('email').eq('role', 'admin').eq('is_active', true);
    if (error) throw new Error(error.message);
    const to = (data ?? [])
      .map((a) => (a as { email: unknown }).email)
      .filter((e): e is string => typeof e === 'string' && e.includes('@'));
    cachedRecipients = { to, at: Date.now() };
    return to;
  } catch (e) {
    if (cachedRecipients && Date.now() - cachedRecipients.at < RECIPIENTS_TTL_MS) return cachedRecipients.to;
    throw e;
  }
}

/** Sends the alert; returns how many admins it went to (0 when e-mail is not configured). */
export async function sendAdminAlert(db: SupabaseClient, subject: string, text: string): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error('[admin-alert] RESEND_API_KEY / REPORT_FROM_EMAIL missing — alert not sent');
    return 0;
  }
  const to = await adminRecipients(db);
  if (to.length === 0) return 0;
  const { error } = await new Resend(apiKey).emails.send({ from: `SafeDoc <${from}>`, to, subject, text });
  if (error) throw new Error(error.message);
  return to.length;
}
