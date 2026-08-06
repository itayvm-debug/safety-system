import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdminRole } from '@/lib/auth/company-context';

type Params = { params: Promise<{ id: string }> };

// GET /api/workers/[id] — single worker scoped to active company
export async function GET(_request: NextRequest, { params }: Params) {
  const { id: workerId } = await params;
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('workers')
    .select('*, subcontractor:subcontractors!workers_subcontractor_id_fkey(id, name)')
    .eq('id', workerId)
    .eq('company_id', companyId)
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

// Fields that PATCH is allowed to update — company_id and id are never accepted from body
const PATCH_ALLOWED = [
  'is_archived',
  'is_active',
  'is_crane_operator',
  'is_responsible_site_manager',
  'subcontractor_id',
  'responsible_manager_id',
  'photo_url',
] as const;

type PatchField = (typeof PATCH_ALLOWED)[number];

// PATCH /api/workers/[id] — partial update (archive, toggles, assignments, photo)
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: workerId } = await params;
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json();
  const patch: Partial<Record<PatchField, unknown>> = {};
  for (const field of PATCH_ALLOWED) {
    if (field in body) patch[field] = body[field];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('workers')
    .update(patch)
    .eq('id', workerId)
    .eq('company_id', companyId)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}
