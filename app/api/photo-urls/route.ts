import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { rateLimitSignedUrlDb } from '@/lib/rate-limit/db';
import { readJsonObject } from '@/lib/http/json-body';
import { authorizePhotoPaths, MAX_PHOTO_BATCH } from '@/lib/storage/authorize-photos';
import { normalizeStoragePath } from '@/lib/storage/authorize';
import { THUMB_PREFIX, thumbPathFor } from '@/lib/images/thumbnail';

/**
 * POST { paths: string[], variant?: 'full' | 'thumb' } → { urls: { [path]: signedUrl } }
 *
 * Signed links for the photos of a whole list in one request (one rate-limit event).
 * Paths that are not a photo of the active company are left out of `urls`.
 */
export async function POST(request: NextRequest) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;

  const jsonIn = await readJsonObject(request);
  if (!jsonIn.ok) return jsonIn.error;
  const { paths, variant = 'full' } = jsonIn.body;
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) {
    return NextResponse.json({ error: 'paths חייב להיות רשימת נתיבים' }, { status: 400 });
  }
  if (variant !== 'full' && variant !== 'thumb') {
    return NextResponse.json({ error: 'variant חייב להיות full או thumb' }, { status: 400 });
  }
  const unique = [...new Set(paths as string[])];
  if (unique.length > MAX_PHOTO_BATCH) {
    return NextResponse.json({ error: `עד ${MAX_PHOTO_BATCH} תמונות בבקשה` }, { status: 400 });
  }
  if (unique.length === 0) return NextResponse.json({ urls: {} });

  const rl = await rateLimitSignedUrlDb(context.userId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי בקשות. נסה שנית בעוד מספר שניות.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const supabase = createServiceClient();
  let allowed: Set<string>;
  try {
    allowed = await authorizePhotoPaths(context.companyId, unique, supabase);
  } catch (e) {
    console.error('[photo-urls]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'לא ניתן לטעון תמונות' }, { status: 500 });
  }

  const denied = unique.length - allowed.size;
  if (denied > 0) {
    console.warn('[photo-urls] paths not authorized', { userId: context.userId, companyId: context.companyId, denied });
  }
  if (allowed.size === 0) return NextResponse.json({ urls: {} });

  // `variant: 'thumb'` (lists): the small copy at thumbs/<path>; any photo without one falls back
  // to the original in a second call. Authorization is always on the original path above.
  const signed = new Map<string, string>();
  let toSign = [...allowed];
  if (variant === 'thumb') {
    const { data: thumbs, error: thumbError } = await supabase.storage
      .from('worker-files')
      .createSignedUrls(toSign.map(thumbPathFor), 3600);
    if (!thumbError && thumbs) {
      for (const item of thumbs) {
        if (item.path && item.signedUrl && !item.error) signed.set(item.path.slice(THUMB_PREFIX.length), item.signedUrl);
      }
    }
    toSign = toSign.filter((p) => !signed.has(p));
  }

  if (toSign.length > 0) {
    const { data, error: urlError } = await supabase.storage
      .from('worker-files')
      .createSignedUrls(toSign, 3600);
    if (urlError || !data) return NextResponse.json({ error: 'לא ניתן ליצור קישורים' }, { status: 500 });
    for (const item of data) {
      if (item.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl);
    }
  }
  // Keyed by the path exactly as the client sent it (the client looks it up by its own value).
  const urls: Record<string, string> = {};
  for (const raw of unique) {
    const url = signed.get(normalizeStoragePath(raw) ?? '');
    if (url) urls[raw] = url;
  }
  return NextResponse.json({ urls });
}
