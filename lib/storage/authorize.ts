import { createServiceClient } from '@/lib/supabase/server';

export interface AuthorizeStorageParams {
  companyId: string;
  path:      string;
  supabase:  ReturnType<typeof createServiceClient>;
}

export type StorageDenyReason =
  | 'invalid_path'
  | 'no_matching_record'
  | 'legacy_multi_company';

export type AuthorizeStorageResult =
  | { allowed: true;  entityType: string }
  | { allowed: false; reason: StorageDenyReason };

/**
 * Tables migrated to multi-tenant in Batch 1 (have company_id column).
 * Add entries here when a future batch migrates additional tables.
 * Any table listed here is NEVER eligible for standalone-legacy compatibility mode.
 */
export const TENANT_MIGRATED_TABLES: ReadonlySet<string> = new Set([
  'workers',
  'documents',
]);

/**
 * Standalone legacy tables — no company_id, no worker link.
 * Authorized via single-company compatibility mode only.
 * When a table gains company_id in a future batch: remove it from this list
 * and add it to Mode A (direct company_id check) in the function below.
 */
export const STANDALONE_LEGACY_CONFIGS: ReadonlyArray<{
  table: string;
  urlColumns: readonly string[];
}> = [
  { table: 'vehicles',                   urlColumns: ['image_url'] },
  { table: 'vehicle_licenses',           urlColumns: ['file_url'] },
  { table: 'vehicle_insurances',         urlColumns: ['file_url'] },
  { table: 'heavy_equipment',            urlColumns: ['image_url', 'license_file_url', 'insurance_file_url', 'inspection_file_url'] },
  { table: 'heavy_equipment_insurances', urlColumns: ['file_url'] },
  { table: 'lifting_equipment',          urlColumns: ['image_url', 'inspection_file_url'] },
];

/**
 * Validate and normalize a storage path from a client request.
 *
 * Next.js URL-decodes searchParams once; this adds a second pass to catch
 * double-encoded traversal sequences, strips leading slashes, and rejects
 * control characters and ".." sequences.
 */
export function normalizeStoragePath(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let p = raw.trim();

  // Decode until stable — catches any number of encoding layers (%252e%252e → %2e%2e → ..)
  while (p.includes('%')) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(p);
    } catch {
      return null;
    }
    if (decoded === p) break;
    p = decoded;
  }

  p = p.replace(/^\/+/, '');

  if (/[\x00-\x1f]/.test(p)) return null;
  if (p.includes('..')) return null;
  if (!p.includes('/') || p.endsWith('/')) return null;

  return p;
}

/**
 * Central storage authorization helper.
 *
 * Authorization modes:
 *
 * A) Tenant-migrated (workers, documents): path verified via company_id column.
 *
 * B) Worker-linked legacy (safety_briefings, height_restrictions,
 *    professional_licenses, manager_licenses, lifting_machine_appointments):
 *    ownership verified via worker_id → workers.company_id chain.
 *
 * C) Standalone legacy (vehicles, vehicle_licenses, vehicle_insurances,
 *    heavy_equipment, heavy_equipment_insurances, lifting_equipment):
 *    Compatibility mode — only allowed when exactly one active company exists
 *    AND the DB record is found. Auto-disabled per-table when that table gains
 *    company_id: remove from STANDALONE_LEGACY_CONFIGS and add to Mode A/B.
 */
export async function authorizeStorageObjectAccess(
  params: AuthorizeStorageParams
): Promise<AuthorizeStorageResult> {
  const { companyId, path: rawPath, supabase } = params;

  const path = normalizeStoragePath(rawPath);
  if (!path) return { allowed: false, reason: 'invalid_path' };

  // ── Mode A: Tenant-migrated ──────────────────────────────────────────────
  // Fetch company workers (IDs + photo_url) and check documents in parallel.
  const [workersRes, docsRes] = await Promise.all([
    supabase.from('workers').select('id, photo_url').eq('company_id', companyId),
    supabase
      .from('documents')
      .select('id')
      .eq('file_url', path)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle(),
  ]);

  const companyWorkers: Array<{ id: string; photo_url: string | null }> =
    (workersRes as { data: Array<{ id: string; photo_url: string | null }> | null }).data ?? [];

  if (companyWorkers.some(w => w.photo_url === path)) {
    return { allowed: true, entityType: 'workers' };
  }
  if ((docsRes as { data: unknown }).data) return { allowed: true, entityType: 'documents' };

  // ── Mode B: Worker-linked legacy ─────────────────────────────────────────
  const workerIds = companyWorkers.map(w => w.id);

  if (workerIds.length > 0) {
    const workerLinkedChecks = await Promise.all([
      supabase.from('safety_briefings').select('id').eq('file_url', path)
        .in('worker_id', workerIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'safety_briefings' : null),
      supabase.from('safety_briefings').select('id').eq('signature_url', path)
        .in('worker_id', workerIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'safety_briefings' : null),
      supabase.from('height_restrictions').select('id').eq('file_url', path)
        .in('worker_id', workerIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'height_restrictions' : null),
      supabase.from('height_restrictions').select('id').eq('signature_url', path)
        .in('worker_id', workerIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'height_restrictions' : null),
      supabase.from('professional_licenses').select('id').eq('file_url', path)
        .in('worker_id', workerIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'professional_licenses' : null),
      supabase.from('manager_licenses').select('id').eq('file_url', path)
        .in('worker_id', workerIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'manager_licenses' : null),
      supabase.from('lifting_machine_appointments').select('id').eq('pdf_url', path)
        .in('worker_id', workerIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'lifting_machine_appointments' : null),
      supabase.from('lifting_machine_appointments').select('id').eq('operator_signature_url', path)
        .in('worker_id', workerIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'lifting_machine_appointments' : null),
      supabase.from('lifting_machine_appointments').select('id').eq('appointer_signature_url', path)
        .in('worker_id', workerIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'lifting_machine_appointments' : null),
    ]);

    const workerLinkedHit = workerLinkedChecks.find(t => t !== null);
    if (workerLinkedHit) return { allowed: true, entityType: workerLinkedHit };
  }

  // ── Mode C: Standalone legacy — compatibility mode ────────────────────────
  // Guard: reject when more than one active company exists.
  // Single-company assumption makes DB record existence sufficient for ownership.
  const companiesRes = await (
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true) as unknown as Promise<{ count: number | null }>
  );

  if ((companiesRes.count ?? 0) !== 1) {
    return { allowed: false, reason: 'legacy_multi_company' };
  }

  // User is already verified as member of companyId (via getCurrentCompanyContext).
  // With one active company, record existence proves ownership.
  const standaloneChecks = await Promise.all(
    STANDALONE_LEGACY_CONFIGS.flatMap(({ table, urlColumns }) =>
      urlColumns.map(col =>
        supabase
          .from(table)
          .select('id')
          .eq(col, path)
          .limit(1)
          .maybeSingle()
          .then((r: { data: unknown }) => r.data ? table : null)
      )
    )
  );

  const standaloneHit = standaloneChecks.find(t => t !== null);
  if (standaloneHit) return { allowed: true, entityType: standaloneHit };

  return { allowed: false, reason: 'no_matching_record' };
}
