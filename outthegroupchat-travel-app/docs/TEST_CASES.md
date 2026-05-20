# OutTheGroupchat - Test Cases

## Overview

This document captures the live test landscape for the OutTheGroupchat platform (Phase 8 launch-readiness, V1 intent-to-group product). It records suite counts, mock hygiene rules, V1-specific test patterns, and the Phase 8 testing priorities that nightly builds should keep advancing.

**Domain note:** OutTheGroupchat is a meetup-centric social network. All trip-planning routes (trips, itinerary, voting, surveys, AI itinerary generation) have been archived to `src/_archive/` and the corresponding test patterns removed from this document. AI surface was removed entirely on 2026-04-23 (PR #65) — no `/api/ai/*` routes, no embeddings or rate-limit-the-LLM patterns remain.

---

## Current Suite (2026-05-19)

| Metric | Value |
|--------|-------|
| Total passing tests | **1081** (live, excluding `_archive`) |
| Test files | **64** |
| Lint / TSC / Build | 0 / 0 / ✅ |
| Known flakes | 2 (`checkins-pusher.test.ts` parallel-load — under investigation) |

### Layout

```
src/__tests__/
├── api/           (49 files) — Next.js route handler tests
├── lib/           (14 files) — pure-lib unit tests (heatmap, intent, subcrew, sanitize, validations, etc.)
├── services/      (empty — service tests moved into lib/api as appropriate)
├── integration/   (empty — multi-route flows live under api/)
├── _archive/      (excluded from `npm test` — trip-domain legacy)
├── recommendations.test.ts
└── setup.ts
```

`src/_archive/` is excluded from the Vitest include glob and from coverage. Do not add new tests there.

---

## Testing Stack

- **Vitest** (jsdom env, globals, `src/__tests__/setup.ts`) — unit + route-handler tests
- **Playwright** (chromium) — E2E smoke (`e2e/smoke.spec.ts`); authenticated flows not yet implemented
- **MSW** — available but rarely used; most route tests mock `prisma`, Pusher, Sentry, email senders directly in `setup.ts`

```bash
npm test                 # full Vitest run
npm test -- <pattern>    # filtered run
npm run test:e2e         # Playwright smoke
```

---

## Mock Hygiene Rules (load-bearing)

These rules are derived from real flakes observed in the nightly pipeline. Violating them produces 500 responses, env-leak failures, or queue-state bleed between tests.

### 1. `vi.resetAllMocks()` in `beforeEach` — required for rate-limited routes

Factory-level `mockResolvedValue` (such as `checkRateLimit` in `setup.ts`) is wiped by `vi.resetAllMocks()`. Any test that exercises a rate-limited route must **re-arm `checkRateLimit`** in `beforeEach`, or every post-auth assertion will 500 with "rate limit check returned undefined." See `feedback_rate_limit_mock_reset.md` in memory and the canonical pattern in `src/__tests__/api/feed.test.ts`.

```typescript
import { checkRateLimit } from '@/lib/rate-limit';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 100, resetAt: Date.now() + 60_000 });
});
```

`vi.clearAllMocks()` alone does **not** flush `mockResolvedValueOnce` queues; prefer `vi.resetAllMocks()` whenever queue state could leak.

### 2. `mockResolvedValueOnce` only — never `mockResolvedValue` for per-call shaping

Use `mockResolvedValueOnce` for any prisma / service mock that needs a specific return for a specific call. `mockResolvedValue` leaks across tests and survives `clearAllMocks`. The only valid `mockResolvedValue` calls are the "default happy path" arms inside `beforeEach` (rate limit, session, etc.).

### 3. Env-at-module-load routes need `vi.stubEnv` + `vi.resetModules` + dynamic import

Routes that read `process.env` at module-import time (e.g. `cron`, `beta/status`, anything gated by `DEMO_MODE` or `CRON_SECRET`) cannot be tested with top-level static imports. Pattern:

```typescript
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('CRON_SECRET', 'test-secret');
});

it('rejects missing auth header', async () => {
  const { GET } = await import('@/app/api/cron/route');
  const res = await GET(new NextRequest('http://x/api/cron'));
  expect(res.status).toBe(401);
});
```

Without `vi.resetModules()` the route keeps the env value from whichever test imported it first.

### 4. `NextRequest` (not `Request`) for routes that read headers

The rate limiter pulls `x-forwarded-for` / `x-real-ip` off the request. Routes wired to rate-limit (including `beta/status`) must be tested with `new NextRequest(url)` not `new Request(url)` or the test crashes inside `headers.get(...)`.

### 5. Static class method mocks need a double-cast for `mockResolvedValueOnce`

For service classes mocked with `vi.mock()` factories, `vi.mocked(Service.prototype.method)` does not always expose `mockResolvedValueOnce`. Use:

```typescript
(SurveyService.prototype.getActiveSurvey as unknown as { mockResolvedValueOnce: Function })
  .mockResolvedValueOnce(fakeSurvey);
```

### 6. Mock type cast must list every method the test touches

When a Wave 1 test agent writes `vi.mocked(prisma.crew)`, TypeScript may not include `create` or `createMany` in the intersection type. The mock cast must enumerate every method the test calls, or `tsc --noEmit` fails. Common omissions: `create`, `createMany`, `deleteMany`.

### 7. Sentry is globally mocked in `setup.ts`

Do not re-mock `@/lib/sentry` per file. After PR #38, `setup.ts` ships a global `vi.mock('@/lib/sentry')`. Tests asserting Sentry calls should import and spy on `logError` / `captureException` directly — error-path assertions flip to `toHaveBeenCalledTimes(1)` once a route gains Sentry coverage.

---

## V1 Test Patterns (intent-to-group loop)

V1 introduced four test surfaces that did not exist in the trip-domain era. Each has its own mock pattern.

### Heatmap aggregation (`src/__tests__/lib/heatmap-*.test.ts`)

Five suites cover the heatmap pipeline:

- `heatmap-contribution-writer.test.ts` — writes `HeatmapContribution` rows on commit + checkin
- `heatmap-aggregate.test.ts` — Crew-tier cell aggregation, z=15 venue priority
- `heatmap-aggregate-fof.test.ts` — friend-of-friend tier aggregation
- `heatmap-fof-graph.test.ts` — FoF graph build with reachability cap
- `heatmap-anchor-select.test.ts` — R24 anchor priority (1 = venue, 3 = subcrew, 4 = topic)

Pattern: build a synthetic contribution set, call the aggregator, assert cell counts and anchor selection. Database access is fully mocked; the algorithms themselves are deterministic given a seed.

### Intent + subcrew flows (`src/__tests__/api/intents.test.ts`, `subcrews.test.ts`, `subcrew-coordination.test.ts`, `topics.test.ts`)

V1 intent classifier (`intent-classifier.test.ts`) routes free-text "what are you up to" into a Topic ID. The intent → subcrew formation flow is tested end-to-end at the route level, with `prisma.intent` / `prisma.subcrew` mocked. Key invariants tested:

- `POST /api/intents` issues an intent with a TTL (clamped to [30min, 12h])
- `cron-expire-intents` purges expired intents and dissolves orphaned subcrews
- `subcrew-try-form` only fires when ≥2 Crew share the same active Topic
- `subcrew-cell-anonymize` redacts user identity once the subcrew enters a public cell

### Crew lex-order constraint (`src/__tests__/api/crew.test.ts`)

The `Crew` table enforces `userIdA < userIdB` lexicographically to dedupe both directions of the relationship. Any test that constructs a crew row must order the IDs before insertion or the unique constraint test fails. Seed fixtures and the standalone heatmap runner (PR #92) now respect this constraint — copy that pattern when adding new crew test fixtures.

### Window-adjacency (`src/__tests__/lib/subcrew-window-adjacency.test.ts`)

Subcrews "merge" when two adjacent time windows overlap. Tests cover the window-coalescing math directly; do not depend on prisma here.

---

## Phase 8 Testing Priorities

Phase 8 (launch-readiness re-audit) is in progress. The remaining test-shaped work:

### P0 — E2E Playwright authenticated flows

`e2e/smoke.spec.ts` is anonymous-only. We need authenticated coverage for:

- **Crew flow:** sign in → request Crew → accept on second account → confirm reciprocal Crew visible
- **Meetup flow:** sign in → create Meetup at a venue → invite Crew → RSVP from second account → verify Pusher event delivery
- **Check-in flow:** sign in → check in with `CREW` visibility → confirm second Crew sees it on `/checkins`, non-Crew does not

Use `playwright-config.ts` storage state for the second account. Block this on `DEMO_MODE=true` being available in CI.

### P1 — Sentry coverage validation

Sentry is now wired into 47/59 live routes (per nightly 2026-05-17). The remaining 12 routes need coverage. We need a dedicated audit test (or codemod) that fails CI when a new route under `src/app/api/` is added without a `logError` / `captureException` import. The `sentry-routes.test.ts` and `sentry-spy-assertions.test.ts` patterns from PR #37/#38 are the templates.

### P1 — Quarantine or root-cause the 2 checkins-pusher flakes

`src/__tests__/api/checkins-pusher.test.ts` has two tests that fail intermittently under parallel load. Reproduction is unreliable. Current options:

1. Mark with `.concurrent.skip` until root-caused
2. Add explicit Pusher mock reset in `beforeEach`
3. Move to a dedicated single-threaded shard

No fix has landed yet; the flakes are the only reason the 2026-05-17 build reads 1365/1367.

### P2 — Coverage gaps flagged in recent nightlies

- Heatmap renderer (client component) has no unit tests
- `RichFeedItem.tsx` (717 lines, open in refactor PRs) needs subcomponent tests once split
- `/profile/page.tsx` (623 lines) same

---

## Test Data Fixtures

Live fixtures sit under `prisma/seed-*.ts` and are imported into test setup as needed:

- `prisma/seed-heatmap.ts` — 3 users, Crew triad (lex-ordered), Intents, HeatmapContributions
- `prisma/seed-heatmap-only.ts` — standalone runner (no full reset; PR #92)
- `src/__tests__/setup.ts` — global prisma mock, Sentry mock, Pusher mock, email senders mock, `checkRateLimit` factory mock

Avoid inline fixtures over ~20 lines — promote into `prisma/seed-*.ts` so the heatmap and intent suites can reuse them.

---

## Running Tests

```bash
npm test                       # full suite
npm test -- crew               # filter by pattern
npm test -- --reporter=verbose # full output
npm run test:e2e               # Playwright (chromium)
npm run lint                   # ESLint
npx tsc --noEmit              # type check (faster than full build for test-only changes)
```

For the nightly pipeline pattern (Wave 1 / Wave 2 / Wave 3, mock cast checks, shared-file reservation), see `MEMORY.md` and `docs/agents/CODE_CHECKING_AGENT_GUIDE.md`.

---

## CI/CD Integration

`.github/workflows/ci.yml` runs on every push and PR:

1. `npm ci`
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm test`
5. `npx playwright install chromium --with-deps && npm run test:e2e`

Failure on any step blocks the PR. The Playwright step uploads `playwright-report/` on failure.

Per-PR Neon branches apply `prisma migrate deploy` before the test step. Note two known gotchas (per memory `feedback_neon_pr_workflow_gotchas.md`):

- `create-branch-action@v6` does **not** emit `db_url_with_pooler` — read `db_url` instead
- A FAILED migration sticks on the PR's Neon branch across pushes; closing and reopening the PR is currently the only way to reset

---

## Test Coverage Targets

| Category | Target | Status (2026-05-19) |
|----------|--------|---------------------|
| API route handlers | 80% | ~85% (49/59 routes covered) |
| Lib (pure functions) | 90% | ~92% (sanitize, validations, costs, heatmap, intent, subcrew all covered) |
| Components | 60% | Low — Crew/Meetup/Checkin components have prop-shape tests only |
| E2E (Playwright) | Critical paths | Smoke only; authenticated flows pending Phase 8 |

### Priority by surface

1. **P0 — Auth, Crew, Meetup, Check-in** (must have route + integration coverage; on track)
2. **P1 — Heatmap, Intent, Subcrew** (V1 product surface; covered at lib level, route-level coverage in place)
3. **P2 — Notifications, search, profile** (covered; refactors pending will need re-cover)
4. **P3 — UI animations, admin-only views** (low priority; visual regression deferred)

---

*Last Updated: 2026-05-19*
