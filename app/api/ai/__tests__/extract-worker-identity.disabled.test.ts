/**
 * AI identity extraction is OFF by default (owner decision pending).
 * With the switch off, no file is read, no signed URL is created and nothing
 * is sent to the AI provider — even for an admin with a valid upload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireCompanyAdminRole: vi.fn(),
  authorizeStorageObjectAccess: vi.fn(),
  createSignedUrl: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/auth/company-context', () => ({ requireCompanyAdminRole: mocks.requireCompanyAdminRole }));
vi.mock('@/lib/storage/authorize', async () => ({
  ...(await vi.importActual<typeof import('@/lib/storage/authorize')>('@/lib/storage/authorize')),
  authorizeStorageObjectAccess: mocks.authorizeStorageObjectAccess,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) } }),
}));

import { POST } from '../extract-worker-identity/route';
import { issueUploadPath } from '@/lib/storage/file-paths';
import { isAiIdentityExtractionEnabled } from '@/lib/ai/flags';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_IDENTITY_EXTRACTION_ENABLED;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.SESSION_SECRET = 'test-secret';
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.requireCompanyAdminRole.mockResolvedValue({
    context: { companyId: COMPANY_A, userId: 'u1', companyRole: 'admin' },
    error: null,
  });
});

const call = (path: string) =>
  POST(new NextRequest('http://localhost/api/ai/extract-worker-identity', {
    method: 'POST',
    body: JSON.stringify({ path, document_type: 'id_card' }),
    headers: { 'Content-Type': 'application/json' },
  }));

describe('AI identity extraction switch', () => {
  it('is off unless AI_IDENTITY_EXTRACTION_ENABLED is exactly "true"', () => {
    expect(isAiIdentityExtractionEnabled({})).toBe(false);
    expect(isAiIdentityExtractionEnabled({ AI_IDENTITY_EXTRACTION_ENABLED: '1' })).toBe(false);
    expect(isAiIdentityExtractionEnabled({ AI_IDENTITY_EXTRACTION_ENABLED: 'true' })).toBe(true);
  });

  it('when off, a valid admin request reads no file and calls no AI provider', async () => {
    const res = await call(issueUploadPath(COMPANY_A, 'documents', 'jpg'));
    expect(await res.json()).toEqual({ success: false, error: 'ai_disabled' });
    expect(mocks.authorizeStorageObjectAccess).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('authentication is still checked first', async () => {
    mocks.requireCompanyAdminRole.mockResolvedValueOnce({
      context: null,
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    expect((await call('documents/x.jpg')).status).toBe(401);
  });
});
