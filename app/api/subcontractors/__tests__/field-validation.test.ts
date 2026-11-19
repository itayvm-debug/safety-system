/**
 * Live QA round (2026-11-18): a subcontractor was saved with the phone "abc", and a non-string
 * name crashed the route (500). Subcontractor and worker writes now validate free-text fields.
 * No DB: the Supabase client is a recording fake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { optionalPhone, optionalText } from '@/lib/validation/fields';

const COMPANY = 'bbbbbbbb-0000-0000-0000-000000000002';

vi.mock('@/lib/auth/company-context', () => {
  const ok = async () => ({ context: { companyId: 'bbbbbbbb-0000-0000-0000-000000000002', userId: 'u1', role: 'admin' }, error: null });
  return { requireCompanyAdminRole: ok, getCurrentCompanyContext: ok };
});

const db = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  existing: { id: 's1', phone: '050 123 (old)' } as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'eq', 'neq', 'order']) chain[m] = vi.fn(() => chain);
    chain.insert = vi.fn((row: Record<string, unknown>) => { db.inserted = row; return chain; });
    chain.update = vi.fn((row: Record<string, unknown>) => { db.updated = row; return chain; });
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: db.existing, error: null }));
    chain.single = vi.fn(() => Promise.resolve({ data: { id: 's1', ...(db.inserted ?? db.updated ?? {}) }, error: null }));
    return chain;
  },
}));

import { POST } from '../route';
import { PATCH } from '../[id]/route';

const req = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/subcontractors', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: 's1' }) };

beforeEach(() => { db.inserted = null; db.updated = null; db.existing = { id: 's1', phone: '050 123 (old)' }; });

describe('optionalPhone / optionalText', () => {
  it('accepts common Israeli and international formats', () => {
    for (const p of ['0501234567', '050-123-4567', '03 1234567', '+972-50-123-4567', '(03) 123-4567']) {
      expect(optionalPhone(p)).toEqual({ ok: true, value: p });
    }
    expect(optionalPhone('  ')).toEqual({ ok: true, value: null });
    expect(optionalPhone(null)).toEqual({ ok: true, value: null });
  });

  it('refuses letters, too few/many digits and non-strings', () => {
    for (const p of ['abc', '050-abc-4567', '12345', '1234567890123456', 501234567, {}]) {
      expect(optionalPhone(p).ok).toBe(false);
    }
  });

  it('keeps an unchanged legacy value', () => {
    expect(optionalPhone('נייד: 050', 'נייד: 050')).toEqual({ ok: true, value: 'נייד: 050' });
    expect(optionalPhone('נייד: 051', 'נייד: 050').ok).toBe(false);
  });

  it('refuses non-strings and over-long text', () => {
    expect(optionalText(42, 'שם').ok).toBe(false);
    expect(optionalText('x'.repeat(201), 'שם', 200).ok).toBe(false);
    expect(optionalText('  שלום ', 'שם')).toEqual({ ok: true, value: 'שלום' });
  });
});

describe('POST /api/subcontractors', () => {
  it('refuses the phone "abc" (was saved before)', async () => {
    const res = await POST(req('POST', { name: 'קבלן', phone: 'abc' }));
    expect(res.status).toBe(400);
    expect(db.inserted).toBeNull();
  });

  it('refuses a non-string name with 400, not a crash', async () => {
    const res = await POST(req('POST', { name: 12345 }));
    expect(res.status).toBe(400);
  });

  it('saves a valid subcontractor', async () => {
    const res = await POST(req('POST', { name: ' קבלן ', phone: '050-1234567', contact_name: '', notes: null }));
    expect(res.status).toBe(201);
    expect(db.inserted).toMatchObject({ company_id: COMPANY, name: 'קבלן', phone: '050-1234567', contact_name: null });
  });
});

describe('PATCH /api/subcontractors/[id]', () => {
  it('refuses an invalid new phone', async () => {
    const res = await PATCH(req('PATCH', { phone: 'abc' }), params);
    expect(res.status).toBe(400);
    expect(db.updated).toBeNull();
  });

  it('lets an edit through when the stored legacy phone is sent back unchanged', async () => {
    const res = await PATCH(req('PATCH', { name: 'קבלן חדש', phone: '050 123 (old)' }), params);
    expect(res.status).toBe(200);
    expect(db.updated).toMatchObject({ name: 'קבלן חדש', phone: '050 123 (old)' });
  });

  it('a malformed responsible_worker_id is a 400, not "worker not found"', async () => {
    const res = await PATCH(req('PATCH', { responsible_worker_id: 5 }), params);
    expect(res.status).toBe(400);
  });

  it('refuses a non-boolean is_archived', async () => {
    const res = await PATCH(req('PATCH', { is_archived: 'yes' }), params);
    expect(res.status).toBe(400);
  });
});
