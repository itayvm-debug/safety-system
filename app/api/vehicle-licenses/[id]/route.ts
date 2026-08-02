import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdmin } from '@/lib/auth/company-context';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const body = await request.json();

  const supabase = createServiceClient();

  // Direct company_id ownership check — no two-hop chain needed after Batch 3
  const { data: record } = await supabase
    .from('vehicle_licenses')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!record) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const allowed = ['file_url', 'expiry_date'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] ?? null;
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });

  const { data, error: dbError } = await supabase
    .from('vehicle_licenses')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();

  // Direct company_id ownership check — no two-hop chain needed after Batch 3
  const { data: record } = await supabase
    .from('vehicle_licenses')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!record) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase.from('vehicle_licenses').delete().eq('id', id).eq('company_id', companyId);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
