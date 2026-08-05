import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getActiveCompanyId } from '@/lib/auth/active-company';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/session/companies
 * Returns the current user's active company memberships + the currently selected company ID.
 * Used by NavBar (company switcher) and /select-company page.
 * Requires: valid session. Does NOT require a company context.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: rows, error: dbErr } = await supabase
    .from('company_members')
    .select('company_id, role, companies(id, name, logo_url, is_active)')
    .eq('user_id', session.userId)
    .eq('is_active', true);

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  type CompanyRow = { id: string; name: string; logo_url: string | null; is_active: boolean };

  const companies = (rows ?? [])
    .filter(r => {
      const c = (r.companies as unknown) as CompanyRow | null;
      return c?.is_active === true;
    })
    .map(r => {
      const c = (r.companies as unknown) as CompanyRow;
      return {
        id:       c.id,
        name:     c.name,
        logo_url: c.logo_url,
        role:     r.role,
      };
    });

  // Resolve active company: auto for single membership, cookie for multiple
  let activeCompanyId: string | null = null;
  if (companies.length === 1) {
    activeCompanyId = companies[0].id;
  } else if (companies.length > 1) {
    const cookieId = await getActiveCompanyId();
    if (cookieId && companies.some(c => c.id === cookieId)) {
      activeCompanyId = cookieId;
    }
  }

  return NextResponse.json({ companies, activeCompanyId });
}
