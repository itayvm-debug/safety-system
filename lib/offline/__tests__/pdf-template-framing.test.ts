/**
 * Found in the live QA round (2026-11-18): the safety-briefing and height-ban PDFs are shown in an
 * <iframe>, but the global X-Frame-Options: DENY / frame-ancestors 'none' made every browser
 * refuse to render them, even inside SafeDoc — an empty grey box.
 * Next.js applies header rules in order; for the same key the last matching rule wins.
 */
import { describe, it, expect } from 'vitest';
import nextConfig, { SELF_FRAMEABLE_SOURCES } from '../../../next.config';

type Rule = { source: string; headers: { key: string; value: string }[] };

function matches(source: string, path: string): boolean {
  const re = new RegExp('^' + source.replace('/(.*)', '/.*').replace('/:path*', '(/.*)?') + '$');
  return re.test(path);
}

async function effective(path: string): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers!()) as Rule[];
  const out: Record<string, string> = {};
  for (const r of rules) if (matches(r.source, path)) for (const h of r.headers) out[h.key] = h.value;
  return out;
}

describe('framing headers', () => {
  it.each(['/briefing-templates/hebrew.pdf', '/briefing-templates/overrides/x/arabic.pdf', '/height-ban-templates/thai.pdf'])(
    '%s may be framed by SafeDoc itself only', async (path) => {
      const h = await effective(path);
      expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
      expect(h['Content-Security-Policy']).toContain("frame-ancestors 'self'");
      expect(h['Content-Security-Policy']).not.toContain("frame-ancestors 'none'");
    });

  it.each(['/dashboard', '/workers/1', '/api/signed-url', '/login', '/forms/form-18g.pdf'])(
    '%s still refuses every frame', async (path) => {
      const h = await effective(path);
      expect(h['X-Frame-Options']).toBe('DENY');
      expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    });

  it('the override list is exactly the two template folders', () => {
    expect(SELF_FRAMEABLE_SOURCES).toEqual(['/briefing-templates/:path*', '/height-ban-templates/:path*']);
  });
});
