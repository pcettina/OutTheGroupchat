/**
 * E2E tests: signup → verify-email → login auth flow.
 *
 * Prerequisites:
 *   npx playwright install chromium
 *   npm run dev  (or CI webServer config in playwright.config.ts)
 *
 * Email verification via token URL cannot intercept real emails in E2E,
 * so verification is tested at the API level via direct fetch() calls
 * inside the browser context. The UI flow tests cover form rendering,
 * client-side validation, and server-driven error states.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to the signup page and wait for the form to be ready. */
async function gotoSignup(page: Page) {
  await page.goto('/auth/signup');
  await page.waitForSelector('#name', { state: 'visible', timeout: 15000 });
}

/** Navigate to the signin page and wait for the form to be ready. */
async function gotoSignin(page: Page) {
  await page.goto('/auth/signin');
  await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });
}

/** Fill and submit the signup form. */
async function fillSignup(
  page: Page,
  {
    name,
    email,
    password,
    confirmPassword,
  }: { name: string; email: string; password: string; confirmPassword?: string }
) {
  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#confirmPassword', confirmPassword ?? password);
  await page.click('button[type="submit"]');
}

/** Fill and submit the signin form. */
async function fillSignin(page: Page, email: string, password: string) {
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
}

// ---------------------------------------------------------------------------
// Signup page — rendering
// ---------------------------------------------------------------------------

test.describe('Signup page', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000);
    await gotoSignup(page);
  });

  test('renders heading and all form fields', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Create your account');

    // All four inputs must be present
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();

    // Submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Create account');
  });

  test('has a link to the signin page', async ({ page }) => {
    const signinLink = page.locator('a[href="/auth/signin"]');
    await expect(signinLink).toBeVisible();
    await expect(signinLink).toContainText('sign in');
  });

  test('email input enforces email type', async ({ page }) => {
    const emailInput = page.locator('#email');
    const inputType = await emailInput.getAttribute('type');
    expect(inputType).toBe('email');
  });

  test('password and confirmPassword inputs are masked', async ({ page }) => {
    expect(await page.locator('#password').getAttribute('type')).toBe('password');
    expect(await page.locator('#confirmPassword').getAttribute('type')).toBe('password');
  });

  test('displays invitation banner when invitation=true query param present', async ({ page }) => {
    await page.goto('/auth/signup?invitation=true&redirect=/trips/abc');
    await page.waitForSelector('#name', { state: 'visible', timeout: 15000 });

    // Heading changes for invitation flow
    await expect(page.locator('h2')).toContainText('Join OutTheGroupchat');

    // Green invitation banner is visible
    const banner = page.locator('.bg-green-50');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("You've been invited to a trip!");
  });
});

// ---------------------------------------------------------------------------
// Signup page — client-side validation
// ---------------------------------------------------------------------------

test.describe('Signup client-side validation', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000);
    await gotoSignup(page);
  });

  test('shows error when passwords do not match', async ({ page }) => {
    await fillSignup(page, {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123!',
      confirmPassword: 'DifferentPass!',
    });

    // Error banner appears without a network call
    const errorBanner = page.locator('.bg-red-50');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });
    await expect(errorBanner).toContainText('Passwords do not match');
  });

  test('required fields prevent submission when empty', async ({ page }) => {
    // Click submit without filling anything — browser required validation fires
    await page.click('button[type="submit"]');

    // The page should NOT navigate away and no error banner from the server
    await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Signup page — server-driven error states
// ---------------------------------------------------------------------------

test.describe('Signup server errors', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(20000);
  });

  test('shows error for duplicate email', async ({ page }) => {
    await gotoSignup(page);

    // Intercept the signup API to simulate a duplicate-email response
    await page.route('/api/auth/signup', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Email already exists' }),
      });
    });

    await fillSignup(page, {
      name: 'Existing User',
      email: 'existing@example.com',
      password: 'Password123!',
    });

    const errorBanner = page.locator('.bg-red-50');
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
    await expect(errorBanner).toContainText('Email already exists');
  });

  test('shows generic error on 500 response', async ({ page }) => {
    await gotoSignup(page);

    await page.route('/api/auth/signup', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await fillSignup(page, {
      name: 'Error User',
      email: 'error@example.com',
      password: 'Password123!',
    });

    const errorBanner = page.locator('.bg-red-50');
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
  });

  test('shows "Creating account..." loading state while request is in flight', async ({ page }) => {
    await gotoSignup(page);

    // Delay the API response so we can observe the loading state
    await page.route('/api/auth/signup', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'simulated delay' }),
      });
    });

    await page.fill('#name', 'Loading User');
    await page.fill('#email', 'loading@example.com');
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');

    // Click and immediately check the button text
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    await expect(submitBtn).toContainText('Creating account...', { timeout: 3000 });
    await expect(submitBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Email verification — API-level tests
// ---------------------------------------------------------------------------

test.describe('Email verification API', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000);
  });

  test('GET /api/auth/verify-email with missing token returns 400', async ({ page }) => {
    const response = await page.request.get('/api/auth/verify-email');
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('GET /api/auth/verify-email with invalid token returns 400', async ({ page }) => {
    const response = await page.request.get(
      '/api/auth/verify-email?token=not-a-real-token-xyz-12345'
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/invalid|expired/i);
  });

  test('GET /api/auth/verify-email with empty token returns 400', async ({ page }) => {
    const response = await page.request.get('/api/auth/verify-email?token=');
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// Signin page — rendering
// ---------------------------------------------------------------------------

test.describe('Signin page', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000);
    await gotoSignin(page);
  });

  test('renders heading and all form fields', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Sign in to your account');

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Sign in');
  });

  test('has a link to the signup page', async ({ page }) => {
    const signupLink = page.locator('a[href="/auth/signup"]');
    await expect(signupLink).toBeVisible();
    await expect(signupLink).toContainText('create a new account');
  });

  test('has a Forgot your password link', async ({ page }) => {
    const forgotLink = page.locator('a[href="/auth/reset-password"]');
    await expect(forgotLink).toBeVisible();
    await expect(forgotLink).toContainText('Forgot your password');
  });

  test('has a Google sign-in button', async ({ page }) => {
    const googleBtn = page.locator('button', { hasText: 'Sign in with Google' });
    await expect(googleBtn).toBeVisible();
  });

  test('password input is masked', async ({ page }) => {
    expect(await page.locator('#password').getAttribute('type')).toBe('password');
  });

  test('shows "Account created successfully" banner when registered=true param present', async ({
    page,
  }) => {
    await page.goto('/auth/signin?registered=true');
    await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });

    const banner = page.locator('.bg-green-50');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Account created successfully');
  });
});

