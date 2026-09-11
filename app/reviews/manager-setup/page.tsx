import { redirect } from 'next/navigation';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';
import ManagerSetupClient from './ManagerSetupClient';

export const dynamic = 'force-dynamic';

export default async function ManagerSetupPage() {
  const { context, error } = await requireCompanyAdminRole();
  if (error) redirect('/dashboard');

  const { companyId, settings } = context;
  if (!settings.features.employeeReviews) redirect('/dashboard');

  const supabase = createServiceClient();

  const [workersRes, membersRes, mappingsRes] = await Promise.all([
    supabase
      .from('workers')
      .select('id, full_name, photo_url')
      .eq('company_id', companyId)
      .eq('is_responsible_site_manager', true)
      .eq('is_active', true)
      .eq('is_archived', false)
      .order('full_name'),
    supabase
      .from('company_members')
      .select('user_id, role, profile:user_id(id, full_name, email, username)')
      .eq('company_id', companyId)
      .eq('is_active', true),
    supabase
      .from('manager_user_mappings')
      .select('id, manager_worker_id, user_id')
      .eq('company_id', companyId),
  ]);

  const siteManagers = workersRes.data ?? [];
  const members = (membersRes.data ?? []).map((m: Record<string, unknown>) => ({
    ...(m as object),
    profile: Array.isArray(m.profile) ? (m.profile[0] ?? null) : m.profile,
  })) as {
    user_id: string;
    role: string;
    profile: { id: string; full_name: string; email: string; username: string | null } | null;
  }[];
  const mappings = mappingsRes.data ?? [];

  return (
    <ManagerSetupClient
      companyId={companyId}
      siteManagers={siteManagers as { id: string; full_name: string; photo_url: string | null }[]}
      members={members}
      initialMappings={mappings as { id: string; manager_worker_id: string; user_id: string }[]}
    />
  );
}
