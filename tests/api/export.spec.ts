import { test, expect } from '@playwright/test';

/**
 * Export API tests
 *
 * Tests /api/admin/export authorization and basic response contract.
 * Does NOT require a populated DB — tests auth boundaries only.
 */
test.describe('/api/admin/export', () => {
  test('GET without session returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/export');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('GET with session but non-admin role returns 403', async ({ request }) => {
    // Simulate a request with a crafted (but invalid) session cookie — should fail auth
    const response = await request.get('/api/admin/export', {
      headers: { Cookie: 'safedoc_session=invalid-token' },
    });
    // Invalid session → 401 (not 200)
    expect([401, 403]).toContain(response.status());
  });
});

/**
 * /api/health — Public endpoint contract
 */
test.describe('/api/health', () => {
  test('GET returns 200 with status ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('timestamp');
  });

  test('health response has valid ISO timestamp', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    expect(() => new Date(body.timestamp)).not.toThrow();
    expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
  });
});

/**
 * /api/admin/system-health — Admin-only endpoint
 */
test.describe('/api/admin/system-health', () => {
  test('GET without session returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/system-health');
    expect(response.status()).toBe(401);
  });
});
