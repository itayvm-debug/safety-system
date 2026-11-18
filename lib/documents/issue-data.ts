/**
 * issue-data.ts — one loader for every screen that shows the issue list
 * (Dashboard, /issues). Before, each page wrote its own select, and the heavy
 * equipment select omitted heavy_equipment_insurances (P0·5), and query errors
 * were ignored so a failure rendered as "הכל תקין" (P1·7).
 *
 * The loader returns the exact shape the shared engines need, plus an explicit
 * `failed` / `truncated` state that callers must show instead of a green screen.
 */
import type { createServiceClient } from '@/lib/supabase/server';
import type { WorkerWithDocuments, Vehicle, HeavyEquipment, LiftingEquipment, EntityNote } from '@/types';

type Supabase = ReturnType<typeof createServiceClient>;

export const WORKER_ISSUE_SELECT =
  '*, documents(id,doc_type,file_url,expiry_date,is_required), safety_briefings(id,briefed_at,expires_at,created_at), height_restrictions(id,expires_at,created_at), lifting_machine_appointments(id), professional_licenses(id,file_url,expiry_date,license_type), manager_licenses(id,file_url,expiry_date,license_type), vehicles(id,vehicle_number,is_active,is_archived,vehicle_licenses(id,file_url,expiry_date),vehicle_insurances(id,insurance_type,file_url,expiry_date)), subcontractor:subcontractors!workers_subcontractor_id_fkey(id,name)';
export const VEHICLE_ISSUE_SELECT =
  '*, vehicle_licenses(id,file_url,expiry_date), vehicle_insurances(id,insurance_type,file_url,expiry_date), assigned_manager:workers!vehicles_assigned_manager_id_fkey(id,full_name)';
export const HEAVY_ISSUE_SELECT =
  '*, subcontractor:subcontractors(id,name), heavy_equipment_insurances(id,insurance_type,file_url,expiry_date)';
export const LIFTING_ISSUE_SELECT = '*, subcontractor:subcontractors(id,name)';

export interface IssueData {
  workers: WorkerWithDocuments[];
  vehicles: Vehicle[];
  heavy: HeavyEquipment[];
  lifting: LiftingEquipment[];
  notes: EntityNote[];
  subcontractors: Array<{ id: string; name: string }>;
  /** At least one query failed — the lists are incomplete and must not be shown as "all good". */
  failed: boolean;
  /** At least one list returned fewer rows than exist (PostgREST row cap). */
  truncated: boolean;
}

type ListResult = { data: unknown[] | null; error: unknown; count?: number | null };

export async function loadIssueData(supabase: Supabase, companyId: string): Promise<IssueData> {
  const results = (await Promise.all([
    supabase.from('workers').select(WORKER_ISSUE_SELECT, { count: 'exact' })
      .eq('company_id', companyId).eq('is_active', true).eq('is_archived', false),
    supabase.from('vehicles').select(VEHICLE_ISSUE_SELECT, { count: 'exact' })
      .eq('company_id', companyId).eq('is_active', true).eq('is_archived', false),
    supabase.from('heavy_equipment').select(HEAVY_ISSUE_SELECT, { count: 'exact' })
      .eq('company_id', companyId).eq('is_active', true).eq('is_archived', false),
    supabase.from('lifting_equipment').select(LIFTING_ISSUE_SELECT, { count: 'exact' })
      .eq('company_id', companyId).eq('is_active', true).eq('is_archived', false),
    supabase.from('entity_notes').select('*', { count: 'exact' })
      .eq('company_id', companyId).eq('status', 'needs_attention'),
    supabase.from('subcontractors').select('id, name', { count: 'exact' })
      .eq('company_id', companyId).eq('is_archived', false),
  ])) as unknown as ListResult[];

  const failed = results.some(r => Boolean(r.error));
  const truncated = results.some(r => typeof r.count === 'number' && r.count > (r.data?.length ?? 0));
  if (failed) console.error('[issue-data] one or more queries failed for the active company');

  const [w, v, h, l, n, s] = results.map(r => (r.data ?? []) as unknown[]);
  return {
    workers: w as WorkerWithDocuments[],
    vehicles: v as Vehicle[],
    heavy: h as HeavyEquipment[],
    lifting: l as LiftingEquipment[],
    notes: n as EntityNote[],
    subcontractors: s as Array<{ id: string; name: string }>,
    failed,
    truncated,
  };
}
