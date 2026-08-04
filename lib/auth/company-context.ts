import { NextResponse } from 'next/server';
import { getSession } from './session';
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

type CompanyContextOk  = { context: CompanyContext; error: null };
type CompanyContextErr = { context: null; error: NextResponse };

export type CompanyContextResult = CompanyContextOk | CompanyContextErr;

/**
 * Resolves the current authenticated user's company context.
 *
 * Security contract:
 *   - Never trusts companyId from the request — always derived server-side from session + DB
 *   - Verifies session signature, profile.is_active, and active company membership
 *   - Three sequential DB queries: profiles → company_members → companies (all service_role)
 */
export async function getCurrentCompanyContext(): Promise<CompanyContextResult> {
  const session = await getSession();
  if (!session) {
    return {
      context: null,
      error: NextResponse.json({ error: 'לא מורשה — יש להתחבר תחילה' }, { status: 401 }),
    };
  }

  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, role')
    .eq('id', session.userId)
    .single();

  if (!profile || !profile.is_active) {
    return {
      context: null,
      error: NextResponse.json({ error: 'המשתמש הושבת. פנה למנהל המערכת.' }, { status: 403 }),
    };
  }

  const { data: memberships } = await supabase
    .from('company_members')
    .select('company_id, role, is_active')
    .eq('user_id', session.userId)
    .eq('is_active', true);

  if (!memberships || memberships.length === 0) {
    return {
      context: null,
      error: NextResponse.json(
        { error: 'אין שיוך חברה פעיל. פנה למנהל המערכת.' },
        { status: 403 }
      ),
    };
  }

  if (memberships.length > 1) {
    return {
      context: null,
      error: NextResponse.json(
        { error: 'משתמש משויך למספר חברות — נדרש מתג חברה שטרם הוטמע. פנה לתמיכה.' },
        { status: 403 }
      ),
    };
  }

  const membership = memberships[0];

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, settings, is_active')
    .eq('id', membership.company_id)
    .eq('is_active', true)
    .single();

  if (!company) {
    return {
      context: null,
      error: NextResponse.json({ error: 'החברה אינה פעילה. פנה למנהל המערכת.' }, { status: 403 }),
    };
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
 * Active membership guard — validates session, active profile, and exactly one active company membership.
 * Use for read-only operations accessible to any active company member.
 * Equivalent to calling getCurrentCompanyContext() directly.
 */
export const requireCompanyMember = getCurrentCompanyContext;

/** Require company-level admin role (company_members.role IN ['admin','owner']). */
export async function requireCompanyAdminRole(): Promise<CompanyContextResult> {
  const result = await getCurrentCompanyContext();
  if (result.error) return result;
  if (!['admin', 'owner'].includes(result.context.companyRole)) {
    return {
      context: null,
      error: NextResponse.json({ error: 'פעולה זו מחייבת הרשאת מנהל חברה' }, { status: 403 }),
    };
  }
  return result;
}
