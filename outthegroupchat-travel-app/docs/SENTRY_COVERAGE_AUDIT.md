# Sentry Coverage Audit

**Last updated:** 2026-05-09 (Nightly Build)
**Scope:** Live API routes under `src/app/api/` (excludes `_archive/`)

## Summary

| Metric | Value |
|--------|-------|
| Total live routes | 59 |
| Routes with `captureException` | **44** |
| Coverage | **74.6%** |
| Routes still uninstrumented | 15 |

This audit counts a route as instrumented if it imports `captureException` from `@/lib/sentry` and calls it in at least one catch block. Sentry DSN is still missing in Vercel production (see `docs/OPS_LAUNCH_CHECKLIST.md`); instrumentation is in place but events are not yet shipped.

## Tonight's additions (2026-05-09)

The following V1 hot paths gained Sentry instrumentation in this build:

| Route | Methods | Notes |
|-------|---------|-------|
| `src/app/api/profile/route.ts` | GET, PUT | User profile read/update — high traffic |
| `src/app/api/search/route.ts` | GET | People-first search — high traffic |
| `src/app/api/users/me/route.ts` | GET, PATCH | Self-profile endpoint |
| `src/app/api/users/[userId]/route.ts` | GET, PATCH | Public user view + Crew label updates |
| `src/app/api/pusher/auth/route.ts` | POST | Pusher channel auth (real-time gate) |

## Routes still without Sentry (15)

Grouped by priority for the next pass.

### Priority 1 — V1-relevant (instrument next)

None remaining. All V1 hot paths now instrumented after tonight.

### Priority 2 — Auxiliary (instrument when touched)

| Route | Reason for delay |
|-------|------------------|
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth handler — error path is library-controlled. Instrument via NextAuth `events.error` instead. |
| `src/app/api/cron/route.ts` | Legacy cron — being superseded by `cron/expire-intents` and `cron/meetup-starting-soon`. Decide deprecation before instrumenting. |
| `src/app/api/health/route.ts` | Health endpoint — failures should already surface via uptime monitoring. Low marginal value. |
| `src/app/api/geocoding/route.ts` | Map-adjacent. Worth instrumenting in next pass once usage frequency confirmed. |

### Priority 3 — Trip-era residual (likely to be archived/deprecated)

These routes survive on main but belong to the trip-planning surface that the V1 pivot is moving away from. Defer Sentry until ownership is decided.

| Route | Status |
|-------|--------|
| `src/app/api/discover/import/route.ts` | Trip-era discover surface |
| `src/app/api/discover/recommendations/route.ts` | Trip-era discover surface |
| `src/app/api/discover/search/route.ts` | Trip-era discover surface |
| `src/app/api/inspiration/route.ts` | Trip-era inspiration feed |
| `src/app/api/invitations/[invitationId]/route.ts` | Trip-era invitation flow |
| `src/app/api/invitations/route.ts` | Trip-era invitation flow |
| `src/app/api/images/search/route.ts` | Trip-era — Unsplash for activity photos |
| `src/app/api/newsletter/subscribe/route.ts` | Marketing — low risk, low priority |

### Priority 4 — Beta/admin

| Route | Notes |
|-------|-------|
| `src/app/api/beta/initialize-password/route.ts` | Admin-only (N8N_API_KEY gate) |
| `src/app/api/beta/signup/route.ts` | Beta gate — low traffic |
| `src/app/api/beta/status/route.ts` | Read-only — already has Redis rate limiter |

## Instrumentation pattern

For consistency, all routes follow this pattern in their `catch` blocks:

```ts
import { captureException } from '@/lib/sentry';
// ...
} catch (error) {
  captureException(error);
  logger.error({ error }, '[ROUTE_NAME] Friendly description');
  return NextResponse.json({ error: '...' }, { status: 500 });
}
```

`captureException` is a thin wrapper in `src/lib/sentry.ts` that no-ops when DSN is missing. It is safe to call in tests — `vi.mock('@/lib/sentry')` is set globally in `src/__tests__/setup.ts`.

## Phase 8 exit criterion #6

This audit document closes the "produce a count of `route.ts` files using `captureException` vs total" half of Phase 8 launch-readiness recommendation #5 from the 2026-05-08 nightly report. The remaining work is:

1. Set Sentry DSN in Vercel production env (blocks all `captureException` events from reaching Sentry).
2. Instrument the 4 Priority 2 routes once DSN is live and we can verify ingestion.
3. Make a deprecation/archive decision on the 8 Priority 3 trip-era routes — instrumenting them is wasted effort if they will be archived in Phase 1 cleanup follow-up.
