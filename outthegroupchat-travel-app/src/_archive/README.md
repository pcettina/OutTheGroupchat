# `src/_archive/` — Stashed trip-planning surface

> **Archived:** 2026-04-16
> **Baseline tag:** `v1.0-trip-planning` (`git checkout v1.0-trip-planning` to recover the full pre-archive state)
> **Canonical plan:** `outthegroupchat-travel-app/docs/REFACTOR_PLAN.md`

## Why this folder exists

OutTheGroupchat started as a group-trip-planning app. In April 2026 the product pivoted to a LinkedIn-style social network for in-person meetups. Rather than delete the trip-planning code — which represents months of tested, hardened infrastructure — it is stashed here.

**Goals of this stash:**
- **Zero runtime footprint** — files here are never bundled, never routed, never imported by live code.
- **Full browsability** — devs can navigate, read, and reason about the archived system without git archaeology.
- **Revivable in a weekend** — if trip-planning becomes a valuable sub-feature of the social network (e.g., "plan a trip with your connections"), the surface is intact.

## How exclusion works

| Layer | Mechanism |
|-------|-----------|
| TypeScript | `tsconfig.json` excludes `src/_archive/**` and `src/**/_archive/**` from `noEmit` check |
| Vitest | `vitest.config.ts` excludes `**/_archive/**` from the default run |
| Next.js routing | Directory names starting with `_` are excluded from App Router file-based routing |
| Webpack/bundler | Nothing here is imported by live code, so it is tree-shaken |
| Prisma | Models used by archived code are marked `@deprecated` in `schema.prisma` but still exist (DB tables intact) |

## Directory layout

```
src/
├── _archive/
│   ├── README.md              ← this file
│   ├── app/
│   │   ├── api/               ← archived trip API routes (trips/, activities/)
│   │   └── trips/             ← archived trip pages
│   ├── components/            ← TripWizard, surveys/, voting/, etc.
│   └── services/              ← recommendation.service, events.service
├── __tests__/
│   └── _archive/              ← archived trip tests
└── ...                        (live social-meetup surface)

docs/
└── archive/
    └── trip-planning/         ← snapshotted trip-era docs
```

## Feature flag

`ENABLE_TRIP_PLANNING` (default `false`) in `.env.example`. This flag is a **signal**, not a toggle — setting it to `true` will NOT reactivate the archived surface because the code is tsconfig-excluded and Next.js won't route `_archive/` paths. Real reactivation requires moving files back out of `_archive/` first via a proper PR.

## Reactivation criteria

Before ever moving code out of `_archive/`, a future session must confirm (per REFACTOR_PLAN.md §4.4):

1. Product evidence: ≥X% of active users explicitly request multi-day trip coordination
2. Connection graph density is proven — trip planning is meaningful only if users have an established social network first
3. Engineering bandwidth: trip surface doesn't distract from the core meetup loop
4. Data migration path if models have drifted

## Running archived tests

Archived tests are excluded from the default Vitest run. To execute them on demand (e.g., during reactivation validation):

```bash
npm run test:archive
```

(Script added in Phase 1 alongside this archive. Runs `vitest run --config vitest.archive.config.ts` which re-enables the `_archive/` paths.)

## Recovery / history

- Full pre-pivot state: `git checkout v1.0-trip-planning`
- Original commit on main: see `git log --all --follow <file>`
- Doc snapshots: `docs/archive/trip-planning/`

## What lives in this archive

| Path | Original location | Purpose |
|------|-------------------|---------|
| `app/api/trips/` | `src/app/api/trips/` | 13 trip API routes |
| `app/api/activities/` | `src/app/api/activities/` | Activity-by-ID CRUD |
| `app/trips/` | `src/app/trips/` | Trip list, detail, new, survey, vote, members pages |
| `components/trips/` | `src/components/trips/` | TripWizard, TripCard, AddActivityModal, etc. |
| `components/surveys/` | `src/components/surveys/` | SurveyBuilder, SurveyForm, QuestionRenderer |
| `components/voting/` | `src/components/voting/` | VotingSession, VotingOption, ResultsChart |
| `services/recommendation.service.ts` | `src/services/recommendation.service.ts` | Trip recommendation engine |
| `services/events.service.ts` | `src/services/events.service.ts` | Ticketmaster/Places/Flights integration |
| `services/recommendation-data.ts` | `src/services/recommendation-data.ts` | Seed data |
| `__tests__/_archive/` | `src/__tests__/api/trips*`, `src/__tests__/services/` | All trip-domain tests |
