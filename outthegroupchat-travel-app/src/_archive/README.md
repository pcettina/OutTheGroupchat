# Trip-Planning Archive

> **Archived 2026-04-16** during social pivot to meetup network (see [docs/REFACTOR_PLAN.md](../../docs/REFACTOR_PLAN.md)).
> Pre-pivot git tag: `v1.0-trip-planning`

This directory (and its sibling `_archive/` folders across the tree) contains code from OutTheGroupchat v1.0 (the group trip-planning app). It is **excluded from TypeScript compilation and test runs** but remains in the repo for:
1. Reference while building the social network features
2. Quick revival if the trip-planning feature becomes worth reactivating

## How exclusion works

| Layer | Mechanism |
|-------|-----------|
| TypeScript | `tsconfig.json` excludes `src/_archive/**` and `src/**/_archive/**` |
| Vitest | `vitest.config.ts` excludes `**/_archive/**` from the default run |
| Next.js routing | `_archive/` prefixed with `_` — App Router ignores these directories |
| Bundler | Nothing archived is imported by live code — fully tree-shaken |
| Prisma | Trip models marked `@deprecated` in `schema.prisma`; DB tables still exist |

## What's Archived

### API Routes (13 files)

Under `src/app/api/_archive/`:

- `trips/route.ts` — trip collection CRUD (GET/POST)
- `trips/[tripId]/route.ts` — single-trip CRUD (GET/PATCH/DELETE)
- `trips/[tripId]/activities/route.ts` — trip activities CRUD
- `trips/[tripId]/flights/route.ts` — flight search (Amadeus)
- `trips/[tripId]/invitations/route.ts` — trip invitations
- `trips/[tripId]/itinerary/route.ts` — itinerary management
- `trips/[tripId]/members/route.ts` — member management
- `trips/[tripId]/recommendations/route.ts` — AI recommendations
- `trips/[tripId]/suggestions/route.ts` — activity suggestions (Places/Ticketmaster)
- `trips/[tripId]/survey/route.ts` — survey CRUD
- `trips/[tripId]/voting/route.ts` — voting sessions
- `activities/[activityId]/route.ts` — activity-by-ID CRUD
- `discover/route.ts` — trip-era discover/search

### Pages (6 files)

Under `src/app/_archive/`:

- `trips/page.tsx` — trip list page
- `trips/loading.tsx` — trip list loading skeleton
- `trips/new/page.tsx` — new trip wizard page
- `trips/[tripId]/page.tsx` — trip detail page
- `trips/[tripId]/survey/page.tsx` — survey page
- `trips/[tripId]/vote/page.tsx` — vote page

### Components (31 files)

Under `src/components/_archive/`:

**trips/** (11 files)
- `TripWizard.tsx`, `TripCard.tsx`, `TripList.tsx`, `TripHeader.tsx`, `TripOverview.tsx`
- `AddActivityModal.tsx`, `InviteMemberModal.tsx`, `InviteModal.tsx`, `ItineraryTimeline.tsx`, `MemberList.tsx`
- `index.ts`

**trips/steps/** (5 files)
- `DestinationStep.tsx`, `DateStep.tsx`, `BudgetStep.tsx`, `MembersStep.tsx`, `index.ts`

**surveys/** (9 files)
- `SurveyBuilder.tsx`, `SurveyForm.tsx`, `QuestionRenderer.tsx`, `index.ts`
- `QuestionTypes/MultipleChoice.tsx`, `QuestionTypes/DateRangePicker.tsx`, `QuestionTypes/RangeSlider.tsx`
- `QuestionTypes/RankingQuestion.tsx`, `QuestionTypes/TextInput.tsx`, `QuestionTypes/index.ts`

**voting/** (7 files)
- `VotingSession.tsx`, `VotingCard.tsx`, `VotingOption.tsx`, `VotingDeadline.tsx`
- `CreateVotingModal.tsx`, `ResultsChart.tsx`, `index.ts`

### Services (3 files)

Under `src/services/_archive/`:

- `recommendation.service.ts` — trip recommendation engine
- `events.service.ts` — Ticketmaster / Places / Flights integration
- `recommendation-data.ts` — seed data for recommendations

### Tests (20 files)

Under `src/__tests__/_archive/`:

**api/** (17 files)
- `trips.test.ts`, `trips-tripid.test.ts`, `trips-members.test.ts`, `trips-invitations.test.ts`
- `trips-tripid-invitations.test.ts`, `trips-tripid-recommendations.test.ts`
- `trips-activities-itinerary.test.ts`, `trips-itinerary.test.ts`
- `trips-flights.test.ts`, `trips-suggestions.test.ts`, `trips-suggestions-flights.test.ts`
- `trips-voting.test.ts`, `trips-survey-voting-extended.test.ts`
- `survey.test.ts`, `voting.test.ts`, `activities.test.ts`, `discover.test.ts`

**lib/** (1 file)
- `recommendation.service.test.ts`

**services/** (2 files)
- `recommendation.service.test.ts`, `survey.service.test.ts`

## Prisma Models (deprecated, not deleted)

All trip-domain Prisma models are marked `@deprecated` in `prisma/schema.prisma`. DB tables still exist and data is preserved.

Models: `Trip`, `TripMember`, `TripInvitation`, `PendingInvitation`, `TripSurvey`, `SurveyResponse`, `VotingSession`, `Vote`, `Activity`, `SavedActivity`, `ActivityComment`, `ActivityRating`, `ItineraryDay`, `ItineraryItem`, `ExternalActivity`, `DestinationCache`.

## What Was Preserved (live, untouched)

Auth, User, Follow, Notification, Feed (TripComment/TripLike being generalized), Pusher, rate limiting, Sentry, CI, and all test infrastructure.

## Revival Instructions

To reactivate trip planning:

1. `git checkout v1.0-trip-planning` to see the full original state
2. Move API routes: `src/app/api/_archive/trips/` → `src/app/api/trips/` (and `activities/`, `discover/`)
3. Move pages: `src/app/_archive/trips/` → `src/app/trips/`
4. Move components: `src/components/_archive/{trips,surveys,voting}/` → `src/components/{trips,surveys,voting}/`
5. Move services: `src/services/_archive/` → `src/services/`
6. Move tests: `src/__tests__/_archive/` → `src/__tests__/`
7. Remove `src/_archive/**` and `src/**/_archive/**` exclusions from `tsconfig.json`
8. Remove `**/_archive/**` exclusion from `vitest.config.ts`
9. Remove `@deprecated` from trip Prisma models
10. Set `ENABLE_TRIP_PLANNING=true` in `.env` as a signal (note: flag alone does NOT revive routes — the file moves above are required)
11. Run `npm install && npx prisma generate && npm test` to verify

## Compatibility Notes (as of 2026-04-16)

- `Navigation.tsx`: `/trips` and `/saved` links replaced with `/connections` and `/meetups` placeholders — revival requires restoring nav links
- `middleware.ts`: Trip route matchers removed — revival requires re-adding them
- `src/__tests__/setup.ts`: Trip model mocks retained from pre-archive (still present in the mocked Prisma client)
- External API keys required for full functionality: `AMADEUS_*` (flights), `TICKETMASTER_API_KEY` (events), `PLACES_API_KEY` (places)

## Running Archived Tests

Archived tests are excluded from the default Vitest run. To execute them on demand during reactivation validation:

```bash
npm run test:archive
```

This runs `vitest run --config vitest.archive.config.ts` which re-enables `_archive/` paths.
