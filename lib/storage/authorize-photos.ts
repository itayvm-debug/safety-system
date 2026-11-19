import { createServiceClient } from '@/lib/supabase/server';
import { normalizeStoragePath } from '@/lib/storage/authorize';

/**
 * Photo columns a list card shows. Only these paths can be signed in a batch: documents,
 * signatures and briefings still go one at a time through /api/signed-url and
 * authorizeStorageObjectAccess.
 */
export const PHOTO_SOURCES = [
  { table: 'workers',           column: 'photo_url' },
  { table: 'vehicles',          column: 'image_url' },
  { table: 'heavy_equipment',   column: 'image_url' },
  { table: 'lifting_equipment', column: 'image_url' },
] as const;

export const MAX_PHOTO_BATCH = 100;

/**
 * Which of `paths` are a photo of a record in `companyId`.
 *
 * One query per photo table, filtered by company, whatever the number of paths (no
 * `.in(...)` list in the URL). Until 2026-11-19 every list card called /api/signed-url on
 * its own: ~15 DB round trips per photo, and the database is far from the functions.
 *
 * Returns the normalized paths that are allowed; anything else (another company's photo,
 * a document path, a malformed path) is simply not in the set.
 */
export async function authorizePhotoPaths(
  companyId: string,
  paths: readonly string[],
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Set<string>> {
  const wanted = new Set<string>();
  for (const raw of paths) {
    const p = normalizeStoragePath(raw);
    if (p) wanted.add(p);
  }
  if (wanted.size === 0) return new Set();

  const results = await Promise.all(
    PHOTO_SOURCES.map(({ table, column }) =>
      supabase.from(table).select(column).eq('company_id', companyId).not(column, 'is', null),
    ),
  );

  const allowed = new Set<string>();
  results.forEach((res, i) => {
    if (res.error) throw new Error(`photo authorization query failed (${PHOTO_SOURCES[i].table})`);
    const column = PHOTO_SOURCES[i].column;
    for (const row of (res.data ?? []) as unknown as Record<string, string | null>[]) {
      const value = row[column];
      if (value && wanted.has(value)) allowed.add(value);
    }
  });
  return allowed;
}
