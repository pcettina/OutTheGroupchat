/**
 * Crew smoke tests (Phase 3).
 *
 * A full end-to-end signup → request → accept flow would need two browser
 * contexts, email verification bypass, and a clean test DB per run — out of
 * scope for this smoke. These tests verify:
 *  - The Crew pages exist and redirect unauthenticated users to sign-in.
 *  - The Crew API routes enforce auth and validation at the public boundary.
 *
 * Prerequisites:
 *  - App running at http://localhost:3000 (or PLAYWRIGHT_BASE_URL)
 */

import { test, expect } from '@playwright/test';

test.describe('Crew pages (unauthenticated)', () => {
  test('/crew redirects unauthenticated users', async ({ page }) => {
    await page.goto('/crew');
    await expect(page).toHaveURL(/auth|signin|login/i, { timeout: 5000 });
  });

  test('/crew/requests redirects unauthenticated users', async ({ page }) => {
    await page.goto('/crew/requests');
    await expect(page).toHaveURL(/auth|signin|login/i, { timeout: 5000 });
  });

  test('/profile/{userId} redirects unauthenticated users', async ({ page }) => {
    await page.goto('/profile/some-user-id');
    await expect(page).toHaveURL(/auth|signin|login/i, { timeout: 5000 });
  });
});

test.describe('Crew API (auth + validation boundary)', () => {
  test('GET /api/crew returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/crew');
    expect(res.status()).toBe(401);
  });

  test('GET /api/crew/requests returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/crew/requests');
    expect(res.status()).toBe(401);
  });

  test('POST /api/crew/request returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.post('/api/crew/request', {
      data: { targetUserId: 'some-user' },
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/crew/{id} returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.patch('/api/crew/any-id', {
      data: { action: 'accept' },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/crew/{id} returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.delete('/api/crew/any-id');
    expect(res.status()).toBe(401);
  });

  test('GET /api/crew/status/{userId} returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/crew/status/someone');
    expect(res.status()).toBe(401);
  });
});
