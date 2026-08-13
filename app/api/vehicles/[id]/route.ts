import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';

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
    .select('id')
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

  const updates: Record<string, unknown> = {};
  if (vehicle_type !== undefined) updates.vehicle_type = vehicle_type?.trim() || undefined;
  if (model !== undefined) updates.model = model?.trim() || null;
  if (vehicle_number !== undefined) updates.vehicle_number = vehicle_number?.trim() || undefined;
  if (vehicle_color !== undefined) updates.vehicle_color = vehicle_color?.trim() || null;
  if (image_url !== undefined) updates.image_url = image_url || null;
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
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'רכב לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
