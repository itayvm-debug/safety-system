import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth/api';
import FeedbackPage from '@/components/FeedbackPage';
import { SiteFeedback } from '@/types';

export const dynamic = 'force-dynamic';

export default async function FeedbackAdminPage() {
  // Role and active state come from the DB, not from the session cookie (P1·2)
  const { error: adminError } = await requirePlatformAdmin();
  if (adminError) redirect('/dashboard');

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('site_feedback')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
        שגיאה בטעינת הנתונים: {error.message}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <FeedbackPage feedbackList={data as SiteFeedback[]} />
    </div>
  );
}
