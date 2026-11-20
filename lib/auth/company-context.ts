import { NextResponse } from 'next/server';
import { getSession } from './session';
import { getActiveCompanyId } from './active-company';
import { createServiceClient } from '@/lib/supabase/server';
import { resolveCompanySettings, type ResolvedCompanySettings } from '@/lib/company/settings';
import { reportServerError } from '@/lib/monitoring/server-errors';
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
  | 'FORBIDDEN_ROLE'
  | 'DB_UNAVAILABLE';

/** Shown when the database did not answer (not "user disabled" — that was the old, wrong message). */
export const DB_UNAVAILABLE_MESSAGE = 'תקלה זמנית בחיבור לשרת. נסה שוב בעוד רגע.';

/** `.single()` with no row is "not found", not a database failure. */
function isDbFailure(error: { code?: string } | null): boolean {
  return !!error && error.code !== 'PGRST116';
}

function dbUnavailable(step: string, error: { message?: string; code?: string } | null): CompanyContextErr {
  reportServerError({ source: 'company-context', status: 503, detail: `${step}: ${error?.code ?? ''} ${error?.message ?? ''}` });
  return err('DB_UNAVAILABLE', 503, DB_UNAVAILABLE_MESSAGE);
}

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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_active, role')
    .eq('id', session.userId)
    .single();

  // Until 2026-11-20 a database failure here read as "user disabled" (403) and pages sent the
  // user to /login — what people in the field saw during the 19.11 overload.
  if (isDbFailure(profileError)) return dbUnavailable('profiles', profileError);

  if (!profile || !profile.is_active) {
    return err('INACTIVE_PROFILE', 403, 'המשתמש הושבת. פנה למנהל המערכת.');
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from('company_members')
    .select('company_id, role, is_active')
    .eq('user_id', session.userId)
    .eq('is_active', true);

  if (membershipsError) return dbUnavailable('company_members', membershipsError);

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

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, settings, is_active')
    .eq('id', membership.company_id)
    .eq('is_active', true)
    .single();

  if (isDbFailure(companyError)) return dbUnavailable('companies', companyError);

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

/**
 * For server pages. Pages turn any context error into a redirect to /login; a database failure
 * must not log people out, so it throws instead and app/error.tsx offers "try again".
 */
export async function getPageCompanyContext(): Promise<CompanyContextResult> {
  const result = await getCurrentCompanyContext();
  if (result.code === 'DB_UNAVAILABLE') throw new Error(DB_UNAVAILABLE_MESSAGE);
  return result;
}

/** requireCompanyAdminRole() for server pages — see getPageCompanyContext(). */
export async function requirePageCompanyAdminRole(): Promise<CompanyContextResult> {
  const result = await requireCompanyAdminRole();
  if (result.code === 'DB_UNAVAILABLE') throw new Error(DB_UNAVAILABLE_MESSAGE);
  return result;
}
