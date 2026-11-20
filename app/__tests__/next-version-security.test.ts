/**
 * 2026-11-20: next 16.2.2 had published advisories up to "critical" (RCE in the image
 * optimizer, middleware/proxy bypasses, Server Actions DoS); everything <=16.4.4 is affected.
 * The app relies on middleware.ts for its first auth gate, so a bypass matters here.
 * Fixed by moving to 16.4.6. This test fails if the pin or the installed copy goes back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIN = [16, 4, 5] as const; // first release outside every advisory range for 16.x

function parse(v: string): number[] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) throw new Error(`next must be pinned to an exact version, got "${v}"`);
  return m.slice(1).map(Number);
}

function atLeast(v: number[], min: readonly number[]): boolean {
  for (let i = 0; i < 3; i++) if (v[i] !== min[i]) return v[i] > min[i];
  return true;
}

describe('next is on a version without known advisories', () => {
  it('package.json pins next >= 16.4.5', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(atLeast(parse(pkg.dependencies.next), MIN)).toBe(true);
  });

  it('the lockfile resolves next >= 16.4.5', () => {
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version: string }> };
    expect(atLeast(parse(lock.packages['node_modules/next'].version), MIN)).toBe(true);
  });
});
