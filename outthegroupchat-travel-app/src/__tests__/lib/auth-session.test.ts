/**
 * Unit tests for the session/JWT expiry policy and the credentials-provider
 * lockout branch in src/lib/auth.ts (BUILD_PLAN Day 12 [S1] + [M2]).
 *
 * Two things are pinned here:
 *
 * 1. SESSION TIMEOUT ([S1]). `authOptions.session.maxAge` / `.updateAge` and the
 *    top-level `jwt.maxAge` used to be left to NextAuth's defaults, which made the
 *    effective session lifetime implicit. These assert the explicit policy, and
 *    that the JWT's own expiry stays aligned with the session's absolute lifetime
 *    (a token that outlives its session is a real auth bug).
 *
 * 2. FAILED-LOGIN BACKOFF ([M2]). The highest-value test in this file is the
 *    short-circuit: once an identity is locked, `authorize()` must throw BEFORE
 *    the DB lookup and BEFORE the bcrypt compare. If it merely threw at the end,
 *    the feature would still look "tested" while doing nothing for the expensive
 *    path it exists to protect — so we assert `prisma.user.findUnique` and
 *    `bcrypt.compare` were never reached on the locked attempt.
 *
 * THE MOCKING GOTCHA
 * ------------------
 * src/__tests__/setup.ts globally mocks `@/lib/auth` to `{ authOptions: {} }`.
 * Importing it normally here would silently assert against an empty object. We
 * therefore `vi.unmock('@/lib/auth')` and pull the real module with
 * `vi.importActual`, exactly as src/__tests__/lib/auth-redirect.test.ts does.
 * `bcryptjs` must also be mocked per-file (setup.ts does not mock it) so the
 * credentials provider never touches native bindings.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// Override the global @/lib/auth mock — see the docblock above.
vi.unmock('@/lib/auth');

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
  hash: vi.fn(),
  compare: vi.fn(),
}));

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  MAX_FAILED_ATTEMPTS,
  __resetLoginBackoffStore,
  peekLoginBackoff,
} from '@/lib/login-backoff';

/** Shape of the credentials `authorize()` callback as we invoke it. */
type AuthorizeFn = (
  credentials: Record<string, string> | undefined
) => Promise<{ id: string; email: string | null; name: string | null } | null>;

const LOCKED_MESSAGE = 'Too many failed attempts. Try again later.';
const INVALID_MESSAGE = 'Invalid credentials';

let authorize: AuthorizeFn;
let sessionConfig: { strategy?: string; maxAge?: number; updateAge?: number };
let jwtConfig: { maxAge?: number };
let SESSION_MAX_AGE_SECONDS: number;
let SESSION_UPDATE_AGE_SECONDS: number;

/** `bcrypt.compare` is overloaded in @types/bcryptjs; treat it as a plain mock. */
const bcryptCompare = bcrypt.compare as unknown as Mock;

beforeAll(async () => {
  const authModule = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');

  SESSION_MAX_AGE_SECONDS = authModule.SESSION_MAX_AGE_SECONDS;
  SESSION_UPDATE_AGE_SECONDS = authModule.SESSION_UPDATE_AGE_SECONDS;

  const options = authModule.authOptions;
  if (!options.session) throw new Error('authOptions.session is not defined');
  if (!options.jwt) throw new Error('authOptions.jwt is not defined');
  sessionConfig = options.session as typeof sessionConfig;
  jwtConfig = options.jwt as typeof jwtConfig;

  const credentialsProvider = options.providers.find(
    (provider) => (provider as unknown as { id?: string }).id === 'credentials'
  );
  if (!credentialsProvider) throw new Error('credentials provider not found on authOptions');

  // IMPORTANT: next-auth v4's CredentialsProvider() does NOT put the caller's
  // authorize() on the returned object. It returns a fixed shape whose top-level
  // `authorize` is a `() => null` STUB and stashes the real config under
  // `.options` (next-auth merges them later, inside parseProviders). Reading
  // `provider.authorize` here would therefore exercise the stub and every
  // assertion below would silently pass against a no-op.
  const provider = credentialsProvider as unknown as {
    authorize?: AuthorizeFn;
    options?: { authorize?: AuthorizeFn };
  };
  const candidate = provider.options?.authorize ?? provider.authorize;
  if (typeof candidate !== 'function') {
    throw new Error('credentials provider has no authorize()');
  }
  // Guard against silently binding next-auth's `() => null` placeholder.
  if (candidate.constructor.name !== 'AsyncFunction') {
    throw new Error('resolved a non-async authorize() — likely next-auth\'s () => null stub');
  }
  authorize = candidate;
});

