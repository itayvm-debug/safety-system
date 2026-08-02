import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdmin, getCurrentCompanyContext } from '@/lib/auth/company-context';

export async function GET(request: NextRequest) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const workerId = request.nextUrl.searchParams.get('worker_id');
  if (!workerId) return NextResponse.json({ error: 'worker_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify worker belongs to this company
  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', workerId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('manager_licenses')
    .select('*')
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json();
  const { worker_id, license_type, file_url, expiry_date, vehicle_number } = body;

  if (!worker_id) return NextResponse.json({ error: 'worker_id נדרש' }, { status: 400 });
  if (!license_type?.trim()) return NextResponse.json({ error: 'סוג הרישיון נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify worker belongs to this company
  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', worker_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('manager_licenses')
    .insert({
      worker_id,
      license_type: license_type.trim(),
      file_url: file_url || null,
      expiry_date: expiry_date || null,
      vehicle_number: vehicle_number?.trim() || null,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
