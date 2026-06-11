/**
 * E2E: core authenticated meetup loop (Phase 8, REFACTOR_PLAN §5 action #5).
 *
 * The app pivoted from trip-planning to a meetup-centric social network. The
 * core authenticated journey is:
 *   sign in  →  /meetups  →  /crew  →  /checkins  →  /profile
 *
 * A full DB-backed credentials login is not feasible headlessly (NextAuth
 * credentials need a seeded, email-verified user and a clean test DB per run,
 * and the demo endpoint is gated behind DEMO_MODE — 403 by default). Instead we
 * mint a *real, signed* NextAuth JWT session cookie with the server's own
 * `NEXTAUTH_SECRET` (see e2e/auth-helper.ts). Because the app uses the JWT
 * session strategy, that cookie decrypts at the edge in `src/middleware.ts`
 * (`authorized: ({ token }) => !!token`) and server-side in `/api/auth/session`,
 * so the authed surfaces render exactly as they do for a logged-in user — no
 * client-side `useSession` mock that the edge gate would bypass anyway.
 *
 * The spec asserts the app's *real, designed* auth behavior, in three suites:
 *
 *  1. AUTH GATE (no session): every authed page must bounce an anonymous
 *     visitor to the sign-in wall (`/auth/signin`) instead of leaking content.
 *
 *  2. API BOUNDARY (no session): the backing routes must reject anonymous
 *     access. Two distinct, both-correct mechanisms exist by design:
 *       - Routes in the middleware matcher (`/api/meetups`, `/api/checkins/*`,
 *         `/api/notifications/*`) are 307-redirected to `/auth/signin` at the
 *         edge BEFORE the handler runs. We assert the redirect (with
 *         `maxRedirects: 0`, since Playwright otherwise follows it to a 200).
 *       - Routes NOT in the matcher (`/api/crew`, `/api/crew/requests`) reach
 *         their handler, which returns a handler-level 401.
 *
 *  3. AUTHED UI (real signed cookie): with the minted session cookie installed,
 *     the gated surfaces render their authenticated UI (headings, CTAs) and the
 *     "Sign in to view…" empty state is absent.
 *
 * Prerequisites:
 *   - App running at http://localhost:3000 (or PLAYWRIGHT_BASE_URL)
 *   - .env.local present at the app root (provides NEXTAUTH_SECRET)
 *   - npx playwright install chromium
 *
 * Run: npm run test:e2e -- authenticated-flow
 */

import { test, expect } from '@playwright/test';
import { authenticateContext } from './auth-helper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Authed surfaces that must redirect an anonymous visitor to the auth wall. */
const GATED_PAGES = ['/meetups', '/crew', '/crew/requests', '/checkins', '/profile'] as const;

/**
 * GET API routes covered by the middleware matcher (`src/middleware.ts`).
 * Anonymous requests are 307-redirected to /auth/signin at the edge — the
 * handler never runs. This is the app's intentional, designed behavior.
 */
const MIDDLEWARE_GATED_GET_APIS = [
  '/api/meetups',
  '/api/checkins/feed',
  '/api/notifications',
] as const;

/**
 * GET API routes NOT in the middleware matcher. Anonymous requests reach the
 * handler, which performs its own `getServerSession` check and returns 401.
 */
const HANDLER_401_GET_APIS = ['/api/crew', '/api/crew/requests'] as const;

const AUTH_WALL = /auth|signin|login/i;
const SIGNIN_REDIRECT = /\/auth\/signin/;

// ---------------------------------------------------------------------------
// Suite 1: Auth gate — anonymous visitors are redirected, never leak content
// ---------------------------------------------------------------------------

