/**
 * Regression tests for the notification-preferences settings form.
 *
 * BUG (fixed here): `GET /api/users/notification-preferences` returns an
 * envelope — `{ success: true, data: { preferences: [...] } }` — but the form
 * passed that envelope straight into `parsePreferences`, whose first line is
 * `if (!Array.isArray(raw)) return []`. The result was ALWAYS `[]`, so the
 * user's real saved preferences (enabled state, DAILY_PROMPT schedule,
 * perMemberTargets) never rendered and the form silently showed defaults.
 *
 * `parsePreferencesResponse` is the exported unwrap+parse helper. Every case
 * below that feeds it the real envelope FAILS against the old code (it would
 * return `[]`) and passes after the fix.
 *
 * NOTE ON FILENAME/ENV: the project's vitest environment is `node` with no
 * jsdom / @testing-library, and the include glob only matches `*.test.ts`
 * (see vitest.config.ts) — a `.test.tsx` file would never be collected, i.e.
 * a false green. So, like `hot-now-badge.test.ts` and
 * `empty-error-states.test.ts`, this file stays `.ts` and unit-tests the
 * exported pure helper directly rather than forcing in a React render harness.
 *
 * Run just this file:
 *   npx vitest run src/__tests__/components/notification-preferences-form.test.ts
 */

import { describe, it, expect } from 'vitest';
import { parsePreferencesResponse } from '@/components/settings/NotificationPreferencesForm';
import type { NotificationPreferenceResponse } from '@/types/notification-preference';

/** Exactly what the GET route returns (route.ts: `{ success, data: { preferences } }`). */
function envelope(preferences: unknown): unknown {
  return { success: true, data: { preferences } };
}

const SAVED: NotificationPreferenceResponse[] = [
  {
    trigger: 'DAILY_PROMPT',
    enabled: true,
    schedule: '07:30',
    perMemberTargets: [],
  },
  {
    trigger: 'PER_MEMBER_INTENT',
    enabled: true,
    schedule: null,
    perMemberTargets: ['user-a', 'user-b'],
  },
  {
    trigger: 'GROUP_FORMATION',
    enabled: false,
    schedule: null,
    perMemberTargets: [],
  },
];

describe('parsePreferencesResponse — envelope unwrapping (the bug)', () => {
  it('renders the user’s ACTUAL saved preferences from the API envelope', () => {
    // Against the pre-fix code this returned [] and the form showed defaults.
    const parsed = parsePreferencesResponse(envelope(SAVED));
    expect(parsed).toHaveLength(3);
    expect(parsed).toEqual(SAVED);
  });

  it('preserves the DAILY_PROMPT enabled state and schedule', () => {
    const daily = parsePreferencesResponse(envelope(SAVED)).find(
      (p) => p.trigger === 'DAILY_PROMPT',
    );
    expect(daily?.enabled).toBe(true);
    expect(daily?.schedule).toBe('07:30');
  });

  it('preserves perMemberTargets for PER_MEMBER_INTENT', () => {
    const perMember = parsePreferencesResponse(envelope(SAVED)).find(
      (p) => p.trigger === 'PER_MEMBER_INTENT',
    );
    expect(perMember?.perMemberTargets).toEqual(['user-a', 'user-b']);
  });

  it('does not coerce a disabled preference into an enabled one', () => {
    const group = parsePreferencesResponse(envelope(SAVED)).find(
      (p) => p.trigger === 'GROUP_FORMATION',
    );
    expect(group?.enabled).toBe(false);
  });
});

describe('parsePreferencesResponse — tolerated shapes', () => {
  it('accepts a bare array (legacy / direct payload)', () => {
    expect(parsePreferencesResponse(SAVED)).toEqual(SAVED);
  });

  it('accepts a bare { preferences } object', () => {
    expect(parsePreferencesResponse({ preferences: SAVED })).toEqual(SAVED);
  });
});

describe('parsePreferencesResponse — defensive against malformed bodies', () => {
  it.each([
    ['undefined (body read failed)', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['a number', 42],
    ['an empty object', {}],
    ['an error envelope', { success: false, error: 'Unauthorized' }],
    ['data without preferences', { success: true, data: {} }],
    ['preferences that is not an array', { success: true, data: { preferences: 'x' } }],
    ['null data', { success: true, data: null }],
  ])('returns [] (never throws) for %s', (_label, body) => {
    expect(() => parsePreferencesResponse(body)).not.toThrow();
    expect(parsePreferencesResponse(body)).toEqual([]);
  });

  it('skips individual malformed rows but keeps the valid ones', () => {
    const parsed = parsePreferencesResponse(
      envelope([
        null,
        'garbage',
        { trigger: 'NOT_A_TRIGGER', enabled: true },
        { trigger: 'DAILY_PROMPT', enabled: true, schedule: '09:00', perMemberTargets: [] },
      ]),
    );
    expect(parsed).toEqual([
      { trigger: 'DAILY_PROMPT', enabled: true, schedule: '09:00', perMemberTargets: [] },
    ]);
  });

  it('defaults missing fields on an otherwise-valid row', () => {
    const parsed = parsePreferencesResponse(envelope([{ trigger: 'GROUP_FORMATION' }]));
    expect(parsed).toEqual([
      { trigger: 'GROUP_FORMATION', enabled: false, schedule: null, perMemberTargets: [] },
    ]);
  });

  it('filters non-string entries out of perMemberTargets', () => {
    const parsed = parsePreferencesResponse(
      envelope([
        {
          trigger: 'PER_MEMBER_INTENT',
          enabled: true,
          schedule: null,
          perMemberTargets: ['ok', 7, null, 'also-ok'],
        },
      ]),
    );
    expect(parsed[0].perMemberTargets).toEqual(['ok', 'also-ok']);
  });
});

describe('parsePreferencesResponse — PATCH round-trip', () => {
  it('renders the newly saved value after a save + refetch', () => {
    // 1. Initial load: DAILY_PROMPT off.
    const before = parsePreferencesResponse(envelope(SAVED)).find(
      (p) => p.trigger === 'GROUP_FORMATION',
    );
    expect(before?.enabled).toBe(false);

    // 2. User toggles GROUP_FORMATION on; PATCH persists it. The refetch returns
    //    the same envelope shape with the updated row.
    const afterSave = SAVED.map((p) =>
      p.trigger === 'GROUP_FORMATION' ? { ...p, enabled: true } : p,
    );
    const after = parsePreferencesResponse(envelope(afterSave)).find(
      (p) => p.trigger === 'GROUP_FORMATION',
    );

    // The saved value is what renders — not a default.
    expect(after?.enabled).toBe(true);
  });

  it('round-trips an edited DAILY_PROMPT schedule', () => {
    const edited = SAVED.map((p) =>
      p.trigger === 'DAILY_PROMPT' ? { ...p, schedule: '21:15' } : p,
    );
    const daily = parsePreferencesResponse(envelope(edited)).find(
      (p) => p.trigger === 'DAILY_PROMPT',
    );
    expect(daily?.schedule).toBe('21:15');
  });
});
