import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient }          from '@/lib/supabase/server';
import { getCurrentCompanyContext }      from '@/lib/auth/company-context';
import { rateLimitSignedUrlDb }          from '@/lib/rate-limit/db';
import { authorizeStorageObjectAccess }  from '@/lib/storage/authorize';

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

  const authResult = await authorizeStorageObjectAccess({
    companyId: context.companyId,
    path,
    supabase,
  });

  if (!authResult.allowed) {
    console.warn('[signed-url] authorization failed', {
      userId:    context.userId,
      companyId: context.companyId,
      path,
      reason:    authResult.reason,
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
