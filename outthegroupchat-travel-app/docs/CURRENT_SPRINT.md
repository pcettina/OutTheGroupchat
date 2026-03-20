# ✅ Previous Sprint - December 2025

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

# 🎯 Current Sprint - March 2026

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
| Test count | 500+ | 478+ (25 test files) | 304 |
| `any` types | 0 | 0 ✅ | 7 |
| `console.*` in prod code | 0 | ~20 (est.) | 59 |
| Sentry configured | Yes | Infrastructure ready | No |
| `<img>` warnings on build | 0 | 0 ✅ | 0 |
| Launch readiness | 85% | 72% | 69% |

---

*Updated: 2026-03-19*
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

## 🟢 Completed 2026-03-18 (Nightly Build)

- `auth/signup` Zod validation added (replaces manual regex validation)
- `beta/status` route: added logger import + Zod email query param validation
- New test files: `activities.test.ts` (15 tests), `beta.test.ts` (21 tests across beta/signup, beta/status, newsletter/subscribe)
- `setup.ts` expanded: user CRUD, notification CRUD, activity CRUD, activityRating/comment mocks added
- `API_STATUS.md` updated: added `/api/trips/[tripId]/suggestions` and `/api/trips/[tripId]/flights`
- `LAUNCH_CHECKLIST.md` dates corrected (Dec 2024 → Mar 2026), target updated to Q2 2026
- Agent guides updated: FRONTEND, PLANNING, SOCIAL_ENGAGEMENT all corrected to March 2026
- `CODEMAP.md` updated to reflect 2026-03-18 state

*Updated: 2026-03-20*
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