// ---------------------------------------------------------------------------
// Signin page — invalid credentials
// ---------------------------------------------------------------------------

test.describe('Signin invalid credentials', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(20000);
  });

  test('shows "Invalid email or password" for wrong credentials', async ({ page }) => {
    await gotoSignin(page);

    // Intercept NextAuth credentials callback to simulate auth failure
    await page.route('/api/auth/callback/credentials', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'CredentialsSignin', url: null }),
      });
    });

    await fillSignin(page, 'wrong@example.com', 'wrongpassword');

    const errorBanner = page.locator('.bg-red-50');
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
    await expect(errorBanner).toContainText('Invalid email or password');
  });

  test('shows "Signing in..." loading state while request is in flight', async ({ page }) => {
    await gotoSignin(page);

    await page.route('/api/auth/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'CredentialsSignin', url: null }),
      });
    });

    const submitBtn = page.locator('button[type="submit"]');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'AnyPassword1!');
    await submitBtn.click();

    await expect(submitBtn).toContainText('Signing in...', { timeout: 3000 });
    await expect(submitBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Signin page — demo mode (conditional on DEMO_MODE env var)
// ---------------------------------------------------------------------------

test.describe('Signin demo mode', () => {
  test('demo login API returns 403 when DEMO_MODE is not set', async ({ page }) => {
    page.setDefaultTimeout(15000);
    const response = await page.request.post('/api/auth/demo');
    // Without DEMO_MODE=true the endpoint must refuse
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/demo mode/i);
  });

  test('demo info API returns 403 when DEMO_MODE is not set', async ({ page }) => {
    page.setDefaultTimeout(15000);
    const response = await page.request.get('/api/auth/demo');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full signup → signin navigation flow (UI navigation only, no real DB)
// ---------------------------------------------------------------------------

test.describe('Auth navigation flow', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000);
  });

  test('signup page sign-in link navigates to /auth/signin', async ({ page }) => {
    await gotoSignup(page);
    await page.click('a[href="/auth/signin"]');
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.locator('h2')).toContainText('Sign in to your account');
  });

  test('signin page create account link navigates to /auth/signup', async ({ page }) => {
    await gotoSignin(page);
    await page.click('a[href="/auth/signup"]');
    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.locator('h2')).toContainText('Create your account');
  });

  test('signup page preserves redirect param in sign-in link', async ({ page }) => {
    const redirect = encodeURIComponent('/trips/abc123');
    await page.goto(`/auth/signup?redirect=${redirect}`);
    await page.waitForSelector('#name', { state: 'visible', timeout: 15000 });

    const signinHref = await page.locator('a[href*="/auth/signin"]').getAttribute('href');
    expect(signinHref).toContain('redirect=');
    expect(signinHref).toContain('trips');
  });

  test('signin page preserves redirect param in create account link when non-default redirect', async ({
    page,
  }) => {
    const redirect = encodeURIComponent('/trips/xyz456');
    await page.goto(`/auth/signin?redirect=${redirect}`);
    await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });

    const signupHref = await page.locator('a[href*="/auth/signup"]').getAttribute('href');
    expect(signupHref).toContain('redirect=');
    expect(signupHref).toContain('trips');
  });

  test('forgot password link navigates to /auth/reset-password', async ({ page }) => {
    await gotoSignin(page);
    await page.click('a[href="/auth/reset-password"]');
    await expect(page).toHaveURL(/\/auth\/reset-password/);
  });
});
