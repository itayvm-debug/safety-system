import { test, expect } from '@playwright/test';

/**
 * Admin authorization boundary tests.
 *
 * Tests that the auth system correctly blocks access based on
 * session validity and role — NOT on client-side cookies like safedoc_role.
 *
 * All tests run against the middleware JWT verification layer.
 * No real DB is needed because middleware rejects invalid JWT signatures.
 */

test.describe('Admin authorization boundaries', () => {

  test('no session → 401 on admin API', async ({ request }) => {
    const response = await request.get('/api/admin/export');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('invalid session token → 401 on admin API', async ({ request }) => {
    const response = await request.get('/api/admin/export', {
      headers: { Cookie: 'safedoc_session=not-a-real-jwt' },
    });
    expect(response.status()).toBe(401);
  });

  test('safedoc_role=admin cookie without valid session → 401 (role cookie is not authoritative)', async ({ request }) => {
    // safedoc_role is httpOnly=false and for UI display only.
    // Setting it without a valid safedoc_session must have no effect on API auth.
    const response = await request.get('/api/admin/export', {
      headers: { Cookie: 'safedoc_role=admin' },
    });
    expect(response.status()).toBe(401);
  });

  test('safedoc_role=admin + invalid session → 401 (forged role cookie rejected)', async ({ request }) => {
    const response = await request.get('/api/admin/export', {
      headers: { Cookie: 'safedoc_session=fake.signature.tampered; safedoc_role=admin' },
    });
    expect(response.status()).toBe(401);
  });

  test('no session → 401 on system-health', async ({ request }) => {
    const response = await request.get('/api/admin/system-health');
    expect(response.status()).toBe(401);
  });

  test('no session → 401 on workers POST (write operation)', async ({ request }) => {
    const response = await request.post('/api/workers', {
      data: { full_name: 'Test Worker', national_id: '123456789' },
      headers: { 'Content-Type': 'application/json' },
    });
    // Middleware returns 401 for missing session on API routes
    expect(response.status()).toBe(401);
  });

  test('no session → 401 on vehicles GET (read operation)', async ({ request }) => {
    const response = await request.get('/api/vehicles');
    expect(response.status()).toBe(401);
  });

});

test.describe('Public routes remain accessible without session', () => {

  test('GET /api/health is public — no auth needed', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
  });

  test('POST /api/auth/login is public', async ({ request }) => {
    // Should reach the handler (not be blocked by middleware)
    // Will return 401 because credentials are wrong, but NOT from middleware redirect
    const response = await request.post('/api/auth/login', {
      data: { identifier: 'no-such-user', password: 'wrong' },
      headers: { 'Content-Type': 'application/json' },
    });
    // 401 from the login handler (wrong credentials), not a middleware redirect
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

});
