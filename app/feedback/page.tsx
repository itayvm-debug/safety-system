import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import FeedbackPage from '@/components/FeedbackPage';
import { SiteFeedback } from '@/types';

export const dynamic = 'force-dynamic';

export default async function FeedbackAdminPage() {
  // בדיקת הרשאת admin ב-server
  const cookieStore = await cookies();
  const role = cookieStore.get('user_role')?.value;
  if (role !== 'admin') {
    redirect('/dashboard');
  }

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
