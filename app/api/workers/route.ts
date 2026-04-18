import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const managersOnly = searchParams.get('managers') === 'true';
  const subcontractorId = searchParams.get('subcontractor_id');
  const lightweight = managersOnly || !!subcontractorId;

  const supabase = createServiceClient();
  let query = supabase
    .from('workers')
    .select(lightweight
      ? 'id, full_name'
      : `*, documents(*), safety_briefings(*), height_restrictions(*), subcontractor:subcontractors(id, name)`)
    .order('full_name');

  if (managersOnly) {
    query = query.eq('is_responsible_site_manager', true).eq('is_active', true);
  }
  if (subcontractorId) {
    query = query.eq('subcontractor_id', subcontractorId).eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { full_name, id_number, worker_type, phone, notes, project_name } = body;

  if (!full_name?.trim()) return NextResponse.json({ error: 'שם מלא נדרש' }, { status: 400 });
  if (!id_number?.trim()) return NextResponse.json({ error: 'מספר תעודת זהות נדרש' }, { status: 400 });
  if (!['israeli', 'foreign'].includes(worker_type)) return NextResponse.json({ error: 'סוג עובד לא תקין' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('workers')
    .insert({
      full_name: full_name.trim(),
      id_number: id_number.trim(),
      worker_type,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
      project_name: project_name?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'מספר תעודת זהות כבר קיים במערכת' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
