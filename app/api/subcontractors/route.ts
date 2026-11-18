import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';
import { optionalPhone, optionalText } from '@/lib/validation/fields';

export async function GET() {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('subcontractors')
    .select('*, responsible_worker:workers!subcontractors_responsible_worker_id_fkey(id, full_name)')
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .order('name');

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });

  const name = optionalText(body.name, 'שם קבלן', 200);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
  if (!name.value) return NextResponse.json({ error: 'שם קבלן נדרש' }, { status: 400 });
  const contactName = optionalText(body.contact_name, 'איש קשר', 200);
  const phone = optionalPhone(body.phone);
  const notes = optionalText(body.notes, 'הערות', 2000);
  for (const f of [contactName, phone, notes]) {
    if (!f.ok) return NextResponse.json({ error: f.error }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('subcontractors')
    .insert({
      company_id: companyId,
      name: name.value,
      contact_name: contactName.ok ? contactName.value : null,
      phone: phone.ok ? phone.value : null,
      notes: notes.ok ? notes.value : null,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
