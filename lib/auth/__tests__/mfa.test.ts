/**
 * Two-factor sign-in (owner decision 2026-11-18): TOTP for platform admins (mandatory after a
 * 14-day transition), optional for others, reset by another platform admin.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── In-memory stand-in for the Supabase query builder (only what these routes use) ─────────
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const rpcSpy = vi.fn();

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'update' | 'upsert' | 'delete' | 'insert' = 'select';
  let payload: Row | null = null;
  let returning = false;
  const rows = () => (db[table] ??= []);
  const matched = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = (): { data: unknown; error: null } => {
    if (op === 'update') { const m = matched(); m.forEach((r) => Object.assign(r, payload)); return { data: returning ? m.map((r) => ({ ...r })) : null, error: null }; }
    if (op === 'delete') { const m = matched(); db[table] = rows().filter((r) => !m.includes(r)); return { data: returning ? m : null, error: null }; }
    if (op === 'upsert') { const ex = rows().find((r) => r.user_id === payload!.user_id); if (ex) Object.assign(ex, payload); else rows().push({ ...payload }); return { data: null, error: null }; }
    if (op === 'insert') { rows().push({ ...payload }); return { data: null, error: null }; }
    return { data: matched().map((r) => ({ ...r })), error: null };
  };
  const b: Record<string, unknown> = {
    select: (_c?: string) => { if (op !== 'select') returning = true; return b; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
    not: (c: string, _o: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return b; },
    limit: () => b,
    update: (p: Row) => { op = 'update'; payload = p; return b; },
    upsert: (p: Row) => { op = 'upsert'; payload = p; return b; },
    delete: () => { op = 'delete'; return b; },
    insert: (p: Row) => { op = 'insert'; payload = p; return b; },
    maybeSingle: () => { const r = run().data as Row[]; return Promise.resolve({ data: r[0] ?? null, error: null }); },
    single: () => { const r = run().data as Row[]; return Promise.resolve({ data: r[0] ?? null, error: r[0] ? null : { message: 'none' } }); },
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko),
  };
  return b;
}
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: query, rpc: rpcSpy }) }));

const signIn = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: signIn } }) }));

let currentSession: Record<string, unknown> | null = null;
vi.mock('@/lib/auth/session', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/session')>()), getSession: async () => currentSession }));

let adminGuard: { session: Record<string, unknown> | null; error: unknown } = { session: null, error: null };
vi.mock('@/lib/auth/api', async (orig) => ({ ...(await orig<object>()), requirePlatformAdmin: async () => adminGuard }));

import { base32Decode, base32Encode, totpAt, totpStep, verifyTotp, otpauthUri } from '@/lib/auth/totp';
import { encryptSecret, decryptSecret } from '@/lib/auth/mfa-crypto';
import { signMfaPending, verifyMfaPending, signSession, verifySession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { MFA_PENDING_COOKIE_NAME, isMfaEnforced, MFA_ENFORCE_FROM, MFA_REQUIRED_ROLES, isMfaRequiredForRole } from '@/lib/auth/mfa-policy';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as verify } from '@/app/api/auth/mfa/verify/route';
import { GET as mfaStatus, POST as enrol, PUT as confirmEnrol } from '@/app/api/account/mfa/route';
import { DELETE as adminReset } from '@/app/api/admin/users/[id]/mfa/route';
import { middleware } from '@/middleware';

const U = '11111111-1111-1111-1111-111111111111';
const ORIGIN = 'https://app.example.test';
const allow = { data: [{ allowed: true, remaining: 9, reset_at: new Date(Date.now() + 60_000).toISOString() }], error: null };

function post(path: string, body: unknown, cookie?: string) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, host: 'app.example.test', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
const cookieValue = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.profiles = [{ id: U, email: 'qa@example.test', username: 'qa', role: 'user', is_active: true, full_name: 'QA' }];
  db.company_members = [];
  db.legal_acceptances = [];
  db.audit_logs = [];
  db.user_mfa_factors = [];
  rpcSpy.mockReset(); rpcSpy.mockResolvedValue(allow);
  signIn.mockReset(); signIn.mockResolvedValue({ data: { user: { id: U } }, error: null });
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  currentSession = null;
});

async function enrolVerified(secret = base32Encode(Buffer.from('12345678901234567890'))) {
  db.user_mfa_factors.push({ user_id: U, secret_enc: encryptSecret(secret, U), verified_at: new Date().toISOString(), last_used_step: null });
  return secret;
}

describe('TOTP (RFC 6238)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it.each([[59, '287082'], [1111111109, '081804'], [1234567890, '005924'], [2000000000, '279037']])(
    'T=%i → %s (6-digit SHA1 vectors)', (t, code) => expect(totpAt(secret, Math.floor(t / 30))).toBe(code));

  it('base32 round-trips', () => {
    const b = Buffer.from([0, 1, 2, 250, 255, 7, 8]);
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
  });

  it('accepts ±1 step, refuses ±2, refuses a used step, refuses non-digits', () => {
    const now = 1_800_000_000_000; const s = totpStep(now);
    expect(verifyTotp(secret, totpAt(secret, s - 1), { nowMs: now })).toBe(s - 1);
    expect(verifyTotp(secret, totpAt(secret, s + 1), { nowMs: now })).toBe(s + 1);
    expect(verifyTotp(secret, totpAt(secret, s - 2), { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, s), { nowMs: now, lastUsedStep: s })).toBeNull();
    expect(verifyTotp(secret, '12a456', { nowMs: now })).toBeNull();
  });

  it('builds a standard otpauth URI', () => {
    expect(otpauthUri('ABC', 'qa')).toBe('otpauth://totp/SafeDoc%3Aqa?secret=ABC&issuer=SafeDoc&algorithm=SHA1&digits=6&period=30');
  });
});

describe('secret encryption at rest', () => {
  it('round-trips, and fails for another user, a tampered value or a missing key', () => {
    const enc = encryptSecret('SECRET', U);
    expect(enc).not.toContain('SECRET');
    expect(decryptSecret(enc, U)).toBe('SECRET');
    expect(() => decryptSecret(enc, 'someone-else')).toThrow();
    const parts = enc.split(':'); parts[2] = Buffer.from('x').toString('base64');
    expect(() => decryptSecret(parts.join(':'), U)).toThrow();
    delete process.env.MFA_ENCRYPTION_KEY;
    expect(() => encryptSecret('x', U)).toThrow(/MFA_ENCRYPTION_KEY/);
  });
});

describe('pending token between password and code', () => {
  it('is short-lived and can never be used as a session (or the other way round)', async () => {
    const t = await signMfaPending(U, 300, 1_000);
    expect(await verifyMfaPending(t, 2_000)).toBe(U);
    expect(await verifyMfaPending(t, 1_000 + 301_000)).toBeNull();
    expect(await verifySession(t)).toBeNull();
    const s = await signSession({ userId: U, email: 'e', username: 'u', role: 'user', loginAt: Date.now() });
    expect(await verifyMfaPending(s)).toBeNull();
  });
});

describe('sign-in with two factors', () => {
  it('without a factor the password signs in as before', async () => {
    const res = await login(post('/api/auth/login', { identifier: 'qa', password: 'pw' }));
    expect(res.status).toBe(200);
    expect(cookieValue(res, SESSION_COOKIE_NAME)).toBeTruthy();
  });

  it('with a factor the password alone gives no session — only the pending cookie', async () => {
    await enrolVerified();
    const res = await login(post('/api/auth/login', { identifier: 'qa', password: 'pw' }));
    expect(await res.json()).toEqual({ mfaRequired: true });
    expect(cookieValue(res, SESSION_COOKIE_NAME)).toBeUndefined();
    expect(cookieValue(res, MFA_PENDING_COOKIE_NAME)).toBeTruthy();
  });

  it('a correct code issues the session once; the same code cannot be replayed', async () => {
    const secret = await enrolVerified();
    const pending = await signMfaPending(U, 300);
    const code = totpAt(secret, totpStep());
    const ok = await verify(post('/api/auth/mfa/verify', { code }, `${MFA_PENDING_COOKIE_NAME}=${pending}`));
    expect(ok.status).toBe(200);
    const session = await verifySession(cookieValue(ok, SESSION_COOKIE_NAME)!);
    expect(session?.userId).toBe(U);
    const again = await verify(post('/api/auth/mfa/verify', { code }, `${MFA_PENDING_COOKIE_NAME}=${pending}`));
    expect(again.status).toBe(401);
  });

  it('refuses a wrong code, a missing or expired pending cookie, and a disabled account', async () => {
    const secret = await enrolVerified();
    const pending = await signMfaPending(U, 300);
    expect((await verify(post('/api/auth/mfa/verify', { code: '000000' }, `${MFA_PENDING_COOKIE_NAME}=${pending}`))).status).toBe(401);
    expect((await verify(post('/api/auth/mfa/verify', { code: totpAt(secret, totpStep()) }))).status).toBe(401);
    const old = await signMfaPending(U, 300, Date.now() - 301_000);
    expect((await verify(post('/api/auth/mfa/verify', { code: totpAt(secret, totpStep()) }, `${MFA_PENDING_COOKIE_NAME}=${old}`))).status).toBe(401);
    db.profiles[0].is_active = false;
    expect((await verify(post('/api/auth/mfa/verify', { code: totpAt(secret, totpStep()) }, `${MFA_PENDING_COOKIE_NAME}=${pending}`))).status).toBe(403);
  });

  it('is rate limited per user', async () => {
    await enrolVerified();
    rpcSpy.mockResolvedValue({ data: [{ allowed: false, remaining: 0, reset_at: new Date().toISOString() }], error: null });
    const pending = await signMfaPending(U, 300);
    expect((await verify(post('/api/auth/mfa/verify', { code: '123456' }, `${MFA_PENDING_COOKIE_NAME}=${pending}`))).status).toBe(429);
  });
});

describe('enrolment', () => {
  it('starts with a QR + secret, stores only ciphertext, and activates with the first code', async () => {
    currentSession = { userId: U, email: 'qa@example.test', username: 'qa', role: 'user', loginAt: Date.now() };
    const res = await enrol();
    const body = await res.json();
    expect(body.qrSvg).toContain('<svg');
    expect(body.otpauthUri).toContain(`secret=${body.secret}`);
    expect(db.user_mfa_factors[0].secret_enc).not.toContain(body.secret);
    expect(db.user_mfa_factors[0].verified_at).toBeNull();

    const bad = await confirmEnrol(new NextRequest(`${ORIGIN}/api/account/mfa`, { method: 'PUT', body: JSON.stringify({ code: '000000' }) }));
    expect(bad.status).toBe(400);
    const good = await confirmEnrol(new NextRequest(`${ORIGIN}/api/account/mfa`, { method: 'PUT', body: JSON.stringify({ code: totpAt(body.secret, totpStep()) }) }));
    expect(good.status).toBe(200);
    expect(db.user_mfa_factors[0].verified_at).toBeTruthy();
    expect((await (await mfaStatus()).json()).enabled).toBe(true);
    expect((await enrol()).status).toBe(409);
  });

  it('an admin limited to enrolment gets a full session after confirming', async () => {
    currentSession = { userId: U, email: 'qa@example.test', username: 'qa', role: 'admin', loginAt: Date.now(), mfaSetupRequired: true };
    const { secret } = await (await enrol()).json();
    const res = await confirmEnrol(new NextRequest(`${ORIGIN}/api/account/mfa`, { method: 'PUT', body: JSON.stringify({ code: totpAt(secret, totpStep()) }) }));
    const s = await verifySession(cookieValue(res, SESSION_COOKIE_NAME)!);
    expect(s?.mfaSetupRequired).toBeUndefined();
  });

  it('refuses to enrol without the encryption key', async () => {
    currentSession = { userId: U, email: 'e', username: 'u', role: 'user', loginAt: Date.now() };
    delete process.env.MFA_ENCRYPTION_KEY;
    expect((await enrol()).status).toBe(503);
  });
});

describe('reset by another platform admin', () => {
  const req = () => new NextRequest(`${ORIGIN}/api/admin/users/${U}/mfa`, { method: 'DELETE' });
  it('removes the factor and is audited; never on one\'s own account', async () => {
    await enrolVerified();
    adminGuard = { session: { userId: U, email: 'a' }, error: null };
    expect((await adminReset(req(), { params: Promise.resolve({ id: U }) })).status).toBe(409);
    adminGuard = { session: { userId: 'other-admin', email: 'b' }, error: null };
    const res = await adminReset(req(), { params: Promise.resolve({ id: U }) });
    expect(await res.json()).toEqual({ reset: true });
    expect(db.user_mfa_factors).toHaveLength(0);
  });
});

describe('policy: optional two-factor', () => {
  it('the dormant deadline constant is unchanged', () => {
    expect(MFA_ENFORCE_FROM.toISOString()).toBe('2026-12-01T22:00:00.000Z');
    expect(isMfaEnforced(new Date('2026-11-30T12:00:00Z'))).toBe(false);
    expect(isMfaEnforced(new Date('2026-12-02T12:00:00Z'))).toBe(true);
  });

  it('owner decision (2026-11-18): optional for everyone — no role is required', () => {
    expect(MFA_REQUIRED_ROLES).toEqual([]);
    expect(isMfaRequiredForRole('admin')).toBe(false);
    expect(isMfaRequiredForRole('user')).toBe(false);
    // the mechanism stays available if roles are listed again
    expect(isMfaRequiredForRole('admin', ['admin'])).toBe(true);
    expect(isMfaRequiredForRole(null, ['admin'])).toBe(false);
  });

  it('after the old deadline an admin without a factor still gets a full session', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-12-05T08:00:00Z'));
    try {
      db.profiles[0].role = 'admin';
      const res = await login(post('/api/auth/login', { identifier: 'qa', password: 'pw' }));
      expect(await res.json()).not.toHaveProperty('mfaSetupRequired');
      const s = await verifySession(cookieValue(res, SESSION_COOKIE_NAME)!);
      expect(s?.mfaSetupRequired).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it('whoever enabled two-factor is still asked for a code, admin or not', async () => {
    db.profiles[0].role = 'admin';
    await enrolVerified();
    const res = await login(post('/api/auth/login', { identifier: 'qa', password: 'pw' }));
    expect(await res.json()).toEqual({ mfaRequired: true });
  });

  it('the account page reports two-factor as not required for an admin', async () => {
    db.profiles[0].role = 'admin';
    currentSession = { userId: U, email: 'qa@example.test', username: 'qa', role: 'admin', loginAt: Date.now() };
    expect((await (await mfaStatus()).json()).required).toBe(false);
  });

  it('middleware: a limited session reaches only the enrolment page; the code step is public', async () => {
    const token = await signSession({ userId: U, email: 'e', username: 'u', role: 'admin', loginAt: Date.now(), mfaSetupRequired: true });
    const cookie = `${SESSION_COOKIE_NAME}=${token}; safedoc_consent=x`;
    const page = await middleware(new NextRequest(`${ORIGIN}/dashboard`, { headers: { cookie } }));
    expect(page.headers.get('location')).toContain('/account/security');
    const api = await middleware(new NextRequest(`${ORIGIN}/api/workers`, { headers: { cookie } }));
    expect(api.status).toBe(403);
    const enrolApi = await middleware(new NextRequest(`${ORIGIN}/api/account/mfa`, { headers: { cookie } }));
    expect(enrolApi.headers.get('x-middleware-next')).toBe('1');
    const codeStep = await middleware(post('/api/auth/mfa/verify', { code: '1' }));
    expect(codeStep.headers.get('x-middleware-next')).toBe('1');
  });
});
