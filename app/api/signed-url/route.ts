import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/api';

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const path = request.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const download = request.nextUrl.searchParams.get('download') === '1';

  const { data, error } = await supabase.storage
    .from('worker-files')
    .createSignedUrl(path, 3600, download ? { download: true } : undefined);

  if (error || !data) return NextResponse.json({ error: 'לא ניתן ליצור קישור' }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
