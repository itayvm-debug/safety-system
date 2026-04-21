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
    .select(managersOnly
      ? 'id, full_name, subcontractor_id'
      : subcontractorId
        ? 'id, full_name'
        : `*, documents(*), safety_briefings(*), height_restrictions(*), subcontractor:subcontractors!workers_subcontractor_id_fkey(id, name)`)
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
  const { full_name, is_foreign_worker, national_id, passport_number, phone, notes, project_name } = body;

  if (!full_name?.trim()) return NextResponse.json({ error: 'שם מלא נדרש' }, { status: 400 });

  const isForeign = !!is_foreign_worker;
  const nationalIdTrimmed = national_id?.trim() || null;
  const passportTrimmed = passport_number?.trim() || null;

  if (!isForeign && !nationalIdTrimmed)
    return NextResponse.json({ error: 'מספר תעודת זהות נדרש' }, { status: 400 });
  if (isForeign && !passportTrimmed)
    return NextResponse.json({ error: 'מספר דרכון נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // בדיקת כפילויות
  if (!isForeign && nationalIdTrimmed) {
    const { data: existing } = await supabase.from('workers').select('id').eq('national_id', nationalIdTrimmed).maybeSingle();
    if (existing) return NextResponse.json({ error: 'עובד עם תעודת זהות זו כבר קיים במערכת' }, { status: 409 });
  }
  if (isForeign && passportTrimmed) {
    const { data: existing } = await supabase.from('workers').select('id').eq('passport_number', passportTrimmed).maybeSingle();
    if (existing) return NextResponse.json({ error: 'עובד עם מספר דרכון זה כבר קיים במערכת' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('workers')
    .insert({
      full_name: full_name.trim(),
      worker_type: isForeign ? 'foreign' : 'israeli', // backward compat with DB NOT NULL constraint
      is_foreign_worker: isForeign,
      national_id: nationalIdTrimmed,
      passport_number: passportTrimmed,
      id_number: nationalIdTrimmed ?? passportTrimmed,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
      project_name: project_name?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'עובד עם מזהה זה כבר קיים במערכת' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
