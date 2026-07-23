# OutTheGroupchat — Full Codemap

> Auto-generated 2026-03-10. Last updated 2026-07-22 (**NIGHTLY nightly/2026-07-22 — Day 11 "Meetup depth: edit/cancel + .ics + @mentions"** (BUILD_PLAN.md): rounded out the durable Meetup surface. NEW `src/app/api/meetups/[id]/ics/route.ts` (GET) returns an RFC 5545 `VCALENDAR` (`text/calendar` attachment) with time + venue. MODIFIED `src/app/api/meetups/[id]/route.ts` — the existing host-only PATCH + DELETE now fire fail-soft attendee notifications (`type: SYSTEM` + `data.kind` `MEETUP_UPDATED`/`MEETUP_CANCELLED`) alongside the Pusher broadcasts. NEW `src/components/meetups/EditMeetupModal.tsx` + "Add to calendar" anchor mounted on `src/app/meetups/[id]/page.tsx`. NEW pure `src/lib/mentions.ts`; `@handle` mention parse + notify wired into `src/app/api/feed/comments/route.ts` (a mention notification fires per mentioned user), with mention links rendered in `src/components/feed/CommentThread.tsx`. No `schema.prisma`/`setup.ts` changes needed (all delegates already present). NEW test files `src/__tests__/lib/mentions.test.ts` (18), `src/__tests__/api/feed-comments-mentions.test.ts` (5), `src/__tests__/api/meetup-ics.test.ts` (19), `src/__tests__/api/meetup-notify.test.ts` (8). Validation: tsc 0, lint 0/0, prisma valid, full vitest 2223/2223. Stats: **69 live API routes (82 raw route.ts), 114 vitest-active test files, 2223 tests passing, ~375 TS/TSX files excluding `_archive`**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0. PR https://github.com/pcettina/OutTheGroupchat/pull/151. Prior: 2026-07-21 (**NIGHTLY nightly/2026-07-22 — Day 10 "Growth: FoF Crew suggestions + ping nearby"** (BUILD_PLAN.md): reused the FoF graph for friend suggestions and let users nudge nearby checked-in Crew. NEW `src/app/api/crew/suggestions/route.ts` (GET) reusing `src/lib/heatmap/fof-graph.ts` — "People you may know" ranked by mutual count, excluding existing/PENDING Crew + blocked users (block filter degrades gracefully if `UserBlock` is absent); auth → rate-limit → Zod → Sentry. NEW `src/components/crew/SuggestionCard.tsx` + a suggestions block on `src/app/crew/page.tsx` with inline Add (POST `/api/crew/request`). NEW `src/app/api/checkins/ping/route.ts` (POST) pings active accepted-Crew check-ins near the caller → `CREW_CHECKED_IN_NEARBY` notifications; rate-limited via the existing `checkRateLimit`. MODIFIED `src/components/checkins/NearbyCrewList.tsx` — Ping buttons + a defensive feed-shape read (`/api/checkins/feed` returns a bare array while the component expected `{items}`). SECURITY FIX: `src/app/api/feed/comments/route.ts` GET previously had NO auth check (unauthenticated comment enumeration) — added a `getServerSession()` 401 guard. No `schema.prisma`/`setup.ts` changes needed (`CREW_CHECKED_IN_NEARBY` enum + all mocks already present). NEW test files `src/__tests__/api/crew-suggestions.test.ts` (14), `src/__tests__/api/checkins-ping.test.ts` (15); MODIFIED `src/__tests__/api/feed-comments-engagement.test.ts` (+1 GET-401 regression; 6 pre-existing GET tests updated to supply a session). Validation: tsc 0, lint 0/0, prisma valid, full vitest 2173/2173; `npm run build` deliberately not run (Next type-check worker crashes on this Windows host, 0xC0000374 — known env flake). Stats: **68 live API routes (81 raw route.ts), 110 vitest-active test files, 2173 tests passing, ~371 TS/TSX files excluding `_archive`**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0. PR https://github.com/pcettina/OutTheGroupchat/pull/150. Prior: 2026-07-20 (**NIGHTLY nightly/2026-07-21 — Day 9 "Search comes alive + Topic discovery"** (BUILD_PLAN.md): mounted the orphaned search surface and added a browse-by-Topic discovery page. NEW `src/app/search/page.tsx` + `src/app/search/searchPageLogic.ts` wire `/search` to the existing `GET /api/search`; `src/components/search/SearchResults.tsx` was rewritten for the `user|meetup|venue` union (it previously handled `trip|activity|user` with dead `/trips/:id` + `/activities/:id` hrefs; venue rows render non-navigable because no venue route exists) and `src/components/search/SearchFilters.tsx` was reduced from a trip filter panel (destination/budget/groupSize) to a result-type selector over the real API enum built from `FilterChip`; `src/components/search/index.ts`, `src/components/Navigation.tsx` (adds `/search` Search icon + `/topics` Hash icon, `/discover` re-iconed to Compass to keep icons unique) and `src/middleware.ts` (matcher gains `/search/:path*` + `/topics/:path*`) updated; markup migrated slate/emerald → `otg-*` tokens. NEW `src/app/topics/page.tsx` + `src/app/topics/topicsPageLogic.ts`; `src/app/api/topics/route.ts` signature is now `GET(req?: Request)` (bare `GET()` still works) with an opt-in Zod-validated `?withCounts=true` adding an additive `count` per Topic from one `prisma.intent.groupBy({by:['topicId'], where:{expiresAt:{gt:now}}, _count:{_all:true}})` — fail-soft to `count: 0` on groupBy failure because this endpoint gates signup/onboarding; the default envelope is unchanged for its 3 existing consumers. Known limitation: Topic tiles deep-link to `/intents/new` WITHOUT topic prefill (`IntentCreateForm` reads only `?window=`), centralized in `buildTopicIntentHref()`. BUG FIX: `formatSignalCount()` in `topicsPageLogic.ts` guarded `count <= 0` before flooring, so a fractional count in (0,1) rendered a bare "0 Crew signaled" instead of "Be the first to signal" — now floors first, then guards. NEW test files `src/__tests__/api/topics-counts.test.ts` (12), `src/__tests__/search-page-logic.test.ts` + `src/__tests__/topics-page-logic.test.ts` (99 combined); `src/__tests__/setup.ts` gained an additive `prisma.intent.groupBy` mock. Validation: tsc 0, lint 0/0, prisma valid, full vitest 2143/2143; `npm run build` deliberately not run (Next type-check worker crashes on this Windows host, 0xC0000374 — known env flake). Stats: **66 live API routes (79 raw route.ts, unchanged — no new API routes), 108 vitest-active test files, 2143 tests passing, ~369 TS/TSX files excluding `_archive`**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0. PR https://github.com/pcettina/OutTheGroupchat/pull/149. Prior: 2026-07-20 (**NIGHTLY nightly/2026-07-20 — Day 8 "Tighten the notification loop"** (BUILD_PLAN.md): made the pull-back-in mechanics reachable and one-tap. NEW `src/components/notifications/PerMemberIntentToggle.tsx` mounted on `src/app/crew/page.tsx` + `src/app/profile/[userId]/page.tsx`, writing `NotificationPreference.perMemberTargets` through `PATCH /api/users/notification-preferences` (read-modify-write, optimistic update + rollback on failure). Daily prompt deep link: `src/lib/notifications/daily-prompt.ts` actionUrl → `/intents/new?window=EVENING` and now exports `PROMPT_WINDOW_PRESET` + `PROMPT_LINK`; `src/components/intents/IntentCreateForm.tsx` parses `?window=` case-insensitively, falls back on unknown values, and is Suspense-wrapped. Anonymous-floor live feedback: NEW `GET /api/heatmap/contributor-count` (`src/app/api/heatmap/contributor-count/route.ts`) — auth → rate limit → Zod, returns only `{count, floor, meetsFloor, cellResolved}` — backed by NEW `src/lib/heatmap/contributor-count.ts` and NEW shared `src/lib/heatmap/anonymous-floor.ts`; `src/components/privacy/PrivacyPickerModal.tsx` disables Anonymous with the R14 explanation below the N≥3 floor and fails safe while loading/erroring; `src/components/subcrews/SubCrewCoordinationPanel.tsx` passes `venueId`/`cityArea`/`contributionType` so the check is live, and `src/lib/heatmap/aggregate.ts` imports the shared `ANONYMOUS_FLOOR` instead of its own literal. BUG FIX: `src/components/settings/NotificationPreferencesForm.tsx` was handing the whole `{success, data:{preferences}}` envelope to a parser requiring an array, so the settings page ALWAYS rendered empty preferences — now unwrapped defensively. NEW test files `src/__tests__/api/heatmap-contributor-count.test.ts` (24), `src/__tests__/components/notification-preferences-form.test.ts` (20); extended `src/__tests__/api/notification-preferences.test.ts` (+13) and `src/__tests__/lib/daily-prompt.test.ts` (+1); no `setup.ts` mock changes needed. Validation: tsc 0, lint 0/0, prisma valid, full vitest 2032/2032. Stats: **66 live API routes (79 raw route.ts), 105 vitest-active test files, 2032 tests passing, 366 TS/TSX files excluding `_archive`**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0. PR https://github.com/pcettina/OutTheGroupchat/pull/148. Prior: 2026-07-19 (**NIGHTLY nightly/2026-07-19 — Day 7 "Activation: real onboarding + empty/error states"** (BUILD_PLAN.md): got a brand-new user from signup to their first Intent without hitting blank surfaces. Onboarding data layer: additive `User.onboardedAt DateTime?` in `prisma/schema.prisma`; NEW `POST/GET /api/users/onboarding` (`src/app/api/users/onboarding/route.ts`) — GET returns `{onboarded, onboardedAt}`, POST stamps `onboardedAt=now` (idempotent); guard chain auth → rate-limit → Zod → Sentry → pino. `src/app/auth/signup/page.tsx` now redirects brand-new signups to `/onboarding` (explicit `callbackUrl` still honored). Onboarding UI: NEW 3-step `/onboarding` client flow (`src/app/onboarding/page.tsx`) Topics → Crew → first Intent; the dead trip-era `src/components/onboarding/InterestSelector.tsx` was REWRITTEN into a real Topic selector (fetches `GET /api/topics`); NEW `OnboardingCrewStep.tsx`, `OnboardingIntentStep.tsx` (reuses `IntentCreateForm`), `onboardingFlow.ts` (framework-free gating/completion helpers); barrel `index.ts` updated; flow marks `POST /api/users/onboarding` then lands on `/intents`, self-skips via GET if already onboarded. Empty/error states: NEW shared `src/components/ui/ErrorBanner.tsx` (role=alert, Retry/Dismiss, exported from `ui/index.ts`); the feed's two silent catches now surface a visible `ErrorBanner` with Retry; `src/app/intents/page.tsx`, `src/app/subcrews/[id]/page.tsx`, `src/app/feed/page.tsx` empty `<p>` blocks converted to the shared `EmptyState` with CTAs; intents now surfaces endpoint-level `success:false`. NEW test files `src/__tests__/api/onboarding.test.ts` (13), `src/__tests__/onboarding-flow.test.ts` (12), `src/__tests__/components/empty-error-states.test.ts` (5); no `setup.ts` mock changes needed (`onboardedAt` is a scalar on the existing `user` mock). Validation: tsc 0, lint 0/0, prisma valid, full vitest 1976/1976. Stats: **78 raw route.ts files (was 77), 103 vitest-active test files, 1976 tests passing, ~429 TS/TSX files**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0. PR https://github.com/pcettina/OutTheGroupchat/pull/147. Prior: 2026-07-17 (**NIGHTLY nightly/2026-07-17 — Day 6 "Trust & Safety II: report + anti-spam"** (BUILD_PLAN.md): reporting flow + creation-abuse throttles. NEW additive `Report` model + `ReportReason`/`ReportStatus`/`ReportTargetType` enums in `prisma/schema.prisma`. NEW `POST/GET /api/reports` (`src/app/api/reports/route.ts`) — POST files a report against a user or meetup (self-report guard → 400, target-exists → 404, duplicate report idempotent → 200, else create → 201); GET is an admin-only list (allowlist via `ADMIN_USER_IDS` env, optional `?status` filter); Zod + `getServerSession()` + Sentry + pino. NEW UI `src/components/safety/ReportButton.tsx` mounted on `src/app/profile/[userId]/page.tsx` + meetup detail (non-host). Anti-spam: NEW `creationQuotaLimiter` (10/user/24h, prefix `ratelimit:creation`) in `src/lib/rate-limit.ts`, layered as a stricter daily-quota 429 + high-frequency-creator warn onto `src/app/api/meetups/route.ts` (`meetup-create-daily` key) and `src/app/api/crew/request/route.ts` (`crew-request-daily` key) — no duplicate limiter on the same key. NEW test file `src/__tests__/api/reports.test.ts` (15) + daily-quota 429 (2); the `report` prisma mock was already in `src/__tests__/setup.ts`. Validation: tsc 0, lint 0/0, prisma valid, full vitest 1946/1946. Stats: **77 raw route.ts files (was 76), 100 vitest-active test files, 1946 tests passing, ~426 TS/TSX files**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0. PR https://github.com/pcettina/OutTheGroupchat/pull/146. Prior: 2026-07-16 (**NIGHTLY nightly/2026-07-16 — Day 5 "Trust & Safety I: block a user"** (BUILD_PLAN.md): baseline safety for a social + location product. NEW `prisma.UserBlock` model (`blockerId`/`blockedId`, unique pair, back-relations `blocksInitiated`/`blocksReceived`) + additive idempotent migration `prisma/migrations/20260716100000_add_user_block/`. NEW `POST/DELETE /api/users/[userId]/block` (`src/app/api/users/[userId]/block/route.ts`) — POST blocks, DELETE unblocks, both idempotent; blocking auto-severs any existing Crew edge; 401/400/404/429 guards; Zod + `getServerSession()` + Sentry + pino. **Mutual block enforcement** added to the four read surfaces so a blocked pair sees nothing of each other (no partial leak): `src/app/api/crew/route.ts`, `src/app/api/feed/route.ts`, `src/lib/heatmap/aggregate.ts`, `src/app/api/checkins/feed/route.ts`. NEW UI `src/components/safety/BlockButton.tsx` wired into `src/app/profile/[userId]/page.tsx` + `src/app/crew/page.tsx`. NEW test files `src/__tests__/api/user-block.test.ts` (12) + `src/__tests__/api/block-enforcement.test.ts` (8). Validation: tsc 0, lint 0/0, prisma valid, full vitest 1929/1929; `next build` compiles OK but the Next 14.2.35 type-check worker env-crashes on this Windows host (exit 0xC0000374, heap corruption) — an environment flake, not a code defect. Stats: **63 live API routes (excl. `_archive`; 76 raw route.ts), 121 vitest-active test files, 1929 tests passing, 424 TS/TSX files**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0. PR https://github.com/pcettina/OutTheGroupchat/pull/145. Prior: 2026-07-13 (**NIGHTLY nightly/2026-07-13 — Day 4 "Per-relationship privacy defaults"** (BUILD_PLAN.md): made R4/R20 reachable. NEW `GET/PATCH /api/users/relationship-settings` (`src/app/api/users/relationship-settings/route.ts`) — GET lists the viewer's per-Crew-member privacy settings (default BLOCK granularity / KNOWN identity), PATCH upserts `granularity`+`identityMode` per `targetId` (Zod enums), 403 for a non-Crew target; Zod + `getServerSession()` + Sentry. `lib/heatmap/aggregate.ts` already reads `CrewRelationshipSetting`; this Day adds the write path. NEW UI `src/components/privacy/RelationshipSettingsList.tsx` mounted at NEW subroute `src/app/settings/privacy/relationships/page.tsx`, linked from `src/app/settings/privacy/page.tsx`. NEW test file `src/__tests__/api/relationship-settings.test.ts` (16). Validation green: build PASS, lint 0/0, tsc 0, prisma valid. Stats: **62 live API routes, 119 vitest-active test files, 1909 tests passing, 416 TS/TSX files**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0. PR https://github.com/pcettina/OutTheGroupchat/pull/144. Prior: 2026-07-11 (**NIGHTLY nightly/2026-07-11 — Day 3 "SubCrew graduates into a Meetup"** (BUILD_PLAN.md): closed the intent→group funnel. `PATCH /api/subcrews/[id]` (`src/app/api/subcrews/[id]/route.ts`) now calls `graduateSubCrewToMeetup` (NEW `src/lib/subcrews/graduate-to-meetup.ts`); when a SubCrew has both `startAt` and `venueId` it creates one CREW `Meetup` (`scheduledAt=startAt`, `endsAt=endAt`), links all `SubCrewMember`s as `MeetupAttendee`s, and sets `SubCrew.meetupId`. Idempotent (transaction + `updateMany` claim + `@unique`); PATCH response gains `meetup`+`graduated`. `src/components/subcrews/SubCrewCoordinationPanel.tsx` shows a graduated banner + "View Meetup" link. NEW test file `src/__tests__/api/subcrew-graduation.test.ts` (13); two Prisma mocks added to `src/__tests__/setup.ts` (`subCrew.updateMany`, `meetupAttendee.createMany`). First normal execution night after the 7-night escalation hold ended (main fast-forwarded to `d2a18ed`). Validation green: build PASS, lint 0/0, tsc 0, prisma valid. Stats: **74 live API routes, 118 vitest-active test files, 414 TS files**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0. PR pending. Prior: 2026-06-30 (**NIGHTLY nightly/2026-06-30 — Day 2 "Make 'hot' visible + persist the chosen venue"** (BUILD_PLAN.md): surfaced the real hotness signal in the UI and persisted the SubCrew's chosen venue. New component `src/components/subcrews/HotNowBadge.tsx` renders a "🔥 Hot now" badge (threshold `hotnessBoost` ≥ 1.15) + contributor-count chip, wired into `src/components/subcrews/RecommendationsList.tsx` and `src/components/heatmap/HeatmapMap.tsx`. `src/components/subcrews/SubCrewCoordinationPanel.tsx` gained a venue selector that PATCHes the existing `/api/subcrews/[id]` `venueId` field (no new API). New test files `src/__tests__/api/subcrews-venue.test.ts` (10) + `src/__tests__/components/hot-now-badge.test.ts` (9). Validation green: build PASS, lint 0/0, tsc 0, **1880 tests / 95 files**, prisma valid. Stats: **61 live API routes, 95 vitest-active test files, 1880 tests passing**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | files >600 lines (active): 0. PR pending. Prior: 2026-06-29 (**NIGHTLY nightly/2026-06-30 — Day 1 "Hotness signal goes live"** (BUILD_PLAN.md): implemented the real `computeHotnessBoost` in `src/lib/hotness/score.ts` (was a literal `return 1.0` stub) — pure, injectable clock, density-derived multiplier in [1.0, 2.5]; wired it into `src/app/api/recommendations/route.ts` ranking with `weightByCrew` active + a 5-min cache keyed by `(topicId, cityArea)`. New test file `src/__tests__/lib/hotness-score.test.ts` (16) + recommendations route boost-reorder tests (+3) + repaired recommendations-edge/v1-misc fixtures. Validation green: build PASS, lint 0/0, **1861 tests / 93 files**, prisma valid. Stats: **61 live API routes, 93 vitest-active test files, 1861 tests passing, ~335 active (non-archive) TS/TSX files**; `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | files >600 lines (active): 0 (largest 513). See PR https://github.com/pcettina/OutTheGroupchat/pull/134. Prior: 2026-06-17 (**NIGHTLY nightly/2026-06-17** — tenth consecutive lean escalation-guard night; **no production code changed** (tree byte-identical to the 06-16 tip). `main` is **10 nightlies / 11 commits behind (06-08 → 06-17)** the clean linear tip — a single human `git merge --ff-only origin/nightly/2026-06-17` into `main` + closing the superseded PRs #122→#130 is the only unblock (one ff-merge collapses the whole chain). **Recommend pausing the nightly scheduler until `main` advances** — ten lean nights have added zero code value. Re-verified green: 1863 tests / 93 files, build PASS, lint 0/0, tsc 0, prisma valid; all stats flat. Prior: 2026-06-16 (nightly/2026-06-16) — ninth consecutive lean escalation-guard night; no production code changed (tree byte-identical to the 06-15 tip). Prior: 2026-06-15 (nightly/2026-06-15) — eighth consecutive lean escalation-guard night; no production code changed (tree byte-identical to the 06-14 tip). Prior: 2026-06-14 (nightly/2026-06-14) — seventh consecutive lean escalation-guard night; no production code changed (tree byte-identical to the 06-13 tip). Prior: 2026-06-13 (nightly/2026-06-13) — sixth consecutive lean escalation-guard night; no production code changed (tree byte-identical to the 06-12 tip). Prior: 2026-06-12 (nightly/2026-06-12) — lean quality-only build; one code change: `.github/workflows/ci.yml` now runs `npm run build` (with `CI: 'true'`) **before** the Playwright E2E step, so the production `webServer` (`npm run start`) the authenticated-flow suite depends on has a `.next` build to serve — wiring the verified `e2e/authenticated-flow.spec.ts` (16/16 local) to run on every PR and closing prior rec #4. No test files added; active TS/TSX count corrected 333 → 334 (+1 drift). Prior: 2026-06-11 (nightly/2026-06-11) — edge/security test-depth build: +49 tests (check-in privacy/stalking-mitigation 22, meetup authz 27); 7 unused imports removed; **Phase 8 action #5 (E2E authenticated flows) now PASSES 16/16 in a real Chromium browser**.). Main stats: 61 live API routes (excluding `_archive`), 93 vitest-active test files, 1863 tests passing, 334 active (non-archive) TS/TSX files, +16 Playwright E2E tests in `e2e/` (passing 16/16 in a real browser, now also wired into CI behind a production build, run separately, not counted in the 1863). Comprehensive reference for agents and developers.
>
> **2026-05-16 additions:** New directories `src/components/meetups/createMeetup/` (CreateMeetupModal split), `src/components/inspiration/` (inspiration page split), and `src/lib/inspiration/` (inspiration handlers extracted from the route). Files >600 lines: 2 — `RichFeedItem.tsx` and `profile/page.tsx` (refactors land in unmerged PR #108).
>
> **🔀 Pivot in progress:** See `docs/REFACTOR_PLAN.md`. Trip-planning surface archived under `_archive/` directories as of Phase 1 (2026-04-16). See [Archived surface (Phase 1)](#archived-surface-phase-1) section below and `src/_archive/README.md` for the preservation scheme.
>
> **Naming locked 2026-04-17:** Relationship entity is `Crew` (not `Connection`). Nightly build scaffolded as `Connection`; Phase 2 PR on `refactor/phase-2-crew-domain` renames to `Crew`. User-facing term defaults to "Crew" but is personalizable via `User.crewLabel String? @db.VarChar(20)` (1–20 chars). See REFACTOR_PLAN §3.5.

## Table of Contents

- [Project Overview](#project-overview)
- [Directory Structure](#directory-structure)
- [Tech Stack & Dependencies](#tech-stack--dependencies)
- [Configuration Files](#configuration-files)
- [Prisma Data Model](#prisma-data-model)
- [Authentication](#authentication)
- [API Routes](#api-routes)
- [Pages (App Router)](#pages-app-router)
- [Components](#components)
- [Libraries & Utilities](#libraries--utilities)
- [Services](#services)
- [Hooks & Contexts](#hooks--contexts)
- [Types](#types)
- [Tests](#tests)
- [E2E Tests](#e2e-tests)
- [Codebase Health](#codebase-health)

---

## Project Overview

Full-stack Next.js 14 meetup-centric social network — **"the social media app that wants to get you off your phone."** The core loop: a user builds a persistent, mutual **Crew** graph, signals an **Intent** on a **Topic** ("who wants to grab dinner this week?"), and when ≥2 Crew share the same Topic the app **auto-forms a sub-crew** and helps them coordinate a real-world **Meetup** at a venue (Google Places search, RSVP, invite, Pusher real-time, starting-soon cron). **Check-ins** broadcast live presence ("who's out tonight?") to Crew with privacy controls, and a **heatmap** (MapLibre + OpenFreeMap) visualizes Crew/friend-of-friend activity. The social **feed** is rescoped to meetup/check-in activity. Trip-planning, the app's prior identity, is archived under `_archive/` (see REFACTOR_PLAN.md) and is not part of the live surface.

**App root:** `outthegroupchat-travel-app/`
**Source:** `outthegroupchat-travel-app/src/`
**Current stats (2026-07-22):** 69 live API routes (excluding `_archive`; 82 raw route.ts — +1, Day 11 added `meetups/[id]/ics`) | 114 vitest-active test files | 2223 tests passing | ~375 TS/TSX files (excluding `_archive`) | `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | tsc: 0 errors | lint: 0/0 | prisma: valid. Day 11 of BUILD_PLAN.md rounded out the durable Meetup surface: NEW `GET /api/meetups/[id]/ics` (RFC 5545 `VCALENDAR`, `text/calendar` attachment, time + venue); `PATCH`/`DELETE /api/meetups/[id]` now fire fail-soft attendee notifications (`type: SYSTEM` + `data.kind` `MEETUP_UPDATED`/`MEETUP_CANCELLED`) on edit/cancel, with NEW `src/components/meetups/EditMeetupModal.tsx` + "Add to calendar" anchor on `src/app/meetups/[id]/page.tsx`; `POST /api/feed/comments` parses `@handle` mentions via NEW pure `src/lib/mentions.ts` (mention notification per mentioned user) with mention links rendered in `src/components/feed/CommentThread.tsx`. NEW test files `src/__tests__/lib/mentions.test.ts` (18), `src/__tests__/api/feed-comments-mentions.test.ts` (5), `src/__tests__/api/meetup-ics.test.ts` (19), `src/__tests__/api/meetup-notify.test.ts` (8). No `schema.prisma`/`setup.ts` changes. PR https://github.com/pcettina/OutTheGroupchat/pull/151.

**Previous stats (2026-07-21, Day 10):** 68 live API routes (excluding `_archive`; 81 raw route.ts — +2, Day 10 added `crew/suggestions` + `checkins/ping`) | 110 vitest-active test files | 2173 tests passing | ~371 TS/TSX files (excluding `_archive`) | `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | tsc: 0 errors | lint: 0/0 | prisma: valid. Day 10 of BUILD_PLAN.md shipped Growth: NEW `GET /api/crew/suggestions` (FoF "People you may know" from `src/lib/heatmap/fof-graph.ts`, ranked by mutual count, excluding existing/PENDING Crew + blocked users; block filter degrades gracefully if `UserBlock` absent) driving a suggestions block on `/crew` via NEW `src/components/crew/SuggestionCard.tsx` with inline Add; NEW `POST /api/checkins/ping` (pings active accepted-Crew check-ins near the caller → `CREW_CHECKED_IN_NEARBY` notifications, rate-limited) with Ping buttons + a defensive feed-shape read on `NearbyCrewList.tsx`. SECURITY FIX: `GET /api/feed/comments` gained a `getServerSession()` 401 guard (was unauthenticated). NEW test files `src/__tests__/api/crew-suggestions.test.ts` (14), `src/__tests__/api/checkins-ping.test.ts` (15); `feed-comments-engagement.test.ts` +1 GET-401 regression (6 pre-existing GET tests updated to supply a session). No `schema.prisma`/`setup.ts` changes. PR https://github.com/pcettina/OutTheGroupchat/pull/150.

**Previous stats (2026-07-20, Day 9):** 66 live API routes (excluding `_archive`; 79 raw route.ts — unchanged, Day 9 added no API routes) | 108 vitest-active test files | 2143 tests passing | ~369 TS/TSX files (excluding `_archive`) | `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | tsc: 0 errors | lint: 0/0 | prisma: valid. Day 9 of BUILD_PLAN.md mounted search and added Topic discovery: NEW `/search` page (`src/app/search/page.tsx` + `searchPageLogic.ts`) against the existing `GET /api/search`, with `SearchResults` rewritten for the `user|meetup|venue` union and `SearchFilters` reduced to a result-type selector over the real API enum (venue rows non-navigable — no venue route); NEW `/topics` browse page (`src/app/topics/page.tsx` + `topicsPageLogic.ts`) backed by an additive opt-in `?withCounts=true` on `GET /api/topics` (one `prisma.intent.groupBy` for live-Intent counts, fail-soft to `count: 0`, default envelope unchanged); `Navigation.tsx` + `middleware.ts` updated for both routes. BUG FIX: `formatSignalCount()` guarded `count <= 0` before flooring, so a fractional count in (0,1) rendered "0 Crew signaled" instead of "Be the first to signal". NEW test files `src/__tests__/api/topics-counts.test.ts` (12), `src/__tests__/search-page-logic.test.ts` + `src/__tests__/topics-page-logic.test.ts` (99 combined); `setup.ts` gained an additive `prisma.intent.groupBy` mock. PR https://github.com/pcettina/OutTheGroupchat/pull/149.

**Previous stats (2026-07-20, Day 8):** 66 live API routes (excluding `_archive`; 79 raw route.ts) | 105 vitest-active test files | 2032 tests passing | 366 TS/TSX files (excluding `_archive`) | `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | tsc: 0 errors | lint: 0/0 | prisma: valid. Day 8 of BUILD_PLAN.md tightened the notification loop: NEW `PerMemberIntentToggle.tsx` on `/crew` + `/profile/[userId]` writes `NotificationPreference.perMemberTargets` via `PATCH /api/users/notification-preferences` (read-modify-write, optimistic + rollback); the daily prompt now deep-links to `/intents/new?window=EVENING` (`src/lib/notifications/daily-prompt.ts` exports `PROMPT_WINDOW_PRESET` + `PROMPT_LINK`) and `IntentCreateForm.tsx` prefills from `?window=` (case-insensitive, safe fallback, Suspense-wrapped); NEW `GET /api/heatmap/contributor-count` (auth + rate limit + Zod, returns `{count, floor, meetsFloor, cellResolved}` only) backed by NEW `src/lib/heatmap/contributor-count.ts` + shared `src/lib/heatmap/anonymous-floor.ts`, so `PrivacyPickerModal.tsx` disables Anonymous with the R14 explanation below the N≥3 floor and fails safe while loading/erroring; `SubCrewCoordinationPanel.tsx` now passes `venueId`/`cityArea`/`contributionType` to make the check live, and `lib/heatmap/aggregate.ts` imports the shared `ANONYMOUS_FLOOR` instead of its own literal. BUG FIX: `NotificationPreferencesForm.tsx` passed the whole `{success, data:{preferences}}` envelope to a parser expecting an array, so the settings page always rendered empty preferences — now unwrapped defensively. NEW test files `src/__tests__/api/heatmap-contributor-count.test.ts` (24), `src/__tests__/components/notification-preferences-form.test.ts` (20); extended `notification-preferences.test.ts` (+13) and `lib/daily-prompt.test.ts` (+1). No `setup.ts` mock changes needed. PR https://github.com/pcettina/OutTheGroupchat/pull/148.

**Previous stats (2026-07-19):** 65 live API routes (excluding `_archive`; 78 raw route.ts) | 103 vitest-active test files | 1976 tests passing | ~429 TS/TSX files (headline later corrected to 366 excluding `_archive`) | `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | tsc: 0 errors | lint: 0/0 | prisma: valid | Sentry coverage ~63/64 non-archive routes | E2E `authenticated-flow.spec.ts` passing 16/16 in real Chromium, wired into CI behind a production build. Day 7 of BUILD_PLAN.md shipped Activation: NEW `POST/GET /api/users/onboarding` (GET returns `{onboarded, onboardedAt}`, POST stamps `onboardedAt=now`, idempotent) + additive `User.onboardedAt DateTime?`; NEW 3-step `/onboarding` flow (Topics → Crew → first Intent) with the dead trip-era `InterestSelector.tsx` rewritten into a real Topic selector; signups redirect to `/onboarding`. Empty/error states: NEW shared `ErrorBanner.tsx` (role=alert, Retry/Dismiss); feed silent catches now surface it, and `/intents`, `/subcrews/[id]`, `/feed` empty blocks use the shared `EmptyState` with CTAs. NEW test files `src/__tests__/api/onboarding.test.ts` (13), `src/__tests__/onboarding-flow.test.ts` (12), `src/__tests__/components/empty-error-states.test.ts` (5).

**Previous stats (2026-07-17):** 64 live API routes (excluding `_archive`; 77 raw route.ts) | 100 vitest-active test files | 1946 tests passing | ~426 TS/TSX files | Day 6 of BUILD_PLAN.md shipped Trust & Safety II: NEW `Report` model + `ReportReason`/`ReportStatus`/`ReportTargetType` enums + `POST/GET /api/reports` (POST files a report against a user/meetup — self-report 400, target-exists 404, duplicate idempotent 200, else create 201; GET is an admin-only list via `ADMIN_USER_IDS` allowlist + `?status` filter), NEW UI `ReportButton.tsx` on profile + meetup detail (non-host), and anti-spam `creationQuotaLimiter` (10/user/24h) layered as a daily-quota 429 + high-frequency-creator warn onto `POST /api/meetups` + `POST /api/crew/request` (no duplicate limiter). NEW test file `src/__tests__/api/reports.test.ts` (15) + daily-quota 429 (2).

**Previous stats (2026-07-16):** 63 live API routes (excluding `_archive`; 76 raw route.ts) | 121 vitest-active test files | 1929 tests passing | 424 TS/TSX files | Day 5 of BUILD_PLAN.md shipped baseline Trust & Safety: NEW `prisma.UserBlock` model + `POST/DELETE /api/users/[userId]/block` (idempotent; auto-severs the Crew edge on block), mutual block enforcement across crew/feed/heatmap/check-in-feed (no partial leak), NEW UI `BlockButton.tsx` on `/profile/[userId]` + `/crew`.

**Previous stats (2026-07-13):** 62 live API routes (excluding `_archive`) | 119 vitest-active test files | 1909 tests passing | 416 TS/TSX files | Day 4 of BUILD_PLAN.md made R4/R20 reachable: NEW `GET/PATCH /api/users/relationship-settings` writes per-Crew-member privacy defaults (BLOCK granularity / KNOWN identity) that `lib/heatmap/aggregate.ts` already reads; NEW UI `RelationshipSettingsList.tsx` at `/settings/privacy/relationships`.

**Previous stats (2026-07-11):** 61 live API routes (excl. `_archive`; docs had recorded a raw route.ts count of 74) | 118 vitest-active test files | 414 TS files | Day 3 closed the intent→group funnel: `PATCH /api/subcrews/[id]` graduates a frozen SubCrew (`startAt`+`venueId`) into a CREW Meetup with linked attendees via NEW `src/lib/subcrews/graduate-to-meetup.ts` (idempotent); the coordination panel gains a graduated banner + "View Meetup" link.

**Previous stats (2026-06-30):** 61 live API routes (excluding `_archive`) | 95 vitest-active test files | 1880 tests passing | ~336 active (non-archive) TS/TSX files | `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | files >600 lines (active): 0 (largest 513) | tsc: 0 errors | lint: 0/0 | prisma: valid | Sentry coverage ~63/64 non-archive routes | E2E `authenticated-flow.spec.ts` passing 16/16 in real Chromium, wired into CI behind a production build. Day 2 of BUILD_PLAN.md made hotness visible (`HotNowBadge` on recommendations + heatmap) and added the SubCrew venue selector (consumes existing `PATCH /api/subcrews/[id]` `venueId`).

**Previous stats (2026-06-12):** 61 live API routes (excluding `_archive`) | 93 vitest-active test files | 1863 tests passing | 334 active (non-archive) TS/TSX files | `any`: 0 | `console.*`: 0 | TODO/FIXME: 0 | files >600 lines (active): 0 | tsc: 0 errors | lint: 0/0 | prisma: valid | Sentry coverage ~63/64 non-archive routes | E2E `authenticated-flow.spec.ts` passing 16/16 in real Chromium, now wired into CI behind a production build (Phase 8 action #5 complete; closes prior rec #4).

**Stats (historical, post-Phase-6-complete, 2026-04-22):** 50 live API routes (35 base + 6 Crew routes + 9 Phase 4 meetup/venue/cron routes + 3 Phase 5 check-in routes + privacy route + 2 Phase 6 AI routes: suggest-meetups, icebreakers; 13 archived in Phase 1; feed POST now 410) | live component groups: auth, feed (rescoped to meetup/checkin types, tabs updated), social (incl. `CrewButton`, `CrewRequestCard`, `CrewList`), meetups (incl. `MeetupCard`, `MeetupList`, `CreateMeetupModal`, `RSVPButton`, `VenuePicker`, `AttendeeList`, `MeetupInviteModal`), checkins (incl. `CheckInButton`, `LiveActivityCard`, `NearbyCrewList`), discover, notifications, profile (incl. Recent Check-ins section), search, settings (incl. `PrivacySettingsForm`), onboarding, ai, ui, accessibility + Navigation (incl. privacy link) | live pages: /, /auth/*, /profile, `/profile/[userId]`, /feed, /discover, /inspiration, /notifications, /search, /settings, `/settings/privacy`, /onboarding, /privacy, /terms, `/crew`, `/crew/requests`, `/meetups`, `/meetups/new`, `/meetups/[id]`, `/checkins`, `/checkins/[id]` | middleware: auth-protects `/profile/:path*`, `/crew/:path*`, `/meetups/:path*`, `/checkins/:path*`, `/settings/:path*`, `/api/checkins/*`, plus select `/api/*` paths
**Test Health (2026-05-10):** 90 live test files (+4 tonight: intents-id.test.ts, subcrews-coverage.test.ts, checkins-feed.test.ts, intents-mine-crew.test.ts) | ~991 tests passing | 0 TSC errors | Phase 8 IN PROGRESS: nightly/2026-05-11 advanced action #5 (E2E + integration coverage) and #6 (Sentry coverage — `/api/topics`, `/api/recommendations` instrumented). V1 Phase 4 heatmap shipped 2026-05-09 (PR #86/#87)

**Codebase Health metrics (2026-07-22):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | live API routes: 69 (excl. `_archive`; 82 raw route.ts) | test files: 114 | tests: 2223 | TS/TSX files: ~375 | tsc: 0 | lint: 0/0 | prisma: valid | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (2026-07-21):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | live API routes: 68 (excl. `_archive`; 81 raw route.ts) | test files: 110 | tests: 2173 | TS/TSX files: ~371 | tsc: 0 | lint: 0/0 | prisma: valid | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (2026-07-20):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | live API routes: 66 (excl. `_archive`; 79 raw route.ts) | test files: 108 | tests: 2143 | TS/TSX files: ~369 | tsc: 0 | lint: 0/0 | prisma: valid | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (2026-07-19):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | live API routes: 65 (excl. `_archive`; 78 raw route.ts) | test files: 103 | tests: 1976 | TS/TSX files: ~429 | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (2026-07-17):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | live API routes: 64 (excl. `_archive`; 77 raw route.ts) | test files: 100 | tests: 1946 | TS/TSX files: ~426 | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (2026-07-16):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | live API routes: 63 (excl. `_archive`; 76 raw route.ts) | test files: 121 | tests: 1929 | TS/TSX files: 424 | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (2026-07-13):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | live API routes: 62 (excl. `_archive`) | test files: 119 | tests: 1909 | TS/TSX files: 416 | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (2026-07-11):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | prod files >600 lines: 0 | API routes: 74 (raw route.ts) | test files: 118 | TS files: 414 | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (2026-06-30):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | files >600 lines (active): 0 (largest 513) | API routes: 61 | test files: 95 | tests: 1880 | active (non-archive) TS/TSX files: ~336 | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (2026-06-12):** `any` types: 0 | `console.*`: 0 | TODO/FIXME: 0 | files >600 lines (active): 0 | API routes: 61 | test files: 93 | tests: 1863 | active (non-archive) TS/TSX files: 334 (prior docs showed 333 — 1-file count drift corrected) | CI builds before Playwright E2E (`.github/workflows/ci.yml`) so the authenticated-flow suite runs on every PR

**Codebase Health metrics (historical, 2026-05-10):** `any` types: 4 | `console.*`: 0 | TODO/FIXME: 2 | files >600 lines: 2 (RichFeedItem.tsx 717, profile/page.tsx 623) | API routes: 58 | test files: 90 | TS files: 290

**New test files (2026-05-10):**

| File | Tests | Covers |
|------|-------|--------|
| `src/__tests__/intents-id.test.ts` | 19 | `PATCH` + `DELETE /api/intents/[id]` |
| `src/__tests__/subcrews-coverage.test.ts` | 23 | `/api/subcrews/{mine,emerging,[id],[id]/join,[id]/commit,[id]/members/me}` |
| `src/__tests__/checkins-feed.test.ts` | 14 | `GET /api/checkins/feed` (auth, rate-limit, where-clause, Sentry) |
| `src/__tests__/intents-mine-crew.test.ts` | 18 | `GET /api/intents/mine` + `GET /api/intents/crew` |

**Test Health (2026-05-11, nightly/2026-05-12):** 90 live test files (+4 new V1 lib test files: `heatmap-aggregate.test.ts` (28), `topic-classifier.test.ts` (34), `hotness-score.test.ts` (21), `fof-graph.test.ts` (18)) | ~1018 tests passing | 0 TSC errors | Aux-route Sentry instrumentation added (cron + beta/signup + beta/initialize-password + beta/status); search Zod enum re-tightened; 4 dead components removed (profile/TripHistory, profile/PreferencesCard, profile/BadgeShowcase, ui/FloatingShareButton); JSDoc on 35 V1 lib exports across `src/lib/heatmap/*`, `src/lib/hotness/score.ts`, `src/lib/validations/social.ts`, `src/lib/intent/*`, `src/lib/subcrew/try-form.ts`; 59 live API routes; 291 TS files.

---

## Directory Structure

```
outthegroupchat-travel-app/
├── prisma/
│   ├── schema.prisma              # 675 lines — full data model
│   ├── migrations/                # Auto-generated migration history
│   └── seed/
│       ├── index.ts               # Seed orchestration
│       └── generators/
│           ├── users.ts           # User/profile seed data
│           ├── trips.ts           # Trip/invitation/voting seed data
│           ├── activities.ts      # Activity/itinerary seed data
│           └── social.ts          # Feed/comments/engagement seed data
├── e2e/
│   └── smoke.spec.ts              # 156 lines — Playwright E2E smoke tests (4 suites)
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (fonts, providers, metadata)
│   │   ├── page.tsx               # Landing page (/)
│   │   ├── metadata.ts            # Site metadata
│   │   ├── error.tsx              # Route-level error boundary
│   │   ├── global-error.tsx       # Global error boundary (catches root layout errors, reports to Sentry)
│   │   ├── not-found.tsx          # 404 page
│   │   ├── loading.tsx            # Root loading skeleton
│   │   ├── auth/
│   │   │   ├── signin/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── reset-password/
│   │   │       ├── page.tsx       # Password reset request form (sends email via POST /api/auth/reset-password)
│   │   │       └── confirm/page.tsx  # Password reset confirmation form (submits via PATCH /api/auth/reset-password)
│   │   ├── trips/
│   │   │   ├── page.tsx           # Trip list
│   │   │   ├── new/page.tsx       # Trip creation wizard
│   │   │   └── [tripId]/
│   │   │       ├── page.tsx       # Trip detail
│   │   │       ├── survey/page.tsx
│   │   │       └── vote/page.tsx
│   │   ├── discover/page.tsx
│   │   ├── feed/
│   │   │   ├── page.tsx
│   │   │   └── loading.tsx
│   │   ├── inspiration/page.tsx
│   │   ├── notifications/page.tsx
│   │   ├── profile/page.tsx
│   │   └── api/                   # 66 live API route files (see API Routes section)
│   ├── components/                # 104 files across 19 feature directories
│   │   ├── accessibility/         # FocusTrap, SkipLinks, VisuallyHidden, LiveRegion
│   │   ├── ai/                    # TripChat (360L), ChatMessage, ChatLoadingIndicator, ChatQuickPrompts, chat-types.ts
│   │   ├── auth/                  # SignUpForm
│   │   ├── discover/              # CategoryFilter, DestinationCard, TrendingSection
│   │   ├── feed/                  # FeedItem, RichFeedItem, CommentThread, ShareModal, etc.
│   │   ├── notifications/         # NotificationBell, NotificationCenter, NotificationList
│   │   ├── onboarding/            # WelcomeScreen, InterestSelector, TravelStyleQuiz
│   │   ├── profile/               # ProfileHeader, TripHistory, BadgeShowcase, PreferencesCard
│   │   ├── search/                # SearchFilters, FilterChip, SearchResults
│   │   ├── settings/              # NotificationSettings, PrivacySettings, ProfileSettings, SecuritySettings
│   │   ├── social/                # ActivityCard, TravelBadges
│   │   ├── surveys/               # SurveyBuilder, SurveyForm, QuestionRenderer, question types
│   │   ├── trips/                 # TripCard, TripWizard, TripHeader, MemberList, ItineraryTimeline, etc.
│   │   ├── ui/                    # Button, Card, Input, Dialog, Avatar, Badge, Toast, etc.
│   │   ├── voting/                # VotingSession, VotingCard, ResultsChart, CreateVotingModal
│   │   └── Navigation.tsx         # Top nav bar
│   ├── contexts/
│   │   ├── RealtimeContext.tsx     # Pusher connection & notification state
│   │   └── ToastContext.tsx        # Toast notification dispatch
│   ├── hooks/
│   │   ├── useTrips.ts            # React Query: CRUD hooks for trips
│   │   └── usePusher.ts           # Pusher channel subscriptions
│   ├── lib/
│   │   ├── auth.ts                # NextAuth config (Google + Credentials)
│   │   ├── prisma.ts              # Prisma client singleton
│   │   ├── logger.ts              # Pino structured logging
│   │   ├── pusher.ts              # Pusher server/client + channel helpers
│   │   ├── email.ts               # Resend email templates
│   │   ├── rate-limit.ts          # Upstash rate limiter
│   │   ├── sanitize.ts            # XSS prevention
│   │   ├── sentry.ts              # Centralized Sentry helpers (captureException, addBreadcrumb, setUser) ✅ 2026-03-25
│   │   ├── geocoding.ts           # Nominatim reverse geocoding
│   │   ├── invitations.ts         # Invite token generation/validation
│   │   ├── api-config.ts          # API constants
│   │   ├── api-middleware.ts       # Auth decorators, Zod validation helpers
│   │   ├── providers.tsx          # React Query + Session providers
│   │   ├── api/
│   │   │   ├── unsplash.ts        # Unsplash image search
│   │   │   ├── places.ts          # Google Places API
│   │   │   ├── ticketmaster.ts    # Ticketmaster events
│   │   │   └── flights.ts         # Flight search
│   │   └── utils/
│   │       └── costs.ts           # Cost calculation helpers
│   ├── services/
│   │   ├── recommendation.service.ts  # 459L — AI + survey recommendation engine
│   │   ├── recommendation-data.ts     # 185L — Static destination/activity data for RecommendationService
│   │   ├── survey.service.ts          # 377L — Survey CRUD + analysis
│   │   └── events.service.ts          # Event discovery (Ticketmaster)
│   ├── types/
│   │   └── index.ts               # 449L — All TypeScript interfaces & types
│   ├── styles/
│   │   ├── globals.css            # Tailwind directives, CSS variables
│   │   └── themes.css             # Dark/light mode definitions
│   ├── middleware.ts              # Route protection (redirect unauthenticated)
│   └── __tests__/
│       ├── setup.ts               # Test environment config
│       ├── api/
│       │   ├── trips.test.ts      # 525L — 30 Vitest tests for trips API
│       │   ├── voting.test.ts     # 10 Vitest tests for voting API
│       │   ├── survey.test.ts     # 11 Vitest tests for survey API
│       │   ├── feed.test.ts       # 12 Vitest tests for feed API
│       │   ├── auth.test.ts       # 10 Vitest tests for auth flow
│       │   ├── notifications.test.ts # 19 Vitest tests for notifications API
│       │   ├── profile.test.ts    # 10 Vitest tests for profile API
│       │   ├── reset-password.test.ts # 286L — 12 Vitest tests for password reset API
│       │   ├── users.test.ts      # 316L — 19 Vitest tests for users/follow API
│       │   ├── share.test.ts      # 204L — 13 Vitest tests for feed share endpoint
│       │   ├── inspiration.test.ts # 358L — 20 Vitest tests for inspiration API
│       │   ├── search.test.ts     # 328L — 15 Vitest tests for search API
│       │   └── beta-initialize-password.test.ts # 274L — 15 Vitest tests for beta password init
│       └── lib/
│       └── api/
│           ├── trips.test.ts      # 525L — 30 Vitest tests for trips API
│           ├── trips-suggestions.test.ts # 23 Vitest tests for trips suggestions API
│           ├── trips-flights.test.ts     # 26 Vitest tests for trips flights API
│           ├── trips-members.test.ts     # 29 Vitest tests for trips members API
│           ├── voting.test.ts     # 10 Vitest tests for voting API
│           ├── survey.test.ts     # 11 Vitest tests for survey API
│           ├── feed.test.ts       # 12 Vitest tests for feed API
│           ├── email.test.ts      # 14 Vitest tests for email service
│           ├── geocoding.test.ts  # 26 Vitest tests for geocoding
│           ├── invitations.test.ts # 16 Vitest tests for invitation tokens
│           └── rate-limit.test.ts # 13 Vitest tests for rate limiting
├── docs/                          # 23 markdown files (see docs/README.md)
├── public/                        # Empty (assets via CDN)
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts           # 44 lines — Playwright E2E configuration (chromium, auto dev server in CI)
├── instrumentation.ts             # Sentry server + edge init via Next.js instrumentation hook
├── instrumentation-client.ts      # Sentry client init with Session Replay (10% sample, 100% on error)
├── vercel.json
├── .eslintrc.json
└── .env.example
```

---

## Tech Stack & Dependencies

### Core

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | ^14.1.3 |
| Language | TypeScript (strict) | ^5.4.2 |
| React | React + ReactDOM | ^18.2.0 |
| ORM | Prisma Client | ^5.22.0 |
| Database | PostgreSQL (Supabase) | — |
| Auth | NextAuth.js + Prisma Adapter | ^4.24.7 |
| Styling | Tailwind CSS | ^3.4.1 |
| Animation | Framer Motion | ^11.0.0 |

### Real-time & Communication

| Package | Version | Purpose |
|---------|---------|---------|
| pusher | ^5.2.0 | Server-side Pusher |
| pusher-js | ^8.4.0 | Client-side Pusher |
| resend | ^6.6.0 | Transactional email |

### Data & State

| Package | Version | Purpose |
|---------|---------|---------|
| @tanstack/react-query | ^5.59.0 | Server state management |
| react-hook-form | ^7.54.2 | Form handling |
| @hookform/resolvers | ^3.10.0 | Zod form validation |
| zod | ^3.25.0 | Runtime schema validation |

### Infrastructure

| Package | Version | Purpose |
|---------|---------|---------|
| @upstash/ratelimit | ^2.0.7 | API rate limiting |
| @upstash/redis | ^1.35.8 | Redis client for rate limits |
| pino / pino-pretty | ^10.1.0 | Structured logging |
| bcryptjs | ^3.0.2 | Password hashing |
| isomorphic-dompurify | ^2.34.0 | XSS sanitization |
| axios | ^1.8.4 | HTTP client |
| date-fns | ^3.6.0 | Date utilities |
| lucide-react | ^0.576.0 | Icon library |
| @sentry/nextjs | — | Error monitoring (server, edge, client) |

### Testing

| Package | Purpose |
|---------|---------|
| vitest | Unit/integration test runner |
| @playwright/test | E2E test runner |

### Scripts

```
dev            → next dev
build          → prisma generate && next build
lint           → next lint
test           → vitest run
test:watch     → vitest
test:e2e       → playwright test
test:e2e:ui    → playwright test --ui
db:push        → prisma db push
db:migrate     → prisma migrate dev
db:generate    → prisma generate
db:studio      → prisma studio
db:seed        → npx tsx prisma/seed/index.ts
```

---

## Configuration Files

### next.config.js
- **reactStrictMode:** true
- **Image domains:** Google, GitHub, Google Maps, Ticketmaster, Unsplash, DiceBear
- **Experimental:** serverActions (allowedOrigins: localhost:3000, bodySizeLimit: 1mb)
- **Security headers:** CSP, HSTS (2yr), X-Frame-Options, nosniff, strict referrer, permissions-policy
- **Redirects:** /dashboard → /trips (permanent)

### tailwind.config.js
- **Dark mode:** class-based
- **Fonts:** Outfit (display), Poppins (body), system-ui fallback
- **Primary color:** Emerald (#10b981, full 50-950 scale)
- **Animations:** float, pulse-slow, slide-up, fade-in
- **Shadows:** glow-emerald, glow-amber

### tsconfig.json
- **Strict mode:** enabled
- **Target:** ES5, module: ESNext, moduleResolution: bundler
- **Path alias:** `@/*` → `./src/*`

### playwright.config.ts
- **testDir:** `./e2e`
- **baseURL:** `http://localhost:3000` (or `PLAYWRIGHT_BASE_URL` env var)
- **Projects:** chromium (Desktop Chrome) only
- **CI:** retries=2, workers=1, GitHub reporter, auto-starts `npm run start`
- **Artifacts:** trace on first retry, screenshot on failure, video on first retry

### instrumentation.ts
- Sentry server + edge initialization via Next.js instrumentation hook
- Reads `SENTRY_DSN` from env; `tracesSampleRate: 1.0`; `debug: false`

### instrumentation-client.ts
- Sentry browser initialization with Session Replay integration
- `replaysSessionSampleRate: 0.1` (10% of all sessions)
- `replaysOnErrorSampleRate: 1.0` (100% of sessions with errors)

---

## Prisma Data Model

### Enums

| Enum | Values |
|------|--------|
| NotificationType | TRIP_INVITATION, TRIP_UPDATE, TRIP_COMMENT, TRIP_LIKE, ACTIVITY_COMMENT, ACTIVITY_RATING, SURVEY_REMINDER, VOTE_REMINDER, FOLLOW, SYSTEM |
| TripStatus | PLANNING, INVITING, SURVEYING, VOTING, BOOKED, IN_PROGRESS, COMPLETED, CANCELLED |
| TripMemberRole | OWNER, ADMIN, MEMBER |
| InvitationStatus | PENDING, ACCEPTED, DECLINED, EXPIRED |
| SurveyStatus | DRAFT, ACTIVE, CLOSED, ANALYZED |
| VotingType | DESTINATION, ACTIVITY, DATE, ACCOMMODATION, CUSTOM |
| VotingStatus | ACTIVE, CLOSED, CANCELLED |
| ActivityCategory | FOOD, CULTURE, SHOPPING, NATURE, ENTERTAINMENT, SPORTS, NIGHTLIFE, TRANSPORTATION, ACCOMMODATION, OTHER |
| ActivityStatus | SUGGESTED, APPROVED, BOOKED, COMPLETED, CANCELLED |
| PriceRange | FREE, BUDGET, MODERATE, EXPENSIVE, LUXURY |
| BookingStatus | NOT_NEEDED, RECOMMENDED, REQUIRED, BOOKED, CONFIRMED |
| ExternalSource | OPENTRIPMAP, FOURSQUARE, OPENSTREETMAP, WIKIVOYAGE, GOOGLE_PLACES, YELP, TRIPADVISOR, MANUAL |

### Models

#### Auth (NextAuth managed)

| Model | Key Fields | Notes |
|-------|-----------|-------|
| **Account** | id, userId, provider, providerAccountId, access_token, refresh_token | Unique on [provider, providerAccountId] |
| **Session** | id, sessionToken (unique), userId, expires | Cascade delete with User |
| **VerificationToken** | identifier, token (unique), expires | Unique on [identifier, token]; also used for password reset tokens (identifier prefix: `reset:`) |

#### User Domain

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **User** | id, email (unique), password?, name?, image?, bio?, city?, preferences (Json), betaSignupDate?, newsletterSubscribed, passwordInitialized, **crewLabel? (VarChar(20), 1–20 chars alphanumeric + spaces — Phase 2, 2026-04-17)** | accounts[], sessions[], ownedTrips[], tripMemberships[], invitations[], surveyResponses[], followers[], following[], savedActivities[], notifications[], crewA[], crewB[] (Phase 2) | Indexed on email |
| **Follow** | id, followerId, followingId | User (follower), User (following) | Unique on [followerId, followingId]. Legacy (retained until Phase 6). |
| **Notification** | id, userId, type (enum), title, message, data (Json), read | User | Indexed on [userId, read] |

#### Social Domain (Phase 2, added on `refactor/phase-2-crew-domain` 2026-04-17)

> Schema extended with 10 new models + 8 enums. Nightly build scaffolded under `Connection`; Phase 2 PR renames to `Crew`. Zod validation in `src/lib/validations/social.ts`. TypeScript composites in `src/types/social.ts`. Seed data in `prisma/seed/generators/socialDomain.ts`.

| Model | Key Fields | Notes |
|-------|-----------|-------|
| **Crew** (renames `Connection`) | id, userAId, userBId, status (PENDING/ACCEPTED/DECLINED/BLOCKED), requestedById, createdAt, updatedAt | **Single-row bidirectional** with `userAId < userBId` convention + DB CHECK constraint (Q2 resolved 2026-04-17). `requestedById` tracks initiator. Unique on [userAId, userBId]. Replaces/extends `Follow`. |
| **Meetup** | id, hostId, venueId, title, description?, startsAt, endsAt?, capacity?, visibility (PUBLIC/CREW/INVITE_ONLY/PRIVATE — **default `CREW`**, Q3 resolved 2026-04-17) | Replaces `Trip`. Visibility-scoped feed queries. |
| **MeetupAttendee** | id, meetupId, userId, status (GOING/MAYBE/DECLINED), rsvpedAt, checkedInAt? | RSVP record; unique on [meetupId, userId] |
| **MeetupInvite** | id, meetupId, inviterId, inviteeId, status, expiresAt | Explicit invite; separate from Crew request |
| **Venue** | id, name, address, latitude, longitude, cityId, category, externalSource?, externalId? | Places API + geocoding |
| **City** | id, name, country, latitude, longitude, timezone | Geographic grouping |
| **CheckIn** | id, userId, venueId, visibility, note?, createdAt, **activeUntil DateTime @default(dbgenerated("now() + interval '6 hours'"))** (Q4 resolved 2026-04-17) | Feed/presence queries filter `WHERE activeUntil > now()`. Row persists indefinitely for attendance history. |
| **Poll** | id, meetupId?, hostId, type (SURVEY/VOTE/RSVP_POLL), question, options (Json), closesAt? | Generalizes `TripSurvey` + `VotingSession` |
| **PollResponse** | id, pollId, userId, choice, rank? | Unique on [pollId, userId]; merges `SurveyResponse` + `Vote` |
| **Post** | id, authorId, content, mediaUrls[], meetupId?, checkInId? | Generalized feed entry (to be adopted in Phase 6) |
| **UserBlock** (Day 5, 2026-07-16) | id, blockerId, blockedId, createdAt | Directed block edge; unique on [blockerId, blockedId]; back-relations `User.blocksInitiated` / `User.blocksReceived`. Additive migration `20260716100000_add_user_block`. Enforced mutually on crew/feed/heatmap/check-in-feed reads. |
| **Report** (Day 6, 2026-07-17) | id, reporterId, targetType, targetId, reason, status, createdAt | Abuse report against a user or meetup; `reason` = `ReportReason` enum, `targetType` = `ReportTargetType`, `status` = `ReportStatus` enum. Additive; self-report guarded at the route, duplicate-report idempotent. Admin-only GET list via `ADMIN_USER_IDS`. |

#### Trip Domain

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **Trip** | id, title, description?, status (enum), destination (Json), startDate, endDate, budget (Json), ownerId, coverImage?, isPublic, viewCount | owner (User), members[], invitations[], survey?, votingSessions[], activities[], itinerary[], comments[], likes[] | Indexed on ownerId, status, startDate |
| **TripMember** | id, tripId, userId, role (enum), budgetRange (Json), departureCity?, flightDetails (Json) | Trip, User | Unique on [tripId, userId] |
| **TripInvitation** | id, tripId, userId, status (enum), expiresAt | Trip, User | Unique on [tripId, userId] |
| **PendingInvitation** | id, email, tripId, invitedBy, expiresAt | Trip, User (inviter) | For users not yet registered |
| **TripComment** | id, tripId, userId, text | Trip, User | — |
| **TripLike** | id, tripId, userId | Trip, User | Unique on [userId, tripId] |

#### Survey & Voting

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **TripSurvey** | id, tripId (unique), title, status (enum), questions (Json), expiresAt? | Trip, SurveyResponse[] | One survey per trip |
| **SurveyResponse** | id, surveyId, userId, answers (Json) | TripSurvey, User | Unique on [surveyId, userId] |
| **VotingSession** | id, tripId, type (enum), status (enum), title, expiresAt, options (Json) | Trip, Vote[] | — |
| **Vote** | id, sessionId, orderId, optionId, rank? | VotingSession | Unique on [sessionId, orderId, optionId] |

#### Activity Domain

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **Activity** | id, tripId, name, description?, category (enum), status (enum), location (Json), date?, startTime?, endTime?, duration?, cost?, priceRange (enum), bookingStatus (enum), bookingUrl?, isPublic, shareCount, externalLinks (Json) | Trip, savedBy[], comments[], ratings[], itineraryItems[] | Indexed on tripId, category, isPublic |
| **SavedActivity** | id, userId, activityId | User, Activity | Unique on [userId, activityId] |
| **ActivityComment** | id, activityId, userId, text | Activity, User | — |
| **ActivityRating** | id, activityId, userId, score (1-5), review? | Activity, User | Unique on [activityId, userId] |

#### Itinerary

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **ItineraryDay** | id, tripId, dayNumber, date, notes? | Trip, ItineraryItem[] | Unique on [tripId, dayNumber] |
| **ItineraryItem** | id, itineraryDayId, activityId?, order, startTime?, endTime?, customTitle?, notes? | ItineraryDay, Activity? | Supports non-activity items |

#### External Data

| Model | Key Fields | Notes |
|-------|-----------|-------|
| **ExternalActivity** | id, externalId, source (enum), name, description?, category, tags[], latitude, longitude, city, country, rating?, priceLevel?, imageUrl?, websiteUrl?, searchText, popularity | Unique on [externalId, source], indexed on [city, category], [lat, lng] |
| **DestinationCache** | id, city, country (unique together), activityCount, averageRating?, topCategories[], description?, highlights (Json), bestTimeToVisit?, averageBudget (Json), dataQuality (0-100) | Indexed on country |

---

## Authentication

**File:** `src/lib/auth.ts`

- **Strategy:** JWT sessions via NextAuth.js
- **Adapter:** PrismaAdapter
- **Providers:**
  1. **Google OAuth** — requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  2. **Credentials** — email + bcrypt password verification
- **Session callback:** Injects user.id and user.name from JWT
- **JWT callback:** Queries DB only on signIn (optimized, avoids N+1)
- **Pages:** signIn → /auth/signin, error → /auth/error
- **Middleware:** `src/middleware.ts` redirects unauthenticated users to sign-in
- **Password reset:** Token-based flow via `VerificationToken` model (identifier prefix `reset:`), 1-hour expiry, email sent via Resend

---

## API Routes

### Authentication & Beta

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/auth/[...nextauth]` | * | NextAuth | — | NextAuth handler |
| `/api/auth/signup` | POST | No | No | User registration + pending invitation processing |
| `/api/auth/demo` | POST, GET | No | No | Demo account creation/retrieval |
| `/api/auth/reset-password` | POST, PATCH | No | Yes | POST: request reset token (always 200, prevents enumeration); PATCH: confirm reset with token + new password |
| `/api/auth/verify-email` | GET | No | Yes | Email token verification ✅ 2026-03-19 |
| `/api/beta/signup` | POST | API Key | Yes | Beta signup via N8N |
| `/api/beta/initialize-password` | POST | API Key | Yes | Password init for beta users — N8N_API_KEY auth protection added 2026-03-19 |
| `/api/beta/status` | GET | No | No | Beta signup status check |

### Trips CRUD (📦 ARCHIVED 2026-04-16)

> Moved to `src/app/api/_archive/trips/`. See [Archived surface (Phase 1)](#archived-surface-phase-1). Paths below no longer resolve at runtime.

### Activities (📦 ARCHIVED 2026-04-16)

> `/api/activities/[activityId]` moved to `src/app/api/_archive/activities/`. See [Archived surface (Phase 1)](#archived-surface-phase-1).

### Users & Social

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/users/me` | GET, PATCH | Yes | Yes (PATCH) | Current user profile + preferences |
| `/api/users/[userId]` | GET, POST | Yes* | No | Public profiles, follow/unfollow |
| `/api/users/[userId]/block` | POST, DELETE | Yes | Yes | **Day 5, 2026-07-16** — POST blocks / DELETE unblocks a user; idempotent; block auto-severs the Crew edge; writes `UserBlock`; mutual enforcement on crew/feed/heatmap/check-in-feed |
| `/api/reports` | POST, GET | Yes | Yes (POST) | **Day 6, 2026-07-17** — POST files a report against a user/meetup (self-report 400, target-exists 404, duplicate idempotent 200, else create 201); writes `Report` (`ReportReason`/`ReportStatus`/`ReportTargetType` enums); GET is an admin-only list via `ADMIN_USER_IDS` allowlist + optional `?status` filter |
| `/api/users/onboarding` | GET, POST | Yes | Yes (POST) | **Day 7, 2026-07-19** — GET returns `{onboarded, onboardedAt}`; POST stamps `User.onboardedAt=now` (idempotent overwrite); guard chain auth → rate-limit → Zod → Sentry → pino. Drives the `/onboarding` self-skip + post-signup redirect |
| `/api/users/relationship-settings` | GET, PATCH | Yes | Yes | **Day 4, 2026-07-13** — per-Crew-member location privacy (granularity + identity); GET lists (default BLOCK/KNOWN), PATCH upserts, 403 non-Crew target |
| `/api/crew/suggestions` | GET | Yes | Yes | **Day 10, 2026-07-21** — FoF "People you may know" from `src/lib/heatmap/fof-graph.ts`, ranked by mutual count, excluding existing/PENDING Crew + blocked users (block filter degrades gracefully if `UserBlock` absent); auth → rate-limit → Zod → Sentry. Drives a suggestions block on `/crew` via `SuggestionCard` with inline Add (POST `/api/crew/request`) |
| `/api/profile` | GET, PUT | Yes | No | Legacy profile endpoint |
| `/api/search` | GET | Yes | No | Global search (people-first: users → meetups → venues) |

### Feed & Engagement

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/feed` | GET | Yes | No | Activity feed with pagination — **rescoped 2026-04-21**: types now `meetup_created`, `check_in_posted`, `crew_formed`, `meetup_attended`, `post_created`; trip/activity queries removed; POST returns 410 Gone |
| `/api/feed/comments` | GET, POST, DELETE | Yes | No | Comments with notifications; **GET auth-guarded 2026-07-21 (Day 10)** — added a `getServerSession()` 401 guard (GET was previously unauthenticated) |
| `/api/feed/engagement` | GET, POST | Yes | No | Likes/engagement tracking |

### Notifications & Invitations

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/notifications` | GET, PATCH | Yes | No | Notification inbox, bulk mark read |
| `/api/notifications/[notificationId]` | PATCH, DELETE | Yes | No | Individual notification ops |
| `/api/invitations` | GET | Yes | No | User's pending invitations |
| `/api/invitations/[invitationId]` | GET, POST | Yes | Yes (POST) | Respond to invitation |

### Discovery & Content

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/discover` | GET, POST | Yes | Yes (GET) | Destination discovery + flight search |
| `/api/discover/search` | GET | Yes | Yes | Internal + external activity search |
| `/api/discover/import` | POST | Yes | No | Import from OpenTripMap |
| `/api/discover/recommendations` | GET | Yes | No | Personalized recommendations |
| `/api/inspiration` | GET, POST | Yes | Yes (GET) | Trip templates, trending, popular |

### Meetups & Venues (Phase 4, 2026-04-18)

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/meetups` | POST | Yes | Yes | Create meetup (default visibility=`CREW`) |
| `/api/meetups` | GET | Yes | Yes | List meetups (city filter, visibility-scoped to caller's Crew, paginated) |
| `/api/meetups/[id]` | GET | Yes | Yes | Meetup detail |
| `/api/meetups/[id]` | PATCH | Yes | Yes | Edit meetup (host only) |
| `/api/meetups/[id]` | DELETE | Yes | Yes | Cancel meetup (host only) |
| `/api/meetups/[id]/rsvp` | POST | Yes | Yes | RSVP — GOING / MAYBE / DECLINED |
| `/api/meetups/[id]/invite` | POST | Yes | Yes | Invite Crew members to meetup |
| `/api/venues/search` | GET | Yes | Yes | Venue search — DB-first with Google Places API fallback + auto-caching |
| `/api/cron/meetup-starting-soon` | GET | Bearer | Yes | Cron: MEETUP_STARTING_SOON reminder dispatch (T-55–65min, idempotent) |

### Check-ins (Phase 5, 2026-04-19/2026-04-20)

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/checkins` | POST | Yes | Yes | Create check-in (`activeUntilMinutes` override 30–720; default 360=6h); triggers `CREW_CHECKED_IN_NEARBY` notifications + Pusher city-channel broadcast; Phase 5 S1+S2 |
| `/api/checkins` | GET | Yes | Yes | Get own check-ins |
| `/api/checkins/feed` | GET | Yes | Yes | Crew's recent check-ins (`WHERE activeUntil > now()`), visibility-scoped; returns a bare array (consumers read defensively; server-side `{items}` normalization is a follow-up) |
| `/api/checkins/ping` | POST | Yes | Yes | **Day 10 (2026-07-21).** Ping active accepted-Crew check-ins near the caller → `CREW_CHECKED_IN_NEARBY` notifications; rate-limited via `checkRateLimit` |
| `/api/checkins/[id]` | GET | Yes | Yes | Check-in detail; Phase 5 Session 2, 2026-04-20 |
| `/api/checkins/[id]` | DELETE | Yes | Yes | Cancel own check-in |
| `/api/users/privacy` | POST, PATCH | Yes | Yes | Check-in privacy settings (PUBLIC/CREW/PRIVATE); Phase 5 Session 2, 2026-04-20 |

### Infrastructure

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/geocoding` | GET | Yes | No | Nominatim autocomplete (cached) |
| `/api/images/search` | GET | Yes | No | Unsplash image search |
| `/api/pusher/auth` | POST | Yes | No | Pusher channel auth |
| `/api/newsletter/subscribe` | POST | API Key | Yes | Newsletter sub via N8N |
| `/api/cron` | GET | Bearer | No | Daily cron: expire invites, close surveys |

---

## Pages (App Router)

| Route | File | Type | Auth | Description |
|-------|------|------|------|-------------|
| `/` | `app/page.tsx` | Client | Public | Landing page — hero, features, CTA |
| `/auth/signin` | `app/auth/signin/page.tsx` | Client | Public | Email/password + OAuth sign-in |
| `/auth/signup` | `app/auth/signup/page.tsx` | Client | Public | Registration form |
| `/auth/reset-password` | `app/auth/reset-password/page.tsx` | Client | Public | Password reset request form — submits email to POST /api/auth/reset-password |
| `/auth/reset-password/confirm` | `app/auth/reset-password/confirm/page.tsx` | Client | Public | Password reset confirmation — reads token+email from query params, submits PATCH /api/auth/reset-password |
| ~~`/trips`~~ | 📦 archived to `app/_archive/trips/page.tsx` 2026-04-16 | — | — | Archived in Phase 1 pivot |
| ~~`/trips/new`~~ | 📦 archived 2026-04-16 | — | — | — |
| ~~`/trips/[tripId]`~~ | 📦 archived 2026-04-16 | — | — | — |
| ~~`/trips/[tripId]/survey`~~ | 📦 archived 2026-04-16 | — | — | — |
| ~~`/trips/[tripId]/vote`~~ | 📦 archived 2026-04-16 | — | — | — |
| `/discover` | `app/discover/page.tsx` | Client | Public | Destination discovery & inspiration |
| `/inspiration` | `app/inspiration/page.tsx` | Client | Public | Trending trips, events |
| `/feed` | `app/feed/page.tsx` | Client | Required | Social activity feed |
| `/notifications` | `app/notifications/page.tsx` | Client | Required | Notification inbox |
| `/profile` | `app/profile/page.tsx` | Client | Required | User profile, badges, trip history |
| `/settings/privacy` | `app/settings/privacy/page.tsx` | Client | Required | Check-in privacy settings — visibility controls; Phase 5 Session 2, 2026-04-20 |
| `/checkins` | `app/checkins/page.tsx` | Client | Required | "Who's Out Tonight?" feed — NearbyCrewList + CheckInButton; Phase 5 Session 1 |
| `/checkins/[id]` | `app/checkins/[id]/page.tsx` | Client | Required | Check-in detail page; Phase 5 Session 2, 2026-04-20 |
| `/search` | `app/search/page.tsx` (+ `app/search/searchPageLogic.ts`) | Client | Required (middleware `/search/:path*`) | Search surface mounted against `GET /api/search` — people-first `user\|meetup\|venue` results via the rewritten `SearchResults`, result-type filters via the rewritten `SearchFilters` (built from `FilterChip`), empty state; venue results render non-navigable (no venue route). Nav entry uses the Search icon. NEW 2026-07-20 (BUILD_PLAN Day 9, PR #149) |
| `/topics` | `app/topics/page.tsx` (+ `app/topics/topicsPageLogic.ts`) | Client | Required (middleware `/topics/:path*`) | Topic discovery — browse Topics with live "N Crew signaled" counts from `GET /api/topics?withCounts=true`; tiles deep-link to `/intents/new` via `buildTopicIntentHref()` (no topic prefill yet — `IntentCreateForm` reads only `?window=`). Nav entry uses the Hash icon; `/discover` re-iconed to Compass to keep icons unique. NEW 2026-07-20 (BUILD_PLAN Day 9, PR #149) |

**Utility pages:** `error.tsx` (route error boundary), `global-error.tsx` (root error boundary + Sentry), `not-found.tsx` (404), `loading.tsx` (skeleton)

---

## Components

### Accessibility (`components/accessibility/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `FocusTrap` | children, active?, onEscape?, initialFocus?, returnFocus? | Trap keyboard focus in modals |
| `SkipLinks` | links: {id, label}[] | Skip-to-content for keyboard nav |
| `VisuallyHidden` | children, as? | Screen reader only content |
| `LiveRegion` | children, role? (polite\|assertive) | Announce dynamic updates |

### AI (`components/ai/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `TripChat` | 360 | tripContext?, onAction?, className? | Floating AI travel assistant with streaming, localStorage history, quick prompts, retry on 429 |
| `ChatMessage` | 73 | message, isStreaming? | Renders a single chat message bubble (user or assistant) |
| `ChatLoadingIndicator` | 29 | — | Animated loading dots shown while AI is responding |
| `ChatQuickPrompts` | 56 | prompts, onSelect | Horizontal row of quick-prompt pill buttons |
| `chat-types.ts` | 34 | — | Shared TypeScript types for chat components (ChatMessage, ChatState, etc.) |

### Auth (`components/auth/`)

> Note: `SignUpForm` was deleted 2026-04-16 (confirmed unused dead code).

### Discover (`components/discover/`)

> Note: `CategoryFilter`, `DestinationCard`, `TrendingSection` were deleted 2026-04-16 (confirmed unused dead code).

### Feed (`components/feed/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `FeedItem` | 298 | id, type, timestamp, user, trip?, activity?, media?, onSave, onComment, onShare | Basic feed post |
| `RichFeedItem` | 193 | id, type, timestamp, user, content?, reactions?, comments? | Enhanced post with reactions; refactored to ~193 lines with inline sub-renderers. The earlier `src/components/feed/rich-item/` subcomponent directory was deleted as dead code 2026-06-08 (zero importers). |
| `CommentThread` | 385 | itemId, itemType, comments, onAddComment? | Nested comments with reply |
| `EngagementBar` | — | itemId, itemType, initialLiked?, likeCount?, commentCount? | Like/comment/share bar |
| `MediaGallery` | — | media[], maxDisplay?, onMediaClick? | Image/video grid |
| `ShareModal` | 295 | open, onOpenChange, itemId, itemType, itemTitle? | Share to socials / copy link |
| ~~`SharePreview`~~ | — | — | Removed 2026-03-26 (confirmed unused dead code) |

### Notifications (`components/notifications/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `NotificationBell` | — | unreadCount?, onClick? | Bell icon with badge |
| `NotificationList` | — | notifications, onItemClick?, onDelete? | Notification list view |
| `NotificationItem` | — | notification, onClick?, onDelete? | Single notification entry |

> **Note:** `NotificationCenter` was removed 2026-03-26 (confirmed unused dead code).

### Onboarding (`components/onboarding/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `WelcomeScreen` | — | onNext, onSkip? | First-time welcome slides |
| `InterestSelector` | — | interests?, onSelect, multiple? | Multi-select interest picker |
| `TravelStyleQuiz` | 236 | onComplete | Travel style questionnaire |

### Profile (`components/profile/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `ProfileHeader` | user, stats?, isOwn?, onEdit? | Cover + avatar + bio |
| `TripHistory` | trips, userId?, variant? | Past trips timeline |
| `BadgeShowcase` | badges, showCount? | Achievement badge grid |
| `PreferencesCard` | preferences, onUpdate?, editable? | Travel preference display/edit |

### Search (`components/search/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `SearchFilters` | 295 | filters, onFilterChange, categories? | Filter panel (price, date, rating) |
| `FilterChip` | — | label, icon?, onRemove?, active? | Individual filter tag |
| `SearchResults` | — | results, loading?, noResults?, onResultClick? | Paginated results |

### Settings (`components/settings/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `NotificationSettings` | 237 | preferences?, onSave? | Email/push/in-app toggles |
| `PrivacySettings` | — | settings?, onSave? | Profile visibility, trip privacy |
| `PrivacySettingsForm` | — | initialVisibility?, onSave? | Check-in visibility controls (PUBLIC/CREW/PRIVATE); wires to `/api/users/privacy`; Phase 5 Session 2, 2026-04-20 |
| `ProfileSettings` | — | user?, onSave? | Name, bio, avatar, email |
| `SecuritySettings` | 279 | user?, onPasswordChange? | Password, 2FA, sessions |

### Meetups (`components/meetups/`) — Phase 4, 2026-04-18

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `MeetupCard` | — | meetup, onRSVP?, onShare? | Meetup summary card with RSVP count + host |
| `MeetupList` | — | meetups, loading?, onRSVP? | Grid/list of MeetupCards with empty state |
| `CreateMeetupModal` | — | open, onOpenChange, onSuccess? | Modal form to create a new meetup with VenuePicker |
| `RSVPButton` | — | meetupId, currentStatus?, onStatusChange? | GOING / MAYBE / DECLINED toggle |
| `VenuePicker` | — | onSelect, cityId? | Searchable venue selector wired to /api/venues/search |
| `AttendeeList` | 153 | attendees, hostId? | Attendee grouping by GOING/MAYBE/DECLINED with count badges |
| `MeetupInviteModal` | 335 | open, onOpenChange, meetupId | Framer Motion modal; multi-select Crew member invite |

### Check-ins (`components/checkins/`) — Phase 5, 2026-04-18

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `CheckInButton` | — | onSuccess? | Post a check-in with optional venue + note |
| `LiveActivityCard` | 175 | checkIn, onJoinMe?, className? | Check-in card with active timer, venue, note, and "Join me" CTA |
| `NearbyCrewList` | — | className? | Polls `/api/checkins/feed` every 60s, renders `LiveActivityCard` list; **Day 10 (2026-07-21)** — added Ping buttons (POST `/api/checkins/ping`) + a defensive feed-shape read (feed returns a bare array, not `{items}`) |

### Crew (`components/crew/`) — Day 10, 2026-07-21

| Component | Props | Purpose |
|-----------|-------|---------|
| `SuggestionCard` | suggestion, onAdd?, ... | FoF "People you may know" card; inline Add sends a Crew request (POST `/api/crew/request`). Rendered in the suggestions block on `/crew`, fed by `GET /api/crew/suggestions`. |

### Social (`components/social/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `ActivityCard` | — | activity, trip?, onSave?, onShare? | Activity recommendation card |

> Note: `TravelBadges` was deleted 2026-04-16 (confirmed unused dead code).

### Safety (`components/safety/`) — Day 5, 2026-07-16

| Component | Props | Purpose |
|-----------|-------|---------|
| `BlockButton` | userId, isBlocked?, onChange? | Block/unblock a user with a confirm step; POSTs/DELETEs `/api/users/[userId]/block`. Wired into `/profile/[userId]` + `/crew`. |
| `ReportButton` | targetType, targetId, ... | Report a user/meetup with a reason (`ReportReason`); POSTs `/api/reports`. Mounted on `/profile/[userId]` + meetup detail (non-host). Day 6, 2026-07-17. |

### Surveys (`components/surveys/`) — 📦 ARCHIVED 2026-04-16

> Moved to `src/components/_archive/surveys/`. May be repurposed for Poll UI in Phase 2. See [Archived surface (Phase 1)](#archived-surface-phase-1).

### Trips (`components/trips/`) — 📦 ARCHIVED 2026-04-16

> All trip components (TripCard, TripList, TripWizard, TripHeader, TripOverview, MemberList, ItineraryTimeline, InviteModal, InviteMemberModal, AddActivityModal, wizard steps) moved to `src/components/_archive/trips/`. See [Archived surface (Phase 1)](#archived-surface-phase-1).

### UI (`components/ui/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `Button` | variant (primary\|secondary\|ghost), size, disabled, onClick | Action button with Framer Motion |
| `Card` | className, children, hover? | Content container |
| `Input` | type, placeholder, value, onChange, error?, label? | Text input with error state |
| `Dialog` | open, onOpenChange, trigger, content, header, footer | Radix modal dialog |
| `Dropdown` | trigger, items, onSelect | Menu dropdown |
| `Tooltip` | content, children, side? | Hover tooltip (Radix + Framer) |
| `Avatar` | src, alt, size (sm\|md\|lg), fallback | User avatar with initials |
| `AvatarStack` | avatars[], maxDisplay, size?, onViewAll? | Overlapping avatar group |
| `Badge` | variant (primary\|secondary\|success\|danger), children, icon? | Status/count badge |
| `Skeleton` | className, width?, height? | Loading placeholder |
| `EmptyState` | icon, title, description, action? | Empty state UI |
| `Tabs` | tabs[], defaultValue?, onValueChange? | Radix tab navigation |
| `Switch` | checked, onCheckedChange, disabled?, label? | Toggle switch |
| `Select` | options, value, onChange, placeholder? | Dropdown select |
| ~~`ImagePicker`~~ | — | Removed 2026-06-08 (`src/components/ui/ImagePicker.tsx` — confirmed unused dead code) |
| `FloatingShareButton` | itemId, itemType, onShare? | Floating share FAB |
| `Toast` | message, type (success\|error\|info), duration?, onClose | Toast notification |

### Voting (`components/voting/`) — 📦 ARCHIVED 2026-04-16

> All voting components moved to `src/components/_archive/voting/`. May be repurposed for Poll UI in Phase 2. See [Archived surface (Phase 1)](#archived-surface-phase-1).

### Navigation

| Component | Purpose |
|-----------|---------|
| `Navigation.tsx` | Fixed top nav: logo, links, auth buttons, profile dropdown, notification bell |

---

## Libraries & Utilities

### Auth & Middleware

| File | Exports | Purpose |
|------|---------|---------|
| `lib/auth.ts` | authOptions, getServerSession | NextAuth config (Google + Credentials) |
| `lib/api-middleware.ts` (283L) | withAuth, withValidation, validateZod | Request validation, error handling, auth decorators |
| `middleware.ts` | — | Route protection redirect |

### Real-time & Communication

| File | Exports | Purpose |
|------|---------|---------|
| `lib/pusher.ts` | getPusherServer, getPusherClient, channels, events, broadcastToTrip, broadcastToUser | Pusher instances + helpers |
| `lib/email.ts` (392L) | sendInvite, sendNotification, sendTripUpdate | Resend email templates |
| `lib/rate-limit.ts` | rateLimit, getRemainingQuota | Upstash rate limiter |

### External APIs

| File | Exports | Purpose |
|------|---------|---------|
| `lib/api/unsplash.ts` | searchImages, getImage | Unsplash image search |
| `lib/api/places.ts` | searchPlaces, getPlaceDetails, getPlacePhotos | Google Places API |
| `lib/api/ticketmaster.ts` | searchEvents, getEventDetails | Ticketmaster events |
| `lib/api/flights.ts` | searchFlights, estimateCost | Flight search |

### Core Utilities

| File | Exports | Purpose |
|------|---------|---------|
| `lib/prisma.ts` | prisma | Singleton Prisma client |
| `lib/logger.ts` | logger, apiLogger, authLogger, logError, logSuccess | Pino structured logging |
| `lib/sanitize.ts` | sanitizeHTML, sanitizeInput | XSS prevention |
| `lib/geocoding.ts` (289L) | getLocationFromCoords, getCoordsFromLocation | Nominatim geocoding |
| `lib/invitations.ts` | generateInviteToken, validateToken, redeemInvite | Invitation tokens |
| `lib/api-config.ts` | API_ENDPOINTS, API_TIMEOUT | Centralized API constants |
| `lib/utils/costs.ts` | — | Cost calculation helpers |
| `lib/providers.tsx` | — | React Query + SessionProvider wrapper |

### V1 Intent → SubCrew → Meetup

| File | Exports | Purpose |
|------|---------|---------|
| `lib/hotness/score.ts` | computeHotnessBoost, HOTNESS_CONFIG | Density-derived hotness multiplier [1.0, 2.5] for recommendations (BUILD_PLAN Day 1) |
| `lib/subcrews/graduate-to-meetup.ts` | graduateSubCrewToMeetup | Graduates a frozen SubCrew (`startAt`+`venueId`) into a CREW Meetup — creates the Meetup (`scheduledAt=startAt`, `endsAt=endAt`), links all `SubCrewMember`s as `MeetupAttendee`s, sets `SubCrew.meetupId`; idempotent (transaction + `updateMany` claim + `@unique`) (BUILD_PLAN Day 3, 2026-07-11) |

---

## Services

| Service | File | Lines | Key Methods | Purpose |
|---------|------|-------|-------------|---------|
| SurveyService | `services/survey.service.ts` | 377 | createSurvey, recordResponse, analyzeSurvey | Retained (may be repurposed as generic Poll service in Phase 2) |
| ~~RecommendationService~~ | 📦 `services/_archive/recommendation.service.ts` | — | — | Archived 2026-04-16 |
| ~~RecommendationData~~ | 📦 `services/_archive/recommendation-data.ts` | — | — | Archived 2026-04-16 |
| ~~EventsService~~ | 📦 `services/_archive/events.service.ts` | — | — | Archived 2026-04-16 |

---

## Hooks & Contexts

### Hooks (`hooks/`)

| Hook | File | Returns | Purpose |
|------|------|---------|---------|
| ~~`useTrips` / `useTrip` / `useCreateTrip` / `useUpdateTrip` / `useDeleteTrip`~~ | 📦 archived to `hooks/_archive/useTrips.ts` 2026-04-16 | — | — |
| `usePusherChannel` | usePusher.ts | {channel, isConnected, bind} | Generic Pusher channel sub |
| `useTripChannel` | usePusher.ts | — | Trip-specific channel |
| `useUserChannel` | usePusher.ts | — | User notification channel |
| `useVotingChannel` | usePusher.ts | {channel, onVoteCast, onVotingClosed} | Voting channel events |
| `useNotifications` | usePusher.ts | {notifications, clearNotification} | Real-time notifications |

### Contexts (`contexts/`)

| Context | File | Lines | Value | Purpose |
|---------|------|-------|-------|---------|
| RealtimeContext | RealtimeContext.tsx | 258 | isConnected, notifications, unreadCount, markAsRead, subscribeToTrip, onTripUpdate, onActivityAdded | Global Pusher + notification state |
| ToastContext | ToastContext.tsx | — | showToast, hideToast | Global toast dispatch |

---

## Types

**Files:** `src/types/index.ts` (449 lines) | `src/types/social.ts` (Phase 2, social domain composites) | `src/types/meetup.ts` (Phase 4, meetup/venue/attendee types) | `src/types/checkin.ts` (Phase 5, CheckIn types + `CheckInVisibility` enum)

### Key Type Categories

| Category | Types |
|----------|-------|
| User | UserPreferences, UserWithRelations |
| Trip | Destination, TripBudget, MemberBudgetRange, FlightDetails, TripWithRelations |
| Survey | QuestionType, SurveyQuestion, SurveyResponse |
| Voting | VotingSession |
| Recommendations | TripRecommendation, SurveyAnalysis |
| Itinerary | ItineraryDayData |

---

## Tests

**Total: 110 Vitest unit/integration test files, 2173 tests passing** (nightly/2026-07-22, Day 10 "Growth: FoF Crew suggestions + ping nearby"; new `src/__tests__/api/crew-suggestions.test.ts` (14) + `src/__tests__/api/checkins-ping.test.ts` (15); `src/__tests__/api/feed-comments-engagement.test.ts` +1 GET-401 regression (6 pre-existing GET tests updated to supply a session); no new `setup.ts` mocks; 0 TSC errors). Previous: 108 files / 2143 tests (nightly/2026-07-21, Day 9 "Search comes alive + Topic discovery"). Separately, `e2e/` adds 16 Playwright authenticated-flow tests (run via `npm run test:e2e`) — **passing 16/16 in a real Chromium browser**, not counted in the Vitest suite.

| File | Lines | Tests | Coverage |
|------|-------|-------|----------|
| `src/__tests__/api/crew-suggestions.test.ts` | — | 14 | `GET /api/crew/suggestions` — FoF ranking by mutual count (`src/lib/heatmap/fof-graph.ts`), existing/PENDING-Crew + blocked-user exclusion, graceful degradation without `UserBlock`, auth/rate-limit/Zod paths ✅ 2026-07-21 nightly/2026-07-22 (BUILD_PLAN Day 10) |
| `src/__tests__/api/checkins-ping.test.ts` | — | 15 | `POST /api/checkins/ping` — nearby active accepted-Crew targeting, `CREW_CHECKED_IN_NEARBY` dispatch, rate-limit 429, auth paths ✅ 2026-07-21 nightly/2026-07-22 (BUILD_PLAN Day 10) |
| `src/__tests__/api/topics-counts.test.ts` | — | 12 | `GET /api/topics?withCounts=true` — opt-in Zod-validated query param, live-Intent counts per Topic (`expiresAt > now`) via `prisma.intent.groupBy`, additive `count` field, fail-soft `count: 0` when groupBy throws, unchanged default envelope for the 3 existing consumers ✅ 2026-07-20 nightly/2026-07-21 (BUILD_PLAN Day 9) |
| `src/__tests__/search-page-logic.test.ts` + `src/__tests__/topics-page-logic.test.ts` | — | 99 (combined) | `searchPageLogic.ts` — `user\|meetup\|venue` result normalization, result-type filter selection, empty/error states, non-navigable venue rows. `topicsPageLogic.ts` — `formatSignalCount` boundaries (caught the fractional-count bug: `count <= 0` was guarded *before* flooring, so a value in (0,1) rendered "0 Crew signaled" instead of "Be the first to signal") + `buildTopicIntentHref` ✅ 2026-07-20 nightly/2026-07-21 (BUILD_PLAN Day 9) |
| `src/__tests__/api/heatmap-contributor-count.test.ts` | — | 24 | `GET /api/heatmap/contributor-count` — contributor count for a venue/cell, N≥3 anonymous floor (`meetsFloor`), `cellResolved` handling, response shape leaks nothing else, auth/rate-limit/Zod paths ✅ 2026-07-20 nightly/2026-07-20 (BUILD_PLAN Day 8) |
| `src/__tests__/components/notification-preferences-form.test.ts` | — | 20 | `NotificationPreferencesForm.tsx` — envelope-unwrap regression (`{success, data:{preferences}}` → array), defensive parse of malformed payloads, render + save paths ✅ 2026-07-20 nightly/2026-07-20 (BUILD_PLAN Day 8) |
| `src/__tests__/api/onboarding.test.ts` | — | 13 | `GET/POST /api/users/onboarding` — GET onboarded/not-onboarded, POST idempotent `onboardedAt` stamp, auth/rate-limit/Zod paths ✅ 2026-07-19 nightly/2026-07-19 (BUILD_PLAN Day 7) |
| `src/__tests__/onboarding-flow.test.ts` | — | 12 | `onboardingFlow.ts` step gating + completion helpers (Topics → Crew → first Intent) ✅ 2026-07-19 nightly/2026-07-19 (BUILD_PLAN Day 7) |
| `src/__tests__/components/empty-error-states.test.ts` | — | 5 | Shared `EmptyState` + `ErrorBanner` render/retry (role=alert, Retry/Dismiss) ✅ 2026-07-19 nightly/2026-07-19 (BUILD_PLAN Day 7) |
| `src/__tests__/api/user-block.test.ts` | — | 12 | `POST/DELETE /api/users/[userId]/block` — block/unblock persistence, idempotency, Crew-edge auto-sever on block, 401/400/404/429 paths ✅ 2026-07-16 nightly/2026-07-16 (BUILD_PLAN Day 5) |
| `src/__tests__/api/block-enforcement.test.ts` | — | 8 | Mutual block enforcement — one assertion per surface (crew list, feed, heatmap aggregate, check-in feed) + controls; a blocked pair sees nothing of each other, no partial leak ✅ 2026-07-16 nightly/2026-07-16 (BUILD_PLAN Day 5) |
| `src/__tests__/api/reports.test.ts` | — | 15 | `POST/GET /api/reports` — report persistence with `ReportReason` enum, self-report 400, target-exists 404, duplicate-report idempotency, admin-only GET allowlist + `?status` filter, 401 paths ✅ 2026-07-17 nightly/2026-07-17 (BUILD_PLAN Day 6). Meetup/crew-request tests extended for the daily-quota 429 (+2) |
| `src/__tests__/api/relationship-settings.test.ts` | — | 16 | `GET/PATCH /api/users/relationship-settings` — GET lists per-Crew-member privacy settings (default BLOCK granularity / KNOWN identity), PATCH upserts `granularity`+`identityMode` per `targetId`, authz (403 non-Crew target), Zod enum validation ✅ 2026-07-13 nightly/2026-07-13 (BUILD_PLAN Day 4) |
| `src/__tests__/api/subcrew-graduation.test.ts` | — | 13 | `PATCH /api/subcrews/[id]` graduation — `graduateSubCrewToMeetup` (`src/lib/subcrews/graduate-to-meetup.ts`): creates a CREW Meetup when `startAt`+`venueId` set, links all `SubCrewMember`s as attendees, sets `SubCrew.meetupId`, idempotency (transaction + `updateMany` claim + `@unique`), not-yet-frozen no-op branch ✅ 2026-07-11 nightly/2026-07-11 (BUILD_PLAN Day 3) |
| `src/__tests__/lib/hotness-score.test.ts` | — | 16 | `computeHotnessBoost` (`src/lib/hotness/score.ts`) — density-derived multiplier in [1.0, 2.5], linear decay, rolling-window cutoff, crew-weight, empty-cell neutral (1.0), monotonic in density ✅ 2026-06-29 nightly/2026-06-30 (BUILD_PLAN Day 1) |
| `src/__tests__/checkins-privacy-edge.test.ts` | — | 22 | Check-in privacy / stalking-mitigation — `activeUntil` clamping (now+30m..now+12h, default 6h), feed expiry gate, PUBLIC/CREW/PRIVATE visibility scoping, owner-only DELETE, 401s ✅ 2026-06-11 nightly/2026-06-11 |
| `src/__tests__/api/meetups-authz-edge.test.ts` | — | 27 | Meetup authorization — host-only PATCH/DELETE, RSVP capacity/duplicate, invite authz + fan-out cap, 401/400/403/404/409 ✅ 2026-06-11 nightly/2026-06-11 |
| `src/__tests__/api/topics-ratelimit.test.ts` | — | 9 | GET /api/topics — per-user rate-limit (429 on quota exceed), header propagation, auth ✅ 2026-06-08 nightly/2026-06-08 |
| `src/__tests__/api/feed.test.ts` | — | 12 | GET /api/feed — rescoped meetup/checkin item types, pagination, auth ✅ 2026-04-22 Phase 6 |
| `src/__tests__/api/feed-extended.test.ts` | — | 25 | Feed edge cases — empty feed, multiple content types, DB errors, feedType params ✅ 2026-04-22 Phase 6 |
| `src/__tests__/api/notifications-rescoped.test.ts` | — | 18 | Social notification types — CREW_REQUEST, CREW_ACCEPTED, MEETUP_INVITED, MEETUP_RSVP, MEETUP_STARTING_SOON, CREW_CHECKED_IN_NEARBY, SYSTEM ✅ 2026-04-22 Phase 6 |
| `src/__tests__/api/search.test.ts` | — | 21 | GET /api/search — people-first ordering (users→meetups→venues), type enum validation, empty results ✅ 2026-04-22 Phase 6 (rewrote from 13 trip-focused tests) |
| `src/__tests__/api/discover-recommendations.test.ts` | — | 26 | GET /api/discover/recommendations — auth, category filter, rate limiting, pagination, empty results, error paths ✅ 2026-04-21 Phase 6 S1 |
| `src/__tests__/api/privacy-settings.test.ts` | — | 28 | GET/PATCH /api/users/privacy — auth, visibility enum validation, Zod errors, update flow ✅ 2026-04-20 Phase 5 S2 |
| `src/__tests__/api/checkins-pusher.test.ts` | — | 16 | Pusher broadcast on POST /api/checkins — city channel trigger, visibility gating, graceful degradation ✅ 2026-04-20 Phase 5 S2 |
| `src/__tests__/api/venues-search-places.test.ts` | 474 | 18 | GET /api/venues/search — auth, DB-only path, Places API path, upsert, dedupe, category filter ✅ 2026-04-18 Phase 4 S3 |
| `src/__tests__/api/cron-meetup-starting-soon.test.ts` | 477 | 18 | GET /api/cron/meetup-starting-soon — auth, query shape, dispatch, idempotency, graceful degradation ✅ 2026-04-18 Phase 4 S3 |
| `src/__tests__/api/meetups.test.ts` | — | 11 | POST/GET /api/meetups — auth, validation, create, list, visibility scoping ✅ 2026-04-18 |
| `src/__tests__/api/meetups-id.test.ts` | — | 16 | GET/PATCH/DELETE /api/meetups/[id] — auth, host-only edit, Pusher broadcast, cancel ✅ 2026-04-18 |
| `src/__tests__/api/meetups-rsvp-invite.test.ts` | — | 22 | RSVP + invite routes — auth, status transitions, Pusher/email wiring, graceful degradation ✅ 2026-04-18 |
| `src/__tests__/api/feed-extended.test.ts` | — | 42 | Feed API edge cases: pagination, empty following, multiple activity types, DB errors, feedType params, POST errors ✅ 2026-04-16 |
| `src/__tests__/api/notifications-extended.test.ts` | — | 33 | Notifications lifecycle edge cases ✅ 2026-04-16 |
| `src/__tests__/api/health.test.ts` | — | 14 | GET /api/health — healthy/degraded paths, content-type, $queryRaw invocation ✅ 2026-04-16 |
| `src/__tests__/api/trips-survey-voting-extended.test.ts` | — | 23 | Survey + voting API edge cases ✅ 2026-04-16 |
| `src/__tests__/api/trips.test.ts` | 525 | 30 | Trips API (GET, POST, PATCH, DELETE) |
| `src/__tests__/api/trips-suggestions.test.ts` | — | 23 | Trips suggestions API (Ticketmaster + Places) |
| `src/__tests__/api/trips-flights.test.ts` | — | 26 | Trips flights API (Amadeus-style) |
| `src/__tests__/api/trips-members.test.ts` | — | 41 | Trips members API (GET, POST, PATCH, DELETE) — 12 POST tests added 2026-03-21 |
| `src/__tests__/api/verify-email.test.ts` | — | 9 | Email verification token flow (GET /api/auth/verify-email) |
| `src/__tests__/api/pusher-auth.test.ts` | — | 14 | Pusher channel auth (POST /api/pusher/auth) |
| `src/__tests__/api/auth-signup.test.ts` | — | 15 | POST /api/auth/signup — validation, token creation, email send ✅ 2026-03-22 |
| `src/__tests__/api/trips-tripid.test.ts` | — | 20 | GET/PATCH/DELETE /api/trips/[tripId] ✅ 2026-03-22 |
| `src/__tests__/api/trips-tripid-invitations.test.ts` | — | 14 | GET/POST /api/trips/[tripId]/invitations ✅ 2026-03-22 |
| `src/__tests__/api/trips-tripid-recommendations.test.ts` | — | 11 | GET/POST /api/trips/[tripId]/recommendations ✅ 2026-03-22 |
| `src/__tests__/api/trips-voting.test.ts` | — | 50 | Full voting session lifecycle — GET/POST/PUT /api/trips/[tripId]/voting ✅ 2026-03-23 |
| `src/__tests__/api/trips-invitations.test.ts` | — | 33 | GET/POST /api/trips/[tripId]/invitations with edge cases ✅ 2026-03-23 |
| `src/__tests__/api/pusher-feed-social.test.ts` | — | 38 | pusher/auth, feed/comments, feed/engagement, feed/share social routes ✅ 2026-03-23 |
| `src/__tests__/api/trips-itinerary.test.ts` | — | 43 | GET/POST/PUT /api/trips/[tripId]/itinerary ✅ 2026-03-23 |
| `src/__tests__/api/trips-itinerary.test.ts` | — | 21 | GET/PUT /api/trips/[tripId]/itinerary (expanded) ✅ 2026-03-24 |
| `src/__tests__/api/auth-demo.test.ts` | — | 13 | POST/GET /api/auth/demo — DEMO_MODE guard, Zod validation ✅ 2026-03-24 |
| `src/__tests__/api/cron.test.ts` | — | 10 | GET /api/cron — CRON_SECRET validation, job execution ✅ 2026-03-24 |
| `src/__tests__/api/discover-search.test.ts` | — | 12 | GET /api/discover/search — auth guard, rate limiting, Zod params ✅ 2026-03-24 |
| `src/__tests__/api/invitations-post.test.ts` | — | 18 | POST /api/trips/[tripId]/invitations — accept/decline flows ✅ 2026-03-25 |
| `src/__tests__/api/beta-extended.test.ts` | — | 21 | Extended beta route coverage ✅ 2026-03-25 |
| `src/__tests__/api/users-follow.test.ts` | — | 24 | POST /api/users/[userId] follow/unfollow lifecycle ✅ 2026-03-25 |
| `src/__tests__/services/recommendation.service.test.ts` | — | 45 | RecommendationService: analyzeSurveyResponses, dateAnalysis, locationPreferences, activityPreferences, createTripSurvey ✅ 2026-03-26 |
| `src/__tests__/services/survey.service.test.ts` | — | 36 | SurveyService: getUserPreferencesSurvey, getTripPlanningSurvey, analyzeSurveyResponses, closeSurvey, createTripSurvey (default+custom expiry) ✅ 2026-03-26 |
| `src/__tests__/api/geocoding-images.test.ts` | — | 32 | GET /api/geocoding + GET /api/images/search ✅ 2026-03-26 |
| `src/__tests__/api/discover-import.test.ts` | — | 21 | POST /api/discover/import — rate limiting, auth guard, externalActivity.upsert, OpenTripMap fetch ✅ 2026-03-29 |
| `src/__tests__/api/voting.test.ts` | — | 10 | Voting API (create, vote, close session) |
| `src/__tests__/api/survey.test.ts` | — | 11 | Survey API (create, respond, analyze) |
| `src/__tests__/api/feed.test.ts` | — | 12 | Feed API (pagination, comments, engagement) |
| `src/__tests__/lib/email.test.ts` | — | 14 | Email service (templates, delivery) |
| `src/__tests__/lib/geocoding.test.ts` | — | 26 | Geocoding (coords, city lookup, caching) |
| `src/__tests__/lib/invitations.test.ts` | — | 16 | Invitation tokens (generate, validate, redeem) |
| `src/__tests__/lib/rate-limit.test.ts` | — | 13 | Rate limiting (quota, window, headers) |
| `src/__tests__/lib/geocoding.test.ts` | — | 25 | Geocoding (coords, city lookup, caching) |
| `src/__tests__/lib/invitations.test.ts` | — | 16 | Invitation tokens (generate, validate, redeem) |
| `src/__tests__/lib/rate-limit.test.ts` | — | 38 | Rate limiting (quota, window, headers) |
| `src/__tests__/api/auth.test.ts` | — | 10 | Auth flow (signup, signin, session) |
| `src/__tests__/api/notifications.test.ts` | — | 19 | Notifications API (inbox, mark-read, delete) |
| `src/__tests__/api/profile.test.ts` | — | 10 | Profile API (GET, PATCH preferences) |
| `src/__tests__/api/reset-password.test.ts` | 286 | 12 | Password reset API (POST request, PATCH confirm, token validation, expiry) |
| `src/__tests__/api/users.test.ts` | 316 | 19 | Users API (follow/unfollow, profile, social) |
| `src/__tests__/api/share.test.ts` | 204 | 13 | Feed share endpoint |
| `src/__tests__/api/inspiration.test.ts` | 358 | 20 | Inspiration API (templates, trending, popular) |
| `src/__tests__/api/search.test.ts` | 328 | 15 | Search API (global, activities, users) |
| `src/__tests__/api/beta-initialize-password.test.ts` | 274 | 15 | Beta password initialization endpoint |
| `src/__tests__/api/inspiration.test.ts` | — | 20 | Inspiration API |
| `src/__tests__/api/search.test.ts` | — | 15 | Search API |
| `src/__tests__/api/share.test.ts` | — | 13 | Feed share API |
| `src/__tests__/api/users.test.ts` | — | 19 | Users API + health endpoint |
| `src/__tests__/api/activities.test.ts` | — | 15 | Activities API (GET, POST save/unsave, PUT comment/rate) |
| `src/__tests__/api/beta.test.ts` | — | 21 | Beta signup, beta status, newsletter subscribe |
| `src/__tests__/api/trips-suggestions-flights.test.ts` | — | 20 | GET /api/trips/[tripId]/suggestions and /flights |
| `src/__tests__/api/trips-members.test.ts` | — | 29 | GET/PATCH/DELETE /api/trips/[tripId]/members |
| `src/__tests__/api/trips-activities-itinerary.test.ts` | — | 37 | GET/POST /api/trips/[tripId]/activities; GET/PUT /api/trips/[tripId]/itinerary |
| `src/__tests__/api/users-me.test.ts` | — | 18 | GET/PATCH /api/users/me |
| `src/__tests__/api/feed-comments-engagement.test.ts` | — | 47 | GET/POST /api/feed/comments; POST /api/feed/engagement; **+1 GET-401 regression 2026-07-21 (BUILD_PLAN Day 10) — the 6 pre-existing GET tests now supply a session after the GET auth guard landed** |
| `src/__tests__/api/invitations.test.ts` | — | 24 | GET /api/invitations; GET/POST /api/invitations/[invitationId] |
| `src/__tests__/setup.ts` | — | — | Test environment/fixture config |
| `vitest.config.ts` | 16 | — | Vitest runner configuration |

---

## E2E Tests

**Framework:** Playwright (`@playwright/test`)
**Config:** `playwright.config.ts` — chromium only, auto dev server in CI
**Run:** `npm run test:e2e` (local) / `npm run test:e2e:ui` (interactive)
**Install:** `npx playwright install chromium`

| File | Lines | Suites | Tests | Coverage |
|------|-------|--------|-------|----------|
| `e2e/smoke.spec.ts` | 156 | 4 | 11 | Landing page CTA, auth flow (signup/signin/validation), protected route redirects, API health checks |
| `e2e/authenticated-flow.spec.ts` | — | — | 16 | Authenticated Crew→Meetup loop (Phase 8 action #5). **Passes 16/16 in a real Chromium browser (2026-06-11)** via signed-JWT cookie helper `e2e/auth-helper.ts`; gated API routes assert intentional middleware 307-redirects. **Now wired into CI (2026-06-12):** `.github/workflows/ci.yml` runs `npm run build` before the Playwright step so the production `webServer` (`npm run start`) has a `.next` build to serve. |

### E2E Suite Summary

| Suite | Tests | Description |
|-------|-------|-------------|
| Landing Page | 2 | Title, CTA button visibility, nav links |
| Auth Flow | 4 | Signup/signin page load, email validation, invalid credentials error |
| Protected Routes | 3 | Unauthenticated redirect for /trips, /profile, /feed |
| API Health | 6 | /api/health 200, unauthenticated 401s, password reset 200, feed validation 400 |

---

## Codebase Health

| Metric | Status |
|--------|--------|
| Lint warnings | 0 |
| `any` types | 0 ✅ |
| `console.*` | 0 ✅ |
| TSC errors (prod + test) | 0 ✅ |
| Vitest tests | 2032 passing, 105 test files (nightly/2026-07-20, BUILD_PLAN Day 8; +24 `heatmap-contributor-count.test.ts` +20 `notification-preferences-form.test.ts` +13 `notification-preferences.test.ts` +1 `daily-prompt.test.ts`); archived tests runnable on demand via `npm run test:archive` |
| E2E tests | 11 Playwright smoke tests + 16 authenticated-flow tests (`e2e/authenticated-flow.spec.ts`) — **passing 16/16 in a real Chromium browser as of 2026-06-11** (Phase 8 action #5 complete; signed-JWT cookie helper `e2e/auth-helper.ts`); **now run in CI behind a production build** (`.github/workflows/ci.yml` builds before the Playwright step, 2026-06-12); trip-specific specs archived |
| Error monitoring | Sentry — ~63/64 non-archive routes instrumented with `captureException` as of 2026-06-08 (only NextAuth catch-all re-export uncovered); 19/48 coverage figure is pre-archive trip-era historical |
| Live API routes | 66 (excluding `_archive`; 79 raw route.ts) as of 2026-07-20: 35 base + 6 Crew + 9 Phase 4 meetup/venue/cron + 3 Phase 5 check-in + privacy + 14 V1 routes (intents 4 + subcrews 6 + topics + heatmap + recommendations + cron/expire-intents) + `users/relationship-settings` (Day 4) + `users/[userId]/block` (Day 5) + `reports` (Day 6) + `users/onboarding` (Day 7) + `heatmap/contributor-count` (Day 8); feed POST now 410; AI routes deleted 2026-04-23 |
| TS/TSX files | 366 (`find src` excl `_archive`/node_modules/.next) as of 2026-07-20 (prior "~429" headline counted `_archive`) |
| Files >400 lines | 0 in prod (email.ts ~507 lines holds all crew/meetup email functions; the dead `email-crew.ts` duplicate was deleted 2026-06-10; types/index.ts reduced to 264 lines in Phase 6) |
| Production env gaps | Pusher vars, Sentry DSN, Resend domain, GOOGLE_PLACES_API_KEY |
| **Phase status** | **Phase 6 COMPLETE** (2026-04-22): feed rescoped, search people-first, 9 trip notification types removed, types/index.ts cleaned. Phase 7 (Marketing surface) is next. |

---

## Archived surface (Phase 1)

As of **2026-04-16** the trip-planning product surface has been archived to `_archive/` directories with zero runtime footprint. The code remains browsable, `grep`-able, and revivable. See `src/_archive/README.md` for the preservation scheme and reactivation steps.

### What's archived
| Layer | Destination |
|-------|-------------|
| API routes (14) | `src/app/api/_archive/trips/**`, `src/app/api/_archive/activities/**` |
| Pages | `src/app/_archive/trips/**` |
| Components | `src/components/_archive/trips/**`, `src/components/_archive/surveys/**`, `src/components/_archive/voting/**` |
| Services | `src/services/_archive/recommendation.service.ts`, `recommendation-data.ts`, `events.service.ts` |
| Tests | `src/__tests__/_archive/**` (excluded from default `npm test`) |
| Docs snapshots | `docs/archive/trip-planning/` (owned by agent F) |
| Prisma models | 16 models marked `@deprecated` (Trip, TripMember, TripInvitation, PendingInvitation, TripSurvey, SurveyResponse, VotingSession, Vote, Activity, SavedActivity, ActivityComment, ActivityRating, ItineraryDay, ItineraryItem, ExternalActivity) |
| Git tag | `v1.0-trip-planning` anchors the pre-pivot commit |

### What remains live
- **API (66 live routes):** auth/*, beta/*, crew/*, checkins/*, feed/*, meetups/*, venues/*, users/*, profile, search, notifications/*, invitations/*, discover/*, inspiration, pusher/auth, geocoding, images/search, newsletter, cron, health, plus 14 V1 routes (intents/*, subcrews/*, topics, heatmap, recommendations, cron/expire-intents)
- **Pages:** /, /auth/*, /profile, /feed, /discover, /inspiration, /notifications, /search, /settings, /onboarding, /privacy, /terms, /crew, /meetups, /checkins
- **Components:** accessibility, auth, checkins, crew, discover, feed, meetups, notifications, onboarding, profile, search, settings, social, ui + Navigation.tsx (trip links removed, AI removed 2026-04-23)
- **Services:** survey.service.ts (repurpose-pending)
- **Prisma models retained:** User, Account, Session, VerificationToken, Follow, Notification, TripComment, TripLike (last two to be generalized into Post* in Phase 2+)

### Largest Files (>400 lines)

| File | Lines | Action |
|------|-------|--------|
| `app/profile/page.tsx` | 539 | Extract profile sections |
| `components/trips/AddActivityModal.tsx` | 485 | Extract form sections |
| `components/surveys/SurveyBuilder.tsx` | 473 | Extract question editor |
| `services/recommendation.service.ts` | 459 | Consider splitting by concern |
| `types/index.ts` | 449 | Split by domain |
| `components/feed/RichFeedItem.tsx` | 222 | ✅ Refactored 2026-05-04 (was 717→222, 11 subcomponents extracted) |
| `app/inspiration/page.tsx` | 401 | Extract template/trending sections |
| `app/api/inspiration/route.ts` | 398 | Extract template data |

---

## Documentation Index

| File | Purpose |
|------|---------|
| `docs/README.md` | Documentation index |
| `docs/CODEMAP.md` | This file — full codebase reference |
| `docs/IMPLEMENTATION_STACK.md` | Tech stack details |
| `docs/FUTURE_IMPLEMENTATION.md` | Planned features |
| `docs/PRODUCTION_ROADMAP.md` | Production deployment plan |
| `docs/LAUNCH_CHECKLIST.md` | Pre-launch validation |
| `docs/SECURITY_AUDIT.md` | Security assessment |
| `docs/TEST_CASES.md` | QA test scenarios |
| `docs/N8N_SETUP_SUMMARY.md` | N8N automation config |
| `docs/N8N_BETA_NEWSLETTER_INTEGRATION.md` | N8N workflow docs |
| `docs/N8N_DEPLOYMENT_CHECKLIST.md` | N8N deployment steps |
| `docs/agents/CODE_CHECKING_AGENT_GUIDE.md` | Linting/type-checking agent |
| `docs/agents/FRONTEND_AGENT_GUIDE.md` | Component/UI agent |
| `docs/agents/PLANNING_AGENT_GUIDE.md` | Task planning agent |
| `docs/agents/SOCIAL_ENGAGEMENT_AGENT_GUIDE.md` | Feed/social agent |
