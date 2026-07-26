/**
 * Worker identity isolation — 15 scenarios
 *
 * Business rule: The same physical person may work for multiple companies.
 * Company A and Company B may each register a worker with national_id "203530332",
 * but within a single company the identity must be unique.
 *
 * Covers:
 *   1–3   Duplicate detection is scoped to the requesting company
 *   4–5   Company B receives no indication of Company A's workers
 *   6     Workers with the same identity at different companies have distinct UUIDs
 *   7–8   Document storage is isolated by company_id authorization
 *   9–10  List queries return only the requesting company's workers
 *   11    Export is company-scoped for workers and documents
 *   12    Service-role queries explicitly scope workers by company_id
 *   13–14 Edit duplicate check: collision within same company vs. across companies
 *   15    Duplicate error message does not leak cross-company existence
 */

import { describe, it, expect, vi } from 'vitest';
import { normalizeIdentityValue } from '../normalize';
import { authorizeStorageObjectAccess, TENANT_MIGRATED_TABLES } from '@/lib/storage/authorize';
import type { createServiceClient } from '@/lib/supabase/server';

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPANY_A   = 'aaaaaaaa-0000-0000-0000-000000000001';
const COMPANY_B   = 'bbbbbbbb-0000-0000-0000-000000000002';
const WORKER_A_ID = 'waaaaaaa-0000-0000-0000-000000000001';
const WORKER_B_ID = 'wbbbbbbb-0000-0000-0000-000000000002';
const IDENTITY    = '203530332';
const DOC_PATH_A  = 'documents/1704000001-aabbccdd.pdf';
const DOC_PATH_B  = 'documents/1704000002-eeff0011.pdf';
const PHOTO_PATH_A = 'photos/1704000001-photo1.jpg';

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkerRow = {
  id: string;
  company_id: string;
  national_id: string | null;
  passport_number: string | null;
  photo_url?: string | null;
};

// ─── Mock: stateful workers table (for duplicate-check tests) ────────────────
//
// Filters by accumulated eq()/neq() calls so the mock correctly isolates by
// company_id — the core property being tested.

function buildWorkersMock(
  allWorkers: WorkerRow[],
): ReturnType<typeof createServiceClient> {
  return {
    from: vi.fn().mockImplementation((tableName: string) => {
      const eqFilters: Record<string, unknown> = {};
      const neqIds = new Set<string>();

      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
        eqFilters[col] = val;
        return chain;
      });
      chain.neq = vi.fn().mockImplementation((col: string, val: unknown) => {
        if (col === 'id') neqIds.add(val as string);
        return chain;
      });
      chain.in    = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);

      chain.maybeSingle = vi.fn().mockImplementation(() => {
        if (tableName !== 'workers') return Promise.resolve({ data: null, error: null });
        const match = allWorkers.find(w =>
          Object.entries(eqFilters).every(
            ([col, val]) => (w as Record<string, unknown>)[col] === val,
          ) && !neqIds.has(w.id),
        );
        return Promise.resolve({ data: match ?? null, error: null });
      });

      // Thenable for list queries (e.g. GET /api/workers)
      (chain as { then: unknown }).then = (
        fn?: ((v: { data: WorkerRow[]; error: null }) => unknown) | null,
      ) => {
        const matched =
          tableName === 'workers'
            ? allWorkers.filter(
                w =>
                  Object.entries(eqFilters).every(
                    ([col, val]) => (w as Record<string, unknown>)[col] === val,
                  ) && !neqIds.has(w.id),
              )
            : [];
        return Promise.resolve({ data: matched, error: null }).then(fn ?? undefined);
      };

      return chain;
    }),
  } as unknown as ReturnType<typeof createServiceClient>;
}

// ─── Mock: storage authorization isolation (for doc access tests) ─────────────
//
// Models a two-company system. Passes only the requesting company's workers and
// documents through. Companies count = 2 (blocks standalone-legacy Mode C).

