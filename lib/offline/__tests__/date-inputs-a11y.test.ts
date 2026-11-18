/**
 * Found in the live QA round (2026-11-18): the "תוקף:" expiry date fields had a visible <label>
 * that was not linked to the input, so screen readers announced an unnamed "date" box.
 * Every date input in components/ and app/ must carry an aria-label or an id (for <label htmlFor>).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) return [];
    return statSync(p).isDirectory() ? tsxFiles(p) : name.endsWith('.tsx') ? [p] : [];
  });
}

describe('date inputs have an accessible name', () => {
  it('every <input type="date"> has aria-label or id', () => {
    const missing: string[] = [];
    for (const file of [...tsxFiles(join(ROOT, 'components')), ...tsxFiles(join(ROOT, 'app'))]) {
      const src = readFileSync(file, 'utf8');
      // [^>] already matches newlines, so no dotAll flag is needed (tsconfig targets < ES2018)
      for (const m of src.matchAll(/<input\b[^>]*?type="date"[^>]*?>/g)) {
        if (!/aria-label=|\bid=/.test(m[0])) {
          const line = src.slice(0, m.index).split('\n').length;
          missing.push(`${relative(ROOT, file)}:${line}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
