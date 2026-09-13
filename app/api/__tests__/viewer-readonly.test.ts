/**
 * Viewer read-only regression tests — VR1-VR22
 *
 * Every mutation endpoint must return 403 when the caller holds
 * company_members.role = 'member'. requireCompanyAdminRole is mocked to
 * simulate the real runtime behaviour for a member (FORBIDDEN_ROLE → 403).
 *
 * Security contract being tested:
 *   companyRole = 'member' → 403 on all company-data write operations.
 *
 * Routes under test:
 *   VR01  POST   /api/workers              create worker
 *   VR02  PATCH  /api/workers/[id]         update worker
 *   VR03  DELETE /api/workers/[id]         archive worker
 *   VR04  POST   /api/vehicles             create vehicle
 *   VR05  PATCH  /api/vehicles/[id]        update vehicle
 *   VR06  DELETE /api/vehicles/[id]        delete vehicle
 *   VR07  POST   /api/subcontractors       create subcontractor
 *   VR08  PATCH  /api/subcontractors/[id]  update subcontractor
 *   VR09  DELETE /api/subcontractors/[id]  delete subcontractor
 *   VR10  POST   /api/documents            upload document metadata
 *   VR11  DELETE /api/documents            delete document
 *   VR12  POST   /api/upload               upload file
 *   VR13  POST   /api/heavy-equipment      create heavy equipment
 *   VR14  PATCH  /api/heavy-equipment/[id] update heavy equipment
 *   VR15  DELETE /api/heavy-equipment/[id] delete heavy equipment
 *   VR16  POST   /api/lifting-equipment    create lifting equipment
 *   VR17  PATCH  /api/lifting-equipment/[id] update lifting equipment
 *   VR18  DELETE /api/lifting-equipment/[id] delete lifting equipment
 *   VR19  POST   /api/entity-notes         create note
 *   VR20  PATCH  /api/entity-notes/[id]    update note
 *   VR21  DELETE /api/entity-notes/[id]    delete note
 *   VR22  PATCH  /api/companies/settings   update company settings
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Auth mock ────────────────────────────────────────────────────────────────
// Simulate requireCompanyAdminRole returning FORBIDDEN_ROLE for a 'member'.

const authMock = vi.hoisted(() => ({ requireCompanyAdminRole: vi.fn() }));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole:  authMock.requireCompanyAdminRole,
  getCurrentCompanyContext: authMock.requireCompanyAdminRole,
  requireCompanyMember:     authMock.requireCompanyAdminRole,
}));

// ─── Supabase mock ────────────────────────────────────────────────────────────
// Minimal mock — auth guard fires before any DB call, so this should never
// be reached. Present only to satisfy module-level imports.

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from:    () => {
      const c: Record<string, unknown> = {};
      const self = c;
      c['select'] = vi.fn(() => self);
      c['insert'] = vi.fn(() => self);
      c['update'] = vi.fn(() => self);
      c['delete'] = vi.fn(() => self);
      c['eq']     = vi.fn(() => self);
      c['neq']    = vi.fn(() => self);
      c['order']  = vi.fn(() => self);
      c['limit']  = vi.fn(() => self);
      c['single']      = vi.fn(() => Promise.resolve({ data: null, error: null }));
      c['maybeSingle'] = vi.fn(() => Promise.resolve({ data: null, error: null }));
      c['then'] = (fn: ((v: unknown) => unknown) | null | undefined) =>
        Promise.resolve({ data: null, error: null }).then(fn ?? undefined);
      return self;
    },
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    auth:    { admin: { createUser: vi.fn(), deleteUser: vi.fn() } },
  }),
}));

// ─── Route imports ────────────────────────────────────────────────────────────

import { POST as workersPost }             from '../workers/route';
import { PATCH as workersPatch,
         DELETE as workersDelete }         from '../workers/[id]/route';
import { POST as vehiclesPost }            from '../vehicles/route';
import { PATCH as vehiclesPatch,
         DELETE as vehiclesDelete }        from '../vehicles/[id]/route';
import { POST as subcontractorsPost }      from '../subcontractors/route';
import { PATCH as subcontractorsPatch,
         DELETE as subcontractorsDelete }  from '../subcontractors/[id]/route';
import { POST as documentsPost,
         DELETE as documentsDelete }       from '../documents/route';
import { POST as uploadPost }              from '../upload/route';
import { POST as heavyPost }               from '../heavy-equipment/route';
import { PATCH as heavyPatch,
         DELETE as heavyDelete }           from '../heavy-equipment/[id]/route';
import { POST as liftingPost }             from '../lifting-equipment/route';
import { PATCH as liftingPatch,
         DELETE as liftingDelete }         from '../lifting-equipment/[id]/route';
import { POST as notesPost }               from '../entity-notes/route';
import { PATCH as notesPatch,
         DELETE as notesDelete }           from '../entity-notes/[id]/route';
import { PATCH as settingsPatch }          from '../companies/settings/route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MEMBER_BLOCKED = {
  context: null,
  error: new Response(JSON.stringify({ error: 'פעולה זו מחייבת הרשאת מנהל חברה' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  }),
  code: 'FORBIDDEN_ROLE' as const,
};

function jsonReq(method: string, path: string, body: Record<string, unknown> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const FAKE_ID = '00000000-0000-0000-0000-000000000099';

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authMock.requireCompanyAdminRole.mockResolvedValue(MEMBER_BLOCKED);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VR01: POST /api/workers — member blocked', () => {
  it('returns 403', async () => {
    const res = await workersPost(jsonReq('POST', '/api/workers', { full_name: 'Test' }));
    expect(res.status).toBe(403);
  });
});

describe('VR02: PATCH /api/workers/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await workersPatch(jsonReq('PATCH', `/api/workers/${FAKE_ID}`), params(FAKE_ID));
    expect(res.status).toBe(403);
  });
});

describe('VR03: DELETE /api/workers/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await workersDelete(
      new NextRequest(`http://localhost/api/workers/${FAKE_ID}`, { method: 'DELETE' }),
      params(FAKE_ID),
    );
    expect(res.status).toBe(403);
  });
});

describe('VR04: POST /api/vehicles — member blocked', () => {
  it('returns 403', async () => {
    const res = await vehiclesPost(jsonReq('POST', '/api/vehicles', { vehicle_number: 'ABC123' }));
    expect(res.status).toBe(403);
  });
});

describe('VR05: PATCH /api/vehicles/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await vehiclesPatch(jsonReq('PATCH', `/api/vehicles/${FAKE_ID}`), params(FAKE_ID));
    expect(res.status).toBe(403);
  });
});

describe('VR06: DELETE /api/vehicles/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await vehiclesDelete(
      new NextRequest(`http://localhost/api/vehicles/${FAKE_ID}`, { method: 'DELETE' }),
      params(FAKE_ID),
    );
    expect(res.status).toBe(403);
  });
});

describe('VR07: POST /api/subcontractors — member blocked', () => {
  it('returns 403', async () => {
    const res = await subcontractorsPost(jsonReq('POST', '/api/subcontractors', { name: 'SubCo' }));
    expect(res.status).toBe(403);
  });
});

describe('VR08: PATCH /api/subcontractors/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await subcontractorsPatch(jsonReq('PATCH', `/api/subcontractors/${FAKE_ID}`), params(FAKE_ID));
    expect(res.status).toBe(403);
  });
});

describe('VR09: DELETE /api/subcontractors/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await subcontractorsDelete(
      new NextRequest(`http://localhost/api/subcontractors/${FAKE_ID}`, { method: 'DELETE' }),
      params(FAKE_ID),
    );
    expect(res.status).toBe(403);
  });
});

describe('VR10: POST /api/documents — member blocked', () => {
  it('returns 403', async () => {
    const res = await documentsPost(jsonReq('POST', '/api/documents', { worker_id: FAKE_ID, doc_type: 'id' }));
    expect(res.status).toBe(403);
  });
});

describe('VR11: DELETE /api/documents — member blocked', () => {
  it('returns 403', async () => {
    const res = await documentsDelete(jsonReq('DELETE', '/api/documents', { id: FAKE_ID }));
    expect(res.status).toBe(403);
  });
});

describe('VR12: POST /api/upload — member blocked', () => {
  it('returns 403', async () => {
    const formData = new FormData();
    formData.append('path', 'test/file.pdf');
    const res = await uploadPost(
      new NextRequest('http://localhost/api/upload', { method: 'POST', body: formData }),
    );
    expect(res.status).toBe(403);
  });
});

describe('VR13: POST /api/heavy-equipment — member blocked', () => {
  it('returns 403', async () => {
    const res = await heavyPost(jsonReq('POST', '/api/heavy-equipment', { description: 'Crane' }));
    expect(res.status).toBe(403);
  });
});

describe('VR14: PATCH /api/heavy-equipment/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await heavyPatch(jsonReq('PATCH', `/api/heavy-equipment/${FAKE_ID}`), params(FAKE_ID));
    expect(res.status).toBe(403);
  });
});

describe('VR15: DELETE /api/heavy-equipment/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await heavyDelete(
      new NextRequest(`http://localhost/api/heavy-equipment/${FAKE_ID}`, { method: 'DELETE' }),
      params(FAKE_ID),
    );
    expect(res.status).toBe(403);
  });
});

describe('VR16: POST /api/lifting-equipment — member blocked', () => {
  it('returns 403', async () => {
    const res = await liftingPost(jsonReq('POST', '/api/lifting-equipment', { description: 'Forklift' }));
    expect(res.status).toBe(403);
  });
});

describe('VR17: PATCH /api/lifting-equipment/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await liftingPatch(jsonReq('PATCH', `/api/lifting-equipment/${FAKE_ID}`), params(FAKE_ID));
    expect(res.status).toBe(403);
  });
});

describe('VR18: DELETE /api/lifting-equipment/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await liftingDelete(
      new NextRequest(`http://localhost/api/lifting-equipment/${FAKE_ID}`, { method: 'DELETE' }),
      params(FAKE_ID),
    );
    expect(res.status).toBe(403);
  });
});

describe('VR19: POST /api/entity-notes — member blocked', () => {
  it('returns 403', async () => {
    const res = await notesPost(jsonReq('POST', '/api/entity-notes', { entity_type: 'worker', entity_id: FAKE_ID, content: 'note' }));
    expect(res.status).toBe(403);
  });
});

describe('VR20: PATCH /api/entity-notes/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await notesPatch(jsonReq('PATCH', `/api/entity-notes/${FAKE_ID}`), params(FAKE_ID));
    expect(res.status).toBe(403);
  });
});

describe('VR21: DELETE /api/entity-notes/[id] — member blocked', () => {
  it('returns 403', async () => {
    const res = await notesDelete(
      new NextRequest(`http://localhost/api/entity-notes/${FAKE_ID}`, { method: 'DELETE' }),
      params(FAKE_ID),
    );
    expect(res.status).toBe(403);
  });
});

describe('VR22: PATCH /api/companies/settings — member blocked', () => {
  it('returns 403', async () => {
    const res = await settingsPatch(jsonReq('PATCH', '/api/companies/settings', { company_name: 'New Name' }));
    expect(res.status).toBe(403);
  });
});