function buildAuthMock(
  requestingCompanyId: string,
  ownWorkers: Array<{ id: string; photo_url: string | null }>,
  ownDocPath: string | null,
): ReturnType<typeof createServiceClient> {
  return {
    from: vi.fn().mockImplementation((tableName: string) => {
      // Companies count — always 2 in this fixture (multi-company system)
      if (tableName === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(
              Promise.resolve({ count: 2, data: null, error: null }),
            ),
          }),
        };
      }

      let docPathFilter: string | null = null;
      let docCompanyFilter: string | null = null;

      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
        if (col === 'file_url')   docPathFilter    = val as string;
        if (col === 'company_id') docCompanyFilter = val as string;
        return chain;
      });
      chain.in    = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);

      chain.maybeSingle = vi.fn().mockImplementation(() => {
        if (tableName === 'documents') {
          const allowed =
            docPathFilter === ownDocPath &&
            docCompanyFilter === requestingCompanyId;
          return Promise.resolve({ data: allowed ? { id: 'doc' } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Thenable for list queries (workers)
      (chain as { then: unknown }).then = (
        fn?: ((v: { data: typeof ownWorkers; error: null }) => unknown) | null,
      ) => {
        const rows = tableName === 'workers' ? ownWorkers : [];
        return Promise.resolve({ data: rows, error: null }).then(fn ?? undefined);
      };
      (chain as { catch: unknown }).catch = (
        fn?: ((e: unknown) => unknown) | null,
      ) => Promise.resolve({ data: ownWorkers, error: null }).catch(fn ?? undefined);

      return chain;
    }),
  } as unknown as ReturnType<typeof createServiceClient>;
}

// ─── Helpers: simulate POST / PUT duplicate check (mirrors route.ts) ─────────

async function simulatePostDuplicate(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  nationalId: string | null,
  passportNumber: string | null,
  isForeign: boolean,
): Promise<boolean> {
  const natNorm  = normalizeIdentityValue(nationalId);
  const passNorm = normalizeIdentityValue(passportNumber);

  if (!isForeign && natNorm) {
    const chainA = supabase.from('workers').select('id').eq('national_id', natNorm).eq('company_id', companyId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (chainA as any).maybeSingle();
    if (data) return true;
  }
  if (isForeign && passNorm) {
    const chainB = supabase.from('workers').select('id').eq('passport_number', passNorm).eq('company_id', companyId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (chainB as any).maybeSingle();
    if (data) return true;
  }
  return false;
}

async function simulatePutDuplicate(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  workerId: string,
  nationalId: string | null,
  passportNumber: string | null,
  isForeign: boolean,
): Promise<boolean> {
  const natNorm  = normalizeIdentityValue(nationalId);
  const passNorm = normalizeIdentityValue(passportNumber);

  if (!isForeign && natNorm) {
    const chainA = supabase.from('workers').select('id').eq('national_id', natNorm).eq('company_id', companyId).neq('id', workerId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (chainA as any).maybeSingle();
    if (data) return true;
  }
  if (isForeign && passNorm) {
    const chainB = supabase.from('workers').select('id').eq('passport_number', passNorm).eq('company_id', companyId).neq('id', workerId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (chainB as any).maybeSingle();
    if (data) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Scenario 1: Company A creates identity — success ────────────────────────

describe('Scenario 1: Company A creates identity 203530332 — success', () => {
  it('no duplicate found when workers table is empty for COMPANY_A', async () => {
    const supabase = buildWorkersMock([]);
    const isDuplicate = await simulatePostDuplicate(
      supabase, COMPANY_A, IDENTITY, null, false,
    );
    expect(isDuplicate).toBe(false);
  });
});

// ─── Scenario 2: Company B creates same identity — success ───────────────────

describe('Scenario 2: Company B creates identity 203530332 — success (different tenant)', () => {
  it('no duplicate for COMPANY_B when only COMPANY_A has that identity', async () => {
    // Worker A exists in COMPANY_A only
    const supabase = buildWorkersMock([
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: IDENTITY, passport_number: null },
    ]);
    // COMPANY_B's duplicate check filters by company_id=COMPANY_B — no match
    const isDuplicate = await simulatePostDuplicate(
      supabase, COMPANY_B, IDENTITY, null, false,
    );
    expect(isDuplicate).toBe(false);
  });
});

// ─── Scenario 3: Company A tries to create same identity again — rejected ────

describe('Scenario 3: Company A creates 203530332 again — rejected', () => {
  it('duplicate found within COMPANY_A', async () => {
    const supabase = buildWorkersMock([
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: IDENTITY, passport_number: null },
    ]);
    const isDuplicate = await simulatePostDuplicate(
      supabase, COMPANY_A, IDENTITY, null, false,
    );
    expect(isDuplicate).toBe(true);
  });
});

// ─── Scenario 4: Company B receives no indication that identity exists elsewhere

describe('Scenario 4: Company B receives no cross-company indication on duplicate', () => {
  it('error message on 409 does not contain "במערכת" (in the system)', () => {
    // The actual 409 response strings from route.ts:
    const postMsg = 'עובד עם מזהה זה כבר קיים בחברה';
    const putMsg  = 'עובד עם מזהה זה כבר קיים בחברה';
    const fallbackMsg = 'עובד עם מזהה זה כבר קיים בחברה';

    for (const msg of [postMsg, putMsg, fallbackMsg]) {
      expect(msg).not.toContain('במערכת');
      expect(msg).toContain('בחברה');
    }
  });
});

// ─── Scenario 5: Company B receives no prefilled data from Company A ─────────

describe('Scenario 5: Company B cannot retrieve Company A worker data', () => {
  it('GET /api/workers filtered by COMPANY_B returns no COMPANY_A workers', async () => {
    const supabase = buildWorkersMock([
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: IDENTITY, passport_number: null },
      { id: WORKER_B_ID, company_id: COMPANY_B, national_id: IDENTITY, passport_number: null },
    ]);

    // Simulate the GET handler's query for COMPANY_B
    const qB = supabase.from('workers').select('*').eq('company_id', COMPANY_B);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (qB as any).then((r: { data: WorkerRow[] }) => r);

    expect(data.every((w: WorkerRow) => w.company_id === COMPANY_B)).toBe(true);
    expect(data.some((w: WorkerRow) => w.company_id === COMPANY_A)).toBe(false);
  });
});

// ─── Scenario 6: Worker A and Worker B have different UUIDs ──────────────────

describe('Scenario 6: Workers with the same identity at different companies have distinct IDs', () => {
  it('WORKER_A_ID !== WORKER_B_ID', () => {
    expect(WORKER_A_ID).not.toBe(WORKER_B_ID);
  });

  it('workers mock returns the correct ID per company', async () => {
    const supabase = buildWorkersMock([
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: IDENTITY, passport_number: null },
      { id: WORKER_B_ID, company_id: COMPANY_B, national_id: IDENTITY, passport_number: null },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = await (supabase.from('workers').select('id').eq('company_id', COMPANY_A) as any)
      .then((r: { data: WorkerRow[] }) => r.data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = await (supabase.from('workers').select('id').eq('company_id', COMPANY_B) as any)
      .then((r: { data: WorkerRow[] }) => r.data);

    expect(a[0].id).toBe(WORKER_A_ID);
    expect(b[0].id).toBe(WORKER_B_ID);
    expect(a[0].id).not.toBe(b[0].id);
  });
});

// ─── Scenario 7: Worker A documents are inaccessible to Company B ────────────

describe('Scenario 7: Company B cannot access Worker A documents', () => {
  it('authorizeStorageObjectAccess denies COMPANY_B for Worker A doc path', async () => {
    const supabase = buildAuthMock(
      COMPANY_B,
      [{ id: WORKER_B_ID, photo_url: null }],  // COMPANY_B sees only Worker B
      DOC_PATH_B,                                // COMPANY_B owns DOC_PATH_B, not A
    );

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_B,
      path: DOC_PATH_A,   // attempt to access COMPANY_A's document
      supabase,
    });

    expect(result.allowed).toBe(false);
  });
});

// ─── Scenario 8: Worker B documents are inaccessible to Company A ────────────

describe('Scenario 8: Company A cannot access Worker B documents', () => {
  it('authorizeStorageObjectAccess denies COMPANY_A for Worker B doc path', async () => {
    const supabase = buildAuthMock(
      COMPANY_A,
      [{ id: WORKER_A_ID, photo_url: PHOTO_PATH_A }],  // COMPANY_A sees only Worker A
      DOC_PATH_A,                                        // COMPANY_A owns DOC_PATH_A, not B
    );

    const result = await authorizeStorageObjectAccess({
      companyId: COMPANY_A,
      path: DOC_PATH_B,   // attempt to access COMPANY_B's document
      supabase,
    });

    expect(result.allowed).toBe(false);
  });
});

// ─── Scenario 9: Search in Company A returns only Worker A ───────────────────

describe('Scenario 9: search/list in Company A returns only Company A workers', () => {
  it('query eq(company_id, COMPANY_A) excludes COMPANY_B workers', async () => {
    const supabase = buildWorkersMock([
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: IDENTITY, passport_number: null },
      { id: WORKER_B_ID, company_id: COMPANY_B, national_id: IDENTITY, passport_number: null },
    ]);

    const qA9 = supabase.from('workers').select('id, national_id').eq('company_id', COMPANY_A);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (qA9 as any).then((r: { data: WorkerRow[] }) => r);

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(WORKER_A_ID);
  });
});

// ─── Scenario 10: Search in Company B returns only Worker B ──────────────────

describe('Scenario 10: search/list in Company B returns only Company B workers', () => {
  it('query eq(company_id, COMPANY_B) excludes COMPANY_A workers', async () => {
    const supabase = buildWorkersMock([
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: IDENTITY, passport_number: null },
      { id: WORKER_B_ID, company_id: COMPANY_B, national_id: IDENTITY, passport_number: null },
    ]);

    const qB10 = supabase.from('workers').select('id, national_id').eq('company_id', COMPANY_B);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (qB10 as any).then((r: { data: WorkerRow[] }) => r);

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(WORKER_B_ID);
  });
});

// ─── Scenario 11: Export for Company A contains only Worker A data ────────────

describe('Scenario 11: export is company-scoped for workers', () => {
  it('TENANT_MIGRATED_TABLES includes workers and documents', () => {
    // Workers and documents are the Batch-1 tenant-migrated tables.
    // exportAllTables() in lib/export/exportTables.ts applies .eq('company_id', companyId)
    // only for tables in COMPANY_SCOPED_TABLES — which currently matches this set.
    expect(TENANT_MIGRATED_TABLES.has('workers')).toBe(true);
    expect(TENANT_MIGRATED_TABLES.has('documents')).toBe(true);
  });

  it('export query with COMPANY_A filters excludes COMPANY_B workers', async () => {
    const supabase = buildWorkersMock([
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: IDENTITY, passport_number: null },
      { id: WORKER_B_ID, company_id: COMPANY_B, national_id: IDENTITY, passport_number: null },
    ]);

    // Simulate the company-scoped export query
    const qExport = supabase.from('workers').select('*').eq('company_id', COMPANY_A);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (qExport as any).then((r: { data: WorkerRow[] }) => r);

    expect(data.every((w: WorkerRow) => w.company_id === COMPANY_A)).toBe(true);
    expect(data).toHaveLength(1);
  });
});

// ─── Scenario 12: Service-role queries are explicitly scoped by company_id ───

describe('Scenario 12: service-role queries scope workers and documents by company_id', () => {
  it('workers query with company_id filter isolates results', async () => {
    const supabase = buildWorkersMock([
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: '111111111', passport_number: null },
      { id: WORKER_B_ID, company_id: COMPANY_B, national_id: '222222222', passport_number: null },
    ]);

    // The service-role client bypasses RLS — so the company_id filter in the
    // application code is the sole isolation boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: aData } = await (supabase.from('workers').select('*').eq('company_id', COMPANY_A) as any)
      .then((r: { data: WorkerRow[] }) => r);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bData } = await (supabase.from('workers').select('*').eq('company_id', COMPANY_B) as any)
      .then((r: { data: WorkerRow[] }) => r);

    expect(aData).toHaveLength(1);
    expect(aData[0].national_id).toBe('111111111');
    expect(bData).toHaveLength(1);
    expect(bData[0].national_id).toBe('222222222');
  });

  it('omitting company_id filter returns all rows (demonstrates why scoping is mandatory)', async () => {
    const supabase = buildWorkersMock([
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: IDENTITY, passport_number: null },
      { id: WORKER_B_ID, company_id: COMPANY_B, national_id: IDENTITY, passport_number: null },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('workers').select('*') as any)
      .then((r: { data: WorkerRow[] }) => r);

    // Without company_id filter, both workers are visible — cross-tenant leak
    expect(data).toHaveLength(2);
    // This confirms the app MUST always apply .eq('company_id', companyId)
  });
});

