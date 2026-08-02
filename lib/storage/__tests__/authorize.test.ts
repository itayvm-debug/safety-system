/**
 * Storage authorization — 18 scenarios
 *
 * Covers:
 *   Mode A      — tenant-migrated tables (workers, documents, vehicles,
 *                 vehicle_licenses, vehicle_insurances, heavy_equipment,
 *                 heavy_equipment_insurances, lifting_equipment,
 *                 lifting_machine_appointments)
 *   Mode B      — worker-linked legacy tables (safety_briefings,
 *                 height_restrictions, professional_licenses, manager_licenses)
 *   Mode C      — standalone legacy tables (EMPTY after Batch 5)
 *   Path        — normalizeStoragePath validation
 *   Structural  — TENANT_MIGRATED_TABLES ∩ STANDALONE_LEGACY_CONFIGS = ∅
 *
 * Phase 2 Batch 2: vehicles moved from Mode C to Mode A.
 * Phase 2 Batch 3: vehicle_licenses/vehicle_insurances moved from Mode B-vehicle to Mode A.
 * Phase 2 Batch 4: heavy_equipment/heavy_equipment_insurances moved from Mode C to Mode A.
 * Phase 2 Batch 5: lifting_equipment moved from Mode C to Mode A. STANDALONE_LEGACY_CONFIGS now empty.
 * Phase 2 Batch 6: lifting_machine_appointments moved from Mode B to Mode A.
 *                  entity_notes added to TENANT_MIGRATED_TABLES (no storage files).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  authorizeStorageObjectAccess,
  normalizeStoragePath,
  TENANT_MIGRATED_TABLES,
  STANDALONE_LEGACY_CONFIGS,
} from '../authorize';
import type { createServiceClient } from '@/lib/supabase/server';

// ─── Mock factory ────────────────────────────────────────────────────────────

interface TableSetup {
  /** For list queries (workers, vehicles) — data array */
  list?:  unknown[];
  /** For maybeSingle queries — row or null */
  single?: unknown;
  /** For count queries */
  count?:  number;
}

/**
 * Build a mock Supabase client.
 *
 * Pass per-table configuration; tables not listed default to empty/null/0.
 * Pass an array of TableSetup for tables queried multiple times (e.g. heavy_equipment).
 */
function buildMockSupabase(
  tables: Record<string, TableSetup | TableSetup[]>
): ReturnType<typeof createServiceClient> {
  const callCounts: Record<string, number> = {};

  return {
    from: vi.fn().mockImplementation((tableName: string) => {
      const idx = callCounts[tableName] ?? 0;
      callCounts[tableName] = idx + 1;

      const raw = tables[tableName] ?? {};
      const setup: TableSetup = Array.isArray(raw)
        ? (raw[idx] ?? raw[raw.length - 1] ?? {})
        : raw;

      const { list = [], single = null, count: countVal = 0 } = setup;

      return {
        select: vi.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
          // Count query pattern
          if (opts?.count === 'exact') {
            return {
              eq: vi.fn().mockReturnValue(
                Promise.resolve({ count: countVal, data: null, error: null })
              ),
            };
          }

          // Standard chain — supports both direct await (workers, vehicles) and maybeSingle()
          const chain: Record<string, unknown> = {
            eq:          vi.fn().mockReturnThis(),
            in:          vi.fn().mockReturnThis(),
            limit:       vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: single, error: null }),
            then(
              onfulfilled?: ((v: { data: unknown[]; error: null }) => unknown) | null,
              onrejected?:  ((e: unknown) => unknown) | null
            ) {
              return Promise.resolve({ data: list, error: null }).then(onfulfilled, onrejected);
            },
            catch(onrejected?: ((e: unknown) => unknown) | null) {
              return Promise.resolve({ data: list, error: null }).catch(onrejected);
            },
          };
          return chain;
        }),
      };
    }),
  } as unknown as ReturnType<typeof createServiceClient>;
}

const COMPANY_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const COMPANY_B = 'bbbbbbbb-0000-0000-0000-000000000002';

// ─── Scenario 1: Worker photo_url match (Mode A) ─────────────────────────────

describe('Scenario 1: worker photo_url match → allowed', () => {
  it('returns allowed with entityType workers', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [{ id: 'w1', photo_url: 'photos/1234-abcd.jpg' }] },
      documents: { single: null },
      vehicles:  { list: [] },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'photos/1234-abcd.jpg',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('workers');
  });
});

// ─── Scenario 2: Document file_url match (Mode A) ───────────────────────────

describe('Scenario 2: document file_url match with company_id → allowed', () => {
  it('returns allowed with entityType documents', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: { id: 'd1' } },
      vehicles:  { list: [] },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'documents/1234-abcd.pdf',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('documents');
  });
});

