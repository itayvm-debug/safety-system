import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('workers')
    .select(`*, documents(*), safety_briefings(*), height_restrictions(*), subcontractor:subcontractors(id, name)`)
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();
  const { full_name, id_number, worker_type, phone, notes, photo_url, project_name, is_active } = body;

  if (!full_name?.trim()) return NextResponse.json({ error: 'שם מלא נדרש' }, { status: 400 });
  if (!id_number?.trim()) return NextResponse.json({ error: 'מספר תעודת זהות נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('workers')
    .update({
      full_name: full_name.trim(),
      id_number: id_number.trim(),
      worker_type,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
      photo_url: photo_url || null,
      project_name: project_name?.trim() || null,
      is_active: is_active !== undefined ? is_active : true,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'מספר תעודת זהות כבר קיים' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  const allowed = ['subcontractor_id', 'notes', 'phone', 'photo_url', 'is_active', 'project_name'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('workers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createServiceClient();

  const { error } = await supabase.from('workers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
