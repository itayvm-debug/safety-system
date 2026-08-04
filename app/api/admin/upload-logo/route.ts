import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/api';

export const runtime = 'nodejs';

const MIME_TO_EXT: Record<string, string[]> = {
  'image/png':     ['png'],
  'image/jpeg':    ['jpg', 'jpeg'],
  'image/svg+xml': ['svg'],
};

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'שגיאה בפרסינג הקובץ' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'קובץ נדרש' }, { status: 400 });

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 2MB)' }, { status: 400 });
  }

  if (!Object.hasOwn(MIME_TO_EXT, file.type)) {
    return NextResponse.json({ error: 'סוג קובץ לא מורשה (PNG, JPG, SVG בלבד)' }, { status: 400 });
  }

  const rawExt = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!MIME_TO_EXT[file.type].includes(rawExt)) {
    return NextResponse.json({ error: 'אי-התאמה בין סוג הקובץ לסיומת' }, { status: 400 });
  }

  const fileName = `company-logos/${Date.now()}-${randomBytes(8).toString('hex')}.${rawExt}`;
  const supabase = createServiceClient();

  const { error: uploadError } = await supabase.storage
    .from('worker-files')
    .upload(fileName, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  return NextResponse.json({ path: fileName });
}

export async function DELETE(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const path = request.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path נדרש' }, { status: 400 });

  // Restrict to the company-logos/ prefix to prevent arbitrary storage deletion.
  if (!path.startsWith('company-logos/')) {
    return NextResponse.json({ error: 'מסלול לא מורשה לניקוי' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { error: storageError } = await supabase.storage.from('worker-files').remove([path]);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
