import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';

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

  const body = await request.json();
  const { name, contact_name, phone, notes } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'שם קבלן נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('subcontractors')
    .insert({
      company_id: companyId,
      name: name.trim(),
      contact_name: contact_name?.trim() || null,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
