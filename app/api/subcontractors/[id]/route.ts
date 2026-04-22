import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('subcontractors')
    .select('*, responsible_worker:workers!subcontractors_responsible_worker_id_fkey(id, full_name)')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { name, contact_name, phone, notes, responsible_worker_id } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: 'שם קבלן לא יכול להיות ריק' }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};
  if (name !== undefined) updates.name = name.trim();
  if (contact_name !== undefined) updates.contact_name = contact_name?.trim() || null;
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (notes !== undefined) updates.notes = notes?.trim() || null;
  if ('responsible_worker_id' in body) updates.responsible_worker_id = responsible_worker_id ?? null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('subcontractors')
    .update(updates)
    .eq('id', id)
    .select('*, responsible_worker:workers!subcontractors_responsible_worker_id_fkey(id, full_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('subcontractors')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
