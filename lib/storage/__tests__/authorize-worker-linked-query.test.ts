/**
 * Audit P3 (verified 2026-11-18): Mode B sent every worker id of the company in the query
 * string — .in('worker_id', [...]) — about 4 KB of URL at 112 workers, so a few hundred
 * workers would exceed the gateway's URL limit and deny access to every briefing, height
 * and license file. Ownership is now checked with an inner join on workers.company_id.
 */
import { describe, it, expect, vi } from 'vitest';
import { authorizeStorageObjectAccess } from '../authorize';
import type { createServiceClient } from '@/lib/supabase/server';

const COMPANY = 'aaaaaaaa-0000-0000-0000-000000000001';
const PATH = 'documents/1794995782314-7b3fd1aff59531d93626dd05614f7f89.pdf';

type Call = { table: string; select: string; eq: [string, unknown][]; inCalls: number };

function recordingClient(manyWorkers: number, hitTable: string | null) {
  const calls: Call[] = [];
  const workers = Array.from({ length: manyWorkers }, (_, i) => ({ id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, photo_url: null }));
  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn((select: string, opts?: { count?: string }) => {
        if (opts?.count === 'exact') return { eq: () => Promise.resolve({ count: 2, data: null, error: null }) };
        const call: Call = { table, select, eq: [], inCalls: 0 };
        calls.push(call);
        const isList = ['workers', 'vehicles', 'heavy_equipment', 'lifting_equipment', 'lifting_machine_appointments'].includes(table);
        const chain: Record<string, unknown> = {
          eq: vi.fn((col: string, val: unknown) => { call.eq.push([col, val]); return chain; }),
          in: vi.fn(() => { call.inCalls++; return chain; }),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(() => Promise.resolve({ data: table === hitTable ? { id: 'x' } : null, error: null })),
          then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: isList && table === 'workers' ? workers : [], error: null }).then(ok),
        };
        return chain;
      }),
    })),
  } as unknown as ReturnType<typeof createServiceClient>;
  return { client, calls };
}

const WORKER_LINKED = ['safety_briefings', 'height_restrictions', 'professional_licenses', 'manager_licenses'];

describe('Mode B — worker-linked files', () => {
  it('never puts worker ids in the query, whatever the number of workers', async () => {
    const { client, calls } = recordingClient(5000, null);
    await authorizeStorageObjectAccess({ companyId: COMPANY, path: PATH, supabase: client });
    const modeB = calls.filter((c) => WORKER_LINKED.includes(c.table));
    expect(modeB).toHaveLength(6);
    for (const c of modeB) {
      expect(c.inCalls).toBe(0);
      expect(c.select).toContain('workers!inner(company_id)');
      expect(c.eq).toContainEqual(['workers.company_id', COMPANY]);
    }
  });

  it('allows a briefing file owned through a worker of the company', async () => {
    const { client } = recordingClient(3, 'safety_briefings');
    expect(await authorizeStorageObjectAccess({ companyId: COMPANY, path: PATH, supabase: client }))
      .toEqual({ allowed: true, entityType: 'safety_briefings' });
  });

  it('denies when no worker-linked row of the company references the path', async () => {
    const { client } = recordingClient(3, null);
    const r = await authorizeStorageObjectAccess({ companyId: COMPANY, path: PATH, supabase: client });
    expect(r.allowed).toBe(false);
  });
});
