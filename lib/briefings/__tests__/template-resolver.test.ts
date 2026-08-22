/**
 * Template resolver unit tests — covers all 15 scenarios from the task spec
 *
 * TR1:  company without overrides gets Hebrew default
 * TR2:  company without overrides gets Arabic default
 * TR3:  company without overrides gets English default
 * TR4:  company without overrides gets Russian default
 * TR5:  company without overrides gets Thai default
 * TR6:  company-specific Hebrew overrides default Hebrew
 * TR7:  missing company-specific Russian falls back to default Russian
 * TR8:  one company's Hebrew override does not affect another language (Arabic still default)
 * TR9:  settings with partial overrides: only the overridden languages return company path
 * TR10: empty briefingTemplates map → all languages fall back to defaults
 * TR11: all 5 SafeDoc default paths have the expected /briefing-templates/ prefix
 * TR12: company override paths are returned verbatim (no prefix modification)
 * TR13: Natan Valdman-style overrides resolve to overrides/ sub-path for each language
 * TR14: switching languages on same settings resolves independently
 * TR15: resolver is a pure function — same inputs always produce same output
 */

import { describe, it, expect } from 'vitest';
import {
  resolveBriefingTemplatePath,
  SAFEDOC_DEFAULT_TEMPLATE_PATHS,
} from '../template-resolver';
import type { BriefingLanguage } from '@/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NATAN_VALDMAN_OVERRIDES: Partial<Record<BriefingLanguage, string>> = {
  hebrew:  '/briefing-templates/overrides/natan-valdman/hebrew.pdf',
  arabic:  '/briefing-templates/overrides/natan-valdman/arabic.pdf',
  english: '/briefing-templates/overrides/natan-valdman/english.pdf',
  russian: '/briefing-templates/overrides/natan-valdman/russian.pdf',
  thai:    '/briefing-templates/overrides/natan-valdman/thai.pdf',
};

function settingsWith(overrides: Partial<Record<BriefingLanguage, string>>) {
  return { briefingTemplates: overrides };
}

const noOverrides = settingsWith({});

// ─── TR1–TR5: defaults for companies with no overrides ──────────────────────

describe('TR1: Hebrew default for company without overrides', () => {
  it('returns /briefing-templates/hebrew.pdf', () => {
    expect(resolveBriefingTemplatePath(noOverrides, 'hebrew'))
      .toBe('/briefing-templates/hebrew.pdf');
  });
});

describe('TR2: Arabic default for company without overrides', () => {
  it('returns /briefing-templates/arabic.pdf', () => {
    expect(resolveBriefingTemplatePath(noOverrides, 'arabic'))
      .toBe('/briefing-templates/arabic.pdf');
  });
});

describe('TR3: English default for company without overrides', () => {
  it('returns /briefing-templates/english.pdf', () => {
    expect(resolveBriefingTemplatePath(noOverrides, 'english'))
      .toBe('/briefing-templates/english.pdf');
  });
});

describe('TR4: Russian default for company without overrides', () => {
  it('returns /briefing-templates/russian.pdf', () => {
    expect(resolveBriefingTemplatePath(noOverrides, 'russian'))
      .toBe('/briefing-templates/russian.pdf');
  });
});

describe('TR5: Thai default for company without overrides', () => {
  it('returns /briefing-templates/thai.pdf', () => {
    expect(resolveBriefingTemplatePath(noOverrides, 'thai'))
      .toBe('/briefing-templates/thai.pdf');
  });
});

// ─── TR6: company override wins ───────────────────────────────────────────────

describe('TR6: company-specific Hebrew overrides default Hebrew', () => {
  it('returns the company override path, not the SafeDoc default', () => {
    const settings = settingsWith({ hebrew: '/briefing-templates/overrides/natan-valdman/hebrew.pdf' });
    const resolved = resolveBriefingTemplatePath(settings, 'hebrew');
    expect(resolved).toBe('/briefing-templates/overrides/natan-valdman/hebrew.pdf');
    expect(resolved).not.toBe(SAFEDOC_DEFAULT_TEMPLATE_PATHS.hebrew);
  });
});

// ─── TR7: missing company override falls back ─────────────────────────────────

describe('TR7: missing company-specific Russian falls back to default Russian', () => {
  it('returns SafeDoc default when only Hebrew is overridden', () => {
    const settings = settingsWith({ hebrew: '/briefing-templates/overrides/natan-valdman/hebrew.pdf' });
    expect(resolveBriefingTemplatePath(settings, 'russian'))
      .toBe('/briefing-templates/russian.pdf');
  });
});

// ─── TR8: one language override does not affect another ───────────────────────

describe('TR8: one language override does not affect other languages', () => {
  it('Arabic still resolves to default when only Hebrew is overridden', () => {
    const settings = settingsWith({ hebrew: '/briefing-templates/overrides/natan-valdman/hebrew.pdf' });
    expect(resolveBriefingTemplatePath(settings, 'arabic'))
      .toBe('/briefing-templates/arabic.pdf');
  });
});

// ─── TR9: partial overrides ───────────────────────────────────────────────────

