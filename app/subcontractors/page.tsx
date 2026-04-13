import { createServiceClient } from '@/lib/supabase/server';
import { Subcontractor } from '@/types';
import SubcontractorList from '@/components/subcontractors/SubcontractorList';

export const dynamic = 'force-dynamic';

export default async function SubcontractorsPage() {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('subcontractors')
    .select('*')
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
