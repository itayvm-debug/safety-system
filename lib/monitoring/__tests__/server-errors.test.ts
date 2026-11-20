/**
 * 2026-11-20. On 19.11 at 06:04 UTC the database answered 503 during the photo-request storm.
 *  - Every request then read "profile not found" → 403 "המשתמש הושבת" (user disabled), and server
 *    pages redirected to /login — people in the field looked logged out.
 *  - Nobody was told; it was found by reading logs.
 * Now: a database failure is 503 "temporary", pages show "try again", the failure is recorded in
 * app_error_events, the first 5xx of the hour e-mails the platform admins, and the daily cron
 * sends a summary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ─── mocks ───────────────────────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  profile: { data: { is_active: true, role: 'user' }, error: null } as { data: unknown; error: unknown },
  memberships: { data: [{ company_id: 'co-a', role: 'admin', is_active: true }], error: null } as { data: unknown; error: unknown },
  company: { data: { id: 'co-a', name: 'A', settings: {}, is_active: true }, error: null } as { data: unknown; error: unknown },
  inserted: [] as Record<string, unknown>[],
  insertError: null as unknown,
  earlierCount: 0,
}));

function table(name: string) {
  const c: Record<string, unknown> = {};
  let op = 'select';
  let row: Record<string, unknown> | null = null;
  for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit']) c[m] = () => c;
  c.insert = (r: Record<string, unknown>) => { op = 'insert'; row = r; return c; };
  c.single = () => {
    if (name === 'profiles') return Promise.resolve(state.profile);
    if (name === 'companies') return Promise.resolve(state.company);
    if (name === 'app_error_events' && op === 'insert') {
      if (state.insertError) return Promise.resolve({ data: null, error: state.insertError });
      state.inserted.push(row!);
      return Promise.resolve({ data: { id: state.inserted.length }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };
  c.then = (r: (v: unknown) => unknown) => {
    if (name === 'company_members') return Promise.resolve(state.memberships).then(r);
    if (name === 'app_error_events') return Promise.resolve({ data: null, count: state.earlierCount, error: null }).then(r);
    if (name === 'profiles') return Promise.resolve({ data: [{ email: 'admin@example.test' }], error: null }).then(r);
    return Promise.resolve({ data: [], error: null }).then(r);
  };
  return c;
}
const fakeDb = { from: (t: string) => table(t) };
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeDb }));
vi.mock('@/lib/auth/session', () => ({
  getSession: async () => ({ userId: 'u1', email: 'u@example.test', username: 'u', role: 'user', loginAt: Date.now() }),
}));
vi.mock('@/lib/auth/active-company', () => ({ getActiveCompanyId: async () => null }));
vi.mock('@/lib/company/settings', () => ({ resolveCompanySettings: () => ({}) }));
const sendSpy = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: class { emails = { send: sendSpy }; } }));

import { getCurrentCompanyContext, getPageCompanyContext, DB_UNAVAILABLE_MESSAGE } from '@/lib/auth/company-context';
import { requireAuth } from '@/lib/auth/api';
import { recordServerError, cleanDetail, __resetServerErrorState } from '@/lib/monitoring/server-errors';
import { __resetAlertRecipients } from '@/lib/monitoring/admin-alert';
import { runDailyMaintenance, summarizeIncidents } from '@/lib/maintenance/daily';

const DB_DOWN = { data: null, error: { code: 'PGRST001', message: 'upstream connect error' } };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  state.profile = { data: { is_active: true, role: 'user' }, error: null };
  state.memberships = { data: [{ company_id: 'co-a', role: 'admin', is_active: true }], error: null };
  state.company = { data: { id: 'co-a', name: 'A', settings: {}, is_active: true }, error: null };
  state.inserted = []; state.insertError = null; state.earlierCount = 0;
  sendSpy.mockReset(); sendSpy.mockResolvedValue({ data: { id: 'm' }, error: null });
  process.env.RESEND_API_KEY = 're_test';
  process.env.REPORT_FROM_EMAIL = 'reports@example.test';
  __resetServerErrorState(); __resetAlertRecipients();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─── a database failure is not "user disabled" ───────────────────────────────
describe('company context when the database does not answer', () => {
  it('profiles query fails → 503 temporary (not 403 "user disabled") and the failure is recorded', async () => {
    state.profile = DB_DOWN;
    const r = await getCurrentCompanyContext();
    expect(r.code).toBe('DB_UNAVAILABLE');
    expect(r.error?.status).toBe(503);
    expect(await r.error!.json()).toEqual({ error: DB_UNAVAILABLE_MESSAGE });
    await flush();
    expect(state.inserted[0]).toMatchObject({ source: 'company-context', status: 503 });
  });

  it('memberships or company query fails → 503 too', async () => {
    state.memberships = DB_DOWN;
    expect((await getCurrentCompanyContext()).code).toBe('DB_UNAVAILABLE');
    state.memberships = { data: [{ company_id: 'co-a', role: 'admin', is_active: true }], error: null };
    state.company = DB_DOWN;
    expect((await getCurrentCompanyContext()).code).toBe('DB_UNAVAILABLE');
  });

  it('a real missing / disabled profile is still 403 (no row = PGRST116 is not a failure)', async () => {
    state.profile = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    expect((await getCurrentCompanyContext()).code).toBe('INACTIVE_PROFILE');
    state.profile = { data: { is_active: false, role: 'user' }, error: null };
    expect((await getCurrentCompanyContext()).code).toBe('INACTIVE_PROFILE');
    await flush();
    expect(state.inserted).toHaveLength(0);
  });

  it('server pages throw (error page with "try again") instead of redirecting to /login', async () => {
    state.profile = DB_DOWN;
    await expect(getPageCompanyContext()).rejects.toThrow(DB_UNAVAILABLE_MESSAGE);
  });

  it('requireAuth / requireAdmin answer 503 on a database failure', async () => {
    state.profile = DB_DOWN;
    const r = await requireAuth();
    expect(r.error?.status).toBe(503);
  });
});

// ─── recording and the immediate alert ───────────────────────────────────────
describe('recordServerError', () => {
  it('stores source, status and a cleaned detail; the first 5xx of the hour e-mails the admins', async () => {
    await recordServerError({ source: 'company-context', status: 503, detail: 'boom for a@b.co id 123456789' }, { db: fakeDb as never });
    expect(state.inserted[0]).toEqual({ source: 'company-context', status: 503, detail: 'boom for [email] id [number]' });
    expect(sendSpy).toHaveBeenCalledOnce();
    const mail = sendSpy.mock.calls[0][0];
    expect(mail.to).toEqual(['admin@example.test']);
    expect(mail.subject).toBe('SafeDoc — תקלה בשרת');
    expect(mail.text).toContain('company-context');
  });

  it('no second e-mail while an earlier 5xx exists in the hour', async () => {
    state.earlierCount = 3;
    await recordServerError({ source: 'x', status: 500 }, { db: fakeDb as never });
    expect(state.inserted).toHaveLength(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rate-limit refusals (429) are stored but only go to the daily summary', async () => {
    await recordServerError({ source: 'rate-limit:signed-url', status: 429 }, { db: fakeDb as never });
    expect(state.inserted).toHaveLength(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('when even the insert fails (database down), e-mails once an hour from memory', async () => {
    state.insertError = { message: 'fetch failed' };
    await recordServerError({ source: 'a', status: 503 }, { db: fakeDb as never, now: 1_000_000 });
    // first call: recipients come from the database mock; later calls reuse them
    await recordServerError({ source: 'a', status: 503 }, { db: fakeDb as never, now: 1_000_000 + 60_000 });
    await recordServerError({ source: 'a', status: 503 }, { db: fakeDb as never, now: 1_000_000 + 61 * 60_000 });
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy.mock.calls[0][0].subject).toContain('מסד הנתונים לא זמין');
  });

  it('never throws, even if e-mail is broken', async () => {
    sendSpy.mockRejectedValue(new Error('smtp down'));
    await expect(recordServerError({ source: 'a', status: 500 }, { db: fakeDb as never })).resolves.toBeUndefined();
  });
});

describe('cleanDetail', () => {
  it('masks e-mails and long digit runs, one line, max 300 chars', () => {
    expect(cleanDetail('user x@y.com\n phone 0501234567')).toBe('user [email] phone [number]');
    expect(cleanDetail('a'.repeat(400))!.length).toBe(300);
    expect(cleanDetail(undefined)).toBeNull();
  });
});

// ─── daily summary ───────────────────────────────────────────────────────────
describe('daily summary of the last 24 hours', () => {
  const rows = [
    { source: 'company-context', status: 503, created_at: '2026-11-19T06:04:39Z' },
    { source: 'company-context', status: 503, created_at: '2026-11-19T06:04:40Z' },
    { source: 'rate-limit:signed-url', status: 429, created_at: '2026-11-19T06:02:46Z' },
  ];

  it('groups by source and status, most frequent first', () => {
    expect(summarizeIncidents(rows)).toEqual([
      { source: 'company-context', status: 503, count: 2, first: '2026-11-19T06:04:39Z', last: '2026-11-19T06:04:40Z' },
      { source: 'rate-limit:signed-url', status: 429, count: 1, first: '2026-11-19T06:02:46Z', last: '2026-11-19T06:02:46Z' },
    ]);
  });

  it('e-mails the summary even when every health check passed, and purges rows older than 30 days', async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const ops: string[] = [];
    const db = {
      rpc: async (n: string) => (n === 'rate_limit_cleanup' ? { data: 0, error: null } : { data: [{ check_name: 'c', ok: true, detail: '' }], error: null }),
      from: () => {
        const c: Record<string, unknown> = {};
        for (const m of ['select', 'gte', 'order', 'limit', 'delete', 'lt']) c[m] = (...a: unknown[]) => { ops.push(`${m}:${a.map(String).join(',')}`); return c; };
        c.then = (r: (v: unknown) => unknown) => r({ data: rows, error: null });
        return c;
      },
    };
    const alert = vi.fn().mockResolvedValue(1);
    const now = Date.parse('2026-11-20T02:30:00Z');
    const r = await runDailyMaintenance(db as never, alert, now);
    expect(r.ok).toBe(true);
    expect(r.incidents).toHaveLength(2);
    expect(ops).toContain(`lt:created_at,${new Date(now - 30 * 86_400_000).toISOString()}`);
    expect(alert).toHaveBeenCalledOnce();
    const [subject, text] = alert.mock.calls[0];
    expect(subject).toBe('SafeDoc — סיכום תקלות ב-24 השעות האחרונות');
    expect(text).toContain('503 company-context × 2');
    expect(text).toContain('429 rate-limit:signed-url × 1');
  });
});

// ─── wiring ──────────────────────────────────────────────────────────────────
describe('wiring', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const pages: string[] = [];
  (function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === 'page.tsx') pages.push(p);
    }
  })(join(ROOT, 'app'));

  it('no server page uses the API variants (they would redirect to /login on a database failure)', () => {
    const offenders = pages.filter((p) => /\b(getCurrentCompanyContext|requireCompanyAdminRole|requireCompanyMember)\(/.test(readFileSync(p, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('there is an in-app error page with "try again"', () => {
    expect(readFileSync(join(ROOT, 'app', 'error.tsx'), 'utf8')).toContain('נסה שוב');
  });

  it('uncaught server errors are reported through instrumentation.ts', () => {
    const src = readFileSync(join(ROOT, 'instrumentation.ts'), 'utf8');
    expect(src).toContain('export const onRequestError');
    expect(src).toContain('recordServerError');
  });

  it('rate-limit refusals and failures are reported', () => {
    const src = readFileSync(join(ROOT, 'lib', 'rate-limit', 'db.ts'), 'utf8');
    expect(src).toMatch(/rate-limit:\$\{action\}/);
    expect(src).toMatch(/rate-limit-unavailable:\$\{action\}/);
  });
});
