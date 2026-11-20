/**
 * List thumbnails (2026-11-20). Seen live from the owner's phone: a workers list loaded ~44
 * photos of ~160KB (~7MB) to show 40–64px avatars. Lists now get a 192px copy (thumbs/<path>),
 * with the original as a fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { makeThumbnail, storeThumbnail, thumbPathFor, wantsThumbnail, THUMB_MAX_DIM } from '@/lib/images/thumbnail';
import { PHOTO_SOURCES } from '@/lib/storage/authorize-photos';
import { getPhotoUrl, clearPhotoUrlCache, __setPhotoFetch } from '@/lib/storage/photo-url-client';

const ROOT = join(__dirname, '..', '..', '..');

async function photo(width: number, height: number, withGps = false): Promise<Buffer> {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg({ quality: 95 });
  if (withGps) img = img.withMetadata({ exif: { IFD0: { Copyright: 'secret-location' } } });
  return img.toBuffer();
}

describe('makeThumbnail', () => {
  it('fits a large photo into 192px, as a much smaller JPEG', async () => {
    const original = await photo(3000, 2000);
    const thumb = await makeThumbnail(original);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width!, meta.height!)).toBe(THUMB_MAX_DIM);
    expect(meta.width! / meta.height!).toBeCloseTo(1.5, 1);
    expect(thumb.length).toBeLessThan(original.length / 5);
  });

  it('never enlarges a small image', async () => {
    const meta = await sharp(await makeThumbnail(await photo(100, 80))).metadata();
    expect([meta.width, meta.height]).toEqual([100, 80]);
  });

  it('drops the EXIF metadata (no GPS position in the copy)', async () => {
    const meta = await sharp(await makeThumbnail(await photo(800, 600, true))).metadata();
    expect(meta.exif).toBeUndefined();
  });
});

describe('which uploads get a thumbnail', () => {
  it('images in the photo-column folders only', () => {
    expect(wantsThumbnail('photos', 'image/jpeg')).toBe(true);
    expect(wantsThumbnail('vehicles', 'image/png')).toBe(true);
    expect(wantsThumbnail('photos', 'application/pdf')).toBe(false);
    expect(wantsThumbnail('documents', 'image/jpeg')).toBe(false); // ID scans etc.: no copies
    expect(thumbPathFor('photos/a.jpg')).toBe('thumbs/photos/a.jpg');
  });

  it('storeThumbnail writes thumbs/<path> as image/jpeg', async () => {
    const upload = vi.fn(async () => ({ error: null }));
    await storeThumbnail({ storage: { from: () => ({ upload }) } }, 'photos/a.jpg', await photo(400, 400));
    expect(upload).toHaveBeenCalledWith('thumbs/photos/a.jpg', expect.any(Buffer), { contentType: 'image/jpeg', upsert: true });
  });
});

// ─── /api/photo-urls with variant 'thumb' ────────────────────────────────────
const signCalls: string[][] = [];
const THUMBS_PRESENT = new Set(['thumbs/workers/w1.jpg']);
vi.mock('@/lib/auth/company-context', () => ({
  getCurrentCompanyContext: async () => ({ context: { userId: 'u1', companyId: 'co' }, error: null }),
}));
vi.mock('@/lib/rate-limit/db', () => ({ rateLimitSignedUrlDb: async () => ({ allowed: true, resetAt: 0 }) }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q; q.eq = () => q; q.not = () => q;
      q.then = (r: (v: unknown) => unknown) => r({ data: [{ photo_url: 'workers/w1.jpg', image_url: null }, { photo_url: 'workers/w2.jpg', image_url: null }], error: null });
      return q;
    },
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          signCalls.push(paths);
          return {
            data: paths.map((p) => (p.startsWith('thumbs/') && !THUMBS_PRESENT.has(p)
              ? { path: p, signedUrl: null, error: 'Either the object does not exist or you do not have access to it' }
              : { path: p, signedUrl: `https://signed/${p}`, error: null })),
            error: null,
          };
        },
      }),
    },
  }),
}));

const post = (body: unknown) => new NextRequest('http://localhost/api/photo-urls', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/photo-urls variant', () => {
  beforeEach(() => { signCalls.length = 0; });

  it('thumb: the small copy where there is one, the original otherwise; authorization on the original', async () => {
    const { POST } = await import('@/app/api/photo-urls/route');
    const res = await POST(post({ paths: ['workers/w1.jpg', 'workers/w2.jpg', 'workers/foreign.jpg'], variant: 'thumb' }));
    expect(await res.json()).toEqual({ urls: {
      'workers/w1.jpg': 'https://signed/thumbs/workers/w1.jpg',
      'workers/w2.jpg': 'https://signed/workers/w2.jpg',
    } });
    expect(signCalls).toEqual([['thumbs/workers/w1.jpg', 'thumbs/workers/w2.jpg'], ['workers/w2.jpg']]);
  });

  it('full (default): the original only, one signing call — unchanged behaviour', async () => {
    const { POST } = await import('@/app/api/photo-urls/route');
    const res = await POST(post({ paths: ['workers/w1.jpg'] }));
    expect(await res.json()).toEqual({ urls: { 'workers/w1.jpg': 'https://signed/workers/w1.jpg' } });
    expect(signCalls).toEqual([['workers/w1.jpg']]);
  });

  it('an unknown variant is 400', async () => {
    const { POST } = await import('@/app/api/photo-urls/route');
    expect((await POST(post({ paths: ['workers/w1.jpg'], variant: 'huge' }))).status).toBe(400);
  });
});

// ─── browser client ──────────────────────────────────────────────────────────
describe('getPhotoUrl variants', () => {
  it('thumb and full are separate requests and separate cache entries', async () => {
    clearPhotoUrlCache();
    const bodies: unknown[] = [];
    __setPhotoFetch(async (_u, init) => {
      const body = JSON.parse(String(init.body)) as { paths: string[]; variant?: string };
      bodies.push(body);
      return new Response(JSON.stringify({ urls: Object.fromEntries(body.paths.map((p) => [p, `${body.variant ?? 'full'}:${p}`])) }));
    });
    const [t, f] = await Promise.all([getPhotoUrl('workers/w1.jpg', 'thumb'), getPhotoUrl('workers/w1.jpg')]);
    expect([t, f]).toEqual(['thumb:workers/w1.jpg', 'full:workers/w1.jpg']);
    expect(bodies).toEqual([{ paths: ['workers/w1.jpg'], variant: 'thumb' }, { paths: ['workers/w1.jpg'] }].sort(() => 0));
    await getPhotoUrl('workers/w1.jpg', 'thumb');
    expect(bodies).toHaveLength(2); // cached
  });
});

// ─── wiring ──────────────────────────────────────────────────────────────────
describe('wiring', () => {
  it.each([
    'components/workers/WorkerList.tsx', 'components/workers/SiteManagerList.tsx',
    'components/heavy-equipment/HeavyEquipmentList.tsx', 'components/lifting-equipment/LiftingEquipmentList.tsx',
    'components/workers/EntryCheckScreen.tsx',
  ])('%s asks for thumbnails only', (f) => {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const calls = src.match(/getPhotoUrl\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toContain("'thumb'");
  });

  it('the upload route creates a thumbnail for photo uploads', () => {
    const src = readFileSync(join(ROOT, 'app', 'api', 'upload', 'route.ts'), 'utf8');
    expect(src).toMatch(/wantsThumbnail\(folder, file\.type\)/);
    expect(src).toContain('storeThumbnail(');
  });

  it('the backfill script covers exactly the photo columns', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'backfill-photo-thumbs.ts'), 'utf8');
    for (const { table, column } of PHOTO_SOURCES) {
      expect(src).toMatch(new RegExp(`table: '${table}',\\s+column: '${column}'`));
    }
    expect((src.match(/table: '/g) ?? []).length).toBe(PHOTO_SOURCES.length);
  });
});