// ─── Scenario 3: Document from another company → denied ──────────────────────

describe('Scenario 3: document path from another company → denied', () => {
  it('returns no_matching_record when company_id mismatch', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },   // company_id filter returned no row
      vehicles:  { list: [] },
      companies: { count: 1 },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_B,
      path: 'documents/1234-abcd.pdf',
      supabase,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('no_matching_record');
  });
});

// ─── Scenario 4: Safety briefing file via worker chain (Mode B) ──────────────

describe('Scenario 4: safety_briefings.file_url match via worker chain → allowed', () => {
  it('returns allowed with entityType safety_briefings', async () => {
    const supabase = buildMockSupabase({
      workers:          { list: [{ id: 'w1', photo_url: null }] },
      documents:        { single: null },
      vehicles:         { list: [] },
      safety_briefings: { single: { id: 'sb1' } },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'briefings/1234-abcd.pdf',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('safety_briefings');
  });
});

// ─── Scenario 5: Vehicle image_url match (Mode A — Batch 2) ──────────────────

describe('Scenario 5: vehicle image_url match via company vehicles list (Mode A) → allowed', () => {
  it('returns allowed with entityType vehicles', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },
      vehicles:  { list: [{ id: 'v1', image_url: 'vehicles/1234-abcd.jpg' }] },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'vehicles/1234-abcd.jpg',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('vehicles');
  });
});

// ─── Scenario 6: Vehicle license file via Mode A (Batch 3) ──────────────────

describe('Scenario 6: vehicle_license file_url matched via direct company_id (Mode A) → allowed', () => {
  it('returns allowed with entityType vehicle_licenses', async () => {
    const supabase = buildMockSupabase({
      workers:          { list: [] },
      documents:        { single: null },
      vehicles:         { list: [{ id: 'v1', image_url: null }] },
      // vehicle_licenses matches the path via direct company_id filter
      vehicle_licenses: { single: { id: 'vl1' } },
      vehicle_insurances: { single: null },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'vehicles/1704000000-abcdef12.pdf',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('vehicle_licenses');
  });
});

// ─── Scenario 7: Path not in any DB table → denied ───────────────────────────

describe('Scenario 7: path not in any DB table → denied', () => {
  it('returns no_matching_record', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },
      vehicles:  { list: [] },
      companies: { count: 1 },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'vehicles/orphan-1234.pdf',
      supabase,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('no_matching_record');
  });
});

// ─── Scenario 8: Multiple companies + heavy_equipment (Mode C) → denied ───────

describe('Scenario 8: multiple active companies + legacy table path → legacy_multi_company', () => {
  it('returns legacy_multi_company when count > 1 and path reaches Mode C', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },
      vehicles:  { list: [] },
      companies: { count: 2 },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'heavy-equipment/1234-abcd.jpg',  // Mode C table, blocked by 2 companies
      supabase,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('legacy_multi_company');
  });
});

// ─── Scenario 9: Path traversal patterns → denied ────────────────────────────

describe('Scenario 9: path traversal and null-byte patterns → invalid_path', () => {
  const cases = [
    '../etc/passwd',
    'documents/../../../etc/passwd',
    'vehicles/\0file.pdf',
    'documents/%2e%2e/secret.pdf',
    '%2e%2e%2fetc%2fpasswd',
  ];

  for (const badPath of cases) {
    it(`rejects: ${JSON.stringify(badPath)}`, async () => {
      const supabase = buildMockSupabase({});
      const result = await authorizeStorageObjectAccess({
        companyId: COMPANY_A,
        path: badPath,
        supabase,
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reason).toBe('invalid_path');
    });
  }
});

// ─── Scenario 10: Double-encoded traversal → denied ─────────────────────────

describe('Scenario 10: double-encoded path traversal → invalid_path', () => {
  it('rejects %252e%252e (double-encoded ..)', async () => {
    const supabase = buildMockSupabase({});
    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'documents%2F%252e%252e%2Fsecret.pdf',
      supabase,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('invalid_path');
  });

  it('accepts a legitimate percent-encoded path', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: { id: 'd1' } },
      vehicles:  { list: [] },
    });
    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'documents%2F1704000000-abcdef12.pdf',
      supabase,
    });
    expect(result.allowed).toBe(true);
  });
});

// ─── Scenario 11: heavy_equipment file via Mode A (Batch 4) ──────────────────

