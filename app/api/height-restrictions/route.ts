import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/api';
import { addYears } from 'date-fns';

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { worker_id, language, conducted_by, file_url, signature_url } = body;

  if (!worker_id) return NextResponse.json({ error: 'worker_id נדרש' }, { status: 400 });
  if (!language) return NextResponse.json({ error: 'שפה נדרשת' }, { status: 400 });

  const issued_at = new Date();
  const expires_at = addYears(issued_at, 1);

  const supabase = createServiceClient();
  const { data, error } = await supabase
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { restriction_id } = await request.json();
  if (!restriction_id) return NextResponse.json({ error: 'restriction_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: rec } = await supabase
    .from('height_restrictions')
    .select('file_url, signature_url')
    .eq('id', restriction_id)
    .single();

  if (rec?.file_url) await supabase.storage.from('worker-files').remove([rec.file_url]);
  if (rec?.signature_url) await supabase.storage.from('worker-files').remove([rec.signature_url]);

  const { error } = await supabase.from('height_restrictions').delete().eq('id', restriction_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
