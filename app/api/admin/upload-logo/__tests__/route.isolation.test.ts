/**
 * Upload-logo route isolation tests
 *
 * UL1: POST rejects unauthenticated / non-admin callers (auth gate)
 * UL2: POST rejects request with no file field (validation)
 * UL3: POST rejects files exceeding 2MB (validation)
 * UL4: POST rejects disallowed MIME types (validation)
 * UL5: POST returns { path } with company-logos/ prefix on success
 * UL6: DELETE rejects paths not starting with company-logos/ (security)
 * UL7: DELETE returns { ok: true } for a valid company-logos/ path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Auth mock ───────────────────────────────────────────────────────────────

const requireAdminMock = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock('@/lib/auth/api', () => ({
  requireAdmin: requireAdminMock.requireAdmin,
}));

// ─── Storage mock ─────────────────────────────────────────────────────────────

const storageMock = vi.hoisted(() => ({
  uploadResult: { error: null } as { error: { message: string } | null },
  removeResult: { error: null } as { error: { message: string } | null },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({
        upload: vi.fn().mockImplementation(() => Promise.resolve(storageMock.uploadResult)),
        remove: vi.fn().mockImplementation(() => Promise.resolve(storageMock.removeResult)),
      }),
    },
  }),
}));

// ─── crypto mock (deterministic hex) ─────────────────────────────────────────

vi.mock('crypto', () => ({
  randomBytes: (_n: number) => ({
    toString: () => 'deadbeefcafebabe',
  }),
}));

// ─── Route imports ────────────────────────────────────────────────────────────

import { POST, DELETE } from '../route';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const platformAdminOk = {
  session: { userId: 'platform-admin', role: 'admin' as const, email: 'a@test.com', username: 'admin' },
  error: null,
};

const authDenied = {
  session: null,
  error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
};

function makePngFile(sizeBytes = 100): File {
  const buf = new Uint8Array(sizeBytes);
  // PNG magic bytes
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  return new File([buf], 'logo.png', { type: 'image/png' });
}

function postReq(file?: File): NextRequest {
  const form = new FormData();
  if (file) form.append('file', file);
  return new NextRequest('http://localhost/api/admin/upload-logo', {
    method: 'POST',
    body: form,
  });
}

function deleteReq(path: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/upload-logo?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.uploadResult = { error: null };
  storageMock.removeResult = { error: null };
  requireAdminMock.requireAdmin.mockResolvedValue(platformAdminOk);
});

// ─── UL1: Auth gate ───────────────────────────────────────────────────────────

describe('UL1: POST — non-admin is rejected', () => {
  it('returns 401 when requireAdmin returns an error response', async () => {
    requireAdminMock.requireAdmin.mockResolvedValue(authDenied);
    const res = await POST(postReq(makePngFile()));
    expect(res.status).toBe(401);
  });
});

// ─── UL2: No file field ───────────────────────────────────────────────────────

describe('UL2: POST — missing file field', () => {
  it('returns 400 when no file is attached', async () => {
    const res = await POST(postReq());
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toContain('קובץ');
  });
});

// ─── UL3: File too large ──────────────────────────────────────────────────────

describe('UL3: POST — file exceeds 2MB', () => {
  it('returns 400 for a file larger than 2MB', async () => {
    const tooBig = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    const res = await POST(postReq(tooBig));
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toContain('גדול');
  });
});

// ─── UL4: Disallowed MIME type ────────────────────────────────────────────────

describe('UL4: POST — disallowed MIME type', () => {
  it('returns 400 for a GIF file', async () => {
    const gif = new File([new Uint8Array(10)], 'logo.gif', { type: 'image/gif' });
    const res = await POST(postReq(gif));
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toContain('סוג קובץ');
  });
});

// ─── UL5: Successful upload ───────────────────────────────────────────────────

describe('UL5: POST — successful PNG upload returns path', () => {
  it('returns { path } with company-logos/ prefix on success', async () => {
    const res = await POST(postReq(makePngFile()));
    expect(res.status).toBe(200);
    const body = await res.json() as { path?: string };
    expect(typeof body.path).toBe('string');
    expect(body.path).toMatch(/^company-logos\//);
    expect(body.path).toMatch(/\.png$/);
  });
});

// ─── UL6: DELETE path traversal guard ────────────────────────────────────────

describe('UL6: DELETE — path not under company-logos/ is rejected', () => {
  it('returns 403 for arbitrary storage path', async () => {
    const res = await DELETE(deleteReq('worker-files/secret.png'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for path traversal attempt', async () => {
    const res = await DELETE(deleteReq('../company-logos/../../etc/passwd'));
    expect(res.status).toBe(403);
  });
});

// ─── UL7: Successful DELETE ───────────────────────────────────────────────────

describe('UL7: DELETE — valid company-logos/ path returns ok', () => {
  it('returns { ok: true } for a well-formed path', async () => {
    const res = await DELETE(deleteReq('company-logos/1234-deadbeef.png'));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok?: boolean };
    expect(body.ok).toBe(true);
  });
});
