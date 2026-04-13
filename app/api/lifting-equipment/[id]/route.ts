import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('lifting_equipment')
    .select('*, subcontractor:subcontractors(id, name)')
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
  const allowed = [
    'description', 'image_url',
    'inspection_file_url', 'inspection_expiry',
    'subcontractor_id', 'project_name', 'is_active',
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] ?? null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('lifting_equipment')
    .update(updates)
    .eq('id', id)
    .select('*, subcontractor:subcontractors(id, name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = createServiceClient();

  const { data: eq } = await supabase.from('lifting_equipment').select('image_url,inspection_file_url').eq('id', id).single();
  if (eq) {
    const toDelete = [eq.image_url, eq.inspection_file_url].filter(Boolean) as string[];
    if (toDelete.length) await supabase.storage.from('worker-files').remove(toDelete);
  }

  const { error } = await supabase.from('lifting_equipment').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
