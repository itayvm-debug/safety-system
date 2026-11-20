/**
 * Daily maintenance (2026-11-18). Background: the rate-limit migration had never been applied in
 * production (every limit failed open) and three tables were readable with the public key — both
 * unnoticed. The daily job cleans rate-limit events (raw IPs) and runs safedoc_health_check(),
 * alerting platform admins on any failure.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

const rpcSpy = vi.fn();
const fromSpy = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ rpc: rpcSpy, from: fromSpy }) }));
const sendSpy = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendSpy };
  },
}));

import { GET } from '@/app/api/maintenance/daily/route';
import { runDailyMaintenance } from '@/lib/maintenance/daily';
import { middleware } from '@/middleware';

const ROOT = join(__dirname, '..', '..', '..', '..', '..');
const PATH = '/api/maintenance/daily';
const OK_ROWS = [
  { check_name: 'required functions', ok: true, detail: 'present' },
  { check_name: 'no client table access', ok: true, detail: 'none' },
];

function req(auth?: string) {
  return new NextRequest(`https://app.example.test${PATH}`, auth ? { headers: { authorization: auth } } : undefined);
}

function rpcReturns(health: { data: unknown; error: unknown }, cleanup = { data: 3, error: null }) {
  rpcSpy.mockImplementation(async (name: string) => (name === 'rate_limit_cleanup' ? cleanup : health));
}

let adminEmails: string[] = [];
let errorEvents: { source: string; status: number; created_at: string }[] = [];
const errorEventOps: string[] = [];

/** profiles → admin e-mails; app_error_events → the rows in errorEvents (ops recorded). */
function tableChain(table: string) {
  const result = table === 'profiles'
    ? { data: adminEmails.map((email) => ({ email })), error: null }
    : { data: table === 'app_error_events' ? errorEvents : [], error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit', 'delete']) {
    chain[m] = (...args: unknown[]) => { if (table === 'app_error_events') errorEventOps.push(`${m}:${String(args[0] ?? '')}`); return chain; };
  }
  chain.then = (r: (v: unknown) => unknown) => r(result);
  return chain;
}

function adminsReturn(emails: string[]) {
  adminEmails = emails;
}

beforeEach(() => {
  rpcSpy.mockReset(); fromSpy.mockReset(); sendSpy.mockReset();
  adminEmails = []; errorEvents = []; errorEventOps.length = 0;
  fromSpy.mockImplementation(tableChain);
  process.env.CRON_SECRET = 'cron-test-secret';
  process.env.RESEND_API_KEY = 're_test';
  process.env.REPORT_FROM_EMAIL = 'reports@example.test';
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  sendSpy.mockResolvedValue({ data: { id: 'x' }, error: null });
});

describe('two-factor key check', () => {
  it('fails the daily run when MFA_ENCRYPTION_KEY is missing', async () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    rpcReturns({ data: OK_ROWS, error: null });
    const r = await runDailyMaintenance({ rpc: rpcSpy, from: fromSpy } as never, vi.fn().mockResolvedValue(1));
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('MFA_ENCRYPTION_KEY missing or invalid in the environment');
  });
});

