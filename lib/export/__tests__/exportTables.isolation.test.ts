/**
 * F-04 — export isolation tests
 * Verifies:
 *   1. authorized_phones is NOT exported (platform-only table)
 *   2. profiles is filtered to company members via .in('id', memberUserIds)
 *   3. legal_acceptances is filtered to company members via .in('user_id', memberUserIds)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MEMBER_USER_1 = 'user-m1-0000-0000-0000-000000000001';
const MEMBER_USER_2 = 'user-m2-0000-0000-0000-000000000002';
const OTHER_USER    = 'user-ot-0000-0000-0000-000000000099';

// Track which .in() calls were made per table and what the full select returned
const queryLog = vi.hoisted(() => ({
  inCalls: {} as Record<string, Array<{ field: string; values: string[] }>>,
  tablesQueried: [] as string[],
  reset() {
    this.inCalls = {};
    this.tablesQueried = [];
  },
}));

// Per-table response data (configure per test)
const tableData = vi.hoisted(() => ({
  data: {} as Record<string, unknown[]>,
  set(table: string, rows: unknown[]) { this.data[table] = rows; },
  get(table: string) { return this.data[table] ?? []; },
  reset() { this.data = {}; },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      queryLog.tablesQueried.push(table);
      if (!queryLog.inCalls[table]) queryLog.inCalls[table] = [];
      const chain: Record<string, unknown> = {};
      const self = chain;
      chain.select = vi.fn(() => self);
      chain.eq = vi.fn(() => self);
      chain.in = vi.fn((field: string, values: string[]) => {
        queryLog.inCalls[table].push({ field, values });
        return self;
      });
      chain.order = vi.fn(() => self);
      chain.limit = vi.fn(() => Promise.resolve({
        data: tableData.get(table),
        error: null,
      }));
      return chain;
    },
  }),
}));

import { exportAllTables } from '../exportTables';

beforeEach(() => {
  vi.clearAllMocks();
  queryLog.reset();
  tableData.reset();
  // Defaults: empty for most tables
  tableData.set('company_members', [
    { user_id: MEMBER_USER_1 },
    { user_id: MEMBER_USER_2 },
  ]);
  tableData.set('workers', []);
  tableData.set('profiles', [
    { id: MEMBER_USER_1, email: 'a@b.com' },
    { id: MEMBER_USER_2, email: 'c@d.com' },
    // OTHER_USER is NOT a member — must not appear in filtered result
    { id: OTHER_USER, email: 'evil@other.com' },
  ]);
  tableData.set('legal_acceptances', [
    { id: 'la-1', user_id: MEMBER_USER_1 },
    { id: 'la-2', user_id: OTHER_USER },
  ]);
});

describe('F-04 — export authorized_phones exclusion', () => {
  it('authorized_phones is not queried and not in results', async () => {
    const results = await exportAllTables(COMPANY_A);

    // Never queried
    expect(queryLog.tablesQueried).not.toContain('authorized_phones');
    // Not in results
    expect(results.find(r => r.table === 'authorized_phones')).toBeUndefined();
  });
});

describe('F-04 — export profiles filtered to company members', () => {
  it('profiles is queried with .in("id", memberUserIds)', async () => {
    await exportAllTables(COMPANY_A);

    const profileInCalls = queryLog.inCalls['profiles'] ?? [];
    expect(profileInCalls.length).toBeGreaterThan(0);

    const firstCall = profileInCalls[0];
    expect(firstCall.field).toBe('id');
    // Member IDs must be present in the filter
    expect(firstCall.values).toContain(MEMBER_USER_1);
    expect(firstCall.values).toContain(MEMBER_USER_2);
    // Non-member must not be in the filter values
    expect(firstCall.values).not.toContain(OTHER_USER);
  });

  it('profiles result table is present in export output', async () => {
    const results = await exportAllTables(COMPANY_A);
    expect(results.find(r => r.table === 'profiles')).toBeDefined();
  });
});

describe('F-04 — export legal_acceptances filtered to company members', () => {
  it('legal_acceptances is queried with .in("user_id", memberUserIds)', async () => {
    await exportAllTables(COMPANY_A);

    const legalInCalls = queryLog.inCalls['legal_acceptances'] ?? [];
    expect(legalInCalls.length).toBeGreaterThan(0);

    const firstCall = legalInCalls[0];
    expect(firstCall.field).toBe('user_id');
    expect(firstCall.values).toContain(MEMBER_USER_1);
    expect(firstCall.values).not.toContain(OTHER_USER);
  });
});

describe('F-04 — export returns empty when company has no members', () => {
  it('profiles and legal_acceptances are empty when company_members is empty', async () => {
    tableData.set('company_members', []);

    const results = await exportAllTables(COMPANY_A);

    const profilesResult = results.find(r => r.table === 'profiles');
    const legalResult = results.find(r => r.table === 'legal_acceptances');

    expect(profilesResult?.rowCount).toBe(0);
    expect(legalResult?.rowCount).toBe(0);

    // profiles should NOT be queried when there are no members
    expect(queryLog.inCalls['profiles'] ?? []).toHaveLength(0);
    expect(queryLog.inCalls['legal_acceptances'] ?? []).toHaveLength(0);
  });
});
