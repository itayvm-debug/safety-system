/**
 * API route isolation tests — /api/briefing-template
 *
 * BT-AUTH:  unauthenticated request is rejected (401/error response)
 * BT-LANG:  missing language param → 400
 * BT-BAD:   invalid language value → 400
 * BT-DEF:   authenticated company with no overrides → SafeDoc default URL
 * BT-OVR:   company with language override → returns company-specific URL
 * BT-FALL:  company with partial overrides → missing language falls back to default
 * BT-INDC:  resolver called with the company's own settings (not another company's)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetCurrentCompanyContext = vi.fn();
const mockResolveBriefingTemplatePath = vi.fn();

vi.mock('@/lib/auth/company-context', () => ({
  getCurrentCompanyContext: mockGetCurrentCompanyContext,
}));

vi.mock('@/lib/briefings/template-resolver', () => ({
  resolveBriefingTemplatePath: mockResolveBriefingTemplatePath,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(language?: string): NextRequest {
  const url = language
    ? `http://localhost/api/briefing-template?language=${language}`
    : 'http://localhost/api/briefing-template';
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

function makeContext(
  briefingTemplates: Record<string, string> = {},
) {
  return {
    context: {
      companyId: 'company-123',
      settings: { briefingTemplates },
    },
    error: null,
  };
}

function makeAuthError() {
  return {
    context: null,
    error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  };
}

// ─── Import route handler after mocks are set up ─────────────────────────────

const { GET } = await import('../route');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BT-AUTH: unauthenticated request returns the error from context', () => {
  beforeEach(() => vi.clearAllMocks());

  it('propagates the auth error response', async () => {
    mockGetCurrentCompanyContext.mockResolvedValue(makeAuthError());
    const res = await GET(makeRequest('hebrew'));
    expect(res.status).toBe(401);
    expect(mockResolveBriefingTemplatePath).not.toHaveBeenCalled();
  });
});

describe('BT-LANG: missing language parameter → 400', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when language param is absent', async () => {
    mockGetCurrentCompanyContext.mockResolvedValue(makeContext());
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/language/i);
  });
});

describe('BT-BAD: invalid language value → 400', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 for unknown language "klingon"', async () => {
    mockGetCurrentCompanyContext.mockResolvedValue(makeContext());
    const res = await GET(makeRequest('klingon'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty string language', async () => {
    mockGetCurrentCompanyContext.mockResolvedValue(makeContext());
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(400);
  });
});

describe('BT-DEF: authenticated company with no overrides → SafeDoc default', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls resolver with empty briefingTemplates and returns url from resolver', async () => {
    mockGetCurrentCompanyContext.mockResolvedValue(makeContext({}));
    mockResolveBriefingTemplatePath.mockReturnValue('/briefing-templates/hebrew.pdf');

    const res = await GET(makeRequest('hebrew'));
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toBe('/briefing-templates/hebrew.pdf');
    expect(mockResolveBriefingTemplatePath).toHaveBeenCalledWith(
      { briefingTemplates: {} },
      'hebrew',
    );
  });
});

describe('BT-OVR: company with override → returns company-specific URL', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolver receives override settings and response contains the override URL', async () => {
    const overrides = { arabic: '/briefing-templates/overrides/natan-valdman/arabic.pdf' };
    mockGetCurrentCompanyContext.mockResolvedValue(makeContext(overrides));
    mockResolveBriefingTemplatePath.mockReturnValue(
      '/briefing-templates/overrides/natan-valdman/arabic.pdf',
    );

    const res = await GET(makeRequest('arabic'));
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toContain('natan-valdman');
    expect(mockResolveBriefingTemplatePath).toHaveBeenCalledWith(
      { briefingTemplates: overrides },
      'arabic',
    );
  });
});

describe('BT-FALL: partial overrides — missing language falls back via resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolver is called with company settings; fallback logic stays inside resolver', async () => {
    const overrides = { hebrew: '/briefing-templates/overrides/natan-valdman/hebrew.pdf' };
    mockGetCurrentCompanyContext.mockResolvedValue(makeContext(overrides));
    mockResolveBriefingTemplatePath.mockReturnValue('/briefing-templates/russian.pdf');

    const res = await GET(makeRequest('russian'));
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toBe('/briefing-templates/russian.pdf');
    expect(mockResolveBriefingTemplatePath).toHaveBeenCalledWith(
      { briefingTemplates: overrides },
      'russian',
    );
  });
});

describe("BT-INDC: resolver is called with THIS company's settings, not another", () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolver receives the exact settings object from the company context', async () => {
    const settingsA = { briefingTemplates: { thai: '/company-a/thai.pdf' } };
    mockGetCurrentCompanyContext.mockResolvedValue({
      context: { companyId: 'company-a', settings: settingsA },
      error: null,
    });
    mockResolveBriefingTemplatePath.mockReturnValue('/company-a/thai.pdf');

    await GET(makeRequest('thai'));
    expect(mockResolveBriefingTemplatePath).toHaveBeenCalledWith(settingsA, 'thai');
    expect(mockResolveBriefingTemplatePath).not.toHaveBeenCalledWith(
      expect.not.objectContaining({ briefingTemplates: { thai: '/company-a/thai.pdf' } }),
      'thai',
    );
  });
});

describe('All valid language values are accepted (BT-DEF variants)', () => {
  beforeEach(() => vi.clearAllMocks());

  const validLanguages = ['hebrew', 'arabic', 'english', 'russian', 'thai'] as const;
  validLanguages.forEach(lang => {
    it(`accepts language="${lang}"`, async () => {
      mockGetCurrentCompanyContext.mockResolvedValue(makeContext({}));
      mockResolveBriefingTemplatePath.mockReturnValue(`/briefing-templates/${lang}.pdf`);
      const res = await GET(makeRequest(lang));
      expect(res.status).toBe(200);
    });
  });
});
