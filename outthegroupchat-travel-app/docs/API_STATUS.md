# 📡 API & Integration Status

> **Last Updated: 2026-04-18**
>
> **Archival:** trip/activity routes moved to `src/app/api/_archive/` as of 2026-04-16 Phase 1. See REFACTOR_PLAN.md. Sections below that reference `/api/trips/*` and `/api/activities/*` reflect the pre-archive state for historical context; authoritative status for these routes is the "📦 Archived Routes" section near the bottom of this file.
>
> **Phase 2 in progress (2026-04-17):** branch `refactor/phase-2-crew-domain` renames scaffolded `Connection` → `Crew`, adds `User.crewLabel`, adds `CheckIn.activeUntil`. Social-domain routes will live under `/api/crew/*` (not `/api/connections/*`). See REFACTOR_PLAN §3.5 for naming rationale.
>
> **Last Audit:** April 2026
> **Live API routes (post-archive):** 49 (35 base + 6 Crew + 8 new Phase 4 meetup/venue routes)
> **Archived API routes (Phase 1):** 13
> **Target:** 100% for Beta Launch (re-baselined in Phase 8)
> **Sentry Coverage:** 19/48 routes instrumented on pre-archive branch; coverage on new live surface re-computed after Phase 2

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
| `/api/invitations` | GET | ✅ | ⏳ | List all invitations for current user; auto-marks expired PENDING invitations (will be retargeted to Crew invites in Phase 3) |
| `/api/invitations/[invitationId]` | GET | ✅ | ⏳ | Get invitation details; retained — Phase 3 will rescope for Crew requests |
| `/api/invitations/[invitationId]` | POST | ✅ | ⏳ | Accept/decline invitation; retained — Phase 3 will rescope |

---

## 📰 Feed APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/feed` | GET | ✅ | ✅ | Main feed; Zod validation added 2026-03-21; **Sentry added 2026-04-16** |
| `/api/feed/comments` | GET | ✅ | ✅ | **Trip support added** ✅ Dec 17; **Sentry added 2026-04-16** |
| `/api/feed/comments` | POST | ✅ | ✅ | **Trip support added** ✅ Dec 17; **Sentry added 2026-04-16** |
| `/api/feed/engagement` | POST | ✅ | ✅ | **Trip support added** ✅ Dec 17; **Sentry added 2026-04-16** |
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

### Notification Issues to Fix
```
VERIFIED ✅ Dec 17:
Frontend correctly accesses: data?.data?.notifications
No fix needed - code was already correct
```

---

## 🔍 Discovery & Search APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/discover` | GET | ✅ | ⏳ | Search events/places/restaurants/attractions/nightlife by city + date range; type param filters results |
| `/api/discover` | POST | ✅ | ⏳ | Search flights via EventsService (origin, destination, departureDate, returnDate, adults); Zod validation added 2026-03-21 |
| `/api/discover/search` | GET | ✅ | 🔶 | Auth guard added 2026-03-24 (was unauthenticated — security improvement); rate limiting, Zod validation ✅ |
| `/api/discover/recommendations` | GET | ✅ | 🔶 | Auth guard added 2026-03-24; category filter, rate limiting, pino logging ✅ |
| `/api/discover/import` | POST | ✅ | ⏳ | Rate limiting + auth guard ✅ 2026-03-24; pino logging, typed helpers, fixed empty catch blocks |
| `/api/search` | GET | ✅ | 🔶 | Email removed from select projection (privacy fix) ✅ 2026-03-20 |
| `/api/geocoding` | GET | ✅ | 🔶 | Geocoding for destination search via Nominatim; Zod validation added 2026-03-21 |
| `/api/inspiration` | GET | ✅ | 🔶 | Auth guard added 2026-03-08; Zod coerce.number on query params + POST body schema added 2026-03-22 |
| `/api/images/search` | GET | ✅ | 🔶 | Image search via Unsplash API; requires UNSPLASH_ACCESS_KEY |

### Search Issues to Fix
```
COMPLETED ✅ 2026-03-20:
Email removed from select projection in /api/search/route.ts
```

---

