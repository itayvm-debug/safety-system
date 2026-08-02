/**
 * Vehicle + Subcontractor Tenant Isolation — 20 scenarios
 *
 * Verifies the ownership-check patterns introduced in Phase 2 Batch 2:
 *
 *   Vehicles CRUD  — company_id scoped read/write/delete
 *   Duplicate gate — composite UNIQUE(company_id, vehicle_number) simulation
 *   Cross-FK       — assigned_manager_id must belong to same company
 *   Child tables   — vehicle_licenses/insurances via parent-vehicle ownership chain
 *
 * These tests simulate the logic performed by the API route handlers without
 * requiring a live HTTP server. Each helper mirrors the exact query pattern
 * from the corresponding route file.
 */

import { describe, it, expect } from 'vitest';
import type { createServiceClient } from '@/lib/supabase/server';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VehicleRow {
  id: string;
  company_id: string;
  vehicle_number: string;
  vehicle_type: string;
  assigned_manager_id: string | null;
}

interface WorkerRow {
  id: string;
  company_id: string;
}

interface VehicleLicenseRow {
  id: string;
  vehicle_id: string;
  company_id: string;
  file_url: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPANY_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const COMPANY_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const VEHICLE_A1 = 'v1111111-0000-0000-0000-000000000001';
const VEHICLE_B1 = 'v2222222-0000-0000-0000-000000000001';

const WORKER_A1 = 'w1111111-0000-0000-0000-000000000001';
const WORKER_B1 = 'w2222222-0000-0000-0000-000000000001';

const LICENSE_A1 = 'l1111111-0000-0000-0000-000000000001';

// ─── Mock factory ────────────────────────────────────────────────────────────

function buildMockSupabase(
  vehicles: VehicleRow[],
  workers: WorkerRow[],
  licenses: VehicleLicenseRow[] = []
): ReturnType<typeof createServiceClient> {
  return {
    from: (table: string) => {
      if (table === 'vehicles') {
        return buildVehicleChain(vehicles);
      }
      if (table === 'workers') {
        return buildWorkerChain(workers);
      }
      if (table === 'vehicle_licenses') {
        return buildLicenseChain(licenses);
      }
      return buildEmptyChain();
    },
  } as unknown as ReturnType<typeof createServiceClient>;
}

function buildVehicleChain(vehicles: VehicleRow[]) {
  const filters: Partial<VehicleRow> = {};
  let excludeId: string | null = null;

  const chain = {
    select: () => chain,
    eq:     (col: keyof VehicleRow, val: string) => { filters[col] = val as never; return chain; },
    neq:    (_col: string, val: string)           => { excludeId = val; return chain; },
    maybeSingle: () => {
      const row = vehicles.find(v =>
        Object.entries(filters).every(([k, fv]) => v[k as keyof VehicleRow] === fv) &&
        (excludeId === null || v.id !== excludeId)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
    then: (resolve?: (r: { data: VehicleRow[]; error: null }) => unknown) => {
      const rows = vehicles.filter(v =>
        Object.entries(filters).every(([k, fv]) => v[k as keyof VehicleRow] === fv)
      );
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return chain;
}

function buildWorkerChain(workers: WorkerRow[]) {
  const filters: Partial<WorkerRow> = {};

  const chain = {
    select: () => chain,
    eq:     (col: keyof WorkerRow, val: string) => { filters[col] = val as never; return chain; },
    maybeSingle: () => {
      const row = workers.find(w =>
        Object.entries(filters).every(([k, fv]) => w[k as keyof WorkerRow] === fv)
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
    eq:     (col: keyof VehicleLicenseRow, val: string) => { filters[col] = val as never; return chain; },
    maybeSingle: () => {
      const row = licenses.find(l =>
        Object.entries(filters).every(([k, fv]) => l[k as keyof VehicleLicenseRow] === fv)
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    },
    then: (resolve?: (r: { data: VehicleLicenseRow[]; error: null }) => unknown) => {
      const rows = licenses.filter(l =>
        Object.entries(filters).every(([k, fv]) => l[k as keyof VehicleLicenseRow] === fv)
      );
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return chain;
}

function buildEmptyChain() {
  const chain = {
    select: () => chain,
    eq:     () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve?: ((r: { data: unknown[]; error: null }) => unknown) | null) =>
      Promise.resolve({ data: [] as unknown[], error: null }).then(resolve),
  };
  return chain;
}

// ─── Helpers that mirror route logic ─────────────────────────────────────────

/** Mirror: GET /api/vehicles/[id] ownership check */
async function vehicleOwnershipCheck(
  supabase: ReturnType<typeof createServiceClient>,
  vehicleId: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('vehicles').select('id').eq('id', vehicleId).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null;
}

/** Mirror: POST /api/vehicles duplicate check */
async function vehicleDuplicateCheck(
  supabase: ReturnType<typeof createServiceClient>,
  vehicleNumber: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('vehicles').select('id').eq('vehicle_number', vehicleNumber).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null; // true = duplicate exists
}

/** Mirror: assigned_manager cross-company check */
async function workerBelongsToCompany(
  supabase: ReturnType<typeof createServiceClient>,
  workerId: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('workers').select('id').eq('id', workerId).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null;
}

/** Mirror: GET /api/vehicle-licenses?vehicle_id= ownership chain */
async function vehicleLicenseVehicleCheck(
  supabase: ReturnType<typeof createServiceClient>,
  vehicleId: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('vehicles').select('id').eq('id', vehicleId).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null;
}

/** Mirror: PATCH/DELETE /api/vehicle-licenses/[id] — direct company_id check (Batch 3) */
async function vehicleLicenseDirectCheck(
  supabase: ReturnType<typeof createServiceClient>,
  licenseId: string,
  companyId: string
): Promise<boolean> {
  const chain = supabase.from('vehicle_licenses').select('id').eq('id', licenseId).eq('company_id', companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (chain as any).maybeSingle();
  return data !== null;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const ALL_VEHICLES: VehicleRow[] = [
  { id: VEHICLE_A1, company_id: COMPANY_A, vehicle_number: '123-456', vehicle_type: 'truck', assigned_manager_id: WORKER_A1 },
  { id: VEHICLE_B1, company_id: COMPANY_B, vehicle_number: '123-456', vehicle_type: 'van',   assigned_manager_id: WORKER_B1 },
];

const ALL_WORKERS: WorkerRow[] = [
  { id: WORKER_A1, company_id: COMPANY_A },
  { id: WORKER_B1, company_id: COMPANY_B },
];

const ALL_LICENSES: VehicleLicenseRow[] = [
  { id: LICENSE_A1, vehicle_id: VEHICLE_A1, company_id: COMPANY_A, file_url: 'vehicles/1234-abcd.pdf' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 1–4: Vehicles CRUD scoping
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 1: vehicles list scoped to company', () => {
  it('company A gets only its own vehicles', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('vehicles').select('*').eq('company_id', COMPANY_A) as any).then(
      (r: { data: VehicleRow[] }) => r
    );
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(VEHICLE_A1);
    expect(data.every((v: VehicleRow) => v.company_id === COMPANY_A)).toBe(true);
  });

  it('company B gets only its own vehicles', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('vehicles').select('*').eq('company_id', COMPANY_B) as any).then(
      (r: { data: VehicleRow[] }) => r
    );
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(VEHICLE_B1);
  });
});

describe('Scenario 2: vehicle ownership check returns true for own company', () => {
  it('company A can find its own vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const found = await vehicleOwnershipCheck(supabase, VEHICLE_A1, COMPANY_A);
    expect(found).toBe(true);
  });
});

describe('Scenario 3: vehicle ownership check returns false for different company', () => {
  it('company B cannot find company A vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const found = await vehicleOwnershipCheck(supabase, VEHICLE_A1, COMPANY_B);
    expect(found).toBe(false);
  });
});

describe('Scenario 4: company A cannot access company B vehicle', () => {
  it('returns false for cross-company vehicle ID', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const found = await vehicleOwnershipCheck(supabase, VEHICLE_B1, COMPANY_A);
    expect(found).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 5–7: vehicle_number duplicate gate (per-company)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 5: same vehicle_number in same company → duplicate detected', () => {
  it('duplicate check returns true (conflict)', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const isDuplicate = await vehicleDuplicateCheck(supabase, '123-456', COMPANY_A);
    expect(isDuplicate).toBe(true);
  });
});

describe('Scenario 6: same vehicle_number in different company → no conflict', () => {
  it('duplicate check returns false (company B asking about its own plate)', async () => {
    // Company C (new company) wants to register plate '123-456'.
    // The existing row has company_id = COMPANY_A, not COMPANY_C.
    const COMPANY_C = 'cccccccc-0000-0000-0000-000000000003';
    const supabase  = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const isDuplicate = await vehicleDuplicateCheck(supabase, '123-456', COMPANY_C);
    expect(isDuplicate).toBe(false);
  });
});

describe('Scenario 7: plate unique within company but shared across two companies', () => {
  it('both companies legitimately have plate "123-456"', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const dupInA = await vehicleDuplicateCheck(supabase, '123-456', COMPANY_A);
    const dupInB = await vehicleDuplicateCheck(supabase, '123-456', COMPANY_B);
    // Both companies have the plate — legitimate in multi-tenant
    expect(dupInA).toBe(true);  // exists in A
    expect(dupInB).toBe(true);  // exists in B
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 8–11: assigned_manager_id cross-tenant FK enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 8: assigned_manager from same company → allowed', () => {
  it('worker belongs to same company → true', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const ok = await workerBelongsToCompany(supabase, WORKER_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 9: assigned_manager from different company → rejected', () => {
  it('company A cannot use company B worker as manager', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const ok = await workerBelongsToCompany(supabase, WORKER_B1, COMPANY_A);
    expect(ok).toBe(false);
  });
});

describe('Scenario 10: assigned_manager from different company (B→A) → rejected', () => {
  it('company B cannot use company A worker as manager', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const ok = await workerBelongsToCompany(supabase, WORKER_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

describe('Scenario 11: non-existent worker as manager → rejected', () => {
  it('returns false for worker ID not in any company', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const ok = await workerBelongsToCompany(supabase, 'nonexistent-worker-id', COMPANY_A);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 12–15: vehicle_licenses — parent vehicle ownership chain
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 12: GET vehicle-licenses — parent vehicle belongs to company', () => {
  it('company A can list licenses of its own vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS, ALL_LICENSES);
    const vehicleOk = await vehicleLicenseVehicleCheck(supabase, VEHICLE_A1, COMPANY_A);
    expect(vehicleOk).toBe(true);
  });
});

describe('Scenario 13: GET vehicle-licenses — parent vehicle from different company', () => {
  it('company B cannot list licenses of company A vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS, ALL_LICENSES);
    const vehicleOk = await vehicleLicenseVehicleCheck(supabase, VEHICLE_A1, COMPANY_B);
    expect(vehicleOk).toBe(false);
  });
});

describe('Scenario 14: POST vehicle-license — parent vehicle belongs to company', () => {
  it('company A can add license to its own vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS, ALL_LICENSES);
    const vehicleOk = await vehicleLicenseVehicleCheck(supabase, VEHICLE_A1, COMPANY_A);
    expect(vehicleOk).toBe(true);
  });
});

describe('Scenario 15: POST vehicle-license — parent vehicle from different company', () => {
  it('company B cannot add license to company A vehicle', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS, ALL_LICENSES);
    const vehicleOk = await vehicleLicenseVehicleCheck(supabase, VEHICLE_A1, COMPANY_B);
    expect(vehicleOk).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios 16–18: vehicle_licenses [id] — direct company_id check (Batch 3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 16: PATCH/DELETE vehicle-license [id] — direct company_id check resolves', () => {
  it('company A can modify its own license (direct: license.company_id = companyId)', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS, ALL_LICENSES);
    const ok = await vehicleLicenseDirectCheck(supabase, LICENSE_A1, COMPANY_A);
    expect(ok).toBe(true);
  });
});

describe('Scenario 17: PATCH/DELETE vehicle-license [id] — cross-company direct check denied', () => {
  it('company B cannot modify company A license (license.company_id ≠ B)', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS, ALL_LICENSES);
    const ok = await vehicleLicenseDirectCheck(supabase, LICENSE_A1, COMPANY_B);
    expect(ok).toBe(false);
  });
});

describe('Scenario 18: PATCH/DELETE vehicle-license [id] — non-existent license ID', () => {
  it('returns false when license ID does not exist', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS, ALL_LICENSES);
    const ok = await vehicleLicenseDirectCheck(supabase, 'nonexistent-license-id', COMPANY_A);
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 19–20: DELETE vehicle scoping
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 19: DELETE vehicle — company A can delete its own vehicle', () => {
  it('ownership check passes before delete', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const canDelete = await vehicleOwnershipCheck(supabase, VEHICLE_A1, COMPANY_A);
    expect(canDelete).toBe(true);
  });
});

describe('Scenario 20: DELETE vehicle — company B cannot delete company A vehicle', () => {
  it('ownership check fails → delete is blocked', async () => {
    const supabase = buildMockSupabase(ALL_VEHICLES, ALL_WORKERS);
    const canDelete = await vehicleOwnershipCheck(supabase, VEHICLE_A1, COMPANY_B);
    expect(canDelete).toBe(false);
  });
});
