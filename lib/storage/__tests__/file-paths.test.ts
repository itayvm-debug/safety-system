/**
 * P1·1 / P1·6 — trusted attach validation and safe cleanup.
 *
 * Two companies (A, B). A path issued to A must never be attachable by B;
 * a legacy path referenced only by A must never be attachable by B; cleanup
 * must never delete an object that any row still references.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authorizeMock = vi.fn();
vi.mock('@/lib/storage/authorize', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage/authorize')>('@/lib/storage/authorize');
  return { ...actual, authorizeStorageObjectAccess: (...args: unknown[]) => authorizeMock(...args) };
});

import {
  issueUploadPath,
  isUploadIssuedFor,
  checkAttachablePath,
  validateFileFields,
  removeStorageIfUnreferenced,
  replacedPaths,
  FILE_REFERENCE_COLUMNS,
  cleanupAfterChange,
  AUTO_REMOVE_ON,
} from '@/lib/storage/file-paths';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

/** Fake client: `refs` = set of "table.column=path" that exist; `failTables` error out. */
function fakeSupabase(opts: { refs?: string[]; failTables?: string[]; removeError?: boolean } = {}) {
  const refs = new Set(opts.refs ?? []);
  const removed: string[][] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: string) {
              return {
                limit() {
                  if (opts.failTables?.includes(table)) return Promise.resolve({ data: null, error: { message: 'boom' } });
                  const hit = refs.has(`${table}.${column}=${value}`);
                  return Promise.resolve({ data: hit ? [{ id: 'x' }] : [], error: null });
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          remove(paths: string[]) {
            removed.push(paths);
            return Promise.resolve({ error: opts.removeError ? { message: 'nope' } : null });
          },
        };
      },
    },
  };
  return { client: client as never, removed };
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-for-upload-receipts';
  authorizeMock.mockReset();
  authorizeMock.mockResolvedValue({ allowed: false, reason: 'no_matching_record' });
});

describe('upload receipts', () => {
  it('keeps the existing path shape: folder/timestamp-hex.ext', () => {
    const p = issueUploadPath(A, 'documents', 'pdf', 1_760_000_000_000);
    expect(p).toMatch(/^documents\/1760000000000-[0-9a-f]{32}\.pdf$/);
  });

  it('verifies only for the company it was issued to', () => {
    const p = issueUploadPath(A, 'photos', 'jpg');
    expect(isUploadIssuedFor(p, A)).toBe(true);
    expect(isUploadIssuedFor(p, B)).toBe(false);
  });

  it('rejects tampering with folder, timestamp, nonce or extension', () => {
    const p = issueUploadPath(A, 'documents', 'pdf', 1_760_000_000_000);
    expect(isUploadIssuedFor(p.replace('documents/', 'photos/'), A)).toBe(false);
    expect(isUploadIssuedFor(p.replace('1760000000000', '1760000000001'), A)).toBe(false);
    expect(isUploadIssuedFor(p.replace('.pdf', '.png'), A)).toBe(false);
    const flipped = p.replace(/-(.)/, (_m, c) => `-${c === 'a' ? 'b' : 'a'}`);
    expect(isUploadIssuedFor(flipped, A)).toBe(false);
  });

  it('does not treat legacy (pre-receipt) paths as receipts', () => {
    expect(isUploadIssuedFor('documents/1760000000000-0123456789abcdef.pdf', A)).toBe(false);
  });

  it('a different secret invalidates receipts', () => {
    const p = issueUploadPath(A, 'documents', 'pdf');
    process.env.SESSION_SECRET = 'rotated';
    expect(isUploadIssuedFor(p, A)).toBe(false);
  });
});

