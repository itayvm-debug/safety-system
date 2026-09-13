import LiftingEquipmentList from '@/components/lifting-equipment/LiftingEquipmentList';
import { NewEntityButton } from '@/components/ui/NewEntityButton';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LiftingEquipmentPage() {
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
          <h1 className="text-2xl font-bold text-gray-900">ציוד הרמה</h1>
          <p className="text-sm text-gray-500 mt-1">עגורנים, מלגזות, מעלית משא וציוד הרמה נוסף</p>
        </div>
        {canManage && <NewEntityButton href="/lifting-equipment/new" label="+ ציוד הרמה חדש" />}
      </div>
      <LiftingEquipmentList />
    </div>
  );
}
