import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import MembersClient from './MembersClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

interface MemberWithProfile {
  id: string;
  company_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  is_active: boolean;
  joined_at: string;
  profile: { full_name: string; email: string; username: string | null; role: string } | null;
}

export default async function CompanyMembersPage({ params }: Props) {
  const { id: companyId } = await params;
  const supabase = createServiceClient();

  const [companyRes, membersRes] = await Promise.all([
    supabase.from('companies').select('id, name').eq('id', companyId).single(),
    supabase
      .from('company_members')
      .select('id, company_id, user_id, role, is_active, joined_at, profile:user_id(full_name, email, username, role)')
      .eq('company_id', companyId)
      .order('joined_at', { ascending: true }),
  ]);

  if (!companyRes.data) notFound();

  return (
    <MembersClient
      companyId={companyId}
      companyName={companyRes.data.name}
      initialMembers={(membersRes.data ?? []) as unknown as MemberWithProfile[]}
    />
  );
}
