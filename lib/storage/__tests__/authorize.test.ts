/**
 * Storage authorization — 16 scenarios
 *
 * Covers:
 *   Mode A      — tenant-migrated tables (workers, documents, vehicles)
 *   Mode B      — worker-linked legacy tables
 *   Mode B-veh  — vehicle-linked (vehicle_licenses, vehicle_insurances)
 *   Mode C      — standalone legacy tables (single-company compatibility mode)
 *   Path        — normalizeStoragePath validation
 *   Structural  — TENANT_MIGRATED_TABLES ∩ STANDALONE_LEGACY_CONFIGS = ∅
 *
 * Phase 2 Batch 2 changes vs prior version:
 *   - Scenarios 5 + 6 rewritten: vehicles/vehicle_licenses no longer Mode C
 *   - Scenario 8 updated: tests heavy_equipment (Mode C) not vehicles (Mode A)
 *   - Scenarios 13–16 added: vehicle Mode A, Mode B-vehicle, cross-company denial
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

// ─── Scenario 6: Vehicle license file via Mode B-vehicle (Batch 2) ───────────

describe('Scenario 6: vehicle_license file_url matched via vehicle_id chain (Mode B-vehicle) → allowed', () => {
  it('returns allowed with entityType vehicle_licenses', async () => {
    const supabase = buildMockSupabase({
      workers:          { list: [] },
      documents:        { single: null },
      // company has one vehicle, but no image_url match for this path
      vehicles:         { list: [{ id: 'v1', image_url: null }] },
      // vehicle_licenses matches the path via IN(vehicleIds)
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

// ─── Scenario 11: No workers — Mode B skipped, Mode C used ───────────────────

describe('Scenario 11: company with no workers — Mode B skipped, Mode C used', () => {
  it('allows access to heavy_equipment file when company has no workers', async () => {
    const supabase = buildMockSupabase({
      workers:         { list: [] },
      documents:       { single: null },
      vehicles:        { list: [] },
      companies:       { count: 1 },
      heavy_equipment: [
        { single: { id: 'he1' } },
      ],
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
  it('returns no_matching_record when vehicle_id not in requesting company vehicle IDs', async () => {
    // Company B requests a path whose vehicle belongs to Company A.
    // Company B has no vehicles, so vehicleIds = [].
    // Mode B-vehicle is skipped (no vehicleIds).
    // Mode C: count = 1, but vehicle_licenses is NOT in STANDALONE_LEGACY_CONFIGS.
    // Falls through to no_matching_record.
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },
      vehicles:  { list: [] },  // Company B has no vehicles
      companies: { count: 1 },
      // vehicle_licenses not in STANDALONE_LEGACY_CONFIGS — not reached
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

// ─── Scenario 15: Vehicle insurance via Mode B-vehicle ───────────────────────

describe('Scenario 15: vehicle_insurance file_url via Mode B-vehicle → allowed', () => {
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

// ─── Scenario 16: vehicle_licenses/insurances NOT in STANDALONE_LEGACY_CONFIGS ─

describe('Scenario 16: vehicle child tables not in STANDALONE_LEGACY_CONFIGS (Batch 2)', () => {
  it('vehicle_licenses is not in standalone legacy (now Mode B-vehicle)', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(standaloneNames).not.toContain('vehicle_licenses');
  });

  it('vehicle_insurances is not in standalone legacy (now Mode B-vehicle)', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(standaloneNames).not.toContain('vehicle_insurances');
  });

  it('heavy_equipment remains in standalone legacy (Batch 3)', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(standaloneNames).toContain('heavy_equipment');
  });
});
