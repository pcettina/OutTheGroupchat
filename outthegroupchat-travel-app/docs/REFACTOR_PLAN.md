# OutTheGroupchat — Scope Pivot & Refactor Plan

> **Status:** Active — Phase 4 in progress (session 1 of ~3, 2026-04-18)
> **Created:** 2026-04-16 | **Last updated:** 2026-04-18
> **Purpose:** Canonical planning doc for the pivot from group-trip-planning app → meetup-focused social network with a persistent `Crew` graph. All future refactor sessions reference this document.
> **Decision:** Refactor in place (not rebuild). Trip-planning infrastructure is archived but preserved for potential future reactivation.

---

## 1. Executive Summary

### 1.1 Vision shift
| | Old vision | New vision |
|---|------------|------------|
| **Core loop** | Plan group trips collaboratively | Build a Crew → meet up in person |
| **Primary verb** | Plan | Meet |
| **Horizon** | Weeks/months ahead | Tonight, this weekend, this week |
| **Unit of engagement** | Multi-day trip itinerary | Single meetup at a venue |
| **Relationship model** | Trip membership (ephemeral) | Persistent Crew (mutual, bidirectional) |
| **Tagline** | "The easiest way to plan group trips" | **"The social media app that wants to get you off your phone"** |
| **Success metric** | Trips created & completed | Meetups confirmed & attended IRL |

### 1.2 Strategic decision: refactor, don't restart
Approximately **50–60% of the existing codebase is directly reusable** for the new vision. Critical infrastructure (auth, follows, notifications, feed, real-time, rate limiting, Sentry, security headers, CI, 1346 tests) stays. Only the domain layer (trips, itineraries, activities, surveys, voting) needs to change.

### 1.3 Stashing principle
Trip-planning is **archived, not deleted.** It lives on in `src/_archive/trips/`, `docs/archive/trip-planning/`, and marked-deprecated Prisma models. A feature flag `ENABLE_TRIP_PLANNING=false` keeps it dormant but revivable. This preserves optionality: if trip planning becomes a valuable sub-feature of the social network later (e.g., "plan a trip with your Crew"), the surface is intact and can be reactivated without archaeology.

---

## 2. Current State Baseline (2026-04-16)

