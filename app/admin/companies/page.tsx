import { createServiceClient } from '@/lib/supabase/server';
import CompaniesClient from './CompaniesClient';
import type { Company } from '@/types';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('companies')
    .select('id, name, name_en, slug, registration, address, phone, contact_email, safety_email, is_active, created_at, updated_at, settings')
    .order('created_at', { ascending: true });

  return <CompaniesClient initialCompanies={(data ?? []) as Company[]} />;
}
