# 🟢 Complete — Phase 6: Feed/AI/Notifications Rescope (all sessions delivered)

> **Status:** Phase 6 COMPLETE as of 2026-04-22 (nightly/2026-04-22 PR #55). All 4 Phase 6 actions done: feed rescoped, AI routes added, notification types migrated, search rescoped people-first. Phase 7 (Marketing surface) is next.
> **Test count:** ~1050 tests passing; 58 test files (+3 new: feed.test.ts, feed-extended.test.ts, notifications-rescoped.test.ts)

---

## Completed 2026-05-04 (Nightly Build nightly/2026-05-05)

> POST_PIVOT_STEADY_STATE — no phase exits triggered. Wave 1 added 128 new tests (5 files), Wave 2 shipped 6 tasks (1 large refactor, 2 sentry sweeps, 2 docs/JSDoc tasks, 1 dead component cleanup). All TSC checks green.

### Wave 1 — Tests (128 new tests, 5 new files)

- [W1] `src/__tests__/api/subcrews-actions.test.ts` (30 tests) — POST `/api/subcrews/[id]/join`, POST `/api/subcrews/[id]/commit`, DELETE `/api/subcrews/[id]/members/me`
- [W1] `src/__tests__/api/subcrews-listing.test.ts` (24 tests) — GET `/api/subcrews/emerging`, GET `/api/subcrews/mine`
- [W1] `src/__tests__/api/intents-detail.test.ts` (41 tests) — `/api/intents/[id]` PATCH/DELETE, `/api/intents/mine`, `/api/intents/crew`
- [W1] `src/__tests__/api/recommendations-edge.test.ts` (16 tests) — `/api/recommendations` edge cases
- [W1] `src/__tests__/api/heatmap-edge.test.ts` (17 tests) — `/api/heatmap` edge cases

### Wave 2 — Features

- [L4] `src/components/feed/RichFeedItem.tsx` refactored 717 → 222 lines; 11 subcomponents extracted under `src/components/feed/rich-item/`
- [L5] Sentry context tags added to 6 subcrews routes — `subcrews/[id]`, `[id]/join`, `[id]/commit`, `[id]/members/me`, `emerging`, `mine`
- [L6] Sentry context tags added to 8 V1 routes — `intents/route`, `intents/[id]`, `intents/mine`, `intents/crew`, `topics`, `heatmap`, `recommendations`, `cron/expire-intents`
- [M3] JSDoc added to `src/lib/email-meetup.ts` + `src/lib/invitations.ts`
- [M4] 4 dead components deleted — `TripHistory.tsx`, `BadgeShowcase.tsx`, `PreferencesCard.tsx`, `FloatingShareButton.tsx`; barrel exports cleaned
- [M5] `README.md` "Recent Updates" rewritten to reflect post-pivot status

### TSC Fix (coordinator-applied)

- `prisma/scripts/seed-heatmap-only.ts` — removed `.ts` extensions from imports (resolved 2 TSC errors)

### Phase 3.5 — Small Task Metrics (automated)

- `any` types in production code: 0 (4 hits were comments only)
- `console.*` in production: 0
- TODO/FIXME comments: 0
- Files >600 lines (production): 2 (RichFeedItem dropped 717→222; profile/page.tsx still 623)
- Test files: 86 → 91 (+5 from Wave 1)
- API route files: 72

### Metrics

- Tests: ~917 baseline → ~1045 (+128 new from Wave 1)
- Test files: 86 → 91
- API routes: 72 (drift correction — was previously claimed 50/58)
- Sentry coverage: +14 V1 routes instrumented this build (subcrews 6 + intents/topics/heatmap/recommendations/expire-intents 8)

---

## 🟢 Completed 2026-04-22 (Nightly Build nightly/2026-04-22)

### Wave 1 — Tests

- [M1] 21 tests in `src/__tests__/api/search.test.ts` — rewrote from 13 trips-focused tests to 21 people-first tests covering the new users→meetups→venues ordering, `type=` enum validation, and empty result paths
- [M2] 18 tests in `src/__tests__/api/notifications-rescoped.test.ts` — covers social notification types (CREW_REQUEST, CREW_ACCEPTED, MEETUP_INVITED, MEETUP_RSVP, MEETUP_STARTING_SOON, CREW_CHECKED_IN_NEARBY, SYSTEM)
- [M3] Feed test verification — 37 tests pass (12 feed.test.ts + 25 feed-extended.test.ts), no fixes needed

### Wave 2 — Features

- [L1] `src/app/api/feed/route.ts` fully rescoped — meetup/checkin item types, feed.test.ts (12 tests) + feed-extended.test.ts (25 tests) created
- [L2] `src/app/api/search/route.ts` people-first — users→meetups→venues ordering; Zod enum updated to `['all','people','meetups','venues']`
- [L3] Notification type migration — 9 old trip `NotificationType` values removed from `prisma/schema.prisma`; `Follow` marked `@deprecated`; TSC fixes applied in feed/comments, feed/engagement, feed/share, auth/signup, beta/initialize-password, cron, invitations routes; `npx prisma generate` ran successfully
- [M4] JSDoc added to `src/lib/email-meetup.ts` and `src/lib/email-crew.ts`
- [M5] Stale docs updated — `docs/FUTURE_IMPLEMENTATION.md` and `docs/IMPLEMENTATION_STACK.md` updated to 2026-04-22
- [M6] `src/types/index.ts` cleanup — 19 dead trip-domain types removed, re-exports added for meetup/checkin types; file reduced 450→264 lines

### Wave 2 — Small Tasks

- [S1] `src/app/feed/page.tsx` tabs updated — 'Meetups', 'Check-ins', 'Crews'; CTA updated to `/meetups/new`
- [S2] `docs/README.md` footer fixed — Last Updated updated, metrics updated (987 tests, 50 routes)
- [S3] `src/lib/rate-limit.ts` JSDoc — `@module` block and function-level JSDoc added

### Phase 3.5 — Small Task Metrics (automated)

- `any` types: 0 | `console.*`: 0 | TODO/FIXME: 2 | files >600 lines (production): 0

### Metrics

- Tests: ~1041 → ~1050 (+37 new feed tests + 8 net search update + 18 new notifications; -53 archived feed/feed-extended from nightly/2026-04-21 replaced by new feed tests)
- Test files: 55 → 58 (+3 new: feed.test.ts, feed-extended.test.ts, notifications-rescoped.test.ts)
- API routes: 50 (unchanged — feed POST now returns 410 rather than being a live route)
- Phase 6 exit criteria: all 4 actions complete ✅

### Phase 6 complete — all exit criteria met

- Feed shows only meetup/checkin content types ✅
- AI suggestions reference meetup + Crew context, not trip context ✅
- Search surfaces people first (users→meetups→venues ordering) ✅
- Notification enum cleaned: 9 trip types removed, social types retained ✅

---

# 🟡 Previously In Progress — Phase 6: Feed/AI/Notifications Rescope (Session 1 delivered 2026-04-21)

> **Status:** Phase 6 Session 1 shipped 2026-04-21. Feed rescoped (meetup/checkin types, trip/activity queries removed). `POST /api/ai/suggest-meetups` and `POST /api/ai/icebreakers` created. "Join me" fully wired, activeUntil duration picker, check-ins on profile, Pusher subscription on /checkins page, Navigation privacy link all complete. Phase 5 is fully closed.
> **Test count:** ~1041 tests passing (+47 new: discover-recommendations 26, suggest-meetups 11, icebreakers 10); 55 test files (+3)

---

## 🟢 Completed 2026-04-21 (Nightly Build nightly/2026-04-21)

### Wave 1 — Tests

- [L3] 26 tests added to `src/__tests__/api/discover-recommendations.test.ts` — `/api/discover/recommendations` auth, category filter, rate limiting, pagination, empty results, error paths

### Wave 2 — Features

- [L1] Feed route rescoped — `src/app/api/feed/route.ts` rewritten with meetup/checkin item types (`meetup_created`, `check_in_posted`, `crew_formed`, `meetup_attended`, `post_created`). All trip/activity Prisma queries removed. POST returns 410 Gone.
- [L2] `POST /api/ai/suggest-meetups` route created — `src/app/api/ai/suggest-meetups/route.ts` + `src/__tests__/api/suggest-meetups.test.ts` (11 tests). Given user's city, Crew, past check-ins, returns AI meetup ideas.
- [M1] "Join me" wiring — `CreateMeetupModal.tsx` updated with URL param pre-fill; `LiveActivityCard.tsx` updated with `onJoinMe` prop
- [M2] `activeUntil` duration picker — `CheckInButton.tsx` updated with 5-option chip row (30min / 1h / 2h / 6h / 12h)
- [M3] Check-ins on profile page — `profile/page.tsx` updated with Recent Check-ins section
- [M4] Pusher subscription on `/checkins` page — `NearbyCrewList.tsx` + `checkins/page.tsx` updated with real-time city-channel subscription
- [M5] `POST /api/ai/icebreakers` route created — `src/app/api/ai/icebreakers/route.ts` + `src/__tests__/api/icebreakers.test.ts` (10 tests). Suggests conversation starters for a new Crew member.
- [M6] `RichFeedItem` component updated — all 5 new feed item type sub-components implemented
- [S1] Navigation privacy link — `Navigation.tsx` updated with Shield icon + `/settings/privacy` link
- [S2] README fixed — 7 occurrences of `/api/connections` → `/api/crew`, route count 46→51, test count updated
- [S3] Search route expansion — `search/route.ts` updated to support `type=meetups`, `type=venues`, `type=people`

### Phase 3.5 — Small Task Metrics (automated)

- `any` types: 0 | `console.*`: 0 | TODO/FIXME: 2 | files >600 lines (production): 0

### Metrics

- Tests: ~994 → ~1041 (+47 new: discover-recommendations 26, suggest-meetups 11, icebreakers 10)
- Test files: 52 → 55 (+3 new)
- API routes: 51 → 53 (+2: `POST /api/ai/suggest-meetups`, `POST /api/ai/icebreakers`)
- Feed rescope: Phase 6 action #1 complete

### Note on existing feed tests

Feed tests in `src/__tests__/api/feed-extended.test.ts` and `src/__tests__/api/pusher-feed-social.test.ts` may need updating due to the L1 feed route rescope (trip/activity queries removed). The validation phase will identify and handle these.

---

# 🟢 Complete — Phase 5: Check-ins & Live Presence (Session 2 delivered 2026-04-20)

> **Status:** Phase 5 Session 2 shipped 2026-04-20. Privacy settings page, Pusher broadcast wiring, "Join me" CTA, duration picker, email-crew split, and check-in detail route complete. All Phase 5 exit criteria met — phase is complete. Phase 6 (Feed/AI/notifications rescope) is next.
> **Test count:** ~1008 tests passing (~964 + 44 new); 70 test files (+2: privacy-settings.test.ts, checkins-pusher.test.ts)

---

## 🟢 Completed 2026-04-20 (Nightly Build nightly/2026-04-20)

### Wave 2 — Features

- [L1] Privacy settings page + `/api/users/privacy` route. Created: `src/app/api/users/privacy/route.ts`, `src/app/settings/privacy/page.tsx`, `src/app/settings/privacy/PrivacySettingsForm.tsx`. Modified: `src/middleware.ts` (added `/settings/:path*`)
- [L2] Pusher broadcast wiring + checkins detail page. Modified: `src/app/api/checkins/route.ts` (Pusher trigger on POST), `src/app/api/checkins/feed/route.ts` (visibility filtering). Created: `src/app/api/checkins/[id]/route.ts` (GET detail), `src/app/checkins/[id]/page.tsx` (detail page). Modified: `src/lib/pusher.ts` (added `triggerCheckinEvent`, `getCityCheckinChannel`)
- [M1] "Join me" wiring. Modified: `src/components/checkins/LiveActivityCard.tsx` (onJoinMe prop), `src/components/checkins/NearbyCrewList.tsx` (threads onJoinMe), `src/app/checkins/page.tsx` (client component with CreateMeetupModal). Modified: `src/components/meetups/CreateMeetupModal.tsx` (defaultVenue prop)
- [M2] Duration picker in CheckInButton. Modified: `src/components/checkins/CheckInButton.tsx` (30min/1h/2h/6h/12h options). Modified: `src/app/api/checkins/route.ts` (activeUntilMinutes in Zod schema)
- [M4] Split email.ts → email-crew.ts. Created: `src/lib/email-crew.ts`. Modified: `src/lib/email.ts` (now 507 lines)
- [M5] README fixed. Modified: `README.md` (connections→crew, metrics updated)
- [S1] types/checkin.ts created. Created: `src/types/checkin.ts`
- [S2] Stale docs updated. Modified: `docs/FUTURE_IMPLEMENTATION.md`, `docs/IMPLEMENTATION_STACK.md`
- [S3] SECURITY_AUDIT.md updated. Modified: `docs/SECURITY_AUDIT.md`
- [S4] Dead barrel removed + PRODUCTION_ROADMAP updated. Modified: `docs/PRODUCTION_ROADMAP.md` (deleted `src/components/discover/index.ts`)

### Wave 1 — Tests

- [L3] 28 tests in `src/__tests__/api/privacy-settings.test.ts` — privacy route auth, GET/PATCH behavior, Zod validation, visibility enum
- [M3] 16 tests in `src/__tests__/api/checkins-pusher.test.ts` — Pusher broadcast on POST, city channel trigger, visibility gating

### Phase 3.5 — Small Task Metrics (automated)

- `any` types: 0 | `console.*`: 0 | TODO: 0 | files >600 lines: 0 (email.ts 507 lines)
- Route count: 52 live routes | Test files: 70 | TS files: ~301

### Metrics

- Tests: ~964 → ~1008 (+44 new: 28 privacy-settings + 16 checkins-pusher)
- Test files: 68 → 70 (+2)
- API routes: 52 (unchanged — GET detail route replaces planned DELETE-only; POST privacy added)
- New pages: `/settings/privacy`, `/checkins/[id]`
- New components: `PrivacySettingsForm.tsx`
- New lib: `src/lib/email-crew.ts` (crew emails extracted from email.ts)
- New types: `src/types/checkin.ts`

### Phase 5 exit criteria — all met

- Check-in broadcasts to Crew feed within 5 seconds — ✅ (Pusher city-channel wired in POST /api/checkins)
- Feed queries filter expired check-ins via `activeUntil > now()` — ✅ (Session 1 + visibility filtering Session 2)
- Rows persist for attendance history — ✅
- Privacy controls enforced — ✅ (`/settings/privacy` page + `/api/users/privacy` route)
- "Join me" creates a valid meetup or attaches a user to an existing one — ✅ (wired to CreateMeetupModal)

---

## 🟡 Completed 2026-04-18 (Nightly Build — Phase 5 Session 1)

> **Original status note:** Phase 5 session 1 complete. Core check-in API routes (POST, GET feed, DELETE), `CheckInButton`, `LiveActivityCard`, `NearbyCrewList`, `/checkins` page, `CREW_CHECKED_IN_NEARBY` notification type, and city-channel Pusher helper shipped. Remaining items delivered in Session 2 (2026-04-20).
> **Test count:** 930 tests passing (48 test files)

---

## 🟡 Completed 2026-04-18 (Nightly Build — Phase 5 Session 1)

### Wave 2 — Features

- [L1] Created `src/app/api/checkins/route.ts` (POST + GET), `src/app/api/checkins/feed/route.ts`. Modified `prisma/schema.prisma` (added `CREW_CHECKED_IN_NEARBY` to `NotificationType` enum). Modified `src/middleware.ts` (added `/api/checkins/*` and `/checkins/*` to matcher).
- [L2] Created `src/app/api/checkins/[id]/route.ts` (DELETE). Created `src/components/checkins/CheckInButton.tsx`, `LiveActivityCard.tsx`, `index.ts`.
- [M1] Created `src/components/checkins/NearbyCrewList.tsx`, `src/app/checkins/page.tsx`.
- [M2] Meetup routes already had Sentry — no changes made.
- [M3] Created `src/lib/email-meetup.ts`, modified `src/lib/email.ts` (split meetup email helpers into dedicated module, 513 lines down from 619).
- [M4] Modified `src/app/api/cron/meetup-starting-soon/route.ts` (JSDoc + Sentry added).

### Wave 2 — Small Tasks

- [S1] Modified `src/lib/pusher.ts` (added `triggerCheckinEvent` + `getCityCheckinChannel` helpers).
- [S2] Created `src/types/checkin.ts` (`CheckInVisibility = PUBLIC | CREW | PRIVATE`).
- [S3] Modified `src/components/Navigation.tsx` (added Check-ins link with MapPin icon).
- [S4] Modified `README.md` (updated test count 841→888, routes 35→46, Phase 4 complete, Phase 5 active).

### Wave 3 — Shared files (this session)

- Fixed `NearbyCrewList.tsx` — uncommented `LiveActivityCard` import and replaced TODO div with `<LiveActivityCard checkIn={checkIn} />`.
- `src/__tests__/setup.ts` — all required `checkIn.*` mocks already present (`create`, `findMany`, `findUnique`, `delete`); `notification.createMany` already present. No changes needed.
- Updated `docs/API_STATUS.md` — Phase 5 session 1 note, 3 new checkin routes marked ✅ new, route count updated to 52.
- Updated `docs/CURRENT_SPRINT.md` (this entry).
- Updated `docs/CODEMAP.md` — date, route count, test count, new files.
- Updated `docs/LAUNCH_CHECKLIST.md` — Phase 5 progress noted.
- Updated `docs/REFACTOR_PLAN.md` — Phase 3 Part B marked complete, Phase 4 marked complete (all 3 sessions), Phase 5 session 1 progress noted.

### Metrics

- Tests: 930 (unchanged — test suites for check-in routes deferred to session 2)
- Test files: 48 (unchanged)
- API routes: 50 → 52 (+3 checkin routes: POST /api/checkins, GET /api/checkins/feed, DELETE /api/checkins/[id]; cron route was already counted)
- New components: `CheckInButton`, `LiveActivityCard`, `NearbyCrewList` (all in `src/components/checkins/`)
- New pages: `/checkins`
- New types: `src/types/checkin.ts`
- New lib: `src/lib/email-meetup.ts` (meetup email helpers split from email.ts)

### Remaining for Phase 5 Sessions 2–3

- Test suites for `/api/checkins` (POST, GET feed, DELETE)
- Privacy settings page (check-in visibility controls)
- Full "Join me" meetup-creation wiring (LiveActivityCard has CTA, creation flow deferred)
- Location permission flow (browser geolocation, progressive)
- CREW_CHECKED_IN_NEARBY notification dispatch wiring in the POST route
- Optional: per-check-in `activeUntil` override (min 30m, max 12h)

---

# 🟢 Complete — Phase 4: Meetups (All 3 sessions delivered)

> **Status:** Phase 4 complete. Session 3 shipped `MEETUP_STARTING_SOON` reminder cron (T-55–65min window, idempotent, every 5 min) + Google Places API integration for `/api/venues/search` (DB-first with Places fallback + auto-caching). Ready for Phase 5 (Check-ins & live presence).
> **Test count:** 930 tests passing (894 + 36 net new); 48 test files (+2 new: `venues-search-places.test.ts`, `cron-meetup-starting-soon.test.ts`)

---

## 🟢 Completed 2026-04-18 (Phase 4 Session 3 — cron reminders + Places API)

### Wave 1 — Features
- Created `src/app/api/cron/meetup-starting-soon/route.ts` (135 lines) — Bearer-secured cron. Queries `Meetup.findMany` where `scheduledAt` in `[now+55min, now+65min]` and `cancelled=false`. For each `GOING` attendee: idempotency-checks via `Notification.findFirst` (JSON path filter `data.meetupId`), creates notification, sends email, broadcasts via Pusher. Returns metrics: `meetupsProcessed`, `notificationsSent`, `emailsSent`, `broadcastsSent`, `skippedAlreadyNotified`.
- Modified `src/lib/email.ts` (+44 lines) — added `sendMeetupStartingSoonEmail` helper matching signature of sibling RSVP/invite emails. Gracefully degrades when `resend` unconfigured.
- Modified `vercel.json` — registered `/api/cron/meetup-starting-soon` with `*/5 * * * *` schedule + 60s `maxDuration`.
- Modified `src/app/api/venues/search/route.ts` (114 → 228 lines) — parallel DB + Google Places path. Triggers Places call when `GOOGLE_PLACES_API_KEY` set AND `q.length >= 3` AND DB has fewer than `limit` matches. Filters Places by `category` param, upserts new results via `findFirst({ source: 'google_places', externalId })` + `create()`, dedupes vs DB by `(name, city)` lowercase with DB winning, caps merged result at `limit`. Response shape unchanged.
- Modified `src/lib/api/places.ts` (114 → 212 lines) — added `inferVenueCategory`, `parseAddressLocale`, `buildPlacePhotoUrl`, `mapPlaceToVenue` helpers.

### Wave 2 — Tests
- Created `src/__tests__/api/venues-search-places.test.ts` (474 lines, 18 tests) — auth/validation (4), DB-only path w/ missing key / short q / full-DB short-circuit (4), Places API path w/ query shape / mapping / upsert / dedupe / category filter (8), graceful degradation (2).
- Created `src/__tests__/api/cron-meetup-starting-soon.test.ts` (477 lines, 18 tests) — auth (4), query shape (4), dispatch (5), idempotency (3), graceful degradation (2).

### Wave 3 — Shared files
- Modified `src/__tests__/setup.ts` — added `prisma.notification.findFirst: vi.fn()` mock (needed for idempotency tests).

### Metrics
- Tests: 894 → 930 (+36: 18 per new file)
- Test files: 46 → 48 (+2)
- API routes: 49 → 50 (+1: `/api/cron/meetup-starting-soon`)
- Env vars added to checklist: `GOOGLE_PLACES_API_KEY` (already in `.env.example`)

### Phase 4 complete — next: Phase 5 (Check-ins & live presence)

---

## 🟢 Completed 2026-04-18 (Phase 4 Session 2 — MeetupDetail + Pusher + email dispatch)

---

## 🟢 Completed 2026-04-18 (Phase 4 Session 2 — MeetupDetail + Pusher + email dispatch)

### Wave 1 — Features (UI + real-time + email wiring)
- Created `src/app/meetups/[id]/page.tsx` (377 lines) — MeetupDetail client page: fetches `/api/meetups/[id]`, renders host/venue/visibility/attendees, host-only "Invite Crew" + "Cancel Meetup" buttons, Pusher subscription on `meetup-${id}` channel (attendee:joined/left, meetup:updated/cancelled) with refetch-on-event, full loading/error/404/401 states, cancelled banner.
- Created `src/components/meetups/AttendeeList.tsx` (153 lines) — attendee grouping by GOING/MAYBE/DECLINED with count badges, host crown, checked-in indicator, empty state.
- Created `src/components/meetups/MeetupInviteModal.tsx` (335 lines) — Framer Motion modal matching `CreateMeetupModal` pattern; fetches `/api/crew?pageSize=100`, multi-select checkboxes (cap 20), submits to `/api/meetups/[id]/invite`, loading/empty/error states.
- Modified `src/lib/pusher.ts` — added `channels.meetup(id)`, `events.MEETUP_UPDATED`/`MEETUP_CANCELLED`/`ATTENDEE_JOINED`/`ATTENDEE_LEFT`, `broadcastToMeetup()` helper (defensive try/catch like `broadcastToTrip`).
- Modified `src/app/api/meetups/[id]/rsvp/route.ts` — wired `broadcastToMeetup` (attendee:joined on GOING, attendee:left on DECLINED), `broadcastToUser` to host inbox channel, `sendMeetupRSVPConfirmationEmail` on GOING (fire-and-forget). **Response shape changed** to `{ success, data, message }` / `{ success, error }` to match RSVPButton contract.
- Modified `src/app/api/meetups/[id]/invite/route.ts` — added `prisma.user.findMany` to fetch invitee emails, parallel `sendMeetupInviteEmail` dispatch via `Promise.allSettled`, `broadcastToMeetup` (meetup:updated) + per-user `broadcastToUser` (notification).
- Modified `src/app/api/meetups/[id]/route.ts` — PATCH broadcasts `meetup:updated` with updated payload; DELETE broadcasts `meetup:cancelled` with `{ meetupId }`.

### Wave 2 — Tests
- Updated `src/__tests__/api/meetups-rsvp-invite.test.ts` (360 → 462 lines; 18 → 22 tests) — new response shape assertions, local `vi.mock('@/lib/pusher')` + `vi.mock('@/lib/email')`, asserts `broadcastToMeetup`/`broadcastToUser` + `sendMeetupRSVPEmail`/`sendMeetupInviteEmail` fire on success paths, graceful-degradation tests when email throws, skip-email when user has no email.
- Updated `src/__tests__/api/meetups-id.test.ts` (existing → 409 lines; 14 → 16 tests) — PATCH asserts `meetup:updated` broadcast, DELETE asserts `meetup:cancelled`, plus guards: PATCH-403-no-broadcast + DELETE-404-no-broadcast.

### Wave 3 — Shared files
- Updated `src/components/meetups/index.ts` — barrel now re-exports `RSVPButton`, `CreateMeetupModal`, `VenuePicker`, `AttendeeList`, `MeetupInviteModal`.
- `src/__tests__/setup.ts` unchanged — Pusher/email mocks applied locally per test file.

### Metrics
- Tests: 888 → 894 passing (+6 net: +4 in rsvp-invite, +2 in meetups-id)
- Test files: 46 (same — extended existing)
- API routes: 49 (no new routes — existing routes extended with Pusher + email side-effects)
- New pages: `/meetups/[id]`
- New components: `AttendeeList`, `MeetupInviteModal`
- Pusher channel added: `meetup-{id}` with 4 events

### Remaining for Phase 4 Session 3
- `MEETUP_STARTING_SOON` notification cron (T-60min reminder to GOING attendees)
- Full Google Places API venue search wiring (currently DB-only via `/api/venues/search`)

---

## 🟢 Completed 2026-04-18 (Nightly Build — Phase 4 Session 1)

### Wave 2 — Features (Phase 4 core API + UI)
- [L1] Created `src/app/api/meetups/route.ts` — POST create + GET list (visibility-scoped to caller's Crew, city filter, pagination)
- [L2] Created `src/app/api/meetups/[id]/route.ts` — GET detail + PATCH edit (host only) + DELETE cancel
- [L3] Created `src/app/api/meetups/[id]/rsvp/route.ts` + `src/app/api/meetups/[id]/invite/route.ts` — RSVP (GOING/MAYBE/DECLINED) + Crew member invite
- [L4] Created `src/app/api/venues/search/route.ts` (DB venue search; Places API integration deferred) + `src/components/meetups/VenuePicker.tsx` + `src/types/meetup.ts`
- [M1] Created `src/components/meetups/MeetupCard.tsx` + `MeetupList.tsx` + `index.ts` + `src/app/meetups/page.tsx`
- [M2] Created `src/components/meetups/CreateMeetupModal.tsx` + `RSVPButton.tsx`
- [M3] Modified `src/lib/email.ts` — added `sendMeetupInviteEmail` + `sendMeetupRSVPConfirmationEmail`
- [S1] Modified `src/middleware.ts` — added `/meetups/*` and `/api/meetups/*`, `/api/venues/*` to auth matcher
- [S2] Created `src/app/meetups/new/page.tsx`

### Wave 1 — Tests
- [L5] Created `src/__tests__/api/meetups.test.ts` — 11 tests: POST/GET /api/meetups (auth, validation, create, list, visibility scoping)
- [M4] Created `src/__tests__/api/meetups-id.test.ts` — 14 tests: GET/PATCH/DELETE /api/meetups/[id] (auth, host-only edit, cancel)
- [M5] Created `src/__tests__/api/meetups-rsvp-invite.test.ts` — 18 tests: RSVP + invite routes

### Wave 3 — Shared Files
- Added `prisma.meetupInvite.createMany` mock to `src/__tests__/setup.ts`
- Updated `docs/API_STATUS.md`, `docs/CURRENT_SPRINT.md`, `docs/CODEMAP.md`, `docs/LAUNCH_CHECKLIST.md`, `docs/REFACTOR_PLAN.md`

### Metrics
- Tests: 845 → 888 passing (+43 new tests)
- Test files: 43 → 46 (+3 new: meetups.test.ts, meetups-id.test.ts, meetups-rsvp-invite.test.ts)
- API routes: 41 → 49 (+8: meetups POST/GET, [id] GET/PATCH/DELETE, rsvp, invite, venues/search)
- New components: MeetupCard, MeetupList, CreateMeetupModal, RSVPButton, VenuePicker
- New pages: /meetups, /meetups/new

### Remaining for Phase 4 Sessions 2–3
- Pusher real-time RSVP count updates + attendee presence
- `/meetups/[meetupId]` detail page (MeetupDetail component, AttendeeList, MeetupInviteModal)
- Full Google Places API venue search wiring (currently DB-only)
- `MEETUP_STARTING_SOON` + `ATTENDEE_RSVPED` notification email dispatch

---

# 🎯 Up Next (Phase 4 Session 2) — MeetupDetail page + Pusher

> **Status:** Phase 4 session 1 complete. Branch off `main` with `refactor/phase-4-meetups-api` (or split further by part).
>
> **Scope (3–4 sessions per REFACTOR_PLAN.md §Phase 4):**
> - API: `POST/GET /api/meetups`, `GET/PATCH/DELETE /api/meetups/[id]`, `POST /api/meetups/[id]/rsvp`, `POST /api/meetups/[id]/invite`
> - Venue search: `GET /api/venues/search` (reuses Places API + geocoding)
> - Pages: `/meetups`, `/meetups/new`, `/meetups/[meetupId]`
> - Components: `CreateMeetupModal`, `MeetupCard`, `MeetupDetail`, `RSVPButton`, `VenuePicker`, `AttendeeList`, `MeetupInviteModal`
> - Pusher real-time: RSVP count updates, attendee presence
> - Notifications: `MEETUP_INVITED`, `MEETUP_STARTING_SOON`, `ATTENDEE_RSVPED`
>
> **Foundation already in place:** Prisma models `Meetup`, `MeetupAttendee`, `MeetupInvite`, `Venue`, `City` + enums (`MeetupVisibility`, `AttendeeStatus`, `InviteStatus`, `VenueCategory`) all shipped in Phase 2. `src/types/social.ts` has `MeetupWithHost`, `MeetupWithAttendees`, `MeetupListItem`. `src/lib/validations/social.ts` has Zod schemas (may need Crew→`CREW` visibility alignment check). Notification enum already includes `MEETUP_INVITED`, `MEETUP_RSVP`, `MEETUP_STARTING_SOON`. `/meetups` nav link in Navigation.tsx is stubbed.
>
> **Key design decisions (already resolved, REFACTOR_PLAN §9):**
> - Default `Meetup.visibility` = `CREW` (Q3) — list queries must scope to caller's Crew unless visibility is `PUBLIC`.
> - RSVP statuses: `GOING | MAYBE | DECLINED`.
> - Meetup invites are separate from Crew requests (they go to a specific meetup, not a relationship).
>
> **Open questions to resolve during Phase 4:**
> - Q9: Paid Places API vs free-tier — how much venue data do we actually need at launch?
> - Capacity handling (block RSVP when full, or allow waitlist?)
> - Cancelled meetups — soft flag (`cancelled: true` column exists) vs hide from feeds?

---

## Phase 3 — Crew System (✅ Completed 2026-04-18)

> **Branch:** `refactor/phase-3-crew-api`
> **Status:** API + UI + tests landing. Phase 2 merged cleanly (PR #43); Neon DB live; branch-per-PR workflow now runs `prisma migrate deploy` + posts schema-diff on every PR.
> **Scope this PR (Part A):** Crew API routes, DB CHECK constraint migration, React UI components (`CrewButton`, `CrewRequestCard`, `CrewList`), `/crew` + `/crew/requests` pages, email templates, 32-test suite. Phase 4 (Meetups) begins next session.

### Delivered on `refactor/phase-3-crew-api`
- [x] **Migration:** `20260418120000_crew_check_constraint` adds `CHECK ("userAId" < "userBId")` on the `Crew` table (enforces the single-row bidirectional invariant at the DB layer — see REFACTOR_PLAN §3.5 / §9 Q2)
- [x] **Neon workflow:** uncommented `prisma migrate deploy` + schema-diff step in `.github/workflows/neon-pr-branch.yml` so every PR gets a Neon branch with migrations applied and a schema-diff comment posted
- [x] **API routes (6):** `POST /api/crew/request`, `GET /api/crew`, `GET /api/crew/requests`, `PATCH /api/crew/[id]`, `DELETE /api/crew/[id]`, `GET /api/crew/status/[userId]` — all Zod-validated, rate-limited (`apiRateLimiter`), Sentry-instrumented
- [x] **Notifications:** `CREW_REQUEST` fires on request (also on re-request of a previously DECLINED row); `CREW_ACCEPTED` fires on accept
- [x] **Email templates:** `sendCrewRequestEmail` + `sendCrewAcceptedEmail` in `src/lib/email.ts`, honor sender's `crewLabel` in subject/body copy
- [x] **UI components:** `CrewButton` (replaces legacy `FollowButton`, handles SELF/NOT_IN_CREW/PENDING/ACCEPTED/DECLINED/BLOCKED states with optimistic updates), `CrewRequestCard` (incoming + sent variants), `CrewList` (grid with remove action)
- [x] **Pages:** `/crew` (with pending-count badge linking to requests), `/crew/requests` (tabs for incoming vs sent) — both use tanstack react-query
- [x] **Tests:** `src/__tests__/api/crew.test.ts` — 32 tests covering auth, validation, ID-sort correctness, duplicate handling, notification + email side-effects, participant checks, accept/decline/block, delete, and status lookup
- [x] **Docs:** API_STATUS Phase 3 section flipped from planned → ✅; this file updated

### Phase 3 Part B delivered on `refactor/phase-3-crew-polish` (2026-04-18)
- [x] **New page `/profile/[userId]`** — renders public profile with avatar, bio, city, and an embedded `<CrewButton>` for logged-in viewers of someone else's profile. Pre-fetches `/api/crew/status/[userId]` to avoid a loading flicker on first paint. Self-view shows "Edit profile" instead.
- [x] **Legacy follow POST branch removed from `/api/users/[userId]`** — Crew requests now flow through `POST /api/crew/request`. GET response shape simplified: `isFollowing` and `publicTrips` dropped; `crewCount` and `crewLabel` added. PATCH now accepts `crewLabel` with regex validation (1–20 chars, alphanumeric + spaces).
- [x] **Middleware** — `/crew/:path*` added to the matcher so `/crew` and `/crew/requests` redirect unauthenticated users to sign-in, matching `/profile`.
- [x] **Tests:** `users-follow.test.ts` deleted; `users.test.ts` rewritten for the new GET + PATCH response shape (15 tests incl. crewLabel validation). All 845 tests pass.
- [x] **Playwright smoke** — `e2e/crew.spec.ts` asserts the auth boundary: `/crew`, `/crew/requests`, `/profile/[userId]` redirect unauthenticated; all 6 `/api/crew/*` routes return 401 unauthenticated. A full two-user end-to-end flow (signup → request → accept → visible in both crews) is deferred — it needs email verification bypass or DEMO_MODE auth, which is out of scope for this polish pass.

### Deferred to Phase 6 (feed + AI rescope)
- [ ] Retire the `Follow` Prisma model once the feed stops reading `prisma.follow.findMany` for `feedType='following'` (REFACTOR_PLAN §6)
- [ ] Drop `_count.followers` / `_count.following` from `/api/users/me` and `/api/search` once feed and profile surfaces no longer reference them

**Next: Phase 4 — Meetups core** (`POST /api/meetups`, RSVP, real-time attendance, meetup UI)

---

## Phase 2 — Crew Domain Models (Completed, merged 2026-04-17)

> **Branch:** `refactor/phase-2-crew-domain`
> **Status:** Nightly scaffolded under `Connection`; Phase 2 PR renames to `Crew` and adds `User.crewLabel` + `CheckIn.activeUntil`. Q2/Q3/Q4 all resolved 2026-04-17 (see REFACTOR_PLAN §9 Resolved Answers).
> **Naming:** System term = `Crew`. User-facing term defaults to "Crew" but personalizable via `User.crewLabel String? @db.VarChar(20)`. Owner's label wins cross-user. See REFACTOR_PLAN §3.5.

### Completed (nightly scaffold 2026-04-17)
- [x] prisma/schema.prisma: 10 new models + 8 enums added (scaffolded as `Connection`, Meetup, MeetupAttendee, MeetupInvite, Venue, City, CheckIn, Poll, PollResponse, Post)
- [x] prisma generate: Prisma Client v5.22.0 regenerated, TypeScript types available
- [x] src/types/social.ts: composite TypeScript interfaces (UserPreview, MeetupWithHost, CheckInWithVenue, etc.)
- [x] src/lib/validations/social.ts: Zod schemas for meetups, check-ins, polls, venues (Crew rename pending)
- [x] prisma/seed/generators/socialDomain.ts: seed data (NYC/LA cities, 3 venues, meetup, check-in)
- [x] setup.ts: mocks for all 10 new social models confirmed
- [x] middleware.ts: trip route matchers removed
- [x] src/app/page.tsx: social pivot landing copy
- [x] README.md: rewritten as social meetup network (841 tests, 35 routes)
- [x] Archive docs: CURRENT_SPRINT, UPGRADE_PLAN, FUTURE_IMPLEMENTATION snapshots added

### In progress on `refactor/phase-2-crew-domain` (PR landing 2026-04-17)
- [ ] **Rename `Connection` → `Crew`** across schema, types, validations, seed, setup.ts mocks, Navigation.tsx
- [ ] **Add `User.crewLabel String? @db.VarChar(20)`** (1–20 chars, alphanumeric + spaces)
- [ ] **Add `CheckIn.activeUntil DateTime`** with `@default(dbgenerated("now() + interval '6 hours'"))`
- [ ] **Add DB CHECK constraint** `CHECK (userAId < userBId)` on Crew table
- [ ] **Update Navigation.tsx**: `/connections` → `/crew`, `/saved` → `/meetups` (Phase 3 placeholders)
- [ ] DB migration (manual: `npx prisma migrate dev --name add_crew_domain` against Supabase)

### Open question resolutions (applied in Phase 2 PR)
- **Q2 ✅** Single-row bidirectional `Crew` with `userAId < userBId` + DB CHECK + `requestedById`
- **Q3 ✅** `Meetup.visibility` enum `PUBLIC | CREW | INVITE_ONLY | PRIVATE`, defaults to `CREW`
- **Q4 ✅** `CheckIn.activeUntil` two-tier retention: feed hides after window, row persists for history

**Next: Phase 3 — Crew system** (`POST /api/crew/request`, accept/decline, `CrewButton`/`CrewList` UI)

---

# 🎯 Current Sprint - Refactor Phase 1 — Archive trip planning

> **Last Updated:** 2026-04-17
> **Sprint Date:** 2026-04-16 (single-session refactor wave)
> **Sprint Goal:** Archive trip-planning surface to `_archive/` with zero runtime footprint — first executable step of the social-meetup pivot documented in `docs/REFACTOR_PLAN.md`.
> **Status:** ✅ Complete (pending Wave 3 validation + PR)

## Objective

Move every byte of trip-planning code out of the live surface into `_archive/` directories so the codebase is ready to grow a new social-meetup domain (Crew, Meetups, Venues, Check-ins) without interference. Preserve trip code for potential future reactivation rather than delete it.

## Actions completed today (Phase 1)

- [x] Created `_archive/` scaffolding: `src/_archive/`, `src/app/api/_archive/`, `src/app/_archive/`, `src/components/_archive/`, `src/services/_archive/`, `src/__tests__/_archive/`
- [x] Moved trip-domain API routes (13 routes: `/api/trips/*` + `/api/trips/[tripId]/**`) to `src/app/api/_archive/trips/`
- [x] Moved activity routes (`/api/activities/[activityId]`) to `src/app/api/_archive/activities/`
- [x] Moved trip AI routes (`/api/ai/generate-itinerary`, `/api/ai/suggest-activities`) to archive
- [x] Moved trip pages (`/trips/*`) to `src/app/_archive/trips/`
- [x] Moved trip components (`trips/`, `surveys/`, `voting/`) to `src/components/_archive/`
- [x] Moved services (`recommendation.service.ts`, `recommendation-data.ts`, `events.service.ts`) to `src/services/_archive/`
- [x] Moved trip tests to `src/__tests__/_archive/` (~17 test files); excluded from default Vitest run
- [x] Marked 16 Prisma models `@deprecated` (Trip, TripMember, TripInvitation, PendingInvitation, TripSurvey, SurveyResponse, VotingSession, Vote, Activity, SavedActivity, ActivityComment, ActivityRating, ItineraryDay, ItineraryItem, ExternalActivity, DestinationCache) — retained in schema for safe non-destructive posture
- [x] Kept retained models: User, Account, Session, VerificationToken, Follow, Notification, TripComment, TripLike (last two to be generalized into Post* in Phase 2+)
- [x] Snapshotted doc sections into `docs/archive/trip-planning/` (agent F)
- [x] Removed trip links from `Navigation.tsx`
- [x] Added `ENABLE_TRIP_PLANNING` env var stub to `.env.example`
- [x] Wrote `src/_archive/README.md` explaining preservation scheme
- [x] Tagged `v1.0-trip-planning` on pre-pivot commit for recovery
- [x] Updated live docs: CODEMAP, API_STATUS, LAUNCH_CHECKLIST, CURRENT_SPRINT, REFACTOR_PLAN (this pass)

## Live surface (post-archive)

- **API:** ~35 live routes (auth, beta, feed, users, profile, search, notifications, invitations, discover, inspiration, ai/chat, ai/recommend, ai/search, pusher/auth, geocoding, images/search, newsletter, cron, health)
- **Pages:** /, /auth/*, /profile, /feed, /discover, /inspiration, /notifications, /search, /settings, /onboarding, /privacy, /terms
- **Components:** accessibility, ai, auth, discover, feed, notifications, onboarding, profile, search, settings, social, ui + Navigation
- **Services:** survey.service.ts (repurpose-pending)
- **Tests:** ~46 live test files (Wave 3 confirms exact count)

## Next sprint: Refactor Phase 2 — New domain models

Per `docs/REFACTOR_PLAN.md` §5 Phase 2:
- Add Prisma models: `Crew`, `Meetup`, `MeetupAttendee`, `MeetupInvite`, `Venue`, `City`, `CheckIn`, `Poll`, `PollResponse`, `Post` (if diverging from feed)
- Write `npx prisma migrate dev --name add_crew_domain`
- Update `src/__tests__/setup.ts` mocks for every new model
- Regenerate Prisma client
- Extend seed script for dev data (cities, venues, sample Crew pairs)

## Key decisions carried into Phase 2 (resolved 2026-04-17)

- ✅ **Q2** Crew schema: single bidirectional row with `userAId < userBId` + DB CHECK + `requestedById`
- ✅ **Q3** Meetup visibility enum: `PUBLIC | CREW | INVITE_ONLY | PRIVATE`, default `CREW`
- ✅ **Q4** Check-in retention: two-tier `activeUntil` (default now+6h) — feed hides after window, row persists for history
- ⏳ **Q5** `Poll.type`: enum (`SURVEY | VOTE | RSVP_POLL`) or polymorphic? (deferred)

---

# [ARCHIVED] ✅ Previous Sprint - December 2025

> **Sprint Duration:** Dec 16 - Dec 29, 2025
> **Sprint Goal:** Fix critical bugs and complete core functionality for beta launch
> **Status:** ✅ Completed

---

## 📊 Sprint Overview

| Priority | Focus Area | Status |
|----------|-----------|--------|
| 🔴 P0 | Critical Bug Fixes | ✅ Day 1-2 Complete |
| 🔴 P0 | Security Hardening | ✅ Complete |
| 🔴 P0 | Database Migration | ✅ Complete (Dec 17) |
| 🟠 P1 | Core Feature Completion | ✅ Complete (Dec 17) |
| 🟠 P1 | Email Service Setup | ✅ Complete |
| 🟡 P2 | UI/UX Polish | ✅ Complete (Dec 17) |

---

## ✅ Completed This Sprint

### Security Hardening (All 4 Issues Fixed)
- [x] Redis-based rate limiting (`src/lib/rate-limit.ts`)
- [x] JWT callback optimization (only query on signIn/update)
- [x] Email removed from search (privacy fix)
- [x] Placeholder user creation fix (PendingInvitation model)

### Bug Fixes
- [x] Notifications data structure - verified working
- [x] TripComment + TripLike models added to schema and migrated
- [x] Comments API updated for trip support
- [x] Engagement API updated for trip support
- [x] TRIP_COMMENT and TRIP_LIKE notification types added
- [x] Add Activity Modal z-index visibility fix
- [x] Invitation acceptance flow auto-accept on signup
- [x] Likes persisting between sessions (server state sync)

### Core Features
- [x] Email service via Resend (`src/lib/email.ts`)
- [x] Geocoding with Nominatim (`src/lib/geocoding.ts`)
- [x] AddActivityModal component
- [x] AI chat connected to OpenAI (gpt-4o-mini, streaming)

### Known Remaining Issues Carried Forward
- OPENAI_API_KEY confirmed missing in Vercel production
- Email deliverability (goes to spam; domain not verified)
- Pusher env vars still missing

---

# [ARCHIVED] 🎯 Previous Sprint - March 2026

> **Sprint Duration:** Mar 9 - Mar 23, 2026
> **Sprint Goal:** Complete beta launch readiness and fix critical quality issues
> **Status:** 🟡 In Progress

---

## 📊 Sprint Overview

| Priority | Focus Area | Status |
|----------|-----------|--------|
| 🔴 P0 | Test Coverage (478+ tests passing) | 🔄 In Progress (expanding) |
| 🔴 P0 | Sentry / Error Monitoring Setup | 🔄 In Progress (needs Vercel DSN) |
| 🟠 P1 | `img` → `next/image` Migration | ✅ Complete (2026-03-09) |
| 🟠 P1 | `console.*` Cleanup (75 → 59 → 9 → 0) | ✅ Complete (2026-03-12) |
| 🟠 P1 | Zod Validation on Unguarded API Routes | ✅ Complete (2026-03-13) |
| 🟡 P2 | `any` Type Elimination (18 → 6 → 0) | ✅ Complete (2026-03-11) |
| 🟡 P2 | Password Reset API | ✅ Complete (2026-03-12) |
| 🟡 P2 | Password Reset UI Pages | ✅ Complete (2026-03-13) |
| 🟡 P2 | Error Boundary (global-error.tsx) | ✅ Complete (2026-03-13) |
| 🟡 P2 | 404 Page Improvements | ✅ Complete (2026-03-13) |
| 🟡 P2 | Playwright E2E Setup | ✅ Complete (2026-03-12) |

---

## 🔴 PRIORITY 0: Test Coverage

**Current State:** 478+ Vitest tests passing (trips, voting, survey, feed, auth, notifications, profile, reset-password, geocoding, email, rate-limit, invitations, AI routes, users/health, share, activities, beta/newsletter, trips-suggestions-flights, trips-members, trips-activities-itinerary, users-me, feed-comments-engagement) across 25 test files
**Target:** 500+ tests; then Playwright for E2E

### Tasks
- [x] Install and configure Vitest + Testing Library ✅ 2026-03-09
- [x] Write integration tests: trips API (30 tests) ✅ 2026-03-09
- [x] Write integration tests: voting API (10 tests) ✅ 2026-03-10
- [x] Write integration tests: survey API (11 tests) ✅ 2026-03-10
- [x] Write integration tests: feed API (12 tests) ✅ 2026-03-10
- [x] Write unit tests for `src/lib/` utilities (email, geocoding, invitations, rate-limit) ✅ 2026-03-11
- [x] Write API tests: auth/signup, notifications, profile ✅ 2026-03-11
- [x] Write API tests: password reset (POST + PATCH) ✅ 2026-03-12
- [x] Configure Playwright and write E2E smoke tests (smoke.spec.ts) ✅ 2026-03-12
- [ ] Install Playwright browsers: `npx playwright install chromium`

---

## 🔴 PRIORITY 0: Error Monitoring (Sentry)

**Current State:** `@sentry/nextjs` installed, config files created, DSN added to `.env.example`
**Risk:** Need real DSN from Sentry dashboard and Vercel env var.

### Tasks
- [x] Install `@sentry/nextjs` ✅ 2026-03-10
- [x] Configure `sentry.client.config.ts` and `sentry.server.config.ts` ✅ 2026-03-10
- [x] Add `SENTRY_DSN` to `.env.example` ✅ 2026-03-10
- [ ] Create Sentry project and obtain real DSN
- [ ] Add `SENTRY_DSN` to Vercel environment variables
- [ ] Verify error capture in production

---

## 🟠 PRIORITY 1: `img` → `next/image` Migration

**Current State:** ✅ COMPLETE — 0 `<img>` tags remain (was 18). All migrated to `<Image />`. (2026-03-09)

---

## 🟠 PRIORITY 1: `console.log` Cleanup

**Current State:** 75 → 59 (2026-03-10) → targeting ~20 (2026-03-11)
**Convention:** Use `logger` (pino) for all diagnostic output

### Tasks
- [x] Enumerate all console.* instances ✅ (75 found)
- [x] Remove/replace in AI API routes (generate-itinerary, recommend, search, suggest-activities) ✅ 2026-03-10
- [x] Remove/replace in service layer files ✅ 2026-03-10
- [x] Remove/replace in API routes (activities, discover, notifications, profile, users, etc.) ✅ 2026-03-11
- [x] Remove in page and component files ✅ 2026-03-11
- [x] Replace in lib files (places, ticketmaster, geocoding, rate-limit) ✅ 2026-03-11
- [ ] Confirm `npm run lint` passes

---

## 🟠 PRIORITY 1: Zod Validation on API Routes

**Current State:** Major API routes now have Zod validation
**Risk:** Malformed input can cause unexpected DB errors or silent failures

### Tasks
- [x] Audit all `POST` and `PATCH` API routes for missing Zod schemas ✅ 2026-03-14
- [x] Add Zod schemas for: `/api/trips`, `/api/trips/[tripId]`, `/api/feed/comments`, `/api/feed/engagement` ✅ 2026-03-13
- [x] Add Zod validation to `/api/search` GET route ✅ 2026-03-14
- [x] Return standardized 400 errors with Zod issue details on validation failure ✅
- [x] Write tests asserting validation rejects bad input ✅

---

## 🟡 PRIORITY 2: `any` Type Elimination

**Current State:** ✅ 0 `any` types (2026-03-11). Down from 18 (2026-03-08) → 7 (2026-03-10) → 0.
**Method:** Used `Prisma.InputJsonValue` for JSON fields; typed interfaces for client-side callbacks.

### Tasks
- [x] Run `tsc --noEmit` and collect all `any` warnings ✅ 2026-03-10
- [x] Fix voting/activities/members/invitations routes ✅ 2026-03-10
- [x] Fix survey/route.ts (3 `any` casts) ✅ 2026-03-11
- [x] Fix trips/[tripId]/route.ts (2 `any` casts) ✅ 2026-03-11
- [x] Fix auth/signup/page.tsx (1 `any` callback) ✅ 2026-03-11

---

## 📅 Sprint Plan

### Week 1 (Mar 9 - Mar 15, 2026)
- [ ] Sentry setup and verification
- [ ] Vitest + Testing Library installation and config
- [ ] First test suite: `src/lib/` utilities
- [ ] `console.log` → `logger` pass (all 30 instances)

### Week 2 (Mar 16 - Mar 23, 2026)
- [ ] `img` → `next/image` migration
- [ ] Zod validation on remaining unguarded routes
- [ ] API route integration tests
- [ ] `any` type elimination
- [ ] Playwright E2E smoke tests

---

## 🚫 Blocked / Waiting

| Item | Blocked By | Owner | Action Required |
|------|-----------|-------|-----------------|
| AI Chat (production) | OPENAI_API_KEY not set in Vercel | Config | Add key to Vercel → redeploy |
| Real-time features | Pusher env vars missing | Config | Add PUSHER_* vars to Vercel |
| Email deliverability | Resend domain not verified | Config | Verify domain or use onboarding@resend.dev |

---

## 📊 Sprint Metrics

| Metric | Target | Current | Previous |
|--------|--------|---------|---------|
| Test count | 500+ | 1156 (56 test files) | 1003 (53 files) |
| `any` types | 0 | 0 ✅ | 0 |
| `console.*` in prod code | 0 | 0 ✅ | 0 |
| TSC errors (test files) | 0 | 0 ✅ | 0 |
| Sentry configured | Yes | Infrastructure ready | Infrastructure ready |
| `<img>` warnings on build | 0 | 0 ✅ | 0 |
| Launch readiness | 85% | 78% | 75% |

---

*Updated: 2026-03-21*
---

## 🟢 Completed 2026-03-20 (Nightly Build)

- [L1] New test suite: /api/trips/[tripId]/suggestions (23 tests)
- [L2] New test suite: /api/trips/[tripId]/flights (26 tests)
- [L3] Implemented POST /api/trips/[tripId]/members handler
- [L4] Zod validation added to invitations routes
- [L5] Fixed TSC errors in ai.test.ts + users.test.ts
- [L6] Fixed TSC errors in trips.test.ts + feed.test.ts + reset-password.test.ts
- [M1] New test suite: trips/members GET/PATCH/DELETE (29 tests)
- [M2] Zod validation added to notifications routes
- [M3] Zod validation added to feed/comments + feed/engagement routes
- [M4] Zod validation added to pusher/auth + users/[userId] routes
- [M5] Zod validation added to discover/* + images/search routes
- [M6] Fixed Sentry onRouterTransitionStart in instrumentation-client.ts
- [Automated] 8 metrics tasks (any:0, console:0, TODO:0, files>600:0, tests:382, routes:47, test_files:22, TS_files:225)
**Tests: 382 total (+78 from tonight)**

*Updated: 2026-03-20*
---

## 🟢 Completed 2026-03-29 (Nightly Build)

### Wave 1 — Test Writers (77 tests added)
- [L1] Created ai-generate-itinerary.test.ts (31 tests for POST /api/ai/generate-itinerary — auth guard, 503 OpenAI guard, 429 rate-limit, validation, 404/403, successful generation, multi-day, customInstructions, no-budget, multi-member, JSON-in-prose, AI/DB failures)
- [L2] Created ai-suggest-activities.test.ts (25 tests for POST /api/ai/suggest-activities — pure AI generation route, no Prisma calls)
- [M1] Rate-limit mock audit: ai-chat.test.ts already had vi.mock('@/lib/rate-limit'); fixed 1 failing test (role='system' → role='tool' after L3 added 'system' to Zod role enum)
- [M2] Created discover-import.test.ts (21 tests for POST /api/discover/import — rate limiting, auth guard, prisma.externalActivity.upsert, OpenTripMap fetch)

### Wave 2 — Features & Hardening (0 new tests; intentional route changes)
- [L3] /api/ai/chat: Zod strengthened (system added to role enum, content length limits, message array max 50, tripContext limits, memberCount .int().positive()); req.json() wrapped in try-catch → 400
- [L4] /api/ai/recommend: getQuerySchema for GET params (tripId required, limit clamped 1-20 default 8); req.json() in POST wrapped in try-catch; silent error swallow in GET parse catch fixed
- [L5] /api/ai/suggest-activities: req.json() wrapped in try-catch → 400; body typed as unknown before safeParse
- [L6] /api/notifications/[notificationId]: Zod paramsSchema (z.string().cuid()) on PATCH and DELETE; req.json() wrapped in try-catch; bugfix — PATCH now uses parsed.data.read instead of hardcoded true
- [M3] /api/ai/generate-itinerary: req.json() wrapped in try-catch → 400 (auth/demo was already safe)
- [M4] JSDoc added to src/lib/geocoding.ts (searchDestinations, getDestinationCoordinates, searchDestinationsWithFallback, clearGeocodingCache, popularDestinations)
- [M5] README.md updated: footer date 2026-03-24 → 2026-03-29, tests 865+ → 1003+
- [M6] docs/N8N_BETA_NEWSLETTER_INTEGRATION.md + docs/N8N_DEPLOYMENT_CHECKLIST.md: deprecation notices added, Last Updated dates set to 2026-03-29

### Metrics
- Tests: 1003 → 1080 passing (77 new tests)
- Test files: 53 → 56
- Routes: 48 (unchanged)
- TS files: ~262
- any types: 0 | console.*: 0 | TODO: 0 | Files >600 lines (prod): 0

*Updated: 2026-03-29*
---

## 🟢 Completed 2026-03-25 (Nightly Build)

### Wave 1 — Test Writers (79 tests added)
- [L1] Created invitations-post.test.ts (18 tests for POST /api/trips/[tripId]/invitations)
- [L2] Created ai-get-methods.test.ts (16 tests for GET /api/ai/chat + GET /api/ai/recommend); TSC errors fixed (TS2345 double-cast on getModel return type)
- [M1] Created beta-extended.test.ts (21 tests for extended beta route coverage)
- [M2] Created users-follow.test.ts (24 tests for POST /api/users/[userId] follow/unfollow)

### Wave 2 — Features & Security (0 new tests, intentional changes)
- [L3] /api/trips/[tripId] GET: email stripped from unauthenticated public trip responses (security hardening)
- [L4] src/lib/sentry.ts created — centralized Sentry helpers (captureException, addBreadcrumb, setUser)
- [L5] src/components/feed/RichFeedItem.tsx: DOMPurify XSS protection added
- [L6] src/services/recommendation.service.ts: JSDoc added throughout
- [M3] src/app/api/auth/demo/route.ts: z.object({}).strict() replacing passthrough
- [M4] src/app/api/health/route.ts: NODE_ENV + npm_package_version removed (data minimization — response shape narrowed to {status, timestamp, database})
- [M5] JSDoc added to survey.service.ts, ai/prompts/budget.ts, ai/prompts/itinerary.ts, ai/prompts/recommendations.ts, lib/ai/embeddings.ts
- [M6] docs/PRODUCTION_ROADMAP.md, IMPLEMENTATION_STACK.md, FUTURE_IMPLEMENTATION.md updated from Dec 2024 → 2026-03-25

### Shared File Consolidation
- ai-get-methods.test.ts TSC errors fixed (TS2345: getModel returns LanguageModelV1 not string — double-cast applied)
- users.test.ts health route assertions updated to match new response shape ({database} vs {checks.database})
- API_STATUS.md updated: trips/[tripId] security note, health route shape change, sentry.ts noted, auth/demo strict validation
- CURRENT_SPRINT.md, CODEMAP.md, LAUNCH_CHECKLIST.md all updated to 2026-03-25

### Metrics
- Tests: 924 → 1003 passing (79 new tests)
- Test files: 49 → 53
- Routes: 48 (unchanged)
- TS files: ~263
- any types: 0 | console.*: 0 | TODO: 0 | Files >600 lines (prod): 0

*Updated: 2026-03-26*
---

## 🟢 Completed 2026-03-26 (Nightly Build)

### Wave 1 — Test Writers (153 new tests, 3 new test files)
- [L1] Created recommendation.service.test.ts (45 tests — SurveyService recommendation logic, analyze, dateAnalysis, locationPreferences, activityPreferences, createTripSurvey)
- [L2] Created survey.service.test.ts (36 tests — createTripSurvey expiry, closeSurvey, analyzeSurveyResponses, getUserPreferencesSurvey, getTripPlanningSurvey)
- [M1] Created geocoding-images.test.ts (32 tests — geocoding API + images/search routes)
- [M2] Extended inspiration.test.ts (+39 new tests for additional inspiration route coverage)

### Wave 2 — Features & Security (intentional changes)
- [L3] /api/newsletter/subscribe: auth now required (was unauthenticated — security improvement)
- [L4] /api/ai/search: semantic search GET + POST fully implemented (destinations branch added)
- [L5] Deleted src/components/notifications/NotificationCenter.tsx and src/components/feed/SharePreview.tsx (both confirmed unused dead code)
- [L6] /api/auth/signup, /api/auth/reset-password, /api/auth/verify-email: rate limiting added as first operation (before any DB queries)
- [M3+M4] JSDoc added to src/lib/utils/costs.ts; README updated to 1155+ tests
- [M5+M6] 5 docs refreshed: N8N docs + agent guides

### Shared File Consolidation
- survey.service.test.ts TSC errors fixed (lines 700, 712: `call.data.expiresAt` cast to `Date` — `string | Date` union requires explicit cast for `.getTime()`)
- setup.ts expanded: tripMember.updateMany added; follow model (create, delete, findUnique, findMany); surveyResponse model (create, findMany, findUnique, upsert)
- API_STATUS.md: ai/search marked complete; newsletter/subscribe auth noted; auth endpoints rate limiting noted
- CODEMAP.md, LAUNCH_CHECKLIST.md updated to 2026-03-26

### Metrics
- Tests: 1003 → 1156 passing (+153 new tests)
- Test files: 53 → 56
- Routes: 48 (unchanged)
- TS files: 263 (3 new test files, 2 component files deleted = net +1)
- any types: 0 | console.*: 0 | TODO: 0 | Files >600 lines (prod): 0

*Updated: 2026-03-26*
---

## 🟢 Completed 2026-03-24 (Nightly Build)

### Wave 1 — Test Writers (48 tests added)
- [L1] Created trips-itinerary.test.ts (21 tests for GET/PUT itinerary operations)
- [L2] Updated discover.test.ts (4 tests for auth guards + category filter on recommendations/import)
- [M1] Fixed trips-voting.test.ts TSC error + users.test.ts health route timeout
- [M2] Created auth-demo.test.ts (13 tests) + cron.test.ts (10 tests)

### Wave 2 — Features & Refactors (12 tests added)
- [L3] Itinerary route already had correct auth/error codes (no changes needed)
- [L4] discover/recommendations: auth guard + category filter; discover/import: rate limiting + auth guard
- [L5] AI LLM output validation already in place (no changes needed)
- [L6] discover/search: auth guard added; created discover-search.test.ts (12 tests)
- [M3] ai/chat Zod validation already in place
- [M4] README.md updated (fixed db:seed claim, updated counts)
- [M5] SECURITY_AUDIT.md, TEST_CASES.md, CODE_CHECKING_AGENT_GUIDE.md refreshed
- [M6] auth/demo: Zod input validation added

### Metrics
- Tests: 865 → 924 passing
- Test files: 45 → 49
- Routes: 48
- any types: 0 | console.*: 0 | TODO: 0 | Files >600 lines (prod): 0

*Updated: 2026-03-24*
---

## 🟢 Completed 2026-03-23 (Nightly Build)

### Wave 1 — Test Fixes & New Test Files (164 new tests, 4 new test files; total 910+ tests across 46 files)
- [L1] recommendation.service.test.ts — Fixed 9 TSC errors (joinedAt/budgetRange fields, TripMemberRole enum usage); all tests now passing
- [L2] reset-password.test.ts — Fixed timeout failures (root cause: missing vi.mock('@/lib/rate-limit')); ai.test.ts was already passing
- [L3] trips-voting.test.ts — 50 new tests for GET/POST/PUT /api/trips/[tripId]/voting with full voting session lifecycle
- [M1] trips-invitations.test.ts — 33 new tests for GET/POST /api/trips/[tripId]/invitations with edge cases
- [M2] pusher-feed-social.test.ts — 38 new tests for pusher/auth, feed/comments, feed/engagement, feed/share social routes
- [M6] trips-itinerary.test.ts — 43 new tests for GET/POST/PUT /api/trips/[tripId]/itinerary

### Wave 2 — Route Completion & Documentation
- [L4] /api/trips/[tripId]/itinerary — Added missing POST handler, fixed async params pattern, used $transaction for atomicity in PUT
- [L5] /api/ai/suggest-activities + /api/ai/generate-itinerary — Added isOpenAIConfigured() guard returning 503 when API key absent; prevents hangs
- [L6] JSDoc — Added @module headers and function-level docs to src/lib/auth.ts, logger.ts, prisma.ts, pusher.ts, sanitize.ts, api-config.ts, api-middleware.ts, providers.tsx, services/events.service.ts
- [M3] .env.example — Added 8 undocumented env vars: GOOGLE_CLIENT_ID/SECRET, ANTHROPIC_API_KEY, GOOGLE_PLACES_API_KEY, AMADEUS_API_KEY/SECRET, TICKETMASTER_API_KEY, LOG_LEVEL
- [M4] Dead export fix — Removed SharePreview/SocialShareCard from feed barrel; added auth guard + improved error handling to /api/discover/search
- [M5] /api/discover/recommendations + /api/discover/import — Added category filter, rate limiting, pino logging, typed helper functions, fixed empty catch blocks

### Shared File Consolidation
- setup.ts expanded: tripMember.count added; savedActivity gains findUnique/upsert/deleteMany/count; votingSession mock added (findMany, findUnique, create, update); vote mock added (upsert, groupBy)
- API_STATUS.md updated: 6 routes marked complete; completion rate updated to 88%
- CODEMAP.md: TS files updated to 250, test files to 46, 4 new test files added to test table
**Tests: 910+ total (+164 new tests from tonight); TSC errors: 0**

*Updated: 2026-03-23*
---

## 🟢 Completed 2026-03-22 (Nightly Build)

### Wave 1 — New Test Files (84 new tests, 7 new test files; total ~661 tests across 37 files)
- [L1] auth-signup.test.ts — 15 tests for POST /api/auth/signup
- [L2] trips-tripid.test.ts — 20 tests for GET/PATCH/DELETE /api/trips/[tripId]
- [L3] ai-chat.test.ts + ai-recommend.test.ts — 24 tests for /api/ai/chat and /api/ai/recommend
- [M1] trips-tripid-invitations.test.ts — 14 tests for GET/POST /api/trips/[tripId]/invitations
- [M2] trips-tripid-recommendations.test.ts — 11 tests for GET/POST /api/trips/[tripId]/recommendations

### Wave 2 — Features & Security Hardening
- [L4] Security: /api/beta/status response narrowed to {exists, passwordInitialized} (data minimization)
- [L5] Security: /api/auth/demo DEMO_MODE guard added (requires DEMO_MODE=true env var; hardcoded password removed)
- [L6] /api/inspiration: Zod coerce.number on query params + POST body schema added
- [M3] JSDoc added to 5 functions in src/lib/utils/costs.ts
- [M4] /api/notifications: Zod pagination params improved
- [M6] /api/cron: CRON_SECRET validation hardened

### Shared File Consolidation
- setup.ts expanded: verificationToken mock added, tripSurvey mock added, notification.createMany added
- TSC fixes: trips-tripid-invitations.test.ts (reason → error in InvitationResult mock); trips-tripid-recommendations.test.ts (double-cast for NotificationDelegate, generateRecommendations, applyRecommendation)
**Tests: ~661 total (+84 from tonight); TSC errors: 0**

*Updated: 2026-03-22*
---

## 🟢 Completed 2026-03-21 (Nightly Build)

- [L1] Added 12 POST /api/trips/[tripId]/members tests to trips-members.test.ts
- [L2] Created verify-email.test.ts (9 tests — GET /api/auth/verify-email token validation)
- [L3] Fixed TSC errors in beta-initialize-password.test.ts + invitations.test.ts
- [L4] Fixed TSC errors in trips-activities-itinerary.test.ts
- [L5] Fixed TSC errors in trips-suggestions-flights.test.ts, users-me.test.ts, feed-comments-engagement.test.ts
- [L6] Email verification sending wired into /api/auth/signup (creates VerificationToken + sends email)
- [M1] Created pusher-auth.test.ts (14 tests — POST /api/pusher/auth)
- [M2] IP rate limiting added to /api/beta/status (user enumeration risk mitigated)
- [M3] Zod validation added to /api/feed/route.ts (GET handler)
- [M4] Zod validation added to /api/geocoding/route.ts (GET handler)
- [M5] Zod validation added to /api/discover/route.ts POST handler
- [M6] JSDoc added to src/lib/api/unsplash.ts
**Tests: ~577 total (+35 from tonight); TSC errors: 0 (was 104 across test files)**

*Updated: 2026-03-21*
---

## 🟢 Completed 2026-03-19 (Nightly Build)

### Wave 1 — New Test Files (174 new tests: 304 → 478 total; 19 → 25 test files)
- L1: `trips-suggestions-flights.test.ts` — 20 tests (GET /api/trips/[tripId]/suggestions, /api/trips/[tripId]/flights)
- L2: `trips-members.test.ts` — 29 tests (GET/PATCH/DELETE /api/trips/[tripId]/members)
- L3: `trips-activities-itinerary.test.ts` — 37 tests (GET/POST /api/trips/[tripId]/activities, GET/PUT /api/trips/[tripId]/itinerary)
- M1: `users-me.test.ts` — 18 tests (GET/PATCH /api/users/me)
- M2: `feed-comments-engagement.test.ts` — 46 tests (GET/POST /api/feed/comments, POST /api/feed/engagement)
- M6: `invitations.test.ts` — 24 tests (GET /api/invitations, GET/POST /api/invitations/[invitationId])

### Wave 2 — Features & Fixes
- L4: `/api/beta/initialize-password` — added N8N_API_KEY authentication (account takeover vulnerability fixed)
- L5: `GET /api/auth/verify-email` — new email token verification endpoint created
- L6: Fixed 38 TSC errors in `ai.test.ts`, `feed.test.ts`, `reset-password.test.ts`, `trips.test.ts`, `users.test.ts` (mock data missing required Prisma fields)
- M3: `instrumentation-client.ts` — added `register()` export and `onRouterTransitionStart` Sentry export
- M4: JSDoc added to `lib/ai/client.ts`, `lib/pusher.ts`, `lib/logger.ts`, `lib/api/flights.ts`, `lib/api/ticketmaster.ts`, `lib/api/places.ts`
- M5: Created `src/components/trips/InviteMemberModal.tsx`; wired into `app/trips/[tripId]/page.tsx` and `components/trips/index.ts`

### Automated (Phase 3.5 — 8 small tasks)
- All metrics clean: 0 `any` types, 0 `console.*`, 0 files >600 lines, 0 TODOs flagged

### Setup.ts Expansion
- Added `findMany`, `findUnique`, `update`, `delete` to `prisma.tripMember`
- Added `aggregate` to `prisma.activityRating`
- Added full mock objects: `prisma.itineraryDay`, `prisma.itineraryItem`, `prisma.tripComment`, `prisma.tripLike`
- Added `findMany`, `findUnique`, `updateMany` to `prisma.tripInvitation`

*Updated: 2026-03-19*
---

## 🟢 Completed 2026-04-16 (Nightly Build)

### Wave 1 — New Test Files
- `feed-extended.test.ts` — 42 tests: pagination edge cases, empty following feed, multiple activity types, DB errors, feedType params, invalid query param validation, authenticated saved-activity flags, POST error paths
- `notifications-extended.test.ts` — 33 tests: notification lifecycle edge cases
- `health.test.ts` — 14 tests: GET /api/health — healthy path (200), degraded path (503), content-type, $queryRaw call count
- `trips-survey-voting-extended.test.ts` — 23 tests: survey + voting edge cases

### Wave 2 — Sentry Expansion (19/48 routes)
- Feed routes instrumented: `feed/route.ts`, `feed/comments/route.ts`, `feed/engagement/route.ts`, `feed/share/route.ts` (10 catch blocks)
- Notifications routes instrumented: `notifications/route.ts`, `notifications/[notificationId]/route.ts` (4 catch blocks)
- Trips routes instrumented: `trips/route.ts`, `trips/[tripId]/route.ts`, `trips/[tripId]/members/route.ts`, `trips/[tripId]/activities/route.ts`, `trips/[tripId]/itinerary/route.ts`, `trips/[tripId]/recommendations/route.ts`, `trips/[tripId]/invitations/route.ts`, `trips/[tripId]/voting/route.ts`, `trips/[tripId]/survey/route.ts` (21 catch blocks)
- Auth routes instrumented: `auth/signup/route.ts`, `auth/demo/route.ts`, `auth/reset-password/route.ts`, `auth/verify-email/route.ts` (5 catch blocks)

### Wave 2 — Code Quality
- JSDoc added to `sanitize.ts` (8 functions) and `survey.service.ts` (5 methods)
- Dead components deleted: `SignUpForm.tsx`, `CategoryFilter.tsx`, `DestinationCard.tsx`, `TrendingSection.tsx`, `TravelBadges.tsx`
- Barrel exports cleaned: `discover/index.ts`, `social/index.ts`

### Wave 3 — Shared Files
- `setup.ts` expanded: `aiLogger`, `dbLogger`, `createRequestLogger` logger stubs added; `follow.findFirst` mock added; `destinationCache` mock added; `$queryRaw` and `$transaction` mocks added
- TSC errors fixed in `health.test.ts` (removed unused req args, removed unused NextRequest import) and `feed-extended.test.ts` (ConstructorParameters cast for RequestInit signal incompatibility)
- `README.md` and `docs/PRODUCTION_ROADMAP.md` updated to 2026-04-16
- `docs/API_STATUS.md`, `docs/CURRENT_SPRINT.md`, `docs/CODEMAP.md`, `docs/LAUNCH_CHECKLIST.md` updated

### Metrics
- Tests: **1346 passing** (63 test files), 0 failing
- Sentry coverage: **19/48 routes**
- TSC: 0 errors
- Lint: 0 warnings/errors

*Updated: 2026-04-16*
---

## 🟢 Completed 2026-03-18 (Nightly Build)

- `auth/signup` Zod validation added (replaces manual regex validation)
- `beta/status` route: added logger import + Zod email query param validation
- New test files: `activities.test.ts` (15 tests), `beta.test.ts` (21 tests across beta/signup, beta/status, newsletter/subscribe)
- `setup.ts` expanded: user CRUD, notification CRUD, activity CRUD, activityRating/comment mocks added
- `API_STATUS.md` updated: added `/api/trips/[tripId]/suggestions` and `/api/trips/[tripId]/flights`
- `LAUNCH_CHECKLIST.md` dates corrected (Dec 2024 → Mar 2026), target updated to Q2 2026
- Agent guides updated: FRONTEND, PLANNING, SOCIAL_ENGAGEMENT all corrected to March 2026
- `CODEMAP.md` updated to reflect 2026-03-18 state

*Updated: 2026-03-18*
---

## 🟢 Completed 2026-03-14 (Nightly Build)

- `feed/share` API implemented (POST) with auth, Zod validation, visibility checks, owner notifications
- `recommendation.service.ts` split into service + `recommendation-data.ts` (568 → 407 lines)
- JSDoc added to all private/public methods in `RecommendationService`
- Password reset frontend UI pages created: `/auth/reset-password` + `/auth/reset-password/confirm`
- "Forgot password?" link added to sign-in page
- Zod validation added to `/api/search` GET route
- `ProfileStatsTab` extracted into `src/components/profile/ProfileStatsTab.tsx`
- Test suites added: `share.test.ts` (17 tests), `search.test.ts` (22 tests), `inspiration.test.ts` (20 tests)
- API_STATUS.md, LAUNCH_CHECKLIST.md, CURRENT_SPRINT.md updated to reflect 2026-03-14 state

*Updated: 2026-03-14*
