/**
 * Storage authorization — 12 scenarios
 *
 * Covers:
 *   Mode A  — tenant-migrated tables (workers, documents)
 *   Mode B  — worker-linked legacy tables
 *   Mode C  — standalone legacy tables (single-company compatibility mode)
 *   Path    — normalizeStoragePath validation
 *   Structural — TENANT_MIGRATED_TABLES ∩ STANDALONE_LEGACY_CONFIGS = ∅
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
  /** For list queries (workers) — data array */
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

          // Standard chain — supports both direct await (workers) and maybeSingle()
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
  it('returns no_matching_record when documents query returns null due to company_id mismatch', async () => {
    // The DB record exists but has company_id = COMPANY_A.
    // The query filters by company_id = COMPANY_B → returns null.
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },    // mocked as if company_id filter returned no row
      companies: { count: 1 },
      // all standalone return null
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
      safety_briefings: { single: { id: 'sb1' } },   // first call: file_url match
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

// ─── Scenario 5: Vehicle image_url in single company (Mode C) ────────────────

describe('Scenario 5: vehicle image_url in single-company system → allowed', () => {
  it('returns allowed with entityType vehicles', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },
      companies: { count: 1 },
      vehicles:  { single: { id: 'v1' } },
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

// ─── Scenario 6: Vehicle license in single company (Mode C) ──────────────────

describe('Scenario 6: vehicle license file_url after Replace → View succeeds', () => {
  it('returns allowed with entityType vehicle_licenses', async () => {
    const supabase = buildMockSupabase({
      workers:          { list: [] },
      documents:        { single: null },
      companies:        { count: 1 },
      vehicles:         { single: null },          // image_url: no match
      vehicle_licenses: { single: { id: 'vl1' } }, // file_url: match (updated by Replace)
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

// ─── Scenario 7: Vehicle path not in any DB table → denied ───────────────────

describe('Scenario 7: path not in any DB table → denied', () => {
  it('returns no_matching_record', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },
      companies: { count: 1 },
      // all standalone tables return null (default)
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

// ─── Scenario 8: Multiple active companies → legacy denied ───────────────────

describe('Scenario 8: multiple active companies + legacy table → denied', () => {
  it('returns legacy_multi_company when count > 1', async () => {
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: null },
      companies: { count: 2 },   // two active companies → compatibility mode blocked
    });

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'vehicles/1234-abcd.jpg',
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
    'documents/%2e%2e/secret.pdf',  // decoded to documents/../secret.pdf
    '%2e%2e%2fetc%2fpasswd',        // decoded to ../../etc/passwd
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
    // Next.js decodes once: %252e → %2e → then our second decode: %2e → .
    // After both decodes: becomes "../.." — traversal detected.
    const supabase = buildMockSupabase({});
    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'documents%2F%252e%252e%2Fsecret.pdf',
      supabase,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('invalid_path');
  });

  it('accepts a legitimate path that contains percent-encoding', async () => {
    // e.g. "documents/1704000000-abcdef12.pdf" passed as
    // "documents%2F1704000000-abcdef12.pdf" (one layer encoded)
    const supabase = buildMockSupabase({
      workers:   { list: [] },
      documents: { single: { id: 'd1' } },
    });
    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: 'documents%2F1704000000-abcdef12.pdf',
      supabase,
    });
    // After decoding: "documents/1704000000-abcdef12.pdf" — valid
    expect(result.allowed).toBe(true);
  });
});

// ─── Scenario 11: No workers in company — worker-linked skipped (Mode C active) ─

describe('Scenario 11: company with no workers — Mode B skipped, Mode C used', () => {
  it('allows access to heavy_equipment file when company has no workers', async () => {
    const supabase = buildMockSupabase({
      workers:        { list: [] },   // no workers → Mode B entirely skipped
      documents:      { single: null },
      companies:      { count: 1 },
      heavy_equipment: [
        { single: { id: 'he1' } },   // first call: image_url match
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

// ─── Scenario 12: TENANT_MIGRATED_TABLES ∩ STANDALONE_LEGACY ─────────────────

describe('Scenario 12: structural — no table in both migrated and standalone lists', () => {
  it('TENANT_MIGRATED_TABLES and STANDALONE_LEGACY_CONFIGS are disjoint', () => {
    const standaloneNames = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    const overlap = standaloneNames.filter(t => TENANT_MIGRATED_TABLES.has(t));
    expect(overlap).toHaveLength(0);
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
