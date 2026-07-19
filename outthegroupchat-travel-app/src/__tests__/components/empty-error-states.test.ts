/**
 * Render tests for the Day-7 shared `ErrorBanner` (empty + error states work).
 *
 * NOTE ON FILENAME/ENV: the project's vitest environment is `node` with no
 * jsdom / @testing-library, and the include glob only matches `*.test.ts`
 * (see vitest.config.ts). A `.test.tsx` file would never be collected — a
 * false green. So, like `hot-now-badge.test.ts`, this file stays `.ts`, uses
 * `React.createElement` (no JSX), and asserts on static markup via
 * `react-dom/server` — no DOM, no new deps.
 *
 * Because there is no DOM, click events cannot be dispatched here. We instead
 * verify the conditional wiring: the Retry / Dismiss controls render (and are
 * bound) only when their callbacks are supplied, and are absent otherwise.
 *
 * Run just this file:
 *   npx vitest run src/__tests__/components/empty-error-states.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

describe('ErrorBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the message inside a role="alert" container', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorBanner, { message: 'Could not load your Intents.' }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Could not load your Intents.');
  });

  it('uses the shared red-danger styling', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorBanner, { message: 'Boom' }),
    );
    expect(html).toContain('border-red-500/30');
    expect(html).toContain('bg-red-500/10');
  });

  it('renders a Retry button only when onRetry is provided', () => {
    const withRetry = renderToStaticMarkup(
      createElement(ErrorBanner, { message: 'x', onRetry: vi.fn() }),
    );
    expect(withRetry).toContain('Retry');

    const withoutRetry = renderToStaticMarkup(
      createElement(ErrorBanner, { message: 'x' }),
    );
    expect(withoutRetry).not.toContain('Retry');
  });

  it('renders a Dismiss control only when onDismiss is provided', () => {
    const withDismiss = renderToStaticMarkup(
      createElement(ErrorBanner, { message: 'x', onDismiss: vi.fn() }),
    );
    expect(withDismiss).toContain('aria-label="Dismiss error"');

    const withoutDismiss = renderToStaticMarkup(
      createElement(ErrorBanner, { message: 'x' }),
    );
    expect(withoutDismiss).not.toContain('aria-label="Dismiss error"');
  });

  it('binds the supplied callbacks to the rendered controls (Retry / Dismiss)', () => {
    // With no DOM we cannot dispatch a click, so we assert the wiring directly:
    // ErrorBanner forwards each callback to its button's onClick prop. Calling
    // the (hook-free) component function returns its element tree.
    const onRetry = vi.fn();
    const onDismiss = vi.fn();

    type Node = { props?: { onClick?: () => void; children?: unknown } };
    const tree = ErrorBanner({ message: 'wired', onRetry, onDismiss }) as unknown as Node;
    const children = (tree.props?.children ?? []) as Node[];
    const buttons = children.filter(
      (c): c is Required<Node> => typeof c?.props?.onClick === 'function',
    );

    // Retry + Dismiss buttons are both present and wired to their callbacks.
    expect(buttons).toHaveLength(2);
    buttons[0].props.onClick?.();
    buttons[1].props.onClick?.();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
