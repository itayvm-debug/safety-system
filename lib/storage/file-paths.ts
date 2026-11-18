/**
 * file-paths.ts — trusted handling of storage paths that clients attach to records.
 *
 * Three concerns, one module:
 *
 * 1. Upload receipts (P1·1)
 *    /api/upload issues paths of the form `<folder>/<ts>-<nonce16><mac16>.<ext>`.
 *    The mac is an HMAC (SESSION_SECRET, domain-separated) over the company id
 *    and the rest of the path, so the server can later verify — without trusting
 *    the client and without a schema change — that a path was issued to THIS
 *    company. The path keeps the existing shape (folder / timestamp-hex.ext).
 *
 * 2. Attach validation (P1·1)
 *    A client-supplied path may be attached to a record only if it is:
 *      a) unchanged from the value already stored on that record, or
 *      b) an upload receipt issued to the active company, or
 *      c) already referenced by a record of the active company (legacy paths).
 *
 * 3. Safe cleanup (P1·6)
 *    After a record is deleted or its file replaced, the old object is removed
 *    only when no row in any table still references it. A failed removal is
 *    logged and leaves an orphan; it never fails the user's request.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { authorizeStorageObjectAccess, normalizeStoragePath } from './authorize';
import type { createServiceClient } from '@/lib/supabase/server';

type Supabase = ReturnType<typeof createServiceClient>;

const BUCKET = 'worker-files';
const RECEIPT_DOMAIN = 'upload-path:v1';
const RECEIPT_RE = /^([a-z0-9-]+)\/(\d{10,16})-([0-9a-f]{16})([0-9a-f]{16})\.([a-z0-9]{2,5})$/;

function receiptSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET לא מוגדר ב-ENV');
  return secret;
}

function computeMac(companyId: string, folder: string, ts: string, nonce: string, ext: string): string {
  return createHmac('sha256', receiptSecret())
    .update(`${RECEIPT_DOMAIN}|${companyId}|${folder}/${ts}-${nonce}.${ext}`)
    .digest('hex')
    .slice(0, 16);
}

/** Builds a new storage path whose name proves it was issued to `companyId`. */
export function issueUploadPath(companyId: string, folder: string, ext: string, now = Date.now()): string {
  const ts = String(now);
  const nonce = randomBytes(8).toString('hex');
  return `${folder}/${ts}-${nonce}${computeMac(companyId, folder, ts, nonce, ext)}.${ext}`;
}

/** True only when `path` is an upload receipt issued to `companyId`. */
export function isUploadIssuedFor(path: string, companyId: string): boolean {
  const m = RECEIPT_RE.exec(path);
  if (!m) return false;
  const [, folder, ts, nonce, mac, ext] = m;
  let expected: string;
  try {
    expected = computeMac(companyId, folder, ts, nonce, ext);
  } catch {
    return false;
  }
  return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'));
}

export type AttachDecision =
  | { ok: true; path: string | null }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Decides whether a client-supplied path may be stored on a record of `companyId`.
 * `existing` = the values already stored on the record being updated (if any).
 */
export async function checkAttachablePath(params: {
  supabase: Supabase;
  companyId: string;
  value: unknown;
  existing?: ReadonlyArray<string | null | undefined>;
}): Promise<AttachDecision> {
  const { supabase, companyId, value, existing = [] } = params;

  if (value === null || value === undefined || value === '') return { ok: true, path: null };
  if (typeof value !== 'string') return { ok: false, status: 400, error: 'נתיב קובץ לא תקין' };

  const path = normalizeStoragePath(value);
  if (!path) return { ok: false, status: 400, error: 'נתיב קובץ לא תקין' };

  if (existing.some(e => e && (e === path || e === value))) return { ok: true, path };
  if (isUploadIssuedFor(path, companyId)) return { ok: true, path };

  const owned = await authorizeStorageObjectAccess({ companyId, path, supabase });
  if (owned.allowed) return { ok: true, path };

  return { ok: false, status: 403, error: 'הקובץ אינו שייך לחברה זו' };
}

/** Columns that are shown as <img> and therefore must reference an image file. */
export const IMAGE_COLUMNS: ReadonlySet<string> = new Set(['photo_url', 'image_url']);
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/**
 * Validates every file field present in `fields` (undefined = not sent, skipped).
 * Returns normalized values to store, or a ready error response.
 */
export async function validateFileFields(
  supabase: Supabase,
  companyId: string,
  fields: Record<string, unknown>,
  existing: Record<string, string | null | undefined> = {},
): Promise<{ ok: true; values: Record<string, string | null> } | { ok: false; error: NextResponse }> {
  const values: Record<string, string | null> = {};
  const existingValues = Object.values(existing);
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const decision = await checkAttachablePath({
      supabase,
      companyId,
      value,
      // the record's own current value for this column, plus its sibling columns
      // (e.g. moving a file between two columns of the same record)
      existing: [existing[key], ...existingValues],
    });
    if (!decision.ok) {
      return { ok: false, error: NextResponse.json({ error: decision.error }, { status: decision.status }) };
    }
    // A photo column must hold an image (found in the live QA round: a PDF was accepted as a
    // vehicle photo and rendered as a broken image). Documents may still be PDFs.
    if (IMAGE_COLUMNS.has(key) && decision.path && !IMAGE_EXT.test(decision.path)) {
      return { ok: false, error: NextResponse.json({ error: 'יש להעלות תמונה (JPG, PNG או WEBP)' }, { status: 400 }) };
    }
    values[key] = decision.path;
  }
  return { ok: true, values };
}

