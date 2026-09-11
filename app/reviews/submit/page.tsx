import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { requireReviewAuthor } from '@/lib/reviews/auth';
import { getWeekStart } from '@/lib/reviews/week';
import ReviewSubmitClient from './ReviewSubmitClient';

export const dynamic = 'force-dynamic';

export default async function ReviewSubmitPage() {
  const { context, error } = await requireReviewAuthor();
  if (error) redirect('/reviews');

  const { companyId, settings, managerWorkerId, companyRole } = context;
  if (!settings.features.employeeReviews) redirect('/dashboard');

  // Owners/admins redirected to dashboard page
  if ((companyRole === 'owner' || companyRole === 'admin') && !managerWorkerId) {
    redirect('/reviews');
  }

  const supabase = createServiceClient();
  const weekStart = getWeekStart();

  const [assignmentsRes, reviewsRes] = await Promise.all([
    supabase
      .from('worker_review_assignments')
      .select(`id, worker_id, worker:worker_id(id, full_name, photo_url)`)
      .eq('company_id', companyId)
      .eq('week_start', weekStart)
      .eq('evaluator_manager_id', managerWorkerId)
      .order('worker_id'),
    supabase
      .from('worker_weekly_reviews')
      .select('*')
      .eq('company_id', companyId)
      .eq('week_start', weekStart)
      .eq('evaluator_manager_id', managerWorkerId),
  ]);

  type Assignment = {
    id: string;
    worker_id: string;
    worker: { id: string; full_name: string; photo_url: string | null } | null;
  };

  // Normalize Supabase join: worker comes back as array from the FK relation
  const assignments = (assignmentsRes.data ?? []).map((a: Record<string, unknown>) => ({
    ...(a as object),
    worker: Array.isArray(a.worker) ? (a.worker[0] ?? null) : a.worker,
  })) as Assignment[];

  // Skip already-submitted workers — those are locked
  const submittedSet = new Set(
    (reviewsRes.data ?? []).filter(r => r.submitted_at).map(r => r.worker_id)
  );
  const workers = assignments
    .filter(a => !submittedSet.has(a.worker_id))
    .map(a => ({ id: a.worker_id, full_name: a.worker?.full_name ?? '', photo_url: a.worker?.photo_url ?? null }));

  const draftReviews = (reviewsRes.data ?? []).filter(r => !r.submitted_at);

  if (workers.length === 0) redirect('/reviews');

  return (
    <ReviewSubmitClient
      workers={workers}
      weekStart={weekStart}
      managerWorkerId={managerWorkerId}
      initialDrafts={draftReviews}
    />
  );
}
