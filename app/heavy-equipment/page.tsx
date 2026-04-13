import { createServiceClient } from '@/lib/supabase/server';
import { HeavyEquipment } from '@/types';
import HeavyEquipmentList from '@/components/heavy-equipment/HeavyEquipmentList';

export const dynamic = 'force-dynamic';

export default async function HeavyEquipmentPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('heavy_equipment')
    .select('*, subcontractor:subcontractors(id, name)')
    .order('description');

  const equipment = (data ?? []) as HeavyEquipment[];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">כלי צמ"ה</h1>
        <p className="text-sm text-gray-500 mt-1">ניהול ציוד כבד ורכבי עבודה</p>
      </div>
      <HeavyEquipmentList equipment={equipment} />
    </div>
  );
}
