import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('vehicles')
    .select(`*, assigned_manager:workers!vehicles_assigned_manager_id_fkey(id, full_name), vehicle_licenses(*), vehicle_insurances(*)`)
    .order('vehicle_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { vehicle_type, model, vehicle_number, vehicle_color, image_url, assigned_manager_id, project_name, notes } = body;

  if (!vehicle_type?.trim()) return NextResponse.json({ error: 'סוג רכב נדרש' }, { status: 400 });
  if (!vehicle_number?.trim()) return NextResponse.json({ error: 'מספר רכב נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
