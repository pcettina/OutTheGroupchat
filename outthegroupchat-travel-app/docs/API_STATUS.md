# 📡 API & Integration Status

> **Last Updated: 2026-06-11** (nightly/2026-06-11: edge/security test depth + cleanup build — no route additions or removals (still **61 live routes**), no status changes. +49 edge/security tests added (check-in privacy/stalking-mitigation 22, meetup host/RSVP/invite authz 27) → 93 test files, 1863 tests. 7 unused imports removed; `any`-types confirmed 0 in live code. **Phase 8 action #5 (E2E authenticated flows) now PASSES 16/16 in a real Chromium browser** (signed-JWT cookie helper; production behavior was already correct — spec assertions corrected to match intentional middleware redirects). Doc fix: `/api/discover` base route (GET + POST flights) corrected to ARCHIVED — its only file is `src/app/api/_archive/discover/route.ts`; the live sub-routes `/api/discover/{search,recommendations,import}` are unaffected.)
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
> **Live API routes (post-V1):** 59 (excluding `_archive`)
>
> **Archival:** trip/activity routes moved to `src/app/api/_archive/` as of 2026-04-16 Phase 1. See REFACTOR_PLAN.md. Sections below that reference `/api/trips/*` and `/api/activities/*` reflect the pre-archive state for historical context; authoritative status for these routes is the "📦 Archived Routes" section near the bottom of this file.
>
> **Phase 5 COMPLETE (2026-04-20, nightly/2026-04-20 PR #53):** Privacy settings page, Pusher broadcast wiring, "Join me" CTA, duration picker, checkin detail route — all Phase 5 exit criteria met.
>
> **Phase 6 COMPLETE (2026-04-22, nightly/2026-04-22 PR #55):** Feed rescoped (meetup/checkin types, POST→410), search people-first (users→meetups→venues), notification type migration (9 old trip types removed from schema), AI routes (suggest-meetups + icebreakers). All 4 Phase 6 actions complete.
>
> **V1 Surface Sentry Expansion (2026-05-12, nightly/2026-05-13):** Sentry `captureException` added to /api/intents/* (4 files / 5 catch blocks), /api/subcrews/* (6 files / 7 catch blocks). /api/topics, /api/heatmap, /api/recommendations, /api/venues/search confirmed already instrumented. ~10 V1 routes newly instrumented.
>
> **Last Audit:** May 2026
> **Live API routes (post-archive):** 72 total (59 active + 13 archived). Active surface includes 35 base routes + 6 Crew + 9 Phase 4 meetup/venue/cron + 3 Phase 5 check-in + privacy + 14 V1 routes (intents/subcrews/topics/heatmap/recommendations/cron-expire-intents). Feed POST now returns 410.
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
| `/api/feed/comments` | GET | ✅ | ✅ | **Sentry added 2026-04-16** |
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
| `/api/search` | GET | ✅ | 🔶 | Email removed from select projection (privacy fix) ✅ 2026-03-20; **rescoped 2026-04-22 (Phase 6)** — people-first ordering (users→meetups→venues), Zod enum updated to `['all','people','meetups','venues']`, trip/activity search paths removed; **Zod enum re-tightened 2026-05-11** (M3 nightly/2026-05-12) — confirmed only the 4 canonical values, no legacy fallbacks |
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
| `/api/subcrews/[id]` | PATCH | ✅ | 🔶 | Update SubCrew (owner/member edits); **Sentry added 2026-05-12** |
| `/api/subcrews/[id]/join` | POST | ✅ | 🔶 | Join an emerging SubCrew; **Sentry added 2026-05-12** |
| `/api/subcrews/[id]/commit` | POST | ✅ | 🔶 | Commit to attend (locks heatmap contribution); **Sentry added 2026-05-12** |
| `/api/subcrews/[id]/members/me` | PATCH | ✅ | 🔶 | Update own membership status (leave/RSVP toggle); **Sentry added 2026-05-12** |

### V1 Misc APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/topics` | GET | ✅ | 🔶 | Topic taxonomy for intent creation; Sentry ✅ |
| `/api/heatmap` | GET | ✅ | 🔶 | Heatmap data (Crew/FoF tiers); Sentry ✅ — see PRs #86, #87 |
| `/api/recommendations` | GET | ✅ | 🔶 | Venue + meetup recommendations; Sentry ✅ |
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
| `/api/checkins/feed` | GET | ✅ | Crew's recent check-ins (`WHERE activeUntil > now()`), visibility-scoped; **integration tests added 2026-05-10 (14 tests)** |
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
| `/api/subcrews/[id]/join` | POST | ✅ | **yes — 2026-05-10** | Opt-in join |
| `/api/subcrews/[id]/commit` | POST | ✅ | **yes — 2026-05-10** | Commit attendance (writes heatmap contribution) |
| `/api/subcrews/[id]/members/me` | PATCH | ✅ | **yes — 2026-05-10** | Update own membership state |
| `/api/topics` | GET | ✅ | — | Discover topics; **Sentry captureException added 2026-05-10 (nightly)** |
| `/api/recommendations` | GET | ✅ | — | Venue/topic recommendations; **Sentry captureException added 2026-05-10 (nightly)** |
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

- **E2E authenticated flows (Phase 8 action #5):** `e2e/authenticated-flow.spec.ts` now **PASSES 16/16 in a real Chromium browser** (2026-06-11). Uses a signed NextAuth JWT cookie helper (`e2e/auth-helper.ts`) for authed-UI tests, and asserts the intentional middleware 307-redirects for gated API routes (`/api/meetups`, `/api/checkins/*`, `/api/notifications/*`). Production code unchanged — app behavior was already correct; spec assertions were corrected to match. `npm run test:e2e` to run.
- **Edge/security coverage (2026-06-11):** +49 tests — `src/__tests__/checkins-privacy-edge.test.ts` (22: `activeUntil` clamping, feed expiry gate, PUBLIC/CREW/PRIVATE visibility scoping, owner-only DELETE, 401s) and `src/__tests__/api/meetups-authz-edge.test.ts` (27: host-only PATCH/DELETE, RSVP capacity/duplicate, invite authz + fan-out cap, 401/400/403/404/409).

*Last Updated: 2026-06-11 (nightly/2026-06-11) — no route status changes; 61 live routes unchanged. `/api/discover` base route (GET + POST) corrected to ARCHIVED (only file is `src/app/api/_archive/discover/route.ts`); live sub-routes `/api/discover/{search,recommendations,import}` unaffected. +49 edge/security tests (check-in privacy 22, meetup authz 27) → 93 test files / 1863 tests. Phase 8 action #5 E2E authenticated flows now passing 16/16 in real Chromium.*

*Previous: 2026-06-08 (nightly/2026-06-09) — Sentry `captureException` added to discover/search, discover/recommendations, discover/import, images/search, invitations (route + [invitationId]), newsletter/subscribe, and the inspiration handler (`lib/inspiration/handlers.ts`); coverage now ~63/64 non-archive routes. No route status changes. Dead code removed: `src/components/feed/rich-item/` + `src/components/ui/ImagePicker.tsx`.*

*Previous: 2026-05-10 (nightly/2026-05-11) — Sentry instrumentation added to `/api/topics` and `/api/recommendations`; +74 integration tests covering `/api/intents/[id]` (PATCH/DELETE — 19), `/api/intents/mine` + `/api/intents/crew` (9 each), six `/api/subcrews/*` sub-routes (23), and `/api/checkins/feed` (14). Tested-route count moves to ~52/58. No new routes; README + PRODUCTION_ROADMAP refreshed.*

*Previous: 2026-03-26 - /api/ai/search GET+POST fully implemented (semantic search, destinations branch); /api/newsletter/subscribe now requires auth; /api/auth/signup, /api/auth/reset-password, /api/auth/verify-email: rate limiting now first operation; 153 new tests tonight (1156 total, 56 test files); dead components (NotificationCenter.tsx, SharePreview.tsx) removed; JSDoc added to costs.ts; README updated. Also includes 2026-03-29 changes: /api/ai/chat Zod strengthened + JSON.parse safety; /api/ai/recommend Zod GET params + JSON.parse safety; /api/ai/suggest-activities + generate-itinerary JSON.parse safety; /api/notifications/[notificationId] Zod params (cuid) + bugfix (read was hardcoded true); JSDoc added to src/lib/geocoding.ts; N8N docs deprecated*
