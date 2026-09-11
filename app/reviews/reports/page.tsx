import { redirect } from 'next/navigation';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';
import { getWeekStart, getPreviousWeekStart } from '@/lib/reviews/week';
import ReviewReportsClient from './ReviewReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReviewReportsPage() {
  const { context, error } = await requireCompanyAdminRole();
  if (error) redirect('/dashboard');

  const { companyId, settings, companyName } = context;
  if (!settings.features.employeeReviews) redirect('/dashboard');

  const supabase = createServiceClient();

  const managers = await supabase
    .from('workers')
    .select('id, full_name')
    .eq('company_id', companyId)
    .eq('is_responsible_site_manager', true)
    .eq('is_active', true)
    .eq('is_archived', false)
    .order('full_name');

  const workers = await supabase
    .from('workers')
    .select('id, full_name')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('is_archived', false)
    .order('full_name');

  const currentWeek  = getWeekStart();
  const previousWeek = getPreviousWeekStart();

  return (
    <ReviewReportsClient
      companyId={companyId}
      companyName={companyName}
      currentWeek={currentWeek}
      previousWeek={previousWeek}
      managers={managers.data ?? []}
      workers={workers.data ?? []}
    />
  );
}
