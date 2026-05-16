/**
 * Unit tests for the NextAuth `redirect` callback in src/lib/auth.ts.
 *
 * Why this exists
 * ---------------
 * Real users were briefly hitting a 404 right after signing in. The cause was a
 * combination of:
 *   1. The signin page hard-coded `/trips` as the post-auth fallback, but
 *      `/trips` was removed during the meetup pivot (PR series #43–#56).
 *   2. NextAuth's default redirect callback returns `baseUrl` (i.e. `/`) when
 *      called with no destination, which then re-renders the marketing home —
 *      jarring after a successful sign-in.
 *
 * The fix is a custom `redirect` callback on `authOptions` that:
 *   - Steers bare base-URL redirects to `/heatmap` (the v1 default surface).
 *   - Maps any reference to a removed legacy path (`/trips`, `/dashboard`) to
 *     `/heatmap` so stale callbackUrls do not 404.
 *   - Honors any other same-origin path (so deep-link callbackUrls still work).
 *   - Refuses cross-origin URLs (open-redirect guard).
 *
 * These tests exercise that callback directly. We pull `authOptions` from
 * `@/lib/auth`, then invoke `authOptions.callbacks.redirect` with the same
 * arg shape NextAuth would pass.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// IMPORTANT: src/__tests__/setup.ts globally mocks @/lib/auth to return
// `{ authOptions: {} }` so route handler tests do not need real providers.
// For *this* test we need the real authOptions object so we can exercise the
// redirect callback. Override the global mock by un-mocking before import.
vi.unmock('@/lib/auth');

// Prisma is mocked in setup.ts; lib/auth pulls in PrismaAdapter at module-load
// so we must keep that mock intact. bcryptjs is similarly mocked here so
// nothing in the credentials provider tries to load native bindings.
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
  hash: vi.fn(),
  compare: vi.fn(),
}));

const { authOptions, POST_SIGNIN_DEFAULT_PATH } = await vi.importActual<
  typeof import('@/lib/auth')
>('@/lib/auth');

const BASE_URL = 'https://outthegroupchat.com';

type RedirectArgs = { url: string; baseUrl: string };
type RedirectFn = (args: RedirectArgs) => Promise<string> | string;

let redirect: RedirectFn;

beforeAll(() => {
  if (!authOptions.callbacks?.redirect) {
    throw new Error('authOptions.callbacks.redirect is not defined');
  }
  redirect = authOptions.callbacks.redirect as RedirectFn;
});

describe('authOptions.callbacks.redirect', () => {
  it('exports POST_SIGNIN_DEFAULT_PATH as /heatmap (the v1 landing surface)', () => {
    expect(POST_SIGNIN_DEFAULT_PATH).toBe('/heatmap');
  });

  it('redirects to /heatmap when called with bare baseUrl (no destination)', async () => {
    const result = await redirect({ url: BASE_URL, baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/heatmap`);
  });

  it('redirects to /heatmap when called with baseUrl + trailing slash', async () => {
    const result = await redirect({ url: `${BASE_URL}/`, baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/heatmap`);
  });

  it('redirects to /heatmap when given the legacy /trips path', async () => {
    const result = await redirect({ url: '/trips', baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/heatmap`);
  });

  it('redirects to /heatmap when given the legacy /dashboard path', async () => {
    const result = await redirect({ url: '/dashboard', baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/heatmap`);
  });

  it('redirects to /heatmap when given an absolute URL pointing at /trips', async () => {
    const result = await redirect({ url: `${BASE_URL}/trips`, baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/heatmap`);
  });

  it('honors a same-origin relative path that still exists (e.g. /intents)', async () => {
    const result = await redirect({ url: '/intents', baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/intents`);
  });

  it('honors a same-origin relative path with query params', async () => {
    const result = await redirect({ url: '/heatmap?city=nyc', baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/heatmap?city=nyc`);
  });

  it('honors a same-origin absolute URL', async () => {
    const result = await redirect({ url: `${BASE_URL}/checkins`, baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/checkins`);
  });

  it('rejects cross-origin absolute URLs and falls back to /heatmap (open-redirect guard)', async () => {
    const result = await redirect({ url: 'https://evil.example.com/steal', baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/heatmap`);
  });

  it('rejects protocol-relative //evil.example.com URLs (open-redirect guard)', async () => {
    // The slash test in the implementation uses startsWith('/'), so we additionally
    // make sure a protocol-relative URL does NOT smuggle through as a "relative path".
    // It will fail URL parsing without a base, and the catch returns the default.
    const result = await redirect({ url: '//evil.example.com/steal', baseUrl: BASE_URL });
    // Either /heatmap (from the cross-origin branch) or evil.example.com is a fail —
    // the only safe answer is the default.
    expect(result).toBe(`${BASE_URL}/heatmap`);
  });

  it('falls back to /heatmap for malformed URLs that fail to parse', async () => {
    const result = await redirect({ url: 'not a real url', baseUrl: BASE_URL });
    expect(result).toBe(`${BASE_URL}/heatmap`);
  });
});
