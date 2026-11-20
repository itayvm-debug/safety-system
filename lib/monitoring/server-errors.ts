/**
 * Server-side failure log (2026-11-20).
 *
 * On 19.11 at 06:04 UTC the database answered 503 for a few seconds during the photo-request
 * storm; nobody was told, it was found later by reading logs. Now such failures are written to
 * `app_error_events` (service role only, 30 days), the first 5xx in an hour e-mails the platform
 * admins at once, and the daily cron sends a summary of the last 24 hours.
 *
 * Never throws and never blocks the response: callers use reportServerError(), which runs after
 * the response (next/server `after`). No user data is stored: source, HTTP status and a short
 * technical message with e-mails and long numbers masked.
 */
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { sendAdminAlert } from './admin-alert';

export interface ServerErrorEvent {
  /** Where it happened, e.g. 'company-context', 'rate-limit:signed-url', 'request:/api/workers'. */
  source: string;
  status: number;
  detail?: string;
}

export const IMMEDIATE_ALERT_WINDOW_MS = 60 * 60 * 1000;
let lastFallbackAlertAt: number | null = null;

/** Tests only. */
export function __resetServerErrorState(): void { lastFallbackAlertAt = null; }

/** Short, single-line, no e-mail addresses or long digit runs (phone / ID numbers). */
export function cleanDetail(detail: string | undefined): string | null {
  if (!detail) return null;
  return detail
    .replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '[email]')
    .replace(/\d{7,}/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) || null;
}

function alertText(ev: { source: string; status: number; detail: string | null }, note: string): string {
  return [
    'נרשמה תקלה בשרת SafeDoc:',
    `- מקור: ${ev.source}`,
    `- קוד: ${ev.status}`,
    `- פירוט: ${ev.detail ?? '—'}`,
    '',
    note,
    '',
    'כל התקלות: SELECT * FROM public.app_error_events ORDER BY id DESC LIMIT 50;',
  ].join('\n');
}

async function trySend(db: SupabaseClient, subject: string, text: string): Promise<void> {
  try {
    await sendAdminAlert(db, subject, text);
  } catch (e) {
    console.error('[monitoring] alert e-mail failed:', e instanceof Error ? e.message : e);
  }
}

export async function recordServerError(
  ev: ServerErrorEvent,
  deps: { db?: SupabaseClient; now?: number } = {},
): Promise<void> {
  try {
    const db = deps.db ?? createServiceClient();
    const now = deps.now ?? Date.now();
    const row = { source: ev.source.slice(0, 100), status: ev.status, detail: cleanDetail(ev.detail) };
    console.error('[server-error]', row.source, row.status, row.detail ?? '');

    const inserted = await db.from('app_error_events').insert(row).select('id').single();
    if (inserted.error || !inserted.data) {
      // Most likely the database itself is unreachable: tell the admins, at most once an hour here.
      if (lastFallbackAlertAt !== null && now - lastFallbackAlertAt < IMMEDIATE_ALERT_WINDOW_MS) return;
      lastFallbackAlertAt = now;
      await trySend(db, 'SafeDoc — תקלה בשרת (מסד הנתונים לא זמין?)',
        alertText(row, `לא ניתן היה לרשום את התקלה במסד הנתונים (${inserted.error?.message ?? 'no row'}). ייתכן שמסד הנתונים לא זמין.`));
      return;
    }

    if (row.status < 500) return; // refusals (429) go to the daily summary only
    // Alert only for the first server error of the hour: no earlier 5xx row in the window.
    const since = new Date(now - IMMEDIATE_ALERT_WINDOW_MS).toISOString();
    const earlier = await db.from('app_error_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .gte('status', 500)
      .lt('id', (inserted.data as { id: number }).id);
    if (earlier.error || (earlier.count ?? 0) > 0) return;
    await trySend(db, 'SafeDoc — תקלה בשרת',
      alertText(row, 'תקלות נוספות בשעה הקרובה לא יישלחו במייל נפרד; הסיכום המלא יגיע בבדיקה היומית.'));
  } catch (e) {
    console.error('[monitoring] could not record server error:', e instanceof Error ? e.message : e);
  }
}

/** Fire-and-forget: runs after the response when inside a request, otherwise right away. */
export function reportServerError(ev: ServerErrorEvent): void {
  try {
    after(() => recordServerError(ev));
  } catch {
    void recordServerError(ev);
  }
}
