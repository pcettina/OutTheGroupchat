/**
 * Render tests for the Day-2 "Hot now" badge + contributor-count chip.
 *
 * The project's vitest environment is `node` with no jsdom / @testing-library
 * and the include glob only matches `*.test.ts` (not `.tsx`). These render the
 * pure presentational components to a static HTML string via `react-dom/server`
 * and assert on the markup — no DOM, no new deps — using `React.createElement`
 * so the file stays a `.ts` and is picked up by the full suite.
 *
 * Run just this file:
 *   npx vitest run src/__tests__/components/hot-now-badge.test.ts
 */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HotNowBadge,
  ContributorCountChip,
  isHotNow,
  HOT_NOW_BOOST_THRESHOLD,
} from '@/components/subcrews/HotNowBadge';

describe('isHotNow', () => {
  it('is true at or above the threshold', () => {
    expect(isHotNow(HOT_NOW_BOOST_THRESHOLD)).toBe(true);
    expect(isHotNow(HOT_NOW_BOOST_THRESHOLD + 0.5)).toBe(true);
  });

  it('is false at the neutral boost and just below the threshold', () => {
    expect(isHotNow(1.0)).toBe(false);
    expect(isHotNow(HOT_NOW_BOOST_THRESHOLD - 0.01)).toBe(false);
  });

  it('is false for null/undefined/NaN', () => {
    expect(isHotNow(null)).toBe(false);
    expect(isHotNow(undefined)).toBe(false);
    expect(isHotNow(Number.NaN)).toBe(false);
  });
});

describe('HotNowBadge', () => {
  it('renders the badge when the boost is above the threshold', () => {
    const html = renderToStaticMarkup(createElement(HotNowBadge, { hotnessBoost: 1.4 }));
    expect(html).toContain('Hot now');
    expect(html).toContain('data-testid="hot-now-badge"');
    expect(html).toContain('Rising density');
  });

  it('renders nothing when the boost is neutral (~1.0)', () => {
    const html = renderToStaticMarkup(createElement(HotNowBadge, { hotnessBoost: 1.0 }));
    expect(html).toBe('');
  });

  it('renders nothing when the boost is missing', () => {
    expect(renderToStaticMarkup(createElement(HotNowBadge, { hotnessBoost: null }))).toBe('');
    expect(renderToStaticMarkup(createElement(HotNowBadge, { hotnessBoost: undefined }))).toBe('');
  });
});

describe('ContributorCountChip', () => {
  it('renders a chip with the count when positive', () => {
    const html = renderToStaticMarkup(createElement(ContributorCountChip, { count: 12 }));
    expect(html).toContain('data-testid="contributor-count-chip"');
    expect(html).toContain('12');
    expect(html).toContain('12 people contributing recently');
  });

  it('singularises the label for a count of one', () => {
    const html = renderToStaticMarkup(createElement(ContributorCountChip, { count: 1 }));
    expect(html).toContain('1 person contributing recently');
  });

  it('renders nothing for a non-positive count', () => {
    expect(renderToStaticMarkup(createElement(ContributorCountChip, { count: 0 }))).toBe('');
    expect(renderToStaticMarkup(createElement(ContributorCountChip, { count: -3 }))).toBe('');
  });
});
