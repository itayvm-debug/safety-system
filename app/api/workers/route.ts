import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdmin } from '@/lib/auth/company-context';
import { normalizeIdentityValue } from '@/lib/workers/normalize';

export async function GET(request: NextRequest) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const { searchParams } = new URL(request.url);
  const managersOnly = searchParams.get('managers') === 'true';
  const subcontractorId = searchParams.get('subcontractor_id');
  const supabase = createServiceClient();

  let query = supabase
    .from('workers')
    .select(managersOnly
      ? 'id, full_name, subcontractor_id'
      : subcontractorId
        ? 'id, full_name'
        : `*, documents(*), safety_briefings(*), height_restrictions(*), professional_licenses(*), lifting_machine_appointments(id), manager_licenses(*), vehicles(*, vehicle_licenses(*), vehicle_insurances(*)), subcontractor:subcontractors!workers_subcontractor_id_fkey(id, name)`)
    .eq('company_id', companyId)
    .order('full_name');

  query = query.eq('is_archived', false);

  if (managersOnly) {
    query = query.eq('is_responsible_site_manager', true).eq('is_active', true);
  }
  if (subcontractorId) {
    query = query.eq('subcontractor_id', subcontractorId).eq('is_active', true);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json();
  const { full_name, is_foreign_worker, national_id, passport_number, phone, notes, project_name } = body;

  if (!full_name?.trim()) return NextResponse.json({ error: 'שם מלא נדרש' }, { status: 400 });

  const isForeign = !!is_foreign_worker;
  const nationalIdNorm   = normalizeIdentityValue(national_id);
  const passportNorm     = normalizeIdentityValue(passport_number);

  if (!isForeign && !nationalIdNorm)
    return NextResponse.json({ error: 'מספר תעודת זהות נדרש' }, { status: 400 });
  if (isForeign && !passportNorm)
    return NextResponse.json({ error: 'מספר דרכון נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Duplicate check scoped to this company only.
  // Same identity in a different company is allowed — do not reveal cross-company existence.
  if (!isForeign && nationalIdNorm) {
    const { data: existing } = await supabase
      .from('workers')
      .select('id')
      .eq('national_id', nationalIdNorm)
      .eq('company_id', companyId)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'עובד עם מזהה זה כבר קיים בחברה' }, { status: 409 });
  }
  if (isForeign && passportNorm) {
    const { data: existing } = await supabase
      .from('workers')
      .select('id')
      .eq('passport_number', passportNorm)
      .eq('company_id', companyId)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'עובד עם מזהה זה כבר קיים בחברה' }, { status: 409 });
  }

  const { data, error: dbError } = await supabase
    .from('workers')
    .insert({
      company_id: companyId,
      full_name: full_name.trim(),
      worker_type: isForeign ? 'foreign' : 'israeli',
      is_foreign_worker: isForeign,
      national_id: nationalIdNorm,
      passport_number: passportNorm,
      id_number: nationalIdNorm ?? passportNorm,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
      project_name: project_name?.trim() || null,
    })
    .select()
    .single();

  if (dbError) {
    // 23505 here means the DB composite index caught a race-condition duplicate
    // within this company.  Do not expose "in the system" — only "in this company".
    if (dbError.code === '23505') return NextResponse.json({ error: 'עובד עם מזהה זה כבר קיים בחברה' }, { status: 409 });
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
