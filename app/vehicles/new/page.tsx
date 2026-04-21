import { createServiceClient } from '@/lib/supabase/server';
import VehicleForm from '@/components/vehicles/VehicleForm';

export const dynamic = 'force-dynamic';

export default async function NewVehiclePage({ searchParams }: { searchParams: Promise<{ manager_id?: string }> }) {
  const { manager_id } = await searchParams;
  const supabase = createServiceClient();
  const { data: managers } = await supabase
    .from('workers')
    .select('id, full_name')
    .eq('is_responsible_site_manager', true)
    .eq('is_active', true)
    .order('full_name');

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">רכב חדש</h1>
      <VehicleForm managers={managers ?? []} defaultManagerId={manager_id} />
    </div>
  );
}
