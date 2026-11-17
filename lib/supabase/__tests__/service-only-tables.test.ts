/**
 * Live check 2026-11-17: site_feedback, manager_insurances and
 * legal_acceptances_dedup_backup had RLS off and full anon/authenticated grants.
 * The proposed fix (supabase/proposed/2026-11-17-audit-remediation/07_*) removes
 * every client privilege and relies on the application reaching these tables
 * only from server code with the service role. This test keeps the code
 * consistent with that assumption.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'lib', 'components', 'hooks', 'public'];
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|html)$/;
const SKIP = /(__tests__|\.test\.|\.spec\.)/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return EXT.test(name) && !SKIP.test(full) ? [full] : [];
  });
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).map((f) => ({
  path: relative(ROOT, f).replace(/\\/g, '/'),
  src: readFileSync(f, 'utf8'),
}));

describe('tables locked to the service role', () => {
  it('deprecated tables are not read or written by the application', () => {
    const hits = files
      .filter((f) => /\b(manager_insurances|legal_acceptances_dedup_backup)\b/.test(f.src))
      .map((f) => f.path);
    expect(hits).toEqual([]);
  });

  it('site_feedback is reached only from server code with the service client', () => {
    const users = files.filter((f) => /\.from\(\s*['"`]site_feedback['"`]\s*\)/.test(f.src));
    expect(users.map((f) => f.path).sort()).toEqual([
      'app/api/site-feedback/[id]/route.ts',
      'app/api/site-feedback/route.ts',
      'app/dashboard/page.tsx',
      'app/feedback/page.tsx',
    ]);
    for (const f of users) {
      expect(f.src, f.path).not.toMatch(/^\s*['"]use client['"]/m);
      expect(f.src, f.path).toMatch(/createServiceClient\(\)/);
      // no RLS-bound client in the same file: neither the anon server client nor the browser client
      expect(f.src, f.path).not.toMatch(/\bcreateClient\s*\(/);
      expect(f.src, f.path).not.toMatch(/@\/lib\/supabase\/client/);
    }
  });

  it('browser code reaches feedback only through the API routes', () => {
    const clientFiles = files.filter((f) => /^\s*['"]use client['"]/m.test(f.src) || f.path.startsWith('public/'));
    const direct = clientFiles.filter((f) => /site_feedback/.test(f.src)).map((f) => f.path);
    expect(direct).toEqual([]);
  });
});
