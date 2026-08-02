import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdmin } from '@/lib/auth/company-context';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if ('content' in body) {
    if (!body.content?.trim()) return NextResponse.json({ error: 'תוכן ההערה נדרש' }, { status: 400 });
    updates.content = body.content.trim();
  }
  if ('status' in body) {
    const valid = ['ok', 'needs_attention'];
    if (!valid.includes(body.status)) return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 });
    updates.status = body.status;
  }
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });

  updates.updated_at = new Date().toISOString();

  const supabase = createServiceClient();

  // Verify note belongs to this company
  const { data: note } = await supabase
    .from('entity_notes')
    .select('company_id')
    .eq('id', id)
    .maybeSingle();

  if (!note) return NextResponse.json({ error: 'הערה לא נמצאה' }, { status: 404 });
  if (note.company_id !== companyId) return NextResponse.json({ error: 'הערה לא נמצאה' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('entity_notes')
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

  // Verify note belongs to this company
  const { data: note } = await supabase
    .from('entity_notes')
    .select('company_id')
    .eq('id', id)
    .maybeSingle();

  if (!note) return NextResponse.json({ error: 'הערה לא נמצאה' }, { status: 404 });
  if (note.company_id !== companyId) return NextResponse.json({ error: 'הערה לא נמצאה' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('entity_notes')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
