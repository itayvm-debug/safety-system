/**
 * Rate limiting (2026-11-18): the DB function was missing in production and every limit failed
 * open silently; logins were limited only per IP.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const rpcSpy = vi.fn();
const fromSpy = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ rpc: rpcSpy, from: fromSpy }) }));
const signInSpy = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: signInSpy } }) }));

import { checkRateLimitDb, rateLimitLoginAccountDb } from '@/lib/rate-limit/db';
import { POST as login } from '@/app/api/auth/login/route';

const allowed = { data: [{ allowed: true, remaining: 5, reset_at: new Date(Date.now() + 60_000).toISOString() }], error: null };
const denied = { data: [{ allowed: false, remaining: 0, reset_at: new Date(Date.now() + 60_000).toISOString() }], error: null };

beforeEach(() => {
  rpcSpy.mockReset(); fromSpy.mockReset(); signInSpy.mockReset();
  vi.restoreAllMocks();
});

describe('checkRateLimitDb', () => {
  it('logs when the database check is unavailable instead of failing open silently', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcSpy.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.rate_limit_check' } });
    const r = await checkRateLimitDb('k', 'login', 10, 900);
    expect(r.allowed).toBe(true);
    expect(err).toHaveBeenCalledWith('[rate-limit] check unavailable, request allowed:', 'login', expect.stringContaining('rate_limit_check'));
  });
});

describe('per-account login limit', () => {
  it('keys on a hash of the normalised identifier, never the raw value, and stores no IP', async () => {
    rpcSpy.mockResolvedValue(allowed);
    await rateLimitLoginAccountDb('  Some.User ');
    const args = rpcSpy.mock.calls[0][1];
    expect(rpcSpy.mock.calls[0][0]).toBe('rate_limit_check');
    expect(args).toMatchObject({ p_action: 'login-account', p_max_requests: 10, p_window_seconds: 900, p_ip: null, p_user_id: null });
    expect(args.p_key).toMatch(/^[0-9a-f]{64}$/);
    await rateLimitLoginAccountDb('some.user');
    expect(rpcSpy.mock.calls[1][1].p_key).toBe(args.p_key);
  });

  it('login answers 429 and never checks the password once the account limit is reached', async () => {
    rpcSpy.mockImplementation(async (_n: string, a: { p_action: string }) => (a.p_action === 'login' ? allowed : denied));
    const res = await login(new NextRequest('https://app.example.test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://app.example.test', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify({ identifier: 'victim', password: 'guess' }),
    }));
    expect(res.status).toBe(429);
    expect(signInSpy).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalled();
    expect(rpcSpy.mock.calls.map((c) => c[1].p_action)).toEqual(['login', 'login-account']);
  });
});
