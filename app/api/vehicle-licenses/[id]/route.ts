import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';
import { validateFileFields, cleanupAfterChange, replacedPaths } from '@/lib/storage/file-paths';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: license } = await supabase
    .from('vehicle_licenses')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!license) return NextResponse.json({ error: 'רישיון לא נמצא' }, { status: 404 });
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
  const { file_url, expiry_date } = body;

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('vehicle_licenses')
    .select('id, file_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'רישיון לא נמצא' }, { status: 404 });

  // P1·1 — the client may only attach a file issued to / owned by this company
  const before = { file_url: existing.file_url as string | null };
  const fileCheck = await validateFileFields(supabase, companyId, { file_url }, before);
  if (!fileCheck.ok) return fileCheck.error;

  const updates: Record<string, unknown> = {};
  if (file_url !== undefined) updates.file_url = fileCheck.values.file_url;
  if (expiry_date !== undefined) updates.expiry_date = expiry_date;

  const { data, error: dbError } = await supabase
    .from('vehicle_licenses')
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
    .from('vehicle_licenses')
    .select('id, file_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'רישיון לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('vehicle_licenses')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // P1·6 — retention gate: the file is kept until a retention policy is decided (AUTO_REMOVE_ON)
  await cleanupAfterChange('record_deleted', supabase, [existing.file_url as string | null]);
  return NextResponse.json({ success: true });
}