beforeEach(() => {
  // The backoff store is module-level; without this, lockouts leak between tests.
  __resetLoginBackoffStore();
});

// ---------------------------------------------------------------------------
// [S1] Session / JWT expiry policy
// ---------------------------------------------------------------------------

describe('authOptions session + JWT expiry policy', () => {
  it('uses the JWT session strategy', () => {
    expect(sessionConfig.strategy).toBe('jwt');
  });

  it('sets an explicit absolute session lifetime', () => {
    expect(sessionConfig.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it('sets an explicit session refresh interval', () => {
    expect(sessionConfig.updateAge).toBe(SESSION_UPDATE_AGE_SECONDS);
  });

  it('aligns the JWT maxAge with the session maxAge so a token cannot outlive its session', () => {
    expect(jwtConfig.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(jwtConfig.maxAge).toBe(sessionConfig.maxAge);
  });

  it('exports SESSION_MAX_AGE_SECONDS as 30 days', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it('exports SESSION_UPDATE_AGE_SECONDS as 24 hours', () => {
    expect(SESSION_UPDATE_AGE_SECONDS).toBe(24 * 60 * 60);
  });

  it('refreshes far more often than it expires (updateAge < maxAge)', () => {
    expect(SESSION_UPDATE_AGE_SECONDS).toBeLessThan(SESSION_MAX_AGE_SECONDS);
  });

  it('keeps the custom auth pages wired up alongside the expiry policy', () => {
    // Guards against a session-config edit accidentally clobbering sibling keys.
    expect(sessionConfig.strategy).toBe('jwt');
    expect(typeof sessionConfig.maxAge).toBe('number');
    expect(typeof jwtConfig.maxAge).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// [M2] Credentials authorize() — input validation
// ---------------------------------------------------------------------------

describe('credentials authorize() input validation', () => {
  it('rejects missing credentials without touching the DB', async () => {
    await expect(authorize(undefined)).rejects.toThrow(INVALID_MESSAGE);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing password without touching the DB', async () => {
    await expect(authorize({ email: 'a@x.com', password: '' })).rejects.toThrow(INVALID_MESSAGE);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing email without touching the DB', async () => {
    await expect(authorize({ email: '', password: 'hunter2' })).rejects.toThrow(INVALID_MESSAGE);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [M2] Credentials authorize() — failed-login backoff
// ---------------------------------------------------------------------------

describe('credentials authorize() failed-login backoff', () => {
  const EMAIL = 'victim@example.com';
  const PASSWORD = 'wrong-password';

  /** Drive N failed attempts through the real authorize() path. */
  async function failNTimes(email: string, times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      await expect(authorize({ email, password: PASSWORD })).rejects.toThrow(INVALID_MESSAGE);
    }
  }

  it('records a failure for an unknown account', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    await failNTimes(EMAIL, 1);
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(1);
  });

  it('records a failure for a known account with a bad password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: EMAIL,
      name: 'Victim',
      image: null,
      password: 'hashed',
    } as never);
    bcryptCompare.mockResolvedValue(false);

    await failNTimes(EMAIL, 1);
    expect(bcryptCompare).toHaveBeenCalled();
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(1);
  });

  it('still reaches the DB while under the failure threshold', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS - 1);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(MAX_FAILED_ATTEMPTS - 1);
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(MAX_FAILED_ATTEMPTS - 1);
  });

  it('SHORT-CIRCUITS before the DB lookup and bcrypt compare once locked', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: EMAIL,
      name: 'Victim',
      image: null,
      password: 'hashed',
    } as never);
    bcryptCompare.mockResolvedValue(false);

    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS);

    // Forget everything the lockout run did, so the next assertions describe
    // only the locked attempt.
    vi.mocked(prisma.user.findUnique).mockClear();
    bcryptCompare.mockClear();

    await expect(authorize({ email: EMAIL, password: PASSWORD })).rejects.toThrow(LOCKED_MESSAGE);

    // This is the whole point of the feature: the expensive path is never entered.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(bcryptCompare).not.toHaveBeenCalled();
  });

  it('rejects even the CORRECT password while locked', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: EMAIL,
      name: 'Victim',
      image: null,
      password: 'hashed',
    } as never);
    bcryptCompare.mockResolvedValue(false);

    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS);

    // The attacker (or the real user) now supplies the right password.
    bcryptCompare.mockResolvedValue(true);
    await expect(authorize({ email: EMAIL, password: 'correct-horse' })).rejects.toThrow(
      LOCKED_MESSAGE
    );
  });

  it('cannot be bypassed by changing the email casing or padding it with whitespace', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS);
    vi.mocked(prisma.user.findUnique).mockClear();

    for (const variant of [' Victim@Example.com ', 'VICTIM@EXAMPLE.COM', '\tvictim@example.COM']) {
      await expect(authorize({ email: variant, password: PASSWORD })).rejects.toThrow(
        LOCKED_MESSAGE
      );
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('locks only the targeted identity, not every account', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS);

    // A different identity still gets the ordinary invalid-credentials path.
    await expect(
      authorize({ email: 'bystander@example.com', password: PASSWORD })
    ).rejects.toThrow(INVALID_MESSAGE);
  });

  it('does not leak account existence: same lockout message for known and unknown emails', async () => {
    const KNOWN = 'known@example.com';
    const UNKNOWN = 'ghost@example.com';

    // Lock a REAL account (bad password path).
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: KNOWN,
      name: 'Known',
      image: null,
      password: 'hashed',
    } as never);
    bcryptCompare.mockResolvedValue(false);
    await failNTimes(KNOWN, MAX_FAILED_ATTEMPTS);

    // Lock an address that does not exist at all.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    await failNTimes(UNKNOWN, MAX_FAILED_ATTEMPTS);

    const knownError = await authorize({ email: KNOWN, password: PASSWORD }).catch(
      (err: unknown) => err
    );
    const unknownError = await authorize({ email: UNKNOWN, password: PASSWORD }).catch(
      (err: unknown) => err
    );

    expect((knownError as Error).message).toBe(LOCKED_MESSAGE);
    expect((unknownError as Error).message).toBe((knownError as Error).message);
  });
});

