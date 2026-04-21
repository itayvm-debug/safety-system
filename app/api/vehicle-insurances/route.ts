import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const vehicleId = request.nextUrl.searchParams.get('vehicle_id');
  if (!vehicleId) return NextResponse.json({ error: 'vehicle_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('vehicle_insurances')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('insurance_type');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { vehicle_id, insurance_type, file_url, expiry_date } = body;

  if (!vehicle_id) return NextResponse.json({ error: 'vehicle_id נדרש' }, { status: 400 });
  if (!insurance_type?.trim()) return NextResponse.json({ error: 'סוג ביטוח נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('vehicle_insurances')
    .insert({
      vehicle_id,
      insurance_type: insurance_type.trim(),
      file_url: file_url || null,
      expiry_date: expiry_date || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
