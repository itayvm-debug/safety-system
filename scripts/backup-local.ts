/**
 * SafeDoc — local backup of the production data (2026-11-20).
 *
 * The Supabase organization is on the free plan: no downloadable daily backups and no PITR.
 * This copies, to a folder on the owner's computer (never into Git or the project folder):
 *   - every table in `public` as JSON (one dated snapshot per run),
 *   - the Auth users list (ids, emails, metadata — NOT password hashes; the API does not expose them),
 *   - every file in the private bucket `worker-files`, mirrored and accumulated: a file is
 *     downloaded once and kept, even if it is later deleted in Supabase.
 *
 * Run (from the project folder):   npm run backup
 * Folder: %USERPROFILE%\SafeDoc-Backups, or SAFEDOC_BACKUP_DIR.
 * Restore steps: docs/operations/BACKUP_AND_RECOVERY_RUNBOOK_HE.md.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local (via node
 * --env-file) and never prints them. Prints counts and failed paths only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUCKET = 'worker-files';
/** Short-lived technical rows (IPs, counters) — not business data. */
export const SKIP_TABLES = new Set(['rate_limit_events']);
const PAGE = 1000;
const DOWNLOAD_CONCURRENCY = 6;

/**
 * Local path for a storage object, or null when the name could escape the backup folder or
 * is not a valid Windows file name. Storage names come from the database, so treat them as input.
 */