### 2.1 What we have
- **Stack:** Next.js 14 App Router, TypeScript strict, Prisma + PostgreSQL (Supabase), NextAuth, Pusher, OpenAI (Vercel AI SDK), Upstash Redis, Resend, Tailwind, Framer Motion
- **Scale:** 48 API routes, 24 Prisma models, 63 test files, 1346 passing tests, 266 TS files
- **Health:** Build PASS, 0 lint, 0 TSC, 0 `any`, 0 `console.*`, 48/48 rate-limited, 9/10 security score
- **Launch readiness:** 78% (target 85% for beta)
- **Outstanding debt:** 14 unmerged nightly PRs (#26–#39) against main

### 2.2 Infrastructure that transfers as-is
| Layer | Reusable | Why |
|-------|----------|-----|
| Auth (NextAuth + email verification + password reset + demo mode) | 100% | Auth is auth |
| `User`, `Account`, `Session`, `VerificationToken` models | 100% | Identical |
| `Follow` model | Extends | Becomes `Crew` with status + bidirectional pairing |
| `Notification` model + system | 100% | Retarget notification types |
| Feed infra (`TripComment`, `TripLike`, feed routes) | Renames | Rename to `PostComment`/`PostLike`, reuse pipe |
| Pusher real-time | 100% | Perfect for RSVPs, presence, check-ins |
| Rate limiting (Upstash, 48/48 coverage) | 100% | Drop-in |
| Sentry infra (19 routes instrumented on branch) | 100% | Attach to new routes |
| Email (Resend) | 100% | Template content changes |
| Geocoding, `DestinationCache`, images/search, places API | 100% | Repurpose for city/venue data |
| Test infra (Vitest setup, mock patterns, CI, Playwright) | 100% | 1346 tests is a moat |
| Nightly build pipeline + Notion reporting | 100% | Keep automating |
| Security headers, CORS, CSP, DOMPurify | 100% | Platform-level |
| Profile pages, `FollowButton`, public profiles | 95% | Already LinkedIn-ish |

### 2.3 Domain that needs to change
| Layer | Fate |
|-------|------|
| `Trip`, `TripMember`, `TripInvitation`, `PendingInvitation` | **Archive** |
| `TripSurvey`, `SurveyResponse` | **Repurpose** as generic `Poll` |
| `VotingSession`, `Vote` | **Repurpose** — merge into `Poll` |
| `Activity`, `SavedActivity`, `ActivityComment`, `ActivityRating` | **Archive** |
| `ItineraryDay`, `ItineraryItem`, `ExternalActivity` | **Archive** |
| AI itinerary/activity generation routes | **Archive** (AI infra retained) |
| TripWizard, ItineraryTimeline, AddActivityModal, TripCard | **Archive** |
| Discover (destination-centric) | **Repurpose** — city + venue + people discovery |

---

## 3. Target State

### 3.1 Core user journey (new)
```
 Sign up / verify email
   ↓
 Profile setup: city, interests, bio, photo, crewLabel (optional)
   ↓
 Build your Crew (mutual, bidirectional — one click adds both sides)
   ├─ Import contacts / find by email
   ├─ Discover nearby / mutual crewmates
   └─ Accept / decline Crew requests
   ↓
 Daily loop:
   ┌──────────────────────────────────────────────┐
   │  "Who's out tonight?" feed                   │
   │  ──────────────────────────────────────────  │
   │  Post a meetup / check in somewhere          │
   │  See your Crew's check-ins + open meetups    │
   │  RSVP with one tap → live presence           │
   │  Get nudged: "Alex is 2 blocks away"         │
   └──────────────────────────────────────────────┘
   ↓
 IRL meetup happens (the point of the app)
   ↓
 Optional post: feed entry, photos, tag attendees
```

### 3.2 New domain primitives
| Model | Purpose | Replaces |
|-------|---------|----------|
| `Crew` | Single-row bidirectional relationship (userAId < userBId) with status (PENDING/ACCEPTED/DECLINED/BLOCKED) + `requestedById` + per-user display label via `User.crewLabel` | Extends `Follow` |
| `Meetup` | Single in-person gathering: host, venue, datetime, capacity, visibility (default `CREW`) | Replaces `Trip` |
| `MeetupAttendee` | RSVP record: status (going/maybe/declined), checked_in_at | Replaces `TripMember` |
| `MeetupInvite` | Explicit invite to a meetup (separate from Crew request) | Replaces `TripInvitation` |
| `Venue` | Place data: name, address, lat/lng, city, category, source | Replaces `Activity` (partial) |
| `City` | Geographic grouping for discovery | New |
| `CheckIn` | "I'm here right now" — user, venue, timestamp, visibility; `activeUntil` (default now+6h) hides from feed after window, row persists for history | New |
| `Poll` | Generalized survey/vote ("who's in?", "which venue?") | Merges `TripSurvey` + `VotingSession` |
| `PollResponse` | User's choice on a poll | Merges `SurveyResponse` + `Vote` |
| `Post` | Generalized feed entry (check-in, meetup recap, photo, text) | Generalizes `TripComment`/`TripLike` feed items |

### 3.3 Primitive mapping (old → new)
| Old model | New model | Migration note |
|-----------|-----------|----------------|
| `Follow` | `Crew` | Migration: collapse reciprocal Follow pairs into a single `Crew` row with `userAId < userBId`; status=`ACCEPTED` for mutual follows, otherwise `PENDING` with the follower as `requestedById`. Asymmetric follows (A→B, no B→A) become PENDING. `Follow` model itself is retained in schema for reference until Phase 6. |
| `Trip` | `Meetup` (partial) | **No auto-migration.** Trips archive intact; Meetups start fresh |
| `TripMember` | `MeetupAttendee` | Same — no data migration |
| `TripInvitation` | `MeetupInvite` | Same |
| `TripSurvey` + `SurveyResponse` | `Poll` + `PollResponse` (type=`SURVEY`) | Code-level refactor, schema fresh |
| `VotingSession` + `Vote` | `Poll` + `PollResponse` (type=`VOTE`) | Merge into unified poll engine |
| `Activity`, `ExternalActivity` | `Venue` | Venue is simpler; activity scheduling is out of scope |
| `ItineraryDay`, `ItineraryItem` | **Archived** | No equivalent — the app is now about single meetups |

### 3.4 API surface change — before / after
| Old routes (archive or retire) | New routes |
|--------------------------------|------------|
| `/api/trips/*` (13 routes) | `/api/meetups/*` (~6 routes) |
| `/api/trips/[tripId]/flights`, `/suggestions` | Removed (out of scope) |
| `/api/ai/generate-itinerary`, `/suggest-activities` | `/api/ai/suggest-meetups`, `/api/ai/icebreakers` |
| — | `/api/crew/*` (request, accept, decline, list) — 5 routes |
| — | `/api/checkins` |
| — | `/api/venues/*` (search, detail) |
| — | `/api/cities/*` (list, nearby) |
| `/api/discover/*` | Refocus on discovering **people + venues + meetups** (not destinations) |
| `/api/feed` | Refocus on check-ins, meetup activity (same route, new content types) |
| `/api/notifications` | Keep, retarget content types |

Projected route count after pivot: **~40 active routes** + 13 archived.

---

### 3.5 Naming decision — Crew (locked 2026-04-17)

The relationship entity is named **`Crew`**, not `Connection`. The nightly build on 2026-04-16 scaffolded the schema with `Connection`; this was reversed the next day.

**Why Crew over Connection.** "Connection" is LinkedIn-coded and fights the casual IRL tone the product is built around. "Crew" fits the core loop: it is activity-oriented ("who's in your crew tonight?"), group-coded without implying a fixed hierarchy, and works naturally as a verb form ("add to crew", "crew up"). It lands in UI copy without friction — "Squad request from Alex" or "Alex added you to their crew" read like how users already talk about their friend groups.

**System term vs user-facing term.** `Crew` is the canonical name in the Prisma model, API routes (`/api/crew/*`), enum values (`CREW` on `Meetup.visibility`), notification types (`CREW_REQUEST`, `CREW_ACCEPTED`), and email templates. User-facing copy defaults to "Crew" but each user can personalize their own label via `User.crewLabel String? @db.VarChar(20)` — 1–20 characters, alphanumeric + spaces (e.g., "Squad", "Homies", "The Inner Circle").

**Cross-user resolution rule.** The owner's label wins for their crew. When you view Alex's profile, you see Alex's crew labeled whatever Alex labeled it — "Alex's Squad" rather than "Alex's Crew." This keeps the personalization expressive without forcing every viewer into the owner's vocabulary inside their own UI (the user's personal nav still says "My Crew" or "My Squad" per their own `crewLabel`).

**Ripple into the product.** Enum values, route prefixes, notification types, email subject lines, push notification strings, analytics event names, and the Phase 3 UI components (`CrewRequestCard`, `CrewButton` replacing `FollowButton`, `CrewList`) all use `Crew`. Feature-flagged overrides for user-facing copy read from `crewLabel`; system-level strings stay as `Crew`.

---

## 4. Stashing Strategy — Preserving Trip Planning

### 4.1 Goals
- Keep trip-planning code **visible and browsable** in the repo (so future devs don't go archaeology-hunting in git history)
- Ensure **zero runtime impact**: archived code is never imported, never bundled, never rate-limits, never hits DB
- **Revivable in a weekend** if business case emerges
- Tests remain runnable on demand but excluded from default suite

### 4.2 Five-layer preservation

**Layer 1 — Git tag (cheap, permanent):**
```bash
git tag v1.0-trip-planning <commit-before-pivot-starts>
git push origin v1.0-trip-planning
```
Anchors the last "trip app" state. Recovery: `git checkout v1.0-trip-planning`.

**Layer 2 — Source code move:**
```
outthegroupchat-travel-app/src/
├── app/
│   ├── api/
│   │   ├── _archive/trips/        ← moved from app/api/trips/**
│   │   ├── _archive/activities/   ← moved from app/api/activities/**
│   │   └── ...                    (active routes stay in place)
│   ├── _archive/trips/            ← trip pages moved here
│   └── ...
├── components/
│   └── _archive/trips/            ← TripWizard, ItineraryTimeline, AddActivityModal, etc.
├── services/
│   └── _archive/events.service.ts ← if ticketmaster/places no longer needed
└── _archive/README.md             ← explains what's here and how to revive
```
Leading `_archive/` prefix is **tsconfig-excluded from the default `include` glob** so nothing in `_archive/` gets type-checked or bundled. Files are still grep-able and IDE-navigable.

**Layer 3 — Prisma deprecation:**
```prisma
/// @deprecated Archived 2026-04-XX during social pivot. Retained for potential future reactivation.
/// See docs/REFACTOR_PLAN.md §4 and docs/archive/trip-planning/ for context.
model Trip {
  // ... unchanged schema
}
```
Models stay in schema (so DB migrations don't drop columns), but a linter/CI check warns if new code references them. A follow-up PR can remove the tables in a proper `prisma migrate` step once reactivation is ruled out (recommend: 6+ months post-pivot minimum).

**Layer 4 — Tests relocation:**
```
src/__tests__/
├── _archive/                      ← trip test files moved here
│   ├── api/trips*.test.ts
│   ├── api/activities*.test.ts
│   └── services/recommendation.service.test.ts
```
`vitest.config.ts` excludes `src/__tests__/_archive/**` from the default run. A separate script `npm run test:archive` runs them on demand for reactivation validation.

**Layer 5 — Docs archive:**
```
docs/archive/trip-planning/
├── README.md            ← "This folder documents the trip-planning product that ran 2025-Q4 through 2026-04-16"
├── API_STATUS-trips.md  ← snapshot of old API_STATUS trip sections
├── PRODUCTION_ROADMAP-trips.md
└── UPGRADE_PLAN-trips.md
```

### 4.3 Feature flag (runtime safety net)
Environment variable `ENABLE_TRIP_PLANNING=false` (default). If ever set to `true`:
- `src/middleware.ts` unblocks `/trips/*` and `/api/trips/*` URL paths
- Archived routes would need to be moved back to non-`_archive` paths first (flag alone doesn't revive code that's been tsconfig-excluded — this is intentional)
- Flag exists as a signal, not a toggle. Real reactivation = real PR.

### 4.4 Reactivation criteria (future decision gates)
Before reactivating trip planning, a future session must confirm:
1. Product evidence: ≥X% of active users explicitly request multi-day trip coordination
2. Crew graph density is proven — trip planning is meaningful only if users have established social graph
3. Engineering bandwidth: the trip surface doesn't distract from the core meetup loop
4. Data migration path if needed (trips created under deprecated models may have different shape)

---

## 5. Phased Execution Plan

Each phase targets a discrete session (or a nightly build if small). Phases are **roughly sequential** but 3+4 and 5+6 can overlap if splitting work.

### Phase 0 — Merge backlog & baseline (1 session)
**Objective:** Start the pivot from clean, merged `main`.
**Actions:**
1. Review each of the 14 open nightly PRs (#26–#39). Decide per PR:
   - Merge if adds lasting value (most tests, Sentry, dead-component cleanup)
   - Close if superseded (older nightlies likely obsolete after later ones merge)
2. Squash-merge accepted PRs to `main` in dependency order (oldest first to minimize rebase pain)
3. Tag `git tag v1.0-trip-planning <merged-main-sha>`
4. Run full validation on merged main: build, lint, tests, prisma
5. Create working branch `refactor/social-pivot-baseline`

**Exit criteria:** `main` has 0 open nightly PRs, tag `v1.0-trip-planning` pushed, working branch created.

---

### Phase 1 — Archive & stash trip planning (1–2 sessions)

> ✅ **COMPLETE as of 2026-04-16 (PR #<TBD>)** — Wave 1 + Wave 2 executed in real-time session. See PR description for per-file audit.

**Objective:** Every byte of trip-planning code moved to `_archive/`, zero runtime footprint, everything still compiles.
**Actions:**
1. ✅ Create `src/_archive/` directory scaffolding
2. ✅ Move files (per §4.2 layer 2)
3. ✅ Move tests (per §4.2 layer 4), update `vitest.config.ts` exclude glob
4. ✅ Add Prisma `@deprecated` comments to trip-related models (per §4.2 layer 3)
5. ✅ Snapshot doc sections into `docs/archive/trip-planning/` (per §4.2 layer 5)
6. ✅ Remove trip links from `Navigation.tsx`
7. ✅ Delete trip routes from any middleware routing rules (replace with 404 response — or leave paths unhandled)
8. ✅ Add `ENABLE_TRIP_PLANNING` env var stub to `.env.example`
9. ✅ Update `docs/CODEMAP.md`, `docs/API_STATUS.md`, `docs/LAUNCH_CHECKLIST.md` to reflect archived surface
10. ✅ Write `src/_archive/README.md` explaining the preservation scheme

**Exit criteria:** `npm run build` passes, `npm test` passes (archive tests excluded), `npx tsc --noEmit` clean, no trip links visible in UI, no active routes under `/api/trips/*`.

**Risk:** Imports across layers — likely that `Notification` types reference `Trip` indirectly, or that `setup.ts` mocks include trip models that are now unused. Budget time to untangle.

---

### Phase 2 — New domain models & migrations (1–2 sessions)

> 🟡 **IN PROGRESS as of 2026-04-17** — branch `refactor/phase-2-crew-domain`. Schema renames (Connection→Crew), `User.crewLabel`, and `CheckIn.activeUntil` landing in PR.
>
> Prior state (nightly/2026-04-17): Schema ✅ | Generate ✅ | setup.ts mocks ✅ | src/types/social.ts ✅ | Seed generator ✅ | DB migration ⏳ (manual: `npx prisma migrate dev --name add_social_domain` against Supabase). Nightly used `Connection`; Phase 2 PR renames to `Crew`.

**Objective:** Prisma schema extended with new primitives; DB migrated; mocks in place.
**Actions:**
1. Add Prisma models: `Crew`, `Meetup`, `MeetupAttendee`, `MeetupInvite`, `Venue`, `City`, `CheckIn`, `Poll`, `PollResponse`, `Post` (if diverging from trip feed), indexes, constraints
2. **Rename `Connection` → `Crew` project-wide** (schema model, TypeScript types, Zod validation files, seed generators, setup.ts mocks, any references in documentation). The nightly build scaffolded under `Connection`; this PR is the rename pass.
3. **Add `User.crewLabel String? @db.VarChar(20)`** — optional per-user display label (1–20 chars, alphanumeric + spaces) for personalizing the term shown in that user's UI. Owner's label wins cross-user (see §3.5).
4. **Add `CheckIn.activeUntil DateTime`** with `@default(dbgenerated("now() + interval '6 hours'"))`. Feed/presence queries filter `WHERE activeUntil > now()`. Row persists indefinitely for attendance history; only visibility in the live feed is tied to the window.
5. Write migration: `npx prisma migrate dev --name add_crew_domain` (supersedes `add_social_domain` name; include SQL CHECK constraint `CHECK (userAId < userBId)` on `Crew` table)
6. Update `src/__tests__/setup.ts` with mocks for every new model (`crew` replaces `connection`)
7. Generate TypeScript types via `npx prisma generate`
8. Seed script for dev: sample cities, venues, crews (`prisma/seed/generators/socialDomain.ts` rename-aware)

**Exit criteria:** Migration applied locally + staging, types generated, `setup.ts` mocks added, seed runs successfully, no references to `Connection` remain in the live surface.

**Key schema decisions settled here (see §9 Resolved Answers):**
- Q2 ✅ `Crew` bidirectional: **single row with `userAId < userBId` + DB CHECK constraint**, `requestedById` tracks initiator
- Q3 ✅ Default `Meetup.visibility`: **`CREW`** (enum: `PUBLIC | CREW | INVITE_ONLY | PRIVATE`)
- Q4 ✅ `CheckIn` retention: **two-tier via `activeUntil`** — feed filters `WHERE activeUntil > now()` (default now+6h), row kept for history
- Q5 ⏳ `Poll.type` enum vs polymorphic — deferred

---

### Phase 3 — Crew system (2–3 sessions)

> ✅ **Part A COMPLETE 2026-04-18** (PR #46 merged) — API (6 routes), DB CHECK migration, `CrewButton`/`CrewRequestCard`/`CrewList`, `/crew` + `/crew/requests` pages, email templates, 32 passing tests.
>
> 🟡 **Part B IN PROGRESS 2026-04-18** — branch `refactor/phase-3-crew-polish`. `/profile/[userId]` page with CrewButton, legacy follow POST branch removed from `/api/users/[userId]`, `/crew/:path*` added to middleware matcher, Playwright smoke added. Full `Follow` model retirement deferred to Phase 6 (feed rescope).

**Objective:** Users can send, accept, decline Crew requests with first-class UX.
**Actions:**
1. API routes (Zod-validated, rate-limited, Sentry-instrumented):
   - `POST /api/crew/request` — send Crew request (creates `Crew` row with `userAId < userBId`, status=PENDING, `requestedById`=caller)
   - `PATCH /api/crew/[id]` — accept/decline/block
   - `DELETE /api/crew/[id]` — remove Crew (soft-deletes the row)
   - `GET /api/crew` — list accepted Crew members
   - `GET /api/crew/requests` — list pending (inbox + sent)
2. Pages: `/crew`, `/crew/requests`
3. Components: `CrewRequestCard`, `CrewButton` (replaces `FollowButton`), `CrewList`
4. Notification types: `CREW_REQUEST`, `CREW_ACCEPTED`
5. Email templates: Crew request notification (Resend) — default "Crew" term, optional per-user `crewLabel` substitution in user-facing strings
6. Tests: API (edge cases, auth, rate limit, CHECK constraint enforcement) + integration (accept flow)
7. Docs: add to API_STATUS, CODEMAP, CURRENT_SPRINT

**Exit criteria:** Two users on staging can send, accept, and see each other in their Crew list. Notification + email fire on request. DB CHECK constraint rejects direct inserts with `userAId >= userBId`.

---

### Phase 4 — Meetups core (3–4 sessions)

> 🟡 **IN PROGRESS — Session 1 of ~3 complete (2026-04-18, nightly/2026-04-18).** Core API routes + venue search + meetup UI pages + RSVP + invite complete. Pusher real-time, full notification email dispatch, and MeetupDetail page remain.

**Objective:** Users can create a meetup, invite Crew, RSVP, see real-time attendance.
**Actions:**
1. API routes:
   - ✅ `POST /api/meetups` — create (with venue, time, visibility — default `CREW`)
   - ✅ `GET /api/meetups` — list (filter by city, time range, visibility-scoped to caller's Crew)
   - ✅ `GET /api/meetups/[id]` — detail
   - ✅ `PATCH /api/meetups/[id]` — edit (host only)
   - ✅ `DELETE /api/meetups/[id]` — cancel
   - ✅ `POST /api/meetups/[id]/rsvp` — going/maybe/declined
   - ✅ `POST /api/meetups/[id]/invite` — invite Crew members
2. ✅ Venue search: `GET /api/venues/search` (DB search complete; Places API wiring deferred to session 2)
3. ✅ Pages: `/meetups`, `/meetups/new` | 🟡 `/meetups/[meetupId]` (MeetupDetail — session 2)
4. ✅ Components: `CreateMeetupModal`, `MeetupCard`, `MeetupList`, `RSVPButton`, `VenuePicker` | 🟡 `MeetupDetail`, `AttendeeList`, `MeetupInviteModal` (session 2)
5. 🟡 Pusher real-time: RSVP count updates, attendee presence (session 2–3)
6. 🟡 Notifications: `MEETUP_INVITED` ✅ (email stub added) | `MEETUP_STARTING_SOON`, `ATTENDEE_RSVPED` (session 2)
7. ✅ Tests: 43 tests across 3 new test files | ✅ Docs updated

**Exit criteria:** Host creates meetup (default visibility=`CREW`) → Crew members see it in feed → RSVP → live count updates → meetup detail page shows confirmed attendees. Visibility enum enforces `PUBLIC | CREW | INVITE_ONLY | PRIVATE`.

---

### Phase 5 — Check-ins & live presence (2–3 sessions)
**Objective:** The "who's out tonight" loop. Users broadcast they're somewhere; Crew sees it; one-tap "join me." Short `activeUntil` window prevents stalker vector (R5) while preserving history.
**Actions:**
1. API: `POST /api/checkins`, `GET /api/checkins/feed` (Crew's recent check-ins, filtered `WHERE activeUntil > now()`), `DELETE /api/checkins/[id]` (cancel)
2. Pusher channel per city for presence
3. Components: `CheckInButton`, `LiveActivityCard`, `NearbyCrewList`
4. Optional: location permission flow (browser geolocation API, progressive)
5. "Join me" CTA on check-in cards → creates impromptu meetup or joins existing
6. Notifications: `CREW_CHECKED_IN_NEARBY` (with privacy controls; only fires within `activeUntil` window)
7. Privacy settings page: who can see my check-ins (Crew / close Crew / public)
8. Optional feature: allow user to override default 6h `activeUntil` per check-in (min 30m, max 12h)

**Exit criteria:** Check-in broadcasts to Crew feed within 5 seconds. Feed queries filter expired check-ins via `activeUntil > now()`. Rows persist for attendance history (hidden from feed after window). Privacy controls enforced. "Join me" creates a valid meetup or attaches a user to an existing one.

---

### Phase 6 — Rescope feed, AI, notifications (2 sessions)
**Objective:** Retarget cross-cutting surfaces for the new vision.
**Actions:**
1. **Feed rescope:** remove trip-related feed item types, add `CREW_FORMED`, `MEETUP_CREATED`, `CHECK_IN_POSTED`, `MEETUP_ATTENDED`, `POST_CREATED`
2. **AI routes repurpose:**
   - `/api/ai/suggest-meetups` — given user's city, Crew, past check-ins, suggest meetup ideas
   - `/api/ai/icebreakers` — meeting a new Crew member for the first time, suggest conversation starters
   - Archive or rewrite: `/api/ai/chat` (retain as generic assistant), `/api/ai/recommend` (retarget to venues)
3. **Notification types:** finalize the new enum (`CREW_REQUEST`, `CREW_ACCEPTED`, `MEETUP_INVITED`, etc.), write migration to map or drop old types
4. **Search rescope:** people-first, then meetups, then venues; drop trip and activity search

**Exit criteria:** Feed shows only new content types. AI suggestions reference meetup + Crew context, not trip context. Search surfaces people first.

---

### Phase 7 — Marketing & brand surface (1 session)
**Objective:** External surfaces reflect the new product.
**Actions:**
1. New landing page (`src/app/page.tsx` or root route) with tagline and new illustrations
2. `/about` page explaining the "off your phone" ethos
3. `metadata.ts` OG tags + Twitter Card updates
4. README.md full rewrite — new value prop, new feature list
5. `CLAUDE.md` update — new project scope, remove trip-specific guidance
6. Email templates (Resend): rewrite signup, verification, reset for new tone
7. Favicon / logo refresh if desired

**Exit criteria:** Fresh visitor to the site understands the product as a meetup-centric social network within 10 seconds.

---

### Phase 8 — Launch-readiness re-audit (1 session)
**Objective:** Re-baseline the launch checklist against new scope.
**Actions:**
1. Rewrite `docs/LAUNCH_CHECKLIST.md` with meetup-centric milestones
2. Update `docs/PRODUCTION_ROADMAP.md` (target date, priorities, new risk register)
3. Security audit focused on new surfaces: location data handling, Crew-request abuse prevention, meetup spam, check-in stalking mitigation (Q4 `activeUntil` is first line of defense)
4. Rate-limit audit for new routes
5. E2E Playwright tests for new critical paths: signup → Crew request → meetup create → RSVP → check-in
6. Sentry coverage audit: target 100% on new routes (don't repeat the 0/48-on-main debt)

**Exit criteria:** Updated launch checklist reflects real readiness of the new product, not the archived one.

---

## 6. Re-scoped Launch Checklist (draft)

*Replaces trip-centric checklist in docs/LAUNCH_CHECKLIST.md during Phase 8.*

### Core loops
- [ ] Signup → email verification → profile complete (incl. optional `crewLabel`)
- [ ] Crew request → accept → both users see each other in `/crew`
- [ ] Meetup create (default visibility=`CREW`) → invite Crew member → RSVP → count updates real-time
- [ ] Check-in → Crew sees it in feed within 5s; expired check-ins (`activeUntil < now()`) no longer appear in feed
- [ ] Notifications fire for: Crew request, meetup invite, nearby check-in (within active window)

### Trust & safety (new, critical for social + location features)
- [ ] Block user / remove-from-Crew flow
- [ ] Report user / report meetup
- [ ] Privacy settings (check-in visibility, profile visibility, `activeUntil` override bounds)
- [ ] Location data retention policy + user control (`CheckIn` row persists; window is visibility not deletion)
- [ ] Age verification if legally required
- [ ] Meetup abuse prevention (rate limit meetup creation; flag high-frequency creators)
- [ ] Crew request rate limit per user (anti-spam)

### Performance (new requirements for social feed)
- [ ] Feed query < 200ms p95 (Crew graph fan-out)
- [ ] Pusher connection count budget per user
- [ ] City-channel sharding plan (presence scales with users-per-city, not total users)

### Platform (retained from old checklist)
- [ ] OPENAI_API_KEY in Vercel production (even more important now for icebreakers/suggestions)
- [ ] SENTRY_DSN in Vercel
- [ ] Pusher env vars in production
- [ ] Resend domain verified
- [ ] Rate limiting 100% coverage on new routes

---

## 7. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | Half-pivoted state: some trip surface leaks into UI after Phase 1 | High | Medium | Phase 1 exit criteria is strict: no trip links in Navigation, no `/trips/*` routes active. Smoke test in CI. |
| R2 | Prisma migration collision with DB in production | Medium | High | Run migration against staging first. Do NOT drop trip tables in Phase 2 — only add new tables. |
| R3 | Crew schema wrong on first try (bidirectional vs two rows) | ~~High~~ RESOLVED | Medium | Q2 resolved 2026-04-17: single-row `userAId < userBId` with DB CHECK constraint + `requestedById`. Migration includes SQL-level enforcement. |
| R4 | Archived tests rot and become un-revivable | Medium | Low | Quarterly `npm run test:archive` in CI. Remove if they fail for > 2 quarters. |
| R5 | Check-in feature becomes stalker vector | Low | Very High | **Q4 resolved 2026-04-17:** `activeUntil` (default now+6h) hides expired check-ins from feed/presence; Phase 5 must also ship with privacy controls. Do not launch check-ins without both. |
| R6 | AI suggestions lose context without trip model | Medium | Medium | Phase 6 rewrites prompts carefully. Budget 2–3 iterations of prompt tuning. |
| R7 | User confusion during migration if existing users had trips | Low (small user base) | Medium | Sunset email; one-time in-app notice; links to archived trip pages for personal reference (behind flag). |
| R8 | Pivot takes longer than estimated, morale drops | Medium | High | Phases are scoped to ≤1 week each. If a phase slips >2x, re-estimate rather than extend silently. |
| R9 | Nightly builds break during refactor because tests mass-move | High | Low | Pause or reconfigure nightly build during Phases 1–2. Resume after Phase 2 stabilizes. |
| R10 | Dependency on external APIs (Places, geocoding) increases for venues | Medium | Medium | Cache aggressively; retain `DestinationCache` pattern; consider a free tier first, paid API later. |

---

## 8. Success Metrics (how we know the pivot worked)

### Leading indicators (weeks 1–4)
- % of signed-up users who complete profile + add city within 24h
- % of users who send ≥1 Crew request in first week
- Crew acceptance rate (target: >60%)
- Meetup creation rate per user-with-Crew per week
- RSVP conversion rate per meetup invite

### Core indicators (weeks 4–12)
- **Confirmed-to-IRL ratio:** % of RSVPs that result in a check-in at the venue within the meetup time window (the true north metric for the tagline)
- Check-ins per active user per week
- Crew graph density (avg Crew members per user)
- Push notification → app open rate

### Anti-metrics (we want these to stay LOW)
- Time spent in app per session (counterintuitive — the tagline demands brevity)
- Scroll depth on feed
- Notifications dismissed without action

### Technical health (retain existing bar)
- Test count does not regress below current count post-archive
- Sentry coverage maintained above 80% on active routes
- p95 API latency < 300ms
- 0 security score regressions

---

## 9. Open Questions (need decisions before / during execution)

| # | Question | When needed | Owner |
|---|----------|-------------|-------|
| Q1 | Do we preserve existing user trip data (user-facing link to read-only archive), or do a clean slate? | Phase 1 | Product |
| Q2 | `Crew` one-row-bidirectional vs two-rows-per-direction? | Phase 2 | RESOLVED 2026-04-17 |
| Q3 | Default meetup visibility: PUBLIC, CREW, or INVITE_ONLY? | Phase 4 | RESOLVED 2026-04-17 |
| Q4 | Check-in retention: short TTL vs historical record? | Phase 5 | RESOLVED 2026-04-17 |
| Q5 | Do we drop `Trip*` tables in DB now or wait 6+ months? | Phase 2 / Deferred | Engineering |
| Q6 | Rebrand visual identity (logo, colors) or keep current emerald/teal? | Phase 7 | Product |
| Q7 | Geographic scope at launch — single city, single country, global? | Phase 8 | Product |
| Q8 | Monetization model alignment with new vision (previously TBD under trip app) | Post-launch | Business |
| Q9 | Paid Places API vs free-tier — how much venue data do we actually need? | Phase 4 | Engineering |
| Q10 | Age minimum for signup (impacts location/privacy/legal posture) | Phase 8 | Legal |

### Resolved Answers

**Q2 — Crew is a single-row bidirectional relationship (resolved 2026-04-17).**
One row per user pair with the `userAId < userBId` convention (lexicographic ordering of the two user IDs), plus a `requestedById String` field to track who initiated the request. A SQL-level CHECK constraint `CHECK (userAId < userBId)` is included in the migration to enforce invariant at the DB layer. Rationale: single-row design halves row count, eliminates sync bugs when status changes (no need to update two mirrored rows), and gives one source of truth for the relationship state. Queries for "crew of user X" filter `WHERE userAId = X OR userBId = X`.

**Q3 — Default meetup visibility is `CREW` (resolved 2026-04-17).**
The `Meetup.visibility` enum is `PUBLIC | CREW | INVITE_ONLY | PRIVATE`. New meetups default to `CREW`. Rationale: launch-phase safety beats reach. `PUBLIC` (city-wide feed) is an opt-in choice, not the default — users should consciously choose to broadcast to strangers. `CREW` matches the trusted-friends mental model the rest of the product is built around. `INVITE_ONLY` covers small gatherings where even Crew shouldn't see the whole list. `PRIVATE` is for drafts the host is still working on.

**Q4 — Check-in retention uses two-tier `activeUntil` (resolved 2026-04-17).**
New `CheckIn.activeUntil DateTime` field with DB default `now() + interval '6 hours'` (via `@default(dbgenerated(...))`). Feed and presence queries filter `WHERE activeUntil > now()`, so expired check-ins drop out of the live loop. The row itself is never auto-deleted — it persists for attendance history, personal stats, and meetup retrospectives. Rationale: a short active window is the first line of defense against R5 (stalker vector) because it bounds how long location broadcasts are visible, while full-row retention keeps "how often did Alex actually make it to things" answerable for product analytics and for the user's own check-in log. Users may optionally override the default per check-in (bounds TBD in Phase 5, likely 30m–12h).

---

## 10. Session-by-session cadence (suggested)

| Session | Phase | Scope | Est. duration |
|---------|-------|-------|--------------|
| S1 | Phase 0 | Merge backlog, tag, baseline | 1 session |
| S2 | Phase 1 (part A) | Archive code layer | 1 session |
| S3 | Phase 1 (part B) | Archive tests + docs, navigation cleanup | 1 session |
| S4 | Phase 2 | Prisma schema + migration + mocks | 1 session |
| S5 | Phase 3 (part A) | Crew API + tests | 1 session |
| S6 | Phase 3 (part B) | Crew UI + email + notifications | 1 session |
| S7 | Phase 4 (part A) | Meetup API + venue search | 1 session |
| S8 | Phase 4 (part B) | Meetup UI + RSVP | 1 session |
| S9 | Phase 4 (part C) | Pusher real-time attendance | 1 session |
| S10 | Phase 5 (part A) | Check-in API + privacy | 1 session |
| S11 | Phase 5 (part B) | Check-in UI + "join me" flow | 1 session |
| S12 | Phase 6 | Feed + AI + notifications rescope | 1 session |
| S13 | Phase 7 | Marketing surface + README | 1 session |
| S14 | Phase 8 | Launch-readiness audit | 1 session |

**Total: ~14 focused sessions** to go from current state to beta-ready under the new vision.

---

## 11. How to use this document

### In every refactor session
1. Open this doc first. Re-read the phase you're in.
2. Confirm prior phase exit criteria met before starting new phase.
3. Update **§9 Open Questions** with answers as you make decisions — this doc should become denser with truth, not staler.
4. If scope changes mid-session, **update this doc at end of session** before closing out. A stale plan is worse than no plan.

### Between sessions
- The nightly build pipeline **continues to run** but should be reconfigured to operate on the refactor branch during Phases 1–2. Resume standard nightly cadence on `main` after Phase 2.
- Each phase ends with a PR to `main`. Small phases = small PRs. No pivot-sized mega-PRs.

### When someone joins the project mid-pivot
- Read §1 (vision), §3 (target), §5 (current phase), §9 (open questions). That's the onramp.

---

## 12. Appendix — Inventory of what gets archived in Phase 1

### Source files to move to `src/_archive/` (estimated counts)
- `src/app/api/trips/**` — 13 route files
- `src/app/api/activities/**` — 1 route file (`activities/[activityId]/route.ts`)
- `src/app/trips/**` — ~6 page files
- `src/components/trips/**` — 9 components (TripCard, TripList, TripWizard, TripHeader, TripOverview, ItineraryTimeline, AddActivityModal, InviteMemberModal, InviteModal, MemberList)
- `src/components/surveys/**` — 4 components (retain structure, may repurpose for Poll UI)
- `src/components/voting/**` — 6 components (retain structure, may repurpose for Poll UI)
- `src/services/recommendation.service.ts`, `src/services/events.service.ts`, `src/services/recommendation-data.ts` — re-evaluate whether to archive or retain as venue suggestion service

### Test files to move to `src/__tests__/_archive/`
- All `trips-*.test.ts` files (~12 files)
- `activities-*.test.ts` (1 file)
- `survey.test.ts`, `voting.test.ts` — KEEP if repurposing to Poll (otherwise archive)
- `services/recommendation.service.test.ts`, `services/events.service.test.ts`
- Integration tests referencing trips: `trip-lifecycle-integration.test.ts`, `trip-collaboration-integration.test.ts`, `survey-voting-flow.test.ts`

### Prisma models to mark `@deprecated`
- `Trip`, `TripMember`, `TripInvitation`, `PendingInvitation`
- `TripSurvey`, `SurveyResponse`, `VotingSession`, `Vote` — OR migrate into `Poll`/`PollResponse` in Phase 2
- `Activity`, `SavedActivity`, `ActivityComment`, `ActivityRating`
- `ItineraryDay`, `ItineraryItem`, `ExternalActivity`
- `TripComment`, `TripLike` — likely generalize into `Post*` rather than archive

### Docs to snapshot into `docs/archive/trip-planning/`
- Trip sections of `API_STATUS.md`, `LAUNCH_CHECKLIST.md`, `PRODUCTION_ROADMAP.md`, `CURRENT_SPRINT.md`
- `docs/FUTURE_IMPLEMENTATION.md` if trip-centric
- `docs/IMPLEMENTATION_STACK.md` sections referring to trip features

---

*End of plan. Next action: Phase 0 — reconcile the 14 open nightly PRs, then cut the `v1.0-trip-planning` tag.*