describe('TR9: partial overrides — only overridden languages return company path', () => {
  const settings = settingsWith({
    hebrew: '/briefing-templates/overrides/natan-valdman/hebrew.pdf',
    arabic: '/briefing-templates/overrides/natan-valdman/arabic.pdf',
  });

  it('Hebrew resolves to override', () => {
    expect(resolveBriefingTemplatePath(settings, 'hebrew'))
      .toBe('/briefing-templates/overrides/natan-valdman/hebrew.pdf');
  });

  it('Arabic resolves to override', () => {
    expect(resolveBriefingTemplatePath(settings, 'arabic'))
      .toBe('/briefing-templates/overrides/natan-valdman/arabic.pdf');
  });

  it('English falls back to SafeDoc default', () => {
    expect(resolveBriefingTemplatePath(settings, 'english'))
      .toBe('/briefing-templates/english.pdf');
  });

  it('Russian falls back to SafeDoc default', () => {
    expect(resolveBriefingTemplatePath(settings, 'russian'))
      .toBe('/briefing-templates/russian.pdf');
  });

  it('Thai falls back to SafeDoc default', () => {
    expect(resolveBriefingTemplatePath(settings, 'thai'))
      .toBe('/briefing-templates/thai.pdf');
  });
});

// ─── TR10: empty overrides map ────────────────────────────────────────────────

describe('TR10: empty briefingTemplates map → all languages use defaults', () => {
  const languages: BriefingLanguage[] = ['hebrew', 'arabic', 'english', 'russian', 'thai'];
  languages.forEach(lang => {
    it(`${lang} uses SafeDoc default`, () => {
      expect(resolveBriefingTemplatePath(settingsWith({}), lang))
        .toBe(SAFEDOC_DEFAULT_TEMPLATE_PATHS[lang]);
    });
  });
});

// ─── TR11: SafeDoc default paths have expected prefix ─────────────────────────

describe('TR11: all SafeDoc defaults have /briefing-templates/ prefix', () => {
  const languages: BriefingLanguage[] = ['hebrew', 'arabic', 'english', 'russian', 'thai'];
  languages.forEach(lang => {
    it(`${lang} starts with /briefing-templates/`, () => {
      expect(SAFEDOC_DEFAULT_TEMPLATE_PATHS[lang]).toMatch(/^\/briefing-templates\//);
    });
  });
});

// ─── TR12: override paths returned verbatim ───────────────────────────────────

describe('TR12: override paths returned verbatim', () => {
  it('custom path returned exactly as stored in settings', () => {
    const customPath = '/some/custom/company/briefing.pdf';
    const settings = settingsWith({ english: customPath });
    expect(resolveBriefingTemplatePath(settings, 'english')).toBe(customPath);
  });
});

// ─── TR13: Natan Valdman full set resolves correctly ─────────────────────────

describe('TR13: Natan Valdman-style overrides resolve to overrides/ sub-path', () => {
  const settings = settingsWith(NATAN_VALDMAN_OVERRIDES);
  const languages: BriefingLanguage[] = ['hebrew', 'arabic', 'english', 'russian', 'thai'];
  languages.forEach(lang => {
    it(`${lang} resolves to natan-valdman override`, () => {
      expect(resolveBriefingTemplatePath(settings, lang))
        .toBe(`/briefing-templates/overrides/natan-valdman/${lang}.pdf`);
    });
  });
});

// ─── TR14: independent resolution per language ────────────────────────────────

describe('TR14: switching languages on same settings resolves independently', () => {
  const settings = settingsWith({
    hebrew:  '/briefing-templates/overrides/natan-valdman/hebrew.pdf',
    russian: '/briefing-templates/overrides/natan-valdman/russian.pdf',
  });

  it('Hebrew → natan-valdman override', () => {
    expect(resolveBriefingTemplatePath(settings, 'hebrew'))
      .toContain('natan-valdman');
  });

  it('Arabic → SafeDoc default', () => {
    expect(resolveBriefingTemplatePath(settings, 'arabic'))
      .toBe('/briefing-templates/arabic.pdf');
  });

  it('English → SafeDoc default', () => {
    expect(resolveBriefingTemplatePath(settings, 'english'))
      .toBe('/briefing-templates/english.pdf');
  });

  it('Russian → natan-valdman override', () => {
    expect(resolveBriefingTemplatePath(settings, 'russian'))
      .toContain('natan-valdman');
  });

  it('Thai → SafeDoc default', () => {
    expect(resolveBriefingTemplatePath(settings, 'thai'))
      .toBe('/briefing-templates/thai.pdf');
  });
});

// ─── TR15: pure function ──────────────────────────────────────────────────────

describe('TR15: resolver is a pure function (same inputs → same output)', () => {
  it('called twice with same args returns the same result', () => {
    const settings = settingsWith(NATAN_VALDMAN_OVERRIDES);
    const a = resolveBriefingTemplatePath(settings, 'arabic');
    const b = resolveBriefingTemplatePath(settings, 'arabic');
    expect(a).toBe(b);
  });
});
