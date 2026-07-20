import { test, expect } from '@playwright/test';

/**
 * CSRF / Origin validation tests
 *
 * The middleware rejects POST/PUT/PATCH/DELETE requests from unknown Origins.
 * Same-site requests (no Origin header) are allowed.
 * Bearer-authenticated requests (Cron) are allowed regardless of Origin.
 */
test.describe('CSRF Origin protection', () => {
  test('POST from same origin (no Origin header) returns non-403', async ({ request }) => {
    // Login endpoint — same-site POST without Origin should NOT be rejected by CSRF check
    // (will be rejected 401 or handled by the route itself, not by CSRF middleware)
    const response = await request.post('/api/auth/login', {
      data: { identifier: '', password: '' },
      headers: { 'Content-Type': 'application/json' },
    });
    // Must NOT be 403 (CSRF rejection) — could be 400/401
    expect(response.status()).not.toBe(403);
  });

  test('POST from foreign origin returns 403', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { identifier: 'test', password: 'test' },
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://evil.example.com',
      },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toContain('Cross-site');
  });

  test('POST with Bearer token bypasses origin check', async ({ request }) => {
    // Simulates Vercel Cron request — Bearer token should bypass CSRF check
    const response = await request.post('/api/reports/weekly-status', {
      data: {},
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://evil.example.com',
        'Authorization': 'Bearer some-cron-secret',
      },
    });
    // CSRF check must pass (status will be 401/403 from auth, not 403 from CSRF)
    // If the server returns 403 with "Cross-site" body, CSRF check failed incorrectly
    const body = await response.json().catch(() => ({}));
    const isCsrfRejection = response.status() === 403 &&
      typeof body.error === 'string' && body.error.includes('Cross-site');
    expect(isCsrfRejection).toBe(false);
  });

  test('PUT from foreign origin returns 403', async ({ request }) => {
    const response = await request.put('/api/workers/some-id', {
      data: {},
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://attacker.example.com',
      },
    });
    expect(response.status()).toBe(403);
  });

  test('DELETE from foreign origin returns 403', async ({ request }) => {
    const response = await request.delete('/api/workers/some-id', {
      headers: {
        'Origin': 'https://attacker.example.com',
      },
    });
    expect(response.status()).toBe(403);
  });

  test('GET from foreign origin is allowed (not a mutation)', async ({ request }) => {
    // GET requests are NOT protected by CSRF
    const response = await request.get('/api/health', {
      headers: {
        'Origin': 'https://any-origin.example.com',
      },
    });
    // Health endpoint is public — should return 200
    expect(response.status()).toBe(200);
  });
});
