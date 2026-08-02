import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdmin } from '@/lib/auth/company-context';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('lifting_equipment')
    .select('*, subcontractor:subcontractors(id, name)')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId, username } = context;

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

  if ('is_archived' in body) {
    updates.is_archived = !!body.is_archived;
    updates.archived_at = body.is_archived ? new Date().toISOString() : null;
    updates.archived_by = body.is_archived ? (username ?? null) : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Ownership check: verify record belongs to this company
  const { data: existing } = await supabase
    .from('lifting_equipment')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('lifting_equipment')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*, subcontractor:subcontractors(id, name)')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();

  const { data: eq } = await supabase
    .from('lifting_equipment')
    .select('image_url, inspection_file_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!eq) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const toDelete = [eq.image_url, eq.inspection_file_url].filter(Boolean) as string[];
  if (toDelete.length) await supabase.storage.from('worker-files').remove(toDelete);

  const { error: dbError } = await supabase
    .from('lifting_equipment')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
