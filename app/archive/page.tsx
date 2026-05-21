import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/api';
import { redirect } from 'next/navigation';
import ArchiveClient from './ArchiveClient';

export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const { error } = await requireAuth();
  if (error) redirect('/login');

  const supabase = createServiceClient();

  const [workers, vehicles, heavy, lifting, subcontractors] = await Promise.all([
    supabase.from('workers').select('id, full_name, archived_at, archived_by').eq('is_archived', true).order('archived_at', { ascending: false }),
    supabase.from('vehicles').select('id, vehicle_number, vehicle_type, archived_at, archived_by').eq('is_archived', true).order('archived_at', { ascending: false }),
    supabase.from('heavy_equipment').select('id, description, archived_at, archived_by').eq('is_archived', true).order('archived_at', { ascending: false }),
    supabase.from('lifting_equipment').select('id, description, archived_at, archived_by').eq('is_archived', true).order('archived_at', { ascending: false }),
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
