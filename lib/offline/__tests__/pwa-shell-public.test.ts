/**
 * Found in the live QA round (2026-11-18): signed out, /sw.js, /manifest.json and /offline.html
 * were redirected to /login by the middleware. The browser refused the Service Worker update
 * ("The script resource is behind a redirect"), the login page had no manifest, and a Service
 * Worker installed while signed out precached the login page as its offline page.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const ORIGIN = 'https://app.example.test';

describe('PWA shell files are served without a session', () => {
  it.each(['/sw.js', '/manifest.json', '/offline.html'])('%s passes through when signed out', async (path) => {
    const res = await middleware(new NextRequest(`${ORIGIN}${path}`));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('pages and APIs still require a session', async () => {
    expect((await middleware(new NextRequest(`${ORIGIN}/dashboard`))).headers.get('location')).toContain('/login');
    expect((await middleware(new NextRequest(`${ORIGIN}/api/workers`))).status).toBe(401);
    expect((await middleware(new NextRequest(`${ORIGIN}/sw.jsx`))).headers.get('location')).toContain('/login');
  });
});