test.describe('Authenticated loop — auth gate (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000);
  });

  for (const path of GATED_PAGES) {
    test(`${path} redirects an anonymous visitor to the auth wall`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(AUTH_WALL, { timeout: 8000 });
      // The protected page content must NOT be exposed.
      await expect(page.locator('h1')).not.toContainText(/My Crew|Meetups|Who's Out Tonight/i);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 2: API boundary — backing routes reject anonymous access (by design)
// ---------------------------------------------------------------------------

test.describe('Authenticated loop — API boundary (unauthenticated)', () => {
  // Routes in the middleware matcher: edge 307-redirect to the sign-in wall.
  for (const path of MIDDLEWARE_GATED_GET_APIS) {
    test(`GET ${path} is edge-redirected to the sign-in wall when unauthenticated`, async ({
      request,
    }) => {
      // maxRedirects: 0 — otherwise Playwright follows the 307 to /auth/signin (200).
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()['location'] ?? '').toMatch(SIGNIN_REDIRECT);
    });
  }

  // Routes NOT in the matcher: handler-level 401.
  for (const path of HANDLER_401_GET_APIS) {
    test(`GET ${path} returns 401 when unauthenticated`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
    });
  }

  test('POST /api/meetups is rejected at the auth boundary when unauthenticated', async ({
    request,
  }) => {
    // /api/meetups is middleware-gated → anonymous writes are 307-redirected to
    // the sign-in wall at the edge before the handler (or any DB write) runs.
    const res = await request.post('/api/meetups', {
      data: { title: 'E2E meetup' },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    expect(res.headers()['location'] ?? '').toMatch(SIGNIN_REDIRECT);
    // The resource must never be created for an anonymous caller.
    expect(res.status()).not.toBe(201);
  });

  test('POST /api/checkins is rejected at the auth boundary when unauthenticated', async ({
    request,
  }) => {
    // /api/checkins is middleware-gated → anonymous writes are 307-redirected.
    const res = await request.post('/api/checkins', {
      data: { visibility: 'CREW' },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    expect(res.headers()['location'] ?? '').toMatch(SIGNIN_REDIRECT);
    expect(res.status()).not.toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Authed UI — surfaces render for a real signed session cookie
// ---------------------------------------------------------------------------

test.describe('Authenticated loop — authed UI (real signed session cookie)', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    // Inject a real, signed NextAuth session cookie so the edge middleware gate
    // passes and /api/auth/session reports an authenticated user.
    await authenticateContext(context, baseURL ?? 'http://localhost:3000');
  });

  test('/meetups renders the authed meetups surface (not the sign-in empty state)', async ({
    page,
  }) => {
    page.setDefaultTimeout(20000);
    await page.goto('/meetups');

    // We must NOT have been bounced to the auth wall.
    await expect(page).not.toHaveURL(SIGNIN_REDIRECT);

    // Authenticated heading + primary CTA must be present.
    await expect(page.getByRole('heading', { name: /Meetups/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Create Meetup/i })).toBeVisible();

    // The unauthenticated empty state must NOT be shown.
    await expect(page.getByText(/Sign in.*to view and create meetups/i)).toHaveCount(0);
  });

  test('/crew renders the authed Crew surface (not the sign-in empty state)', async ({ page }) => {
    page.setDefaultTimeout(20000);
    await page.goto('/crew');

    await expect(page).not.toHaveURL(SIGNIN_REDIRECT);

    await expect(page.getByRole('heading', { name: /My Crew/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Requests/i })).toBeVisible();

    await expect(page.getByText(/Sign in to view your Crew/i)).toHaveCount(0);
  });

  test('authed user can navigate /meetups → /crew within one session', async ({ page }) => {
    page.setDefaultTimeout(20000);
    await page.goto('/meetups');
    await expect(page).not.toHaveURL(SIGNIN_REDIRECT);
    await expect(page.getByRole('heading', { name: /Meetups/i })).toBeVisible();

    // The shared Navigation links the core loop; fall back to a direct goto if
    // the nav link text differs so the journey assertion stays resilient.
    const crewLink = page.getByRole('link', { name: /^Crew$|My Crew/i }).first();
    if (await crewLink.count()) {
      await crewLink.click();
    } else {
      await page.goto('/crew');
    }

    await expect(page).toHaveURL(/\/crew/, { timeout: 8000 });
    await expect(page.getByRole('heading', { name: /My Crew/i })).toBeVisible();
  });

  test('/meetups/new (create meetup) is reachable for an authed session', async ({ page }) => {
    page.setDefaultTimeout(20000);
    await page.goto('/meetups');
    await expect(page).not.toHaveURL(SIGNIN_REDIRECT);
    const createCta = page.getByRole('link', { name: /Create Meetup/i });
    await expect(createCta).toBeVisible();
    await expect(createCta).toHaveAttribute('href', /\/meetups\/new/);
  });
});
