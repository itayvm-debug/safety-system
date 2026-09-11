/**
 * GET /api/reviews/report?week_start=YYYY-MM-DD&scope=company|manager|individual
 *                         [&manager_id=<worker_id>] [&worker_id=<worker_id>]
 * Returns structured review data for report generation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { getWeekStart } from '@/lib/reviews/week';
import type { ReviewReportRow } from '@/lib/reviews/generateReviewReport';

export async function GET(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId, settings } = context;

  if (!settings.features.employeeReviews) {
    return NextResponse.json({ error: 'תכונת משוב עובדים אינה פעילה' }, { status: 403 });
  }

  const url = request.nextUrl;
  const weekStart   = url.searchParams.get('week_start') ?? getWeekStart();
  const scope       = url.searchParams.get('scope') ?? 'company';
  const managerId   = url.searchParams.get('manager_id');
  const workerId    = url.searchParams.get('worker_id');

  const supabase = createServiceClient();

  let query = supabase
    .from('worker_weekly_reviews')
    .select(`
      worker_id, week_start,
      productivity_rating, quality_rating, reliability_rating,
      discipline_rating, teamwork_rating, safety_rating,
      is_not_evaluable, not_evaluable_reason, manager_comment, submitted_at,
      worker:worker_id(id, full_name),
      evaluator:evaluator_manager_id(id, full_name)
    `)
    .eq('company_id', companyId)
    .eq('week_start', weekStart)
    .not('submitted_at', 'is', null);

  if (scope === 'manager' && managerId) {
    query = query.eq('evaluator_manager_id', managerId);
  } else if (scope === 'individual' && workerId) {
    query = query.eq('worker_id', workerId);
  }

  const { data, error: dbError } = await query.order('worker_id');
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const rows: ReviewReportRow[] = (data ?? []).map(r => {
    const ratingFields = ['productivity_rating', 'quality_rating', 'reliability_rating', 'discipline_rating', 'teamwork_rating', 'safety_rating'] as const;
    const ratingVals = ratingFields.map(f => r[f]).filter((v): v is number => v !== null);
    const avg = ratingVals.length > 0
      ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length
      : null;

    const worker = Array.isArray(r.worker) ? r.worker[0] : r.worker;
    const evaluator = Array.isArray(r.evaluator) ? r.evaluator[0] : r.evaluator;

    return {
      worker_id:            r.worker_id,
      worker_name:          (worker as { full_name?: string } | null)?.full_name ?? r.worker_id,
      manager_name:         (evaluator as { full_name?: string } | null)?.full_name ?? null,
      week_start:           r.week_start,
      productivity_rating:  r.productivity_rating,
      quality_rating:       r.quality_rating,
      reliability_rating:   r.reliability_rating,
      discipline_rating:    r.discipline_rating,
      teamwork_rating:      r.teamwork_rating,
      safety_rating:        r.safety_rating,
      is_not_evaluable:     r.is_not_evaluable,
      not_evaluable_reason: r.not_evaluable_reason ?? null,
      manager_comment:      r.manager_comment ?? null,
      avg_rating:           avg,
    };
  });

  return NextResponse.json({ rows, week_start: weekStart, scope });
}
