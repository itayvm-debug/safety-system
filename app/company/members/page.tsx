import { redirect } from 'next/navigation';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';
import CompanyMembersClient from './CompanyMembersClient';
import type { CompanyRole } from '@/types';

export const dynamic = 'force-dynamic';

export default async function CompanyMembersPage() {
  const { context, error } = await requireCompanyAdminRole();
  if (error) redirect('/dashboard');

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('company_members')
    .select('id, company_id, user_id, role, is_active, joined_at, profile:user_id(full_name, email, username, role)')
    .eq('company_id', context.companyId)
    .order('joined_at', { ascending: true });

  // Supabase returns profile as array from the join; normalise to single object
  const members = (data ?? []).map((m: Record<string, unknown>) => ({
    ...(m as object),
    profile: Array.isArray(m.profile) ? (m.profile[0] ?? null) : m.profile,
  })) as {
    id: string;
    company_id: string;
    user_id: string;
    role: CompanyRole;
    is_active: boolean;
    joined_at: string;
    profile: { full_name: string; email: string; username: string | null; role: string } | null;
  }[];

  return (
    <CompanyMembersClient
      companyId={context.companyId}
      companyName={context.companyName}
      currentUserId={context.userId}
      initialMembers={members}
    />
  );
}
