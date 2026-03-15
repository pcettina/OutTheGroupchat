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
| 🔴 P0 | Test Coverage (170+ tests passing) | 🔄 In Progress (expanding) |
| 🔴 P0 | Sentry / Error Monitoring Setup | 🔄 In Progress (needs Vercel DSN) |
| 🟠 P1 | `img` → `next/image` Migration | ✅ Complete (2026-03-09) |
| 🟠 P1 | `console.*` Cleanup (75 → 59 → 9 → 0) | ✅ Complete (2026-03-12) |
| 🟠 P1 | Zod Validation on Unguarded API Routes | 🔄 In Progress (major routes done) |
| 🟡 P2 | `any` Type Elimination (18 → 6 → 0) | ✅ Complete (2026-03-11) |
| 🟡 P2 | Password Reset API | ✅ Complete (2026-03-12) |
| 🟡 P2 | Playwright E2E Setup | ✅ Complete (2026-03-12) |

---

## 🔴 PRIORITY 0: Test Coverage

**Current State:** 51 Vitest tests passing (trips, voting, survey, feed)
**Target:** 80+ tests; then Playwright for E2E

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
| Test count | 80+ | 90+ (est. after 2026-03-11) | 63 |
| `any` types | 0 | 0 ✅ | 7 |
| `console.*` in prod code | 0 | ~20 (est.) | 59 |
| Sentry configured | Yes | Infrastructure ready | No |
| `<img>` warnings on build | 0 | 0 ✅ | 0 |
| Launch readiness | 85% | 72% | 69% |

---

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
