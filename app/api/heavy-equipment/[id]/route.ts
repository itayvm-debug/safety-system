import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';
import { validateSubcontractorOwnership } from '@/lib/subcontractors/ownership';

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
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ציוד לא נמצא' }, { status: 404 });

  const body = await request.json();
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
  if (image_url            !== undefined) updates.image_url            = image_url;
  if (license_file_url     !== undefined) updates.license_file_url     = license_file_url;
  if (license_expiry       !== undefined) updates.license_expiry       = license_expiry;
  if (inspection_file_url  !== undefined) updates.inspection_file_url  = inspection_file_url;
  if (inspection_expiry    !== undefined) updates.inspection_expiry    = inspection_expiry;

  const { data, error: dbError } = await supabase
    .from('heavy_equipment')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select(SELECT_HE)
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
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
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ציוד לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('heavy_equipment')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
