import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';
import { optionalPhone, optionalText } from '@/lib/validation/fields';

type Params = { params: Promise<{ id: string }> };

const SELECT_SUB = '*, responsible_worker:workers!subcontractors_responsible_worker_id_fkey(id, full_name)';

export async function GET(_request: NextRequest, { params }: Params) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('subcontractors')
    .select(SELECT_SUB)
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'קבלן לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

const PATCH_ALLOWED = ['name', 'contact_name', 'phone', 'notes', 'is_archived', 'responsible_worker_id'] as const;
type PatchField = (typeof PATCH_ALLOWED)[number];

export async function PATCH(request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('subcontractors')
    .select('id, phone')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'קבלן לא נמצא' }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const patch: Partial<Record<PatchField, unknown>> = {};
  for (const field of PATCH_ALLOWED) {
    if (field in body) patch[field] = body[field];
  }

  if (patch.name !== undefined) {
    const name = optionalText(patch.name, 'שם קבלן', 200);
    if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
    if (!name.value) return NextResponse.json({ error: 'שם קבלן נדרש' }, { status: 400 });
    patch.name = name.value;
  }
  const textChecks = [
    ['contact_name', () => optionalText(patch.contact_name, 'איש קשר', 200)],
    ['phone', () => optionalPhone(patch.phone, (existing as { phone: string | null }).phone)],
    ['notes', () => optionalText(patch.notes, 'הערות', 2000)],
  ] as const;
  for (const [field, check] of textChecks) {
    if (patch[field] === undefined) continue;
    const r = check();
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch[field] = r.value;
  }
  if (patch.is_archived !== undefined && typeof patch.is_archived !== 'boolean') {
    return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 });
  }
  if (patch.responsible_worker_id != null && typeof patch.responsible_worker_id !== 'string') {
    return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });
  }

  // Validate responsible_worker_id belongs to the same company
  if ('responsible_worker_id' in patch && patch.responsible_worker_id) {
    const workerId = patch.responsible_worker_id as string;
    const { data: worker } = await supabase
      .from('workers')
      .select('id')
      .eq('id', workerId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!worker) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { ...patch };
  if (patch.is_archived === true)  updates.archived_at = new Date().toISOString();
  if (patch.is_archived === false) updates.archived_at = null;

  const { data, error: dbError } = await supabase
    .from('subcontractors')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select(SELECT_SUB)
    .single();

  if (dbError || !data) return NextResponse.json({ error: dbError?.message ?? 'שגיאה' }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data: sub, error: fetchErr } = await supabase
    .from('subcontractors')
    .select('id, is_archived')
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (fetchErr || !sub) return NextResponse.json({ error: 'קבלן לא נמצא' }, { status: 404 });

  if (!sub.is_archived) {
    return NextResponse.json(
      { error: 'יש להעביר את הקבלן לארכיון לפני מחיקה לצמיתות.' },
      { status: 409 },
    );
  }

  // Remove polymorphic notes (no FK to subcontractors)
  await supabase.from('entity_notes').delete().eq('entity_type', 'subcontractor').eq('entity_id', id);

  const { error: deleteErr } = await supabase
    .from('subcontractors')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
