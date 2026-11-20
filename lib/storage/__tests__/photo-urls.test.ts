/**
 * Field report 2026-11-19: "the app gets stuck in the field a lot".
 * Each list card fetched /api/signed-url for its own photo (~15 DB round trips each, the DB in
 * Tokyo and the functions in Washington); one user hit 167 requests in a minute (limit 200,
 * shared with opening documents). Now one request per list, links cached, functions near the DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { authorizePhotoPaths, PHOTO_SOURCES } from '@/lib/storage/authorize-photos';
import { getPhotoUrl, clearPhotoUrlCache, __setPhotoFetch } from '@/lib/storage/photo-url-client';
import type { createServiceClient } from '@/lib/supabase/server';

const ROOT = join(__dirname, '..', '..', '..');
const COMPANY = 'company-a';

// rows per table, each with company_id; the mock honours .eq('company_id') and .not(col,'is',null)
const ROWS: Record<string, Record<string, string | null>[]> = {
  workers: [
    { company_id: COMPANY, photo_url: 'workers/w1.jpg' },
    { company_id: COMPANY, photo_url: null },
    { company_id: 'company-b', photo_url: 'workers/foreign.jpg' },
  ],
  vehicles: [{ company_id: COMPANY, image_url: 'vehicles/v1.jpg' }],
  heavy_equipment: [{ company_id: COMPANY, image_url: 'heavy-equipment/h1.jpg' }],
  lifting_equipment: [{ company_id: 'company-b', image_url: 'lifting-equipment/l-foreign.jpg' }],
};

function mockSupabase() {
  const calls: { table: string; ops: string[] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, ops: [] as string[] };
      calls.push(call);
      let company: string | null = null;
      let notNull: string | null = null;
      const q = {
        select(cols: string) { call.ops.push(`select:${cols}`); return q; },
        eq(col: string, v: string) { call.ops.push(`eq:${col}`); if (col === 'company_id') company = v; return q; },
        not(col: string) { call.ops.push(`not:${col}`); notNull = col; return q; },
        in() { call.ops.push('in'); return q; },
        then(resolve: (r: unknown) => void) {
          const data = (ROWS[table] ?? []).filter((r) => r.company_id === company && (!notNull || r[notNull] !== null));
          resolve({ data, error: null });
        },
      };
      return q;
    },
  };
  return { client: client as unknown as ReturnType<typeof createServiceClient>, calls };
}

describe('authorizePhotoPaths', () => {
  it('allows only photos of the active company', async () => {
    const { client } = mockSupabase();
    const allowed = await authorizePhotoPaths(COMPANY, [
      'workers/w1.jpg', 'vehicles/v1.jpg', 'heavy-equipment/h1.jpg', // own photos
      'workers/foreign.jpg', 'lifting-equipment/l-foreign.jpg',       // another company
      'documents/id-card.pdf', '../workers/w1.jpg', 'nofolder',        // not a photo / malformed
    ], client);
    expect([...allowed].sort()).toEqual(['heavy-equipment/h1.jpg', 'vehicles/v1.jpg', 'workers/w1.jpg']);
  });

  it('one company-filtered query per photo table, however many paths, and no path list in the URL', async () => {
    const { client, calls } = mockSupabase();
    const many = Array.from({ length: 100 }, (_, i) => `workers/p${i}.jpg`);
    await authorizePhotoPaths(COMPANY, many, client);
    expect(calls.map((c) => c.table).sort()).toEqual(PHOTO_SOURCES.map((s) => s.table).sort());
    for (const c of calls) {
      expect(c.ops).toContain('eq:company_id');
      expect(c.ops).not.toContain('in');
    }
  });

  it('no query at all when nothing valid was asked', async () => {
    const { client, calls } = mockSupabase();
    expect((await authorizePhotoPaths(COMPANY, ['', '..'], client)).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

// ─── route ───────────────────────────────────────────────────────────────────
const rateLimit = vi.fn(async () => ({ allowed: true, resetAt: Date.now() + 60_000 }));
const createSignedUrls = vi.fn(async (paths: string[]) => ({
  data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}`, error: null })), error: null,
}));
let contextError: Response | null = null;
vi.mock('@/lib/auth/company-context', () => ({
  getCurrentCompanyContext: async () =>
    contextError ? { context: null, error: contextError } : { context: { userId: 'u1', companyId: COMPANY }, error: null },
}));
vi.mock('@/lib/rate-limit/db', () => ({ rateLimitSignedUrlDb: (...a: unknown[]) => rateLimit(...(a as [])) }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    const { client } = mockSupabase();
    return Object.assign(client, { storage: { from: () => ({ createSignedUrls }) } });
  },
}));

const post = (body: string) => new NextRequest('http://localhost/api/photo-urls', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
});

describe('POST /api/photo-urls', () => {
  beforeEach(() => { rateLimit.mockClear(); createSignedUrls.mockClear(); contextError = null; });

  it('signs only the allowed photos, in one request and one rate-limit event', async () => {
    const { POST } = await import('@/app/api/photo-urls/route');
    const res = await POST(post(JSON.stringify({ paths: ['workers/w1.jpg', 'workers/foreign.jpg', 'documents/x.pdf', 'workers/w1.jpg'] })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ urls: { 'workers/w1.jpg': 'https://signed/workers/w1.jpg' } });
    expect(rateLimit).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(['workers/w1.jpg'], 3600);
  });

  it('400 for a bad body or too many paths; no signing', async () => {
    const { POST } = await import('@/app/api/photo-urls/route');
    for (const body of ['{bad', '{"paths":"workers/w1.jpg"}', '{"paths":[5]}',
      JSON.stringify({ paths: Array.from({ length: 101 }, (_, i) => `workers/${i}.jpg`) })]) {
      expect((await POST(post(body))).status, body).toBe(400);
    }
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('no session/company → the context error, nothing else runs', async () => {
    contextError = new Response(null, { status: 401 });
    const { POST } = await import('@/app/api/photo-urls/route');
    expect((await POST(post('{"paths":["workers/w1.jpg"]}'))).status).toBe(401);
    expect(rateLimit).not.toHaveBeenCalled();
  });
});

// ─── browser client ──────────────────────────────────────────────────────────
describe('getPhotoUrl (browser)', () => {
  let fetches: string[][];
  let fail = false;
  beforeEach(() => {
    clearPhotoUrlCache();
    fetches = [];
    fail = false;
    __setPhotoFetch(async (_url, init) => {
      const { paths } = JSON.parse(String(init.body)) as { paths: string[] };
      fetches.push(paths);
      if (fail) throw new Error('offline');
      return new Response(JSON.stringify({ urls: Object.fromEntries(paths.filter((p) => !p.includes('foreign')).map((p) => [p, `u:${p}`])) }));
    });
  });

  it('a whole list in one request; again from cache with no request', async () => {
    const paths = Array.from({ length: 40 }, (_, i) => `workers/${i}.jpg`);
    const urls = await Promise.all([...paths, 'workers/foreign.jpg'].map((p) => getPhotoUrl(p)));
    expect(fetches).toHaveLength(1);
    expect(urls[0]).toBe('u:workers/0.jpg');
    expect(urls[40]).toBeNull();
    await Promise.all([...paths, 'workers/foreign.jpg'].map((p) => getPhotoUrl(p))); // e.g. back to the list
    expect(fetches).toHaveLength(1);
  });

  it('over 100 photos → chunks of 100', async () => {
    await Promise.all(Array.from({ length: 150 }, (_, i) => getPhotoUrl(`workers/${i}.jpg`)));
    expect(fetches.map((f) => f.length)).toEqual([100, 50]);
  });

  it('a failed request is not cached; clearing (login/logout/company switch) asks again', async () => {
    fail = true;
    expect(await getPhotoUrl('workers/1.jpg')).toBeNull();
    fail = false;
    expect(await getPhotoUrl('workers/1.jpg')).toBe('u:workers/1.jpg');
    expect(fetches).toHaveLength(2);
    clearPhotoUrlCache();
    await getPhotoUrl('workers/1.jpg');
    expect(fetches).toHaveLength(3);
  });

  it('no path → null without a request', async () => {
    expect(await getPhotoUrl(null)).toBeNull();
    expect(fetches).toHaveLength(0);
  });
});

// ─── wiring ──────────────────────────────────────────────────────────────────
describe('photos are not fetched one by one any more', () => {
  const files = [
    'components/workers/WorkerList.tsx', 'components/workers/SiteManagerList.tsx',
    'components/heavy-equipment/HeavyEquipmentList.tsx', 'components/lifting-equipment/LiftingEquipmentList.tsx',
  ];
  it.each(files)('%s uses the batched photo client, not /api/signed-url', (f) => {
    const src = readFileSync(join(ROOT, f), 'utf8');
    expect(src).not.toContain('/api/signed-url');
    expect(src).toContain('getPhotoUrl(');
  });

  it('clearing the offline snapshots also clears the photo links', () => {
    expect(readFileSync(join(ROOT, 'lib/offline/cache.ts'), 'utf8')).toMatch(/clearAllSnapshots[\s\S]*clearPhotoUrlCache\(\)/);
  });

  it('functions run next to the database (Supabase ap-northeast-1 = Vercel hnd1)', () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as { regions?: string[] };
    expect(cfg.regions).toEqual(['hnd1']);
  });
});
