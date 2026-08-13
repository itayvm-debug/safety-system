/**
 * Platform Users Grouping tests
 *
 * E1 : usersForCompany — user with membership in Company A goes under Company A section
 * E2 : usersForCompany — user with no Company A membership is excluded from that section
 * E3 : usersWithNoActiveCompany — user with 0 active memberships is captured
 * E4 : usersWithNoActiveCompany — user with 1 active membership is excluded
 * E5 : usersWithMultipleCompanies — user in 2 active companies is captured
 * E6 : usersWithMultipleCompanies — user in 1 active company is excluded
 * E7 : applyFilters — search by name filters correctly
 * E8 : applyFilters — accountStatus filter excludes inactive accounts
 * E9 : applyFilters — platformRole filter excludes mismatched roles
 * E10: applyFilters — membershipRole filter includes/excludes by company role
 * E11: collectCompanies — returns unique active companies sorted by name
 * E12: getActiveCompanyMemberships — excludes inactive memberships
 */

import { describe, it, expect } from 'vitest';
import {
  getActiveCompanyMemberships,
  collectCompanies,
  usersForCompany,
  usersWithNoActiveCompany,
  usersWithMultipleCompanies,
  applyFilters,
  type UserWithMemberships,
  type CompanyInfo,
  type Membership,
} from '../UserManagementClient';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COMPANY_A: CompanyInfo = { id: 'cmp-a', name: 'חברה א׳', slug: 'company-a', logo_url: null, is_active: true };
const COMPANY_B: CompanyInfo = { id: 'cmp-b', name: 'חברה ב׳', slug: 'company-b', logo_url: null, is_active: true };
const COMPANY_INACTIVE: CompanyInfo = { id: 'cmp-x', name: 'חברה ישנה', slug: 'old', logo_url: null, is_active: false };

