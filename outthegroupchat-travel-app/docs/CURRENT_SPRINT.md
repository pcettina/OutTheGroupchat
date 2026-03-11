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
| 🔴 P0 | Test Coverage (51 tests passing) | ✅ In Progress |
| 🔴 P0 | Sentry / Error Monitoring Setup | 🔄 In Progress |
| 🟠 P1 | `img` → `next/image` Migration | ✅ Complete (2026-03-09) |
| 🟠 P1 | `console.log` Cleanup (75 → ~50 target) | 🔄 In Progress |
| 🟠 P1 | Zod Validation on Unguarded API Routes | ✅ Complete (2026-03-09) |
| 🟡 P2 | `any` Type Elimination (18 → ~7 target) | 🔄 In Progress |

---

## 🔴 PRIORITY 0: Test Coverage

**Current State:** 51 Vitest tests passing (trips, voting, survey, feed)
**Target:** 80+ tests; then Playwright for E2E

### Tasks
- [x] Install and configure Vitest + Testing Library ✅ 2026-03-09
- [x] Write integration tests: trips API (30 tests) ✅ 2026-03-09
- [x] Write integration tests: voting API (10 tests) ✅ 2026-03-10
- [x] Write integration tests: survey API (11 tests) ✅ 2026-03-10
- [x] Write integration tests: feed API (10 tests) ✅ 2026-03-10
- [ ] Write unit tests for `src/lib/` utilities (email, geocoding, rate-limit)
- [ ] Install Playwright and write E2E smoke tests

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

**Current State:** 75 → targeting 50. Active cleanup in AI routes and components.
**Convention:** Use `logger` (pino) for all diagnostic output

### Tasks
- [x] Enumerate all console.* instances ✅ (75 found)
- [ ] Remove/replace in AI API routes (generate-itinerary, recommend, search, suggest-activities)
- [ ] Remove/replace in service layer files
- [ ] Remove/replace in component files
- [ ] Confirm `npm run lint` passes

---

## 🟠 PRIORITY 1: Zod Validation on API Routes

**Current State:** Several API routes accept request bodies without runtime validation
**Risk:** Malformed input can cause unexpected DB errors or silent failures

### Tasks
- [ ] Audit all `POST` and `PATCH` API routes for missing Zod schemas
- [ ] Add Zod schemas for: `/api/trips`, `/api/trips/[tripId]`, `/api/feed/comments`, `/api/feed/engagement`
- [ ] Return standardized 400 errors with Zod issue details on validation failure
- [ ] Write tests asserting validation rejects bad input

---

## 🟡 PRIORITY 2: `any` Type Elimination

**Current State:** ~12 `any` types across the codebase
**Target:** 0 `any` types (TypeScript strict mode)

### Tasks
- [ ] Run `tsc --noEmit` and collect all `any` warnings
- [ ] Replace each with proper interface or union type
- [ ] Pay special attention to Prisma result types and API response shapes

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

| Metric | Target | Current |
|--------|--------|---------|
| Test coverage | 30%+ | 0% |
| `any` types | 0 | ~12 |
| `console.log` in prod code | 0 | ~30 |
| Sentry configured | Yes | No |
| `<img>` warnings on build | 0 | Unknown |

---

*Updated: 2026-03-09*
