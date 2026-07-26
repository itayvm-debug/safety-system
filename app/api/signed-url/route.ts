import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient }          from '@/lib/supabase/server';
import { getCurrentCompanyContext }      from '@/lib/auth/company-context';
import { rateLimitSignedUrlDb }          from '@/lib/rate-limit/db';

/**
 * Verify that a storage path belongs to the caller's company.
 * Checks: workers.photo_url, documents.file_url,
 *         safety_briefings.(file_url|signature_url),
 *         height_restrictions.(file_url|signature_url)
 * Returns false for any path that cannot be confirmed as company-owned.
 */
async function verifyPathOwnership(
  supabase: ReturnType<typeof createServiceClient>,
  path: string,
  companyId: string
): Promise<boolean> {
  // Fetch company's worker IDs and photo URLs in one query
  const { data: workerRows } = await supabase
    .from('workers')
    .select('id, photo_url')
    .eq('company_id', companyId);

  if (!workerRows) return false;

  // Check photo_url inline
  if (workerRows.some(w => w.photo_url === path)) return true;

  const workerIds = workerRows.map(w => w.id);
  if (workerIds.length === 0) return false;

  // Check remaining file-bearing tables in parallel
  const [docRes, briefingFileRes, briefingSigRes, heightFileRes, heightSigRes] = await Promise.all([
    supabase
      .from('documents')
      .select('id')
      .eq('file_url', path)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('safety_briefings')
      .select('id')
      .eq('file_url', path)
      .in('worker_id', workerIds)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('safety_briefings')
      .select('id')
      .eq('signature_url', path)
      .in('worker_id', workerIds)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('height_restrictions')
      .select('id')
      .eq('file_url', path)
      .in('worker_id', workerIds)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('height_restrictions')
      .select('id')
      .eq('signature_url', path)
      .in('worker_id', workerIds)
      .limit(1)
      .maybeSingle(),
  ]);

  return !!(
    docRes.data ||
    briefingFileRes.data ||
    briefingSigRes.data ||
    heightFileRes.data ||
    heightSigRes.data
  );
}

export async function GET(request: NextRequest) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;

  const rl = await rateLimitSignedUrlDb(context.userId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי בקשות. נסה שנית בעוד מספר שניות.' },
      {
        status: 429,
        headers: {
          'Retry-After':           String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  const path = request.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify the requested path belongs to the caller's company
  const owned = await verifyPathOwnership(supabase, path, context.companyId);
  if (!owned) {
    console.warn('[signed-url] path ownership verification failed', {
      userId: context.userId,
      companyId: context.companyId,
      path,
    });
    return NextResponse.json({ error: 'אין גישה לקובץ זה' }, { status: 403 });
  }

  const download = request.nextUrl.searchParams.get('download') === '1';
  const { data, error: urlError } = await supabase.storage
    .from('worker-files')
    .createSignedUrl(path, 3600, download ? { download: true } : undefined);

  if (urlError || !data) return NextResponse.json({ error: 'לא ניתן ליצור קישור' }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
