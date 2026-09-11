/**
 * GET    /api/reviews/[id]  — fetch a single review
 * PATCH  /api/reviews/[id]  — update a draft review
 * DELETE /api/reviews/[id]  — delete a draft review (not submitted)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireReviewAccess, requireReviewAuthor } from '@/lib/reviews/auth';

type Params = { params: Promise<{ id: string }> };

const RATING_FIELDS = [
  'productivity_rating', 'quality_rating', 'reliability_rating',
  'discipline_rating', 'teamwork_rating', 'safety_rating',
] as const;

export async function GET(_request: NextRequest, { params }: Params) {
  const { context, error } = await requireReviewAccess();
  if (error) return error;
  const { companyId, companyRole, managerWorkerId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('worker_weekly_reviews')
    .select(`*, worker:worker_id(id, full_name, photo_url), evaluator:evaluator_manager_id(id, full_name)`)
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'ביצועים לא נמצאו' }, { status: 404 });

  if (companyRole === 'member' && managerWorkerId && data.evaluator_manager_id !== managerWorkerId) {
    return NextResponse.json({ error: 'אין גישה' }, { status: 403 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { context, error } = await requireReviewAuthor();
  if (error) return error;
  const { companyId, companyRole, managerWorkerId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('worker_weekly_reviews')
    .select('id, submitted_at, evaluator_manager_id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ביצועים לא נמצאו' }, { status: 404 });
  if (existing.submitted_at) return NextResponse.json({ error: 'לא ניתן לערוך ביצועים שהוגשו' }, { status: 422 });

  if (companyRole === 'member' && managerWorkerId && existing.evaluator_manager_id !== managerWorkerId) {
    return NextResponse.json({ error: 'אין הרשאה לערוך ביצועים אלו' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  const isNotEvaluable = body.is_not_evaluable;
  if (isNotEvaluable !== undefined) updates.is_not_evaluable = isNotEvaluable;
  if (body.not_evaluable_reason !== undefined) updates.not_evaluable_reason = body.not_evaluable_reason;
  if (body.manager_comment !== undefined)      updates.manager_comment      = body.manager_comment;

  for (const field of RATING_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  const shouldSubmit = body.submit === true;
  if (shouldSubmit) updates.submitted_at = new Date().toISOString();

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from('worker_weekly_reviews')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { context, error } = await requireReviewAuthor();
  if (error) return error;
  const { companyId, companyRole, managerWorkerId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('worker_weekly_reviews')
    .select('id, submitted_at, evaluator_manager_id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ביצועים לא נמצאו' }, { status: 404 });
  if (existing.submitted_at) return NextResponse.json({ error: 'לא ניתן למחוק ביצועים שהוגשו' }, { status: 422 });

  if (companyRole === 'member' && managerWorkerId && existing.evaluator_manager_id !== managerWorkerId) {
    return NextResponse.json({ error: 'אין הרשאה למחוק ביצועים אלו' }, { status: 403 });
  }

  const { error: dbError } = await supabase
    .from('worker_weekly_reviews')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
