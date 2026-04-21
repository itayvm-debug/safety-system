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
    .select(`*, documents(*), safety_briefings(*), height_restrictions(*), subcontractor:subcontractors!workers_subcontractor_id_fkey(id, name)`)
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
  const { full_name, is_foreign_worker, national_id, passport_number, phone, notes, photo_url,
          project_name, is_active, father_name, birth_year, profession, address,
          is_crane_operator, is_responsible_site_manager, responsible_manager_id } = body;

  if (!full_name?.trim()) return NextResponse.json({ error: 'שם מלא נדרש' }, { status: 400 });

  const isForeign = !!is_foreign_worker;
  const nationalIdTrimmed = national_id?.trim() || null;
  const passportTrimmed = passport_number?.trim() || null;

  if (!isForeign && !nationalIdTrimmed)
    return NextResponse.json({ error: 'מספר תעודת זהות נדרש' }, { status: 400 });
  if (isForeign && !passportTrimmed)
    return NextResponse.json({ error: 'מספר דרכון נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // בדיקת כפילויות (מוציאים את הרשומה הנוכחית)
  if (!isForeign && nationalIdTrimmed) {
    const { data: existing } = await supabase.from('workers').select('id').eq('national_id', nationalIdTrimmed).neq('id', id).maybeSingle();
    if (existing) return NextResponse.json({ error: 'עובד עם תעודת זהות זו כבר קיים במערכת' }, { status: 409 });
  }
  if (isForeign && passportTrimmed) {
    const { data: existing } = await supabase.from('workers').select('id').eq('passport_number', passportTrimmed).neq('id', id).maybeSingle();
    if (existing) return NextResponse.json({ error: 'עובד עם מספר דרכון זה כבר קיים במערכת' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('workers')
    .update({
      full_name: full_name.trim(),
      worker_type: isForeign ? 'foreign' : 'israeli', // backward compat with DB NOT NULL constraint
      is_foreign_worker: isForeign,
      national_id: nationalIdTrimmed,
      passport_number: passportTrimmed,
      id_number: nationalIdTrimmed ?? passportTrimmed,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
      photo_url: photo_url || null,
      project_name: project_name?.trim() || null,
      is_active: is_active !== undefined ? is_active : true,
      father_name: father_name?.trim() || null,
      birth_year: birth_year ? Number(birth_year) : null,
      profession: profession?.trim() || null,
      address: address?.trim() || null,
      is_crane_operator: is_crane_operator !== undefined ? !!is_crane_operator : undefined,
      is_responsible_site_manager: is_responsible_site_manager !== undefined ? !!is_responsible_site_manager : undefined,
      responsible_manager_id: responsible_manager_id !== undefined ? (responsible_manager_id || null) : undefined,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'עובד עם מזהה זה כבר קיים' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  const allowed = ['subcontractor_id', 'notes', 'phone', 'photo_url', 'is_active', 'project_name',
    'father_name', 'birth_year', 'profession', 'address', 'is_crane_operator',
    'is_responsible_site_manager', 'responsible_manager_id'] as const;
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

  console.log(`[DELETE worker] id=${id}`);

  // 1. null out responsible_manager_id on workers managed by this worker
  const { error: e1 } = await supabase
    .from('workers')
    .update({ responsible_manager_id: null })
    .eq('responsible_manager_id', id);
  if (e1) {
    console.error('[DELETE worker] failed to clear responsible_manager_id:', e1);
    return NextResponse.json({ error: `שגיאה בניקוי שיוך מנהל עבודה: ${e1.message}` }, { status: 500 });
  }

  // 2. null out responsible_worker_id on subcontractors where this worker is responsible
  const { error: e2 } = await supabase
    .from('subcontractors')
    .update({ responsible_worker_id: null })
    .eq('responsible_worker_id', id);
  if (e2) {
    console.error('[DELETE worker] failed to clear subcontractors.responsible_worker_id:', e2);
    return NextResponse.json({ error: `שגיאה בניקוי שיוך קבלן משנה: ${e2.message}` }, { status: 500 });
  }

  // 3. delete manager_licenses
  const { error: e3 } = await supabase.from('manager_licenses').delete().eq('worker_id', id);
  if (e3) {
    console.error('[DELETE worker] failed to delete manager_licenses:', e3);
    return NextResponse.json({ error: `שגיאה במחיקת רישיונות מנהל: ${e3.message}` }, { status: 500 });
  }

  // 4. delete manager_insurances (historical data cleanup)
  const { error: e4 } = await supabase.from('manager_insurances').delete().eq('worker_id', id);
  if (e4) {
    console.error('[DELETE worker] failed to delete manager_insurances:', e4);
    return NextResponse.json({ error: `שגיאה במחיקת ביטוחי מנהל: ${e4.message}` }, { status: 500 });
  }

  // 5. delete professional_licenses
  const { error: e5 } = await supabase.from('professional_licenses').delete().eq('worker_id', id);
  if (e5) {
    console.error('[DELETE worker] failed to delete professional_licenses:', e5);
    return NextResponse.json({ error: `שגיאה במחיקת רישיונות מקצועיים: ${e5.message}` }, { status: 500 });
  }

  // 6. null out vehicles.assigned_manager_id (FK — must clear before deleting worker)
  const { error: e6 } = await supabase
    .from('vehicles')
    .update({ assigned_manager_id: null })
    .eq('assigned_manager_id', id);
  if (e6) {
    console.error('[DELETE worker] failed to null vehicles.assigned_manager_id:', e6);
    return NextResponse.json({ error: `שגיאה בניתוק רכבים מהעובד: ${e6.message}` }, { status: 500 });
  }

  // 7. delete worker (documents / height_restrictions / safety_briefings / lifting_machine_appointments cascade)
  const { error: e7 } = await supabase.from('workers').delete().eq('id', id);
  if (e7) {
    console.error('[DELETE worker] failed to delete worker:', e7);
    return NextResponse.json({ error: `שגיאה במחיקת העובד: ${e7.message}` }, { status: 500 });
  }

  console.log(`[DELETE worker] success id=${id}`);
  return NextResponse.json({ success: true });
}
