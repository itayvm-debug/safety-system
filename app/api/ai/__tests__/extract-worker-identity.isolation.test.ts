/**
 * F-01 — AI extract-worker-identity storage isolation
 * Verifies authorizeStorageObjectAccess is called before createSignedUrl,
 * and that cross-tenant access is blocked with a generic 404.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireCompanyAdminRole: vi.fn(),
  normalizeStoragePath: vi.fn(),
  authorizeStorageObjectAccess: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole: mocks.requireCompanyAdminRole,
}));

vi.mock('@/lib/storage/authorize', () => ({
  normalizeStoragePath: mocks.normalizeStoragePath,
  authorizeStorageObjectAccess: mocks.authorizeStorageObjectAccess,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({ createSignedUrl: mocks.createSignedUrl }),
    },
  }),
}));

import { POST } from '../extract-worker-identity/route';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/ai/extract-worker-identity', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

describe('F-01 — extract-worker-identity storage isolation', () => {
  it('returns auth error, never reaches storage, when requireCompanyAdminRole fails', async () => {
    mocks.requireCompanyAdminRole.mockResolvedValueOnce({
      context: null,
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });

    const res = await POST(req({ path: 'workers/company-a/id.jpg' }));
    expect(res.status).toBe(401);
    expect(mocks.authorizeStorageObjectAccess).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns 404 for traversal path without calling authorizeStorageObjectAccess', async () => {
    mocks.requireCompanyAdminRole.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-1' },
      error: null,
    });
    mocks.normalizeStoragePath.mockReturnValueOnce(null);

    const res = await POST(req({ path: '../etc/passwd' }));
    expect(res.status).toBe(404);
    expect(mocks.authorizeStorageObjectAccess).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns generic 404 and does NOT call createSignedUrl on cross-tenant denial', async () => {
    mocks.requireCompanyAdminRole.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-1' },
      error: null,
    });
    mocks.normalizeStoragePath.mockReturnValueOnce('workers/company-b/id.jpg');
    mocks.authorizeStorageObjectAccess.mockResolvedValueOnce({
      allowed: false,
      reason: 'no_matching_record',
    });

    const res = await POST(req({ path: 'workers/company-b/id.jpg' }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('file_not_found');
    // Internal denial reason must never be exposed to the client
    expect(body.reason).toBeUndefined();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('Company B cannot access Company A file via AI route', async () => {
    mocks.requireCompanyAdminRole.mockResolvedValueOnce({
      context: { companyId: COMPANY_B, userId: 'user-b' },
      error: null,
    });
    mocks.normalizeStoragePath.mockReturnValueOnce('workers/company-a/photo.jpg');
    mocks.authorizeStorageObjectAccess.mockResolvedValueOnce({
      allowed: false,
      reason: 'no_matching_record',
    });

    const res = await POST(req({ path: 'workers/company-a/photo.jpg' }));
    expect(res.status).toBe(404);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('authorizeStorageObjectAccess is called with the requesting company id, not from request body', async () => {
    mocks.requireCompanyAdminRole.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-1' },
      error: null,
    });
    mocks.normalizeStoragePath.mockReturnValueOnce('workers/company-a/id.jpg');
    mocks.authorizeStorageObjectAccess.mockResolvedValueOnce({
      allowed: false,
      reason: 'no_matching_record',
    });

    await POST(req({ path: 'workers/company-a/id.jpg' }));

    expect(mocks.authorizeStorageObjectAccess).toHaveBeenCalledOnce();
    const callArg = mocks.authorizeStorageObjectAccess.mock.calls[0][0];
    // companyId must come from requireCompanyAdminRole context, not from the request body
    expect(callArg.companyId).toBe(COMPANY_A);
    expect(callArg.path).toBe('workers/company-a/id.jpg');
  });

  it('createSignedUrl is only called after authorization passes', async () => {
    mocks.requireCompanyAdminRole.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-1' },
      error: null,
    });
    mocks.normalizeStoragePath.mockReturnValueOnce('workers/company-a/id.jpg');
    mocks.authorizeStorageObjectAccess.mockResolvedValueOnce({
      allowed: true,
      entityType: 'workers',
    });
    // createSignedUrl fails → route returns file_not_found without calling Anthropic
    mocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'storage error' } });

    await POST(req({ path: 'workers/company-a/id.jpg', document_type: 'id' }));

    // Authorization was checked
    expect(mocks.authorizeStorageObjectAccess).toHaveBeenCalledOnce();
    // createSignedUrl was only called because authorization passed
    expect(mocks.createSignedUrl).toHaveBeenCalledOnce();
    // Verify ordering: authorize was called before createSignedUrl
    const authorizeOrder = mocks.authorizeStorageObjectAccess.mock.invocationCallOrder[0];
    const signedUrlOrder = mocks.createSignedUrl.mock.invocationCallOrder[0];
    expect(authorizeOrder).toBeLessThan(signedUrlOrder);
  });
});
