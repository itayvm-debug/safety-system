import { createServiceClient } from '@/lib/supabase/server';

export interface TableExport {
  table: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  exportedAt: string;
}

// Company-scoped tables: filtered by company_id.
// Phase 2 Batch 2 added subcontractors + vehicles.
// Phase 2 Batch 3 added vehicle_licenses + vehicle_insurances.
// Phase 2 Batch 4 added heavy_equipment + heavy_equipment_insurances.
// Phase 2 Batch 5 added lifting_equipment.
// Phase 2 Batch 6 added lifting_machine_appointments + entity_notes.
const COMPANY_SCOPED_TABLES = [
  'workers',
  'documents',
  'subcontractors',
  'vehicles',
  'vehicle_licenses',
  'vehicle_insurances',
  'heavy_equipment',
  'heavy_equipment_insurances',
  'lifting_equipment',
  'lifting_machine_appointments',
  'entity_notes',
] as const;

// Worker-scoped tables: no company_id column; filtered via worker_id IN (company worker IDs).
// Phase 2 Batch 6: moved from GLOBAL_TABLES + added professional/manager licenses.
const WORKER_SCOPED_TABLES = [
  'professional_licenses',
  'manager_licenses',
  'safety_briefings',
  'height_restrictions',
] as const;

// Member-scoped tables: filtered via company_members join.
// authorized_phones is PLATFORM-ONLY — excluded from company exports entirely.

export type ExportTable =
  | typeof COMPANY_SCOPED_TABLES[number]
  | typeof WORKER_SCOPED_TABLES[number]
  | 'profiles'
  | 'legal_acceptances';

export async function exportAllTables(companyId: string): Promise<TableExport[]> {
  const supabase = createServiceClient();
  const exportedAt = new Date().toISOString();
  const results: TableExport[] = [];

  for (const table of COMPANY_SCOPED_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('company_id', companyId)
      .order('created_at' as never, { ascending: true })
      .limit(100_000);

    if (error) {
      results.push({ table, rows: [], rowCount: -1, exportedAt });
      console.error(`[export] failed to export ${table}:`, error.message);
      continue;
    }
    results.push({ table, rows: data ?? [], rowCount: (data ?? []).length, exportedAt });
  }

  // Fetch company worker IDs for worker-scoped tables
  const { data: workerRows } = await supabase
    .from('workers')
    .select('id')
    .eq('company_id', companyId)
    .limit(100_000);

  const workerIds = (workerRows ?? []).map((w: { id: string }) => w.id);

  for (const table of WORKER_SCOPED_TABLES) {
    if (workerIds.length === 0) {
      results.push({ table, rows: [], rowCount: 0, exportedAt });
      continue;
    }

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .in('worker_id', workerIds)
      .order('created_at' as never, { ascending: true })
      .limit(100_000);

    if (error) {
      results.push({ table, rows: [], rowCount: -1, exportedAt });
      console.error(`[export] failed to export ${table}:`, error.message);
      continue;
    }
    results.push({ table, rows: data ?? [], rowCount: (data ?? []).length, exportedAt });
  }

  // Fetch company member user IDs for member-scoped tables (profiles, legal_acceptances).
  // authorized_phones is platform-only and is not exported per-company.
  const { data: memberRows } = await supabase
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .limit(100_000);

  const memberUserIds = (memberRows ?? []).map((m: { user_id: string }) => m.user_id);

  if (memberUserIds.length === 0) {
    results.push({ table: 'profiles', rows: [], rowCount: 0, exportedAt });
    results.push({ table: 'legal_acceptances', rows: [], rowCount: 0, exportedAt });
  } else {
    const [profilesRes, legalRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .in('id', memberUserIds)
        .order('created_at' as never, { ascending: true })
        .limit(100_000),
      supabase
        .from('legal_acceptances')
        .select('*')
        .in('user_id', memberUserIds)
        .order('created_at' as never, { ascending: true })
        .limit(100_000),
    ]);

    if (profilesRes.error) {
      results.push({ table: 'profiles', rows: [], rowCount: -1, exportedAt });
      console.error('[export] failed to export profiles:', profilesRes.error.message);
    } else {
      results.push({ table: 'profiles', rows: profilesRes.data ?? [], rowCount: (profilesRes.data ?? []).length, exportedAt });
    }

    if (legalRes.error) {
      results.push({ table: 'legal_acceptances', rows: [], rowCount: -1, exportedAt });
      console.error('[export] failed to export legal_acceptances:', legalRes.error.message);
    } else {
      results.push({ table: 'legal_acceptances', rows: legalRes.data ?? [], rowCount: (legalRes.data ?? []).length, exportedAt });
    }
  }

  return results;
}

export function toJsonl(rows: Record<string, unknown>[]): Buffer {
  const lines = rows.map(r => JSON.stringify(r)).join('\n');
  return Buffer.from(lines, 'utf8');
}
