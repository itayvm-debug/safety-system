import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

type OwnershipOk  = { valid: true };
type OwnershipErr = { valid: false; error: NextResponse };

/**
 * Verifies that subcontractorId belongs to companyId.
 * Returns { valid: true } for null/undefined (allows clearing the field).
 * Returns { valid: false, error } with 404 for any nonexistent or cross-company ID.
 */
export async function validateSubcontractorOwnership(
  companyId: string,
  subcontractorId: string | null | undefined,
): Promise<OwnershipOk | OwnershipErr> {
  if (!subcontractorId) return { valid: true };

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('subcontractors')
    .select('id')
    .eq('id', subcontractorId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!data) {
    return {
      valid: false,
      error: NextResponse.json({ error: 'קבלן לא נמצא' }, { status: 404 }),
    };
  }
  return { valid: true };
}
