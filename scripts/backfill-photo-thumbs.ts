/**
 * One-time: create thumbs/<path> for every photo already referenced by a record (2026-11-20).
 * New uploads get one in /api/upload. Additive only — no database row and no original changes.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.local scripts/backfill-photo-thumbs.ts          (dry run)
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.local scripts/backfill-photo-thumbs.ts --apply
 *
 * Rollback: delete the objects under thumbs/ (lists fall back to the originals by themselves).
 * Prints counts and sizes only — no names or record ids.
 */
import { createClient } from '@supabase/supabase-js';
// Plain node needs the .ts extension, TypeScript refuses it in a static import: load it by URL.
const { THUMB_PREFIX, makeThumbnail, thumbPathFor } = (await import(
  new URL('../lib/images/thumbnail.ts', import.meta.url).href
)) as typeof import('../lib/images/thumbnail');

/** = PHOTO_SOURCES in lib/storage/authorize-photos.ts (that file uses '@/' imports node cannot
 *  resolve; lib/images/__tests__/thumbnail.test.ts keeps the two lists equal). */
export const PHOTO_COLUMNS = [
  { table: 'workers',           column: 'photo_url' },
  { table: 'vehicles',          column: 'image_url' },
  { table: 'heavy_equipment',   column: 'image_url' },
  { table: 'lifting_equipment', column: 'image_url' },
] as const;

const apply = process.argv.includes('--apply');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const paths = new Set<string>();
for (const { table, column } of PHOTO_COLUMNS) {
  const { data, error } = await sb.from(table).select(column).not(column, 'is', null);
  if (error) { console.error(`${table}: ${error.message}`); process.exit(1); }
  for (const row of (data ?? []) as unknown as Record<string, string>[]) {
    const p = row[column];
    if (p && /\.(jpe?g|png|webp)$/i.test(p) && !p.startsWith(THUMB_PREFIX)) paths.add(p);
  }
}

// which thumbnails exist already
const existing = new Set<string>();
const list = [...paths];
for (let i = 0; i < list.length; i += 100) {
  const { data } = await sb.storage.from('worker-files').createSignedUrls(list.slice(i, i + 100).map(thumbPathFor), 60);
  for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) existing.add(item.path.slice(THUMB_PREFIX.length));
}
const todo = list.filter((p) => !existing.has(p));
console.log(`photos referenced: ${list.length}, thumbnail exists: ${existing.size}, to create: ${todo.length}${apply ? '' : ' (dry run — add --apply)'}`);
if (!apply) process.exit(0);

let done = 0; let before = 0; let after = 0; const failed: string[] = [];
for (const p of todo) {
  const { data, error } = await sb.storage.from('worker-files').download(p);
  if (error || !data) { failed.push(`download: ${error?.message ?? 'empty'}`); continue; }
  const original = Buffer.from(await data.arrayBuffer());
  try {
    const thumb = await makeThumbnail(original);
    const up = await sb.storage.from('worker-files').upload(thumbPathFor(p), thumb, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw new Error(up.error.message);
    done++; before += original.length; after += thumb.length;
  } catch (e) {
    failed.push(`thumbnail: ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`created ${done}/${todo.length}; originals ${(before / 1024).toFixed(0)}KB → thumbnails ${(after / 1024).toFixed(0)}KB`
  + (done ? ` (avg ${(before / done / 1024).toFixed(0)}KB → ${(after / done / 1024).toFixed(1)}KB)` : ''));
if (failed.length) { console.error(`${failed.length} failed:`, failed.slice(0, 10)); process.exit(1); }
