/**
 * "Who may work today" — the gate check screen (/check, 2026-11-20).
 *
 * No status rules of its own: the verdict is getWorkerStatus() (the worst status, the same as the
 * workers list and /issues) and the reasons are buildWorkerIssues(). Mapping:
 *   inactive worker              → 'inactive'
 *   expired / missing            → 'not_allowed' (with the reasons)
 *   expiring_soon                → 'allowed_expiring' (with what expires)
 *   valid / not_required         → 'allowed'
 */
import type { WorkerWithDocuments } from '@/types';
import { getWorkerStatus } from '@/lib/documents/status';
import { buildWorkerIssues } from '@/lib/documents/issues';

export type EntryVerdict = 'allowed' | 'allowed_expiring' | 'not_allowed' | 'inactive';

export interface EntryCheck {
  verdict: EntryVerdict;
  /** Expired or missing — why not. */
  reasons: string[];
  /** Valid today, expires within 14 days. */
  expiring: string[];
}

const FALLBACK_REASON = 'יש מסמך חסר או שפג תוקפו — ראה בכרטיס העובד';

export function checkEntry(worker: WorkerWithDocuments): EntryCheck {
  const issues = buildWorkerIssues(worker);
  const reasons = issues.filter((i) => i.status === 'expired' || i.status === 'missing')
    .map((i) => (i.status === 'expired' ? `${i.problem} — פג תוקף` : `${i.problem} — חסר`));
  const expiring = issues.filter((i) => i.status === 'expiring_soon').map((i) => i.problem);

  if (!worker.is_active) return { verdict: 'inactive', reasons, expiring };

  const status = getWorkerStatus(worker);
  if (status === 'expired' || status === 'missing') {
    return { verdict: 'not_allowed', reasons: reasons.length ? reasons : [FALLBACK_REASON], expiring };
  }
  if (status === 'expiring_soon') return { verdict: 'allowed_expiring', reasons: [], expiring };
  return { verdict: 'allowed', reasons: [], expiring: [] };
}

const digits = (s: string) => s.replace(/\D/g, '');

/** Name (any part, case-insensitive), ID / passport number, or phone. At least 2 characters. */
export function matchesWorker(worker: WorkerWithDocuments, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return false;
  if (worker.full_name.toLowerCase().includes(q)) return true;
  for (const id of [worker.national_id, worker.passport_number, worker.id_number]) {
    if (id && id.toLowerCase().replace(/\s/g, '').includes(q.replace(/\s/g, ''))) return true;
  }
  const qd = digits(q);
  return qd.length >= 4 && !!worker.phone && digits(worker.phone).includes(qd);
}

/** Active workers first (not-allowed first among them), then by name. */
export function sortForGate(a: { worker: WorkerWithDocuments; check: EntryCheck }, b: { worker: WorkerWithDocuments; check: EntryCheck }): number {
  const rank: Record<EntryVerdict, number> = { not_allowed: 0, allowed_expiring: 1, allowed: 2, inactive: 3 };
  return rank[a.check.verdict] - rank[b.check.verdict] || a.worker.full_name.localeCompare(b.worker.full_name, 'he');
}
