/**
 * Unit tests for src/lib/login-backoff.ts — the failed-login throttle behind the
 * NextAuth credentials provider (BUILD_PLAN Day 12 [M2]).
 *
 * Testing strategy
 * ----------------
 * Every entry point takes an injectable `now` (defaulting to `Date.now()`), so time
 * is driven by PASSING timestamps rather than with fake timers. That keeps these
 * tests deterministic and free of timer-mock ordering hazards.
 *
 * The module owns a process-level `Map`, so `__resetLoginBackoffStore()` runs in
 * `beforeEach` — without it, state leaks between tests and lockouts appear to
 * "already exist" in unrelated cases.
 *
 * The security-relevant properties pinned here:
 *   - A lockout cannot be bypassed by varying the case/whitespace of the email.
 *   - Hammering a locked identity EXTENDS the lock rather than draining it.
 *   - Serving the full lockout wipes the slate (no permanent lock).
 *   - A successful sign-in resets the counter.
 *   - Isolated old failures decay and cannot accumulate into a later lockout.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MS,
  ATTEMPT_WINDOW_MS,
  MAX_TRACKED_KEYS,
  normalizeLoginKey,
  isBackoffExpired,
  isLocked,
  lockoutRemainingMs,
  recordFailure,
  checkLoginBackoff,
  registerFailedLogin,
  clearLoginBackoff,
  peekLoginBackoff,
  __resetLoginBackoffStore,
  type BackoffState,
} from '@/lib/login-backoff';

/** Fixed, readable epoch anchor: 2026-01-01T00:00:00.000Z. */
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0, 0);

beforeEach(() => {
  __resetLoginBackoffStore();
});

describe('login-backoff constants', () => {
  it('trips a lockout after 5 failures', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
  });

  it('locks out for 15 minutes', () => {
    expect(LOCKOUT_MS).toBe(15 * 60 * 1000);
    expect(LOCKOUT_MS).toBe(900_000);
  });

  it('counts failures over a 15 minute rolling window', () => {
    expect(ATTEMPT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(ATTEMPT_WINDOW_MS).toBe(900_000);
  });

  it('bounds the tracked identity set at 10,000 keys', () => {
    expect(MAX_TRACKED_KEYS).toBe(10_000);
  });
});

