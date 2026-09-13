import VehicleList from '@/components/vehicles/VehicleList';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function VehiclesPage() {
  const ctxResult = await getCurrentCompanyContext();
  if (ctxResult.error) {
    if (ctxResult.code === 'NEEDS_COMPANY_SELECTION') redirect('/select-company');
    redirect('/login');
  }
  const canManage = ctxResult.context.companyRole !== 'member';

  return <VehicleList canManage={canManage} />;
}