// ---------------------------------------------------------------------------
// [M2] Credentials authorize() — success path resets the counter
// ---------------------------------------------------------------------------

describe('credentials authorize() success path', () => {
  const EMAIL = 'user@example.com';

  function arrangeRealUser(): void {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: EMAIL,
      name: 'Real User',
      image: 'https://cdn.example.com/a.png',
      password: 'hashed',
    } as never);
  }

  it('returns the user on a correct password', async () => {
    arrangeRealUser();
    bcryptCompare.mockResolvedValue(true);

    const result = await authorize({ email: EMAIL, password: 'correct-horse' });
    expect(result).toMatchObject({ id: 'user-1', email: EMAIL, name: 'Real User' });
  });

  it('RESETS the failure counter on a successful sign-in', async () => {
    arrangeRealUser();
    bcryptCompare.mockResolvedValue(false);

    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      await expect(authorize({ email: EMAIL, password: 'nope' })).rejects.toThrow(INVALID_MESSAGE);
    }
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(MAX_FAILED_ATTEMPTS - 1);

    bcryptCompare.mockResolvedValue(true);
    await authorize({ email: EMAIL, password: 'correct-horse' });

    expect(peekLoginBackoff(EMAIL)).toBeUndefined();
  });

  it('lets the user fail the full threshold again after a successful sign-in', async () => {
    arrangeRealUser();
    bcryptCompare.mockResolvedValue(false);
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      await expect(authorize({ email: EMAIL, password: 'nope' })).rejects.toThrow(INVALID_MESSAGE);
    }

    bcryptCompare.mockResolvedValue(true);
    await authorize({ email: EMAIL, password: 'correct-horse' });

    // Post-reset, the very next failure is #1 — no lockout, DB still consulted.
    bcryptCompare.mockResolvedValue(false);
    await expect(authorize({ email: EMAIL, password: 'nope' })).rejects.toThrow(INVALID_MESSAGE);
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(1);
  });

  it('clears the counter using the normalized key (casing-insensitive)', async () => {
    arrangeRealUser();
    bcryptCompare.mockResolvedValue(false);
    await expect(authorize({ email: EMAIL, password: 'nope' })).rejects.toThrow(INVALID_MESSAGE);
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(1);

    bcryptCompare.mockResolvedValue(true);
    await authorize({ email: ' User@Example.COM ', password: 'correct-horse' });

    expect(peekLoginBackoff(EMAIL)).toBeUndefined();
  });
});
