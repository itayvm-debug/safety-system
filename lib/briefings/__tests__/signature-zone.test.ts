/**
 * Owner report 2026-11-20: on the Russian briefing the signature block (white background, 30pt
 * from the bottom) hid part of the SafeDoc logo of the template's page footer; the height-ban form
 * had the same pattern over its page number. Both blocks now sit above the page footer, without a
 * background, and scripts/check-briefing-signature-zone.py checks that the area is blank on the
 * last page of every template.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SIGNATURE_BLOCK_BOTTOM_PT } from '@/lib/briefings/system-briefing';
import { placeSignatureBlock, HEIGHT_BAN_BLOCK_AREA } from '@/lib/documents/signature-block';
import zones from '@/lib/briefings/signature-zone-check.json';

const ROOT = join(__dirname, '..', '..', '..');
const checks = zones as Record<string, { bytes: number; zoneBottomPt: number; nonWhitePixels: number }>;

function pdfs(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? pdfs(p) : f.endsWith('.pdf') ? [p] : [];
  });
}

const SETS = [
  { folder: 'briefing-templates', prefix: '', bottom: SIGNATURE_BLOCK_BOTTOM_PT },
  { folder: 'height-ban-templates', prefix: 'height-ban/', bottom: HEIGHT_BAN_BLOCK_AREA.bottom },
];
const cases = SETS.flatMap(({ folder, prefix, bottom }) => {
  const base = join(ROOT, 'public', folder);
  return pdfs(base).map((f) => ({ key: prefix + relative(base, f).split(sep).join('/'), file: f, bottom }));
});

describe('signature block never covers template content', () => {
  it('covers every template (briefing and height ban)', () => {
    expect(cases.filter((c) => c.key.startsWith('height-ban/')).length).toBeGreaterThan(0);
    expect(cases.filter((c) => !c.key.startsWith('height-ban/')).length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => [c.key, c] as const))('%s: checked, unchanged since, and blank', (_key, c) => {
    const entry = checks[c.key];
    expect(entry, 'run: python -I scripts/check-briefing-signature-zone.py').toBeDefined();
    expect(entry.bytes, 'template changed — rerun the check script').toBe(statSync(c.file).size);
    expect(entry.zoneBottomPt).toBe(c.bottom);
    expect(entry.nonWhitePixels).toBe(0);
  });

  it('both blocks sit above the page footer (briefing ≤97pt, height ban ≤45pt) and have no background', () => {
    expect(SIGNATURE_BLOCK_BOTTOM_PT).toBeGreaterThan(97);
    expect(HEIGHT_BAN_BLOCK_AREA.bottom).toBeGreaterThan(45);
    const briefing = readFileSync(join(ROOT, 'lib', 'briefings', 'system-briefing.ts'), 'utf8');
    const heightBan = readFileSync(join(ROOT, 'components', 'workers', 'HeightBanCard.tsx'), 'utf8');
    for (const src of [briefing, heightBan]) expect(src).not.toMatch(/fillStyle = '#fff';\s*ctx\.fillRect\(0, 0, W, H\)/);
    expect(briefing).toContain('y: SIGNATURE_BLOCK_BOTTOM_PT');
    expect(heightBan).toContain('placeSignatureBlock(width, footerCanvas.width, footerCanvas.height, HEIGHT_BAN_BLOCK_AREA)');
  });
});

describe('placeSignatureBlock', () => {
  it('full width when it fits, centred', () => {
    expect(placeSignatureBlock(595, 900, 200, { bottom: 105, maxHeight: 500 })).toEqual({ x: 30, y: 105, width: 535, height: 535 * 200 / 900 });
  });

  it('scaled down proportionally (not stretched) when taller than the space, still centred', () => {
    const p = placeSignatureBlock(595, 900, 270, HEIGHT_BAN_BLOCK_AREA);
    expect(p.height).toBe(138);
    expect(p.width / p.height).toBeCloseTo(900 / 270, 6);
    expect(p.x).toBeCloseTo((595 - p.width) / 2, 6);
    expect(p.y).toBe(52);
  });
});
