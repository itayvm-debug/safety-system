import { createServiceClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import Link from 'next/link';
import { HeavyEquipment } from '@/types';
import HeavyEquipmentDetail from '@/components/heavy-equipment/HeavyEquipmentDetail';

export const dynamic = 'force-dynamic';

export default async function HeavyEquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctxResult = await getCurrentCompanyContext();
  if (ctxResult.error) {
    if (ctxResult.code === 'NEEDS_COMPANY_SELECTION') redirect('/select-company');
    redirect('/login');
  }
  const { companyId } = ctxResult.context;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('heavy_equipment')
    .select('*, subcontractor:subcontractors(id, name), heavy_equipment_insurances(*)')
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (error || !data) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/heavy-equipment" className="text-gray-400 hover:text-gray-600 text-sm">
          ← רשימת כלי צמ&quot;ה / עבודה
        </Link>
      </div>
      <HeavyEquipmentDetail equipment={data as HeavyEquipment} />
    </div>
  );
}
