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

// DELETE /api/workers/[id] — permanent deletion (worker must be archived first)
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id: workerId } = await params;
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();

  // 1. Load worker scoped to active company — cross-company returns 404
  const { data: workerRaw, error: fetchErr } = await supabase
    .from('workers')
    .select('id, company_id, is_archived, photo_url')
    .eq('id', workerId)
    .eq('company_id', companyId)
    .single();

  if (fetchErr || !workerRaw) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const worker = workerRaw as { id: string; company_id: string; is_archived: boolean; photo_url: string | null };

  if (!worker.is_archived) {
    return NextResponse.json(
      { error: 'יש להעביר את העובד לארכיון לפני מחיקה לצמיתות.' },
      { status: 409 }
    );
  }

  // 2. Collect storage paths from all child tables before deletion
  const storagePaths: string[] = [];
  if (worker.photo_url) storagePaths.push(worker.photo_url);

  function collectPaths(rows: Record<string, unknown>[] | null, ...cols: string[]) {
    if (!rows) return;
    for (const row of rows) {
      for (const col of cols) {
        const val = row[col];
        if (typeof val === 'string' && val) storagePaths.push(val);
      }
    }
  }

  const [
    { data: docs },
    { data: briefings },
    { data: heights },
    { data: appointments },
    { data: profLicenses },
    { data: mgrLicenses },
  ] = await Promise.all([
    supabase.from('documents').select('file_url').eq('worker_id', workerId),
    supabase.from('safety_briefings').select('file_url, signature_url').eq('worker_id', workerId),
    supabase.from('height_restrictions').select('file_url, signature_url').eq('worker_id', workerId),
    supabase.from('lifting_machine_appointments').select('operator_signature_url, appointer_signature_url, pdf_url').eq('worker_id', workerId),
    supabase.from('professional_licenses').select('file_url').eq('worker_id', workerId),
    supabase.from('manager_licenses').select('file_url').eq('worker_id', workerId),
  ]);

  collectPaths(docs as Record<string, unknown>[] | null, 'file_url');
  collectPaths(briefings as Record<string, unknown>[] | null, 'file_url', 'signature_url');
  collectPaths(heights as Record<string, unknown>[] | null, 'file_url', 'signature_url');
  collectPaths(appointments as Record<string, unknown>[] | null, 'operator_signature_url', 'appointer_signature_url', 'pdf_url');
  collectPaths(profLicenses as Record<string, unknown>[] | null, 'file_url');
  collectPaths(mgrLicenses as Record<string, unknown>[] | null, 'file_url');

  // 3. Explicit pre-deletion: entity_notes (polymorphic, no FK to workers)
  await supabase.from('entity_notes').delete().eq('entity_type', 'worker').eq('entity_id', workerId);

  // 4. Explicit pre-deletion: professional_licenses (FK cascade unconfirmed)
  await supabase.from('professional_licenses').delete().eq('worker_id', workerId);

  // 5. Explicit pre-deletion: manager_licenses (FK cascade unconfirmed)
  await supabase.from('manager_licenses').delete().eq('worker_id', workerId);

  // 6. Detach this worker as responsible_manager_id on other workers
  await supabase.from('workers').update({ responsible_manager_id: null }).eq('responsible_manager_id', workerId);

  // 7. Delete worker row.
  //    Cascade handles: documents, safety_briefings, height_restrictions, lifting_machine_appointments
  //    SET NULL handles: vehicles.assigned_manager_id
  //    Preserved: audit_logs (append-only, polymorphic, no FK)
  const { error: deleteErr } = await supabase
    .from('workers')
    .delete()
    .eq('id', workerId)
    .eq('company_id', companyId);

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  // 8. Clean up storage — non-fatal; DB deletion already committed
  if (storagePaths.length > 0) {
    await supabase.storage.from('worker-files').remove(storagePaths).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
