import { redirect } from 'next/navigation';
import { requirePageCompanyAdminRole } from '@/lib/auth/company-context';
import GroupBriefingFlow from '@/components/briefings/GroupBriefingFlow';

export const dynamic = 'force-dynamic';

/** Group safety briefing — company admins / owners (the same role that records a briefing). */
export default async function GroupBriefingPage() {
  const ctxResult = await requirePageCompanyAdminRole();
  if (ctxResult.error) {
    if (ctxResult.code === 'NEEDS_COMPANY_SELECTION') redirect('/select-company');
    if (ctxResult.code === 'FORBIDDEN_ROLE') redirect('/workers');
    redirect('/login');
  }
  return <GroupBriefingFlow />;
}
