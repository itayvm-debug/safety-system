import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import VehicleForm from '@/components/vehicles/VehicleForm';

export const dynamic = 'force-dynamic';

export default async function NewVehiclePage({ searchParams }: { searchParams: Promise<{ manager_id?: string }> }) {
  const { manager_id } = await searchParams;
  const ctxResult = await getCurrentCompanyContext();
  if (ctxResult.error) {
    if (ctxResult.code === 'NEEDS_COMPANY_SELECTION') redirect('/select-company');
    redirect('/login');
  }
  const { companyId } = ctxResult.context;

  const supabase = createServiceClient();
  const { data: workers } = await supabase
    .from('workers')
    .select('id, full_name')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('full_name');

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">רכב חדש</h1>
      <VehicleForm workers={workers ?? []} defaultManagerId={manager_id} />
    </div>
  );
}
