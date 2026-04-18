import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { WorkerWithDocuments } from '@/types';
import WorkerDetail from '@/components/workers/WorkerDetail';

export const dynamic = 'force-dynamic';

export default async function WorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('workers')
    .select(`*, documents(*), safety_briefings(*), subcontractor:subcontractors(id, name)`)
    .eq('id', id)
    .single();

  if (error || !data) notFound();

  // queries נפרדים לטבלאות קשורות
  const [
    { data: heightData },
    { data: appointmentsData },
    { data: licensesData },
    { data: managerLicensesData },
    { data: managerInsurancesData },
  ] = await Promise.all([
    supabase.from('height_restrictions').select('*').eq('worker_id', id).order('created_at', { ascending: false }),
    supabase.from('lifting_machine_appointments').select('*').eq('worker_id', id).order('appointment_date', { ascending: false }),
    supabase.from('professional_licenses').select('*').eq('worker_id', id).order('created_at', { ascending: false }),
    supabase.from('manager_licenses').select('*').eq('worker_id', id).order('created_at', { ascending: false }),
    supabase.from('manager_insurances').select('*').eq('worker_id', id).order('created_at', { ascending: false }),
  ]);

  const worker = {
    ...data,
    height_restrictions: heightData ?? [],
    lifting_machine_appointments: appointmentsData ?? [],
    professional_licenses: licensesData ?? [],
    manager_licenses: managerLicensesData ?? [],
    manager_insurances: managerInsurancesData ?? [],
  } as WorkerWithDocuments;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/workers" className="text-gray-400 hover:text-gray-600 text-sm">
          ← רשימת עובדים
        </Link>
      </div>
      <WorkerDetail worker={worker} />
    </div>
  );
}
