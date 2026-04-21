import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Vehicle } from '@/types';
import VehicleList from '@/components/vehicles/VehicleList';

export const dynamic = 'force-dynamic';

export default async function VehiclesPage() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('vehicles')
    .select(`*, assigned_manager:workers!vehicles_assigned_manager_id_fkey(id, full_name), vehicle_licenses(*), vehicle_insurances(*)`)
    .order('vehicle_number');

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
        שגיאה בטעינת הנתונים: {error.message}
      </div>
    );
  }

  const vehicles: Vehicle[] = (data as Vehicle[]) ?? [];

  // signed URLs לתמונות
  const imageUrls: Record<string, string> = {};
  await Promise.all(
    vehicles
      .filter((v) => v.image_url)
      .map(async (v) => {
        const { data: signed } = await supabase.storage
          .from('worker-files')
          .createSignedUrl(v.image_url!, 3600);
        if (signed?.signedUrl) imageUrls[v.id] = signed.signedUrl;
      })
  );

  return <VehicleList vehicles={vehicles} imageUrls={imageUrls} />;
}
