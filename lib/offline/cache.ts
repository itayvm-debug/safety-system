const PREFIX = 'safedoc_snap_';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function saveSnapshot(key: string, data: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

export function loadSnapshot<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Removes every offline snapshot. Snapshot keys are not scoped by company or user,
 * so they must be cleared whenever the identity changes (login, logout, company
 * switch or selection) — otherwise lists flash, or keep showing after a failed
 * fetch, another company's or another user's data on a shared device.
 */
export function clearAllSnapshots(storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | null =
  typeof localStorage === 'undefined' ? null : localStorage): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach(k => storage.removeItem(k));
  } catch {
    // storage unavailable — nothing cached to leak
  }
}