describe('normalizeLoginKey', () => {
  it('lowercases the email', () => {
    expect(normalizeLoginKey('A@X.com')).toBe('a@x.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLoginKey('  a@x.com  ')).toBe('a@x.com');
  });

  it('collapses case + whitespace variants onto one bucket key', () => {
    const variants = [' A@X.com ', 'a@x.com', 'A@X.COM', '\ta@X.Com\n'];
    const keys = variants.map(normalizeLoginKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('a@x.com');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeLoginKey('')).toBe('');
  });

  it('does not alter an already-normalized email', () => {
    expect(normalizeLoginKey('user@example.com')).toBe('user@example.com');
  });
});

describe('isBackoffExpired', () => {
  it('treats a missing entry as expired', () => {
    expect(isBackoffExpired(undefined, T0)).toBe(true);
  });

  it('is false while a lockout is still running', () => {
    const state: BackoffState = {
      failures: MAX_FAILED_ATTEMPTS,
      firstFailureAt: T0,
      lockedUntil: T0 + LOCKOUT_MS,
    };
    expect(isBackoffExpired(state, T0 + LOCKOUT_MS - 1)).toBe(false);
  });

  it('is true the instant a lockout elapses (serving the lockout resets the slate)', () => {
    const state: BackoffState = {
      failures: MAX_FAILED_ATTEMPTS,
      firstFailureAt: T0,
      lockedUntil: T0 + LOCKOUT_MS,
    };
    expect(isBackoffExpired(state, T0 + LOCKOUT_MS)).toBe(true);
  });

  it('is false for an un-locked entry still inside the attempt window', () => {
    const state: BackoffState = { failures: 2, firstFailureAt: T0, lockedUntil: null };
    expect(isBackoffExpired(state, T0 + ATTEMPT_WINDOW_MS - 1)).toBe(false);
  });

  it('is true for an un-locked entry once the attempt window has elapsed', () => {
    const state: BackoffState = { failures: 2, firstFailureAt: T0, lockedUntil: null };
    expect(isBackoffExpired(state, T0 + ATTEMPT_WINDOW_MS)).toBe(true);
  });
});

describe('isLocked / lockoutRemainingMs', () => {
  const locked: BackoffState = {
    failures: MAX_FAILED_ATTEMPTS,
    firstFailureAt: T0,
    lockedUntil: T0 + LOCKOUT_MS,
  };

  it('reports not-locked for a missing entry', () => {
    expect(isLocked(undefined, T0)).toBe(false);
    expect(lockoutRemainingMs(undefined, T0)).toBe(0);
  });

  it('reports not-locked for an entry with failures but no lockout', () => {
    const partial: BackoffState = { failures: 3, firstFailureAt: T0, lockedUntil: null };
    expect(isLocked(partial, T0)).toBe(false);
    expect(lockoutRemainingMs(partial, T0)).toBe(0);
  });

  it('reports locked, with the full lockout remaining, at the moment of locking', () => {
    expect(isLocked(locked, T0)).toBe(true);
    expect(lockoutRemainingMs(locked, T0)).toBe(LOCKOUT_MS);
  });

  it('counts the remaining time down as the lockout runs', () => {
    expect(lockoutRemainingMs(locked, T0 + 60_000)).toBe(LOCKOUT_MS - 60_000);
    expect(lockoutRemainingMs(locked, T0 + LOCKOUT_MS - 1)).toBe(1);
  });

  it('reports not-locked exactly when the lockout elapses (boundary is exclusive)', () => {
    expect(isLocked(locked, T0 + LOCKOUT_MS)).toBe(false);
    expect(lockoutRemainingMs(locked, T0 + LOCKOUT_MS)).toBe(0);
  });
});

describe('recordFailure (pure reducer)', () => {
  it('starts a fresh counter when there is no prior state', () => {
    const next = recordFailure(undefined, T0);
    expect(next).toEqual({ failures: 1, firstFailureAt: T0, lockedUntil: null });
  });

  it('increments and preserves the original firstFailureAt', () => {
    const first = recordFailure(undefined, T0);
    const second = recordFailure(first, T0 + 1_000);
    expect(second.failures).toBe(2);
    expect(second.firstFailureAt).toBe(T0);
    expect(second.lockedUntil).toBeNull();
  });

  it('does not mutate the input state', () => {
    const state: BackoffState = { failures: 1, firstFailureAt: T0, lockedUntil: null };
    const snapshot = { ...state };
    recordFailure(state, T0 + 500);
    expect(state).toEqual(snapshot);
  });

  it('stays unlocked through the first MAX_FAILED_ATTEMPTS - 1 failures', () => {
    let state: BackoffState | undefined;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      state = recordFailure(state, T0 + i);
    }
    expect(state?.failures).toBe(MAX_FAILED_ATTEMPTS - 1);
    expect(state?.lockedUntil).toBeNull();
  });

  it('locks on the MAX_FAILED_ATTEMPTS-th failure, stamped from now', () => {
    let state: BackoffState | undefined;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      state = recordFailure(state, T0);
    }
    const locked = recordFailure(state, T0 + 5_000);
    expect(locked.failures).toBe(MAX_FAILED_ATTEMPTS);
    expect(locked.lockedUntil).toBe(T0 + 5_000 + LOCKOUT_MS);
  });

  it('EXTENDS the lock when a failure arrives during an active lockout', () => {
    const locked: BackoffState = {
      failures: MAX_FAILED_ATTEMPTS,
      firstFailureAt: T0,
      lockedUntil: T0 + LOCKOUT_MS,
    };
    // Hammering a locked account must not drain the lock — it re-stamps from `now`.
    const hammeredAt = T0 + LOCKOUT_MS - 1;
    const next = recordFailure(locked, hammeredAt);
    expect(next.failures).toBe(MAX_FAILED_ATTEMPTS + 1);
    expect(next.lockedUntil).toBe(hammeredAt + LOCKOUT_MS);
    expect(next.lockedUntil as number).toBeGreaterThan(locked.lockedUntil as number);
  });

  it('restarts the counter at 1 once a lockout has fully elapsed', () => {
    const locked: BackoffState = {
      failures: MAX_FAILED_ATTEMPTS,
      firstFailureAt: T0,
      lockedUntil: T0 + LOCKOUT_MS,
    };
    const after = recordFailure(locked, T0 + LOCKOUT_MS);
    expect(after).toEqual({ failures: 1, firstFailureAt: T0 + LOCKOUT_MS, lockedUntil: null });
  });

  it('restarts the counter at 1 once the attempt window has decayed', () => {
    const stale: BackoffState = { failures: 3, firstFailureAt: T0, lockedUntil: null };
    const after = recordFailure(stale, T0 + ATTEMPT_WINDOW_MS);
    expect(after).toEqual({ failures: 1, firstFailureAt: T0 + ATTEMPT_WINDOW_MS, lockedUntil: null });
  });
});

