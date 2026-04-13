import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LiftingEquipment } from '@/types';
import LiftingEquipmentDetail from '@/components/lifting-equipment/LiftingEquipmentDetail';

export const dynamic = 'force-dynamic';

export default async function LiftingEquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('lifting_equipment')
    .select('*, subcontractor:subcontractors(id, name)')
    .eq('id', id)
    .single();

  if (error || !data) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/lifting-equipment" className="text-gray-400 hover:text-gray-600 text-sm">
          ← רשימת ציוד הרמה
        </Link>
      </div>
      <LiftingEquipmentDetail equipment={data as LiftingEquipment} />
    </div>
  );
}
