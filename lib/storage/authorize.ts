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
 * Tables migrated to multi-tenant (have company_id column).
 * Any table listed here is NEVER eligible for standalone-legacy compatibility mode.
 * Phase 2 Batch 2: added 'vehicles'.
 */
export const TENANT_MIGRATED_TABLES: ReadonlySet<string> = new Set([
  'workers',
  'documents',
  'vehicles',
]);

/**
 * Standalone legacy tables — no company_id, no worker link.
 * Authorized via single-company compatibility mode only.
 * Phase 2 Batch 2: removed vehicles/vehicle_licenses/vehicle_insurances (migrated to Mode A/B-vehicle).
 * Batch 3: remove heavy_equipment/lifting_equipment when they gain company_id.
 */
export const STANDALONE_LEGACY_CONFIGS: ReadonlyArray<{
  table: string;
  urlColumns: readonly string[];
}> = [
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
 * B-vehicle) Vehicle-linked (vehicle_licenses, vehicle_insurances):
 *    ownership verified via vehicle_id IN (company vehicle IDs) chain.
 *
 * C) Standalone legacy (heavy_equipment, heavy_equipment_insurances,
 *    lifting_equipment): Compatibility mode — only allowed when exactly one
 *    active company exists AND the DB record is found.
 */
export async function authorizeStorageObjectAccess(
  params: AuthorizeStorageParams
): Promise<AuthorizeStorageResult> {
  const { companyId, path: rawPath, supabase } = params;

  const path = normalizeStoragePath(rawPath);
  if (!path) return { allowed: false, reason: 'invalid_path' };

  // ── Mode A: Tenant-migrated ──────────────────────────────────────────────
  // Fetch company workers (IDs + photo_url), documents, and vehicles in parallel.
  const [workersRes, docsRes, vehiclesRes] = await Promise.all([
    supabase.from('workers').select('id, photo_url').eq('company_id', companyId),
    supabase
      .from('documents')
      .select('id')
      .eq('file_url', path)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle(),
    supabase.from('vehicles').select('id, image_url').eq('company_id', companyId),
  ]);

  const companyWorkers: Array<{ id: string; photo_url: string | null }> =
    (workersRes as { data: Array<{ id: string; photo_url: string | null }> | null }).data ?? [];

  const companyVehicles: Array<{ id: string; image_url: string | null }> =
    (vehiclesRes as { data: Array<{ id: string; image_url: string | null }> | null }).data ?? [];

  if (companyWorkers.some(w => w.photo_url === path)) {
    return { allowed: true, entityType: 'workers' };
  }
  if ((docsRes as { data: unknown }).data) return { allowed: true, entityType: 'documents' };
  if (companyVehicles.some(v => v.image_url === path)) {
    return { allowed: true, entityType: 'vehicles' };
  }

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

  // ── Mode B-vehicle: Vehicle-linked (vehicle_licenses, vehicle_insurances) ─
  const vehicleIds = companyVehicles.map(v => v.id);

  if (vehicleIds.length > 0) {
    const vehicleChildChecks = await Promise.all([
      supabase.from('vehicle_licenses').select('id').eq('file_url', path)
        .in('vehicle_id', vehicleIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'vehicle_licenses' : null),
      supabase.from('vehicle_insurances').select('id').eq('file_url', path)
        .in('vehicle_id', vehicleIds).limit(1).maybeSingle()
        .then((r: { data: unknown }) => r.data ? 'vehicle_insurances' : null),
    ]);

    const vehicleChildHit = vehicleChildChecks.find(t => t !== null);
    if (vehicleChildHit) return { allowed: true, entityType: vehicleChildHit };
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
