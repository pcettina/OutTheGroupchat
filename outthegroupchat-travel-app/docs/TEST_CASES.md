# OutTheGroupchat - Test Cases

## Overview

This document describes the test suite for OutTheGroupchat — a meetup-centric social network ("the social media app that wants to get you off your phone"). Tests are organized by domain and type.

> **Pivot note:** The product pivoted from trip-planning to a meetup/social network. Trip-planning tests (survey, voting, itinerary, recommendation service, trip CRUD) were archived under `src/__tests__/_archive/` and are not part of the active suite. AI tests were removed entirely when the AI surface was deleted (PR #65, 2026-04-23). Sections below reflect the **active** meetup-domain suite only. Historical trip/AI examples have been removed from this document.

---

## Testing Stack

> **Status (2026-06-10):** Vitest (unit/integration) and Playwright (E2E) are installed and configured. **~1814 tests passing across 91 active test files** (`src/__tests__/**/*.test.ts`, excluding `src/__tests__/_archive/`). 61 active API routes, 60 with test coverage — only the NextAuth `[...nextauth]` catch-all is untested, and it contains no custom logic.

```bash
# Testing dependencies are already in package.json — run npm install
# Vitest + Testing Library + Playwright are pre-configured.

# Install Playwright browsers for E2E tests
npx playwright install chromium
```

### Configuration Files

- **`vitest.config.ts`** — jsdom environment, globals enabled, `@` alias → `./src`, setup file `src/__tests__/setup.ts`.
- **`src/__tests__/setup.ts`** — global mocks for Prisma client, `@/lib/sentry`, `@/lib/pusher`, loggers, and rate-limit. New test files rely on these shared mocks; add new Prisma model/method mocks here (Wave 3 / shared-file responsibility).
- **`playwright.config.ts`** — E2E config with CI retries and `webServer` running `npm run dev`.

### NPM Scripts

```bash
npm run test          # vitest run (full unit/integration suite, one-shot)
npm run test:watch    # vitest (watch mode)
npm run test:e2e      # playwright test
npm run test:e2e:ui   # playwright test --ui
npm run test:archive  # vitest run src/__tests__/_archive  (legacy trip tests, not in default suite)
```

---

## Test Domains

The active suite is organized around the meetup product's core domains. The table maps each domain to its representative test files (under `src/__tests__/`).

| Domain | What it covers | Representative test files |
|--------|----------------|---------------------------|
| **Auth** | Sign-up, password reset, email verification, demo auth, beta access, auth redirect | `api/auth.test.ts`, `api/auth-signup.test.ts`, `api/auth-demo.test.ts`, `api/reset-password.test.ts`, `api/verify-email.test.ts`, `api/beta.test.ts`, `api/beta-extended.test.ts`, `api/beta-initialize-password.test.ts`, `lib/auth-redirect.test.ts` |
| **Crew** | Crew connection requests, accept/decline, crew listing | `api/crew.test.ts` |
| **Sub-crews / Group formation** | Auto-grouping at ≥2 Crew on a Topic, emerging/listing, coordination, cell anonymization, group-formation push | `api/subcrews.test.ts`, `api/subcrews-actions.test.ts`, `api/subcrews-listing.test.ts`, `api/subcrews-extended.test.ts`, `api/subcrews-emerging-extended.test.ts`, `api/subcrew-coordination.test.ts`, `api/subcrew-coordination-extended.test.ts`, `subcrews-coverage.test.ts`, `lib/subcrew-cell-anonymize.test.ts`, `lib/subcrew-group-formation-push.test.ts`, `lib/subcrew-try-form.test.ts` |
| **Topics & Intents** | Signal intent on a Topic, topic classification, intent lifecycle (create/list/detail/expire), per-member intent, intent utils | `api/topics.test.ts`, `api/topics-ratelimit.test.ts`, `api/intents.test.ts`, `api/intents-detail.test.ts`, `api/intents-extended.test.ts`, `api/intents-crew-extended.test.ts`, `intents-id.test.ts`, `intents-mine-crew.test.ts`, `lib/topic-classifier.test.ts`, `lib/topic-places-map.test.ts`, `lib/intent-classifier.test.ts`, `lib/intent-utils.test.ts`, `lib/per-member-intent.test.ts`, `lib/daily-prompt.test.ts` |
| **Meetups** | Meetup CRUD, RSVP, invite, attendee management | `api/meetups.test.ts`, `api/meetups-id.test.ts`, `api/meetups-rsvp-invite.test.ts` |
| **Check-ins** | "Who's Out Tonight?" check-ins, feed, edge cases, Pusher dispatch | `api/checkins.test.ts`, `api/checkins-edge.test.ts`, `api/checkins-pusher.test.ts`, `checkins-feed.test.ts` |
| **Heatmap** | Crew/FoF tier aggregation, anchor selection, contribution writers, FoF graph, hotness score | `api/heatmap.test.ts`, `api/heatmap-edge.test.ts`, `lib/heatmap-aggregate.test.ts`, `lib/heatmap-aggregate-fof.test.ts`, `lib/heatmap-anchor-select.test.ts`, `lib/heatmap-contribution-writer.test.ts`, `lib/heatmap-fof-graph.test.ts`, `lib/fof-graph.test.ts`, `lib/hotness-score.test.ts` |
| **Notifications** | Notification CRUD, preferences, rescoped types (DAILY_PROMPT, PER_MEMBER_INTENT, GROUP_FORMATION) | `api/notifications.test.ts`, `api/notifications-extended.test.ts`, `api/notifications-rescoped.test.ts`, `api/notification-preferences.test.ts` |
| **Search & Discover** | People-first search, discover search/recommendations/import, inspiration | `api/search.test.ts`, `api/discover-search.test.ts`, `api/discover-recommendations.test.ts`, `api/discover-import.test.ts`, `api/inspiration.test.ts`, `api/recommendations.test.ts`, `api/recommendations-edge.test.ts` |
| **Feed** | Feed rendering, comments, engagement, share, Pusher social events | `api/feed.test.ts`, `api/feed-extended.test.ts`, `api/feed-comments-engagement.test.ts`, `api/share.test.ts`, `api/pusher-feed-social.test.ts` |
| **Profile & Users** | Profile, users, current user, privacy settings, invitations | `api/profile.test.ts`, `api/users.test.ts`, `api/users-me.test.ts`, `api/privacy-settings.test.ts`, `api/invitations.test.ts`, `api/invitations-post.test.ts`, `lib/invitations.test.ts` |
| **Venues & Geocoding** | Google Places venue search, geocoding, image lookups | `api/venues-search-places.test.ts`, `api/geocoding-api.test.ts`, `api/geocoding-images.test.ts`, `api/images-search.test.ts`, `lib/geocoding.test.ts` |
| **Cron jobs** | Meetup-starting-soon, daily prompts, intent expiry, generic cron auth | `api/cron.test.ts`, `api/cron-meetup-starting-soon.test.ts`, `api/cron-send-daily-prompts.test.ts`, `api/cron-expire-intents.test.ts`, `api/cron-routes-extended.test.ts` |
| **Infra / cross-cutting** | Rate-limit (Redis), Pusher auth, Sentry instrumentation, sanitize/validation utils, health, newsletter, email | `lib/rate-limit.test.ts`, `api/pusher-auth.test.ts`, `api/health.test.ts`, `api/newsletter.test.ts`, `lib/email.test.ts`, `lib/utils-and-validations.test.ts`, `api/v1-misc-routes.test.ts` |

---

## Test Patterns & Conventions

These conventions are enforced across the suite (see `docs/agents/CODE_CHECKING_AGENT_GUIDE.md` for the full pattern catalog):

- **Auth check first.** Protected API routes are tested for `401` when `getServerSession()` returns null, before any happy-path assertion.
- **Zod validation.** Every input-validated route has a test asserting `400` on malformed/invalid body or query.
- **Rate-limit mock re-arm.** The shared `checkRateLimit` mock must be re-set in `beforeEach` (factory-level `mockResolvedValue` is wiped by `vi.resetAllMocks()`), or all post-auth tests 500. Use `vi.resetAllMocks()` (not `clearAllMocks`) when mockResolvedValueOnce queue leakage is a concern.
- **Sentry assertions.** Error-path tests assert `captureException` was called once on the routes where Sentry has been wired. Sentry is globally mocked in `setup.ts`.
- **Pusher events.** Real-time dispatch (check-ins, feed, group formation) is verified by asserting the mocked Pusher trigger was called with the expected channel + event.
- **NextRequest vs Request.** Routes that read headers via the rate limiter (e.g. `beta/status`) require `new NextRequest(url)` in test helpers, not `new Request(url)`.
- **Mock type casts.** When mocking with `vi.mocked(prisma.X)`, cast to include any methods (e.g. `create`, `createMany`) not present in the intersection type. Static class-method mocks use the `(Service.prototype.method as unknown as { mockResolvedValueOnce: Function })` pattern.

---

## End-to-End Tests (Playwright)

E2E specs live in `e2e/` and require `npx playwright install chromium`.

| Spec | Coverage |
|------|----------|
| `e2e/smoke.spec.ts` | Public pages load, basic navigation, CI-friendly smoke check |
| `e2e/auth-flow.spec.ts` | Sign-in page renders, valid/invalid credential handling |
| `e2e/authenticated-flow.spec.ts` | Authenticated user flows (post-login) |
| `e2e/crew.spec.ts` | Crew connection flow |

> Phase 8 launch-readiness item: expand authenticated E2E coverage (intent → group-formation → meetup-coordination loop).

---

## CI/CD Integration

CI runs via `.github/workflows/ci.yml` (Node 20): `tsc --noEmit`, `npm run lint`, `npm run test` (Vitest), and Playwright with `npx playwright install chromium --with-deps`. Vitest runs against the active suite; the archived trip suite (`npm run test:archive`) is excluded from default CI.

---

## Coverage Snapshot

| Dimension | Current (2026-06-10) |
|-----------|----------------------|
| Active test files | 91 (`src/__tests__/**/*.test.ts`, excludes `_archive/`) |
| Tests passing | ~1814 |
| API routes | 61 active |
| API routes with test coverage | 60 / 61 (only NextAuth `[...nextauth]` catch-all uncovered — no custom logic) |
| Archived (legacy trip) test files | 22 under `src/__tests__/_archive/` |
| E2E specs | 4 under `e2e/` |

### Priority Areas

1. **Critical** — Auth flows, Crew/sub-crew group formation, intent lifecycle.
2. **High** — Meetup RSVP/invite, check-ins, notifications (rescoped triggers).
3. **Medium** — Heatmap aggregation, search/discover, feed engagement.
4. **Lower** — Venue/geocoding lookups, newsletter, inspiration.

---

*Last Updated: 2026-06-10*
