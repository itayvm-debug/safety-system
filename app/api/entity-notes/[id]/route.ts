import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('entity_notes')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'הערה לא נמצאה' }, { status: 404 });

  const body = await request.json();
  const { content, status } = body;

  const updates: Record<string, unknown> = {};
  if (content !== undefined) {
    if (!String(content ?? '').trim()) return NextResponse.json({ error: 'תוכן ההערה נדרש' }, { status: 400 });
    updates.content = String(content).trim();
  }
  if (status !== undefined) {
    const validStatuses = ['ok', 'needs_attention'];
    if (!validStatuses.includes(status)) return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 });
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from('entity_notes')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();

  if (dbError || !data) return NextResponse.json({ error: dbError?.message ?? 'שגיאה' }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;
  const { id } = await params;

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('entity_notes')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'הערה לא נמצאה' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('entity_notes')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
