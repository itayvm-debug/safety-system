import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Vehicle } from '@/types';
import VehicleDetail from '@/components/vehicles/VehicleDetail';

export const dynamic = 'force-dynamic';

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('vehicles')
    .select(`*, assigned_manager:workers!vehicles_assigned_manager_id_fkey(id, full_name), vehicle_licenses(*), vehicle_insurances(*)`)
    .eq('id', id)
    .single();

  if (error || !data) notFound();

  const vehicle = data as Vehicle;

  // signed URL לתמונה
  let imageUrl: string | null = null;
  if (vehicle.image_url) {
    const { data: signed } = await supabase.storage
      .from('worker-files')
      .createSignedUrl(vehicle.image_url, 3600);
    imageUrl = signed?.signedUrl ?? null;
  }

  const { data: managers } = await supabase
    .from('workers')
    .select('id, full_name')
    .eq('is_responsible_site_manager', true)
    .eq('is_active', true)
    .order('full_name');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vehicles" className="text-gray-400 hover:text-gray-600 text-sm">
          ← רשימת רכבים
        </Link>
      </div>
      <VehicleDetail vehicle={vehicle} imageUrl={imageUrl} managers={managers ?? []} />
    </div>
  );
}