export function safeLocalPath(root: string, objectPath: string): string | null {
  if (!objectPath || objectPath.startsWith('/') || objectPath.includes('\\')) return null;
  const parts = objectPath.split('/');
  for (const p of parts) {
    if (!p || p === '.' || p === '..') return null;
    if (/[<>:"|?*\u0000-\u001f]/.test(p)) return null;
    if (/[. ]$/.test(p)) return null; // Windows drops trailing dots/spaces → two names could collide
  }
  const base = resolve(root);
  const full = resolve(base, ...parts);
  if (!full.startsWith(base + sep)) return null;
  return full;
}

export type RemoteFile = { path: string; size: number };

/** Which remote files still need downloading: missing locally, or a different size. */
export function filesToDownload(remote: RemoteFile[], localSize: (path: string) => number | null): RemoteFile[] {
  return remote.filter((f) => localSize(f.path) !== f.size);
}

/** Stable sort column for paging a table, from its OpenAPI definition. */
export function orderColumn(properties: Record<string, unknown> | undefined): string | null {
  if (!properties) return null;
  for (const c of ['id', 'created_at', 'user_id', 'company_id']) if (c in properties) return c;
  return null;
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// ─── network ─────────────────────────────────────────────────────────────────

type TableDef = { name: string; properties?: Record<string, unknown> };

type ApiSpec = { definitions?: Record<string, { properties?: Record<string, unknown> }> };

/** The PostgREST description of `public`: table names and column types (kept in the snapshot). */
async function fetchApiSpec(url: string, key: string): Promise<ApiSpec> {
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`could not list tables (HTTP ${res.status})`);
  return (await res.json()) as ApiSpec;
}

function listTables(spec: ApiSpec): TableDef[] {
  return Object.entries(spec.definitions ?? {})
    .map(([name, d]) => ({ name, properties: d.properties }))
    .filter((t) => !SKIP_TABLES.has(t.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function dumpTable(sb: SupabaseClient, t: TableDef): Promise<unknown[]> {
  const order = orderColumn(t.properties);
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(t.name).select('*').range(from, from + PAGE - 1);
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`${t.name}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function dumpAuthUsers(sb: SupabaseClient): Promise<unknown[]> {
  const users: unknown[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`auth users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < PAGE) return users;
  }
}

async function listBucket(sb: SupabaseClient, prefix = ''): Promise<RemoteFile[]> {
  const out: RemoteFile[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list ${prefix || '/'}: ${error.message}`);
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listBucket(sb, path))); // folder
      else out.push({ path, size: Number((item.metadata as { size?: number } | null)?.size ?? -1) });
    }
    if (!data || data.length < PAGE) return out;
  }
}

async function sizeOf(p: string): Promise<number | null> {
  try { return (await stat(p)).size; } catch { return null; }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('חסרים NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. להריץ: npm run backup');
    return 2;
  }
  const root = resolve(process.env.SAFEDOC_BACKUP_DIR ?? join(homedir(), 'SafeDoc-Backups'));
  const projectDir = resolve(process.cwd());
  if (root === projectDir || root.startsWith(projectDir + sep)) {
    console.error('תיקיית הגיבוי לא יכולה להיות בתוך תיקיית הפרויקט (היא מסונכרנת ל-Git).');
    return 2;
  }
  const filesRoot = join(root, 'files');
  const snap = join(root, 'snapshots', stamp());
  await mkdir(join(snap, 'db'), { recursive: true });
  await mkdir(filesRoot, { recursive: true });

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const started = new Date();
  const failures: string[] = [];

  // 1. tables
  const spec = await fetchApiSpec(url, key);
  await writeFile(join(snap, 'db', '_columns.openapi.json'), JSON.stringify(spec));
  const tables = listTables(spec);
  const tableCounts: Record<string, number> = {};
  for (const t of tables) {
    try {
      const rows = await dumpTable(sb, t);
      await writeFile(join(snap, 'db', `${t.name}.json`), JSON.stringify(rows));
      tableCounts[t.name] = rows.length;
    } catch (e) {
      failures.push(`table ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`טבלאות: ${Object.keys(tableCounts).length}/${tables.length}, ${Object.values(tableCounts).reduce((a, b) => a + b, 0)} שורות`);

  // 2. auth users
  let authCount = 0;
  try {
    const users = await dumpAuthUsers(sb);
    authCount = users.length;
    await writeFile(join(snap, 'auth-users.json'), JSON.stringify(users));
  } catch (e) {
    failures.push(e instanceof Error ? e.message : String(e));
  }
  console.log(`משתמשים: ${authCount}`);

  // 3. files
  const remote = await listBucket(sb);
  const unsafe = remote.filter((f) => !safeLocalPath(filesRoot, f.path));
  for (const f of unsafe) failures.push(`unsafe name skipped: ${JSON.stringify(f.path)}`);
  const safe = remote.filter((f) => safeLocalPath(filesRoot, f.path));
  const local = new Map<string, number | null>();
  await Promise.all(safe.map(async (f) => local.set(f.path, await sizeOf(safeLocalPath(filesRoot, f.path)!))));
  const todo = filesToDownload(safe, (p) => local.get(p) ?? null);
  let downloaded = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const dest = safeLocalPath(filesRoot, f.path)!;
      const { data, error } = await sb.storage.from(BUCKET).download(f.path);
      if (error || !data) { failures.push(`download ${f.path}: ${error?.message ?? 'empty'}`); continue; }
      const buf = Buffer.from(await data.arrayBuffer());
      if (f.size >= 0 && buf.length !== f.size) { failures.push(`size mismatch ${f.path}: ${buf.length} != ${f.size}`); continue; }
      await mkdir(resolve(dest, '..'), { recursive: true });
      await writeFile(dest, buf);
      downloaded++;
    }
  }));
  const totalBytes = remote.reduce((a, f) => a + Math.max(0, f.size), 0);
  console.log(`קבצים: ${remote.length} ב-Storage (${(totalBytes / 1048576).toFixed(1)}MB), הורדו עכשיו ${downloaded}, כבר היו ${safe.length - todo.length}`);
  await writeFile(join(snap, 'files-index.json'), JSON.stringify(remote));

  const manifest = {
    started: started.toISOString(),
    finished: new Date().toISOString(),
    supabaseProject: new URL(url).hostname.split('.')[0],
    tables: tableCounts,
    skippedTables: [...SKIP_TABLES],
    authUsers: authCount,
    files: { inStorage: remote.length, bytes: totalBytes, downloadedThisRun: downloaded, alreadyPresent: safe.length - todo.length },
    failures,
    note: 'auth-users.json has no password hashes; users would set a new password after a restore.',
  };
  await writeFile(join(snap, 'manifest.json'), JSON.stringify(manifest, null, 2));

  if (failures.length) {
    console.error(`\n❌ ${failures.length} כשלים:`);
    for (const f of failures.slice(0, 30)) console.error('  ' + f);
    console.error(`פירוט מלא: ${join(snap, 'manifest.json')}`);
    return 1;
  }
  console.log(`\n✅ הגיבוי הושלם: ${snap}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => process.exit(code), (e) => {
    console.error('❌ הגיבוי נכשל:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
