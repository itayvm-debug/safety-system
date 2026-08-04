import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import CompanyDetailClient from './CompanyDetailClient';
import type { Company } from '@/types';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function CompanyDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [companyRes, memberCountRes] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, name_en, slug, registration, address, phone, contact_email, safety_email, is_active, created_at, updated_at, settings')
      .eq('id', id)
      .single(),
    supabase
      .from('company_members')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', id)
      .eq('is_active', true),
  ]);

  if (!companyRes.data) notFound();

  return (
    <CompanyDetailClient
      company={companyRes.data as Company}
      memberCount={memberCountRes.count ?? 0}
    />
  );
}
