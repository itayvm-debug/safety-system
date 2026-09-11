/**
 * POST /api/reviews/snapshot
 * Creates worker_review_assignments for the current week for all active,
 * non-archived workers in the company. Called by the cron job and can be
 * triggered manually by an admin for the current week.
 *
 * Assignment source:
 *   - 'responsible_manager' if worker.responsible_manager_id is set
 *   - 'snapshot' if no manager is set (evaluator_manager_id = null)
 *
 * Uses upsert with ON CONFLICT DO NOTHING so it is safe to call multiple times.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { getWeekStart } from '@/lib/reviews/week';

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId, settings } = context;

  if (!settings.features.employeeReviews) {
    return NextResponse.json({ error: 'תכונת משוב עובדים אינה פעילה' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const weekStart: string = (body as Record<string, string>).week_start ?? getWeekStart();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'week_start לא תקין — פורמט YYYY-MM-DD נדרש' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: workers, error: workersError } = await supabase
    .from('workers')
    .select('id, responsible_manager_id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('is_archived', false);

  if (workersError) return NextResponse.json({ error: workersError.message }, { status: 500 });
  if (!workers || workers.length === 0) {
    return NextResponse.json({ created: 0, week_start: weekStart });
  }

  const rows = workers.map(w => ({
    company_id:           companyId,
    worker_id:            w.id,
    evaluator_manager_id: w.responsible_manager_id ?? null,
    week_start:           weekStart,
    assignment_source:    w.responsible_manager_id ? 'responsible_manager' : 'snapshot',
  }));

  const { error: insertError, count } = await supabase
    .from('worker_review_assignments')
    .upsert(rows, { onConflict: 'company_id,worker_id,week_start', ignoreDuplicates: true })
    .select('id');

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ created: count ?? rows.length, week_start: weekStart });
}
