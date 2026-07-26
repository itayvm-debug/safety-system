import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';
import { Subcontractor } from '@/types';
import SubcontractorList from '@/components/subcontractors/SubcontractorList';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SubcontractorsPage() {
  const { context, error } = await getCurrentCompanyContext();
  if (error) redirect('/login');
  const { companyId } = context;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('subcontractors')
    .select('*, responsible_worker:workers!subcontractors_responsible_worker_id_fkey(id, full_name)')
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .order('name');

  const subcontractors = (data ?? []) as Subcontractor[];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">קבלני משנה</h1>
        <p className="text-sm text-gray-500 mt-1">ניהול רשימת קבלני המשנה העובדים באתר</p>
      </div>
      <SubcontractorList initialSubcontractors={subcontractors} />
    </div>
  );
}
