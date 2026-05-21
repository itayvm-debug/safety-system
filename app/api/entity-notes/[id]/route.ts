import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/api';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

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
  const { data, error } = await supabase
    .from('entity_notes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('entity_notes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
