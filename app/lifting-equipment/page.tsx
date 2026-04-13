import { createServiceClient } from '@/lib/supabase/server';
import { LiftingEquipment } from '@/types';
import LiftingEquipmentList from '@/components/lifting-equipment/LiftingEquipmentList';

export const dynamic = 'force-dynamic';

export default async function LiftingEquipmentPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('lifting_equipment')
    .select('*, subcontractor:subcontractors(id, name)')
    .order('description');

  const equipment = (data ?? []) as LiftingEquipment[];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ציוד הרמה</h1>
        <p className="text-sm text-gray-500 mt-1">עגורנים, מלגזות וציוד הרמה נוסף</p>
      </div>
      <LiftingEquipmentList equipment={equipment} />
    </div>
  );
}
