import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';
import { validateSubcontractorOwnership } from '@/lib/subcontractors/ownership';
import { validateFileFields, cleanupAfterChange, replacedPaths } from '@/lib/storage/file-paths';
import { readJsonObject } from '@/lib/http/json-body';

type Params = { params: Promise<{ id: string }> };

const SELECT_LE = '*, subcontractor:subcontractors(id, name)';

export async function GET(_request: NextRequest, { params }: Params) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('lifting_equipment')
    .select(SELECT_LE)
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'ציוד לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('lifting_equipment')
    .select('id, image_url, inspection_file_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ציוד לא נמצא' }, { status: 404 });

  const jsonIn = await readJsonObject(request);
  if (!jsonIn.ok) return jsonIn.error;
  const body = jsonIn.body;
  const {
    description,
    subcontractor_id,
    project_name,
    is_active,
    is_archived,
    image_url,
    inspection_file_url,
    inspection_expiry,
  } = body;

  if (subcontractor_id !== undefined) {
    const subOwnership = await validateSubcontractorOwnership(companyId, subcontractor_id);
    if (!subOwnership.valid) return subOwnership.error;
  }

  // P1·1 — the client may only attach files issued to / owned by this company
  const before = {
    image_url:           existing.image_url as string | null,
    inspection_file_url: existing.inspection_file_url as string | null,
  };
  const fileCheck = await validateFileFields(supabase, companyId, { image_url, inspection_file_url }, before);
  if (!fileCheck.ok) return fileCheck.error;

  const updates: Record<string, unknown> = {};
  if (description         !== undefined) updates.description         = description;
  if (subcontractor_id    !== undefined) updates.subcontractor_id    = subcontractor_id;
  if (project_name        !== undefined) updates.project_name        = project_name;
  if (is_active           !== undefined) updates.is_active           = is_active;
  if (is_archived         !== undefined) {
    updates.is_archived = is_archived;
    if (is_archived) updates.archived_at = new Date().toISOString();
  }
  if (image_url           !== undefined) updates.image_url           = fileCheck.values.image_url;
  if (inspection_file_url !== undefined) updates.inspection_file_url = fileCheck.values.inspection_file_url;
  if (inspection_expiry   !== undefined) updates.inspection_expiry   = inspection_expiry;

  const { data, error: dbError } = await supabase
    .from('lifting_equipment')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select(SELECT_LE)
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // P1·6 — retention gate: the file is kept until a retention policy is decided (AUTO_REMOVE_ON)
  await cleanupAfterChange('file_replaced', supabase, replacedPaths(before, updates));
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('lifting_equipment')
    .select('id, image_url, inspection_file_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ציוד לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('lifting_equipment')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // P1·6 — retention gate: the file is kept until a retention policy is decided (AUTO_REMOVE_ON)
  await cleanupAfterChange('record_deleted', supabase, [
    existing.image_url as string | null,
    existing.inspection_file_url as string | null,
  ]);
  return NextResponse.json({ success: true });
}
