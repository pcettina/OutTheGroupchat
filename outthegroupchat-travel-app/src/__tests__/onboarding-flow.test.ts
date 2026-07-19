/**
 * Day-7 onboarding flow tests.
 *
 * The repo's Vitest environment is `node` (no jsdom / @testing-library) and the
 * include glob only matches `*.test.ts`. So step-gating and completion are
 * verified through the pure `onboardingFlow` helpers with a mocked `fetch` +
 * a mock `navigate`, and the presentational Crew step is asserted via
 * `react-dom/server` static markup — no DOM, no new deps.
 *
 * Run just this file:
 *   npx vitest run src/__tests__/onboarding-flow.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  canAdvanceFromTopics,
  markOnboardingComplete,
  finishOnboarding,
  fetchOnboardingStatus,
  fetchTopics,
  ONBOARDING_DONE_PATH,
} from '@/components/onboarding/onboardingFlow';
import { OnboardingCrewStep } from '@/components/onboarding/OnboardingCrewStep';

// A minimal typed fetch mock, re-armed before every test (mock hygiene).
let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

describe('canAdvanceFromTopics (step gating)', () => {
  it('blocks advancing with no Topic selected', () => {
    expect(canAdvanceFromTopics([])).toBe(false);
  });

  it('allows advancing once at least one Topic is selected', () => {
    expect(canAdvanceFromTopics(['topic-1'])).toBe(true);
    expect(canAdvanceFromTopics(['a', 'b', 'c'])).toBe(true);
  });
});

describe('markOnboardingComplete', () => {
  it('POSTs to /api/users/onboarding and reports success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ onboarded: true }, true));

    const ok = await markOnboardingComplete();

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/users/onboarding');
    expect(init).toMatchObject({ method: 'POST' });
  });

  it('returns false when the endpoint responds non-ok (does not throw)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(markOnboardingComplete()).resolves.toBe(false);
  });

  it('returns false when fetch rejects (endpoint missing / network error)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(markOnboardingComplete()).resolves.toBe(false);
  });
});

describe('finishOnboarding (complete / skip-to-end)', () => {
  it('marks the flow complete then navigates toward /intents', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ onboarded: true }, true));
    const navigate = vi.fn();

    await finishOnboarding(navigate);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/onboarding',
      expect.objectContaining({ method: 'POST' })
    );
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/intents');
    expect(ONBOARDING_DONE_PATH).toBe('/intents');
  });

  it('still navigates to /intents even if the completion call fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const navigate = vi.fn();

    await finishOnboarding(navigate);

    expect(navigate).toHaveBeenCalledWith('/intents');
  });
});

describe('fetchOnboardingStatus', () => {
  it('returns true when the API reports the user is onboarded', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ onboarded: true, onboardedAt: 'x' }, true));
    await expect(fetchOnboardingStatus()).resolves.toBe(true);
  });

  it('fails open (false) on a non-ok response or a thrown fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(fetchOnboardingStatus()).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(fetchOnboardingStatus()).resolves.toBe(false);
  });
});

describe('fetchTopics', () => {
  it('returns the topics array from a success envelope', async () => {
    const topics = [{ id: 't1', slug: 'drinks', displayName: 'Drinks' }];
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { topics } }, true));

    await expect(fetchTopics()).resolves.toEqual(topics);
    expect(fetchMock).toHaveBeenCalledWith('/api/topics');
  });

  it('throws on a non-success envelope so the UI can show retry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, true));
    await expect(fetchTopics()).rejects.toThrow();
  });
});

describe('OnboardingCrewStep markup', () => {
  it('deep-links to /crew and offers a skip affordance', () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingCrewStep, { onSkip: () => undefined })
    );
    expect(html).toContain('data-testid="onboarding-crew-step"');
    expect(html).toContain('href="/crew"');
    expect(html).toContain('Skip for now');
  });
});
