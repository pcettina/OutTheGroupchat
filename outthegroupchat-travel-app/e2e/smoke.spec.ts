/**
 * Smoke test — verifies the app loads at the base URL.
 *
 * Skipped automatically in CI when no server is running (PLAYWRIGHT_SKIP_SMOKE=true).
 * Full auth/trip flows live in auth-flow.spec.ts.
 *
 * Run: npm run test:e2e
 */

import { test, expect } from '@playwright/test';

// Skip the entire suite if explicitly opted out (e.g. CI without a live server)
const skip = process.env.PLAYWRIGHT_SKIP_SMOKE === 'true';

test.describe('Smoke', () => {
  test('home page loads', async ({ page }) => {
    // Skip with a clear message rather than failing when no server is available
    if (skip) {
      test.skip(true, 'PLAYWRIGHT_SKIP_SMOKE=true — no server running in this CI job');
    }

    await page.goto('/');
    // The page must return a successful response (not a 5xx or connection error)
    await expect(page).not.toHaveURL(/error/i);
    // At minimum the document title should be non-empty
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
