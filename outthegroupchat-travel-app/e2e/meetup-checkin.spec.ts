/**
 * Meetup + Check-in critical path smoke tests (Phase 8).
 *
 * These tests verify page structure and auth-boundary behavior for the
 * meetup and check-in features. A full create → RSVP or check-in → feed flow
 * would require a live database and authenticated session — those are covered
 * by Vitest unit/integration tests. These E2E tests confirm:
 *   1. Protected pages redirect unauthenticated users to sign-in.
 *   2. Auth page structure (sign-in form) is intact.
 *   3. API routes enforce auth and basic validation at the public boundary.
 *
 * Prerequisites:
 *   - App running at http://localhost:3000 (or PLAYWRIGHT_BASE_URL)
 *   - npx playwright install chromium
 *
 * Run: npm run test:e2e
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Suite 1: Meetup Pages — unauthenticated redirect
// ---------------------------------------------------------------------------
test.describe('Meetup pages (unauthenticated)', () => {
  test('/meetups redirects unauthenticated users to sign-in', async ({ page }) => {
    await page.goto('/meetups');
    await expect(page).toHaveURL(/auth|signin|login/i, { timeout: 5000 });
  });

  test('/meetups/new redirects unauthenticated users to sign-in', async ({ page }) => {
    await page.goto('/meetups/new');
    await expect(page).toHaveURL(/auth|signin|login/i, { timeout: 5000 });
  });

  test('sign-in page shown for /meetups/new has email and password fields', async ({ page }) => {
    await page.goto('/meetups/new');
    // After redirect, the sign-in form must be present
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/password/i)).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Check-in Pages — unauthenticated redirect
// ---------------------------------------------------------------------------
test.describe('Check-in pages (unauthenticated)', () => {
  test('/checkins redirects unauthenticated users to sign-in', async ({ page }) => {
    await page.goto('/checkins');
    await expect(page).toHaveURL(/auth|signin|login/i, { timeout: 5000 });
  });

  test('sign-in page shown for /checkins has email and password fields', async ({ page }) => {
    await page.goto('/checkins');
    // After redirect, the sign-in form must be present with correct inputs
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/password/i)).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Meetup API — auth + validation boundary
// ---------------------------------------------------------------------------
test.describe('Meetup API (auth + validation boundary)', () => {
  test('GET /api/meetups returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/meetups');
    expect(res.status()).toBe(401);
  });

  test('POST /api/meetups returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.post('/api/meetups', {
      data: { title: 'Test Meetup', scheduledAt: new Date().toISOString() },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/meetups/{id} returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/meetups/some-meetup-id');
    expect(res.status()).toBe(401);
  });

  test('POST /api/meetups/{id}/rsvp returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.post('/api/meetups/some-meetup-id/rsvp', {
      data: { status: 'GOING' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/meetups/{id}/invite returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.post('/api/meetups/some-meetup-id/invite', {
      data: { userIds: ['some-user-id'] },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Check-in API — auth + validation boundary
// ---------------------------------------------------------------------------
test.describe('Check-in API (auth + validation boundary)', () => {
  test('GET /api/checkins returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/checkins');
    expect(res.status()).toBe(401);
  });

  test('POST /api/checkins returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.post('/api/checkins', {
      data: { locationName: 'Test Bar', visibility: 'PUBLIC' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/checkins/feed returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/checkins/feed');
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/checkins/{id} returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.delete('/api/checkins/some-checkin-id');
    expect(res.status()).toBe(401);
  });
});
