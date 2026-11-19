/**
 * Code review 2026-11-19: ~45 API routes crashed with 500 on malformed JSON, a non-object body,
 * or a number where text was expected (`field?.trim()` on a number throws).
 */
import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { NextRequest } from 'next/server';
import { readJsonObject } from '@/lib/http/json-body';

const ROOT = join(__dirname, '..', '..', '..');
const req = (raw: string) =>
  new NextRequest('http://localhost/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw });

describe('readJsonObject', () => {
  it('400 for malformed JSON, null, arrays and primitives', async () => {
    for (const raw of ['{bad', 'null', '[1,2]', '"text"', '42', '']) {
      const r = await readJsonObject(req(raw));
      expect(r.ok, raw).toBe(false);
      if (!r.ok) expect(r.error.status).toBe(400);
    }
  });

  it('400 when a listed text field is present but not a string; null/absent are fine', async () => {
    const r = await readJsonObject(req('{"name":5}'), ['name']);
    expect(r.ok).toBe(false);
    for (const raw of ['{"name":null}', '{}', '{"name":"שם","year":2020}']) {
      expect((await readJsonObject(req(raw), ['name'])).ok, raw).toBe(true);
    }
  });

  it('returns the parsed object unchanged', async () => {
    const r = await readJsonObject(req('{"a":"x","n":1,"b":true,"o":{"k":1}}'), ['a']);
    expect(r).toEqual({ ok: true, body: { a: 'x', n: 1, b: true, o: { k: 1 } } });
  });
});

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === '__tests__') return [];
    return statSync(p).isDirectory() ? routeFiles(p) : name === 'route.ts' ? [p] : [];
  });
}

describe('API routes read their JSON body safely', () => {
  it('no route parses the body with a bare `await request.json()` any more', () => {
    // ai/extract-worker-identity: disabled feature, parses inside its own try/catch
    const offenders = routeFiles(join(ROOT, 'app', 'api'))
      .filter((f) => !f.includes('extract-worker-identity'))
      .filter((f) => /await request\.json\(\)(?!\.catch)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});

// A real route: before, a numeric subject crashed (TypeError → 500); now 400 and nothing is written.
const insert = vi.fn();
vi.mock('@/lib/auth/api', () => ({ requireAuth: async () => ({ session: { userId: 'u' }, error: null }), requireAdmin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: () => ({ insert: (r: unknown) => { insert(r); return { select: () => ({ single: async () => ({ data: r, error: null }) }) }; } }) }),
}));

describe('POST /api/site-feedback', () => {
  it('a non-text field is a 400, not a crash', async () => {
    const { POST } = await import('@/app/api/site-feedback/route');
    const res = await POST(req('{"full_name":"a","subject":5,"content":"c"}'));
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    const ok = await POST(req('{"full_name":"a","subject":"s","content":"c"}'));
    expect(ok.status).toBe(201);
  });
});
