import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { redirect } from 'next/navigation';
import ArchiveClient from './ArchiveClient';

export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const ctxResult = await getCurrentCompanyContext();
  if (ctxResult.error) {
    if (ctxResult.code === 'NEEDS_COMPANY_SELECTION') redirect('/select-company');
    redirect('/login');
  }
  const { companyId } = ctxResult.context;

  const supabase = createServiceClient();

  const [workers, vehicles, heavy, lifting, subcontractors] = await Promise.all([
    supabase.from('workers').select('id, full_name, archived_at, archived_by').eq('company_id', companyId).eq('is_archived', true).order('archived_at', { ascending: false }),
    supabase.from('vehicles').select('id, vehicle_number, vehicle_type, archived_at, archived_by').eq('is_archived', true).order('archived_at', { ascending: false }),
    supabase.from('heavy_equipment').select('id, description, archived_at, archived_by').eq('company_id', companyId).eq('is_archived', true).order('archived_at', { ascending: false }),
    supabase.from('lifting_equipment').select('id, description, archived_at, archived_by').eq('company_id', companyId).eq('is_archived', true).order('archived_at', { ascending: false }),
    supabase.from('subcontractors').select('id, name, archived_at, archived_by').eq('is_archived', true).order('archived_at', { ascending: false }),
  ]);

  return (
    <ArchiveClient
      workers={workers.data ?? []}
      vehicles={vehicles.data ?? []}
      heavy={heavy.data ?? []}
      lifting={lifting.data ?? []}
      subcontractors={subcontractors.data ?? []}
    />
  );
}
