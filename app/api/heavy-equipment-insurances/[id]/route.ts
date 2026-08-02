import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdmin } from '@/lib/auth/company-context';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;

  const { id } = await params;

  const supabase = createServiceClient();

  // Ownership check: direct company_id match on the insurance record
  const { data: existing } = await supabase
    .from('heavy_equipment_insurances')
    .select('id')
    .eq('id', id)
    .eq('company_id', context.companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const body = await request.json();
  const allowed = ['file_url', 'expiry_date'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] ?? null;
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });

  const { data, error: dbError } = await supabase
    .from('heavy_equipment_insurances')
    .update(updates)
    .eq('id', id)
    .eq('company_id', context.companyId)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;

  const { id } = await params;
  const supabase = createServiceClient();

  // Ownership check + fetch file for Storage cleanup
  const { data: ins } = await supabase
    .from('heavy_equipment_insurances')
    .select('file_url')
    .eq('id', id)
    .eq('company_id', context.companyId)
    .single();

  if (!ins) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  if (ins.file_url) {
    await supabase.storage.from('worker-files').remove([ins.file_url]);
  }

  const { error: dbError } = await supabase
    .from('heavy_equipment_insurances')
    .delete()
    .eq('id', id)
    .eq('company_id', context.companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
