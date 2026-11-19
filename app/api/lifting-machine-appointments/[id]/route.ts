import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';
import { validateFileFields, cleanupAfterChange, replacedPaths } from '@/lib/storage/file-paths';
import { optionalPhone } from '@/lib/validation/fields';
import { readJsonObject } from '@/lib/http/json-body';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('lifting_machine_appointments')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'מינוי לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('lifting_machine_appointments')
    .select('id, operator_signature_url, appointer_signature_url, pdf_url, appointer_phone')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'מינוי לא נמצא' }, { status: 404 });

  const jsonIn = await readJsonObject(request);
  if (!jsonIn.ok) return jsonIn.error;
  const body = jsonIn.body;
  const {
    worker_id,
    equipment_id,
    machine_name,
    manufacturer,
    machine_identifier,
    safe_working_load,
    power_type,
    appointer_name,
    appointer_role,
    appointer_phone,
    appointer_address,
    appointer_zip,
    appointment_date,
    operator_signature_url,
    appointer_signature_url,
    pdf_url,
    machines,
  } = body;

  if (worker_id !== undefined && worker_id !== null) {
    const { data: w } = await supabase
      .from('workers')
      .select('id')
      .eq('id', worker_id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!w) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });
  }

  if (equipment_id !== undefined && equipment_id !== null) {
    const { data: e } = await supabase
      .from('heavy_equipment')
      .select('id')
      .eq('id', equipment_id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!e) return NextResponse.json({ error: 'ציוד לא נמצא' }, { status: 404 });
  }

  // P1·1 — client-supplied file paths must be issued to / owned by this company
  const before = {
    operator_signature_url:  existing.operator_signature_url as string | null,
    appointer_signature_url: existing.appointer_signature_url as string | null,
    pdf_url:                 existing.pdf_url as string | null,
  };
  const fileCheck = await validateFileFields(
    supabase, companyId, { operator_signature_url, appointer_signature_url, pdf_url }, before,
  );
  if (!fileCheck.ok) return fileCheck.error;
  const files = fileCheck.values;

  const updates: Record<string, unknown> = {};
  if (worker_id             !== undefined) updates.worker_id             = worker_id;
  if (equipment_id          !== undefined) updates.equipment_id          = equipment_id;
  if (machine_name          !== undefined) updates.machine_name          = machine_name;
  if (manufacturer          !== undefined) updates.manufacturer          = manufacturer;
  if (machine_identifier    !== undefined) updates.machine_identifier    = machine_identifier;
  if (safe_working_load     !== undefined) updates.safe_working_load     = safe_working_load;
  if (power_type            !== undefined) updates.power_type            = power_type;
  if (appointer_name        !== undefined) updates.appointer_name        = appointer_name;
  if (appointer_role        !== undefined) updates.appointer_role        = appointer_role;
  if (appointer_phone       !== undefined) {
    // Same check as on create; an unchanged legacy value passes (code review 2026-11-19)
    const phone = optionalPhone(appointer_phone, (existing as { appointer_phone?: string | null }).appointer_phone ?? null);
    if (!phone.ok) return NextResponse.json({ error: phone.error }, { status: 400 });
    updates.appointer_phone = phone.value;
  }
  if (appointer_address     !== undefined) updates.appointer_address     = appointer_address;
  if (appointer_zip         !== undefined) updates.appointer_zip         = appointer_zip;
  if (appointment_date      !== undefined) updates.appointment_date      = appointment_date;
  if (operator_signature_url  !== undefined) updates.operator_signature_url  = files.operator_signature_url;
  if (appointer_signature_url !== undefined) updates.appointer_signature_url = files.appointer_signature_url;
  if (pdf_url               !== undefined) updates.pdf_url               = files.pdf_url;
  if (machines              !== undefined) updates.machines              = machines;

  const { data, error: dbError } = await supabase
    .from('lifting_machine_appointments')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
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
    .from('lifting_machine_appointments')
    .select('id, operator_signature_url, appointer_signature_url, pdf_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'מינוי לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('lifting_machine_appointments')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // P1·6 — retention gate: the file is kept until a retention policy is decided (AUTO_REMOVE_ON)
  await cleanupAfterChange('record_deleted', supabase, [
    existing.operator_signature_url as string | null,
    existing.appointer_signature_url as string | null,
    existing.pdf_url as string | null,
  ]);
  return NextResponse.json({ success: true });
}
