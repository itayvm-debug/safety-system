import { redirect } from 'next/navigation';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';
import { requireReviewAuthor } from '@/lib/reviews/auth';
import ReviewsOwnerDashboard from '@/components/reviews/ReviewsOwnerDashboard';
import ReviewsManagerHome from '@/components/reviews/ReviewsManagerHome';
import { getWeekStart } from '@/lib/reviews/week';

export const dynamic = 'force-dynamic';

export default async function ReviewsPage() {
  const { context, error: ctxError } = await getCurrentCompanyContext();
  if (ctxError) redirect('/dashboard');

  const { settings, companyRole, companyId } = context;
  if (!settings.features.employeeReviews) redirect('/dashboard');

  const supabase = createServiceClient();
  const weekStart = getWeekStart();

  if (companyRole === 'owner' || companyRole === 'admin') {
    // Load analytics data for owner/admin dashboard
    const [assignmentsRes, reviewsRes, managersRes] = await Promise.all([
      supabase
        .from('worker_review_assignments')
        .select('id, worker_id, evaluator_manager_id')
        .eq('company_id', companyId)
        .eq('week_start', weekStart),
      supabase
        .from('worker_weekly_reviews')
        .select('id, worker_id, evaluator_manager_id, submitted_at, productivity_rating, quality_rating, reliability_rating, discipline_rating, teamwork_rating, safety_rating, is_not_evaluable')
        .eq('company_id', companyId)
        .eq('week_start', weekStart),
      supabase
        .from('workers')
        .select('id, full_name')
        .eq('company_id', companyId)
        .eq('is_responsible_site_manager', true)
        .eq('is_active', true)
        .eq('is_archived', false),
    ]);

    return (
      <ReviewsOwnerDashboard
        companyId={companyId}
        weekStart={weekStart}
        assignments={assignmentsRes.data ?? []}
        reviews={reviewsRes.data ?? []}
        managers={managersRes.data ?? []}
        companyRole={companyRole}
      />
    );
  }

  // member role: check mapping
  const { context: reviewCtx, error: reviewError } = await requireReviewAuthor();
  if (reviewError) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center" dir="rtl">
        <p className="text-gray-600 text-sm">אין לך הרשאה לגשת לדף זה. פנה למנהל לשיוך חשבונך.</p>
      </div>
    );
  }

  const managerWorkerId = reviewCtx.managerWorkerId;

  // Load this week's assignments + existing reviews for this manager
  const [assignmentsRes, reviewsRes] = await Promise.all([
    supabase
      .from('worker_review_assignments')
      .select(`id, worker_id, worker:worker_id(id, full_name, photo_url)`)
      .eq('company_id', companyId)
      .eq('week_start', weekStart)
      .eq('evaluator_manager_id', managerWorkerId),
    supabase
      .from('worker_weekly_reviews')
      .select('id, worker_id, submitted_at')
      .eq('company_id', companyId)
      .eq('week_start', weekStart)
      .eq('evaluator_manager_id', managerWorkerId),
  ]);

  const assignments = assignmentsRes.data ?? [];
  const reviews = reviewsRes.data ?? [];
  const submittedWorkerIds = new Set(
    reviews.filter(r => r.submitted_at).map(r => r.worker_id)
  );
  const remaining = assignments.filter(a => !submittedWorkerIds.has(a.worker_id)).length;

  return (
    <ReviewsManagerHome
      weekStart={weekStart}
      totalWorkers={assignments.length}
      remainingWorkers={remaining}
      managerWorkerId={managerWorkerId}
    />
  );
}
