import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';
import { validateSubcontractorOwnership } from '@/lib/subcontractors/ownership';
import { validateFileFields, cleanupAfterChange, replacedPaths } from '@/lib/storage/file-paths';
import { readJsonObject } from '@/lib/http/json-body';

type Params = { params: Promise<{ id: string }> };

const SELECT_HE = '*, subcontractor:subcontractors(id, name), heavy_equipment_insurances(*)';

export async function GET(_request: NextRequest, { params }: Params) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('heavy_equipment')
    .select(SELECT_HE)
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
    .from('heavy_equipment')
    .select('id, image_url, license_file_url, inspection_file_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ציוד לא נמצא' }, { status: 404 });

  const jsonIn = await readJsonObject(request);
  if (!jsonIn.ok) return jsonIn.error;
  const body = jsonIn.body;
  const {
    description, license_number, subcontractor_id, project_name,
    manufacturer, machine_identifier, safe_working_load, power_type,
    is_active, is_archived,
    image_url, license_file_url, license_expiry,
    inspection_file_url, inspection_expiry,
  } = body;

  if (subcontractor_id !== undefined) {
    const subOwnership = await validateSubcontractorOwnership(companyId, subcontractor_id);
    if (!subOwnership.valid) return subOwnership.error;
  }

  // P1·1 — the client may only attach files issued to / owned by this company
  const before = {
    image_url:           existing.image_url as string | null,
    license_file_url:    existing.license_file_url as string | null,
    inspection_file_url: existing.inspection_file_url as string | null,
  };
  const fileCheck = await validateFileFields(
    supabase, companyId, { image_url, license_file_url, inspection_file_url }, before,
  );
  if (!fileCheck.ok) return fileCheck.error;
  const files = fileCheck.values;

  const updates: Record<string, unknown> = {};
  if (description          !== undefined) updates.description          = description;
  if (license_number       !== undefined) updates.license_number       = license_number;
  if (subcontractor_id     !== undefined) updates.subcontractor_id     = subcontractor_id;
  if (project_name         !== undefined) updates.project_name         = project_name;
  if (manufacturer         !== undefined) updates.manufacturer         = manufacturer;
  if (machine_identifier   !== undefined) updates.machine_identifier   = machine_identifier;
  if (safe_working_load    !== undefined) updates.safe_working_load    = safe_working_load;
  if (power_type           !== undefined) updates.power_type           = power_type;
  if (is_active            !== undefined) updates.is_active            = is_active;
  if (is_archived          !== undefined) {
    updates.is_archived = is_archived;
    if (is_archived) updates.archived_at = new Date().toISOString();
  }
  if (image_url            !== undefined) updates.image_url            = files.image_url;
  if (license_file_url     !== undefined) updates.license_file_url     = files.license_file_url;
  if (license_expiry       !== undefined) updates.license_expiry       = license_expiry;
  if (inspection_file_url  !== undefined) updates.inspection_file_url  = files.inspection_file_url;
  if (inspection_expiry    !== undefined) updates.inspection_expiry    = inspection_expiry;

  const { data, error: dbError } = await supabase
    .from('heavy_equipment')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select(SELECT_HE)
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
    .from('heavy_equipment')
    .select('id, image_url, license_file_url, inspection_file_url, insurance_file_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ציוד לא נמצא' }, { status: 404 });

  // P1·6 — collect files of the equipment and of its insurances (ON DELETE CASCADE)
  // before the delete. lifting_machine_appointments.equipment_id is SET NULL — kept.
  const { data: insurances } = await supabase
    .from('heavy_equipment_insurances')
    .select('file_url')
    .eq('heavy_equipment_id', id)
    .eq('company_id', companyId);
  const storagePaths: Array<string | null> = [
    existing.image_url as string | null,
    existing.license_file_url as string | null,
    existing.inspection_file_url as string | null,
    existing.insurance_file_url as string | null,
    ...((insurances ?? []) as Array<{ file_url: string | null }>).map(i => i.file_url),
  ];

  const { error: dbError } = await supabase
    .from('heavy_equipment')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // P1·6 — retention gate: the file is kept until a retention policy is decided (AUTO_REMOVE_ON)
  await cleanupAfterChange('record_deleted', supabase, storagePaths);
  return NextResponse.json({ success: true });
}