describe('checkAttachablePath', () => {
  it('allows clearing the field', async () => {
    const { client } = fakeSupabase();
    for (const v of [null, undefined, '']) {
      expect(await checkAttachablePath({ supabase: client, companyId: A, value: v })).toEqual({ ok: true, path: null });
    }
  });

  it('accepts a receipt issued to the active company', async () => {
    const { client } = fakeSupabase();
    const p = issueUploadPath(A, 'documents', 'pdf');
    expect(await checkAttachablePath({ supabase: client, companyId: A, value: p })).toEqual({ ok: true, path: p });
  });

  it('rejects company B attaching a receipt issued to company A', async () => {
    const { client } = fakeSupabase();
    const p = issueUploadPath(A, 'documents', 'pdf');
    const r = await checkAttachablePath({ supabase: client, companyId: B, value: p });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects company B attaching a legacy path that only company A references', async () => {
    const { client } = fakeSupabase();
    authorizeMock.mockImplementation(async ({ companyId }: { companyId: string }) =>
      companyId === A ? { allowed: true, entityType: 'documents' } : { allowed: false, reason: 'no_matching_record' });
    const legacy = 'documents/1700000000000-0123456789abcdef.pdf';
    expect(await checkAttachablePath({ supabase: client, companyId: A, value: legacy })).toEqual({ ok: true, path: legacy });
    expect(await checkAttachablePath({ supabase: client, companyId: B, value: legacy })).toMatchObject({ ok: false, status: 403 });
  });

  it('keeps an unchanged legacy value on update without re-authorizing', async () => {
    const { client } = fakeSupabase();
    const legacy = 'documents/1700000000000-0123456789abcdef.pdf';
    const r = await checkAttachablePath({ supabase: client, companyId: A, value: legacy, existing: [legacy] });
    expect(r).toEqual({ ok: true, path: legacy });
    expect(authorizeMock).not.toHaveBeenCalled();
  });

  it('rejects traversal and non-string values', async () => {
    const { client } = fakeSupabase();
    expect(await checkAttachablePath({ supabase: client, companyId: A, value: '../etc/passwd' })).toMatchObject({ ok: false, status: 400 });
    expect(await checkAttachablePath({ supabase: client, companyId: A, value: { path: 'x' } })).toMatchObject({ ok: false, status: 400 });
  });
});

describe('validateFileFields', () => {
  it('validates only the fields that were sent and returns normalized values', async () => {
    const { client } = fakeSupabase();
    const p = issueUploadPath(A, 'vehicles', 'jpg');
    const r = await validateFileFields(client, A, { image_url: `/${p}`, notes_url: undefined });
    expect(r).toEqual({ ok: true, values: { image_url: p } });
  });

  it('returns a 403 response for a foreign path', async () => {
    const { client } = fakeSupabase();
    const p = issueUploadPath(A, 'vehicles', 'jpg');
    const r = await validateFileFields(client, B, { image_url: p });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.status).toBe(403);
  });

  // Live QA round 2026-11-18: a PDF was accepted as a vehicle photo (broken <img>)
  it.each(['image_url', 'photo_url'])('refuses a PDF in the photo column %s', async (col) => {
    const { client } = fakeSupabase();
    const r = await validateFileFields(client, A, { [col]: issueUploadPath(A, 'vehicles', 'pdf') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.status).toBe(400);
  });

  it('still accepts images in photo columns and PDFs in document columns, and null clears', async () => {
    const { client } = fakeSupabase();
    const img = issueUploadPath(A, 'photos', 'webp');
    const doc = issueUploadPath(A, 'documents', 'pdf');
    expect((await validateFileFields(client, A, { photo_url: img })).ok).toBe(true);
    expect((await validateFileFields(client, A, { inspection_file_url: doc })).ok).toBe(true);
    expect(await validateFileFields(client, A, { image_url: null })).toEqual({ ok: true, values: { image_url: null } });
  });
});

