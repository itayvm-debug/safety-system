import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole, getCurrentCompanyContext } from '@/lib/auth/company-context';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: license } = await supabase
    .from('professional_licenses')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!license) return NextResponse.json({ error: 'רישיון לא נמצא' }, { status: 404 });

  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', license.worker_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'רישיון לא נמצא' }, { status: 404 });

  return NextResponse.json(license);
}

export function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const body = await request.json();
  const { license_type, license_number, expiry_date, file_url, notes } = body;

  const supabase = createServiceClient();

  const { data: license } = await supabase
    .from('professional_licenses')
    .select('worker_id')
    .eq('id', id)
    .maybeSingle();

  if (!license) return NextResponse.json({ error: 'רישיון לא נמצא' }, { status: 404 });

  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', license.worker_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'רישיון לא נמצא' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (license_type !== undefined) updates.license_type = license_type;
  if (license_number !== undefined) updates.license_number = license_number;
  if (expiry_date !== undefined) updates.expiry_date = expiry_date;
  if (file_url !== undefined) updates.file_url = file_url;
  if (notes !== undefined) updates.notes = notes;

  const { data, error: dbError } = await supabase
    .from('professional_licenses')
    .update(updates)
    .eq('id', id)
    .eq('worker_id', license.worker_id)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: license } = await supabase
    .from('professional_licenses')
    .select('worker_id')
    .eq('id', id)
    .maybeSingle();

  if (!license) return NextResponse.json({ error: 'רישיון לא נמצא' }, { status: 404 });

  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', license.worker_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'רישיון לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('professional_licenses')
    .delete()
    .eq('id', id)
    .eq('worker_id', license.worker_id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
