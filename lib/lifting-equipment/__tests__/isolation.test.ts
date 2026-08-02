/**
 * Lifting Equipment Tenant Isolation — 24 scenarios
 *
 * Verifies the ownership-check patterns introduced in Phase 2 Batch 5:
 *
 *   Lifting equipment CRUD — company_id scoped read/write/delete
 *   Cross-FK               — subcontractor_id must belong to same company
 *   Storage                — lifting_equipment moved to Mode A (TENANT_MIGRATED_TABLES)
 *   STANDALONE_LEGACY      — STANDALONE_LEGACY_CONFIGS now empty
 *
 * These tests simulate the logic performed by the API route handlers without
 * requiring a live HTTP server. Each helper mirrors the exact query pattern
 * from the corresponding route file.
 */

import { describe, it, expect } from 'vitest';
import type { createServiceClient } from '@/lib/supabase/server';
import { TENANT_MIGRATED_TABLES, STANDALONE_LEGACY_CONFIGS } from '@/lib/storage/authorize';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LiftingEquipmentRow {
  id: string;
  company_id: string;
  description: string;
  subcontractor_id: string | null;
  image_url: string | null;
  inspection_file_url: string | null;
  is_archived: boolean;
}

interface SubcontractorRow {
  id: string;
  company_id: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPANY_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const COMPANY_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const COMPANY_C = 'cccccccc-0000-0000-0000-000000000003';

const LE_A1 = 'le111111-0000-0000-0000-000000000001';
const LE_A2 = 'le111111-0000-0000-0000-000000000002';
const LE_B1 = 'le222222-0000-0000-0000-000000000001';

const SUB_A1 = 'sub11111-0000-0000-0000-000000000001';
const SUB_B1 = 'sub22222-0000-0000-0000-000000000001';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildMockSupabase(
  equipment: LiftingEquipmentRow[],
  subcontractors: SubcontractorRow[]
): ReturnType<typeof createServiceClient> {
  return {
    from: (table: string) => {
      if (table === 'lifting_equipment') return buildLiftingChain(equipment);
      if (table === 'subcontractors')    return buildSubcontractorChain(subcontractors);
      return buildEmptyChain();
    },
  } as unknown as ReturnType<typeof createServiceClient>;
}

function buildLiftingChain(equipment: LiftingEquipmentRow[]) {
  const filters: Partial<Record<keyof LiftingEquipmentRow, unknown>> = {};

  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => { filters[col as keyof LiftingEquipmentRow] = val; return chain; },
    maybeSingle: () => {
      const row = equipment.find(e =>
        Object.entries(filters).every(([k, fv]) => e[k as keyof LiftingEquipmentRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
    single: () => {
      const row = equipment.find(e =>
        Object.entries(filters).every(([k, fv]) => e[k as keyof LiftingEquipmentRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: row ? null : { message: 'not found' } });
    },
    then: (resolve?: (r: { data: LiftingEquipmentRow[]; error: null }) => unknown) => {
      const rows = equipment.filter(e =>
        Object.entries(filters).every(([k, fv]) => e[k as keyof LiftingEquipmentRow] === fv)
      );
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return chain;
}

function buildSubcontractorChain(subcontractors: SubcontractorRow[]) {
  const filters: Partial<SubcontractorRow> = {};

  const chain = {
    select: () => chain,
    eq: (col: keyof SubcontractorRow, val: string) => { filters[col] = val; return chain; },
    maybeSingle: () => {
      const row = subcontractors.find(s =>
        Object.entries(filters).every(([k, fv]) => s[k as keyof SubcontractorRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
  };
  return chain;
}

function buildEmptyChain() {
  const chain = {
    select:      () => chain,
    eq:          () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve?: ((r: { data: unknown[]; error: null }) => unknown) | null) =>
      Promise.resolve({ data: [] as unknown[], error: null }).then(resolve),
  };
  return chain;
}

// ─── Helpers that mirror route logic ─────────────────────────────────────────

/** Mirror: GET /api/lifting-equipment — list scoped to company */
async function listEquipment(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string
): Promise<LiftingEquipmentRow[]> {
  const chain = supabase.from('lifting_equipment').select('*').eq('company_id', companyId).eq('is_archived', false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).then((r: { data: LiftingEquipmentRow[] }) => r);
  return data;
}

/** Mirror: ownership check used in GET/PATCH/DELETE /api/lifting-equipment/[id] */
async function equipmentOwnershipCheck(
  supabase: ReturnType<typeof createServiceClient>,
  equipmentId: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('lifting_equipment').select('id').eq('id', equipmentId).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null;
}

/** Mirror: subcontractor same-company check from POST/PATCH */
async function subcontractorBelongsToCompany(
  supabase: ReturnType<typeof createServiceClient>,
  subcontractorId: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('subcontractors').select('id').eq('id', subcontractorId).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const ALL_EQUIPMENT: LiftingEquipmentRow[] = [
  { id: LE_A1, company_id: COMPANY_A, description: 'חגורת הרמה A', subcontractor_id: SUB_A1,
    image_url: 'lifting-equipment/a1-img.jpg', inspection_file_url: 'lifting-equipment/a1-insp.pdf', is_archived: false },
  { id: LE_A2, company_id: COMPANY_A, description: 'שרשרת A', subcontractor_id: null,
    image_url: null, inspection_file_url: null, is_archived: true },
  { id: LE_B1, company_id: COMPANY_B, description: 'שאקל B', subcontractor_id: SUB_B1,
    image_url: null, inspection_file_url: null, is_archived: false },
];

const ALL_SUBCONTRACTORS: SubcontractorRow[] = [
  { id: SUB_A1, company_id: COMPANY_A },
  { id: SUB_B1, company_id: COMPANY_B },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 1–4: Lifting equipment list endpoint — company scoping
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 1: equipment list scoped to company A', () => {
  it('company A sees only its non-archived equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const rows = await listEquipment(supabase, COMPANY_A);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(LE_A1);
    expect(rows.every(e => e.company_id === COMPANY_A)).toBe(true);
    expect(rows.every(e => !e.is_archived)).toBe(true);
  });
});

describe('Scenario 2: equipment list scoped to company B', () => {
  it('company B sees only its own non-archived equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const rows = await listEquipment(supabase, COMPANY_B);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(LE_B1);
    expect(rows.every(e => e.company_id === COMPANY_B)).toBe(true);
  });
});

describe('Scenario 3: company list does not bleed across tenants', () => {
  it('company A list does not include company B equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const rows = await listEquipment(supabase, COMPANY_A);
    const ids = rows.map(r => r.id);
    expect(ids).not.toContain(LE_B1);
  });
});

describe('Scenario 4: company with no equipment returns empty list', () => {
  it('company C has no equipment and receives empty array', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const rows = await listEquipment(supabase, COMPANY_C);
    expect(rows).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 5–7: Single-item ownership check — own company
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 5: ownership check passes for own company', () => {
  it('company A can find its own equipment by id+company_id', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const found = await equipmentOwnershipCheck(supabase, LE_A1, COMPANY_A);
    expect(found).toBe(true);
  });
});

describe('Scenario 6: ownership check blocked — company B cannot access company A equipment', () => {
  it('company B ownership check fails for company A equipment (A→B cross-tenant)', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const found = await equipmentOwnershipCheck(supabase, LE_A1, COMPANY_B);
    expect(found).toBe(false);
  });
});

describe('Scenario 7: ownership check blocked — reverse cross-tenant', () => {
  it('company A ownership check fails for company B equipment (B→A cross-tenant)', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const found = await equipmentOwnershipCheck(supabase, LE_B1, COMPANY_A);
    expect(found).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 8–11: PATCH / DELETE ownership
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 8: non-existent ID returns false for any company', () => {
  it('ownership check returns false when ID does not exist', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const found = await equipmentOwnershipCheck(supabase, 'nonexistent-le-id', COMPANY_A);
    expect(found).toBe(false);
  });
});

describe('Scenario 9: PATCH ownership passes for own equipment', () => {
  it('company A can PATCH its own equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const canPatch = await equipmentOwnershipCheck(supabase, LE_A1, COMPANY_A);
    expect(canPatch).toBe(true);
  });
});

describe('Scenario 10: PATCH blocked for cross-company equipment', () => {
  it('company B cannot PATCH company A equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const canPatch = await equipmentOwnershipCheck(supabase, LE_A1, COMPANY_B);
    expect(canPatch).toBe(false);
  });
});

describe('Scenario 11: DELETE blocked for cross-company equipment', () => {
  it('company B cannot DELETE company A equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const canDelete = await equipmentOwnershipCheck(supabase, LE_A1, COMPANY_B);
    expect(canDelete).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 12–15: subcontractor_id cross-tenant enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 12: subcontractor from same company → allowed', () => {
  it('company A subcontractor belongs to company A', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const ok = await subcontractorBelongsToCompany(supabase, SUB_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 13: subcontractor from different company → rejected', () => {
  it('company A cannot assign company B subcontractor', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const ok = await subcontractorBelongsToCompany(supabase, SUB_B1, COMPANY_A);
    expect(ok).toBe(false);
  });
});

describe('Scenario 14: reverse cross-company subcontractor → rejected', () => {
  it('company B cannot assign company A subcontractor', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const ok = await subcontractorBelongsToCompany(supabase, SUB_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

describe('Scenario 15: non-existent subcontractor → rejected', () => {
  it('returns false for subcontractor ID that does not exist', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const ok = await subcontractorBelongsToCompany(supabase, 'nonexistent-sub', COMPANY_A);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 16–18: Additional isolation coverage
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 16: archived equipment excluded from list', () => {
  it('is_archived=true equipment (LE_A2) is not returned in list for company A', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const rows = await listEquipment(supabase, COMPANY_A);
    const ids = rows.map(r => r.id);
    expect(ids).not.toContain(LE_A2);
  });
});

describe('Scenario 17: company B equipment not returned for company A list', () => {
  it('full cross-company isolation — A list contains only A rows', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const rows = await listEquipment(supabase, COMPANY_A);
    expect(rows.every(r => r.company_id === COMPANY_A)).toBe(true);
  });
});

describe('Scenario 18: company A equipment not returned for company B list', () => {
  it('full cross-company isolation — B list contains only B rows', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const rows = await listEquipment(supabase, COMPANY_B);
    expect(rows.every(r => r.company_id === COMPANY_B)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 19–21: Ownership check completeness
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 19: company B can access its own equipment', () => {
  it('ownership check passes for company B accessing its own item', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const found = await equipmentOwnershipCheck(supabase, LE_B1, COMPANY_B);
    expect(found).toBe(true);
  });
});

describe('Scenario 20: both companies see their own subcontractors only', () => {
  it('company A sub check: A→A passes, A→B fails', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    expect(await subcontractorBelongsToCompany(supabase, SUB_A1, COMPANY_A)).toBe(true);
    expect(await subcontractorBelongsToCompany(supabase, SUB_B1, COMPANY_A)).toBe(false);
  });

  it('company B sub check: B→B passes, B→A fails', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    expect(await subcontractorBelongsToCompany(supabase, SUB_B1, COMPANY_B)).toBe(true);
    expect(await subcontractorBelongsToCompany(supabase, SUB_A1, COMPANY_B)).toBe(false);
  });
});

describe('Scenario 21: DELETE of own equipment passes ownership check', () => {
  it('company A can delete its own equipment LE_A1', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const canDelete = await equipmentOwnershipCheck(supabase, LE_A1, COMPANY_A);
    expect(canDelete).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 22–24: Storage authorization (TENANT_MIGRATED_TABLES)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 22: lifting_equipment in TENANT_MIGRATED_TABLES after Batch 5', () => {
  it('TENANT_MIGRATED_TABLES contains lifting_equipment', () => {
    expect(TENANT_MIGRATED_TABLES.has('lifting_equipment')).toBe(true);
  });

  it('TENANT_MIGRATED_TABLES still contains all Batch 1-4 tables', () => {
    expect(TENANT_MIGRATED_TABLES.has('workers')).toBe(true);
    expect(TENANT_MIGRATED_TABLES.has('documents')).toBe(true);
    expect(TENANT_MIGRATED_TABLES.has('vehicles')).toBe(true);
    expect(TENANT_MIGRATED_TABLES.has('heavy_equipment')).toBe(true);
    expect(TENANT_MIGRATED_TABLES.has('heavy_equipment_insurances')).toBe(true);
  });
});

describe('Scenario 23: lifting_equipment NOT in STANDALONE_LEGACY_CONFIGS', () => {
  it('lifting_equipment is not in standalone-legacy configs (migrated to Mode A)', () => {
    const tables = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(tables).not.toContain('lifting_equipment');
  });
});

describe('Scenario 24: STANDALONE_LEGACY_CONFIGS is now empty after Batch 5', () => {
  it('all legacy standalone tables have been migrated — list is empty', () => {
    expect(STANDALONE_LEGACY_CONFIGS).toHaveLength(0);
  });
});
