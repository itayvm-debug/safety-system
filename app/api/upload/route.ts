import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { rateLimitUploadDb } from '@/lib/rate-limit/db';
import { authorizeStorageObjectAccess, normalizeStoragePath } from '@/lib/storage/authorize';
import { issueUploadPath, isUploadIssuedFor, isStoragePathReferenced } from '@/lib/storage/file-paths';
import { storeThumbnail, wantsThumbnail } from '@/lib/images/thumbnail';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  console.log('[upload] request received');

  const { context, error } = await requireCompanyAdminRole();
  if (error) {
    console.log('[upload] auth failed');
    return error;
  }
  console.log('[upload] auth ok, role:', context.platformRole, 'user:', context.username, 'company:', context.companyId);

  const rl = await rateLimitUploadDb(context.userId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי העלאות. נסה שנית בעוד מספר דקות.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
    console.log('[upload] formData parsed ok');
  } catch (err) {
    console.error('[upload] formData parse error:', err);
    return NextResponse.json({ error: 'שגיאה בפרסינג הקובץ' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const folderRaw = (formData.get('folder') as string) || 'documents';

  const ALLOWED_FOLDERS = [
    'documents', 'photos', 'briefings', 'signatures',
    'appointments', 'heavy-equipment', 'lifting-equipment', 'vehicles',
  ];
  if (!ALLOWED_FOLDERS.includes(folderRaw)) {
    return NextResponse.json({ error: 'תיקייה לא מורשית' }, { status: 400 });
  }
  const folder = folderRaw;

  console.log('[upload] folder:', folder);
  console.log('[upload] file present:', !!file);

  if (!file) {
    console.log('[upload] no file in formData');
    return NextResponse.json({ error: 'קובץ נדרש' }, { status: 400 });
  }

  console.log('[upload] file name:', file.name);
  console.log('[upload] file size:', file.size, 'bytes', `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log('[upload] file type:', file.type);

  if (file.size > 10 * 1024 * 1024) {
    console.log('[upload] file too large:', file.size);
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' }, { status: 400 });
  }

  const MIME_TO_EXT: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png':  ['png'],
    'image/webp': ['webp'],
    'application/pdf': ['pdf'],
  };
  if (!Object.keys(MIME_TO_EXT).includes(file.type)) {
    console.log('[upload] invalid mime type:', file.type);
    return NextResponse.json({ error: 'סוג קובץ לא מורשה (JPG, PNG, WebP, PDF בלבד)' }, { status: 400 });
  }

  const rawExt = (file.name.split('.').pop() ?? '').toLowerCase();
  const validExts = MIME_TO_EXT[file.type];
  if (!validExts.includes(rawExt)) {
    console.log('[upload] ext/mime mismatch:', rawExt, file.type);
    return NextResponse.json({ error: 'אי-התאמה בין סוג הקובץ לסיומת' }, { status: 400 });
  }

  const ext = rawExt;
  // The name embeds a company-bound receipt, verified when the path is attached to a record (P1·1)
  const fileName = issueUploadPath(context.companyId, folder, ext);
  console.log('[upload] uploading to storage path:', fileName);

  const supabase = createServiceClient();

  const { error: uploadError } = await supabase.storage
    .from('worker-files')
    .upload(fileName, file, { upsert: false });

  if (uploadError) {
    console.error('[upload] supabase storage error:', uploadError.message, uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  console.log('[upload] success, path:', fileName);

  // Small copy for lists (lib/images/thumbnail.ts). A failure only means lists show the original.
  if (wantsThumbnail(folder, file.type)) {
    try {
      const bytes = await storeThumbnail(supabase, fileName, Buffer.from(await file.arrayBuffer()));
      console.log('[upload] thumbnail stored:', bytes, 'bytes');
    } catch (e) {
      console.warn('[upload] thumbnail failed (lists will use the original):', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ path: fileName });
}

export async function DELETE(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;

  const rawPath = request.nextUrl.searchParams.get('path');
  if (!rawPath) return NextResponse.json({ error: 'path נדרש' }, { status: 400 });

  const path = normalizeStoragePath(rawPath);
  if (!path) return NextResponse.json({ error: 'אין גישה לקובץ זה' }, { status: 403 });

  const supabase = createServiceClient();

  // B-04 — this endpoint only discards a just-uploaded file that was never attached:
  // it must be an upload receipt issued to the active company AND referenced by no row.
  // A file referenced by a record must be removed through that record (which also
  // cleans storage). Fails safe: a lookup error counts as "referenced".
  const referencedMsg = 'הקובץ משויך לרשומה ולכן לא ניתן למחוק אותו כאן. יש למחוק אותו דרך הרשומה.';

  if (!isUploadIssuedFor(path, context.companyId)) {
    // Not provably ours. Say "attached" only for a file of this company's own records,
    // so another company's paths stay indistinguishable (no existence oracle).
    const owned = await authorizeStorageObjectAccess({ companyId: context.companyId, path, supabase });
    if (owned.allowed) return NextResponse.json({ error: referencedMsg }, { status: 409 });
    return NextResponse.json({ error: 'אין גישה לקובץ זה' }, { status: 403 });
  }

  if (await isStoragePathReferenced(supabase, path)) {
    return NextResponse.json({ error: referencedMsg }, { status: 409 });
  }

  const { error: storageError } = await supabase.storage.from('worker-files').remove([path]);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
