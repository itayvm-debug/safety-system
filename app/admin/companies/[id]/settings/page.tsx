import { requirePlatformAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import SettingsClient from './SettingsClient';
import { resolveCompanySettings } from '@/lib/company/settings';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function CompanySettingsPage({ params }: Props) {
  // Platform admin is re-checked against the DB (role + is_active), not the session cookie (P1·2)
  const { error: adminError } = await requirePlatformAdmin();
  if (adminError) redirect('/dashboard');

  const { id: companyId } = await params;
  const supabase = createServiceClient();

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, settings, logo_url')
    .eq('id', companyId)
    .single();

  if (!company) notFound();

  const resolved = resolveCompanySettings(company.settings);

  return (
    <SettingsClient
      companyId={companyId}
      companyName={company.name}
      initialSettings={resolved}
      initialLogoUrl={(company as { logo_url?: string | null }).logo_url ?? null}
    />
  );
}
