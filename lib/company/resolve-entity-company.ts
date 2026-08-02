import { createServiceClient } from '@/lib/supabase/server';
import type { EntityType } from '@/types';

/**
 * Resolve the company_id of a polymorphic entity.
 * Used by entity-notes API routes to verify ownership without trusting
 * client-supplied company_id.
 *
 * Returns null if the entity does not exist or has no company_id.
 */
export async function resolveEntityCompany(
  supabase: ReturnType<typeof createServiceClient>,
  entityType: EntityType,
  entityId: string,
): Promise<string | null> {
  let result: { data: { company_id: string } | null; error: unknown };

  switch (entityType) {
    case 'worker':
      result = await supabase
        .from('workers')
        .select('company_id')
        .eq('id', entityId)
        .maybeSingle() as typeof result;
      break;
    case 'vehicle':
      result = await supabase
        .from('vehicles')
        .select('company_id')
        .eq('id', entityId)
        .maybeSingle() as typeof result;
      break;
    case 'heavy_equipment':
      result = await supabase
        .from('heavy_equipment')
        .select('company_id')
        .eq('id', entityId)
        .maybeSingle() as typeof result;
      break;
    case 'lifting_equipment':
      result = await supabase
        .from('lifting_equipment')
        .select('company_id')
        .eq('id', entityId)
        .maybeSingle() as typeof result;
      break;
    case 'subcontractor':
      result = await supabase
        .from('subcontractors')
        .select('company_id')
        .eq('id', entityId)
        .maybeSingle() as typeof result;
      break;
    default:
      return null;
  }

  return result.data?.company_id ?? null;
}
