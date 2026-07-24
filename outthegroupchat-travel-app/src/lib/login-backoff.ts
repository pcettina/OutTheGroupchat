/**
 * @module login-backoff
 * @description Deterministic, per-identity failed-login throttling for the NextAuth
 * credentials provider.
 *
 * Why this is not built on `@/lib/rate-limit`
 * -------------------------------------------
 * `checkRateLimit()` deliberately FAILS OPEN: it returns `{ success: true }` both when
 * the Upstash env vars are unset (the current dev/prod state) and from its catch block.
 * That is the right call for ordinary API throttling, but it would make a login lockout
 * completely inert while still appearing wired up. This module therefore keeps its own
 * deterministic in-module store so the lockout is real regardless of env config.
 *
 * Scope / limitation
 * ------------------
 * The store is an in-memory `Map` living in the module scope, so it is **per-process**.
 * On a single node (or a warm serverless instance) it behaves exactly as specified; across
 * multiple instances each has its own counters, so an attacker spread across N instances
 * effectively gets N x MAX_FAILED_ATTEMPTS. The multi-instance upgrade is a shared
 * Redis-backed store keyed the same way — the pure reducers below (`recordFailure`,
 * `isLocked`, `lockoutRemainingMs`) are storage-agnostic and would be reused as-is.
 *
 * Keying
 * ------
 * NextAuth's `authorize()` in `src/lib/auth.ts` does not destructure the second `req`
 * argument, so there is no request IP available at that call site. Counters are therefore
 * keyed on the **normalized submitted email** (trimmed + lowercased) so that `A@x.com` and
 * `a@x.com` share one bucket and the lock cannot be bypassed by changing letter case.
 *
 * All time inputs are injectable (`now`) so tests are deterministic without fake timers.
 */

/** Number of failures within {@link ATTEMPT_WINDOW_MS} that trips a lockout. */
export const MAX_FAILED_ATTEMPTS = 5;

/** How long an identity stays locked out once the threshold is reached (15 minutes). */
export const LOCKOUT_MS = 15 * 60 * 1000;

/** Rolling window for counting failures. Older, un-locked entries decay away (15 minutes). */
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Hard cap on distinct tracked identities. Combined with expiry-eviction on write, this
 * bounds memory in a long-lived process even under a spray attack across many addresses.
 */
export const MAX_TRACKED_KEYS = 10_000;

/** Per-identity failure bookkeeping. `lockedUntil` is an epoch-ms timestamp or `null`. */
export interface BackoffState {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number | null;
}

/** Result of a pre-authentication backoff check. */
export interface BackoffCheck {
  locked: boolean;
  retryAfterMs: number;
}

/**
 * Normalize an email into a backoff bucket key.
 *
 * @param email - Raw, user-supplied email string.
 * @returns The trimmed, lowercased email (empty string for falsy input).
 */
export function normalizeLoginKey(email: string): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Whether a state entry has fully decayed and can be dropped/reset.
 *
 * An entry is expired when either:
 * - it carries a lockout that has already elapsed (serving the lockout resets the counter), or
 * - it has no lockout and its first failure is older than {@link ATTEMPT_WINDOW_MS}.
 *
 * @param state - Existing state, if any.
 * @param now - Epoch milliseconds.
 */
export function isBackoffExpired(state: BackoffState | undefined, now: number): boolean {
  if (!state) return true;
  if (state.lockedUntil !== null) {
    return now >= state.lockedUntil;
  }
  return now - state.firstFailureAt >= ATTEMPT_WINDOW_MS;
}

/**
 * Whether an identity is currently locked out.
 *
 * @param state - Existing state, if any.
 * @param now - Epoch milliseconds.
 */
export function isLocked(state: BackoffState | undefined, now: number): boolean {
  if (!state || state.lockedUntil === null) return false;
  return now < state.lockedUntil;
}

/**
 * Milliseconds remaining on an active lockout, or `0` when not locked.
 *
 * @param state - Existing state, if any.
 * @param now - Epoch milliseconds.
 */
export function lockoutRemainingMs(state: BackoffState | undefined, now: number): number {
  if (!isLocked(state, now) || !state || state.lockedUntil === null) return 0;
  return state.lockedUntil - now;
}