describe('GET /api/maintenance/daily', () => {
  it('refuses requests without the cron secret and touches no data', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer wrong'))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req('Bearer undefined'))).status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('cleans events older than 24h, runs the health check, and sends no alert when all is well', async () => {
    rpcReturns({ data: OK_ROWS, error: null });
    const res = await GET(req('Bearer cron-test-secret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 3, checks: 2, failures: 0, incidents: 0, alerted: 0 });
    expect(rpcSpy).toHaveBeenCalledWith('rate_limit_cleanup', { p_max_age_hours: 24 });
    expect(rpcSpy).toHaveBeenCalledWith('safedoc_health_check');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('answers 500 and e-mails the platform admins when a check fails', async () => {
    rpcReturns({ data: [...OK_ROWS, { check_name: 'no client table access', ok: false, detail: 'client access: workers' }], error: null });
    adminsReturn(['owner@example.test', 'not-an-email']);
    const res = await GET(req('Bearer cron-test-secret'));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, failures: 1, alerted: 1 });
    const mail = sendSpy.mock.calls[0][0];
    expect(mail.to).toEqual(['owner@example.test']);
    expect(mail.text).toContain('no client table access: client access: workers');
  });

  it('is reachable through the middleware without a session (it has its own secret)', async () => {
    const res = await middleware(req('Bearer x'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('is scheduled daily in vercel.json', () => {
    const crons = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).crons as { path: string; schedule: string }[];
    expect(crons.find((c) => c.path === PATH)?.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});

describe('vercel.json ignoreCommand (skip deploys that change only docs, SQL or tests)', () => {
  const cmd = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).ignoreCommand as string;

  it('compares against the last successful deployment and builds when it is unknown', () => {
    expect(cmd).toMatch(/^\[ -n "\$VERCEL_GIT_PREVIOUS_SHA" \] && git diff --quiet "\$VERCEL_GIT_PREVIOUS_SHA" HEAD -- \. /);
    expect(cmd).not.toContain('HEAD^');
  });

  it('never excludes application code or public assets', () => {
    const excluded = [...cmd.matchAll(/:\(exclude\)([^']+)/g)].map((m) => m[1]);
    for (const dir of ['app', 'lib', 'components', 'hooks', 'public', 'types', 'middleware.ts', 'package.json', 'next.config.ts', 'vercel.json']) {
      expect(excluded.some((e) => e === dir || e.startsWith(`${dir}/`))).toBe(false);
    }
    expect(excluded).toEqual(expect.arrayContaining(['*.md', 'docs', 'supabase']));
  });
});

describe('runDailyMaintenance', () => {
  const db = () => ({ rpc: rpcSpy, from: fromSpy }) as never;

  it('treats a missing or failing health function as a failure (a migration that was never applied)', async () => {
    const alert = vi.fn().mockResolvedValue(1);
    rpcReturns({ data: null, error: { message: 'Could not find the function public.safedoc_health_check' } });
    const r = await runDailyMaintenance(db(), alert);
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toContain('safedoc_health_check failed');
    expect(alert).toHaveBeenCalledOnce();
  });

  it('treats a failing cleanup as a failure and an empty health result as a failure', async () => {
    const alert = vi.fn().mockResolvedValue(0);
    rpcReturns({ data: [], error: null }, { data: null, error: { message: 'boom' } } as never);
    const r = await runDailyMaintenance(db(), alert);
    expect(r.deleted).toBeNull();
    expect(r.failures).toEqual(['rate_limit_cleanup failed: boom', 'safedoc_health_check returned no rows']);
  });

  it('still returns the result when the alert e-mail itself fails', async () => {
    rpcReturns({ data: [{ check_name: 'x', ok: false, detail: 'y' }], error: null });
    const r = await runDailyMaintenance(db(), vi.fn().mockRejectedValue(new Error('smtp down')));
    expect(r).toMatchObject({ ok: false, alerted: 0 });
  });
});

describe('SQL grants', () => {
  const rl = readFileSync(join(ROOT, 'supabase', 'migrations', 'durable-rate-limiting.sql'), 'utf8');
  const hc = readFileSync(join(ROOT, 'supabase', 'migrations', 'safedoc-health-check.sql'), 'utf8');

  it.each([
    'rate_limit_check(text, text, integer, integer, inet, uuid)',
    'rate_limit_cleanup(integer)',
  ])('rate-limit migration revokes EXECUTE on %s from anon and authenticated by name', (signature) => {
    const escaped = signature.replace(/[()]/g, '\\$&');
    expect(rl).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${escaped}\\s+FROM PUBLIC, anon, authenticated;`));
  });

  it('health check is callable by service_role only', () => {
    expect(hc).toMatch(/REVOKE ALL ON FUNCTION public\.safedoc_health_check\(\) FROM PUBLIC, anon, authenticated;/);
    expect(hc).toMatch(/GRANT EXECUTE ON FUNCTION public\.safedoc_health_check\(\) TO service_role;/);
  });
});
