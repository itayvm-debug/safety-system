import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { addYears } from 'date-fns';

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json();
  const { worker_id, language, conducted_by, file_url, signature_url } = body;

  if (!worker_id) return NextResponse.json({ error: 'worker_id נדרש' }, { status: 400 });
  if (!language)  return NextResponse.json({ error: 'שפה נדרשת' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify worker belongs to this company
  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', worker_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });

  const issued_at = new Date();
  const expires_at = addYears(issued_at, 1);

  const { data, error: dbError } = await supabase
    .from('height_restrictions')
    .insert({
      worker_id,
      language,
      conducted_by: conducted_by?.trim() || null,
      file_url: file_url || null,
      signature_url: signature_url || null,
      issued_at: issued_at.toISOString(),
      expires_at: expires_at.toISOString(),
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const { restriction_id } = await request.json();
  if (!restriction_id) return NextResponse.json({ error: 'restriction_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify the restriction's worker belongs to this company
  const { data: rec } = await supabase
    .from('height_restrictions')
    .select('worker_id, file_url, signature_url')
    .eq('id', restriction_id)
    .single();

  if (!rec) return NextResponse.json({ error: 'הגבלה לא נמצאה' }, { status: 404 });

  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', rec.worker_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'הגבלה לא נמצאה' }, { status: 404 });

  if (rec.file_url)      await supabase.storage.from('worker-files').remove([rec.file_url]);
  if (rec.signature_url) await supabase.storage.from('worker-files').remove([rec.signature_url]);

  const { error: dbError } = await supabase
    .from('height_restrictions')
    .delete()
    .eq('id', restriction_id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
