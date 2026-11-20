import { redirect } from 'next/navigation';
import { getPageCompanyContext } from '@/lib/auth/company-context';
import EntryCheckScreen from '@/components/workers/EntryCheckScreen';

export const dynamic = 'force-dynamic';

/** "Who may work today" — gate check by name / ID / passport (lib/workers/entry-check.ts). */
export default async function CheckPage() {
  const ctxResult = await getPageCompanyContext();
  if (ctxResult.error) {
    if (ctxResult.code === 'NEEDS_COMPANY_SELECTION') redirect('/select-company');
    redirect('/login');
  }
  return <EntryCheckScreen />;
}