describe('Scenario 11: heavy_equipment image_url via direct company_id (Mode A) → allowed', () => {
  it('allows access to heavy_equipment file using Mode A company_id check', async () => {
    const supabase = buildMockSupabase({
      workers:                    { list: [] },
      documents:                  { single: null },
      vehicles:                   { list: [] },
      vehicle_licenses:           { single: null },
      vehicle_insurances:         { single: null },
      heavy_equipment:            { list: [{ id: 'he1', image_url: 'heavy-equipment/1704000000-abcdef12.jpg', license_file_url: null, inspection_file_url: null }] },
      heavy_equipment_insurances: { single: null },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'heavy-equipment/1704000000-abcdef12.jpg',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('heavy_equipment');
  });
});

// ─── Scenario 12: Structural integrity ───────────────────────────────────────

describe('Scenario 12: structural — TENANT_MIGRATED_TABLES ∩ STANDALONE_LEGACY_CONFIGS = ∅', () => {
  it('no table appears in both migrated and standalone lists', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    const overlap = standaloneNames.filter(t => TENANT_MIGRATED_TABLES.has(t));
    expect(overlap).toHaveLength(0);
  });

  it('vehicles is in TENANT_MIGRATED_TABLES (migrated in Batch 2)', () => {
    expect(TENANT_MIGRATED_TABLES.has('vehicles')).toBe(true);
  });

  it('vehicles is NOT in STANDALONE_LEGACY_CONFIGS (removed in Batch 2)', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(standaloneNames).not.toContain('vehicles');
  });

  it('normalizeStoragePath returns null for paths without a slash', () => {
    expect(normalizeStoragePath('nodirectory')).toBeNull();
  });

  it('normalizeStoragePath strips a leading slash', () => {
    expect(normalizeStoragePath('/documents/file.pdf')).toBe('documents/file.pdf');
  });

  it('normalizeStoragePath returns null for trailing slash', () => {
    expect(normalizeStoragePath('documents/')).toBeNull();
  });
});

// ─── Scenario 13: Vehicle image_url works with 2 companies (Mode A not blocked) ─

describe('Scenario 13: vehicle image_url still accessible with 2 active companies (Mode A)', () => {
  it('returns allowed — Mode A never checks company count', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },
      vehicles:  { list: [{ id: 'v1', image_url: 'vehicles/1234-abcd.jpg' }] },
      // companies count is irrelevant for Mode A — it never runs
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'vehicles/1234-abcd.jpg',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('vehicles');
  });
});

// ─── Scenario 14: Vehicle license from different company → denied ─────────────

describe('Scenario 14: vehicle_license path from a different company → denied', () => {
  it('returns no_matching_record when company_id mismatch in Mode A query', async () => {
    // Company B requests a path whose vehicle_license belongs to Company A.
    // Mode A: vehicle_licenses queried with company_id = Company B → mock returns null.
    // Mode B: workerIds = [] → skipped.
    // Mode C: count = 1, vehicle_licenses not in STANDALONE_LEGACY_CONFIGS → falls through.
    // Result: no_matching_record.
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },
      vehicles:  { list: [] },
      companies: { count: 1 },
      // vehicle_licenses not configured → mock returns null (wrong company_id filtered out)
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_B,
      path: 'vehicles/1704000000-abcdef12.pdf',
      supabase,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('no_matching_record');
  });
});

// ─── Scenario 15: Vehicle insurance via Mode A (Batch 3) ─────────────────────

describe('Scenario 15: vehicle_insurance file_url via direct company_id (Mode A) → allowed', () => {
  it('returns allowed with entityType vehicle_insurances', async () => {
    const supabase = buildMockSupabase({
      workers:            { list: [] },
      documents:          { single: null },
      vehicles:           { list: [{ id: 'v2', image_url: null }] },
      vehicle_licenses:   { single: null },
      vehicle_insurances: { single: { id: 'vi1' } },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'vehicles/1704000001-abcdef99.pdf',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('vehicle_insurances');
  });
});

// ─── Scenario 16: vehicle_licenses/insurances structural integrity (Batch 3) ──

describe('Scenario 16: vehicle child tables in TENANT_MIGRATED_TABLES (Batch 3)', () => {
  it('vehicle_licenses is NOT in standalone legacy', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(standaloneNames).not.toContain('vehicle_licenses');
  });

  it('vehicle_insurances is NOT in standalone legacy', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(standaloneNames).not.toContain('vehicle_insurances');
  });

  it('vehicle_licenses is in TENANT_MIGRATED_TABLES (migrated in Batch 3)', () => {
    expect(TENANT_MIGRATED_TABLES.has('vehicle_licenses')).toBe(true);
  });

  it('vehicle_insurances is in TENANT_MIGRATED_TABLES (migrated in Batch 3)', () => {
    expect(TENANT_MIGRATED_TABLES.has('vehicle_insurances')).toBe(true);
  });

  it('heavy_equipment is in TENANT_MIGRATED_TABLES (migrated in Batch 4)', () => {
    expect(TENANT_MIGRATED_TABLES.has('heavy_equipment')).toBe(true);
  });

  it('lifting_equipment is in TENANT_MIGRATED_TABLES (migrated in Batch 5)', () => {
    expect(TENANT_MIGRATED_TABLES.has('lifting_equipment')).toBe(true);
  });

  it('lifting_equipment is NOT in STANDALONE_LEGACY_CONFIGS (removed in Batch 5)', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(standaloneNames).not.toContain('lifting_equipment');
  });

  it('STANDALONE_LEGACY_CONFIGS is now empty (all legacy tables migrated)', () => {
    expect(STANDALONE_LEGACY_CONFIGS).toHaveLength(0);
  });

  it('lifting_machine_appointments is in TENANT_MIGRATED_TABLES (migrated in Batch 6)', () => {
    expect(TENANT_MIGRATED_TABLES.has('lifting_machine_appointments')).toBe(true);
  });

  it('entity_notes is in TENANT_MIGRATED_TABLES (migrated in Batch 6)', () => {
    expect(TENANT_MIGRATED_TABLES.has('entity_notes')).toBe(true);
  });

  it('lifting_machine_appointments is NOT in STANDALONE_LEGACY_CONFIGS', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(standaloneNames).not.toContain('lifting_machine_appointments');
  });
});

