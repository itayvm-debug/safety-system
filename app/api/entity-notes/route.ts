import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdmin, getCurrentCompanyContext } from '@/lib/auth/company-context';
import { resolveEntityCompany } from '@/lib/company/resolve-entity-company';
import type { EntityType } from '@/types';

const VALID_TYPES: EntityType[] = ['worker', 'vehicle', 'heavy_equipment', 'lifting_equipment', 'subcontractor'];

export async function GET(request: NextRequest) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entity_type') as EntityType | null;
  const entityId   = searchParams.get('entity_id');

  if (!entityType || !entityId)
    return NextResponse.json({ error: 'entity_type ו-entity_id נדרשים' }, { status: 400 });

  if (!VALID_TYPES.includes(entityType))
    return NextResponse.json({ error: 'סוג ישות לא תקין' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify the entity belongs to this company
  const entityCompanyId = await resolveEntityCompany(supabase, entityType, entityId);
  if (!entityCompanyId || entityCompanyId !== companyId)
    return NextResponse.json({ error: 'ישות לא נמצאה' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('entity_notes')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId, username } = context;

  const body = await request.json();
  const { entity_type, entity_id, content, status } = body;

  if (!entity_type || !entity_id) return NextResponse.json({ error: 'entity_type ו-entity_id נדרשים' }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: 'תוכן ההערה נדרש' }, { status: 400 });

  if (!VALID_TYPES.includes(entity_type as EntityType))
    return NextResponse.json({ error: 'סוג ישות לא תקין' }, { status: 400 });

  const validStatuses = ['ok', 'needs_attention'];
  const noteStatus = validStatuses.includes(status) ? status : 'ok';

  const supabase = createServiceClient();

  // Resolve entity company — never trust client-supplied company_id
  const entityCompanyId = await resolveEntityCompany(supabase, entity_type as EntityType, entity_id);
  if (!entityCompanyId || entityCompanyId !== companyId)
    return NextResponse.json({ error: 'ישות לא נמצאה' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('entity_notes')
    .insert({
      company_id: companyId,
      entity_type,
      entity_id,
      content: content.trim(),
      status: noteStatus,
      created_by: username ?? null,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
