import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LiftingEquipment } from '@/types';
import LiftingForm from '@/components/lifting-equipment/LiftingForm';

export const dynamic = 'force-dynamic';

export default async function EditLiftingEquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('lifting_equipment').select('*').eq('id', id).single();
  if (error || !data) notFound();

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/lifting-equipment/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← חזרה לציוד
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">עריכת ציוד הרמה</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <LiftingForm equipment={data as LiftingEquipment} />
      </div>
    </div>
  );
}
