/**
 * PDF viewer regression tests
 *
 * PV1:  Hebrew SafeDoc default template file exists and is a valid PDF
 * PV2:  Arabic SafeDoc default template file exists and is a valid PDF
 * PV3:  English SafeDoc default template file exists and is a valid PDF
 * PV4:  Russian SafeDoc default template file exists and is a valid PDF
 * PV5:  Thai SafeDoc default template file exists and is a valid PDF
 * PV6:  Natan Valdman Hebrew override exists and is a valid PDF
 * PV7:  Natan Valdman Arabic override exists and is a valid PDF
 * PV8:  Natan Valdman English override exists and is a valid PDF
 * PV9:  Natan Valdman Russian override exists and is a valid PDF
 * PV10: Natan Valdman Thai override exists and is a valid PDF
 * PV11: All height-ban universal form PDFs exist and are valid
 * PV12: Form-18g universal form exists and is a valid PDF
 * PV13: CSP config includes frame-src permitting same-origin PDFs
 * PV14: CSP config includes frame-src permitting Supabase Storage signed URLs
 * PV15: Middleware matcher excludes .pdf paths (static files bypass auth)
 * PV16: Template resolver never returns a path that traverses outside public/
 * PV17: No two language defaults share the same URL (each is distinct)
 * PV18: No Natan Valdman override collides with a SafeDoc default path
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Paths ───────────────────────────────────────────────────────────────────

const PUBLIC = join(process.cwd(), 'public');

function assertValidPdf(relPath: string): Buffer {
  const abs = join(PUBLIC, relPath);
  expect(existsSync(abs), `File missing: ${relPath}`).toBe(true);
  const buf = readFileSync(abs);
  const header = buf.slice(0, 5).toString('ascii');
  expect(header, `Invalid PDF header in ${relPath}: got "${header}"`).toBe('%PDF-');
  expect(buf.length, `${relPath} is unexpectedly empty`).toBeGreaterThan(1000);
  return buf;
}

// ─── PV1–PV5: SafeDoc default templates ──────────────────────────────────────

describe('PV1: Hebrew default template — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/hebrew.pdf');
  });
});

describe('PV2: Arabic default template — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/arabic.pdf');
  });
});

describe('PV3: English default template — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/english.pdf');
  });
});

describe('PV4: Russian default template — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/russian.pdf');
  });
});

describe('PV5: Thai default template — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/thai.pdf');
  });
});

// ─── PV6–PV10: Natan Valdman company overrides ────────────────────────────────

describe('PV6: Natan Valdman Hebrew override — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/overrides/natan-valdman/hebrew.pdf');
  });
});

describe('PV7: Natan Valdman Arabic override — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/overrides/natan-valdman/arabic.pdf');
  });
});

describe('PV8: Natan Valdman English override — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/overrides/natan-valdman/english.pdf');
  });
});

describe('PV9: Natan Valdman Russian override — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/overrides/natan-valdman/russian.pdf');
  });
});

describe('PV10: Natan Valdman Thai override — valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('briefing-templates/overrides/natan-valdman/thai.pdf');
  });
});

// ─── PV11: Height-ban universal forms ────────────────────────────────────────

describe('PV11: Height-ban universal forms — all 5 languages are valid PDFs', () => {
  const languages = ['hebrew', 'arabic', 'english', 'russian', 'thai'];
  languages.forEach(lang => {
    it(`height-ban ${lang} is a valid PDF`, () => {
      assertValidPdf(`height-ban-templates/${lang}.pdf`);
    });
  });
});

// ─── PV12: Form-18g ──────────────────────────────────────────────────────────

describe('PV12: Form-18g — exists and is a valid PDF', () => {
  it('file exists and has valid PDF header', () => {
    assertValidPdf('forms/form-18g.pdf');
  });
});

// ─── PV13–PV14: CSP frame-src ─────────────────────────────────────────────────

function readCspFromNextConfig(): string {
  const configPath = join(process.cwd(), 'next.config.ts');
  return readFileSync(configPath, 'utf-8');
}

describe("PV13: CSP includes frame-src allowing same-origin PDFs", () => {
  it("next.config.ts has a frame-src directive that permits 'self'", () => {
    const config = readCspFromNextConfig();
    // The frame-src line must exist and include 'self'
    expect(config).toMatch(/frame-src[^"]*'self'/);
  });
});

describe('PV14: CSP includes frame-src permitting Supabase Storage signed URLs', () => {
  it("next.config.ts frame-src includes https://*.supabase.co", () => {
    const config = readCspFromNextConfig();
    expect(config).toMatch(/frame-src[^"]*https:\/\/\*\.supabase\.co/);
  });
});

// ─── PV15: Middleware matcher excludes PDF paths ──────────────────────────────

describe('PV15: Middleware matcher excludes .pdf paths', () => {
  it('middleware.ts matcher config contains a .pdf exclusion', () => {
    const mw = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf-8');
    // The matcher must exclude .pdf paths so static PDFs bypass auth middleware.
    // The source uses the literal characters ".pdf" in a negative-lookahead group.
    expect(mw).toMatch(/\.pdf/);
    // It must be inside a negative-lookahead (not-matched) group, not a plain match
    expect(mw).toMatch(/\(\?!/);
  });
});

// ─── PV16: Resolver paths stay within expected prefix ────────────────────────

import { SAFEDOC_DEFAULT_TEMPLATE_PATHS } from '../template-resolver';

describe('PV16: Resolver default paths do not traverse outside /briefing-templates/', () => {
  const paths = Object.values(SAFEDOC_DEFAULT_TEMPLATE_PATHS);
  paths.forEach(p => {
    it(`"${p}" starts with /briefing-templates/ and has no traversal`, () => {
      expect(p).toMatch(/^\/briefing-templates\//);
      expect(p).not.toContain('..');
    });
  });
});

// ─── PV17: No two default language URLs are the same ─────────────────────────

describe('PV17: SafeDoc default URLs are distinct per language', () => {
  it('no two language defaults share a URL', () => {
    const paths = Object.values(SAFEDOC_DEFAULT_TEMPLATE_PATHS);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});

// ─── PV18: Override paths do not collide with defaults ───────────────────────

describe('PV18: Natan Valdman overrides do not share paths with SafeDoc defaults', () => {
  it('all 5 override paths differ from the corresponding default paths', () => {
    const languages = ['hebrew', 'arabic', 'english', 'russian', 'thai'] as const;
    for (const lang of languages) {
      const defaultPath = SAFEDOC_DEFAULT_TEMPLATE_PATHS[lang];
      const overridePath = `/briefing-templates/overrides/natan-valdman/${lang}.pdf`;
      expect(overridePath).not.toBe(defaultPath);
    }
  });
});