describe('removeStorageIfUnreferenced', () => {
  it('removes an object that no row references', async () => {
    const { client, removed } = fakeSupabase();
    const r = await removeStorageIfUnreferenced(client, ['documents/old.pdf']);
    expect(r.removed).toEqual(['documents/old.pdf']);
    expect(removed).toEqual([['documents/old.pdf']]);
  });

  it('a removed photo takes its list thumbnail with it (2026-11-20); documents have none', async () => {
    const { client, removed } = fakeSupabase();
    await removeStorageIfUnreferenced(client, ['photos/p.jpg', 'documents/d.pdf']);
    expect(removed).toEqual([['photos/p.jpg', 'documents/d.pdf', 'thumbs/photos/p.jpg']]);
  });

  it('keeps an object still referenced by any table, in any company', async () => {
    const { client, removed } = fakeSupabase({ refs: ['vehicle_licenses.file_url=documents/shared.pdf'] });
    const r = await removeStorageIfUnreferenced(client, ['documents/shared.pdf']);
    expect(r.kept).toEqual(['documents/shared.pdf']);
    expect(removed).toEqual([]);
  });

  it('fails safe: a reference query error keeps the object', async () => {
    const { client, removed } = fakeSupabase({ failTables: ['manager_licenses'] });
    const r = await removeStorageIfUnreferenced(client, ['documents/x.pdf']);
    expect(r.kept).toEqual(['documents/x.pdf']);
    expect(removed).toEqual([]);
  });

  it('reports a storage failure without throwing', async () => {
    const { client } = fakeSupabase({ removeError: true });
    const r = await removeStorageIfUnreferenced(client, ['documents/x.pdf', 'documents/x.pdf', null, '']);
    expect(r.failed).toEqual(['documents/x.pdf']);
  });

  it('covers every table that stores worker-files paths', () => {
    const tables = new Set(FILE_REFERENCE_COLUMNS.map(c => c.table));
    for (const t of ['workers', 'documents', 'safety_briefings', 'height_restrictions', 'professional_licenses',
      'manager_licenses', 'lifting_machine_appointments', 'vehicles', 'vehicle_licenses', 'vehicle_insurances',
      'heavy_equipment', 'heavy_equipment_insurances', 'lifting_equipment']) {
      expect(tables.has(t)).toBe(true);
    }
  });
});

describe('replacedPaths', () => {
  it('returns old values of columns that the update changes', () => {
    expect(replacedPaths({ file_url: 'a', image_url: 'b' }, { file_url: 'c' })).toEqual(['a']);
    expect(replacedPaths({ file_url: 'a' }, { file_url: null })).toEqual(['a']);
    expect(replacedPaths({ file_url: 'a' }, { file_url: 'a' })).toEqual([]);
    expect(replacedPaths({ file_url: null }, { file_url: 'c' })).toEqual([]);
    expect(replacedPaths(null, { file_url: 'c' })).toEqual([]);
  });
});

describe('retention gate (no new automatic deletion until the retention policy is decided)', () => {
  it('keeps files when a record is deleted or its file replaced', async () => {
    for (const trigger of ['file_replaced', 'record_deleted'] as const) {
      const { client, removed } = fakeSupabase();
      expect(await cleanupAfterChange(trigger, client, ['briefings/old.pdf', 'signatures/s.png'])).toBeNull();
      expect(removed).toEqual([]);
    }
  });

  it('keeps only the deletions that existed before this change', () => {
    expect(AUTO_REMOVE_ON).toEqual({
      document_deleted: true,
      height_restriction_deleted: true,
      worker_permanently_deleted: true,
      file_replaced: false,
      record_deleted: false,
    });
  });

  it('a pre-existing deletion still checks references first', async () => {
    const { client, removed } = fakeSupabase({ refs: ['documents.file_url=documents/shared.pdf'] });
    const r = await cleanupAfterChange('document_deleted', client, ['documents/shared.pdf', 'documents/own.pdf']);
    expect(r?.kept).toEqual(['documents/shared.pdf']);
    expect(removed).toEqual([['documents/own.pdf']]);
  });
});
