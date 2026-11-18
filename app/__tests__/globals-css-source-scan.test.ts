// Regression: the Vercel build failed in Tailwind with "Invalid code point 10646139"
// because HANDOFF.md held a Windows path ("CLAUDE\a2727b09-...") that Tailwind's
// source scanner read as a CSS escape (\a2727b = 0xA2727B, beyond Unicode).
// app/globals.css must keep prose (*.md) and SQL (supabase/) out of the scan.
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const requireFromRepo = createRequire(join(repoRoot, 'package.json'));
const postcss = requireFromRepo('postcss');
const tailwind = requireFromRepo('@tailwindcss/postcss');

const POISON = 'c--Users-itayv-OneDrive----CLAUDE\\a2727b09-4a5e-441b-82ef-2913c790058e.jsonl';

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'safedoc-tw-'));
  mkdirSync(join(dir, 'app'));
  mkdirSync(join(dir, 'supabase'));
  // Resolve `@import "tailwindcss"` from the repo's dependencies.
  symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'junction');
  writeFileSync(join(dir, 'app', 'globals.css'), readFileSync(join(repoRoot, 'app', 'globals.css'), 'utf8'));
  writeFileSync(join(dir, 'app', 'page.tsx'), 'export default () => <main className="bg-red-500 p-3" />;\n');
  writeFileSync(join(dir, 'HANDOFF.md'), `transcript: \`${POISON}\`\n`);
  writeFileSync(join(dir, 'supabase', 'notes.sql'), `-- ${POISON}\n`);
  return dir;
}

describe('app/globals.css Tailwind source scan', () => {
  const dir = makeProject();
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('builds when Markdown or SQL files contain backslash-hex text, and still finds UI classes', async () => {
    const from = join(dir, 'app', 'globals.css');
    const result = await postcss([tailwind({ base: dir })]).process(readFileSync(from, 'utf8'), { from });
    expect(result.css).toContain('.bg-red-500');
    expect(result.css).toContain('.p-3');
  }, 60_000);
});
