/**
 * Owner report 2026-11-20: on the Russian briefing the signature block (white background, 30pt
 * from the bottom) hid part of the SafeDoc logo of the template's page footer. The block now sits
 * at SIGNATURE_BLOCK_BOTTOM_PT, transparent, and scripts/check-briefing-signature-zone.py checks
 * that this area is blank on every template's last page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SIGNATURE_BLOCK_BOTTOM_PT } from '@/lib/briefings/system-briefing';
import zones from '@/lib/briefings/signature-zone-check.json';

const ROOT = join(__dirname, '..', '..', '..');
const TEMPLATES = join(ROOT, 'public', 'briefing-templates');

function pdfs(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? pdfs(p) : f.endsWith('.pdf') ? [p] : [];
  });
}

const checks = zones as Record<string, { bytes: number; zoneBottomPt: number; nonWhitePixels: number }>;

describe('briefing signature block never covers template content', () => {
  const files = pdfs(TEMPLATES);

  it('the block sits above the templates\' page footer', () => {
    expect(SIGNATURE_BLOCK_BOTTOM_PT).toBeGreaterThan(97); // tallest page footer measured: 97pt
  });

  it.each(files.map((f) => relative(TEMPLATES, f).split(sep).join('/')))('%s: checked, unchanged since, and blank', (name) => {
    const entry = checks[name];
    expect(entry, `run: python -I scripts/check-briefing-signature-zone.py`).toBeDefined();
    expect(entry.bytes, 'template changed — rerun the check script').toBe(statSync(join(TEMPLATES, name)).size);
    expect(entry.zoneBottomPt).toBe(SIGNATURE_BLOCK_BOTTOM_PT);
    expect(entry.nonWhitePixels).toBe(0);
  });

  it('the block has no background of its own', () => {
    const src = readFileSync(join(ROOT, 'lib', 'briefings', 'system-briefing.ts'), 'utf8');
    expect(src).not.toMatch(/fillStyle = '#fff';\s*ctx\.fillRect\(0, 0, W, H\)/);
    expect(src).toContain('y: SIGNATURE_BLOCK_BOTTOM_PT');
  });
});
