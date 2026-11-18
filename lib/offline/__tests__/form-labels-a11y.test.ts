/**
 * Found in the live QA round (2026-11-18): most form fields had a visible <label> that was not
 * linked to the field (no htmlFor/id), so screen readers announced the placeholder (or nothing)
 * instead of "שם מלא", "מספר רכב" … 63 fields were given the label text as aria-label.
 * A field that directly follows a static <label> must carry aria-label, id or aria-labelledby.
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

describe('labelled form fields', () => {
  it('every field right after a static <label> has an accessible name', () => {
    const missing: string[] = [];
    for (const file of [...tsxFiles(join(ROOT, 'components')), ...tsxFiles(join(ROOT, 'app'))]) {
      const src = readFileSync(file, 'utf8');
      const labelRe = /<label\b[^>]*>([^<{}]+?)(?:<span[^>]*>\s*\*\s*<\/span>|\{[^}]*\}\s*)*\s*<\/label>/g;
      let m: RegExpExecArray | null;
      while ((m = labelRe.exec(src))) {
        const after = src.slice(m.index + m[0].length);
        const nextLabel = after.search(/<label\b/);
        const field = /<(input|select|textarea)\b([^>]*?)\/?>/.exec(after);
        if (!field || field.index > 900 || (nextLabel >= 0 && nextLabel < field.index)) continue;
        if (/type="(hidden|file|checkbox|radio|submit|button)"/.test(field[2])) continue;
        if (!/aria-label=|\bid=|aria-labelledby=/.test(field[2])) {
          missing.push(`${relative(ROOT, file)}: ${m[1].trim()}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
