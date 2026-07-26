import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { WorkerWithDocuments, Vehicle, HeavyEquipment, LiftingEquipment } from '@/types';
import { buildAllIssues } from '@/lib/documents/issues';
import { buildNoteIssues, buildEntityMap } from '@/lib/documents/notes';
import IssuesList from '@/components/issues/IssuesList';

export const dynamic = 'force-dynamic';

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctxResult = await getCurrentCompanyContext();
  if (ctxResult.error) redirect('/login');
  const { companyId } = ctxResult.context;

  const { status } = await searchParams;
  const supabase = createServiceClient();

  const [
    { data: workersRaw },
    { data: vehiclesRaw },
    { data: heavyRaw },
    { data: liftingRaw },
    { data: notesRaw },
    { data: subcontractorsRaw },
  ] = await Promise.all([
    supabase
      .from('workers')
      .select(`*, documents(id,doc_type,file_url,expiry_date,is_required), safety_briefings(id,expires_at,created_at), height_restrictions(id,expires_at,created_at), lifting_machine_appointments(id), professional_licenses(id,file_url,expiry_date,license_type), manager_licenses(id,file_url,expiry_date,license_type), vehicles(id,vehicle_number,vehicle_licenses(id,file_url,expiry_date),vehicle_insurances(id,insurance_type,file_url,expiry_date)), subcontractor:subcontractors!workers_subcontractor_id_fkey(id,name)`)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('is_archived', false),
    supabase
      .from('vehicles')
      .select(`*, vehicle_licenses(id,file_url,expiry_date), vehicle_insurances(id,insurance_type,file_url,expiry_date), assigned_manager:workers!vehicles_assigned_manager_id_fkey(id,full_name)`)
      .eq('is_active', true)
      .eq('is_archived', false),
    supabase
      .from('heavy_equipment')
      .select('*, subcontractor:subcontractors(id,name)')
      .eq('is_active', true)
      .eq('is_archived', false),
    supabase
      .from('lifting_equipment')
      .select('*, subcontractor:subcontractors(id,name)')
      .eq('is_active', true)
      .eq('is_archived', false),
    supabase
      .from('entity_notes')
      .select('*')
      .eq('status', 'needs_attention'),
    supabase
      .from('subcontractors')
      .select('id, name')
      .eq('is_archived', false),
  ]);

  const workers = (workersRaw ?? []) as WorkerWithDocuments[];
  const vehicles = (vehiclesRaw ?? []) as Vehicle[];
  const heavy = (heavyRaw ?? []) as HeavyEquipment[];
  const lifting = (liftingRaw ?? []) as LiftingEquipment[];

  const docIssues = buildAllIssues(workers, vehicles, heavy, lifting);
  const entityMap = buildEntityMap(workers, vehicles, heavy, lifting, subcontractorsRaw ?? []);
  const noteIssues = buildNoteIssues(notesRaw ?? [], entityMap);
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
          {urgentCount === 0 && expiringCount === 0 && <span className="text-green-600 font-medium">הכל תקין</span>}
        </p>
      </div>

      <IssuesList issues={allIssues} initialStatus={status} />
    </div>
  );
}
