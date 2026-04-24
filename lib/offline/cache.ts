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
