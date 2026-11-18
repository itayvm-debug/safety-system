/**
 * Daily maintenance (Vercel Cron → /api/maintenance/daily).
 *
 * 1. rate_limit_cleanup(24): drops rate-limit events, including raw client IPs, after 24 hours.
 * 2. safedoc_health_check(): read-only checks of the live database (supabase/migrations/safedoc-health-check.sql).
 *
 * Any failure is logged and e-mailed to the active platform admins. On 2026-11-18 a migration that
 * had never been applied (rate limiting failed open) and three tables readable with the public key
 * went unnoticed; this job exists so that such states raise an alert.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const RATE_LIMIT_RETENTION_HOURS = 24;

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
  alerted: number;
}

export type AlertSender = (subject: string, text: string) => Promise<number>;

export async function runDailyMaintenance(db: SupabaseClient, sendAlert: AlertSender): Promise<DailyResult> {
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

  let alerted = 0;
  if (failures.length > 0) {
    console.error('[daily-maintenance] failures:', failures);
    const text = [
      'SafeDoc daily database check found problems:',
      '',
      ...failures.map((f) => `- ${f}`),
      '',
      'Details: run SELECT * FROM public.safedoc_health_check(); in the Supabase SQL editor.',
    ].join('\n');
    try {
      alerted = await sendAlert('SafeDoc — בדיקת תקינות יומית נכשלה', text);
    } catch (e) {
      console.error('[daily-maintenance] alert e-mail failed:', e instanceof Error ? e.message : e);
    }
  }

  return { ok: failures.length === 0, deleted, checks, failures, alerted };
}