## 🤖 AI APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/ai/chat` | POST | ✅ | ✅ | **OpenAI connected** ✅ Dec 17; retained (generic chat assistant, Phase 6 retarget) |
| `/api/ai/recommend` | POST | ✅ | ⏳ | Retained — Phase 6 will retarget to venues/meetups |
| `/api/ai/recommend` | GET | ✅ | ⏳ | Retained; trip-scoped `?tripId=` branch archived with trip routes |
| `/api/ai/search` | GET/POST | ✅ | ⏳ | Semantic search with embeddings — retained (destinations branch to be repurposed for venues/cities) |
| ~~`/api/ai/generate-itinerary`~~ | POST | 📦 | — | Archived 2026-04-16 — see Archived Routes |
| ~~`/api/ai/suggest-activities`~~ | POST | 📦 | — | Archived 2026-04-16 — see Archived Routes |

### AI Issues to Fix
```
COMPLETED ✅ Dec 17:
1. [x] Connect to OpenAI/Claude API
2. [x] Enable streaming responses
3. [x] Add proper rate limiting (Upstash Redis)
4. [x] Add trip context to prompts
```

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
| `/api/cron` | GET | ✅ | N/A | Background jobs; CRON_SECRET validation hardened 2026-03-22 |
| Sentry lib | N/A | ✅ | N/A | `src/lib/sentry.ts` created 2026-03-25 — centralized Sentry helpers (captureException, addBreadcrumb, setUser); **19/48 routes instrumented as of 2026-04-16** |
| `/api/health` | GET | ✅ | N/A | DB connectivity check, 503 on degraded ✅ 2026-03-10; response hardened 2026-03-25 (NODE_ENV + version removed for data minimization — returns {status, timestamp, database}) |
| `/api/users/me` | GET | ✅ | 🔶 | Get current authenticated user |
| `/api/users/me` | PATCH | ✅ | 🔶 | Update current user profile + preferences |

---

## 🎯 Invitation APIs (activities archived 2026-04-16)

> `/api/activities/[activityId]` (GET/POST/PUT) archived — see [📦 Archived Routes](#-archived-routes-phase-1).

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/invitations` | GET | ✅ | 🔶 | List user's pending invitations; Phase 3 will retarget for Crew requests |
| `/api/invitations/[invitationId]` | GET | ✅ | 🔶 | Get invitation detail |
| `/api/invitations/[invitationId]` | POST | ✅ | 🔶 | Respond to invitation (accept/decline) |

---

## 🚀 Beta & Newsletter APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/beta/signup` | POST | ✅ | ✅ | Beta waitlist signup |
| `/api/beta/status` | GET | ✅ | ✅ | Check beta access status; IP rate limiting added 2026-03-21; response narrowed to {exists, passwordInitialized} only (data minimization) ✅ 2026-03-22 |
| `/api/beta/initialize-password` | POST | ✅ | ✅ | Beta user password init — now protected with N8N_API_KEY auth ✅ 2026-03-19 (was unauthenticated — account takeover vulnerability fixed) |
| `/api/newsletter/subscribe` | POST | ✅ | ✅ | Newsletter subscription; auth now required 2026-03-26 |

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
ANTHROPIC_API_KEY=      # Alternative AI (optional)
PUSHER_APP_ID=          # Real-time
PUSHER_KEY=             # Real-time
PUSHER_SECRET=          # Real-time
PUSHER_CLUSTER=         # Real-time
NEXT_PUBLIC_PUSHER_KEY= # Real-time (client)
NEXT_PUBLIC_PUSHER_CLUSTER= # Real-time (client)

# Already Set ✅ Dec 17
OPENAI_API_KEY=         # For AI features ✅
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

### Phase 5 — Planned

| Endpoint | Method | Phase | Notes |
|----------|--------|-------|-------|
| `/api/checkins` | POST | 5 | Create check-in (`activeUntil` defaults to now+6h) |
| `/api/checkins/feed` | GET | 5 | Crew's recent check-ins (`WHERE activeUntil > now()`) |
| `/api/checkins/[id]` | DELETE | 5 | Cancel check-in |

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

*Last Updated: 2026-03-26 - /api/ai/search GET+POST fully implemented (semantic search, destinations branch); /api/newsletter/subscribe now requires auth; /api/auth/signup, /api/auth/reset-password, /api/auth/verify-email: rate limiting now first operation; 153 new tests tonight (1156 total, 56 test files); dead components (NotificationCenter.tsx, SharePreview.tsx) removed; JSDoc added to costs.ts; README updated. Also includes 2026-03-29 changes: /api/ai/chat Zod strengthened + JSON.parse safety; /api/ai/recommend Zod GET params + JSON.parse safety; /api/ai/suggest-activities + generate-itinerary JSON.parse safety; /api/notifications/[notificationId] Zod params (cuid) + bugfix (read was hardcoded true); JSDoc added to src/lib/geocoding.ts; N8N docs deprecated*
