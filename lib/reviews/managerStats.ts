/**
 * Per-manager completion for the owner's weekly reviews dashboard.
 *
 * Found in the live QA round (2026-11-18): 7 assignments were shown but the per-manager list
 * summed to 5 — assignments without an evaluator (worker had no responsible manager) or whose
 * evaluator is no longer an active site manager were silently dropped. They are now counted
 * as `unassigned` so the totals always add up.
 */
export function computeManagerStats<M extends { id: string }>(
  assignments: { evaluator_manager_id: string | null }[],
  submittedReviews: { evaluator_manager_id: string | null }[],
  managers: M[],
) {
  const managerIds = new Set(managers.map(m => m.id));
  const managerStats = managers.map(m => ({
    manager: m,
    assigned: assignments.filter(a => a.evaluator_manager_id === m.id).length,
    submitted: submittedReviews.filter(r => r.evaluator_manager_id === m.id).length,
  })).filter(s => s.assigned > 0).sort((a, b) => b.assigned - a.assigned);
  const unassigned = assignments.filter(a => !a.evaluator_manager_id || !managerIds.has(a.evaluator_manager_id)).length;
  return { managerStats, unassigned };
}