/**
 * Pure reducer: fold one failed attempt into the existing state.
 *
 * - A missing or fully-decayed entry restarts the counter at 1.
 * - Otherwise the counter increments and the original `firstFailureAt` is preserved.
 * - Reaching {@link MAX_FAILED_ATTEMPTS} sets `lockedUntil = now + LOCKOUT_MS`. Further
 *   failures while locked extend the lock (each one re-stamps it from `now`).
 *
 * @param state - Existing state, if any.
 * @param now - Epoch milliseconds.
 * @returns A new state object (the input is never mutated).
 */
export function recordFailure(state: BackoffState | undefined, now: number): BackoffState {
  if (!state || isBackoffExpired(state, now)) {
    const failures = 1;
    return {
      failures,
      firstFailureAt: now,
      lockedUntil: failures >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : null,
    };
  }

  const failures = state.failures + 1;
  return {
    failures,
    firstFailureAt: state.firstFailureAt,
    lockedUntil: failures >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : state.lockedUntil,
  };
}

/**
 * Module-level store. See the module docblock for the per-process caveat.
 */
const store = new Map<string, BackoffState>();

/**
 * Drop every fully-decayed entry, then enforce {@link MAX_TRACKED_KEYS} by evicting the
 * oldest-inserted keys (Map iteration order is insertion order).
 */
function evictStale(now: number): void {
  // `Array.from` snapshots the keys first: the tsconfig target predates ES2015
  // iteration protocols, and mutating a Map mid-iteration is fragile regardless.
  const keys = Array.from(store.keys());

  for (const key of keys) {
    const state = store.get(key);
    if (isBackoffExpired(state, now)) {
      store.delete(key);
    }
  }

  if (store.size <= MAX_TRACKED_KEYS) return;

  // Insertion order = oldest first, so evict from the front.
  const overflow = store.size - MAX_TRACKED_KEYS;
  const remaining = Array.from(store.keys());
  for (let i = 0; i < overflow && i < remaining.length; i += 1) {
    store.delete(remaining[i]);
  }
}

/**
 * Check whether an identity is currently locked out. Call this BEFORE any DB lookup or
 * bcrypt compare so a locked identity short-circuits the expensive path.
 *
 * Expired entries are lazily cleaned up on read.
 *
 * @param email - Raw, user-supplied email.
 * @param now - Epoch milliseconds (defaults to `Date.now()`; override in tests).
 */
export function checkLoginBackoff(email: string, now: number = Date.now()): BackoffCheck {
  const key = normalizeLoginKey(email);
  const state = store.get(key);

  if (!state) {
    return { locked: false, retryAfterMs: 0 };
  }

  if (isBackoffExpired(state, now)) {
    store.delete(key);
    return { locked: false, retryAfterMs: 0 };
  }

  return { locked: isLocked(state, now), retryAfterMs: lockoutRemainingMs(state, now) };
}

/**
 * Record one failed login attempt for an identity.
 *
 * @param email - Raw, user-supplied email.
 * @param now - Epoch milliseconds (defaults to `Date.now()`; override in tests).
 */
export function registerFailedLogin(email: string, now: number = Date.now()): void {
  const key = normalizeLoginKey(email);
  evictStale(now);
  store.set(key, recordFailure(store.get(key), now));
}

/**
 * Clear all backoff state for an identity. Called on a SUCCESSFUL authentication so the
 * counter "resets on success".
 *
 * @param email - Raw, user-supplied email.
 */
export function clearLoginBackoff(email: string): void {
  store.delete(normalizeLoginKey(email));
}

/**
 * Read the raw state for an identity. Exposed for assertions and diagnostics; the auth
 * path itself uses {@link checkLoginBackoff}.
 *
 * @param email - Raw, user-supplied email.
 */
export function peekLoginBackoff(email: string): BackoffState | undefined {
  return store.get(normalizeLoginKey(email));
}

/**
 * TEST-ONLY hook. Empties the module-level store so each test starts from a clean slate.
 * Not referenced by any production code path.
 */
export function __resetLoginBackoffStore(): void {
  store.clear();
}
