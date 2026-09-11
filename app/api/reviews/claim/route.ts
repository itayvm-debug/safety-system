/**
 * POST /api/reviews/claim
 *
 * A linked site manager claims or transfers a worker's OPERATIONAL manager
 * assignment (workers.responsible_manager_id). Any linked manager may pull any
 * active worker — including from another manager — without requiring admin role.
 *
 * CRITICAL business rule:
 *   - workers.responsible_manager_id is updated immediately (affects next snapshot).
 *   - worker_review_assignments for the CURRENT week is NOT changed.
 *     The current week's evaluator stays as originally recorded.
 *   - The transfer takes effect for NEXT week's snapshot.
 *   - Transfer audit is always written.
 *
 * Body: { worker_id, week_start? }
 *   week_start is informational only (used for audit logging).
 *
 * Returns:
 *   { success, action, previous_manager_id, current_week_evaluator_unchanged }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireReviewAuthor } from '@/lib/reviews/auth';
import { getWeekStart } from '@/lib/reviews/week';

export async function POST(request: NextRequest) {
  const { context, error } = await requireReviewAuthor();
  if (error) return error;
  const { companyId, userId, managerWorkerId } = context;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body נדרש' }, { status: 400 });

  const { worker_id, week_start } = body as Record<string, string>;
  if (!worker_id) return NextResponse.json({ error: 'worker_id נדרש' }, { status: 400 });
  const auditWeekStart = week_start ?? getWeekStart();

  const supabase = createServiceClient();

  // Verify worker belongs to this company and is active
  const { data: worker } = await supabase
    .from('workers')
    .select('id, responsible_manager_id')
    .eq('id', worker_id)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });

  const previousManagerId = worker.responsible_manager_id ?? null;
  const newManagerId      = managerWorkerId || null;

  const action = previousManagerId === null ? 'claim' : 'transfer';

  // Update the OPERATIONAL manager assignment on the worker row.
  // This affects next week's snapshot — current week remains with original evaluator.
  const { error: updateError } = await supabase
    .from('workers')
    .update({ responsible_manager_id: newManagerId })
    .eq('id', worker_id)
    .eq('company_id', companyId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Write immutable audit record
  await supabase.from('worker_transfer_audit').insert({
    company_id:      companyId,
    worker_id,
    week_start:      auditWeekStart,
    from_manager_id: previousManagerId,
    to_manager_id:   newManagerId,
    action,
    performed_by:    userId,
  });

  return NextResponse.json({
    success:                          true,
    action,
    previous_manager_id:              previousManagerId,
    current_week_evaluator_unchanged: true,
  });
}
