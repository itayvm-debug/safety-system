/**
 * Owner feedback 2026-11-19:
 *  1. In the installed web app (iPhone) the briefing / height-ban template opened in a new tab
 *     with no way back — the app had to be closed. Templates are now shown in-app as page images.
 *  2. The signing box was too narrow (height-ban: 110px). Both forms now use one tall pad.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { TEMPLATE_PAGE_COUNTS } from '@/lib/documents/template-pages';
import { templatePageUrls } from '@/lib/documents/template-page-urls';
import { SAFEDOC_DEFAULT_TEMPLATE_PATHS } from '@/lib/briefings/template-resolver';
import { inkBounds, fitInBox } from '@/lib/documents/signature-fit';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('template page images', () => {
  for (const [kind, langs] of Object.entries(TEMPLATE_PAGE_COUNTS)) {
    for (const [lang, count] of Object.entries(langs)) {
      it(`${kind}/${lang}: one image per PDF page (re-run scripts/render-template-pages.py if this fails)`, async () => {
        const pdf = await PDFDocument.load(readFileSync(join(ROOT, 'public', `${kind}-templates`, `${lang}.pdf`)));
        expect(pdf.getPageCount()).toBe(count);
        const urls = templatePageUrls(`/${kind}-templates/${lang}.pdf`)!;
        expect(urls).toHaveLength(count);
        for (const u of urls) expect(existsSync(join(ROOT, 'public', u))).toBe(true);
      });
    }
  }

  it('covers every built-in briefing language and the height-ban languages', () => {
    for (const path of Object.values(SAFEDOC_DEFAULT_TEMPLATE_PATHS)) expect(templatePageUrls(path)).not.toBeNull();
    for (const lang of ['hebrew', 'arabic', 'english', 'russian', 'thai']) {
      expect(templatePageUrls(`/height-ban-templates/${lang}.pdf`)).not.toBeNull();
    }
  });

  it('returns null for a company-specific template (shown in an in-app frame instead)', () => {
    expect(templatePageUrls('/company-templates/acme/hebrew.pdf')).toBeNull();
    expect(templatePageUrls('https://evil.example/briefing-templates/hebrew.pdf')).toBeNull();
    expect(templatePageUrls('/briefing-templates/klingon.pdf')).toBeNull();
  });
});

describe('briefing and height-ban forms', () => {
  for (const file of ['components/workers/SafetyBriefingCard.tsx', 'components/workers/HeightBanCard.tsx']) {
    it(`${file}: reads the template in-app and signs on the shared pad`, () => {
      const src = read(file);
      expect(src).toContain('<TemplateViewer');
      expect(src).toContain('<SignaturePad');
      expect(src).not.toMatch(/function PdfViewer|function SignatureCanvas/);
      expect(src).not.toMatch(/maxHeight:\s*'110px'/);
    });
  }

  it('the template viewer never opens a new tab', () => {
    const src = read('components/documents/TemplateViewer.tsx');
    expect(src).not.toMatch(/target="_blank"|window\.open/);
  });

  it('the signing pad is at least 200px tall and has a full-screen mode', () => {
    const src = read('components/documents/SignaturePad.tsx');
    expect(src).toMatch(/clamp\(200px/);
    expect(src).toContain('FullScreenSigner');
  });
});

describe('signature geometry', () => {
  function rgba(w: number, h: number, inked: Array<[number, number]>) {
    const d = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of inked) d[(y * w + x) * 4 + 3] = 255;
    return d;
  }

  it('finds the inked area, with margin clamped to the canvas', () => {
    expect(inkBounds(rgba(100, 50, [[10, 20], [40, 30]]), 100, 50)).toEqual({ x: 10, y: 20, w: 31, h: 11 });
    expect(inkBounds(rgba(100, 50, [[1, 1], [98, 48]]), 100, 50, 5)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(inkBounds(rgba(10, 10, []), 10, 10)).toBeNull();
  });

  it('fits a wide signature into the footer box without stretching it', () => {
    const r = fitInBox(600, 100, { x: 0, y: 0, w: 220, h: 80 });
    expect(r.w / r.h).toBeCloseTo(6);
    expect(r.w).toBeCloseTo(220);
    expect(r.y).toBeCloseTo((80 - r.h) / 2);
    const tall = fitInBox(100, 200, { x: 10, y: 10, w: 220, h: 80 });
    expect(tall).toMatchObject({ h: 80, w: 40 });
    expect(tall.x).toBeCloseTo(10 + 90);
  });
});
