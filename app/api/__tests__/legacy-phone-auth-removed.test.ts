/**
 * P0·2 — the legacy phone login routes returned derived Supabase credentials
 * to any signed-in user and enumerated authorized_phones. They had no callers
 * and were removed. This guards against them coming back.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('legacy phone authentication', () => {
  it('has no phone-login or check-phone route', () => {
    expect(existsSync(join(ROOT, 'app/api/auth/phone-login'))).toBe(false);
    expect(existsSync(join(ROOT, 'app/api/auth/check-phone'))).toBe(false);
  });

  it('no application code derives Supabase passwords from phone numbers', () => {
    const offenders = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'components'))]
      .filter(f => /@safedoc\.internal|safedoc_\$\{/.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });
});
