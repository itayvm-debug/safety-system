/**
 * Daily maintenance (Vercel Cron → /api/maintenance/daily).
 *
 * 1. rate_limit_cleanup(24): drops rate-limit events, including raw client IPs, after 24 hours.
 * 2. safedoc_health_check(): read-only checks of the live database (supabase/migrations/safedoc-health-check.sql).
 * 3. app_error_events (2026-11-20): drops rows older than 30 days and e-mails a summary of the
 *    last 24 hours of server errors and rate-limit refusals (lib/monitoring/server-errors.ts).
 *
 * Any failure is logged and e-mailed to the active platform admins. On 2026-11-18 a migration that
 * had never been applied (rate limiting failed open) and three tables readable with the public key
 * went unnoticed; this job exists so that such states raise an alert.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMfaCryptoConfigured } from '@/lib/auth/mfa-crypto';

export const RATE_LIMIT_RETENTION_HOURS = 24;
export const ERROR_EVENT_RETENTION_DAYS = 30;

export interface IncidentGroup {
  source: string;
  status: number;
  count: number;
  first: string;
  last: string;
}

/** Groups error events by source + status, most frequent first. */
export function summarizeIncidents(rows: { source: string; status: number; created_at: string }[]): IncidentGroup[] {
  const groups = new Map<string, IncidentGroup>();
  for (const r of rows) {
    const key = `${r.status} ${r.source}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { source: r.source, status: r.status, count: 1, first: r.created_at, last: r.created_at });
    } else {
      g.count++;
      if (r.created_at < g.first) g.first = r.created_at;
      if (r.created_at > g.last) g.last = r.created_at;
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.status - a.status);
}

const israelTime = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export interface HealthRow {
  check_name: string;
  ok: boolean;
  detail: string;
}

export interface DailyResult {
  ok: boolean;
  deleted: number | null;
  checks: HealthRow[];
  failures: string[];
  incidents: IncidentGroup[];
  alerted: number;
}

export type AlertSender = (subject: string, text: string) => Promise<number>;

export async function runDailyMaintenance(db: SupabaseClient, sendAlert: AlertSender, now = Date.now()): Promise<DailyResult> {
  const failures: string[] = [];

  const cleanup = await db.rpc('rate_limit_cleanup', { p_max_age_hours: RATE_LIMIT_RETENTION_HOURS });
  const deleted = cleanup.error ? null : typeof cleanup.data === 'number' ? cleanup.data : 0;
  if (cleanup.error) failures.push(`rate_limit_cleanup failed: ${cleanup.error.message}`);

  const health = await db.rpc('safedoc_health_check');
  const checks: HealthRow[] = Array.isArray(health.data) ? (health.data as HealthRow[]) : [];
  if (health.error) {
    failures.push(`safedoc_health_check failed: ${health.error.message}`);
  } else if (checks.length === 0) {
    failures.push('safedoc_health_check returned no rows');
  }
  for (const c of checks) {
    if (!c.ok) failures.push(`${c.check_name}: ${c.detail}`);
  }

  // Without this key no one with two-factor sign-in can log in
  if (!isMfaCryptoConfigured()) failures.push('MFA_ENCRYPTION_KEY missing or invalid in the environment');

  // Server errors and rate-limit refusals of the last 24 hours (lib/monitoring/server-errors.ts)
  const retentionCutoff = new Date(now - ERROR_EVENT_RETENTION_DAYS * 86_400_000).toISOString();
  const purge = await db.from('app_error_events').delete().lt('created_at', retentionCutoff);
  if (purge.error) failures.push(`app_error_events cleanup failed: ${purge.error.message}`);
  let incidents: IncidentGroup[] = [];
  const recent = await db.from('app_error_events')
    .select('source, status, created_at')
    .gte('created_at', new Date(now - 86_400_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(5000);
  if (recent.error) failures.push(`app_error_events read failed: ${recent.error.message}`);
  else incidents = summarizeIncidents((recent.data ?? []) as { source: string; status: number; created_at: string }[]);

  let alerted = 0;
  if (failures.length > 0) console.error('[daily-maintenance] failures:', failures);
  if (failures.length > 0 || incidents.length > 0) {
    const lines: string[] = [];
    if (failures.length > 0) {
      lines.push(
        'SafeDoc daily database check found problems:',
        '',
        ...failures.map((f) => `- ${f}`),
        '',
        'Details: run SELECT * FROM public.safedoc_health_check(); in the Supabase SQL editor.',
        '',
      );
    }
    if (incidents.length > 0) {
      const total = incidents.reduce((a, g) => a + g.count, 0);
      lines.push(`תקלות ב-24 השעות האחרונות (${total}):`, '');
      for (const g of incidents) {
        const when = g.count === 1 ? israelTime(g.first) : `${israelTime(g.first)} – ${israelTime(g.last)}`;
        lines.push(`- ${g.status} ${g.source} × ${g.count} (${when})`);
      }
      lines.push(
        '',
        '5xx = תקלה בשרת או במסד הנתונים. 429 = משתמש נחסם זמנית בגלל ריבוי בקשות (rate-limit:login = ניסיונות התחברות).',
        'פירוט: SELECT * FROM public.app_error_events ORDER BY id DESC LIMIT 100;',
      );
    }
    const subject = failures.length > 0
      ? 'SafeDoc — בדיקת תקינות יומית נכשלה'
      : 'SafeDoc — סיכום תקלות ב-24 השעות האחרונות';
    try {
      alerted = await sendAlert(subject, lines.join('\n'));
    } catch (e) {
      console.error('[daily-maintenance] alert e-mail failed:', e instanceof Error ? e.message : e);
    }
  }

  return { ok: failures.length === 0, deleted, checks, failures, incidents, alerted };
}
