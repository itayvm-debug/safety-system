import { createServiceClient } from '@/lib/supabase/server';
import UserManagementClient from './UserManagementClient';
import { Profile } from '@/types';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, report_email, role, job_title, is_active, created_at, updated_at')
    .order('created_at', { ascending: true });

  return <UserManagementClient initialUsers={(data ?? []) as Profile[]} />;
}
