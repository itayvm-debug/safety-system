import HeavyEquipmentList from '@/components/heavy-equipment/HeavyEquipmentList';
import { NewEntityButton } from '@/components/ui/NewEntityButton';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HeavyEquipmentPage() {
  const ctxResult = await getCurrentCompanyContext();
  if (ctxResult.error) {
    if (ctxResult.code === 'NEEDS_COMPANY_SELECTION') redirect('/select-company');
    redirect('/login');
  }
  const canManage = ctxResult.context.companyRole !== 'member';

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">כלי צמ&quot;ה / עבודה</h1>
          <p className="text-sm text-gray-500 mt-1">מנופים, עגורנים, קומפרסורים וציוד עבודה כבד</p>
        </div>
        {canManage && <NewEntityButton href="/heavy-equipment/new" label='+ כלי צמ"ה / עבודה חדש' />}
      </div>
      <HeavyEquipmentList />
    </div>
  );
}
