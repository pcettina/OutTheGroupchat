# 📡 API & Integration Status

> **Last Updated: 2026-07-21** (nightly/2026-07-22 — BUILD_PLAN.md Day 10 "Growth: FoF Crew suggestions + ping nearby": **+2 live routes → 68 live routes** (excluding `_archive`; 81 raw route.ts). NEW `GET /api/crew/suggestions` (`src/app/api/crew/suggestions/route.ts`) — "People you may know" from the FoF graph (`src/lib/heatmap/fof-graph.ts`), ranked by mutual count, excluding existing/PENDING Crew and blocked users (block filter degrades gracefully if `UserBlock` is absent); auth → rate-limit → Zod → Sentry. Drives a suggestions block on `src/app/crew/page.tsx` via NEW `src/components/crew/SuggestionCard.tsx` with inline Add (POST `/api/crew/request`). NEW `POST /api/checkins/ping` (`src/app/api/checkins/ping/route.ts`) — pings active accepted-Crew check-ins near the caller, firing `CREW_CHECKED_IN_NEARBY` notifications; rate-limited via the existing `checkRateLimit`. Ping buttons added to `src/components/checkins/NearbyCrewList.tsx`, which also gained a defensive feed-shape read (`/api/checkins/feed` returns a bare array while the component expected `{items}` — normalized in-component; server-side normalization is a tracked follow-up). **SECURITY FIX:** `GET /api/feed/comments` (`src/app/api/feed/comments/route.ts`) previously had **no auth check** — a `getServerSession()` 401 guard was added, closing unauthenticated comment enumeration. No `schema.prisma` or `setup.ts` changes were needed (`CREW_CHECKED_IN_NEARBY` enum + all mocks already present). Tests → **110 files / 2173 tests** (+30: `api/crew-suggestions.test.ts` (14) + `api/checkins-ping.test.ts` (15) + `api/feed-comments-engagement.test.ts` (+1 GET-401 regression; 6 pre-existing GET tests updated to supply a session)). tsc 0, lint 0/0, full vitest 2173/2173, prisma valid; `npm run build` skipped (known Windows type-check-worker heap-corruption flake). PR https://github.com/pcettina/OutTheGroupchat/pull/150.)
> **Previous (2026-07-20, nightly/2026-07-21 — BUILD_PLAN.md Day 9 "Search comes alive + Topic discovery": **no route additions or removals → still 66 live routes** (excluding `_archive`; 79 raw route.ts). One existing route changed, additively: `GET /api/topics` (`src/app/api/topics/route.ts`) now takes an optional `req` (`GET(req?: Request)`; a bare `GET()` still works) and supports an **opt-in, Zod-validated `?withCounts=true`** query param. When set, each Topic in the response gains a `count` field — the number of **live** Intents on that Topic (`expiresAt > now`), computed via a single `prisma.intent.groupBy({ by: ['topicId'], where: { expiresAt: { gt: now } }, _count: { _all: true } })`. Counts are **fail-soft**: a groupBy failure is logged and each Topic returns `count: 0` rather than 500ing, because this endpoint gates signup/onboarding. The default (no query param) envelope `{success, data: {topics: [{id, slug, displayName}]}}` is **byte-for-byte unchanged** for the 3 existing consumers (`IntentCreateForm`, `onboardingFlow`, `InterestSelector`). **`GET /api/search` is unchanged but now has a mounted UI** — the previously orphaned search surface is live at `/search` (`src/app/search/page.tsx` + `src/app/search/searchPageLogic.ts`). The stale trip-domain components were rewritten against the real API: `src/components/search/SearchResults.tsx` now handles the `user|meetup|venue` union (was `trip|activity|user` with dead `/trips/:id` + `/activities/:id` hrefs) and `src/components/search/SearchFilters.tsx` was reduced from a trip filter panel (destination/budget/groupSize) to a result-type selector over the real API enum, built from `FilterChip`; venue results render non-navigable (no venue route exists). New `/topics` browse page (`src/app/topics/page.tsx` + `topicsPageLogic.ts`). `src/components/Navigation.tsx` gained `/search` (Search icon) + `/topics` (Hash icon), with `/discover` re-iconed to Compass to keep icons unique; `src/middleware.ts` matcher gained `/search/:path*` + `/topics/:path*`. **BUG FIX:** `formatSignalCount()` in `topicsPageLogic.ts` guarded `count <= 0` *before* flooring, so a fractional count in (0,1) rendered a bare "0 Crew signaled" instead of "Be the first to signal" — now floors first, then guards. **Known limitation:** the Topic tile deep-links to `/intents/new` *without* topic prefill, because `IntentCreateForm` reads only `?window=`; the href is centralized in `buildTopicIntentHref()` for a one-line fix. Tests → **108 files / 2143 tests** (+111: `api/topics-counts.test.ts` (12) + `search-page-logic.test.ts` + `topics-page-logic.test.ts` (99 combined)); `setup.ts` gained an additive `prisma.intent.groupBy` mock. tsc 0, lint 0/0, full vitest 2143/2143, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/149.)
> **Previous (2026-07-20, nightly/2026-07-20 — BUILD_PLAN.md Day 8 "Tighten the notification loop": **+1 live route → 66 live routes** (excluding `_archive`; 79 raw route.ts) — `GET /api/heatmap/contributor-count` (`src/app/api/heatmap/contributor-count/route.ts`). Guard chain auth → rate-limit → Zod; returns only `{count, floor, meetsFloor, cellResolved}`. Backed by new `src/lib/heatmap/contributor-count.ts` + new shared `src/lib/heatmap/anonymous-floor.ts`; `src/lib/heatmap/aggregate.ts` now imports the shared `ANONYMOUS_FLOOR` instead of its own literal. Frontend: `src/components/privacy/PrivacyPickerModal.tsx` disables Anonymous with the R14 explanation below the N≥3 floor and fails safe while loading/erroring, and `src/components/subcrews/SubCrewCoordinationPanel.tsx` passes `venueId`/`cityArea`/`contributionType` so the check is live. **No route change, notification loop:** new `src/components/notifications/PerMemberIntentToggle.tsx` on `/crew` + `/profile/[userId]` writes `NotificationPreference.perMemberTargets` via the existing `PATCH /api/users/notification-preferences` (read-modify-write, optimistic + rollback); `src/lib/notifications/daily-prompt.ts` actionUrl → `/intents/new?window=EVENING` (exports `PROMPT_WINDOW_PRESET` + `PROMPT_LINK`) and `IntentCreateForm.tsx` prefills from `?window=`. **BUG FIX:** `src/components/settings/NotificationPreferencesForm.tsx` passed the whole `{success, data:{preferences}}` envelope to a parser requiring an array, so the settings page always rendered empty preferences — now unwrapped defensively. Tests → **105 files / 2032 tests** (+58: `heatmap-contributor-count.test.ts` (24), `components/notification-preferences-form.test.ts` (20), `api/notification-preferences.test.ts` (+13), `lib/daily-prompt.test.ts` (+1)); no new `setup.ts` mocks. tsc 0, lint 0/0, full vitest 2032/2032, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/148.)
> **Previous (2026-07-19, nightly/2026-07-19 — BUILD_PLAN.md Day 7 "Activation: real onboarding + empty/error states": **+1 live route** — `POST/GET /api/users/onboarding` (`src/app/api/users/onboarding/route.ts`). GET returns `{onboarded, onboardedAt}`; POST stamps `User.onboardedAt=now` (idempotent overwrite). Guard chain auth → rate-limit → Zod → Sentry + pino. Additive `User.onboardedAt DateTime?` on `prisma/schema.prisma`. Drives the new 3-step `/onboarding` client flow (Topics → Crew → first Intent; `src/app/onboarding/page.tsx`) — the dead trip-era `src/components/onboarding/InterestSelector.tsx` was rewritten into a real Topic selector, and `src/app/auth/signup/page.tsx` now redirects brand-new signups to `/onboarding` (explicit `callbackUrl` still honored). **Empty/error states (no route change):** new shared `src/components/ui/ErrorBanner.tsx` (role=alert, Retry/Dismiss); feed silent catches now surface it, and `/intents`, `/subcrews/[id]`, `/feed` empty blocks use the shared `EmptyState` with CTAs. Live route count now **78** raw route.ts files (was 77). Tests → **103 files / 1976 tests** (+30: `onboarding.test.ts` (13) + `onboarding-flow.test.ts` (12) + `empty-error-states.test.ts` (5)). tsc 0, lint 0/0, full vitest 1976/1976, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/147.)
> **Previous (2026-07-17, nightly/2026-07-17 — BUILD_PLAN.md Day 6 "Trust & Safety II: report + anti-spam": **+1 live route** — `POST/GET /api/reports` (`src/app/api/reports/route.ts`). POST files a report with a `ReportReason` enum against a user or meetup — self-report guard (400), target-exists check (404), duplicate report is idempotent (200), otherwise create (201); Zod + `getServerSession()` + Sentry + pino. GET is an admin-only list (allowlist via `ADMIN_USER_IDS` env, optional `?status` filter). New additive `Report` model + `ReportReason`/`ReportStatus`/`ReportTargetType` enums in `prisma/schema.prisma`. New UI `src/components/safety/ReportButton.tsx` mounted on profile + meetup detail (non-host). **Anti-spam:** new `creationQuotaLimiter` (10/user/24h, prefix `ratelimit:creation`) in `src/lib/rate-limit.ts`; a stricter daily-quota 429 + high-frequency-creator warn layered onto the existing per-minute limiter on `src/app/api/meetups/route.ts` (`meetup-create-daily` key) and `src/app/api/crew/request/route.ts` (`crew-request-daily` key) — no duplicate limiter on the same key. Live route count now **77** raw route.ts files (was 76). Tests → **100 files / 1946 tests** (+17: `src/__tests__/api/reports.test.ts` (15) + daily-quota 429 (2)). tsc 0, lint 0/0, full vitest 1946/1946, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/146.)
> **Previous (2026-07-16, nightly/2026-07-16 — BUILD_PLAN.md Day 5 "Trust & Safety I: block a user": **+1 live route** — `POST/DELETE /api/users/[userId]/block` (`src/app/api/users/[userId]/block/route.ts`). POST blocks a user, DELETE unblocks; both idempotent; blocking auto-severs any existing Crew edge. 401/400/404/429 guards, Zod + `getServerSession()` + Sentry + pino. New `prisma.UserBlock` model (`blockerId`/`blockedId`, unique pair, back-relations `blocksInitiated`/`blocksReceived`) + additive idempotent migration `prisma/migrations/20260716100000_add_user_block/`. **Mutual block enforcement** added to 4 read surfaces so a blocked pair sees nothing of each other (no partial leak): crew list `src/app/api/crew/route.ts`, feed `src/app/api/feed/route.ts`, heatmap `src/lib/heatmap/aggregate.ts`, check-in feed `src/app/api/checkins/feed/route.ts`. New UI `src/components/safety/BlockButton.tsx` wired into `src/app/profile/[userId]/page.tsx` + `src/app/crew/page.tsx`. Live route count now **63** (excl. `_archive`; 76 raw route.ts files). Tests → **121 files / 1929 tests** (+20: `src/__tests__/api/user-block.test.ts` (12) + `src/__tests__/api/block-enforcement.test.ts` (8)). `next build` compiles OK but the Next 14.2.35 type-check worker env-crashes on this Windows host (exit 0xC0000374, heap corruption) — verified green via standalone tsc 0, lint 0/0, full vitest 1929/1929, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/145.)
> **Previous (2026-07-13, nightly/2026-07-13 — BUILD_PLAN.md Day 4 "Per-relationship privacy defaults": **+1 live route** — `GET/PATCH /api/users/relationship-settings` (`src/app/api/users/relationship-settings/route.ts`). GET lists the viewer's per-Crew-member privacy settings, defaulting each Crew member to BLOCK granularity / KNOWN identity where no `CrewRelationshipSetting` row exists yet; PATCH upserts a member's `granularity` + `identityMode` (Zod-validated enums), returns 403 for a non-Crew `targetId`. Makes R4/R20 reachable — `lib/heatmap/aggregate.ts` already reads these rows; this Day adds the write path. New UI `src/components/privacy/RelationshipSettingsList.tsx` mounted at `src/app/settings/privacy/relationships/page.tsx` (linked from `settings/privacy`). Live route count now **62** (excl. `_archive`; 75 raw route.ts files). Tests → **119 files / 1909 tests** (+16 in `src/__tests__/api/relationship-settings.test.ts`). Build PASS, lint 0/0, prisma valid, tsc 0. PR https://github.com/pcettina/OutTheGroupchat/pull/144.)
> **Previous (2026-07-11, nightly/2026-07-11 — BUILD_PLAN.md Day 3 "SubCrew graduates into a Meetup": **no route additions or removals** (route count now **74** on the current audit). No new API surface — `PATCH /api/subcrews/[id]` gained a side effect: after updating a SubCrew that has both `startAt` and `venueId` set, it calls `graduateSubCrewToMeetup` (`src/lib/subcrews/graduate-to-meetup.ts`), which creates one `Meetup` (visibility=`CREW`, `scheduledAt=startAt`, `endsAt=endAt`), attaches every `SubCrewMember` as a `MeetupAttendee`, and sets `SubCrew.meetupId`. Idempotent (transaction + `updateMany` claim + `@unique`). PATCH response gained sibling fields `meetup` and `graduated`. The coordination panel shows a graduated banner + "View Meetup" link. Tests → **118 files** (+13 in `src/__tests__/api/subcrew-graduation.test.ts`). Build PASS, lint 0/0, prisma valid, tsc 0. PR pending.)
> **Previous (2026-06-30, nightly/2026-06-30 — BUILD_PLAN.md Day 2 "Make 'hot' visible + persist the chosen venue": **no route additions or removals** (still **61 live routes**). No new API surface — the SubCrew venue-selection UI (`src/components/subcrews/SubCrewCoordinationPanel.tsx`) now **consumes the existing** `PATCH /api/subcrews/[id]` `venueId` field (already Zod-validated + persisted; verified unchanged, not re-implemented). UI-side work only: "🔥 Hot now" badges surface the real `hotnessBoost` (threshold 1.15) + contributor-count chips on recommendations + heatmap. Tests → **1880 tests / 95 files**. Build PASS, lint 0/0, prisma valid, tsc 0. PR pending.)
> **Previous (2026-06-29, nightly/2026-06-30 — BUILD_PLAN.md Day 1 "Hotness signal goes live"):** no route additions or removals (still **61 live routes**). `GET /api/recommendations` now applies a **real density-derived hotness boost** — `src/lib/hotness/score.ts`'s `computeHotnessBoost` was implemented (was a literal `return 1.0` stub) and wired into ranking with `weightByCrew` active + a 5-min cache keyed by `(topicId, cityArea)`. Tests: new `src/__tests__/lib/hotness-score.test.ts` (16) + recommendations boost-reorder (+3) + repaired fixtures → **1861 tests / 93 files**. Build PASS, lint 0/0, prisma valid. See PR https://github.com/pcettina/OutTheGroupchat/pull/134.)
> **Previous (2026-06-12, nightly/2026-06-12):** lean quality-only build — no route additions, removals, or status changes (still **61 live routes**), no test changes (93 test files, 1863 tests). One code change, in CI config (not an API route): `.github/workflows/ci.yml` now runs `npm run build` before the Playwright E2E step so the authenticated-flow suite runs on every PR — closes prior rec #4.
> **Previous (2026-06-11, nightly/2026-06-11):** edge/security test depth + cleanup build — no route additions or removals (still **61 live routes**), no status changes. +49 edge/security tests added (check-in privacy/stalking-mitigation 22, meetup host/RSVP/invite authz 27) → 93 test files, 1863 tests. 7 unused imports removed; `any`-types confirmed 0 in live code. **Phase 8 action #5 (E2E authenticated flows) now PASSES 16/16 in a real Chromium browser** (signed-JWT cookie helper; production behavior was already correct — spec assertions corrected to match intentional middleware redirects). Doc fix: `/api/discover` base route (GET + POST flights) corrected to ARCHIVED — its only file is `src/app/api/_archive/discover/route.ts`; the live sub-routes `/api/discover/{search,recommendations,import}` are unaffected.
> **Previous (2026-06-10, nightly/2026-06-10):** housekeeping build — no route additions or removals (still **61 live routes**), no status changes. Dead code removed: `src/lib/email-crew.ts` (0 importers; crew emails served by `src/lib/email.ts`) + `src/components/feed/ReactionPicker.tsx`. Stale docs content-refreshed to the meetup-centric reality. 91 test files, 1814 tests.
>
> **Previous (2026-06-08, nightly/2026-06-09):** Sentry `captureException` added to 8 more routes/handlers — `discover/search`, `discover/recommendations`, `discover/import`, `images/search`, `invitations`, `invitations/[invitationId]`, `newsletter/subscribe`, and `lib/inspiration/handlers.ts` (the `/api/inspiration` handler). Sentry coverage now ~63/64 non-archive routes (only the NextAuth catch-all re-export lacks it — not meaningful). No route status changes; 61 live routes unchanged, 91 test files, 1814 tests. Dead code removed this build: `src/components/feed/rich-item/` directory + `src/components/ui/ImagePicker.tsx`.)
>
> **Previous (2026-06-07, nightly/2026-06-08):** no route status changes. Added `src/__tests__/api/topics-ratelimit.test.ts` — 9 tests covering the per-user rate-limit on `GET /api/topics` (429 on quota exceed). Built on the 2026-06-07 backlog consolidation: #110 + June chain #115–#120 + #112 topics rate-limit landed on main; `GET /api/topics` is rate-limited per user → 429.
>
> **V1 Routes (see V1_API_ROUTES.md):** The V1 pivot added 14 new routes covering intent-to-group, sub-crew formation, topics, recommendations, heatmap, and cron-expiry. Full route reference in `docs/V1_API_ROUTES.md`. Summary:
>
> - `/api/intents` — `POST`, `GET`
> - `/api/intents/[id]` — `PATCH`, `DELETE`
> - `/api/intents/crew` — `GET`
> - `/api/intents/mine` — `GET`
> - `/api/subcrews/emerging` — `GET`
> - `/api/subcrews/mine` — `GET`
> - `/api/subcrews/[id]` — `GET`, `PATCH`
> - `/api/subcrews/[id]/commit` — `POST`
> - `/api/subcrews/[id]/join` — `POST`
> - `/api/subcrews/[id]/members/me` — `PATCH`
> - `/api/topics` — `GET`
> - `/api/recommendations` — `GET`
> - `/api/heatmap` — `GET`
> - `/api/cron/expire-intents` — `GET`
>
> **Live API routes (post-V1):** 59 at the time of the V1 pivot — **now 68 (excluding `_archive`; 81 raw route.ts) as of 2026-07-21**
>
> **Archival:** trip/activity routes moved to `src/app/api/_archive/` as of 2026-04-16 Phase 1. See REFACTOR_PLAN.md. Sections below that reference `/api/trips/*` and `/api/activities/*` reflect the pre-archive state for historical context; authoritative status for these routes is the "📦 Archived Routes" section near the bottom of this file.
>
> **Phase 5 COMPLETE (2026-04-20, nightly/2026-04-20 PR #53):** Privacy settings page, Pusher broadcast wiring, "Join me" CTA, duration picker, checkin detail route — all Phase 5 exit criteria met.
>
> **Phase 6 COMPLETE (2026-04-22, nightly/2026-04-22 PR #55):** Feed rescoped (meetup/checkin types, POST→410), search people-first (users→meetups→venues), notification type migration (9 old trip types removed from schema), AI routes (suggest-meetups + icebreakers). All 4 Phase 6 actions complete.
>
> **V1 Surface Sentry Expansion (2026-05-12, nightly/2026-05-13):** Sentry `captureException` added to /api/intents/* (4 files / 5 catch blocks), /api/subcrews/* (6 files / 7 catch blocks). /api/topics, /api/heatmap, /api/recommendations, /api/venues/search confirmed already instrumented. ~10 V1 routes newly instrumented.
>
> **Last Audit:** 2026-07-21
> **Live API routes (current):** **68 live** (excluding `_archive`; 81 raw route.ts) + 13 archived. Active surface: 35 base routes + 6 Crew + 9 Phase 4 meetup/venue/cron + 3 Phase 5 check-in + privacy + 14 V1 routes (intents/subcrews/topics/heatmap/recommendations/cron-expire-intents) + `users/relationship-settings` (Day 4) + `users/[userId]/block` (Day 5) + `reports` (Day 6) + `users/onboarding` (Day 7) + `heatmap/contributor-count` (Day 8) + `crew/suggestions` + `checkins/ping` (Day 10). Feed POST now returns 410. (Historical: 72 total / 59 active at the Phase 1 archive baseline.)
> **Archived API routes (Phase 1):** 13
> **Target:** 100% for Beta Launch (re-baselined in Phase 8)
> **Sentry Coverage:** ~63/64 non-archive routes instrumented with `captureException` as of 2026-06-08 (only the NextAuth catch-all re-export uncovered — not meaningful). V1 surface fully instrumented 2026-05-12; discover/*, images/search, invitations, newsletter/subscribe, and the inspiration handler added 2026-06-08. Pre-archive trip-era coverage: 19/48 routes (historical, on pre-archive branch).

---

## 📊 Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Working - Production Ready |
| 🔶 | Partial - Needs Fixes |
| ⚠️ | Broken - Critical Issues |
| ⏳ | Not Started |
| 🔒 | Blocked - Waiting on Dependencies |

---

## 🔐 Authentication APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/auth/[...nextauth]` | ALL | ✅ | ✅ | NextAuth handler |
| `/api/auth/signup` | POST | ✅ | ✅ | Zod validation added 2026-03-18; email verification sending added 2026-03-21; rate limiting now first operation 2026-03-26; **Sentry captureException added 2026-04-16** |
| `/api/auth/demo` | POST | ✅ | ✅ | Demo credentials in env vars ✅ 2026-03-10; DEMO_MODE env guard added 2026-03-22; Zod input validation added 2026-03-24; z.object({}).strict() replacing passthrough 2026-03-25; **Sentry added 2026-04-16** |
| `/api/auth/demo` | GET | ✅ | ✅ | Returns demo account info (hides password in prod); requires DEMO_MODE=true env var ✅ 2026-03-22 |
| `/api/auth/reset-password` | POST | ✅ | ✅ | Request reset token; email-safe 200 response ✅ 2026-03-12; UI page added 2026-03-14; rate limiting now first operation 2026-03-26; **Sentry added 2026-04-16** |
| `/api/auth/reset-password` | PATCH | ✅ | ✅ | Confirm reset with token + new password ✅ 2026-03-12; UI confirm page added 2026-03-14 |
| `/api/auth/verify-email` | GET | ✅ | ✅ | Email token verification ✅ 2026-03-19; signup now sends verification email ✅ 2026-03-21; rate limiting now first operation 2026-03-26; **Sentry added 2026-04-16** |

### Auth Issues to Fix
- [x] Add password reset endpoint ✅ 2026-03-12
- [x] Add email verification endpoint ✅ 2026-03-19 (GET /api/auth/verify-email)
- [x] Wire email verification sending on signup ✅ 2026-03-21

---

## 📋 Trip APIs — 📦 ARCHIVED 2026-04-16

> All trip and trip-child routes (`/api/trips/*` — 13 routes incl. members, activities, itinerary, survey, voting, recommendations, flights, suggestions, invitations) have been moved to `src/app/api/_archive/trips/`. See [📦 Archived Routes](#-archived-routes-phase-1) section below for the full list retained for historical reference.

### Invitation Management APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/invitations` | GET | ✅ | ⏳ | List all invitations for current user; auto-marks expired PENDING invitations (will be retargeted to Crew invites in Phase 3); **Sentry captureException added 2026-06-08** |
| `/api/invitations/[invitationId]` | GET | ✅ | ⏳ | Get invitation details; retained — Phase 3 will rescope for Crew requests; **Sentry captureException added 2026-06-08** |
| `/api/invitations/[invitationId]` | POST | ✅ | ⏳ | Accept/decline invitation; retained — Phase 3 will rescope; **Sentry captureException added 2026-06-08** |

---

## 📰 Feed APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/feed` | GET | ✅ | ✅ | Main feed; **rescoped 2026-04-21 (nightly/2026-04-21) — Phase 6 complete** — item types now: `meetup_created`, `check_in_posted`, `crew_formed`, `meetup_attended`, `post_created`. Trip/activity queries removed. Zod validation added 2026-03-21; **Sentry added 2026-04-16** |
| `/api/feed` | POST | ⛔ | — | Returns **410 Gone** as of 2026-04-21 — feed items are now generated from meetup/checkin events, not direct POST |
| `/api/feed/comments` | GET | ✅ | ✅ | **Sentry added 2026-04-16**; **auth-guarded 2026-07-21 (BUILD_PLAN Day 10, PR #150)** — added a `getServerSession()` 401 guard (GET was previously unauthenticated, allowing comment enumeration) |
| `/api/feed/comments` | POST | ✅ | ✅ | **Sentry added 2026-04-16** |
| `/api/feed/engagement` | POST | ✅ | ✅ | **Sentry added 2026-04-16** |
| `/api/feed/share` | POST | ✅ | ⏳ | Implemented with Zod validation + notification ✅ 2026-03-16; **Sentry added 2026-04-16** |

### Feed Issues to Fix
```
COMPLETED ✅ Dec 17:
1. [x] Add TripComment model to schema
2. [x] Update comments API for itemType: 'trip'
3. [x] Add TripLike model to schema
4. [x] Update engagement API for trip items
5. [x] Implement share/repost API ✅ 2026-03-16
```

---

## 🔔 Notification APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/notifications` | GET | ✅ | ✅ | **Data structure verified** ✅ Dec 17; Zod pagination params improved 2026-03-22; **Sentry added 2026-04-16** |
| `/api/notifications` | PATCH | ✅ | ✅ | Mark as read; **Sentry added 2026-04-16** |
| `/api/notifications/[id]` | PATCH | ✅ | ✅ | Mark individual notification read; Zod validation added 2026-03-13; Zod params (cuid), JSON.parse safety, bugfix (read field was hardcoded true) 2026-03-29; **Sentry added 2026-04-16** |
| `/api/users/notification-preferences` | GET | ✅ | ✅ | Get current user's NotificationPreference rows; **Implemented 2026-04-29 (V1 Phase 5 partial)** |
| `/api/users/notification-preferences` | PATCH | ✅ | ✅ | Upsert NotificationPreference rows for the current user; **Implemented 2026-04-29 (V1 Phase 5 partial)** |

### Notification Issues to Fix
```
VERIFIED ✅ Dec 17:
Frontend correctly accesses: data?.data?.notifications
No fix needed - code was already correct

COMPLETED ✅ 2026-04-22 (Phase 6 — nightly/2026-04-22):
9 old trip NotificationTypes removed from schema.prisma:
  TRIP_INVITATION, TRIP_UPDATE, TRIP_COMMENT, TRIP_LIKE,
  ACTIVITY_COMMENT, ACTIVITY_RATING, SURVEY_REMINDER, VOTE_REMINDER, FOLLOW
Remaining active types: SYSTEM, CREW_REQUEST, CREW_ACCEPTED, MEETUP_INVITED,
  MEETUP_RSVP, MEETUP_STARTING_SOON, CREW_CHECKED_IN_NEARBY
Follow model marked @deprecated (retirement deferred to Phase 7)
```

---

## 🔍 Discovery & Search APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| 📦 `/api/discover` | GET | 📦 | — | **ARCHIVED** — the only file is `src/app/api/_archive/discover/route.ts`; this base route does not resolve at runtime. (Searched events/places/restaurants/attractions/nightlife by city + date range.) The live sub-routes below are unaffected. |
| 📦 `/api/discover` | POST | 📦 | — | **ARCHIVED** — base route lives in `_archive` (flight search via EventsService). Not routed at runtime. |
| `/api/discover/search` | GET | ✅ | 🔶 | Auth guard added 2026-03-24 (was unauthenticated — security improvement); rate limiting, Zod validation ✅; **Sentry captureException added 2026-06-08** |
| `/api/discover/recommendations` | GET | ✅ | 🔶 | Auth guard added 2026-03-24; category filter, rate limiting, pino logging ✅; **Sentry captureException added 2026-06-08** |
| `/api/discover/import` | POST | ✅ | ⏳ | Rate limiting + auth guard ✅ 2026-03-24; pino logging, typed helpers, fixed empty catch blocks; **Sentry captureException added 2026-06-08** |
| `/api/search` | GET | ✅ | 🔶 | Email removed from select projection (privacy fix) ✅ 2026-03-20; **rescoped 2026-04-22 (Phase 6)** — people-first ordering (users→meetups→venues), Zod enum updated to `['all','people','meetups','venues']`, trip/activity search paths removed; **Zod enum re-tightened 2026-05-11** (M3 nightly/2026-05-12) — confirmed only the 4 canonical values, no legacy fallbacks; **UI MOUNTED 2026-07-20 (BUILD_PLAN Day 9, PR #149)** — route is unchanged but is now consumed by a real `/search` page (`src/app/search/page.tsx`); `SearchResults` rewritten for the `user|meetup|venue` union and `SearchFilters` reduced to a result-type selector over the real API enum; venue results render non-navigable (no venue route exists) |
| `/api/geocoding` | GET | ✅ | 🔶 | Geocoding for destination search via Nominatim; Zod validation added 2026-03-21 |
| `/api/inspiration` | GET | ✅ | 🔶 | Auth guard added 2026-03-08; Zod coerce.number on query params + POST body schema added 2026-03-22; handler extracted to `src/lib/inspiration/handlers.ts` (2026-05-16); **Sentry captureException added to handler 2026-06-08** |
| `/api/images/search` | GET | ✅ | 🔶 | Image search via Unsplash API; requires UNSPLASH_ACCESS_KEY; **Sentry captureException added 2026-06-08** |

### Search Issues to Fix
```
COMPLETED ✅ 2026-03-20:
Email removed from select projection in /api/search/route.ts
```

---

## 🤖 AI APIs

**All AI endpoints removed 2026-04-23** (`ops/kill-all-ai-2026-04-23`). Legacy trip-era routes (`/api/ai/chat`, `recommend`, `search`, `generate-itinerary`, `suggest-activities`) deleted; Phase 6 meetup routes (`/api/ai/suggest-meetups`, `/api/ai/icebreakers`) deleted before wiring to UI. `@ai-sdk/openai`, `@ai-sdk/anthropic`, and `ai` (Vercel AI SDK) removed from dependencies. `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` no longer consumed.

---

## 👤 User/Profile APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/profile` | GET | ✅ | 🔶 | Get current user |
| `/api/profile` | PUT | ✅ | 🔶 | Update profile; Zod validation added 2026-03-13 |
| `/api/users/[userId]` | GET | ✅ | ✅ | Public user profile — returns `crewCount`, `crewLabel`; `isFollowing` and `publicTrips` removed in Phase 3 Part B; wired to `/profile/[userId]` page |
| `/api/users/[userId]` | PATCH | ✅ | ✅ | Update own profile — Phase 3 Part B added `crewLabel` field (1–20 chars, alphanumeric + spaces) |
| ~~`/api/users/[userId]/follow`~~ | ~~POST~~ | 🗑️ | — | **Removed Phase 3 Part B (2026-04-18).** Follow/unfollow replaced by Crew request flow (`POST /api/crew/request`) |
| `/api/users/relationship-settings` | GET | ✅ | ✅ | **Implemented 2026-07-13 (BUILD_PLAN Day 4, PR #144).** Lists viewer's per-Crew-member privacy settings; each Crew member defaults to BLOCK granularity / KNOWN identity when no `CrewRelationshipSetting` row exists. Zod + `getServerSession()` + Sentry. UI: `RelationshipSettingsList.tsx` at `/settings/privacy/relationships` |
| `/api/users/relationship-settings` | PATCH | ✅ | ✅ | **Implemented 2026-07-13 (BUILD_PLAN Day 4, PR #144).** Upserts `granularity` + `identityMode` for a `targetId` (Zod enum-validated); **403 for a non-Crew `targetId`**. Makes R4/R20 reachable — `lib/heatmap/aggregate.ts` reads these rows |
| `/api/users/[userId]/block` | POST | ✅ | ✅ | **Implemented 2026-07-16 (BUILD_PLAN Day 5, Trust & Safety I).** Blocks a user; idempotent; **auto-severs any existing Crew edge** on block. Writes `prisma.UserBlock` (`blockerId`/`blockedId`, unique pair). 401/400/404/429 guards, Zod + `getServerSession()` + Sentry. Mutual enforcement hides a blocked pair on crew/feed/heatmap/check-in-feed. UI: `src/components/safety/BlockButton.tsx` on `/profile/[userId]` + `/crew` |
| `/api/users/[userId]/block` | DELETE | ✅ | ✅ | **Implemented 2026-07-16 (BUILD_PLAN Day 5, Trust & Safety I).** Unblocks a user; idempotent (no-op if not blocked). Removes the `UserBlock` row |
| `/api/users/onboarding` | GET | ✅ | ✅ | **Implemented 2026-07-19 (BUILD_PLAN Day 7, PR #147).** Returns `{onboarded, onboardedAt}` for the current user; the `/onboarding` flow self-skips when already onboarded. Guard chain auth → rate-limit → Zod → Sentry + pino. Backed by additive `User.onboardedAt DateTime?` |
| `/api/users/onboarding` | POST | ✅ | ✅ | **Implemented 2026-07-19 (BUILD_PLAN Day 7, PR #147).** Stamps `User.onboardedAt = now` (idempotent). Called at the end of the 3-step `/onboarding` flow (Topics → Crew → first Intent) before landing on `/intents` |

---

## 🛡️ Trust & Safety APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/reports` | POST | ✅ | ✅ | **Implemented 2026-07-17 (BUILD_PLAN Day 6, Trust & Safety II).** Files a report against a user or meetup with a `ReportReason` enum. Self-report guard (400), target-exists check (404), duplicate report idempotent (200), otherwise create (201). Writes the new `Report` model (`ReportReason`/`ReportStatus`/`ReportTargetType` enums). Zod + `getServerSession()` + Sentry + pino. UI: `src/components/safety/ReportButton.tsx` on `/profile/[userId]` + meetup detail (non-host) |
| `/api/reports` | GET | ✅ | — | **Implemented 2026-07-17 (BUILD_PLAN Day 6, Trust & Safety II).** Admin-only list of reports — allowlist via `ADMIN_USER_IDS` env (403 otherwise); optional `?status` filter (`ReportStatus`) |

> **Anti-spam (Day 6):** new `creationQuotaLimiter` (10/user/24h, prefix `ratelimit:creation`) in `src/lib/rate-limit.ts`. A stricter creation-specific daily quota (429 over-quota) + high-frequency-creator warn was layered onto the existing per-minute limiter on `POST /api/meetups` (`meetup-create-daily` key) and `POST /api/crew/request` (`crew-request-daily` key) — no duplicate limiter on the same key; under-quota requests unaffected.

---

## 🔌 Real-Time APIs (Pusher)

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/pusher/auth` | POST | 🔒 | 🔒 | **Needs env vars** |

### Pusher Issues to Fix
```
BLOCKED - Need Environment Variables:
- PUSHER_APP_ID
- PUSHER_KEY
- PUSHER_SECRET
- PUSHER_CLUSTER
- NEXT_PUBLIC_PUSHER_KEY
- NEXT_PUBLIC_PUSHER_CLUSTER
```

---

## ⚙️ System APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/cron` | GET | ✅ | N/A | Background jobs; CRON_SECRET validation hardened 2026-03-22; **Sentry captureException added 2026-05-11** |
| Sentry lib | N/A | ✅ | N/A | `src/lib/sentry.ts` created 2026-03-25 — centralized Sentry helpers (captureException, addBreadcrumb, setUser); **23+ routes instrumented as of 2026-05-11** (cron + beta/signup + beta/initialize-password + beta/status added on nightly/2026-05-12) |
| `/api/health` | GET | ✅ | N/A | DB connectivity check, 503 on degraded ✅ 2026-03-10; response hardened 2026-03-25 (NODE_ENV + version removed for data minimization — returns {status, timestamp, database}) |
| `/api/users/me` | GET | ✅ | 🔶 | Get current authenticated user |
| `/api/users/me` | PATCH | ✅ | 🔶 | Update current user profile + preferences |

---

## 🆕 V1 APIs (Intent → SubCrew Loop)

> Routes powering the V1 product vision: intent signaling → auto-grouping ≥2 Crew on same Topic → coordinate + venue recs → opt-in location visibility. See `docs/PRODUCT_VISION.md`.
>
> **Sentry instrumentation status (2026-05-12):** All routes below have `Sentry.captureException` on error paths ✅.

### Intent APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/intents` | GET | ✅ | 🔶 | List intents (filtered by topic/window); **Sentry added 2026-05-12** |
| `/api/intents` | POST | ✅ | 🔶 | Create an intent (topic + activeUntil); **Sentry added 2026-05-12** |
| `/api/intents/[id]` | PATCH | ✅ | 🔶 | Update own intent; **Sentry added 2026-05-12** |
| `/api/intents/[id]` | DELETE | ✅ | 🔶 | Cancel own intent; **Sentry added 2026-05-12** |
| `/api/intents/mine` | GET | ✅ | 🔶 | Current user's active intents; **Sentry added 2026-05-12** |
| `/api/intents/crew` | GET | ✅ | 🔶 | Active intents from caller's Crew; **+20 tests 2026-05-12 (intents-crew-extended.test.ts)** |

### SubCrew APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/subcrews/mine` | GET | ✅ | 🔶 | Current user's SubCrew memberships; **Sentry added 2026-05-12** |
| `/api/subcrews/emerging` | GET | ✅ | 🔶 | SubCrews forming around shared intents; **+21 tests 2026-05-12 (subcrews-emerging-extended.test.ts); Sentry added 2026-05-12** |
| `/api/subcrews/[id]` | GET | ✅ | 🔶 | SubCrew detail; **Sentry added 2026-05-12** |
| `/api/subcrews/[id]` | PATCH | ✅ | 🔶 | Update SubCrew (owner/member edits); **Sentry added 2026-05-12**; **graduates a frozen SubCrew into a Meetup when `startAt`+`venueId` are set (2026-07-11, BUILD_PLAN Day 3) — creates a CREW Meetup, links all members as attendees, sets `SubCrew.meetupId`; idempotent; response gains `meetup`+`graduated`** |
| `/api/subcrews/[id]/join` | POST | ✅ | 🔶 | Join an emerging SubCrew; **Sentry added 2026-05-12** |
| `/api/subcrews/[id]/commit` | POST | ✅ | 🔶 | Commit to attend (locks heatmap contribution); **Sentry added 2026-05-12** |
| `/api/subcrews/[id]/members/me` | PATCH | ✅ | 🔶 | Update own membership status (leave/RSVP toggle); **Sentry added 2026-05-12** |

### V1 Misc APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/topics` | GET | ✅ | ✅ | Topic taxonomy for intent creation; Sentry ✅; rate-limited per user (429). **2026-07-20 (BUILD_PLAN Day 9, PR #149):** handler signature is now `GET(req?: Request)` (a bare `GET()` still works) and accepts an **opt-in, Zod-validated `?withCounts=true`**, which adds an additive `count` per Topic = live Intents on that Topic (`expiresAt > now`) from one `prisma.intent.groupBy({by:['topicId'], where:{expiresAt:{gt:now}}, _count:{_all:true}})`. Counts are **fail-soft** — a groupBy failure logs and yields `count: 0` instead of a 500, because this endpoint gates signup/onboarding. Default envelope `{success, data:{topics:[{id,slug,displayName}]}}` unchanged for the 3 existing consumers. Now consumed by the `/topics` browse page |
| `/api/heatmap` | GET | ✅ | 🔶 | Heatmap data (Crew/FoF tiers); Sentry ✅ — see PRs #86, #87 |
| `/api/heatmap/contributor-count` | GET | ✅ | ✅ | **Implemented 2026-07-20 (BUILD_PLAN Day 8, PR #148).** Lightweight contributor count for a venue/cell so the privacy picker can enforce the R14 anonymous floor live. Guard chain auth → rate-limit → Zod; returns only `{count, floor, meetsFloor, cellResolved}` (no identities, no rows). Backed by `src/lib/heatmap/contributor-count.ts` + shared `src/lib/heatmap/anonymous-floor.ts` (`ANONYMOUS_FLOOR`, also now imported by `lib/heatmap/aggregate.ts`). Frontend: `src/components/privacy/PrivacyPickerModal.tsx` disables Anonymous with an explanation below N≥3 and fails safe while loading/erroring; `SubCrewCoordinationPanel.tsx` supplies `venueId`/`cityArea`/`contributionType` |
| `/api/recommendations` | GET | ✅ | 🔶 | Venue + meetup recommendations; Sentry ✅; **applies a real density-derived hotness boost (`computeHotnessBoost`) — `weightByCrew` active, 5-min cache by `(topicId, cityArea)` (2026-06-29, BUILD_PLAN Day 1)** |
| `/api/venues/search` | GET | ✅ | ✅ | Places API venue search; Sentry ✅ |
| `/api/cron/expire-intents` | GET | ✅ | N/A | Cron — expires intents past `activeUntil`; Sentry ✅ |

---

## 🎯 Invitation APIs (activities archived 2026-04-16)

> `/api/activities/[activityId]` (GET/POST/PUT) archived — see [📦 Archived Routes](#-archived-routes-phase-1).

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/invitations` | GET | ✅ | 🔶 | List user's pending invitations; Phase 3 will retarget for Crew requests; **Sentry captureException added 2026-06-08** |
| `/api/invitations/[invitationId]` | GET | ✅ | 🔶 | Get invitation detail; **Sentry captureException added 2026-06-08** |
| `/api/invitations/[invitationId]` | POST | ✅ | 🔶 | Respond to invitation (accept/decline); **Sentry captureException added 2026-06-08** |

---

## 🚀 Beta & Newsletter APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/beta/signup` | POST | ✅ | ✅ | Beta waitlist signup; **Sentry captureException added 2026-05-11** |
| `/api/beta/status` | GET | ✅ | ✅ | Check beta access status; IP rate limiting added 2026-03-21; response narrowed to {exists, passwordInitialized} only (data minimization) ✅ 2026-03-22; **Sentry captureException added 2026-05-11** |
| `/api/beta/initialize-password` | POST | ✅ | ✅ | Beta user password init — now protected with N8N_API_KEY auth ✅ 2026-03-19 (was unauthenticated — account takeover vulnerability fixed); **Sentry captureException added 2026-05-11** |
| `/api/newsletter/subscribe` | POST | ✅ | ✅ | Newsletter subscription; auth now required 2026-03-26; **Sentry captureException added 2026-06-08** |

---

## 📊 API Completion Summary (pre-archive reference — to be rebaselined in Phase 2)

> The counts below reflect the pre-archive 48-route surface and are retained for historical reference. Live route count is ~35 (see top of file); a fresh summary will be produced after Phase 2.


| Category | Total | Working | Partial | Broken | Not Started |
|----------|-------|---------|---------|--------|-------------|
| Auth | 6 | 6 | 0 | 0 | 0 |
| Trips | 21 | 21 | 0 | 0 | 0 |
| Invitations | 3 | 3 | 0 | 0 | 0 |
| Feed | 5 | 4 | 0 | 0 | 1 |
| Notifications | 3 | 3 | 0 | 0 | 0 |
| Discovery | 6 | 6 | 0 | 0 | 0 |
| AI | 6 | 5 | 1 | 0 | 0 |
| User | 4 | 2 | 0 | 0 | 2 |
| Real-time | 1 | 0 | 0 | 0 | 1 |
| System | 3 | 2 | 0 | 0 | 1 |
| **TOTAL** | **58** | **51** | **2** | **0** | **4** |

**API Completion Rate: 88% fully working** ✅ (updated 2026-03-23: itinerary POST added, itinerary/ai/discover routes completed)
| Trips | 17 | 13 | 2 | 1 | 1 |
| Feed | 5 | 5 | 0 | 0 | 0 |
| Notifications | 3 | 3 | 0 | 0 | 0 |
| Discovery | 4 | 2 | 2 | 0 | 0 |
| AI | 4 | 0 | 4 | 0 | 0 |
| User | 5 | 3 | 0 | 0 | 2 |
| Real-time | 1 | 0 | 0 | 0 | 1 |
| System | 3 | 2 | 0 | 0 | 1 |
| **TOTAL** | **47** | **33** | **8** | **0** | **4** |

**API Completion Rate: 70% fully working** (search email fix: ⚠️ → ✅; members POST handler implemented 2026-03-20)

---

## 🔧 Priority Fix Order

### Critical (Block Launch)
1. **Feed Comments** - ✅ COMPLETE Dec 17
2. **Feed Engagement** - ✅ COMPLETE Dec 17
3. **Notifications** - ✅ VERIFIED Dec 17
4. **Invitations** - ✅ COMPLETE Dec 17

### High (Should Fix)
5. **Search** - ✅ Email removed from select projection 2026-03-20
6. **AI Chat** - ✅ COMPLETE Dec 17
7. **Pusher Auth** - Add env vars

### Medium (Nice to Have)
8. **Health Check** - ✅ COMPLETE 2026-03-10
9. **Follow System** - Implement
10. **Share/Repost** - Implement

---

## 📝 Database Migrations Needed

```prisma
// Add to prisma/schema.prisma

model TripComment {
  id        String   @id @default(cuid())
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  text      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tripId])
  @@index([userId])
}

model TripLike {
  id        String   @id @default(cuid())
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([userId, tripId])
  @@index([tripId])
}

model Follow {
  id          String   @id @default(cuid())
  followerId  String
  follower    User     @relation("Followers", fields: [followerId], references: [id], onDelete: Cascade)
  followingId String
  following   User     @relation("Following", fields: [followingId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())

  @@unique([followerId, followingId])
  @@index([followerId])
  @@index([followingId])
}
```

---

## 🔗 Environment Variables Required

```env
# Already Set (Verify)
DATABASE_URL=
DIRECT_URL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Need to Add
PUSHER_APP_ID=          # Real-time
PUSHER_KEY=             # Real-time
PUSHER_SECRET=          # Real-time
PUSHER_CLUSTER=         # Real-time
NEXT_PUBLIC_PUSHER_KEY= # Real-time (client)
NEXT_PUBLIC_PUSHER_CLUSTER= # Real-time (client)

# Already Set ✅ Dec 17
RESEND_API_KEY=         # Email service ✅
EMAIL_FROM=             # Email sender (onboarding@resend.dev) ✅
```

---

## 🚧 Social Domain Routes (Phase 3–5)

> Phase 2 merged 2026-04-17. Phase 3 (Crew) landing on `refactor/phase-3-crew-api` — all Crew routes implemented, Zod-validated, rate-limited, Sentry-instrumented, and covered by 32 unit tests. Phase 4 (Meetups) and Phase 5 (Check-ins) still planned. Default `Meetup.visibility=CREW` (Q3). Check-ins use `activeUntil` for feed filtering (Q4).

### Phase 3 — Crew (✅ implemented)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/crew/request` | POST | ✅ | Send Crew request; sorts `(userAId, userBId)` before insert, fires `CREW_REQUEST` notification + email; reopens `DECLINED` rows |
| `/api/crew/[id]` | PATCH | ✅ | `action: accept \| decline \| block`; accept emits `CREW_ACCEPTED` notification + email; requester cannot accept own request |
| `/api/crew/[id]` | DELETE | ✅ | Remove Crew row (cancel/remove/unblock) — either participant may delete |
| `/api/crew` | GET | ✅ | List accepted Crew members (paginated); returns userA/userB/requestedBy previews incl. `crewLabel` |
| `/api/crew/requests` | GET | ✅ | Pending requests split into `incoming` + `sent` based on `requestedById` |
| `/api/crew/status/[userId]` | GET | ✅ | Lookup helper for `<CrewButton>` (returns `SELF / NOT_IN_CREW / PENDING / ACCEPTED / DECLINED / BLOCKED` + `iAmRequester`) |
| `/api/crew/suggestions` | GET | ✅ | **Implemented 2026-07-21 (BUILD_PLAN Day 10, PR #150).** "People you may know" from the FoF graph (`src/lib/heatmap/fof-graph.ts`), ranked by mutual count, excluding existing/PENDING Crew and blocked users (block filter degrades gracefully if `UserBlock` absent). auth → rate-limit → Zod → Sentry. UI: suggestions block on `/crew` via `src/components/crew/SuggestionCard.tsx`, inline Add via POST `/api/crew/request` |

### Phase 4 — Meetups (🟢 All 3 sessions complete, 2026-04-18 — core API + detail + Pusher + email + cron + Places)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/meetups` | POST | ✅ | Create meetup (default visibility=`CREW`); Implemented Phase 4, 2026-04-18 |
| `/api/meetups` | GET | ✅ | List meetups (city, visibility-scoped to caller's Crew); Implemented Phase 4, 2026-04-18 |
| `/api/meetups/[id]` | GET | ✅ | Meetup detail; Implemented Phase 4, 2026-04-18 |
| `/api/meetups/[id]` | PATCH | ✅ | Edit meetup (host only); broadcasts `meetup:updated` on Pusher `meetup-{id}` channel (Session 2, 2026-04-18) |
| `/api/meetups/[id]` | DELETE | ✅ | Cancel meetup; broadcasts `meetup:cancelled` (Session 2, 2026-04-18) |
| `/api/meetups/[id]/rsvp` | POST | ✅ | GOING / MAYBE / DECLINED; broadcasts `attendee:joined`/`attendee:left` + host notification; sends RSVP confirmation email on GOING. Response shape: `{success, data, message}` (Session 2, 2026-04-18) |
| `/api/meetups/[id]/invite` | POST | ✅ | Invite Crew members; dispatches invite emails + broadcasts `meetup:updated` + per-user notification (Session 2, 2026-04-18) |
| `/api/venues/search` | GET | ✅ | Venue search — DB-first with Google Places API fallback + auto-caching when `GOOGLE_PLACES_API_KEY` set; Session 3, 2026-04-18 |
| `/api/cron/meetup-starting-soon` | GET | ✅ | Cron — `MEETUP_STARTING_SOON` reminder dispatch (email + notification + Pusher) for GOING attendees within T-55–65min; idempotent; Session 3, 2026-04-18 |
| `/api/cron/send-daily-prompts` | GET | ✅ | Cron — daily prompt dispatch (13:00 UTC) using `Notification.type='SYSTEM'` with `data.source='DAILY_PROMPT'` discriminator; vercel.json schedule + maxDuration set; **Implemented 2026-04-29 (V1 Phase 5 partial)** |

### Phase 4 — Pusher Channels & Events (Live 2026-04-18)

| Channel | Event | Payload | Triggered By |
|---------|-------|---------|--------------|
| `meetup-{id}` | `attendee:joined` | `{ userId, status, user }` | POST rsvp (status=GOING) |
| `meetup-{id}` | `attendee:left` | `{ userId }` | POST rsvp (status=DECLINED) |
| `meetup-{id}` | `meetup:updated` | updated meetup | PATCH [id], POST invite |
| `meetup-{id}` | `meetup:cancelled` | `{ meetupId }` | DELETE [id] |
| `user-{id}` | `notification` | `{ type: 'MEETUP_RSVP'/'MEETUP_INVITED', ... }` | rsvp (host), invite (invitee) |

### Phase 4 — All sessions complete (2026-04-18)

Phase 4 closed with Session 3. Next: Phase 5 (Check-ins & live presence).

### Phase 5 — Check-ins (COMPLETE 2026-04-20)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/checkins` | POST | ✅ | Create check-in (`activeUntilMinutes` override 30–720; default 360=6h); `CREW_CHECKED_IN_NEARBY` notification dispatched; Pusher city-channel broadcast |
| `/api/checkins` | GET | ✅ | Get own check-ins |
| `/api/checkins/feed` | GET | ✅ | Crew's recent check-ins (`WHERE activeUntil > now()`), visibility-scoped; **integration tests added 2026-05-10 (14 tests)**. Note: returns a bare array; `NearbyCrewList` reads it defensively (server-side `{items}` normalization is a tracked follow-up, 2026-07-21) |
| `/api/checkins/ping` | POST | ✅ | **Implemented 2026-07-21 (BUILD_PLAN Day 10, PR #150).** Pings active accepted-Crew check-ins near the caller, firing `CREW_CHECKED_IN_NEARBY` notifications; rate-limited via `checkRateLimit`. UI: Ping buttons on `src/components/checkins/NearbyCrewList.tsx` |
| `/api/checkins/[id]` | GET | ✅ | Check-in detail with visibility gate; Phase 5 Session 2, 2026-04-20 |
| `/api/checkins/[id]` | DELETE | ✅ | Cancel own check-in (soft: sets `activeUntil = now()`) |
| `/api/users/privacy` | GET | ✅ | Get check-in privacy settings; Phase 5 Session 2, 2026-04-20 |
| `/api/users/privacy` | PATCH | ✅ | Update check-in visibility (PUBLIC/CREW/PRIVATE); Phase 5 Session 2, 2026-04-20 |

---

## 🎯 V1 Intent / Crew-Grouping Routes

| Endpoint | Method | Status | Tests | Notes |
|----------|--------|--------|-------|-------|
| `/api/intents` | POST, GET | ✅ | yes | Create / list intents; topic+window+optional cityArea |
| `/api/intents/[id]` | PATCH | ✅ | **yes — 11 tests (2026-05-10)** | Edit own intent (state/window/cityArea); Zod-validated; rate-limited; Sentry on 500 |
| `/api/intents/[id]` | DELETE | ✅ | **yes — 8 tests (2026-05-10)** | Soft-cancel own intent; 401/403/404 paths |
| `/api/intents/mine` | GET | ✅ | **yes — 9 tests (2026-05-10)** | Caller's intents; filter by state/topicId/limit/includeExpired |
| `/api/intents/crew` | GET | ✅ | **yes — 9 tests (2026-05-10)** | Cross-Crew intents for caller; short-circuits if no Crew |
| `/api/subcrews/mine` | GET | ✅ | **yes — 2026-05-10** | Caller's subcrews |
| `/api/subcrews/emerging` | GET | ✅ | **yes — 2026-05-10** | Auto-formed ≥2-Crew subcrews on a topic |
| `/api/subcrews/[id]` | GET | ✅ | **yes — 2026-05-10** | Subcrew detail |
| `/api/subcrews/[id]` | PATCH | ✅ | **yes — +13 (2026-07-11)** | Update own subcrew; **graduates a frozen SubCrew (`startAt`+`venueId`) into a CREW Meetup with linked attendees — idempotent; `src/lib/subcrews/graduate-to-meetup.ts` (BUILD_PLAN Day 3)** |
| `/api/subcrews/[id]/join` | POST | ✅ | **yes — 2026-05-10** | Opt-in join |
| `/api/subcrews/[id]/commit` | POST | ✅ | **yes — 2026-05-10** | Commit attendance (writes heatmap contribution) |
| `/api/subcrews/[id]/members/me` | PATCH | ✅ | **yes — 2026-05-10** | Update own membership state |
| `/api/topics` | GET | ✅ | **yes — 2026-07-20** | Discover topics; **Sentry captureException added 2026-05-10 (nightly)**; **opt-in `?withCounts=true` added 2026-07-20 (BUILD_PLAN Day 9, PR #149)** — additive fail-soft `count` of live Intents per Topic; drives the `/topics` browse page |
| `/api/recommendations` | GET | ✅ | — | Venue/topic recommendations; **Sentry captureException added 2026-05-10 (nightly)**; **real density-derived hotness boost wired in 2026-06-29 (`computeHotnessBoost`, `weightByCrew` active, 5-min cache by `(topicId, cityArea)`) — BUILD_PLAN Day 1** |
| `/api/heatmap` | GET | ✅ | yes | V1 Phase 4 — Crew + FoF tier contributions (PR #86/#87, 2026-05-09) |
| `/api/cron/expire-intents` | GET | ✅ | yes | Cron — expire intents past `endAt` |

---

## 📦 Archived Routes (Phase 1)

All routes below were moved to `src/app/api/_archive/` on **2026-04-16** as part of the social-meetup pivot. They are not bundled or routed at runtime. See `docs/REFACTOR_PLAN.md` and `src/_archive/README.md` for reactivation scheme.

### Trips (📦 13 routes)

| Endpoint | Method | Prior Status | Notes |
|----------|--------|--------------|-------|
| 📦 `/api/trips` | GET, POST | ✅ | List/create trips — moved to `_archive/trips/route.ts` |
| 📦 `/api/trips/[tripId]` | GET, PATCH, DELETE | ✅ | Trip detail/update/delete |
| 📦 `/api/trips/[tripId]/members` | GET, POST, PATCH, DELETE | ✅ | Member management |
| 📦 `/api/trips/[tripId]/invitations` | GET, POST | ✅ | Trip-scoped invitations |
| 📦 `/api/trips/[tripId]/activities` | GET, POST | ✅ | Trip activity list/create |
| 📦 `/api/trips/[tripId]/itinerary` | GET, POST, PUT | ✅ | Itinerary CRUD |
| 📦 `/api/trips/[tripId]/survey` | GET, POST, PUT | ✅ | Trip preference survey (may repurpose as Poll in Phase 2) |
| 📦 `/api/trips/[tripId]/voting` | GET, POST, PUT | ✅ | Voting session (may repurpose as Poll) |
| 📦 `/api/trips/[tripId]/recommendations` | GET, POST | ✅ | AI recommendations from survey data |
| 📦 `/api/trips/[tripId]/flights` | GET | 🔶 | Amadeus flight search |
| 📦 `/api/trips/[tripId]/suggestions` | GET | 🔶 | Ticketmaster + Places suggestions |

### Activities (📦 1 route)

| Endpoint | Method | Prior Status | Notes |
|----------|--------|--------------|-------|
| 📦 `/api/activities/[activityId]` | GET, POST, PUT | ✅ | Activity detail / save / comment / rate |

### AI (📦 2 trip-specific routes)

| Endpoint | Method | Prior Status | Notes |
|----------|--------|--------------|-------|
| 📦 `/api/ai/generate-itinerary` | POST | ✅ | Trip itinerary generation (no equivalent in new product) |
| 📦 `/api/ai/suggest-activities` | POST | ✅ | Trip activity suggestions (to be rewritten as `/api/ai/suggest-meetups` in Phase 6) |

**Archived route count: 14**

---

*Review and update after each API change.*

### Testing / QA

- **E2E authenticated flows (Phase 8 action #5):** `e2e/authenticated-flow.spec.ts` now **PASSES 16/16 in a real Chromium browser** (2026-06-11). Uses a signed NextAuth JWT cookie helper (`e2e/auth-helper.ts`) for authed-UI tests, and asserts the intentional middleware 307-redirects for gated API routes (`/api/meetups`, `/api/checkins/*`, `/api/notifications/*`). Production code unchanged — app behavior was already correct; spec assertions were corrected to match. `npm run test:e2e` to run. **Now wired into CI (2026-06-12):** `.github/workflows/ci.yml` runs `npm run build` before the Playwright step so the production `webServer` (`npm run start`) has a `.next` build to serve — the suite runs on every PR (closes prior rec #4).
- **Edge/security coverage (2026-06-11):** +49 tests — `src/__tests__/checkins-privacy-edge.test.ts` (22: `activeUntil` clamping, feed expiry gate, PUBLIC/CREW/PRIVATE visibility scoping, owner-only DELETE, 401s) and `src/__tests__/api/meetups-authz-edge.test.ts` (27: host-only PATCH/DELETE, RSVP capacity/duplicate, invite authz + fan-out cap, 401/400/403/404/409).

*Last Updated: 2026-07-21 (nightly/2026-07-22, BUILD_PLAN Day 10 "Growth: FoF Crew suggestions + ping nearby") — **+2 live routes → 68 live** (excl. `_archive`; 81 raw route.ts): `GET /api/crew/suggestions` (FoF "People you may know", block+PENDING-crew filtered; `src/components/crew/SuggestionCard.tsx` + suggestions block on `/crew`) and `POST /api/checkins/ping` (pings active accepted-Crew check-ins near the caller → `CREW_CHECKED_IN_NEARBY` notifications; rate-limited; Ping buttons on `NearbyCrewList`). **Security fix:** `GET /api/feed/comments` gained a `getServerSession()` 401 guard (was unauthenticated). No `schema.prisma`/`setup.ts` changes needed. Tests: 2173 / 110 files (+30: crew-suggestions 14 + checkins-ping 15 + feed-comments GET-401 +1, with 6 pre-existing GET tests updated to supply a session). tsc 0, lint 0/0, prisma valid; `npm run build` skipped (Windows type-check-worker heap-corruption flake). PR https://github.com/pcettina/OutTheGroupchat/pull/150.*

*Previous: 2026-07-20 (nightly/2026-07-21, BUILD_PLAN Day 9 "Search comes alive + Topic discovery") — no route additions/removals (66 live). `/search` mounted against `GET /api/search` + new `/topics` browse page; `GET /api/topics` gained opt-in `?withCounts=true` (additive fail-soft live-Intent counts). Bug fix: `formatSignalCount()` floored after guarding `count<=0`. Tests: 2143 / 108 files (+111). tsc 0, lint 0/0, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/149.*

*Previous: 2026-07-17 (nightly/2026-07-17, BUILD_PLAN Day 6 "Trust & Safety II: report + anti-spam") — **+1 live route**: `POST/GET /api/reports` (`src/app/api/reports/route.ts`). POST files a report (`ReportReason` enum) against a user or meetup — self-report 400, target-exists 404, duplicate idempotent 200, else create 201; Zod + `getServerSession()` + Sentry + pino. GET is an admin-only list (allowlist via `ADMIN_USER_IDS`, optional `?status` filter). New additive `Report` model + `ReportReason`/`ReportStatus`/`ReportTargetType` enums. Anti-spam: new `creationQuotaLimiter` (10/user/24h, prefix `ratelimit:creation`) in `src/lib/rate-limit.ts`; stricter daily-quota 429 + high-frequency-creator warn layered onto `POST /api/meetups` (`meetup-create-daily`) and `POST /api/crew/request` (`crew-request-daily`) — no duplicate limiter. New UI `src/components/safety/ReportButton.tsx` on profile + meetup detail (non-host). Tests: 1946 / 100 files (+17: reports 15 + daily-quota 429 2). Raw route.ts files now 77 (was 76). tsc 0, lint 0/0, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/146.*

*Previous: 2026-07-16 (nightly/2026-07-16, BUILD_PLAN Day 5 "Trust & Safety I: block a user") — **+1 live route**: `POST/DELETE /api/users/[userId]/block` (`src/app/api/users/[userId]/block/route.ts`). POST blocks (idempotent; auto-severs the Crew edge), DELETE unblocks; 401/400/404/429 guards, Zod + `getServerSession()` + Sentry + pino. New `prisma.UserBlock` model + additive idempotent migration `20260716100000_add_user_block`. Mutual block enforcement added to 4 read surfaces (`api/crew`, `api/feed`, `lib/heatmap/aggregate.ts`, `api/checkins/feed`) — a blocked pair sees nothing of each other (no partial leak). New UI `src/components/safety/BlockButton.tsx` on `/profile/[userId]` + `/crew`. Live route count now **63** (excl. `_archive`; 76 raw route.ts files). Tests: 1929 / 121 files (+20: user-block 12 + block-enforcement 8). tsc 0, lint 0/0, prisma valid; `next build` compiles OK but the Next 14.2.35 type-check worker env-crashes on this Windows host (exit 0xC0000374) — not a code defect. PR https://github.com/pcettina/OutTheGroupchat/pull/145.*

*Previous: 2026-07-13 (nightly/2026-07-13, BUILD_PLAN Day 4) — **+1 live route**: `GET/PATCH /api/users/relationship-settings` (`src/app/api/users/relationship-settings/route.ts`). GET lists per-Crew-member privacy settings (default BLOCK granularity / KNOWN identity); PATCH upserts `granularity`+`identityMode` (Zod enums), 403 for non-Crew `targetId`. Makes R4/R20 reachable (aggregate already reads `CrewRelationshipSetting`). Live route count now **62** (excl. `_archive`). New UI `RelationshipSettingsList.tsx` at `/settings/privacy/relationships` + `src/__tests__/api/relationship-settings.test.ts` (16). Tests: 1909 / 119 files. tsc 0, lint 0/0, build PASS, prisma valid. PR #144.*

*Previous: 2026-07-11 (nightly/2026-07-11, BUILD_PLAN Day 3) — no route additions/removals (74 routes on current audit). `PATCH /api/subcrews/[id]` now graduates a frozen SubCrew (`startAt`+`venueId` set) into a CREW Meetup: creates one Meetup (`scheduledAt=startAt`, `endsAt=endAt`), links all `SubCrewMember`s as `MeetupAttendee`s, sets `SubCrew.meetupId`; idempotent (transaction + `updateMany` claim + `@unique`); response gains `meetup`+`graduated`. New lib `src/lib/subcrews/graduate-to-meetup.ts` + `src/__tests__/api/subcrew-graduation.test.ts` (13). Tests: 118 files. tsc 0, lint 0/0, build PASS, prisma valid. PR pending.*

*Previous: 2026-06-29 (nightly/2026-06-30, BUILD_PLAN Day 1) — no route additions/removals; 61 live routes unchanged. `GET /api/recommendations` now applies a real density-derived hotness boost (`computeHotnessBoost`, `weightByCrew` active, 5-min cache by `(topicId, cityArea)`). Tests: 1861 / 93 files. See PR #134.*

*Previous: 2026-06-12 (nightly/2026-06-12) — no route status changes; 61 live routes unchanged. No test changes (93 test files / 1863 tests). One CI-config change: `.github/workflows/ci.yml` now builds the production bundle before the Playwright E2E step, so the authenticated-flow suite runs on every PR (closes prior rec #4).*

*Previous: 2026-06-11 (nightly/2026-06-11) — no route status changes; 61 live routes unchanged. `/api/discover` base route (GET + POST) corrected to ARCHIVED (only file is `src/app/api/_archive/discover/route.ts`); live sub-routes `/api/discover/{search,recommendations,import}` unaffected. +49 edge/security tests (check-in privacy 22, meetup authz 27) → 93 test files / 1863 tests. Phase 8 action #5 E2E authenticated flows now passing 16/16 in real Chromium.*

*Previous: 2026-06-08 (nightly/2026-06-09) — Sentry `captureException` added to discover/search, discover/recommendations, discover/import, images/search, invitations (route + [invitationId]), newsletter/subscribe, and the inspiration handler (`lib/inspiration/handlers.ts`); coverage now ~63/64 non-archive routes. No route status changes. Dead code removed: `src/components/feed/rich-item/` + `src/components/ui/ImagePicker.tsx`.*

*Previous: 2026-05-10 (nightly/2026-05-11) — Sentry instrumentation added to `/api/topics` and `/api/recommendations`; +74 integration tests covering `/api/intents/[id]` (PATCH/DELETE — 19), `/api/intents/mine` + `/api/intents/crew` (9 each), six `/api/subcrews/*` sub-routes (23), and `/api/checkins/feed` (14). Tested-route count moves to ~52/58. No new routes; README + PRODUCTION_ROADMAP refreshed.*

*Previous: 2026-03-26 - /api/ai/search GET+POST fully implemented (semantic search, destinations branch); /api/newsletter/subscribe now requires auth; /api/auth/signup, /api/auth/reset-password, /api/auth/verify-email: rate limiting now first operation; 153 new tests tonight (1156 total, 56 test files); dead components (NotificationCenter.tsx, SharePreview.tsx) removed; JSDoc added to costs.ts; README updated. Also includes 2026-03-29 changes: /api/ai/chat Zod strengthened + JSON.parse safety; /api/ai/recommend Zod GET params + JSON.parse safety; /api/ai/suggest-activities + generate-itinerary JSON.parse safety; /api/notifications/[notificationId] Zod params (cuid) + bugfix (read was hardcoded true); JSDoc added to src/lib/geocoding.ts; N8N docs deprecated*
