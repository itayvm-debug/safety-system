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

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id, role, is_active')
    .eq('user_id', session.userId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!membership) {
    return {
      context: null,
      error: NextResponse.json(
        { error: 'אין שיוך חברה פעיל. פנה למנהל המערכת.' },
        { status: 403 }
      ),
    };
  }

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

/** Convenience: require admin platform role after resolving context. */
export async function requireCompanyAdmin(): Promise<CompanyContextResult> {
  const result = await getCurrentCompanyContext();
  if (result.error) return result;
  if (result.context.platformRole !== 'admin') {
    return {
      context: null,
      error: NextResponse.json({ error: 'פעולה זו מחייבת הרשאת מנהל' }, { status: 403 }),
    };
  }
  return result;
}
