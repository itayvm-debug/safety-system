import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { HeavyEquipment } from '@/types';
import EquipmentForm from '@/components/heavy-equipment/EquipmentForm';

export const dynamic = 'force-dynamic';

export default async function EditHeavyEquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('heavy_equipment').select('*').eq('id', id).single();
  if (error || !data) notFound();

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/heavy-equipment/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← חזרה לציוד
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">עריכת ציוד</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <EquipmentForm equipment={data as HeavyEquipment} />
      </div>
    </div>
  );
}
