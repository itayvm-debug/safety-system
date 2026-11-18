/**
 * Audit P3 / owner decision 2026-11-18: public/offline-app.html was an unlinked page with its own,
 * outdated status engine, still served to anyone with the URL. Status logic lives only in
 * lib/documents/status.ts; the offline fallback is public/offline.html.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

describe('legacy offline app', () => {
  it('is no longer served from public/', () => {
    expect(existsSync(join(ROOT, 'public', 'offline-app.html'))).toBe(false);
  });

  it('is not referenced by the service worker', () => {
    expect(readFileSync(join(ROOT, 'public', 'sw.js'), 'utf8')).not.toContain('offline-app');
  });
});
