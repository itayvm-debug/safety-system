import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { buildAllIssues } from '@/lib/documents/issues';
import { buildNoteIssues, buildEntityMap } from '@/lib/documents/notes';
import { loadIssueData } from '@/lib/documents/issue-data';
import IssuesList from '@/components/issues/IssuesList';

export const dynamic = 'force-dynamic';

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctxResult = await getCurrentCompanyContext();
  if (ctxResult.error) {
    if (ctxResult.code === 'NEEDS_COMPANY_SELECTION') redirect('/select-company');
    redirect('/login');
  }
  const { companyId } = ctxResult.context;

  const { status } = await searchParams;
  const supabase = createServiceClient();

  // Same loader as the Dashboard: includes heavy_equipment_insurances (P0·5) and
  // reports failures instead of showing "הכל תקין" (P1·7)
  const issueData = await loadIssueData(supabase, companyId);
  const { workers, vehicles, heavy, lifting } = issueData;
  const dataIncomplete = issueData.failed || issueData.truncated;

  const docIssues = buildAllIssues(workers, vehicles, heavy, lifting);
  const entityMap = buildEntityMap(workers, vehicles, heavy, lifting, issueData.subcontractors);
  const noteIssues = buildNoteIssues(issueData.notes, entityMap);
  const allIssues = [...docIssues, ...noteIssues];
  const urgentCount = allIssues.filter((i) => i.status !== 'expiring_soon').length;
  const expiringCount = allIssues.filter((i) => i.status === 'expiring_soon').length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">דורש טיפול</h1>
        <p className="text-sm text-gray-500 mt-1">
          {urgentCount > 0 && <span className="text-red-600 font-medium">{urgentCount} לא תקינים</span>}
          {urgentCount > 0 && expiringCount > 0 && <span className="text-gray-400"> · </span>}
          {expiringCount > 0 && <span className="text-orange-600 font-medium">{expiringCount} עומדים לפוג</span>}
          {urgentCount === 0 && expiringCount === 0 && !dataIncomplete && <span className="text-green-600 font-medium">הכל תקין</span>}
        </p>
      </div>

      {dataIncomplete && (
        <div role="alert" className="bg-red-50 border border-red-300 text-red-800 rounded-xl px-4 py-3 mb-6 text-sm">
          <p className="font-semibold">{issueData.failed ? 'לא ניתן לטעון את כל נתוני הסטטוס' : 'הוצגו רק חלק מהרשומות'}</p>
          <p className="text-xs text-red-600 mt-0.5">הרשימה אינה מלאה ואין להסתמך עליה. רענן את העמוד, ואם הבעיה חוזרת פנה למנהל המערכת.</p>
        </div>
      )}

      <IssuesList issues={allIssues} initialStatus={status} />
    </div>
  );
}
