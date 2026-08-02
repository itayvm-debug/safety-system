import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdmin } from '@/lib/auth/company-context';

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
    .from('vehicle_licenses')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json();
  const { vehicle_id, file_url, expiry_date } = body;

  if (!vehicle_id) return NextResponse.json({ error: 'vehicle_id נדרש' }, { status: 400 });

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
    .from('vehicle_licenses')
    .insert({ vehicle_id, company_id: companyId, file_url: file_url || null, expiry_date: expiry_date || null })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
