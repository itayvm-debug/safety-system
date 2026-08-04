import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const vehicleId = request.nextUrl.searchParams.get('vehicle_id');
  if (!vehicleId) return NextResponse.json({ error: 'vehicle_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify parent vehicle belongs to this company
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!vehicle) return NextResponse.json({ error: 'רכב לא נמצא' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('vehicle_insurances')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('company_id', companyId)
    .order('insurance_type');

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json();
  const { vehicle_id, insurance_type, file_url, expiry_date } = body;

  if (!vehicle_id) return NextResponse.json({ error: 'vehicle_id נדרש' }, { status: 400 });
  if (!insurance_type?.trim()) return NextResponse.json({ error: 'סוג ביטוח נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify parent vehicle belongs to this company
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', vehicle_id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!vehicle) return NextResponse.json({ error: 'רכב לא נמצא' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('vehicle_insurances')
    .insert({
      vehicle_id,
      company_id: companyId,
      insurance_type: insurance_type.trim(),
      file_url: file_url || null,
      expiry_date: expiry_date || null,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const body = await request.json();
  const { file_url, expiry_date, insurance_type } = body;

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('vehicle_insurances')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ביטוח לא נמצא' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (insurance_type !== undefined) updates.insurance_type = insurance_type;
  if (file_url !== undefined) updates.file_url = file_url;
  if (expiry_date !== undefined) updates.expiry_date = expiry_date;

  const { data, error: dbError } = await supabase
    .from('vehicle_insurances')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
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

  const { data: existing } = await supabase
    .from('vehicle_insurances')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'ביטוח לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('vehicle_insurances')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
