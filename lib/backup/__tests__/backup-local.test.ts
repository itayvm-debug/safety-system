/**
 * scripts/backup-local.ts (2026-11-20): the free Supabase plan has no downloadable backups,
 * so the owner keeps a local copy. Storage object names come from the database — a name must
 * never write outside the backup folder.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { safeLocalPath, filesToDownload, orderColumn, stamp, SKIP_TABLES } from '@/scripts/backup-local';

const ROOT = resolve('C:/backup-test/files');
const ROOT_DIR = join(__dirname, '..', '..', '..');

describe('safeLocalPath', () => {
  it('maps a normal storage path inside the backup folder', () => {
    expect(safeLocalPath(ROOT, 'documents/abc/id-card.pdf')).toBe(join(ROOT, 'documents', 'abc', 'id-card.pdf'));
  });

  it.each([
    '../outside.pdf', 'documents/../../outside.pdf', '/etc/passwd', 'documents\\..\\x.pdf',
    'C:/Windows/x.dll', 'documents//x.pdf', 'documents/./x.pdf', '', 'a/b:c.pdf', 'a/name. ', 'a/con?.pdf',
  ])('rejects %j', (p) => {
    expect(safeLocalPath(ROOT, p)).toBeNull();
  });

  it('every accepted path stays under the root', () => {
    for (const p of ['a/b/c.jpg', 'photos/1781516816433-x574418dk2.jpg', 'company-logos/x.png']) {
      expect(safeLocalPath(ROOT, p)!.startsWith(ROOT + sep)).toBe(true);
    }
  });
});

describe('filesToDownload', () => {
  it('downloads missing files and files whose size changed; skips identical ones', () => {
    const local = new Map<string, number>([['a.jpg', 10], ['b.pdf', 5]]);
    const todo = filesToDownload(
      [{ path: 'a.jpg', size: 10 }, { path: 'b.pdf', size: 6 }, { path: 'c.pdf', size: 1 }],
      (p) => local.get(p) ?? null,
    );
    expect(todo.map((f) => f.path)).toEqual(['b.pdf', 'c.pdf']);
  });
});

describe('table paging and naming', () => {
  it('orders by a stable column when there is one', () => {
    expect(orderColumn({ id: {}, created_at: {} })).toBe('id');
    expect(orderColumn({ user_id: {}, role: {} })).toBe('user_id');
    expect(orderColumn({ note: {} })).toBeNull();
    expect(orderColumn(undefined)).toBeNull();
  });

  it('snapshot folder name is sortable and filesystem-safe', () => {
    expect(stamp(new Date(2026, 10, 20, 7, 5))).toBe('2026-11-20_0705');
  });

  it('skips only the short-lived rate-limit table', () => {
    expect([...SKIP_TABLES]).toEqual(['rate_limit_events']);
  });
});

describe('wiring', () => {
  it('npm run backup loads .env.local and runs the script', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.backup).toBe('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.local scripts/backup-local.ts');
  });

  it('the script never prints the key and refuses a backup folder inside the project', () => {
    const src = readFileSync(join(ROOT_DIR, 'scripts', 'backup-local.ts'), 'utf8');
    expect(src).not.toMatch(/console\.(log|error)\([^)]*\bkey\b/);
    expect(src).toContain('תיקיית הגיבוי לא יכולה להיות בתוך תיקיית הפרויקט');
  });
});
