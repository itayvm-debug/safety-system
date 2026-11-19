/**
 * Fixes from the code review of 2026-11-19 (range a15e2c3..HEAD).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rpcSpy = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ rpc: rpcSpy }) }));

import { checkRateLimitDb } from '@/lib/rate-limit/db';
import { isRecentLogin, MFA_ENROL_REAUTH_MS } from '@/lib/auth/mfa-policy';
import { normalizeIdentityValue } from '@/lib/workers/normalize';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

beforeEach(() => { rpcSpy.mockReset(); vi.restoreAllMocks(); });

describe('two-factor code limit fails closed', () => {
  it('refuses when the limiter is unavailable and failClosed is set', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcSpy.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect((await checkRateLimitDb('u', 'mfa-verify', 5, 300, undefined, 'u', { failClosed: true })).allowed).toBe(false);
    // other limits keep failing open (unchanged behaviour)
    expect((await checkRateLimitDb('u', 'export', 5, 300)).allowed).toBe(true);
  });

  it('the sign-in code route uses the fail-closed limit', () => {
    expect(read('app/api/auth/mfa/verify/route.ts')).toMatch(/'mfa-verify'[^\n]*failClosed: true/);
  });
});

describe('enabling two-factor needs a fresh sign-in', () => {
  const now = 1_800_000_000_000;
  it('accepts a sign-in within 15 minutes and refuses an older session', () => {
    expect(isRecentLogin(now - 60_000, now)).toBe(true);
    expect(isRecentLogin(now - MFA_ENROL_REAUTH_MS - 1, now)).toBe(false);
    expect(isRecentLogin(undefined, now)).toBe(false);
    expect(isRecentLogin(now + 10 * 60_000, now)).toBe(false);
  });

  it('the enrolment route checks it before creating a factor', () => {
    const src = read('app/api/account/mfa/route.ts');
    expect(src.indexOf('isRecentLogin(session.loginAt)')).toBeGreaterThan(0);
    expect(src.indexOf('isRecentLogin(session.loginAt)')).toBeLessThan(src.indexOf('startEnrolment('));
  });
});

describe('identity values', () => {
  it('a numeric ID is refused (it would lose leading zeros and bypass the duplicate check)', () => {
    expect(normalizeIdentityValue(12345678)).toBeNull();
    expect(normalizeIdentityValue(' 012345678 ')).toBe('012345678');
  });
});

describe('audit IP', () => {
  it('uses getClientIp (first hop), not the raw x-forwarded-for list', () => {
    for (const f of ['lib/auth/login-response.ts', 'app/api/account/mfa/route.ts', 'app/api/admin/users/[id]/mfa/route.ts']) {
      expect(read(f)).not.toMatch(/headers\.get\('x-forwarded-for'\)/);
    }
  });
});

describe('phone validation on every writer (simplify/altitude review 2026-11-19)', () => {
  it('appointment edit and company create/edit validate the phone like the create routes', () => {
    for (const f of ['app/api/lifting-machine-appointments/[id]/route.ts', 'app/api/admin/companies/route.ts', 'app/api/admin/companies/[id]/route.ts']) {
      expect(read(f), f).toContain('optionalPhone(');
    }
    expect(read('app/api/lifting-machine-appointments/[id]/route.ts')).not.toMatch(/updates\.appointer_phone\s*=\s*appointer_phone;/);
  });
});

describe('signature pad resizing', () => {
  it('re-sizes the canvas with a ResizeObserver, not on orientationchange', () => {
    const src = read('components/documents/SignaturePad.tsx');
    expect(src).toContain('new ResizeObserver(');
    expect(src).not.toContain("addEventListener('orientationchange'");
  });
});
