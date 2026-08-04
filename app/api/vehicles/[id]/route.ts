import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';

export async function GET() {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('vehicles')
    .select(`*, assigned_manager:workers!vehicles_assigned_manager_id_fkey(id, full_name), vehicle_licenses(*), vehicle_insurances(*)`)
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .order('vehicle_number');

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json();
  const { vehicle_type, model, vehicle_number, vehicle_color, image_url, assigned_manager_id, project_name, notes } = body;

  if (!vehicle_type?.trim()) return NextResponse.json({ error: 'סוג רכב נדרש' }, { status: 400 });
  if (!vehicle_number?.trim()) return NextResponse.json({ error: 'מספר רכב נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Duplicate check scoped to this company only
  const { data: existing } = await supabase
    .from('vehicles')
    .select('id')
    .eq('vehicle_number', vehicle_number.trim())
    .eq('company_id', companyId)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'רכב עם מספר רישוי זה כבר קיים בחברה' }, { status: 409 });

  // Verify assigned manager belongs to this company if provided
  if (assigned_manager_id) {
    const { data: manager } = await supabase
      .from('workers')
      .select('id')
      .eq('id', assigned_manager_id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!manager) return NextResponse.json({ error: 'עובד לא נמצא בחברה זו' }, { status: 422 });
  }

  const { data, error: dbError } = await supabase
    .from('vehicles')
    .insert({
      company_id: companyId,
      vehicle_type: vehicle_type.trim(),
      model: model?.trim() || null,
      vehicle_number: vehicle_number.trim(),
      vehicle_color: vehicle_color?.trim() || null,
      image_url: image_url || null,
      assigned_manager_id: assigned_manager_id || null,
      project_name: project_name?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select(`*, assigned_manager:workers!vehicles_assigned_manager_id_fkey(id, full_name), vehicle_licenses(*), vehicle_insurances(*)`)
    .single();

  if (dbError) {
    if (dbError.code === '23505') return NextResponse.json({ error: 'רכב עם מספר רישוי זה כבר קיים בחברה' }, { status: 409 });
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
