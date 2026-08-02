/**
 * Vehicle Children Tenant Isolation — 16 scenarios (Phase 2 Batch 3)
 *
 * Verifies the direct company_id ownership patterns introduced in Batch 3:
 *
 *   vehicle_licenses  CRUD — GET parent-vehicle check, POST company_id insert,
 *                            PATCH/DELETE direct company_id check
 *   vehicle_insurances CRUD — same pattern
 *
 * Each helper mirrors the exact query pattern from the corresponding route file.
 * Tests run without a live HTTP server.
 */

import { describe, it, expect } from 'vitest';
import type { createServiceClient } from '@/lib/supabase/server';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VehicleRow {
  id: string;
  company_id: string;
}

interface VehicleLicenseRow {
  id: string;
  vehicle_id: string;
  company_id: string;
  file_url: string | null;
}

interface VehicleInsuranceRow {
  id: string;
  vehicle_id: string;
  company_id: string;
  insurance_type: string;
  file_url: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPANY_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const COMPANY_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const VEHICLE_A1 = 'v1111111-0000-0000-0000-000000000001';
const VEHICLE_B1 = 'v2222222-0000-0000-0000-000000000001';

const LICENSE_A1  = 'l1111111-0000-0000-0000-000000000001';
const INSURANCE_A1 = 'i1111111-0000-0000-0000-000000000001';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildMockSupabase(
  vehicles:   VehicleRow[],
  licenses:   VehicleLicenseRow[],
  insurances: VehicleInsuranceRow[]
): ReturnType<typeof createServiceClient> {
  return {
    from: (table: string) => {
      if (table === 'vehicles')           return buildVehicleChain(vehicles);
      if (table === 'vehicle_licenses')   return buildLicenseChain(licenses);
      if (table === 'vehicle_insurances') return buildInsuranceChain(insurances);
      return buildEmptyChain();
    },
  } as unknown as ReturnType<typeof createServiceClient>;
}

function buildVehicleChain(vehicles: VehicleRow[]) {
  const filters: Partial<VehicleRow> = {};
  const chain = {
    select: () => chain,
    eq: (col: keyof VehicleRow, val: string) => { filters[col] = val as never; return chain; },
    maybeSingle: () => {
      const row = vehicles.find(v =>
        Object.entries(filters).every(([k, fv]) => v[k as keyof VehicleRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
  };
  return chain;
}

function buildLicenseChain(licenses: VehicleLicenseRow[]) {
  const filters: Partial<VehicleLicenseRow> = {};
  const chain = {
    select: () => chain,
    eq: (col: keyof VehicleLicenseRow, val: string) => { filters[col] = val as never; return chain; },
    maybeSingle: () => {
      const row = licenses.find(l =>
        Object.entries(filters).every(([k, fv]) => l[k as keyof VehicleLicenseRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
  };
  return chain;
}

function buildInsuranceChain(insurances: VehicleInsuranceRow[]) {
  const filters: Partial<VehicleInsuranceRow> = {};
  const chain = {
    select: () => chain,
    eq: (col: keyof VehicleInsuranceRow, val: string) => { filters[col] = val as never; return chain; },
    maybeSingle: () => {
      const row = insurances.find(i =>
        Object.entries(filters).every(([k, fv]) => i[k as keyof VehicleInsuranceRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
  };
  return chain;
}

function buildEmptyChain() {
  const chain = {
    select: () => chain,
    eq:     () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return chain;
}

// ─── Helpers mirroring route logic ───────────────────────────────────────────

/**
 * Mirrors GET /api/vehicle-licenses?vehicle_id= and GET /api/vehicle-insurances?vehicle_id=
 * Parent vehicle ownership check: vehicles.company_id = companyId
 */
async function parentVehicleCheck(
  supabase: ReturnType<typeof createServiceClient>,
  vehicleId: string,
  companyId: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from('vehicles').select('id').eq('id', vehicleId).eq('company_id', companyId) as any).maybeSingle();
  return data !== null;
}

/**
 * Mirrors POST /api/vehicle-licenses and POST /api/vehicle-insurances
 * Checks parent vehicle ownership before INSERT.
 */
async function postParentCheck(
  supabase: ReturnType<typeof createServiceClient>,
  vehicleId: string,
  companyId: string
): Promise<boolean> {
  return parentVehicleCheck(supabase, vehicleId, companyId);
}

/**
 * Mirrors PATCH/DELETE /api/vehicle-licenses/[id] (Batch 3 — direct company_id check)
 */
async function directLicenseCheck(
  supabase: ReturnType<typeof createServiceClient>,
  licenseId: string,
  companyId: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from('vehicle_licenses').select('id').eq('id', licenseId).eq('company_id', companyId) as any).maybeSingle();
  return data !== null;
}

/**
 * Mirrors PATCH/DELETE /api/vehicle-insurances/[id] (Batch 3 — direct company_id check)
 */
async function directInsuranceCheck(
  supabase: ReturnType<typeof createServiceClient>,
  insuranceId: string,
  companyId: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from('vehicle_insurances').select('id').eq('id', insuranceId).eq('company_id', companyId) as any).maybeSingle();
  return data !== null;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const ALL_VEHICLES: VehicleRow[] = [
  { id: VEHICLE_A1, company_id: COMPANY_A },
  { id: VEHICLE_B1, company_id: COMPANY_B },
];

const ALL_LICENSES: VehicleLicenseRow[] = [
  { id: LICENSE_A1, vehicle_id: VEHICLE_A1, company_id: COMPANY_A, file_url: 'vehicles/1234-abcd.pdf' },
];

const ALL_INSURANCES: VehicleInsuranceRow[] = [
  { id: INSURANCE_A1, vehicle_id: VEHICLE_A1, company_id: COMPANY_A, insurance_type: 'ביטוח חובה', file_url: 'vehicles/5678-efgh.pdf' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 1–2: GET vehicle-licenses — parent vehicle check
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 1: GET vehicle-licenses — parent vehicle belongs to company A', () => {
  it('company A can list licenses for its own vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await parentVehicleCheck(supabase, VEHICLE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 2: GET vehicle-licenses — parent vehicle belongs to company B', () => {
  it('company A cannot list licenses for company B vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await parentVehicleCheck(supabase, VEHICLE_B1, COMPANY_A);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 3–4: POST vehicle-license — parent vehicle check before INSERT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 3: POST vehicle-license — company A can insert for its own vehicle', () => {
  it('parent vehicle check passes → INSERT allowed', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await postParentCheck(supabase, VEHICLE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 4: POST vehicle-license — company A cannot insert for company B vehicle', () => {
  it('parent vehicle check fails → INSERT blocked', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await postParentCheck(supabase, VEHICLE_B1, COMPANY_A);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 5–6: PATCH vehicle-license — direct company_id check
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 5: PATCH vehicle-license — direct company_id check (same company)', () => {
  it('company A can update its own license via direct company_id', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await directLicenseCheck(supabase, LICENSE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 6: PATCH vehicle-license — direct company_id check (cross company)', () => {
  it('company B cannot update company A license via direct company_id', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await directLicenseCheck(supabase, LICENSE_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 7–8: DELETE vehicle-license — direct company_id check
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 7: DELETE vehicle-license — direct company_id check (same company)', () => {
  it('company A can delete its own license via direct company_id', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await directLicenseCheck(supabase, LICENSE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 8: DELETE vehicle-license — direct company_id check (cross company)', () => {
  it('company B cannot delete company A license via direct company_id', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await directLicenseCheck(supabase, LICENSE_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 9–10: GET vehicle-insurances — parent vehicle check
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 9: GET vehicle-insurances — parent vehicle belongs to company A', () => {
  it('company A can list insurances for its own vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await parentVehicleCheck(supabase, VEHICLE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 10: GET vehicle-insurances — parent vehicle belongs to company B', () => {
  it('company A cannot list insurances for company B vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await parentVehicleCheck(supabase, VEHICLE_B1, COMPANY_A);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 11–12: POST vehicle-insurance — parent vehicle check before INSERT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 11: POST vehicle-insurance — company A can insert for its own vehicle', () => {
  it('parent vehicle check passes → INSERT allowed', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await postParentCheck(supabase, VEHICLE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 12: POST vehicle-insurance — company A cannot insert for company B vehicle', () => {
  it('parent vehicle check fails → INSERT blocked', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await postParentCheck(supabase, VEHICLE_B1, COMPANY_A);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 13–14: PATCH vehicle-insurance — direct company_id check
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 13: PATCH vehicle-insurance — direct company_id check (same company)', () => {
  it('company A can update its own insurance via direct company_id', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await directInsuranceCheck(supabase, INSURANCE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 14: PATCH vehicle-insurance — direct company_id check (cross company)', () => {
  it('company B cannot update company A insurance via direct company_id', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await directInsuranceCheck(supabase, INSURANCE_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 15–16: DELETE vehicle-insurance — direct company_id check
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 15: DELETE vehicle-insurance — direct company_id check (same company)', () => {
  it('company A can delete its own insurance via direct company_id', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await directInsuranceCheck(supabase, INSURANCE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 16: DELETE vehicle-insurance — direct company_id check (cross company)', () => {
  it('company B cannot delete company A insurance via direct company_id', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_LICENSES, ALL_INSURANCES);
    const ok = await directInsuranceCheck(supabase, INSURANCE_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});
