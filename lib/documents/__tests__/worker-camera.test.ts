/**
 * Owner field report 2026-11-19: photographing a worker opened only the front camera ("only selfie").
 * The site manager photographs the worker, so the rear camera opens first; the switch button is labelled.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', '..', '..', 'components', 'workers', 'WorkerDetail.tsx'), 'utf8');

describe('worker photo camera', () => {
  it('opens the rear camera first', () => {
    expect(src).toMatch(/useState<'user' \| 'environment'>\('environment'\)/);
  });

  it('has a labelled button to switch between rear camera and selfie', () => {
    expect(src).toMatch(/onClick=\{flipCamera\}/);
    expect(src).toContain("'מצלמה אחורית' : 'סלפי'");
  });
});
