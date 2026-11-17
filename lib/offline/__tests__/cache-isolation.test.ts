/**
 * Offline snapshots are stored under global keys (no company/user scope).
 * They must be wiped on every identity change; this verifies the wipe and that
 * the transitions call it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { clearAllSnapshots } from '@/lib/offline/cache';

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => { data.delete(k); },
    data,
  };
}

describe('clearAllSnapshots', () => {
  it('removes every SafeDoc snapshot and nothing else', () => {
    const s = memoryStorage({
      safedoc_snap_workers: '[{"full_name":"company A worker"}]',
      safedoc_snap_vehicles: '[]',
      'safedoc_snap_worker_123': '{}',
      safedoc_snap_dashboard: '{}',
      other_app_key: 'keep',
    });
    clearAllSnapshots(s);
    expect([...s.data.keys()]).toEqual(['other_app_key']);
  });

  it('does not throw when storage is unavailable', () => {
    expect(() => clearAllSnapshots(null)).not.toThrow();
  });
});

describe('identity transitions clear the snapshots', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
  it.each([
    ['login', 'app/login/page.tsx', 1],
    ['company switch + logout (nav bar)', 'components/NavBar.tsx', 2],
    ['company selection + logout (select-company)', 'app/select-company/SelectCompanyClient.tsx', 2],
  ])('%s', (_name, file, count) => {
    expect(src(file).match(/clearAllSnapshots\(\)/g)?.length).toBe(count);
  });
});
