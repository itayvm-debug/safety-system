import { createServiceClient } from './server';
import type { Company } from '@/types';

/**
 * Returns the first active company the user belongs to.
 * Phase 1: users belong to exactly one company (the default).
 * Phase 5+: may return by active company_id from session context.
 */
export async function getCompanyForUser(userId: string): Promise<Company | null> {
  const supabase = createServiceClient();

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!membership) return null;

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', membership.company_id)
    .single();

  return (company as Company) ?? null;
}
