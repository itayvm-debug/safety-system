/**
 * Small copies of record photos for lists (2026-11-20).
 *
 * Seen live from the owner's phone: a workers list loaded ~44 photos of ~160KB each (~7MB) to
 * show 40–64px avatars. Each photo now also gets a 192px JPEG (~10KB) at `thumbs/<original path>`;
 * lists ask for that, detail pages and the lightbox keep the original. A missing thumbnail falls
 * back to the original (/api/photo-urls), so nothing breaks before the backfill or if one fails.
 *
 * Server only (sharp). The thumbnail carries no EXIF (sharp drops metadata), so no GPS position.
 */
export const THUMB_PREFIX = 'thumbs/';
export const THUMB_MAX_DIM = 192;
export const THUMB_QUALITY = 75;
/** Upload folders of the photo columns (workers.photo_url, vehicles/heavy/lifting .image_url). */
export const THUMB_FOLDERS = ['photos', 'vehicles', 'heavy-equipment', 'lifting-equipment'] as const;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function thumbPathFor(path: string): string {
  return THUMB_PREFIX + path;
}

export function wantsThumbnail(folder: string, mimeType: string): boolean {
  return (THUMB_FOLDERS as readonly string[]).includes(folder) && IMAGE_TYPES.includes(mimeType);
}

export async function makeThumbnail(input: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(input, { failOn: 'none' })
    .rotate() // apply EXIF orientation before metadata is dropped
    .resize(THUMB_MAX_DIM, THUMB_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
}

type StorageClient = {
  storage: { from(bucket: string): { upload(path: string, body: Buffer, opts: { contentType: string; upsert: boolean }): PromiseLike<{ error: { message: string } | null }> } };
};

/** Creates and stores the thumbnail. Throws on failure — callers decide whether that matters. */
export async function storeThumbnail(supabase: StorageClient, path: string, original: Buffer): Promise<number> {
  const thumb = await makeThumbnail(original);
  const { error } = await supabase.storage.from('worker-files')
    .upload(thumbPathFor(path), thumb, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return thumb.length;
}
