/**
 * Heavy Equipment + Insurances Tenant Isolation — 24 scenarios
 *
 * Verifies the ownership-check patterns introduced in Phase 2 Batch 4:
 *
 *   Heavy equipment CRUD — company_id scoped read/write/delete
 *   Duplicate gate        — per-company license_number uniqueness
 *   Cross-FK              — subcontractor_id must belong to same company
 *   Child table           — heavy_equipment_insurances via parent-equipment ownership
 *   Storage               — heavy_equipment moved to Mode A (TENANT_MIGRATED_TABLES)
 *
 * These tests simulate the logic performed by the API route handlers without
 * requiring a live HTTP server. Each helper mirrors the exact query pattern
 * from the corresponding route file.
 */

import { describe, it, expect } from 'vitest';
import type { createServiceClient } from '@/lib/supabase/server';
import { TENANT_MIGRATED_TABLES, STANDALONE_LEGACY_CONFIGS } from '@/lib/storage/authorize';

// ─── Types ───────────────────────────────────────────────────────────────────

interface HeavyEquipmentRow {
  id: string;
  company_id: string;
  description: string;
  license_number: string | null;
  subcontractor_id: string | null;
  image_url: string | null;
  license_file_url: string | null;
  inspection_file_url: string | null;
}

interface SubcontractorRow {
  id: string;
  company_id: string;
}