describe('checkLoginBackoff / registerFailedLogin (store-backed)', () => {
  const EMAIL = 'victim@example.com';

  it('reports an unknown identity as unlocked', () => {
    expect(checkLoginBackoff(EMAIL, T0)).toEqual({ locked: false, retryAfterMs: 0 });
  });

  it('stays unlocked for MAX_FAILED_ATTEMPTS - 1 failures', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      registerFailedLogin(EMAIL, T0 + i);
    }
    const check = checkLoginBackoff(EMAIL, T0 + MAX_FAILED_ATTEMPTS);
    expect(check.locked).toBe(false);
    expect(check.retryAfterMs).toBe(0);
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(MAX_FAILED_ATTEMPTS - 1);
  });

  it('locks on the MAX_FAILED_ATTEMPTS-th failure and reports the full retryAfterMs', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin(EMAIL, T0);
    }
    const check = checkLoginBackoff(EMAIL, T0);
    expect(check.locked).toBe(true);
    expect(check.retryAfterMs).toBe(LOCKOUT_MS);
  });

  it('counts retryAfterMs down while the lockout runs', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin(EMAIL, T0);
    }
    expect(checkLoginBackoff(EMAIL, T0 + 60_000).retryAfterMs).toBe(LOCKOUT_MS - 60_000);
  });

  it('fully resets the identity once the lockout has been served', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin(EMAIL, T0);
    }
    const check = checkLoginBackoff(EMAIL, T0 + LOCKOUT_MS);
    expect(check).toEqual({ locked: false, retryAfterMs: 0 });
    // The entry is dropped on read, not merely reported as unlocked.
    expect(peekLoginBackoff(EMAIL)).toBeUndefined();
  });

  it('requires a full fresh set of failures to re-lock after a served lockout', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin(EMAIL, T0);
    }
    const resumeAt = T0 + LOCKOUT_MS;
    registerFailedLogin(EMAIL, resumeAt);
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(1);
    expect(checkLoginBackoff(EMAIL, resumeAt).locked).toBe(false);
  });

  it('EXTENDS an active lockout when the attacker keeps hammering', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin(EMAIL, T0);
    }
    // One more failure 1s before the original lock would have expired.
    const hammeredAt = T0 + LOCKOUT_MS - 1_000;
    registerFailedLogin(EMAIL, hammeredAt);

    // At the ORIGINAL expiry the identity is still locked.
    const check = checkLoginBackoff(EMAIL, T0 + LOCKOUT_MS);
    expect(check.locked).toBe(true);
    expect(check.retryAfterMs).toBe(LOCKOUT_MS - 1_000);
  });

  it('does not let isolated, decayed failures accumulate into a later lockout', () => {
    // One failure far in the past...
    registerFailedLogin(EMAIL, T0);
    // ...then MAX_FAILED_ATTEMPTS - 1 failures after the window has rolled over.
    const later = T0 + ATTEMPT_WINDOW_MS + 1;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      registerFailedLogin(EMAIL, later + i);
    }
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(MAX_FAILED_ATTEMPTS - 1);
    expect(checkLoginBackoff(EMAIL, later + MAX_FAILED_ATTEMPTS).locked).toBe(false);
  });

  it('keeps separate identities in separate buckets', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin(EMAIL, T0);
    }
    expect(checkLoginBackoff(EMAIL, T0).locked).toBe(true);
    expect(checkLoginBackoff('someone-else@example.com', T0).locked).toBe(false);
  });
});

