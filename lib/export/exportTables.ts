import { createServiceClient } from '@/lib/supabase/server';

export interface TableExport {
  table: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  exportedAt: string;
}

const EXPORT_TABLES = [
  'workers',
  'documents',
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

export type ExportTable = typeof EXPORT_TABLES[number];

export async function exportAllTables(): Promise<TableExport[]> {
  const supabase = createServiceClient();
  const exportedAt = new Date().toISOString();
  const results: TableExport[] = [];

  for (const table of EXPORT_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at' as never, { ascending: true })
      .limit(100_000);

    if (error) {
      // Soft fail per table — record error entry so manifest reflects it
      results.push({ table, rows: [], rowCount: -1, exportedAt });
      console.error(`[export] failed to export ${table}:`, error.message);
      continue;
    }

    results.push({ table, rows: data ?? [], rowCount: (data ?? []).length, exportedAt });
  }

  return results;
}

/** Convert table rows to JSONL (one JSON object per line) */
export function toJsonl(rows: Record<string, unknown>[]): Buffer {
  const lines = rows.map(r => JSON.stringify(r)).join('\n');
  return Buffer.from(lines, 'utf8');
}
