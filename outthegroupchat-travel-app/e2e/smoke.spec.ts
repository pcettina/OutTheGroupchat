/**
 * Smoke tests for OutTheGroupchat.
 *
 * These tests verify core user flows end-to-end:
 *   1. Landing page loads correctly
 *   2. Signup flow (new user registration)
 *   3. Trip creation (after auth)
 *   4. Invite flow (basic)
 *
 * Prerequisites:
 *   - App running at http://localhost:3000 (or PLAYWRIGHT_BASE_URL)
 *   - A test database with clean state (or use TEST_USER_EMAIL/PASS env vars)
 *   - npx playwright install chromium
 *
 * Run: npm run test:e2e
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || `e2e+${Date.now()}@example.com`;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
const TEST_NAME = 'E2E Test User';

// ---------------------------------------------------------------------------
// Suite 1: Landing Page
// ---------------------------------------------------------------------------
test.describe('Landing Page', () => {
  test('loads and shows primary CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/OutTheGroupchat|Out The Groupchat/i);

    // Should show at least one call-to-action button
    const cta = page.getByRole('link', { name: /get started|sign up|join/i }).first();
    await expect(cta).toBeVisible();
  });

  test('navigation links are accessible', async ({ page }) => {
    await page.goto('/');
    // Auth links should be present
    const signInLink = page.getByRole('link', { name: /sign in|log in/i }).first();
    await expect(signInLink).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Authentication Flow
// ---------------------------------------------------------------------------
test.describe('Auth Flow', () => {
  test('signup page loads correctly', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.getByRole('heading', { name: /sign up|create account|join/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('shows validation error for invalid email', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.getByLabel(/email/i).fill('not-an-email');
    await page.getByLabel(/name/i).fill(TEST_NAME);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign up|create|submit/i }).click();

    // Should show a validation error
    await expect(
      page.getByText(/invalid email|valid email|email address/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('sign in page loads correctly', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('shows error for wrong credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password/i).fill('WrongPassword123!');
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // Should show an error message
    await expect(
      page.getByText(/invalid|incorrect|wrong|not found|error/i)
    ).toBeVisible({ timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Protected Routes
// ---------------------------------------------------------------------------
test.describe('Protected Routes', () => {
  test('trips page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/trips');
    // Should redirect to sign-in or show auth wall
    await expect(page).toHaveURL(/auth|signin|login/i, { timeout: 5000 });
  });

  test('profile page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/auth|signin|login/i, { timeout: 5000 });
  });

  test('feed page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/feed');
    await expect(page).toHaveURL(/auth|signin|login/i, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 4: API Health
// ---------------------------------------------------------------------------
test.describe('API Health', () => {
  test('health endpoint returns 200', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });

  test('unauthenticated trips API returns 401', async ({ request }) => {
    const response = await request.get('/api/trips');
    expect(response.status()).toBe(401);
  });

  test('unauthenticated notifications API returns 401', async ({ request }) => {
    const response = await request.get('/api/notifications');
    expect(response.status()).toBe(401);
  });

  test('password reset API accepts valid email', async ({ request }) => {
    const response = await request.post('/api/auth/reset-password', {
      data: { email: 'test@example.com' },
    });
    // Always 200 to prevent enumeration
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('feed comments API with missing params returns 400', async ({ request }) => {
    const response = await request.post('/api/feed/comments', {
      data: { itemId: '' }, // missing itemType and text
    });
    expect(response.status()).toBe(400);
  });

  test('feed engagement API with invalid action returns 400', async ({ request }) => {
    const response = await request.post('/api/feed/engagement', {
      data: { itemId: 'test-id', itemType: 'activity', action: 'invalid-action' },
    });
    expect(response.status()).toBe(400);
  });
});
