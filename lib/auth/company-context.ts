import { NextResponse } from 'next/server';
import { getSession } from './session';
import { getActiveCompanyId } from './active-company';
import { createServiceClient } from '@/lib/supabase/server';
import { resolveCompanySettings, type ResolvedCompanySettings } from '@/lib/company/settings';
import type { CompanyRole } from '@/types';

export interface CompanyContext {
  userId:        string;
  email:         string;
  username:      string;
  platformRole:  'admin' | 'user';
  companyId:     string;
  companyName:   string;
  companyRole:   CompanyRole;
  settings:      ResolvedCompanySettings;
}

export type CompanyContextErrorCode =
  | 'NO_SESSION'
  | 'INACTIVE_PROFILE'
  | 'NO_MEMBERSHIP'
  | 'NEEDS_COMPANY_SELECTION'
  | 'INACTIVE_COMPANY'
  | 'FORBIDDEN_ROLE';

type CompanyContextOk  = { context: CompanyContext; error: null; code?: never };
type CompanyContextErr = { context: null; error: NextResponse; code: CompanyContextErrorCode };

export type CompanyContextResult = CompanyContextOk | CompanyContextErr;

function err(code: CompanyContextErrorCode, status: number, message: string): CompanyContextErr {
  return { context: null, error: NextResponse.json({ error: message }, { status }), code };
}

/**
 * Resolves the current authenticated user's company context.
 *
 * Security contract:
 *   - Never trusts companyId from the request — always derived server-side from session + DB
 *   - Verifies session signature, profile.is_active, and active company membership
 *   - Membership resolution:
 *       0 memberships → 403 NO_MEMBERSHIP
 *       1 membership  → auto-selected (cookie not required)
 *       2+ memberships + valid cookie → cookie company used
 *       2+ memberships + no/invalid cookie → 403 NEEDS_COMPANY_SELECTION (caller redirects to /select-company)
 */
export async function getCurrentCompanyContext(): Promise<CompanyContextResult> {
  const session = await getSession();
  if (!session) {
    return err('NO_SESSION', 401, 'לא מורשה — יש להתחבר תחילה');
  }

  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, role')
    .eq('id', session.userId)
    .single();

  if (!profile || !profile.is_active) {
    return err('INACTIVE_PROFILE', 403, 'המשתמש הושבת. פנה למנהל המערכת.');
  }

  const { data: memberships } = await supabase
    .from('company_members')
    .select('company_id, role, is_active')
    .eq('user_id', session.userId)
    .eq('is_active', true);

  if (!memberships || memberships.length === 0) {
    return err('NO_MEMBERSHIP', 403, 'אין שיוך חברה פעיל. פנה למנהל המערכת.');
  }

  let membership: (typeof memberships)[number];

  if (memberships.length === 1) {
    membership = memberships[0];
  } else {
    // 2+ memberships — require an active-company cookie to disambiguate
    const activeId = await getActiveCompanyId();
    const found = activeId ? memberships.find(m => m.company_id === activeId) : undefined;
    if (!found) {
      return err('NEEDS_COMPANY_SELECTION', 403, 'נדרש לבחור חברה פעילה. מועבר לדף בחירת חברה.');
    }
    membership = found;
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, settings, is_active')
    .eq('id', membership.company_id)
    .eq('is_active', true)
    .single();

  if (!company) {
    return err('INACTIVE_COMPANY', 403, 'החברה אינה פעילה. פנה למנהל המערכת.');
  }

  return {
    context: {
      userId:       session.userId,
      email:        session.email,
      username:     session.username,
      platformRole: profile.role as 'admin' | 'user',
      companyId:    company.id,
      companyName:  company.name,
      companyRole:  membership.role as CompanyRole,
      settings:     resolveCompanySettings(company.settings),
    },
    error: null,
  };
}

/**
 * Active membership guard — validates session, active profile, and resolved company membership.
 * Use for read-only operations accessible to any active company member.
 */
export const requireCompanyMember = getCurrentCompanyContext;

/** Require company-level admin role (company_members.role IN ['admin','owner']). */
export async function requireCompanyAdminRole(): Promise<CompanyContextResult> {
  const result = await getCurrentCompanyContext();
  if (result.error) return result;
  if (!['admin', 'owner'].includes(result.context.companyRole)) {
    return err('FORBIDDEN_ROLE', 403, 'פעולה זו מחייבת הרשאת מנהל חברה');
  }
  return result;
}