function makeMembership(overrides: Partial<Membership> & { company: CompanyInfo | null }): Membership {
  return {
    id:        `mem-${Math.random().toString(36).slice(2)}`,
    role:      'member',
    is_active: true,
    joined_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserWithMemberships> = {}): UserWithMemberships {
  return {
    id:           `usr-${Math.random().toString(36).slice(2)}`,
    full_name:    'משתמש כלשהו',
    username:     null,
    email:        'user@example.com',
    role:         'user',
    is_active:    true,
    job_title:    null,
    report_email: null,
    created_at:   '2024-01-01T00:00:00Z',
    memberships:  [],
    ...overrides,
  };
}

// ─── E1: usersForCompany — member goes under correct company section ───────────

describe('E1: usersForCompany puts the right user under Company A', () => {
  it('user with active Company A membership appears in Company A results', () => {
    const user = makeUser({
      memberships: [makeMembership({ company: COMPANY_A, is_active: true })],
    });
    const result = usersForCompany([user], COMPANY_A.id);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(user.id);
  });
});

// ─── E2: usersForCompany — non-member excluded ─────────────────────────────────

describe('E2: usersForCompany excludes user not in Company A', () => {
  it('user with only Company B membership is excluded from Company A results', () => {
    const user = makeUser({
      memberships: [makeMembership({ company: COMPANY_B, is_active: true })],
    });
    const result = usersForCompany([user], COMPANY_A.id);
    expect(result).toHaveLength(0);
  });

  it('user with no memberships is excluded from any company results', () => {
    const user = makeUser({ memberships: [] });
    expect(usersForCompany([user], COMPANY_A.id)).toHaveLength(0);
  });
});

// ─── E3: usersWithNoActiveCompany — zero active memberships ───────────────────

describe('E3: usersWithNoActiveCompany captures users with 0 active memberships', () => {
  it('user with no memberships at all is captured', () => {
    const user = makeUser({ memberships: [] });
    expect(usersWithNoActiveCompany([user])).toHaveLength(1);
  });

  it('user with only inactive membership is captured', () => {
    const user = makeUser({
      memberships: [makeMembership({ company: COMPANY_A, is_active: false })],
    });
    expect(usersWithNoActiveCompany([user])).toHaveLength(1);
  });

  it('user with only inactive-company membership is captured', () => {
    const user = makeUser({
      memberships: [makeMembership({ company: COMPANY_INACTIVE, is_active: true })],
    });
    expect(usersWithNoActiveCompany([user])).toHaveLength(1);
  });
});

// ─── E4: usersWithNoActiveCompany — 1 active membership excluded ──────────────

describe('E4: usersWithNoActiveCompany excludes user with an active membership', () => {
  it('user with 1 active Company A membership is not in the no-company section', () => {
    const user = makeUser({
      memberships: [makeMembership({ company: COMPANY_A, is_active: true })],
    });
    expect(usersWithNoActiveCompany([user])).toHaveLength(0);
  });
});

// ─── E5: usersWithMultipleCompanies — 2 active memberships captured ───────────

describe('E5: usersWithMultipleCompanies captures user in 2+ active companies', () => {
  it('user in Company A and Company B is captured', () => {
    const user = makeUser({
      memberships: [
        makeMembership({ company: COMPANY_A, is_active: true }),
        makeMembership({ company: COMPANY_B, is_active: true }),
      ],
    });
    expect(usersWithMultipleCompanies([user])).toHaveLength(1);
  });
});

// ─── E6: usersWithMultipleCompanies — 1 active membership excluded ────────────

describe('E6: usersWithMultipleCompanies excludes user with only 1 active membership', () => {
  it('user in exactly 1 active company is not in the multi-company section', () => {
    const user = makeUser({
      memberships: [
        makeMembership({ company: COMPANY_A, is_active: true }),
        makeMembership({ company: COMPANY_B, is_active: false }),
      ],
    });
    expect(usersWithMultipleCompanies([user])).toHaveLength(0);
  });
});

// ─── E7: applyFilters — search by name ────────────────────────────────────────

describe('E7: applyFilters — search by full_name', () => {
  const users = [
    makeUser({ full_name: 'דוד כהן',  email: 'david@a.com' }),
    makeUser({ full_name: 'משה לוי',  email: 'moshe@b.com' }),
  ];

  it('search "דוד" returns only the matching user', () => {
    const result = applyFilters(users, { search: 'דוד', accountStatus: 'all', platformRole: 'all', membershipRole: 'all', multiCompanyOnly: false });
    expect(result).toHaveLength(1);
    expect(result[0].full_name).toBe('דוד כהן');
  });

  it('empty search returns all users', () => {
    const result = applyFilters(users, { search: '', accountStatus: 'all', platformRole: 'all', membershipRole: 'all', multiCompanyOnly: false });
    expect(result).toHaveLength(2);
  });

  it('search by email address works', () => {
    const result = applyFilters(users, { search: 'moshe', accountStatus: 'all', platformRole: 'all', membershipRole: 'all', multiCompanyOnly: false });
    expect(result).toHaveLength(1);
    expect(result[0].full_name).toBe('משה לוי');
  });
});

// ─── E8: applyFilters — accountStatus filter ─────────────────────────────────

describe('E8: applyFilters — accountStatus excludes inactive accounts', () => {
  const users = [
    makeUser({ full_name: 'פעיל',    is_active: true  }),
    makeUser({ full_name: 'מושבת',   is_active: false }),
  ];

  it('accountStatus=active returns only active users', () => {
    const result = applyFilters(users, { search: '', accountStatus: 'active', platformRole: 'all', membershipRole: 'all', multiCompanyOnly: false });
    expect(result).toHaveLength(1);
    expect(result[0].full_name).toBe('פעיל');
  });

  it('accountStatus=inactive returns only inactive users', () => {
    const result = applyFilters(users, { search: '', accountStatus: 'inactive', platformRole: 'all', membershipRole: 'all', multiCompanyOnly: false });
    expect(result).toHaveLength(1);
    expect(result[0].full_name).toBe('מושבת');
  });

  it('accountStatus=all returns both', () => {
    const result = applyFilters(users, { search: '', accountStatus: 'all', platformRole: 'all', membershipRole: 'all', multiCompanyOnly: false });
    expect(result).toHaveLength(2);
  });
});

// ─── E9: applyFilters — platformRole filter ───────────────────────────────────

describe('E9: applyFilters — platformRole filter', () => {
  const users = [
    makeUser({ full_name: 'מנהל',   role: 'admin' }),
    makeUser({ full_name: 'משתמש',  role: 'user'  }),
  ];

  it('platformRole=admin returns only platform admins', () => {
    const result = applyFilters(users, { search: '', accountStatus: 'all', platformRole: 'admin', membershipRole: 'all', multiCompanyOnly: false });
    expect(result).toHaveLength(1);
    expect(result[0].full_name).toBe('מנהל');
  });

  it('platformRole=user returns only non-admin users', () => {
    const result = applyFilters(users, { search: '', accountStatus: 'all', platformRole: 'user', membershipRole: 'all', multiCompanyOnly: false });
    expect(result).toHaveLength(1);
    expect(result[0].full_name).toBe('משתמש');
  });
});

// ─── E10: applyFilters — membershipRole filter ────────────────────────────────

describe('E10: applyFilters — membershipRole filter', () => {
  const owner = makeUser({
    full_name: 'בעלים',
    memberships: [makeMembership({ company: COMPANY_A, role: 'owner', is_active: true })],
  });
  const member = makeUser({
    full_name: 'משתמש חברה',
    memberships: [makeMembership({ company: COMPANY_A, role: 'member', is_active: true })],
  });

  it('membershipRole=owner returns only owners', () => {
    const result = applyFilters([owner, member], { search: '', accountStatus: 'all', platformRole: 'all', membershipRole: 'owner', multiCompanyOnly: false });
    expect(result).toHaveLength(1);
    expect(result[0].full_name).toBe('בעלים');
  });

  it('membershipRole=member returns only members', () => {
    const result = applyFilters([owner, member], { search: '', accountStatus: 'all', platformRole: 'all', membershipRole: 'member', multiCompanyOnly: false });
    expect(result).toHaveLength(1);
    expect(result[0].full_name).toBe('משתמש חברה');
  });
});

// ─── E11: collectCompanies — unique and sorted ────────────────────────────────

describe('E11: collectCompanies returns unique active companies sorted by name', () => {
  it('deduplicates repeated company across users', () => {
    const users = [
      makeUser({ memberships: [makeMembership({ company: COMPANY_A, is_active: true })] }),
      makeUser({ memberships: [makeMembership({ company: COMPANY_A, is_active: true })] }),
    ];
    const companies = collectCompanies(users);
    expect(companies).toHaveLength(1);
    expect(companies[0].id).toBe(COMPANY_A.id);
  });

  it('ignores inactive companies', () => {
    const user = makeUser({ memberships: [makeMembership({ company: COMPANY_INACTIVE, is_active: true })] });
    const companies = collectCompanies([user]);
    expect(companies).toHaveLength(0);
  });

  it('collects both Company A and B when present', () => {
    const users = [
      makeUser({ memberships: [makeMembership({ company: COMPANY_A, is_active: true })] }),
      makeUser({ memberships: [makeMembership({ company: COMPANY_B, is_active: true })] }),
    ];
    const companies = collectCompanies(users);
    expect(companies).toHaveLength(2);
  });
});

// ─── E12: getActiveCompanyMemberships — excludes inactive memberships ─────────

describe('E12: getActiveCompanyMemberships excludes inactive memberships', () => {
  it('includes only active memberships with active companies', () => {
    const user = makeUser({
      memberships: [
        makeMembership({ company: COMPANY_A,        is_active: true  }),
        makeMembership({ company: COMPANY_B,        is_active: false }),
        makeMembership({ company: COMPANY_INACTIVE, is_active: true  }),
      ],
    });
    const active = getActiveCompanyMemberships(user);
    expect(active).toHaveLength(1);
    expect(active[0].company?.id).toBe(COMPANY_A.id);
  });

  it('returns empty array for user with no memberships', () => {
    const user = makeUser({ memberships: [] });
    expect(getActiveCompanyMemberships(user)).toHaveLength(0);
  });
});