// ─── Scenario 17: lifting_equipment file via Mode A (Batch 5) ────────────────

describe('Scenario 17: lifting_equipment image_url via direct company_id (Mode A) → allowed', () => {
  it('allows access to lifting_equipment file using Mode A company_id check', async () => {
    const supabase = buildMockSupabase({
      workers:                    { list: [] },
      documents:                  { single: null },
      vehicles:                   { list: [] },
      vehicle_licenses:           { single: null },
      vehicle_insurances:         { single: null },
      heavy_equipment:            { list: [] },
      heavy_equipment_insurances: { single: null },
      lifting_equipment:          { list: [{ id: 'le1', image_url: 'lifting-equipment/1704000000-abcdef12.jpg', inspection_file_url: null }] },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'lifting-equipment/1704000000-abcdef12.jpg',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('lifting_equipment');
  });
});

// ─── Scenario 18: lifting_machine_appointments file via Mode A (Batch 6) ──────

describe('Scenario 18: lifting_machine_appointments pdf_url via direct company_id (Mode A) → allowed', () => {
  it('allows access to LMA pdf_url using Mode A company_id check', async () => {
    const supabase = buildMockSupabase({
      workers:                      { list: [] },
      documents:                    { single: null },
      vehicles:                     { list: [] },
      vehicle_licenses:             { single: null },
      vehicle_insurances:           { single: null },
      heavy_equipment:              { list: [] },
      heavy_equipment_insurances:   { single: null },
      lifting_equipment:            { list: [] },
      lifting_machine_appointments: { list: [{ id: 'lma-a1', operator_signature_url: null, appointer_signature_url: null, pdf_url: 'appointment-pdfs/lma-a1-1704000000.pdf' }] },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'appointment-pdfs/lma-a1-1704000000.pdf',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('lifting_machine_appointments');
  });

  it('allows access to LMA operator_signature_url using Mode A company_id check', async () => {
    const supabase = buildMockSupabase({
      workers:                      { list: [] },
      documents:                    { single: null },
      vehicles:                     { list: [] },
      vehicle_licenses:             { single: null },
      vehicle_insurances:           { single: null },
      heavy_equipment:              { list: [] },
      heavy_equipment_insurances:   { single: null },
      lifting_equipment:            { list: [] },
      lifting_machine_appointments: { list: [{ id: 'lma-a2', operator_signature_url: 'appointment-signatures/op-lma-a2.png', appointer_signature_url: null, pdf_url: null }] },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'appointment-signatures/op-lma-a2.png',
      supabase,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.entityType).toBe('lifting_machine_appointments');
  });

  it('denies access to LMA file belonging to a different company (empty list)', async () => {
    const supabase = buildMockSupabase({
      workers:                      { list: [] },
      documents:                    { single: null },
      vehicles:                     { list: [] },
      vehicle_licenses:             { single: null },
      vehicle_insurances:           { single: null },
      heavy_equipment:              { list: [] },
      heavy_equipment_insurances:   { single: null },
      lifting_equipment:            { list: [] },
      lifting_machine_appointments: { list: [] },
      companies:                    { count: 2 },
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'appointment-pdfs/lma-b1-1704000000.pdf',
      supabase,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('legacy_multi_company');
  });
});
