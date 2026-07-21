# OutTheGroupchat — Launch Checklist (V1)

## Pivot Progress (see docs/REFACTOR_PLAN.md)
- [x] Phase 0: PR backlog merged, `v1.0-trip-planning` tagged
- [x] Phase 1: Trip code archived to `src/_archive/`, tests excluded, Navigation cleaned
- [~] Phase 2: Schema ✅ | Generate ✅ | setup.ts mocks ✅ | Crew rename + `crewLabel` + `activeUntil` on branch `refactor/phase-2-crew-domain` (2026-04-17) | DB migration ⏳ (manual step)
- [x] Phase 3: Crew system (routes + UI) — `/api/crew/*`, `CrewButton`, `CrewList` ✅ 2026-04-18 (PR #46 + #47)
- [x] Phase 4: Meetups core — All 3 sessions complete (2026-04-18): API routes ✅ | venue search (Places API) ✅ | meetup UI (MeetupDetail, AttendeeList, MeetupInviteModal) ✅ | RSVP ✅ | invite ✅ | Pusher real-time ✅ | MEETUP_STARTING_SOON cron ✅ (PRs #48, #49, #51)
- [x] Phase 5: Check-ins + presence — COMPLETE 2026-04-20 (PR #53): POST /api/checkins ✅ | GET /api/checkins/feed ✅ | DELETE /api/checkins/[id] ✅ | GET /api/checkins/[id] ✅ | CheckInButton (duration picker) ✅ | LiveActivityCard ("Join me" wired) ✅ | NearbyCrewList ✅ | /checkins page ✅ | /checkins/[id] page ✅ | Privacy settings page (/settings/privacy) ✅ | /api/users/privacy ✅ | Pusher city-channel broadcast ✅ | All Phase 5 exit criteria met ✅
- [x] Phase 6: Feed/AI/notifications rescope — COMPLETE 2026-04-22 (PR #55): Feed rescoped (meetup/checkin types, trip/activity queries removed, POST returns 410) ✅ | Search people-first (users→meetups→venues) ✅ | 9 trip notification types removed from schema ✅ | Follow marked @deprecated ✅ | types/index.ts cleaned (264 lines) ✅ | All AI routes later deleted 2026-04-23 (ops/kill-all-ai)
- [x] Phase 7: Marketing surface (PR #56, 2026-04-22)
- [~] Phase 8: Launch-readiness re-audit (CODE-SIDE COMPLETE — action #5 (E2E authenticated flows) now PASSES 16/16 in a real Chromium browser as of 2026-06-11 (`e2e/authenticated-flow.spec.ts` + signed-JWT helper `e2e/auth-helper.ts`); action #6 (Sentry coverage) substantially complete at ~63/64 non-archive routes (2026-06-08). **All code-side Phase 8 work is done; remaining beta gates are operational/infra-only** — Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit.)

---

> **⚠️ Scope change (2026-04-16):** This checklist is now STALE against the new social-meetup product. It will be rewritten in Phase 8 of `docs/REFACTOR_PLAN.md`. Trip-era checklist items below remain visible for reference but should **NOT** be used to gate launch. Readiness scores below reflect the archived trip product and are intentionally left unchanged to avoid implying progress against the new scope.
>
> **Target Launch:** Q2 2026 (Beta) — to be re-baselined post-pivot
> **Current Status:** Refactoring (Phase 2 in progress — domain models added, DB migration pending)
> **Last Updated:** 2026-07-20 (nightly/2026-07-21 — BUILD_PLAN.md Day 9 "Search comes alive + Topic discovery". The orphaned search surface is now mounted: `/search` (`src/app/search/page.tsx` + `searchPageLogic.ts`) runs against the existing `GET /api/search`, with `SearchResults` rewritten for the real `user|meetup|venue` union (it previously handled trip-era `trip|activity|user` with dead `/trips/:id` + `/activities/:id` hrefs) and `SearchFilters` reduced from a trip filter panel to a result-type selector over the real API enum; empty state present; venue rows render non-navigable because no venue route exists yet. New `/topics` browse page lists Topics with live "N Crew signaled" counts from an additive opt-in `GET /api/topics?withCounts=true` — one `prisma.intent.groupBy` over `expiresAt > now`, fail-soft to `count: 0` so the signup/onboarding-gating endpoint never 500s, default envelope unchanged for its 3 existing consumers. `Navigation.tsx` gained `/search` + `/topics` (`/discover` re-iconed to Compass to keep icons unique) and the middleware matcher gained both paths. Bug fix: `formatSignalCount()` guarded `count <= 0` before flooring, so a fractional count in (0,1) rendered "0 Crew signaled" instead of "Be the first to signal". Open follow-up: Topic tiles deep-link to `/intents/new` without topic prefill (`IntentCreateForm` reads only `?window=`), centralized in `buildTopicIntentHref()`. New `topics-counts.test.ts` (12) + `search-page-logic.test.ts` + `topics-page-logic.test.ts` (99 combined) → 2143 tests / 108 files / 66 live routes (unchanged) / ~369 TS-TSX files. Lint 0/0, tsc 0, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/149. Remaining beta gates are operational/infra-only (Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit) — they require Vercel config, not code.)
>
> **Previous:** 2026-07-20 (nightly/2026-07-20 — BUILD_PLAN.md Day 8 "Tighten the notification loop". The pull-back-in mechanics are now reachable and one-tap: `PerMemberIntentToggle` on `/crew` + `/profile/[userId]` writes `NotificationPreference.perMemberTargets` via `PATCH /api/users/notification-preferences` (read-modify-write, optimistic + rollback); the daily prompt deep-links to `/intents/new?window=EVENING` and `IntentCreateForm` prefills from `?window=`. New `GET /api/heatmap/contributor-count` (auth + rate limit + Zod; returns only `{count, floor, meetsFloor, cellResolved}`) makes the R14 anonymous floor honest — `PrivacyPickerModal` disables Anonymous with an explanation below N≥3 and fails safe while loading/erroring; `SubCrewCoordinationPanel` supplies the venue/cell context and `lib/heatmap/aggregate.ts` now imports the shared `ANONYMOUS_FLOOR`. Bug fix: `NotificationPreferencesForm` always rendered empty preferences because it handed the whole response envelope to an array parser. New `heatmap-contributor-count.test.ts` (24) + `notification-preferences-form.test.ts` (20), extended `notification-preferences.test.ts` (+13) and `daily-prompt.test.ts` (+1) → 2032 tests / 105 files / 66 live routes / 366 TS-TSX files. Lint 0/0, tsc 0, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/148. Remaining beta gates are operational/infra-only (Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit) — they require Vercel config, not code.)
>
> **Previous:** 2026-07-19 (nightly/2026-07-19 — BUILD_PLAN.md Day 7 "Activation: real onboarding + empty/error states". First-run activation now shipped: a brand-new user is routed from signup through a real 3-step `/onboarding` flow (Topics → Crew → first Intent) and lands on `/intents`. New additive `User.onboardedAt DateTime?`; new `POST/GET /api/users/onboarding` (GET returns `{onboarded, onboardedAt}`, POST stamps `onboardedAt=now`, idempotent; auth → rate-limit → Zod → Sentry → pino); `src/app/auth/signup/page.tsx` redirects brand-new signups to `/onboarding`; the dead trip-era `InterestSelector.tsx` was rewritten into a real Topic selector. Empty/error states: new shared `ErrorBanner` (role=alert, Retry/Dismiss) — the feed's silent catches now surface it, and `/intents`, `/subcrews/[id]`, `/feed` empty blocks use the shared `EmptyState` with CTAs; no blank/silent-fail surfaces remain on those pages. New `onboarding.test.ts` (13) + `onboarding-flow.test.ts` (12) + `empty-error-states.test.ts` (5) → 1976 tests / 103 files / 78 raw route.ts files. Lint 0/0, tsc 0, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/147. Remaining beta gates are operational/infra-only (Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit) — they require Vercel config, not code.)
> **Previous:** 2026-07-17 (nightly/2026-07-17 — BUILD_PLAN.md Day 6 "Trust & Safety II: report + anti-spam". Reporting flow + creation-abuse throttles now shipped: a user can report another user or a meetup, and meetup creation + Crew requests are rate-limited per user on a daily quota. New additive `Report` model + `ReportReason`/`ReportStatus`/`ReportTargetType` enums; new `POST/GET /api/reports` (POST files a report — self-report 400, target-exists 404, duplicate idempotent 200, else create 201; GET is an admin-only list via `ADMIN_USER_IDS` allowlist + optional `?status` filter; Zod + `getServerSession()` + Sentry + pino); new UI `src/components/safety/ReportButton.tsx` on `/profile/[userId]` + meetup detail (non-host). Anti-spam: new `creationQuotaLimiter` (10/user/24h) in `src/lib/rate-limit.ts` layered as a stricter daily-quota 429 + high-frequency-creator warn onto `POST /api/meetups` (`meetup-create-daily`) and `POST /api/crew/request` (`crew-request-daily`) — no duplicate limiter. New `reports.test.ts` (15) + daily-quota 429 (2) → 1946 tests / 100 files / 77 raw route.ts files / ~426 TS files. Lint 0/0, tsc 0, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/146. Remaining beta gates are operational/infra-only (Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit) — they require Vercel config, not code.)
> **Previous:** 2026-07-16 (nightly/2026-07-16 — BUILD_PLAN.md Day 5 "Trust & Safety I: block a user". Baseline safety for a social + location product now shipped: a user can block another user, enforced mutually across every surface that could leak presence. New `prisma.UserBlock` model + additive idempotent migration `20260716100000_add_user_block`; new `POST/DELETE /api/users/[userId]/block` (idempotent; blocking auto-severs the Crew edge; 401/400/404/429 guards, Zod + `getServerSession()` + Sentry + pino); mutual block enforcement on `api/crew`, `api/feed`, `lib/heatmap/aggregate.ts`, `api/checkins/feed` (no partial leak); new UI `src/components/safety/BlockButton.tsx` on `/profile/[userId]` + `/crew`. New `user-block.test.ts` (12) + `block-enforcement.test.ts` (8) → 1929 tests / 121 files / 63 live routes / 424 TS files. Lint 0/0, tsc 0, prisma valid; `next build` compiles OK but the Next 14.2.35 type-check worker env-crashes on this Windows host (exit 0xC0000374) — an environment flake, not a code defect. PR https://github.com/pcettina/OutTheGroupchat/pull/145. Remaining beta gates are operational/infra-only (Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit) — they require Vercel config, not code.)
> **Previous:** 2026-07-13 (nightly/2026-07-13 — BUILD_PLAN.md Day 4 "Per-relationship privacy defaults". R4/R20 are now reachable: a user can set, per Crew member, who sees their location and at what granularity/identity. New `GET/PATCH /api/users/relationship-settings` writes `CrewRelationshipSetting` (defaults BLOCK granularity / KNOWN identity), which `lib/heatmap/aggregate.ts` already reads; new UI `src/components/privacy/RelationshipSettingsList.tsx` mounted at `src/app/settings/privacy/relationships/page.tsx` and linked from the privacy settings page. New `relationship-settings.test.ts` (16) → 1909 tests / 119 files / 62 live routes / 416 TS files. Build PASS, lint 0/0, tsc 0, prisma valid. PR https://github.com/pcettina/OutTheGroupchat/pull/144. Remaining beta gates are operational/infra-only (Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit) — they require Vercel config, not code.)
> **Previous:** 2026-07-11 (nightly/2026-07-11 — BUILD_PLAN.md Day 3 "SubCrew graduates into a Meetup". The intent→group→coordinate funnel now closes end-to-end: `PATCH /api/subcrews/[id]` graduates a frozen SubCrew (both `startAt` and `venueId` set) into a durable CREW `Meetup` (`scheduledAt=startAt`, `endsAt=endAt`), links all `SubCrewMember`s as `MeetupAttendee`s, and sets `SubCrew.meetupId`; idempotent (transaction + `updateMany` claim + `@unique`). New lib `src/lib/subcrews/graduate-to-meetup.ts`; the coordination panel shows a graduated banner + "View Meetup" link. New `subcrew-graduation.test.ts` (13) → 118 test files / 74 routes / 414 TS files. Build PASS, lint 0/0, tsc 0, prisma valid. PR pending. First normal execution night after the 7-night escalation hold ended (main fast-forwarded to `d2a18ed`). Remaining beta gates are operational/infra-only (Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit) — they require Vercel config, not code.)
> **Previous:** 2026-06-30 (nightly/2026-06-30 — BUILD_PLAN.md Day 2 "Make 'hot' visible + persist the chosen venue". The now-real hotness signal is surfaced to users: new `HotNowBadge` renders a "🔥 Hot now" badge (threshold `hotnessBoost` ≥ 1.15) + contributor-count chip on recommendations (`RecommendationsList.tsx`) and the heatmap (`HeatmapMap.tsx`). The SubCrew coordination panel gained a venue selector that PATCHes the existing `/api/subcrews/[id]` `venueId` field and displays the chosen venue (no new API). New `subcrews-venue.test.ts` (10) + `hot-now-badge.test.ts` (9) → 1880 tests / 95 files / 61 routes. Build PASS, lint 0/0, tsc 0, prisma valid. PR pending. Remaining beta gates are operational/infra-only (Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit) — they require Vercel config, not code.)
> **Previous:** 2026-06-12 (nightly/2026-06-12 — lean quality-only build. One code change: `.github/workflows/ci.yml` now runs `npm run build` (with `CI: 'true'`) **before** the Playwright E2E step, so the production `webServer` (`npm run start`) the authenticated-flow suite depends on has a `.next` build to serve. This wires the verified `e2e/authenticated-flow.spec.ts` (16/16 passing locally) into CI on every PR — closing prior-night recommendation #4. No test changes (1863 tests / 93 files / 61 routes). Remaining beta gates are operational/infra-only (Sentry DSN in Vercel, Pusher vars, Resend domain, uptime monitor, NEXTAUTH_SECRET audit) — they require Vercel config, not code.)
> **Previous:** 2026-06-11 (nightly/2026-06-11 — **Phase 8 action #5 closed in code: E2E Playwright authenticated flows now PASS 16/16 in a real Chromium browser** via signed-JWT cookie helper; production behavior was already correct (spec assertions corrected to match intentional middleware redirects). +49 edge/security tests (check-in privacy 22, meetup authz 27) → 1863 tests / 93 files / 61 routes. 7 unused imports removed.)

---

## Pivot progress

- [x] Phase 0 — PR backlog merged, `v1.0-trip-planning` tagged
- [x] Phase 1 — Trip code archived to `src/_archive/`, tests excluded, Navigation cleaned
- [x] Phase 2 — Schema + Crew model + `crewLabel` + `activeUntil` + Neon migration applied
- [x] Phase 3 — Crew system (routes + UI)
- [x] Phase 4 — Meetups core (routes + UI + Pusher + cron)
- [x] Phase 5 — Check-ins + presence + privacy settings
- [x] Phase 6 — Feed/AI/notifications rescope (AI fully removed 2026-04-23, PR #65)
- [x] Phase 7 — Marketing surface (about page, OG tags, README rewrite, email-auth split)
- [ ] **Phase 8 — Launch-readiness re-audit (IN PROGRESS)**

---

## Phase 8 exit criteria

These are the gates that must close before V1 beta launch.

### 8.1 Infrastructure / env

- [x] Vercel project linked to `main`
- [x] Auto-deploy from `main` branch
- [x] Neon Postgres connected (migrated from Supabase 2026-04-17)
- [x] Production Neon migration workflow (PR #90, 2026-05-07)
- [x] Per-PR Neon branch workflow active (`.github/workflows/neon-pr.yml`)
- [x] Upstash Redis connected (rate limiting)
- [x] Resend connected
- [ ] **Sentry DSN set in Vercel production** — see `docs/OPS_LAUNCH_CHECKLIST.md#1-sentry-dsn`
- [ ] **Pusher env vars set in Vercel production** (6 vars) — see `docs/OPS_LAUNCH_CHECKLIST.md#2-pusher-env-vars`
- [ ] **Resend domain verified** + `EMAIL_FROM` switched off sandbox — see `docs/OPS_LAUNCH_CHECKLIST.md#3-resend-domain-verification`
- [ ] DEMO_MODE decision (currently false in prod — flip to true if demo-auth needed)
- [x] CSP allows MapLibre tiles + worker (PR #89, 2026-05-04)

### 8.2 Security

- [x] Password hashing (bcrypt)
- [x] Secure session cookies (NextAuth)
- [x] SQL injection prevention (Prisma)
- [x] Upstash-backed rate limiting on auth endpoints (signup, reset-password, verify-email, beta/status)
- [x] Zod input validation on all V1 routes (auth, crew, meetups, checkins, intents, subcrews, topics, recommendations, heatmap, users, profile, pusher/auth)
- [x] Email removed from public user search
- [x] CORS configured (`/api/:path*` headers in `next.config.js`)
- [x] Security headers (HSTS, X-Frame-Options, CSP)
- [x] XSS prevention (DOMPurify on rich-feed content)
- [x] AI surface fully removed (PR #65, 2026-04-23) — no `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` consumed
- [ ] NEXTAUTH_SECRET strength audit (32+ chars in prod)
- [ ] Failed-login attempt limiting (post-V1 — out of beta scope)

### 8.3 Core V1 features

- [x] Auth: signup, signin, password reset, email verification
- [x] Crew system (`/api/crew/*` — 6 routes, `CrewButton`, `CrewList`, `/profile/[userId]`)
- [x] Meetups core (`/api/meetups/*`, MeetupDetail, RSVP, invite, Pusher real-time, `MEETUP_STARTING_SOON` cron)
- [x] Venue search (Google Places API, `/api/venues/search`)
- [x] Check-ins (`/api/checkins/*`, `CheckInButton`, `LiveActivityCard`, `NearbyCrewList`)
- [x] Privacy settings (`/settings/privacy`, `/api/users/privacy`)
- [x] Per-relationship location privacy (R4/R20 — "who sees my location" per Crew member) — `GET/PATCH /api/users/relationship-settings` writes `CrewRelationshipSetting` (granularity BLOCK/DYNAMIC_CELL/HIDDEN + identity KNOWN/ANONYMOUS/CREW_ANCHORED per Crew member; defaults BLOCK/KNOWN); `RelationshipSettingsList` UI at `/settings/privacy/relationships`; `lib/heatmap/aggregate.ts` honors it 2026-07-13, BUILD_PLAN Day 4
- [x] Trust & Safety I — block a user — `POST/DELETE /api/users/[userId]/block` (new `prisma.UserBlock` model; idempotent; blocking auto-severs the Crew edge); **mutual enforcement across crew list, feed, heatmap, and check-in feed** so a blocked pair sees nothing of each other (no partial presence leak); `BlockButton` UI on `/profile/[userId]` + `/crew` 2026-07-16, BUILD_PLAN Day 5
- [x] Trust & Safety II — report + anti-spam — `POST/GET /api/reports` (new `Report` model + `ReportReason`/`ReportStatus`/`ReportTargetType` enums; POST files a report against a user/meetup with self-report guard, target-exists 404, and duplicate-report idempotency; GET is an admin-only list via `ADMIN_USER_IDS` allowlist + `?status` filter); `ReportButton` UI on `/profile/[userId]` + meetup detail. **Anti-spam:** new `creationQuotaLimiter` (10/user/24h) layered as a stricter daily quota (429 over-quota) + high-frequency-creator warn onto `POST /api/meetups` + `POST /api/crew/request` — no duplicate limiter on the same key 2026-07-17, BUILD_PLAN Day 6
- [x] Intents → auto-grouping loop (`/api/intents/*`, `/api/subcrews/*`, `cron/expire-intents`)
- [x] Heatmap (Crew tier PR #86, FoF tier PR #87, threshold slider PR #88, MapLibre + OpenFreeMap)
- [x] Topics + Recommendations (`/api/topics`, `/api/recommendations`) — recommendations apply a real density-derived hotness boost (`computeHotnessBoost`, `weightByCrew` active) 2026-06-29, BUILD_PLAN Day 1; the boost is now **surfaced in the UI** as a "🔥 Hot now" badge + contributor-count chip (`HotNowBadge` on `RecommendationsList` + `HeatmapMap`) 2026-06-30, BUILD_PLAN Day 2
- [x] SubCrew chosen-venue persistence + UI — coordination panel venue selector PATCHes `/api/subcrews/[id]` `venueId` and displays the chosen venue on reload 2026-06-30, BUILD_PLAN Day 2
- [x] SubCrew → Meetup graduation — a frozen SubCrew (`startAt`+`venueId` set) graduates via `PATCH /api/subcrews/[id]` into a durable CREW Meetup with all members linked as attendees (`SubCrew.meetupId` set; idempotent); coordination panel shows a graduated banner + "View Meetup" link 2026-07-11, BUILD_PLAN Day 3. **Closes the intent→group→coordinate→meetup funnel.**
- [x] Feed (rescoped to meetup/checkin types — trip/activity items removed)
- [x] Search (people-first ordering) — **UI now mounted** at `/search` (`src/app/search/page.tsx`) against the existing `GET /api/search`; `SearchResults` rewritten for the real `user|meetup|venue` union (was trip-era `trip|activity|user` with dead hrefs) and `SearchFilters` reduced to a result-type selector over the real API enum; empty state present; venue results render non-navigable (no venue route exists yet). Nav + middleware entries added 2026-07-20, BUILD_PLAN Day 9
- [x] Topic discovery — `/topics` browse page (`src/app/topics/page.tsx`) lists Topics with live "N Crew signaled" counts from an additive opt-in `GET /api/topics?withCounts=true` (single `prisma.intent.groupBy` over `expiresAt > now`, fail-soft to `count: 0` so the signup/onboarding-gating endpoint never 500s); tiles deep-link to `/intents/new`. **Open follow-up:** no topic prefill on that link yet (`IntentCreateForm` reads only `?window=`) — centralized in `buildTopicIntentHref()` 2026-07-20, BUILD_PLAN Day 9
- [x] First-run onboarding / activation — a brand-new user is routed once from signup through a real 3-step `/onboarding` flow (Topics → Crew → first Intent) and completes to `/intents`. `POST/GET /api/users/onboarding` (additive `User.onboardedAt`; GET drives the self-skip, POST stamps completion, idempotent); `src/app/auth/signup/page.tsx` redirects brand-new signups to `/onboarding`; the dead trip-era `InterestSelector.tsx` rewritten into a real Topic selector 2026-07-19, BUILD_PLAN Day 7
- [x] Empty + error states on core surfaces — new shared `ErrorBanner` (role=alert, Retry/Dismiss); the feed's silent catches now surface a visible banner, and `/intents`, `/subcrews/[id]`, `/feed` empty blocks use the shared `EmptyState` with CTAs; intents surfaces endpoint-level `success:false`. No blank/silent-fail surfaces remain on these pages 2026-07-19, BUILD_PLAN Day 7
- [x] Notification loop reachable end-to-end — per-member intent flagging shipped (`PerMemberIntentToggle` on `/crew` + `/profile/[userId]` writes `NotificationPreference.perMemberTargets` via `PATCH /api/users/notification-preferences`, read-modify-write with optimistic rollback), and the daily prompt deep-links one tap into a pre-filled Intent (`daily-prompt.ts` actionUrl → `/intents/new?window=EVENING`; `IntentCreateForm` prefills from `?window=`) 2026-07-20, BUILD_PLAN Day 8
- [x] Notification preferences settings page renders real data — BUG FIX: `NotificationPreferencesForm` was passing the whole `{success, data:{preferences}}` envelope to a parser requiring an array, so the page always rendered empty preferences; now unwrapped defensively (regression covered by `components/notification-preferences-form.test.ts`) 2026-07-20, BUILD_PLAN Day 8
- [x] Anonymous-floor (R14) honesty in the privacy picker — new `GET /api/heatmap/contributor-count` (auth + rate limit + Zod; returns only `{count, floor, meetsFloor, cellResolved}`) lets `PrivacyPickerModal` disable Anonymous with an explanation below the N≥3 floor and fail safe while loading/erroring; `SubCrewCoordinationPanel` supplies `venueId`/`cityArea`/`contributionType`, and `lib/heatmap/aggregate.ts` now shares the single `ANONYMOUS_FLOOR` constant 2026-07-20, BUILD_PLAN Day 8

### 8.4 Monitoring & observability

- [x] Sentry installed and configured (`instrumentation-client.ts`, `src/lib/sentry.ts`)
- [x] Sentry `captureException` coverage — **~63 / 64 non-archive routes (2026-06-08)** — only the NextAuth catch-all re-export uncovered (not meaningful); code-side instrumentation essentially complete. See `docs/SENTRY_COVERAGE_AUDIT.md`
- [x] Structured logging (pino via `@/lib/logger`)
- [x] Vercel Analytics enabled
- [ ] Sentry DSN set in production (blocks event ingestion)
- [ ] Sentry source maps uploaded
- [ ] Uptime monitor (BetterStack / Checkly)
- [ ] Status page

### 8.5 Testing

- [x] **1976 / 1976 tests passing** (Vitest, 103 test files as of 2026-07-19, BUILD_PLAN Day 7)
- [x] 0 TSC errors, 0 lint warnings
- [x] Service tests (recommendation, survey)
- [x] API route tests (auth, feed, notifications, crew, meetups, checkins, intents, subcrews, topics, heatmap, users, profile, beta, search, voting, sanitize, pusher)
- [x] Library tests (sanitize, pusher, email)
- [x] CI: GitHub Actions runs Node 20 + TSC + lint + Vitest + **production build** + Playwright (build-before-E2E step added 2026-06-12 so the production `webServer` has a `.next` build to serve)
- [x] E2E smoke spec (Playwright, public flows only)
- [x] **E2E Playwright authenticated flows** — Crew → Meetup loop. `e2e/authenticated-flow.spec.ts` (16 tests) now **PASSES 16/16 in a real Chromium browser** (2026-06-11) via signed-JWT cookie helper `e2e/auth-helper.ts`; gated API routes assert intentional middleware 307-redirects. Production code unchanged. **Phase 8 action #5 complete.** **Now wired into CI (2026-06-12):** `.github/workflows/ci.yml` builds the production bundle before the Playwright step, so this suite runs on every PR (closes prior rec #4).
- [ ] Auth flow E2E (signup → verify → signin)

### 8.6 UI/UX

7. [x] Guard /api/auth/demo behind DEMO_MODE env var ✅ 2026-03-22
   File: src/app/api/auth/demo/route.ts (hardcoded password removed; requires DEMO_MODE=true)

8. [x] Strip email from unauthenticated public trip responses ✅ 2026-03-25
   File: src/app/api/trips/[tripId]/route.ts (email removed from public GET)

9. [x] Remove NODE_ENV/version from /api/health (data minimization) ✅ 2026-03-25
   File: src/app/api/health/route.ts (response shape narrowed to {status, timestamp, database})
```

### Security Headers
- [x] Add security headers to next.config.js ✅ 2026-03-10
- [x] HSTS enabled ✅ 2026-03-10
- [x] X-Frame-Options set ✅ 2026-03-10
- [x] Content-Security-Policy defined ✅ 2026-03-10

---

## 🧪 PHASE 4: Testing

### Unit Tests
- [x] Service layer tests ✅ 2026-03-23 (recommendation.service.test.ts TSC errors fixed; all tests passing)
- [x] Utility function tests (email, geocoding, invitations, rate-limit) ✅ 2026-03-11
- [x] API route tests (trips 30, voting 10, survey 11, feed 12) ✅ 2026-03-10
- [x] API route tests (auth/signup, notifications, profile) ✅ 2026-03-11
- [x] API route tests (trips-suggestions 23, trips-flights 26, trips-members 29) ✅ 2026-03-20 — total: 382 tests across 22 files
- [x] API route tests (verify-email 9, pusher-auth 14, trips-members POST +12) ✅ 2026-03-21 — total: ~577 tests across 31 files
- [x] API route tests (signup 15, trips-tripid 20, ai-chat+recommend 24, tripid-invitations 14, tripid-recommendations 11) ✅ 2026-03-22 — total: ~661 tests across 37 files
- [x] API route tests (ai-search 12, discover ~20, images-search 10, newsletter 10, geocoding-api 12) + lib tests (recommendation.service) ✅ 2026-03-23 — total: 746 tests across 42 files
- [x] API route tests (trips-voting 50, trips-invitations 33, pusher-feed-social 38, trips-itinerary 43) ✅ 2026-03-23 — total: 910+ tests across 46 files
- [x] API route tests (trips-itinerary +21, auth-demo 13, cron 10, discover-search 12) + discover.test.ts auth fixes ✅ 2026-03-24 — total: 924 tests across 49 files
- [x] API route tests (invitations-post 18, ai-get-methods 16, beta-extended 21, users-follow 24) ✅ 2026-03-25 — total: 1003 tests across 53 files
- [x] Service tests + API tests (recommendation.service 45, survey.service 36, geocoding-images 32, inspiration +39) ✅ 2026-03-26 — total: 1156 tests across 56 files
- [x] API route tests (ai-generate-itinerary 31, ai-suggest-activities 25, discover-import 21) ✅ 2026-03-29
- [x] API route tests (feed-extended 42, notifications-extended 33, health 14, trips-survey-voting-extended 23) ✅ 2026-04-16 — total: **1346 tests across 63 files**

### Integration Tests
- [ ] Auth flow tests
- [x] Trip CRUD tests ✅ 2026-03-10
- [x] Database operation tests (covered via API mocks) ✅ 2026-03-10

### E2E Tests (Critical Flows)
- [x] Auth flow E2E spec created (Playwright) ✅ 2026-03-23 — e2e/auth-flow.spec.ts
- [ ] User signup → trip creation → invite flow
- [ ] Survey completion flow
- [ ] Voting flow

### Manual Testing Checklist
```bash
□ Sign up with new account
□ Sign in with existing account
□ Create a new trip
□ View trip details
□ Invite a member (link-based)
□ View feed
□ Navigate all pages
□ Test on mobile browser
□ Test on multiple browsers
```

---

## 📊 PHASE 5: Monitoring & Observability

### Error Tracking
- [x] Sentry installed and configured ✅ 2026-03-10 (instrumentation-client.ts onRouterTransitionStart fixed 2026-03-20; src/lib/sentry.ts helper created 2026-03-25; needs real DSN in Vercel)
- [x] Sentry captureException added to 19/48 routes ✅ 2026-04-16 (feed x4, notifications x2, trips/route x1, trips/[tripId] x8, auth x4)
- [x] Sentry instrumented on V1 routes (intents/*, subcrews/*, heatmap, recommendations, topics, venues/search) ✅ 2026-05-12 (nightly/2026-05-13 — 10 V1 routes newly instrumented, 12 catch blocks tagged; V1 surface Sentry coverage complete)
- [x] Sentry `captureException` extended to discover/*, images/search, invitations (+[invitationId]), newsletter/subscribe, inspiration handler ✅ 2026-06-08 (nightly/2026-06-09) — code-side coverage now ~63/64 non-archive routes (only NextAuth catch-all re-export uncovered)
- [ ] Error alerts configured (pending Sentry DSN)
- [ ] Source maps uploaded (pending Sentry DSN)

### Performance
- [x] Vercel Analytics enabled ✅ 2026-03-16
- [ ] Core Web Vitals monitoring
- [ ] API response time tracking

### Uptime
- [ ] Uptime monitoring (BetterStack/Checkly)
- [ ] Status page created
- [ ] Alert channels configured (Slack/Email)

### Logging
- [x] Structured logging implemented (pino via @/lib/logger) ✅ 2026-03-09
- [ ] Log aggregation configured
- [ ] Debug logs removed from production (in progress: 59 → target ~20)

---

## 🎨 PHASE 6: UI/UX Polish

### Loading States
- [x] Skeleton loaders on all data-fetching pages ✅ Dec 17
- [x] Loading spinners on actions ✅ Dec 17
- [x] Optimistic updates where appropriate ✅ Dec 17

### Empty States
- [x] No trips empty state ✅ Dec 17
- [x] No notifications empty state ✅ Dec 17
- [x] No search results state ✅ 2026-07-20 (BUILD_PLAN Day 9) — `/search` renders an empty state when the query returns no results

### Error States
- [x] Global error boundary ✅ 2026-03-13 (global-error.tsx)
- [x] Friendly 404 page ✅ 2026-03-13 (not-found.tsx)
- [x] Friendly 500 page ✅ 2026-03-13 (error.tsx)
- [ ] Form validation errors inline

### Responsive Design
- [x] All pages tested on mobile ✅ Dec 17
- [x] Touch targets 44px minimum ✅ Dec 17
- [x] Mobile navigation working ✅ Dec 17

### Accessibility
- [x] Skip links implemented
- [x] ARIA patterns in place
- [ ] Keyboard navigation tested
- [ ] Screen reader smoke pass

### 8.7 Content & legal

- [x] About page (`/about`)
- [x] Privacy Policy (`/privacy`)
- [x] Terms of Service (`/terms`)
- [x] OG tags + Twitter Card metadata
- [x] Favicon configured
- [x] README.md aligned with V1 vision

---

## Beta launch gates (must-have)

The following are **blocking** for opening V1 beta to external users:

1. Sentry DSN live in Vercel production
2. Pusher env vars live in Vercel production (real-time meetup + check-in updates)
3. Resend domain verified (production emails currently bounce on unverified sandbox domain)
4. ✅ E2E Playwright authenticated flow covering the canonical V1 loop: signup → set Intent → match into Subcrew → create Meetup → check in. **DONE 2026-06-11 — `e2e/authenticated-flow.spec.ts` (16 tests) passes 16/16 in a real Chromium browser** (signed-JWT cookie helper `e2e/auth-helper.ts`; gated API routes assert intentional middleware 307-redirects). Production code was already correct. **Wired into CI 2026-06-12** — `.github/workflows/ci.yml` builds the production bundle before the Playwright step so the suite runs on every PR (closes prior rec #4).
5. Uptime monitor connected
6. NEXTAUTH_SECRET audit confirmed in prod

Open PRs (status as of 2026-05-09):
- PR #59 (`nightly/2026-04-24`) — open 15 days, contains AI tests that conflict with PR #65 AI removal. Resolve or close.
- PR #67 (`nightly/2026-04-25`) — open, dead-component cleanup + security audit updates. Land or close.
- PR #99–#102 — recent surgical-mode nightlies. Triage as a batch.

---

## Success metrics (V1 beta)

| Metric | Target | How to track |
|--------|--------|--------------|
| Crew connections formed | 50+ | `Crew` table count where `status='ACCEPTED'` |
| Intents signaled per active user | ≥1 / week | `Intent` table cohort metric |
| Subcrews auto-formed | 10+ | `Subcrew` rows created in beta window |
| Meetups created from Subcrews | 5+ | `Meetup.subcrewId IS NOT NULL` rows |
| Check-ins per active user | ≥1 / week | `CheckIn` table cohort metric |
| Error rate | < 1% | Sentry (once DSN live) |
| Page load time | < 3s | Vercel Analytics |
| Uptime | > 99% | BetterStack |

---

## Quick commands

```bash
# Dev
npm run dev

# Validation (run before committing)
npm run lint
npx tsc --noEmit
npx vitest run --run
npm run build

# Database
npx prisma studio
npx prisma db push
npx prisma generate
```

---

## References

- `docs/PRODUCT_VISION.md` — V1 product spec (intent-to-group loop)
- `docs/REFACTOR_PLAN.md` — pivot phases (Phase 8 active)
- `docs/SENTRY_COVERAGE_AUDIT.md` — per-route Sentry instrumentation status
- `docs/OPS_LAUNCH_CHECKLIST.md` — operator runbook for Sentry / Pusher / Resend env setup
- `docs/CODEMAP.md` — full codebase reference
