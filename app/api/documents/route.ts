import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { isWorkVisaLocked } from '@/lib/documents/status';
import { validateFileFields, cleanupAfterChange, replacedPaths } from '@/lib/storage/file-paths';
import { readJsonObject } from '@/lib/http/json-body';

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const jsonIn = await readJsonObject(request, ['license_name']);
  if (!jsonIn.ok) return jsonIn.error;
  const body = jsonIn.body;
  const { worker_id, doc_type, license_name, file_url, expiry_date, is_required } = body;

  if (!worker_id || !doc_type) return NextResponse.json({ error: 'worker_id ו-doc_type נדרשים' }, { status: 400 });

  const validDocTypes = ['id_document', 'height_permit', 'work_visa', 'optional_license'];
  if (!validDocTypes.includes(doc_type)) return NextResponse.json({ error: 'סוג מסמך לא תקין' }, { status: 400 });

  if (doc_type === 'optional_license' && !license_name?.trim()) {
    return NextResponse.json({ error: 'שם הרישיון נדרש' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify the worker belongs to this company
  const { data: worker } = await supabase
    .from('workers')
    .select('id, is_foreign_worker')
    .eq('id', worker_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });

  // The upsert below replaces the current (worker, doc_type) row — its file counts as "unchanged"
  let existingDoc: { file_url: string | null } | null = null;
  if (doc_type !== 'optional_license') {
    const { data: current } = await supabase
      .from('documents')
      .select('file_url')
      .eq('worker_id', worker_id)
      .eq('doc_type', doc_type)
      .eq('company_id', companyId)
      .maybeSingle();
    existingDoc = current ?? null;
  }

  // P1·1 — the client may only attach a file issued to / owned by this company
  const fileCheck = await validateFileFields(
    supabase, companyId, { file_url }, { file_url: existingDoc?.file_url },
  );
  if (!fileCheck.ok) return fileCheck.error;
  const fileValues = fileCheck.values; // contains file_url only when the client sent it

  let effectiveIsRequired = is_required !== undefined ? is_required : true;
  if (doc_type === 'work_visa') {
    if (isWorkVisaLocked('work_visa', !!worker.is_foreign_worker)) {
      effectiveIsRequired = true;
    }
  }

  if (doc_type === 'optional_license') {
    const { data, error: dbError } = await supabase
      .from('documents')
      .insert({
        company_id: companyId,
        worker_id,
        doc_type,
        license_name: license_name.trim(),
        file_url: fileValues.file_url ?? null,
        expiry_date: expiry_date || null,
      })
      .select()
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error: dbError } = await supabase
    .from('documents')
    .upsert(
      {
        company_id: companyId,
        worker_id,
        doc_type,
        file_url: 'file_url' in fileValues ? fileValues.file_url : undefined,
        expiry_date: expiry_date !== undefined ? (expiry_date || null) : undefined,
        is_required: effectiveIsRequired,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'worker_id,doc_type' }
    )
    .select()
    .single();

  if (dbError) {
    console.error('[documents] upsert error:', dbError.message, dbError);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  console.log('[documents] upsert ok, id:', data?.id, 'doc_type:', data?.doc_type, 'file_url:', data?.file_url);

  // P1·6 — retention gate: the file is kept until a retention policy is decided (AUTO_REMOVE_ON)
  await cleanupAfterChange('file_replaced', supabase, replacedPaths(existingDoc, fileValues));
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const jsonIn = await readJsonObject(request);
  if (!jsonIn.ok) return jsonIn.error;
  const { doc_id } = jsonIn.body;
  if (!doc_id) return NextResponse.json({ error: 'doc_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Fetch document and verify it belongs to this company
  const { data: doc } = await supabase
    .from('documents')
    .select('file_url, company_id')
    .eq('id', doc_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: 'מסמך לא נמצא' }, { status: 404 });

  // Delete DB record first — if this fails, storage stays intact (no broken references)
  const { error: dbError } = await supabase
    .from('documents')
    .delete()
    .eq('id', doc_id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Storage cleanup is non-fatal; record is already deleted. Shared objects are kept.
  await cleanupAfterChange('document_deleted', supabase, [doc.file_url]);

  return NextResponse.json({ success: true });
}