/** Every column, in every table, that may hold a path in the `worker-files` bucket. */
export const FILE_REFERENCE_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'workers', column: 'photo_url' },
  { table: 'documents', column: 'file_url' },
  { table: 'safety_briefings', column: 'file_url' },
  { table: 'safety_briefings', column: 'signature_url' },
  { table: 'height_restrictions', column: 'file_url' },
  { table: 'height_restrictions', column: 'signature_url' },
  { table: 'professional_licenses', column: 'file_url' },
  { table: 'manager_licenses', column: 'file_url' },
  { table: 'lifting_machine_appointments', column: 'operator_signature_url' },
  { table: 'lifting_machine_appointments', column: 'appointer_signature_url' },
  { table: 'lifting_machine_appointments', column: 'pdf_url' },
  { table: 'vehicles', column: 'image_url' },
  { table: 'vehicle_licenses', column: 'file_url' },
  { table: 'vehicle_insurances', column: 'file_url' },
  { table: 'heavy_equipment', column: 'image_url' },
  { table: 'heavy_equipment', column: 'license_file_url' },
  { table: 'heavy_equipment', column: 'inspection_file_url' },
  { table: 'heavy_equipment', column: 'insurance_file_url' },
  { table: 'heavy_equipment_insurances', column: 'file_url' },
  { table: 'lifting_equipment', column: 'image_url' },
  { table: 'lifting_equipment', column: 'inspection_file_url' },
  { table: 'companies', column: 'logo_url' },
];

/**
 * True when any row in any company references `path`.
 * Fails safe: a query error counts as "referenced", so nothing is deleted on doubt.
 */
export async function isStoragePathReferenced(supabase: Supabase, path: string): Promise<boolean> {
  const results = await Promise.all(
    FILE_REFERENCE_COLUMNS.map(({ table, column }) =>
      (supabase.from(table).select('id').eq(column, path).limit(1) as unknown as Promise<{
        data: unknown[] | null;
        error: unknown;
      }>).then(
        r => Boolean(r.error) || (r.data?.length ?? 0) > 0,
        () => true,
      ),
    ),
  );
  return results.some(Boolean);
}

export interface CleanupResult {
  removed: string[];
  kept: string[];
  failed: string[];
}

/**
 * Removes objects that no row references any more. Call it AFTER the database
 * change that dropped the reference. Never throws.
 */
export async function removeStorageIfUnreferenced(
  supabase: Supabase,
  paths: ReadonlyArray<string | null | undefined>,
): Promise<CleanupResult> {
  const result: CleanupResult = { removed: [], kept: [], failed: [] };
  const unique = [...new Set(paths.filter((p): p is string => typeof p === 'string' && p.length > 0))];
  const toRemove: string[] = [];

  for (const path of unique) {
    try {
      if (await isStoragePathReferenced(supabase, path)) result.kept.push(path);
      else toRemove.push(path);
    } catch {
      result.kept.push(path);
    }
  }
  if (toRemove.length === 0) return result;

  try {
    const { error } = await supabase.storage.from(BUCKET).remove(toRemove);
    if (error) {
      result.failed.push(...toRemove);
      console.error('[storage-cleanup] remove failed for', toRemove.length, 'object(s)');
    } else {
      result.removed.push(...toRemove);
    }
  } catch {
    result.failed.push(...toRemove);
    console.error('[storage-cleanup] remove threw for', toRemove.length, 'object(s)');
  }
  return result;
}

/**
 * Retention gate (P1·6). The document retention policy is an open business
 * decision, so this change adds NO new automatic deletion:
 *  - The three places that removed files before (deleting a worker document,
 *    deleting a height-ban record, permanently deleting an archived worker) keep
 *    doing so, now only when no other row references the object.
 *  - A replaced file, or a file of any other deleted record (briefings, signed
 *    appointments, licenses, insurances, vehicles, equipment), is KEPT. It appears
 *    in the orphan candidates report until the retention policy is decided.
 * Changing a value here is a retention decision, not a refactor.
 */
export type CleanupTrigger =
  | 'document_deleted'
  | 'height_restriction_deleted'
  | 'worker_permanently_deleted'
  | 'file_replaced'
  | 'record_deleted';

export const AUTO_REMOVE_ON: Readonly<Record<CleanupTrigger, boolean>> = {
  document_deleted: true,           // behaviour before this change
  height_restriction_deleted: true, // behaviour before this change
  worker_permanently_deleted: true, // behaviour before this change (archive first, then permanent delete)
  file_replaced: false,             // pending retention decision
  record_deleted: false,            // pending retention decision
};

/** Applies the retention gate, then removes only objects that nothing references. Never throws. */
export async function cleanupAfterChange(
  trigger: CleanupTrigger,
  supabase: Supabase,
  paths: ReadonlyArray<string | null | undefined>,
): Promise<CleanupResult | null> {
  if (!AUTO_REMOVE_ON[trigger]) {
    const kept = paths.filter(p => typeof p === 'string' && p.length > 0).length;
    if (kept > 0) console.info('[storage-retention] kept', kept, 'file(s) after', trigger, '(retention policy pending)');
    return null;
  }
  return removeStorageIfUnreferenced(supabase, paths);
}

/**
 * Old paths that an update replaced: present before, changed by `updates`.
 * `updates` holds only the columns being written.
 */
export function replacedPaths(
  before: Record<string, string | null | undefined> | null | undefined,
  updates: Record<string, unknown>,
): string[] {
  if (!before) return [];
  const out: string[] = [];
  for (const [column, oldValue] of Object.entries(before)) {
    if (!oldValue || !(column in updates)) continue;
    if (updates[column] !== oldValue) out.push(oldValue);
  }
  return out;
}
