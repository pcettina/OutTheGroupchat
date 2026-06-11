/**
 * E2E auth helper: mint a real, signed NextAuth JWT session cookie so Playwright
 * tests can pass the middleware edge gate (`authorized: ({ token }) => !!token`)
 * without a DB-backed credentials login.
 *
 * The app uses the NextAuth v4 JWT session strategy. The edge middleware calls
 * `getToken()` which JWE-decrypts the `next-auth.session-token` cookie using
 * `NEXTAUTH_SECRET`. By encoding a token with the *same* secret the running
 * server uses, the cookie decodes server-side and the page passes the gate; the
 * server-rendered `/api/auth/session` then reports an authenticated user, so the
 * client `useSession()` resolves to a real session too.
 *
 * NEXTAUTH_SECRET is loaded from `.env.local` via `@next/env` (the same loader
 * Next.js uses), so the secret matches the dev/prod server byte-for-byte —
 * including the trailing CRLF present in this project's `.env.local`.
 */
import { resolve } from 'node:path';
import * as nextEnv from '@next/env';
import { encode } from 'next-auth/jwt';
import type { BrowserContext } from '@playwright/test';

// Playwright resolves this file relative to the app root (testDir: './e2e'), so
// `__dirname` is .../app/e2e and the app root is one level up. Avoid
// `import.meta` — the project tsconfig compiles e2e to CommonJS.
const APP_ROOT = resolve(__dirname, '..');

// Load .env / .env.local exactly as the Next.js server does so NEXTAUTH_SECRET
// is identical to the running server's. Idempotent across imports.
nextEnv.loadEnvConfig(APP_ROOT, true);

/**
 * In NextAuth v4 the session-token cookie is named `__Secure-next-auth.session-token`
 * over HTTPS and `next-auth.session-token` over plain HTTP. E2E runs against
 * http://localhost:3000, so the non-secure name is correct.
 */
export const SESSION_COOKIE_NAME = 'next-auth.session-token';

export interface E2EUser {
  id: string;
  name: string;
  email: string;
}

export const E2E_USER: E2EUser = {
  id: 'e2e-user-id',
  name: 'E2E Test User',
  email: 'e2e@example.com',
};

/**
 * Encode a signed NextAuth JWT (JWE) for the given user, valid for `maxAgeSec`.
 * Shape mirrors what the app's `jwt` callback produces (id/name/email/sub) so
 * the `session` callback populates `session.user.id` and `session.user.name`.
 */
export async function mintSessionToken(
  user: E2EUser = E2E_USER,
  maxAgeSec = 60 * 60
): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      'NEXTAUTH_SECRET is not set — cannot mint an E2E session cookie. ' +
        'Ensure .env.local exists at the app root.'
    );
  }
  return encode({
    token: {
      id: user.id,
      name: user.name,
      email: user.email,
      sub: user.id,
    },
    secret,
    maxAge: maxAgeSec,
  });
}

/**
 * Add a real signed session cookie to a Playwright browser context so every
 * navigation in that context is authenticated at the edge. Call before `goto`.
 *
 * @param baseURL the app origin (e.g. http://localhost:3000) — used for the
 *   cookie domain/path.
 */
export async function authenticateContext(
  context: BrowserContext,
  baseURL: string,
  user: E2EUser = E2E_USER
): Promise<void> {
  const token = await mintSessionToken(user);
  const { hostname } = new URL(baseURL);
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: hostname,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
}
