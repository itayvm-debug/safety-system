import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';
import { validateFileFields, cleanupAfterChange, replacedPaths } from '@/lib/storage/file-paths';

type Params = { params: Promise<{ id: string }> };

const SELECT_VEHICLE = `*, assigned_manager:workers!vehicles_assigned_manager_id_fkey(id, full_name), vehicle_licenses(*), vehicle_insurances(*)`;

export async function GET(_request: NextRequest, { params }: Params) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error: dbError } = await supabase
    .from('vehicles')
    .select(SELECT_VEHICLE)
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'רכב לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('vehicles')
    .select('id, image_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'רכב לא נמצא' }, { status: 404 });

  const body = await request.json();
  const {
    vehicle_type, model, vehicle_number, vehicle_color,
    image_url, assigned_manager_id, project_name, notes,
    is_archived, is_active,
  } = body;

  // Verify new assigned manager belongs to this company
  if (assigned_manager_id !== undefined && assigned_manager_id !== null) {
    const { data: manager } = await supabase
      .from('workers')
      .select('id')
      .eq('id', assigned_manager_id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!manager) return NextResponse.json({ error: 'עובד לא נמצא בחברה זו' }, { status: 422 });
  }

  // P1·1 — the client may only attach a file issued to / owned by this company
  const before = { image_url: existing.image_url as string | null };
  const fileCheck = await validateFileFields(supabase, companyId, { image_url }, before);
  if (!fileCheck.ok) return fileCheck.error;

  const updates: Record<string, unknown> = {};
  if (vehicle_type !== undefined) updates.vehicle_type = vehicle_type?.trim() || undefined;
  if (model !== undefined) updates.model = model?.trim() || null;
  if (vehicle_number !== undefined) updates.vehicle_number = vehicle_number?.trim() || undefined;
  if (vehicle_color !== undefined) updates.vehicle_color = vehicle_color?.trim() || null;
  if (image_url !== undefined) updates.image_url = fileCheck.values.image_url;
  if (assigned_manager_id !== undefined) updates.assigned_manager_id = assigned_manager_id || null;
  if (project_name !== undefined) updates.project_name = project_name?.trim() || null;
  if (notes !== undefined) updates.notes = notes?.trim() || null;
  if (is_archived !== undefined) updates.is_archived = is_archived;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error: dbError } = await supabase
    .from('vehicles')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select(SELECT_VEHICLE)
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
    .from('vehicles')
    .select('id, image_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'רכב לא נמצא' }, { status: 404 });

  // P1·6 — collect files of the vehicle and of the children deleted with it
  // (vehicle_licenses, vehicle_insurances: ON DELETE CASCADE) before the delete
  const [{ data: licenses }, { data: insurances }] = await Promise.all([
    supabase.from('vehicle_licenses').select('file_url').eq('vehicle_id', id).eq('company_id', companyId),
    supabase.from('vehicle_insurances').select('file_url').eq('vehicle_id', id).eq('company_id', companyId),
  ]);
  const storagePaths: Array<string | null> = [
    existing.image_url as string | null,
    ...((licenses ?? []) as Array<{ file_url: string | null }>).map(l => l.file_url),
    ...((insurances ?? []) as Array<{ file_url: string | null }>).map(i => i.file_url),
  ];

  const { error: dbError } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // P1·6 — retention gate: the file is kept until a retention policy is decided (AUTO_REMOVE_ON)
  await cleanupAfterChange('record_deleted', supabase, storagePaths);
  return NextResponse.json({ success: true });
}
