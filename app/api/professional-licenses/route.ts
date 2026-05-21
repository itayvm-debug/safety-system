import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const workerId = request.nextUrl.searchParams.get('worker_id');
  if (!workerId) return NextResponse.json({ error: 'worker_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('professional_licenses')
    .select('*')
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { worker_id, license_type, license_number, expiry_date, file_url, notes } = body;

  if (!worker_id) return NextResponse.json({ error: 'worker_id נדרש' }, { status: 400 });
  if (!license_type?.trim()) return NextResponse.json({ error: 'סוג הרישיון נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('professional_licenses')
    .insert({
      worker_id,
      license_type: license_type.trim(),
      license_number: license_number?.trim() || null,
      expiry_date: expiry_date || null,
      file_url: file_url || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('professional_licenses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
