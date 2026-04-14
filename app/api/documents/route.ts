import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/api';

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { worker_id, doc_type, license_name, file_url, expiry_date, is_required } = body;

  if (!worker_id || !doc_type) return NextResponse.json({ error: 'worker_id ו-doc_type נדרשים' }, { status: 400 });

  const validDocTypes = ['id_document', 'height_permit', 'work_visa', 'optional_license'];
  if (!validDocTypes.includes(doc_type)) return NextResponse.json({ error: 'סוג מסמך לא תקין' }, { status: 400 });

  if (doc_type === 'optional_license' && !license_name?.trim()) {
    return NextResponse.json({ error: 'שם הרישיון נדרש' }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (doc_type === 'optional_license') {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        worker_id,
        doc_type,
        license_name: license_name.trim(),
        file_url: file_url || null,
        expiry_date: expiry_date || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('documents')
    .upsert(
      {
        worker_id,
        doc_type,
        file_url: file_url !== undefined ? (file_url || null) : undefined,
        expiry_date: expiry_date !== undefined ? (expiry_date || null) : undefined,
        is_required: is_required !== undefined ? is_required : true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'worker_id,doc_type' }
    )
    .select()
    .single();

  if (error) {
    console.error('[documents] upsert error:', error.message, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.log('[documents] upsert ok, id:', data?.id, 'doc_type:', data?.doc_type, 'file_url:', data?.file_url);
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { doc_id } = await request.json();
  if (!doc_id) return NextResponse.json({ error: 'doc_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: doc } = await supabase
    .from('documents')
    .select('file_url')
    .eq('id', doc_id)
    .single();

  if (doc?.file_url) {
    await supabase.storage.from('worker-files').remove([doc.file_url]);
  }

  const { error } = await supabase.from('documents').delete().eq('id', doc_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
