/**
 * P1·2 — platform-admin server pages must re-check role and active state in the DB.
 *
 * Before the fix /admin/companies* and /feedback trusted `session.role` from the
 * cookie, so a demoted or deactivated platform admin kept read access for up to
 * 7 days. Here the cookie is irrelevant: the DB check (requirePlatformAdmin) says no.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let dbSaysAdmin = false;
const fromSpy = vi.fn(() => ({
  select: () => ({ order: async () => ({ data: [], error: null }), eq: () => ({ single: async () => ({ data: null }) }) }),
}));

vi.mock('@/lib/auth/api', () => ({
  requirePlatformAdmin: async () => (dbSaysAdmin ? { session: {}, error: null } : { session: null, error: {} }),
}));
vi.mock('@/lib/auth/session', () => ({
  // A cookie that still claims admin — must not be enough
  getSession: async () => ({ userId: 'u', email: 'e', username: 'u', role: 'admin', loginAt: Date.now() }),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: fromSpy }) }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
vi.mock('next/link', () => ({ default: () => null }));
vi.mock('@/components/FeedbackPage', () => ({ default: () => null }));
vi.mock('@/components/NavBar', () => ({ default: () => null }));
vi.mock('@/components/AdminSubNav', () => ({ default: () => null }));
vi.mock('@/app/admin/companies/CompaniesClient', () => ({ default: () => null }));

import CompaniesPage from '@/app/admin/companies/page';
import FeedbackAdminPage from '@/app/feedback/page';
import AdminLayout from '@/app/admin/layout';

beforeEach(() => { dbSaysAdmin = false; fromSpy.mockClear(); });

describe('platform admin pages', () => {
  it('redirect a demoted admin even though the cookie still says admin', async () => {
    await expect(CompaniesPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    await expect(FeedbackAdminPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('render for an admin confirmed by the DB', async () => {
    dbSaysAdmin = true;
    await expect(FeedbackAdminPage()).resolves.toBeTruthy();
    await expect(AdminLayout({ children: null })).resolves.toBeTruthy();
  });
});
