import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import SettingsClient from './SettingsClient';
import { resolveCompanySettings } from '@/lib/company/settings';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function CompanySettingsPage({ params }: Props) {
  const { id: companyId } = await params;
  const supabase = createServiceClient();

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, settings')
    .eq('id', companyId)
    .single();

  if (!company) notFound();

  const resolved = resolveCompanySettings(company.settings);

  return (
    <SettingsClient
      companyId={companyId}
      companyName={company.name}
      initialSettings={resolved}
    />
  );
}
