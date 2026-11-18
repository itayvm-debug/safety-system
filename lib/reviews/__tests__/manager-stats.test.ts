/**
 * Live QA round (2026-11-18): "7 assigned" but the per-manager list summed to 5.
 * Assignments without an (active) evaluating manager must be counted, not dropped.
 */
import { describe, it, expect } from 'vitest';
import { computeManagerStats } from '@/lib/reviews/managerStats';

const managers = [{ id: 'm1', full_name: 'מנהל א' }, { id: 'm2', full_name: 'מנהל ב' }];
const a = (id: string, evaluator: string | null) => ({ id, worker_id: `w-${id}`, evaluator_manager_id: evaluator });

describe('computeManagerStats', () => {
  it('every assignment is either under a listed manager or counted as unassigned', () => {
    const assignments = [a('1', 'm1'), a('2', 'm1'), a('3', 'm2'), a('4', null), a('5', 'gone-manager')];
    const { managerStats, unassigned } = computeManagerStats(assignments, [{ evaluator_manager_id: 'm1' }], managers);
    expect(unassigned).toBe(2);
    expect(managerStats.reduce((s, m) => s + m.assigned, 0) + unassigned).toBe(assignments.length);
    expect(managerStats[0]).toMatchObject({ manager: { id: 'm1' }, assigned: 2, submitted: 1 });
  });

  it('no unassigned row when every worker has a manager', () => {
    expect(computeManagerStats([a('1', 'm2')], [], managers).unassigned).toBe(0);
  });
});
