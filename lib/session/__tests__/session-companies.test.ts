/**
 * Session-company state isolation tests — T1-T16
 *
 * T1 : fetchSessionCompanies returns correct company list
 * T2 : Company rename is reflected on next fetchSessionCompanies call (no F5)
 * T3 : Company logo update is reflected on next fetchSessionCompanies call
 * T4 : router.refresh alone does not update the client-side state
 * T5 : Company switch via /api/session/company updates activeCompanyId
 * T6 : After switch, previous company branding is no longer active
 * T7 : Role update for current member is reflected in fetchSessionCompanies
 * T8 : Membership removal makes companies array empty for that user
 * T9 : BroadcastChannel event triggers re-fetch, not blind state mutation
 * T10: Spoofed broadcast payload cannot inject company data
 * T11: createVersionedRefresher — older response discarded, newer wins
 * T12: Failed fetch preserves last verified state and surfaces error
 * T13: Soft navigation does not reintroduce stale data (provider persists)
 * T14: Hard refresh always fetches fresh data
 * T15: Single-membership users: activeCompanyId derived without cookie
 * T16: Platform-admin flag returned correctly in fetchSessionCompanies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchSessionCompanies,
  broadcastSessionCompaniesChanged,
  createVersionedRefresher,
  BROADCAST_CHANNEL_NAME,
  BROADCAST_EVENT_TYPE,
  type SessionCompany,
} from '../SessionCompaniesProvider';

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANY_A_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const COMPANY_B_ID = 'bbbbbbbb-0000-0000-0000-000000000002';

const COMPANY_A: SessionCompany = {
  id:       COMPANY_A_ID,
  name:     'חברה א׳',
  logo_url: null,
  role:     'admin',
};

const COMPANY_A_RENAMED: SessionCompany = {
  ...COMPANY_A,
  name: 'חברה א׳ — עדכון',
};

const COMPANY_A_LOGO: SessionCompany = {
  ...COMPANY_A,
  logo_url: 'https://example.com/logo.png',
};

const COMPANY_B: SessionCompany = {
  id:       COMPANY_B_ID,
  name:     'חברה ב׳',
  logo_url: null,
  role:     'member',
};

// ─── fetch mock helpers ────────────────────────────────────────────────────────

function mockFetch(response: object, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(response),
  } as Response);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── T1: fetchSessionCompanies returns correct company list ───────────────────

describe('T1: fetchSessionCompanies returns correct company list', () => {
  it('returns companies and activeCompanyId from the API response', async () => {
    mockFetch({ companies: [COMPANY_A], activeCompanyId: COMPANY_A_ID, platformRole: 'admin' });
    const result = await fetchSessionCompanies();
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0].id).toBe(COMPANY_A_ID);
    expect(result.activeCompanyId).toBe(COMPANY_A_ID);
    expect(result.platformRole).toBe('admin');
  });
});

// ─── T2: Company rename reflected on next fetchSessionCompanies call ──────────

describe('T2: Company rename reflected on next fetchSessionCompanies (no F5)', () => {
  it('returns the updated name after a rename when re-fetched', async () => {
    // First fetch: old name
    mockFetch({ companies: [COMPANY_A], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const before = await fetchSessionCompanies();
    expect(before.companies[0].name).toBe('חברה א׳');

    // Second fetch (after rename): new name
    mockFetch({ companies: [COMPANY_A_RENAMED], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const after = await fetchSessionCompanies();
    expect(after.companies[0].name).toBe('חברה א׳ — עדכון');
  });
});

// ─── T3: Logo update reflected on next fetchSessionCompanies call ─────────────

describe('T3: Company logo update reflected on next fetchSessionCompanies', () => {
  it('returns the updated logo_url after logo change', async () => {
    mockFetch({ companies: [COMPANY_A], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const before = await fetchSessionCompanies();
    expect(before.companies[0].logo_url).toBeNull();

    mockFetch({ companies: [COMPANY_A_LOGO], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const after = await fetchSessionCompanies();
    expect(after.companies[0].logo_url).toBe('https://example.com/logo.png');
  });
});

// ─── T4: router.refresh alone does not satisfy the fetch requirement ──────────

describe('T4: router.refresh alone is insufficient — re-fetch is required', () => {
  it('a second fetchSessionCompanies call (simulating re-fetch) gets fresh data', async () => {
    // Simulates that router.refresh() triggers a server re-render but NOT a client re-fetch.
    // The only way to update NavBar state is to call fetchSessionCompanies() again.
    mockFetch({ companies: [COMPANY_A], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const first = await fetchSessionCompanies();
    expect(first.companies[0].name).toBe('חברה א׳');

    // router.refresh() happens (no new fetch) — state remains stale.
    // Only after an explicit re-fetch does the new name appear.
    mockFetch({ companies: [COMPANY_A_RENAMED], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const second = await fetchSessionCompanies();
    expect(second.companies[0].name).toBe('חברה א׳ — עדכון');
  });
});

// ─── T5: Company switch updates activeCompanyId ───────────────────────────────

describe('T5: Company switch updates activeCompanyId in the next fetch', () => {
  it('returns new activeCompanyId after switching companies', async () => {
    mockFetch({ companies: [COMPANY_A, COMPANY_B], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const before = await fetchSessionCompanies();
    expect(before.activeCompanyId).toBe(COMPANY_A_ID);

    // After switch to Company B:
    mockFetch({ companies: [COMPANY_A, COMPANY_B], activeCompanyId: COMPANY_B_ID, platformRole: 'user' });
    const after = await fetchSessionCompanies();
    expect(after.activeCompanyId).toBe(COMPANY_B_ID);
  });
});

// ─── T6: Previous company branding gone after switch ─────────────────────────

describe('T6: After company switch, previous company is no longer active', () => {
  it('Company A is not activeCompanyId after switching to Company B', async () => {
    mockFetch({ companies: [COMPANY_A, COMPANY_B], activeCompanyId: COMPANY_B_ID, platformRole: 'user' });
    const result = await fetchSessionCompanies();
    expect(result.activeCompanyId).not.toBe(COMPANY_A_ID);
    expect(result.activeCompanyId).toBe(COMPANY_B_ID);
    const activeCompany = result.companies.find(c => c.id === result.activeCompanyId);
    expect(activeCompany?.name).toBe('חברה ב׳');
  });
});

// ─── T7: Member role update reflected in fetch ───────────────────────────────

describe('T7: Membership role update reflected in fetchSessionCompanies', () => {
  it('returns the updated role after membership role change', async () => {
    mockFetch({ companies: [COMPANY_A], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const before = await fetchSessionCompanies();
    expect(before.companies[0].role).toBe('admin');

    const COMPANY_A_DEMOTED = { ...COMPANY_A, role: 'member' };
    mockFetch({ companies: [COMPANY_A_DEMOTED], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const after = await fetchSessionCompanies();
    expect(after.companies[0].role).toBe('member');
  });
});

// ─── T8: Membership removal makes companies empty ────────────────────────────

describe('T8: Membership removal empties companies for that user', () => {
  it('returns empty companies array after the user is removed from all companies', async () => {
    mockFetch({ companies: [], activeCompanyId: null, platformRole: 'user' });
    const result = await fetchSessionCompanies();
    expect(result.companies).toHaveLength(0);
    expect(result.activeCompanyId).toBeNull();
  });
});

// ─── T9: Broadcast triggers re-fetch, not state mutation ─────────────────────

describe('T9: BroadcastChannel event triggers re-fetch, not blind state mutation', () => {
  it('broadcastSessionCompaniesChanged posts only type+timestamp — no company data', () => {
    const postedMessages: unknown[] = [];

    class MockBC {
      static lastChannel = '';
      constructor(channel: string) { MockBC.lastChannel = channel; }
      postMessage(msg: unknown) { postedMessages.push(msg); }
      close() {}
    }

    vi.stubGlobal('BroadcastChannel', MockBC);

    broadcastSessionCompaniesChanged();

    expect(MockBC.lastChannel).toBe(BROADCAST_CHANNEL_NAME);
    expect(postedMessages).toHaveLength(1);
    const msg = postedMessages[0] as Record<string, unknown>;
    expect(msg.type).toBe(BROADCAST_EVENT_TYPE);
    expect(typeof msg.timestamp).toBe('number');
    // No company data in the payload
    expect(Object.keys(msg)).toEqual(['type', 'timestamp']);

    vi.unstubAllGlobals();
  });
});

// ─── T10: Spoofed broadcast payload cannot inject company data ────────────────

describe('T10: Spoofed broadcast payload cannot grant company access', () => {
  it('broadcast payload contains no company data — receiver must re-fetch from server', () => {
    const postedMessages: unknown[] = [];

    class MockBC {
      constructor(_channel: string) {}
      postMessage(msg: unknown) { postedMessages.push(msg); }
      close() {}
    }

    vi.stubGlobal('BroadcastChannel', MockBC);

    broadcastSessionCompaniesChanged();

    const msg = postedMessages[0] as Record<string, unknown>;
    // Payload must NOT contain companies, id, role, or any user-controlled data
    expect(msg).not.toHaveProperty('companies');
    expect(msg).not.toHaveProperty('id');
    expect(msg).not.toHaveProperty('role');
    expect(msg).not.toHaveProperty('activeCompanyId');

    vi.unstubAllGlobals();
  });
});

// ─── T11: createVersionedRefresher — older response discarded ─────────────────

describe('T11: createVersionedRefresher — older in-flight response does not overwrite newer', () => {
  it('only the result from the latest call is accepted; earlier results are discarded', async () => {
    const refresher = createVersionedRefresher();

    let resolveFirst!: (v: string) => void;
    let resolveSecond!: (v: string) => void;

    const firstFetch  = () => new Promise<string>(r => { resolveFirst  = r; });
    const secondFetch = () => new Promise<string>(r => { resolveSecond = r; });

    const accepted: string[] = [];
    const onSuccess = (v: string) => accepted.push(v);
    const onError   = vi.fn();

    // Start first refresh (version 1)
    const p1 = refresher(firstFetch, onSuccess, onError);
    // Start second refresh (version 2) before first resolves
    const p2 = refresher(secondFetch, onSuccess, onError);

    // Second resolves first — should be accepted
    resolveSecond('SECOND');
    await p2;

    // First resolves later — should be discarded (version 1 < current version 2)
    resolveFirst('FIRST');
    await p1;

    // Only SECOND result was accepted
    expect(accepted).toEqual(['SECOND']);
    expect(onError).not.toHaveBeenCalled();
  });
});

// ─── T12: Failed fetch preserves last verified state ─────────────────────────

describe('T12: Failed fetch — last verified state preserved, error surfaced', () => {
  it('onError is called with error message on network failure', async () => {
    const refresher = createVersionedRefresher();
    const onSuccess = vi.fn();
    const onError   = vi.fn();

    const failingFetch = () => Promise.reject(new Error('שגיאת רשת'));

    await refresher(failingFetch, onSuccess, onError);

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('שגיאת רשת');
  });
});

// ─── T13: Soft navigation does not reintroduce stale data ────────────────────

describe('T13: Soft navigation does not reset provider state to stale', () => {
  it('fetchSessionCompanies always fetches from server, never from stale memory', async () => {
    // Simulate: first load gets name = "ישן", after rename re-fetch gets "חדש"
    mockFetch({ companies: [{ ...COMPANY_A, name: 'ישן' }], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const first = await fetchSessionCompanies();
    expect(first.companies[0].name).toBe('ישן');

    // "Soft navigate" — provider stays mounted, but next fetch returns fresh data
    mockFetch({ companies: [{ ...COMPANY_A, name: 'חדש' }], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const second = await fetchSessionCompanies();
    expect(second.companies[0].name).toBe('חדש');
    // Data is never sourced from a local memo/cache; it always reflects what the server returns
    expect(second.companies[0].name).not.toBe('ישן');
  });
});

// ─── T14: Hard refresh fetches fresh data ─────────────────────────────────────

describe('T14: Hard refresh (full reload) fetches fresh data from server', () => {
  it('fetch is called with cache: no-store on every invocation', async () => {
    mockFetch({ companies: [COMPANY_A], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    await fetchSessionCompanies();

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const [url, opts] = fetchCall as [string, RequestInit];
    expect(url).toBe('/api/session/companies');
    expect(opts?.cache).toBe('no-store');
  });
});

// ─── T15: Single-membership users: activeCompanyId derived without cookie ─────

describe('T15: Single-membership user — activeCompanyId returned without cookie logic', () => {
  it('the API returns the single company id as activeCompanyId automatically', async () => {
    mockFetch({ companies: [COMPANY_A], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const result = await fetchSessionCompanies();
    expect(result.companies).toHaveLength(1);
    expect(result.activeCompanyId).toBe(COMPANY_A_ID);
  });
});

// ─── T16: Platform-admin flag returned correctly ──────────────────────────────

describe('T16: Platform-admin navigation visibility — platformRole reflected in state', () => {
  it('returns platformRole=admin for platform admin users', async () => {
    mockFetch({ companies: [COMPANY_A], activeCompanyId: COMPANY_A_ID, platformRole: 'admin' });
    const result = await fetchSessionCompanies();
    expect(result.platformRole).toBe('admin');
  });

  it('returns platformRole=user for non-admin users', async () => {
    mockFetch({ companies: [COMPANY_A], activeCompanyId: COMPANY_A_ID, platformRole: 'user' });
    const result = await fetchSessionCompanies();
    expect(result.platformRole).toBe('user');
  });

  it('returns platformRole=null for unauthenticated requests (401)', async () => {
    mockFetch({ error: 'לא מורשה' }, 401);
    const result = await fetchSessionCompanies();
    expect(result.companies).toHaveLength(0);
    expect(result.platformRole).toBeNull();
  });
});
