import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdmin } from '@/lib/auth/company-context';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('vehicles')
    .select(`*, assigned_manager:workers!vehicles_assigned_manager_id_fkey(id, full_name), vehicle_licenses(*), vehicle_insurances(*)`)
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId, username } = context;

  const { id } = await params;
  const body = await request.json();

  const supabase = createServiceClient();

  // Verify ownership before any update
  const { data: existing } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  // If changing assigned_manager_id, verify the worker belongs to this company
  if ('assigned_manager_id' in body && body.assigned_manager_id != null) {
    const { data: manager } = await supabase
      .from('workers')
      .select('id')
      .eq('id', body.assigned_manager_id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!manager) return NextResponse.json({ error: 'עובד לא נמצא בחברה זו' }, { status: 422 });
  }

  const allowed = ['vehicle_type', 'model', 'vehicle_number', 'vehicle_color', 'image_url', 'assigned_manager_id', 'project_name', 'notes', 'is_active'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] ?? null;
  }

  if ('is_archived' in body) {
    updates.is_archived = !!body.is_archived;
    updates.archived_at = body.is_archived ? new Date().toISOString() : null;
    updates.archived_by = body.is_archived ? (username ?? null) : null;
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });

  const { data, error: dbError } = await supabase
    .from('vehicles')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select(`*, assigned_manager:workers!vehicles_assigned_manager_id_fkey(id, full_name), vehicle_licenses(*), vehicle_insurances(*)`)
    .single();

  if (dbError) {
    if (dbError.code === '23505') return NextResponse.json({ error: 'רכב עם מספר רישוי זה כבר קיים בחברה' }, { status: 409 });
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();

  // Verify ownership before deleting
  const { data: existing } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