describe('lockout cannot be bypassed by email casing or whitespace', () => {
  it('shares one bucket across case/whitespace variants when accumulating failures', () => {
    const variants = [' A@X.com ', 'a@x.com', 'A@X.COM', '  a@X.CoM', 'A@x.CoM  '];
    expect(variants).toHaveLength(MAX_FAILED_ATTEMPTS);
    variants.forEach((variant, i) => registerFailedLogin(variant, T0 + i));

    expect(peekLoginBackoff('a@x.com')?.failures).toBe(MAX_FAILED_ATTEMPTS);
    expect(checkLoginBackoff('a@x.com', T0 + MAX_FAILED_ATTEMPTS).locked).toBe(true);
  });

  it('reports the lock for EVERY casing/whitespace variant once locked', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin('a@x.com', T0);
    }
    for (const variant of [' A@X.com ', 'A@X.COM', '\ta@X.Com\n', 'a@x.com']) {
      expect(checkLoginBackoff(variant, T0).locked).toBe(true);
    }
  });

  it('clears the lock for every variant when cleared via a differently-cased address', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin('a@x.com', T0);
    }
    clearLoginBackoff('  A@X.COM  ');
    expect(checkLoginBackoff('a@x.com', T0).locked).toBe(false);
  });
});

describe('clearLoginBackoff (resets on success)', () => {
  const EMAIL = 'success@example.com';

  it('drops a partial failure count', () => {
    registerFailedLogin(EMAIL, T0);
    registerFailedLogin(EMAIL, T0 + 1);
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(2);

    clearLoginBackoff(EMAIL);
    expect(peekLoginBackoff(EMAIL)).toBeUndefined();
  });

  it('means a later failure run starts from zero again', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      registerFailedLogin(EMAIL, T0 + i);
    }
    clearLoginBackoff(EMAIL);

    // The next failure is failure #1, not #5 — so no lockout.
    registerFailedLogin(EMAIL, T0 + 100);
    expect(peekLoginBackoff(EMAIL)?.failures).toBe(1);
    expect(checkLoginBackoff(EMAIL, T0 + 100).locked).toBe(false);
  });

  it('releases an ACTIVE lockout', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin(EMAIL, T0);
    }
    expect(checkLoginBackoff(EMAIL, T0).locked).toBe(true);

    clearLoginBackoff(EMAIL);
    expect(checkLoginBackoff(EMAIL, T0).locked).toBe(false);
  });

  it('is a no-op for an unknown identity', () => {
    expect(() => clearLoginBackoff('never-seen@example.com')).not.toThrow();
    expect(peekLoginBackoff('never-seen@example.com')).toBeUndefined();
  });
});

describe('peekLoginBackoff', () => {
  it('returns undefined for an untracked identity', () => {
    expect(peekLoginBackoff('nobody@example.com')).toBeUndefined();
  });

  it('normalizes the lookup key like every other entry point', () => {
    registerFailedLogin('  Peek@Example.COM ', T0);
    expect(peekLoginBackoff('peek@example.com')?.failures).toBe(1);
  });
});

describe('store bounding (memory safety under a spray attack)', () => {
  it('evicts decayed entries on the next write instead of growing forever', () => {
    const sprayed = Array.from({ length: 50 }, (_, i) => `spray-${i}@example.com`);
    for (const email of sprayed) {
      registerFailedLogin(email, T0);
    }
    expect(peekLoginBackoff(sprayed[0])?.failures).toBe(1);

    // One write after the whole window has rolled over sweeps every stale key.
    registerFailedLogin('fresh@example.com', T0 + ATTEMPT_WINDOW_MS);
    for (const email of sprayed) {
      expect(peekLoginBackoff(email)).toBeUndefined();
    }
    expect(peekLoginBackoff('fresh@example.com')?.failures).toBe(1);
  });

  it('does not evict entries that are still inside the attempt window', () => {
    registerFailedLogin('keep-me@example.com', T0);
    registerFailedLogin('other@example.com', T0 + ATTEMPT_WINDOW_MS - 1);
    expect(peekLoginBackoff('keep-me@example.com')?.failures).toBe(1);
  });

  it('does not evict an identity whose lockout is still running', () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      registerFailedLogin('locked@example.com', T0);
    }
    // A much later write (still inside the lockout) must not release the lock.
    registerFailedLogin('unrelated@example.com', T0 + LOCKOUT_MS - 1);
    expect(checkLoginBackoff('locked@example.com', T0 + LOCKOUT_MS - 1).locked).toBe(true);
  });
});
