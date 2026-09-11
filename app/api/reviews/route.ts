/**
 * GET  /api/reviews           — list reviews for a given week
 * POST /api/reviews           — submit or save a draft review
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireReviewAccess, requireReviewAuthor } from '@/lib/reviews/auth';
import { getWeekStart } from '@/lib/reviews/week';

const RATING_FIELDS = [
  'productivity_rating', 'quality_rating', 'reliability_rating',
  'discipline_rating', 'teamwork_rating', 'safety_rating',
] as const;

/** GET — owners/admins see all reviews; members see only their evaluator scope. */
export async function GET(request: NextRequest) {
  const { context, error } = await requireReviewAccess();
  if (error) return error;
  const { companyId, companyRole, managerWorkerId } = context;

  const url = request.nextUrl;
  const weekStart = url.searchParams.get('week_start') ?? getWeekStart();

  const supabase = createServiceClient();

  let query = supabase
    .from('worker_weekly_reviews')
    .select(`
      id, company_id, worker_id, evaluator_manager_id, reviewer_user_id,
      week_start, productivity_rating, quality_rating, reliability_rating,
      discipline_rating, teamwork_rating, safety_rating,
      is_not_evaluable, not_evaluable_reason, manager_comment,
      submitted_at, created_at, updated_at,
      worker:worker_id(id, full_name, photo_url),
      evaluator:evaluator_manager_id(id, full_name)
    `)
    .eq('company_id', companyId)
    .eq('week_start', weekStart);

  // Members scoped to their own manager workspace
  if (companyRole === 'member' && managerWorkerId) {
    query = query.eq('evaluator_manager_id', managerWorkerId);
  }

  const { data, error: dbError } = await query.order('created_at');
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST — submit or save a draft review.
 *
 * Authorization: requireReviewAuthor — ALL roles must be linked to a manager
 * worker row. Owners/admins without a mapping are rejected (403).
 *
 * evaluator_manager_id is always derived server-side from the mapping —
 * the request body may NOT override it. This prevents owners/admins from
 * spoofing another manager's evaluator identity.
 *
 * The submitter must be the recorded evaluator in worker_review_assignments
 * for this worker/week. If no assignment exists, the review is rejected.
 */
export async function POST(request: NextRequest) {
  const { context, error } = await requireReviewAuthor();
  if (error) return error;
  const { companyId, userId, managerWorkerId } = context;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body נדרש' }, { status: 400 });

  const {
    worker_id, week_start, is_not_evaluable, not_evaluable_reason,
    manager_comment, submit,
  } = body as Record<string, unknown>;

  if (!worker_id) return NextResponse.json({ error: 'worker_id נדרש' }, { status: 400 });

  const weekStart = (week_start as string) ?? getWeekStart();

  const supabase = createServiceClient();

  // Verify worker belongs to this company
  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', worker_id as string)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });

  // Verify this user is the recorded evaluator for this worker/week.
  // This applies to ALL roles — no admin bypass for review submission.
  const { data: assignment } = await supabase
    .from('worker_review_assignments')
    .select('evaluator_manager_id')
    .eq('company_id', companyId)
    .eq('worker_id', worker_id as string)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: 'לא נמצאה הקצאת ביצועים לעובד זה בשבוע זה' }, { status: 404 });
  }
  if (assignment.evaluator_manager_id !== managerWorkerId) {
    return NextResponse.json(
      { error: 'אין לך הרשאה להגיש ביצועים לעובד זה — אינך המנהל המוקצה לשבוע זה' },
      { status: 403 }
    );
  }

  // evaluatorManagerId is always from the server-verified mapping — never from the body.
  const evaluatorManagerId = managerWorkerId || null;

  const isNotEvaluable = is_not_evaluable === true;
  const shouldSubmit = submit === true;

  // Validation on submit
  if (shouldSubmit && !isNotEvaluable) {
    for (const field of RATING_FIELDS) {
      const val = (body as Record<string, unknown>)[field];
      if (typeof val !== 'number' || val < 1 || val > 5) {
        return NextResponse.json({ error: `שדה ${field} חסר או לא תקין (1-5 נדרש)` }, { status: 422 });
      }
    }
  }

  const payload: Record<string, unknown> = {
    company_id:           companyId,
    worker_id:            worker_id as string,
    evaluator_manager_id: evaluatorManagerId,
    reviewer_user_id:     userId,
    week_start:           weekStart,
    is_not_evaluable:     isNotEvaluable,
    not_evaluable_reason: isNotEvaluable ? (not_evaluable_reason ?? null) : null,
    manager_comment:      manager_comment ?? null,
  };

  if (!isNotEvaluable) {
    for (const field of RATING_FIELDS) {
      payload[field] = (body as Record<string, unknown>)[field] ?? null;
    }
  } else {
    for (const field of RATING_FIELDS) {
      payload[field] = null;
    }
  }

  if (shouldSubmit) {
    payload.submitted_at = new Date().toISOString();
  }

  const { data, error: upsertError } = await supabase
    .from('worker_weekly_reviews')
    .upsert(payload, { onConflict: 'company_id,worker_id,week_start' })
    .select()
    .single();

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