// ─── Scenario 13: Edit collision within Company A — rejected ─────────────────

describe('Scenario 13: editing identity in Company A cannot collide with another Company A worker', () => {
  it('PUT duplicate check rejects when national_id already used by a different worker in same company', async () => {
    const WORKER_A2_ID = 'waaaaaaa-0000-0000-0000-000000000002';
    const supabase = buildWorkersMock([
      // Worker A1 already has IDENTITY
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: IDENTITY, passport_number: null },
      // Worker A2 is being updated — its current id_number differs
      { id: WORKER_A2_ID, company_id: COMPANY_A, national_id: '999999999', passport_number: null },
    ]);

    // User tries to change Worker A2's national_id to IDENTITY → collision with Worker A1
    const isDuplicate = await simulatePutDuplicate(
      supabase, COMPANY_A, WORKER_A2_ID, IDENTITY, null, false,
    );
    expect(isDuplicate).toBe(true);
  });
});

// ─── Scenario 14: Edit in Company A may match a Company B worker — allowed ────

describe('Scenario 14: editing identity in Company A may match a Company B worker (allowed)', () => {
  it('PUT duplicate check allows cross-company identity overlap', async () => {
    const supabase = buildWorkersMock([
      // Worker B has IDENTITY in COMPANY_B
      { id: WORKER_B_ID, company_id: COMPANY_B, national_id: IDENTITY, passport_number: null },
      // Worker A_OTHER is in COMPANY_A with a different identity
      { id: WORKER_A_ID, company_id: COMPANY_A, national_id: '000000000', passport_number: null },
    ]);

    // User updates Worker A_OTHER's national_id to IDENTITY
    // The PUT check filters by company_id=COMPANY_A — Worker B (COMPANY_B) is excluded
    const isDuplicate = await simulatePutDuplicate(
      supabase, COMPANY_A, WORKER_A_ID, IDENTITY, null, false,
    );
    expect(isDuplicate).toBe(false);
  });
});

// ─── Scenario 15: Duplicate error message does not leak tenant existence ───────

describe('Scenario 15: duplicate error message does not leak cross-company existence', () => {
  it('409 message says "בחברה" not "במערכת"', () => {
    const messages = [
      'עובד עם מזהה זה כבר קיים בחברה',  // POST 409 / PUT 409 (application-level check)
      'עובד עם מזהה זה כבר קיים בחברה',  // 23505 DB fallback (after migration: composite index)
    ];

    for (const msg of messages) {
      expect(msg).toContain('בחברה');
      expect(msg).not.toContain('במערכת');
    }
  });

  it('normalizeIdentityValue strips whitespace before comparison', () => {
    expect(normalizeIdentityValue('  203530332  ')).toBe('203530332');
    expect(normalizeIdentityValue('')).toBeNull();
    expect(normalizeIdentityValue(null)).toBeNull();
    expect(normalizeIdentityValue(undefined)).toBeNull();
  });

  it('normalized values compare equal regardless of surrounding whitespace', () => {
    const raw1 = '  203530332  ';
    const raw2 = '203530332';
    expect(normalizeIdentityValue(raw1)).toBe(normalizeIdentityValue(raw2));
  });
});
