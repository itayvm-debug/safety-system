import { createServiceClient } from '@/lib/supabase/server';

export interface TableExport {
  table: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  exportedAt: string;
}

// Workers and documents are scoped to the requesting company.
const COMPANY_SCOPED_TABLES = ['workers', 'documents'] as const;

// These tables are not yet company-scoped (Phase 2 Batch 2+).
const GLOBAL_TABLES = [
  'vehicles',
  'vehicle_licenses',
  'vehicle_insurances',
  'heavy_equipment',
  'heavy_equipment_insurances',
  'lifting_equipment',
  'lifting_machine_appointments',
  'subcontractors',
  'safety_briefings',
  'height_restrictions',
  'entity_notes',
  'profiles',
  'authorized_phones',
  'legal_acceptances',
] as const;

export type ExportTable = typeof COMPANY_SCOPED_TABLES[number] | typeof GLOBAL_TABLES[number];

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

  for (const table of GLOBAL_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at' as never, { ascending: true })
      .limit(100_000);

    if (error) {
      results.push({ table, rows: [], rowCount: -1, exportedAt });
      console.error(`[export] failed to export ${table}:`, error.message);
      continue;
    }
    results.push({ table, rows: data ?? [], rowCount: (data ?? []).length, exportedAt });
  }

  return results;
}

export function toJsonl(rows: Record<string, unknown>[]): Buffer {
  const lines = rows.map(r => JSON.stringify(r)).join('\n');
  return Buffer.from(lines, 'utf8');
}