interface HeavyEquipmentInsuranceRow {
  id: string;
  heavy_equipment_id: string;
  company_id: string;
  insurance_type: string;
  file_url: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPANY_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const COMPANY_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const HE_A1 = 'he111111-0000-0000-0000-000000000001';
const HE_B1 = 'he222222-0000-0000-0000-000000000001';

const SUB_A1 = 'sub11111-0000-0000-0000-000000000001';
const SUB_B1 = 'sub22222-0000-0000-0000-000000000001';

const INS_A1 = 'ins11111-0000-0000-0000-000000000001';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildMockSupabase(
  equipment: HeavyEquipmentRow[],
  subcontractors: SubcontractorRow[],
  insurances: HeavyEquipmentInsuranceRow[] = []
): ReturnType<typeof createServiceClient> {
  return {
    from: (table: string) => {
      if (table === 'heavy_equipment') return buildEquipmentChain(equipment);
      if (table === 'subcontractors')  return buildSubcontractorChain(subcontractors);
      if (table === 'heavy_equipment_insurances') return buildInsuranceChain(insurances);
      return buildEmptyChain();
    },
  } as unknown as ReturnType<typeof createServiceClient>;
}

function buildEquipmentChain(equipment: HeavyEquipmentRow[]) {
  const filters: Partial<HeavyEquipmentRow> = {};
  let excludeId: string | null = null;

  const chain = {
    select: () => chain,
    eq:   (col: keyof HeavyEquipmentRow, val: string) => { filters[col] = val as never; return chain; },
    neq:  (_col: string, val: string)                 => { excludeId = val; return chain; },
    maybeSingle: () => {
      const row = equipment.find(e =>
        Object.entries(filters).every(([k, fv]) => e[k as keyof HeavyEquipmentRow] === fv) &&
        (excludeId === null || e.id !== excludeId)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
    single: () => {
      const row = equipment.find(e =>
        Object.entries(filters).every(([k, fv]) => e[k as keyof HeavyEquipmentRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: row ? null : { message: 'not found' } });
    },
    then: (resolve?: (r: { data: HeavyEquipmentRow[]; error: null }) => unknown) => {
      const rows = equipment.filter(e =>
        Object.entries(filters).every(([k, fv]) => e[k as keyof HeavyEquipmentRow] === fv)
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
    eq:   (col: keyof SubcontractorRow, val: string) => { filters[col] = val as never; return chain; },
    maybeSingle: () => {
      const row = subcontractors.find(s =>
        Object.entries(filters).every(([k, fv]) => s[k as keyof SubcontractorRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
  };
  return chain;
}

function buildInsuranceChain(insurances: HeavyEquipmentInsuranceRow[]) {
  const filters: Partial<HeavyEquipmentInsuranceRow> = {};

  const chain = {
    select: () => chain,
    eq:   (col: keyof HeavyEquipmentInsuranceRow, val: string) => { filters[col] = val as never; return chain; },
    maybeSingle: () => {
      const row = insurances.find(i =>
        Object.entries(filters).every(([k, fv]) => i[k as keyof HeavyEquipmentInsuranceRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
    then: (resolve?: (r: { data: HeavyEquipmentInsuranceRow[]; error: null }) => unknown) => {
      const rows = insurances.filter(i =>
        Object.entries(filters).every(([k, fv]) => i[k as keyof HeavyEquipmentInsuranceRow] === fv)
      );
      return Promise.resolve({ data: rows, error: null }).then(resolve);
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

/** Mirror: GET /api/heavy-equipment — list scoped to company */
async function listEquipment(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string
): Promise<HeavyEquipmentRow[]> {
  const chain = supabase.from('heavy_equipment').select('*').eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).then((r: { data: HeavyEquipmentRow[] }) => r);
  return data;
}

/** Mirror: GET/PATCH/DELETE /api/heavy-equipment/[id] ownership check */
async function equipmentOwnershipCheck(
  supabase: ReturnType<typeof createServiceClient>,
  equipmentId: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('heavy_equipment').select('id').eq('id', equipmentId).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null;
}

/** Mirror: POST /api/heavy-equipment duplicate check (per-company) */
async function equipmentDuplicateCheck(
  supabase: ReturnType<typeof createServiceClient>,
  licenseNumber: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('heavy_equipment').select('id').eq('company_id', companyId).eq('license_number', licenseNumber);
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

/** Mirror: GET /api/heavy-equipment-insurances?heavy_equipment_id= parent ownership check */
async function insuranceParentOwnershipCheck(
  supabase: ReturnType<typeof createServiceClient>,
  heavyEquipmentId: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('heavy_equipment').select('id').eq('id', heavyEquipmentId).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null;
}

/** Mirror: PATCH/DELETE /api/heavy-equipment-insurances/[id] — direct company_id check */
async function insuranceDirectOwnershipCheck(
  supabase: ReturnType<typeof createServiceClient>,
  insuranceId: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('heavy_equipment_insurances').select('id').eq('id', insuranceId).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const ALL_EQUIPMENT: HeavyEquipmentRow[] = [
  { id: HE_A1, company_id: COMPANY_A, description: 'מחפר A', license_number: 'HL-001', subcontractor_id: SUB_A1,
    image_url: 'heavy-equipment/a1-img.jpg', license_file_url: 'heavy-equipment/a1-lic.pdf', inspection_file_url: null },
  { id: HE_B1, company_id: COMPANY_B, description: 'מנוף B',  license_number: 'HL-001', subcontractor_id: SUB_B1,
    image_url: null, license_file_url: null, inspection_file_url: null },
];

const ALL_SUBCONTRACTORS: SubcontractorRow[] = [
  { id: SUB_A1, company_id: COMPANY_A },
  { id: SUB_B1, company_id: COMPANY_B },
];

const ALL_INSURANCES: HeavyEquipmentInsuranceRow[] = [
  { id: INS_A1, heavy_equipment_id: HE_A1, company_id: COMPANY_A, insurance_type: 'ביטוח חובה', file_url: 'heavy-equipment/a1-ins.pdf' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 1–4: Heavy equipment list & ownership scoping
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 1: equipment list scoped to company A', () => {
  it('company A sees only its own equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const rows = await listEquipment(supabase, COMPANY_A);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(HE_A1);
    expect(rows.every(e => e.company_id === COMPANY_A)).toBe(true);
  });
});

describe('Scenario 2: equipment list scoped to company B', () => {
  it('company B sees only its own equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const rows = await listEquipment(supabase, COMPANY_B);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(HE_B1);
  });
});

describe('Scenario 3: ownership check passes for own company', () => {
  it('company A can find its own equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const found = await equipmentOwnershipCheck(supabase, HE_A1, COMPANY_A);
    expect(found).toBe(true);
  });
});

describe('Scenario 4: ownership check fails for different company', () => {
  it('company B cannot find company A equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const found = await equipmentOwnershipCheck(supabase, HE_A1, COMPANY_B);
    expect(found).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 5–7: Reverse ownership — company A cannot access company B
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 5: company A cannot access company B equipment', () => {
  it('ownership check returns false (A→B)', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const found = await equipmentOwnershipCheck(supabase, HE_B1, COMPANY_A);
    expect(found).toBe(false);
  });
});

describe('Scenario 6: non-existent equipment ID returns false', () => {
  it('returns false for ID not in any company', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const found = await equipmentOwnershipCheck(supabase, 'nonexistent-id', COMPANY_A);
    expect(found).toBe(false);
  });
});

describe('Scenario 7: DELETE blocked for cross-company equipment', () => {
  it('company B cannot delete company A equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const canDelete = await equipmentOwnershipCheck(supabase, HE_A1, COMPANY_B);
    expect(canDelete).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 8–11: license_number duplicate gate (per-company)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 8: same license_number in same company → duplicate detected', () => {
  it('duplicate check returns true (conflict)', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const isDuplicate = await equipmentDuplicateCheck(supabase, 'HL-001', COMPANY_A);
    expect(isDuplicate).toBe(true);
  });
});

describe('Scenario 9: same license_number in different company → no conflict', () => {
  it('company C registering HL-001 does not conflict with company A', async () => {
    const COMPANY_C = 'cccccccc-0000-0000-0000-000000000003';
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const isDuplicate = await equipmentDuplicateCheck(supabase, 'HL-001', COMPANY_C);
    expect(isDuplicate).toBe(false);
  });
});

describe('Scenario 10: both companies can have same license_number', () => {
  it('HL-001 exists legitimately in both companies', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const dupInA = await equipmentDuplicateCheck(supabase, 'HL-001', COMPANY_A);
    const dupInB = await equipmentDuplicateCheck(supabase, 'HL-001', COMPANY_B);
    expect(dupInA).toBe(true);
    expect(dupInB).toBe(true);
  });
});

describe('Scenario 11: different license_number in same company → no conflict', () => {
  it('HL-999 not in company A → no duplicate', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const isDuplicate = await equipmentDuplicateCheck(supabase, 'HL-999', COMPANY_A);
    expect(isDuplicate).toBe(false);
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
  it('company A cannot use company B subcontractor', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const ok = await subcontractorBelongsToCompany(supabase, SUB_B1, COMPANY_A);
    expect(ok).toBe(false);
  });
});

describe('Scenario 14: reverse cross-company subcontractor → rejected', () => {
  it('company B cannot use company A subcontractor', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const ok = await subcontractorBelongsToCompany(supabase, SUB_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

describe('Scenario 15: non-existent subcontractor → rejected', () => {
  it('returns false for subcontractor ID not in any company', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS);
    const ok = await subcontractorBelongsToCompany(supabase, 'nonexistent-sub', COMPANY_A);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 16–19: heavy_equipment_insurances — parent ownership chain
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 16: GET insurances — parent equipment belongs to company', () => {
  it('company A can list insurances of its own equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS, ALL_INSURANCES);
    const ok = await insuranceParentOwnershipCheck(supabase, HE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 17: GET insurances — parent equipment from different company', () => {
  it('company B cannot list insurances of company A equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS, ALL_INSURANCES);
    const ok = await insuranceParentOwnershipCheck(supabase, HE_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

describe('Scenario 18: POST insurance — parent equipment belongs to company', () => {
  it('company A can add insurance to its own equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS, ALL_INSURANCES);
    const ok = await insuranceParentOwnershipCheck(supabase, HE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 19: POST insurance — parent equipment from different company', () => {
  it('company B cannot add insurance to company A equipment', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS, ALL_INSURANCES);
    const ok = await insuranceParentOwnershipCheck(supabase, HE_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 20–22: heavy_equipment_insurances [id] — direct company_id check
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 20: PATCH/DELETE insurance — direct company_id check passes', () => {
  it('company A can modify its own insurance (insurance.company_id = A)', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS, ALL_INSURANCES);
    const ok = await insuranceDirectOwnershipCheck(supabase, INS_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 21: PATCH/DELETE insurance — cross-company direct check denied', () => {
  it('company B cannot modify company A insurance (insurance.company_id ≠ B)', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS, ALL_INSURANCES);
    const ok = await insuranceDirectOwnershipCheck(supabase, INS_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

describe('Scenario 22: PATCH/DELETE insurance — non-existent insurance ID', () => {
  it('returns false when insurance ID does not exist', async () => {
    const supabase = buildMockSupabase(ALL_EQUIPMENT, ALL_SUBCONTRACTORS, ALL_INSURANCES);
    const ok = await insuranceDirectOwnershipCheck(supabase, 'nonexistent-ins-id', COMPANY_A);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 23–24: Storage authorization (TENANT_MIGRATED_TABLES)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 23: heavy_equipment in TENANT_MIGRATED_TABLES', () => {
  it('TENANT_MIGRATED_TABLES contains heavy_equipment after Batch 4', () => {
    expect(TENANT_MIGRATED_TABLES.has('heavy_equipment')).toBe(true);
  });

  it('TENANT_MIGRATED_TABLES contains heavy_equipment_insurances after Batch 4', () => {
    expect(TENANT_MIGRATED_TABLES.has('heavy_equipment_insurances')).toBe(true);
  });
});

describe('Scenario 24: heavy_equipment removed from STANDALONE_LEGACY_CONFIGS', () => {
  it('heavy_equipment is NOT in STANDALONE_LEGACY_CONFIGS after Batch 4', () => {
    const tables = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(tables).not.toContain('heavy_equipment');
  });

  it('heavy_equipment_insurances is NOT in STANDALONE_LEGACY_CONFIGS after Batch 4', () => {
    const tables = STANDALONE_LEGACY_CONFIGS.map(c => c.table);
    expect(tables).not.toContain('heavy_equipment_insurances');
  });
});
