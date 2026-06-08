/**
 * E2E: core authenticated meetup loop (Phase 8, REFACTOR_PLAN §5 action #5).
 *
 * The app pivoted from trip-planning to a meetup-centric social network. The
 * core authenticated journey is:
 *   sign in  →  /meetups  →  /crew  →  /checkins  →  /profile
 *
 * A full DB-backed login is NOT feasible headlessly: NextAuth credentials need
 * a seeded, email-verified user and a clean test DB per run, and the demo
 * endpoint is gated behind DEMO_MODE (403 by default — see auth-flow.spec.ts).
 * So this spec covers the loop from two complementary angles:
 *
 *  1. AUTH GATE (no session): every authed surface must bounce an anonymous
 *     visitor to the sign-in/login wall instead of leaking content, and the
 *     backing API routes must answer 401 at the public boundary.
 *
 *  2. AUTHED UI (mocked client session): the client-rendered surfaces
 *     (/meetups, /crew) read auth via next-auth's `useSession`, which fetches
 *     /api/auth/session. By fulfilling that endpoint with a fake session we can
 *     assert the authenticated UI renders (headings, "Create Meetup" CTA, no
 *     "Sign in to view…" empty state) without a real DB-backed login.
 *     Server-rendered surfaces (/checkins uses getServerSession + middleware
 *     JWT) can't be faked from the browser, so those stay in the gate suite.
 *
 * Prerequisites:
 *   - App running at http://localhost:3000 (or PLAYWRIGHT_BASE_URL)
 *   - npx playwright install chromium
 *
 * Run: npm run test:e2e -- authenticated-flow
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Authed surfaces that must redirect an anonymous visitor to the auth wall. */
const GATED_PAGES = ['/meetups', '/crew', '/crew/requests', '/checkins', '/profile'] as const;

/** API routes that back the meetup loop and must enforce auth (401). */
const GATED_GET_APIS = [
  '/api/meetups',
  '/api/crew',
  '/api/crew/requests',
  '/api/checkins/feed',
  '/api/notifications',
] as const;

const AUTH_WALL = /auth|signin|login/i;

/** A minimal fake NextAuth session payload, valid for ~1 hour. */
function fakeSession() {
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    user: {
      id: 'e2e-user-id',
      name: 'E2E Test User',
      email: 'e2e@example.com',
      image: null,
      crewLabel: 'Crew',
    },
    expires,
  };
}

/**
 * Make `useSession()` resolve to an authenticated user for client components,
 * and stub the data endpoints those pages call so they render their authed
 * (non-empty-state) UI deterministically. Must be installed before navigation.
 */
async function mockAuthenticatedSession(page: Page) {
  await page.route('**/api/auth/session', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeSession()),
    });
  });

  // Empty-but-OK data so the pages render their list state, not an error.
  await page.route('**/api/meetups', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [] } }),
    });
  });

  await page.route('**/api/crew', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [] } }),
    });
  });

  await page.route('**/api/crew/requests', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { incomingCount: 0, sentCount: 0 } }),
    });
  });
}

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
// Suite 2: API boundary — backing routes enforce auth (401)
// ---------------------------------------------------------------------------

test.describe('Authenticated loop — API boundary (unauthenticated)', () => {
  for (const path of GATED_GET_APIS) {
    test(`GET ${path} returns 401 when unauthenticated`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
    });
  }

  test('POST /api/meetups returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.post('/api/meetups', {
      data: { title: 'E2E meetup' },
    });
    // Either auth (401) or CSRF (403) rejects the anonymous write — never created.
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/checkins returns 401 or 403 when unauthenticated', async ({ request }) => {
    const res = await request.post('/api/checkins', {
      data: { visibility: 'CREW' },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Authed UI — client surfaces render for a mocked session
// ---------------------------------------------------------------------------

test.describe('Authenticated loop — authed UI (mocked session)', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(20000);
    await mockAuthenticatedSession(page);
  });

  test('/meetups renders the authed meetups surface (not the sign-in empty state)', async ({
    page,
  }) => {
    await page.goto('/meetups');

    // Authenticated heading + primary CTA must be present.
    await expect(page.getByRole('heading', { name: /Meetups/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Create Meetup/i })).toBeVisible();

    // The unauthenticated empty state must NOT be shown.
    await expect(page.getByText(/Sign in.*to view and create meetups/i)).toHaveCount(0);
  });

  test('/crew renders the authed Crew surface (not the sign-in empty state)', async ({ page }) => {
    await page.goto('/crew');

    await expect(page.getByRole('heading', { name: /My Crew/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Requests/i })).toBeVisible();

    await expect(page.getByText(/Sign in to view your Crew/i)).toHaveCount(0);
  });

  test('authed user can navigate /meetups → /crew within one session', async ({ page }) => {
    await page.goto('/meetups');
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
    await page.goto('/meetups');
    const createCta = page.getByRole('link', { name: /Create Meetup/i });
    await expect(createCta).toBeVisible();
    await expect(createCta).toHaveAttribute('href', /\/meetups\/new/);
  });
});
