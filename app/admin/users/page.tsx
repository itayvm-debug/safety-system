import { redirect } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';
import UserManagementClient, { type UserWithMemberships } from './UserManagementClient';
import type { CompanyRole } from '@/types';

export const dynamic = 'force-dynamic';

export default async function PlatformUsersPage() {
  const { error } = await requirePlatformAdmin();
  if (error) redirect('/dashboard');

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('profiles')
    .select(`
      id, full_name, username, email, role, is_active, created_at, job_title, report_email,
      company_members(id, role, is_active, joined_at, companies(id, name, slug, logo_url, is_active))
    `)
    .order('full_name', { ascending: true });

  const users: UserWithMemberships[] = (data ?? []).map((u: Record<string, unknown>) => {
    const rawMembers = (u.company_members as Array<Record<string, unknown>> | null) ?? [];
    return {
      id:           u.id           as string,
      full_name:    u.full_name    as string,
      username:     u.username     as string | null,
      email:        u.email        as string,
      role:         u.role         as 'admin' | 'user',
      is_active:    u.is_active    as boolean,
      job_title:    u.job_title    as string | null,
      report_email: u.report_email as string | null,
      created_at:   u.created_at   as string,
      memberships: rawMembers.map(cm => {
        const rawCo = cm.companies as Record<string, unknown> | Record<string, unknown>[] | null;
        const co = Array.isArray(rawCo) ? (rawCo[0] ?? null) : rawCo;
        return {
          id:        cm.id        as string,
          role:      cm.role      as CompanyRole,
          is_active: cm.is_active as boolean,
          joined_at: cm.joined_at as string,
          company: co ? {
            id:        co.id        as string,
            name:      co.name      as string,
            slug:      co.slug      as string | null,
            logo_url:  co.logo_url  as string | null,
            is_active: co.is_active as boolean,
          } : null,
        };
      }),
    };
  });

  return <UserManagementClient initialUsers={users} />;
}
