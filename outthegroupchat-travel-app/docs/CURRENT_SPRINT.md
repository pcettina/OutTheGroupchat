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
| 🔴 P0 | Test Coverage (currently 0%) | ⏳ Not Started |
| 🔴 P0 | Sentry / Error Monitoring Setup | ⏳ Not Started |
| 🟠 P1 | `img` → `next/image` Migration | ⏳ Not Started |
| 🟠 P1 | `console.log` Cleanup (~30 instances) | ⏳ Not Started |
| 🟠 P1 | Zod Validation on Unguarded API Routes | ⏳ Not Started |
| 🟡 P2 | `any` Type Elimination (~12 instances) | ⏳ Not Started |

---

## 🔴 PRIORITY 0: Test Coverage

**Current State:** 0% — no test runner configured
**Target:** Vitest for unit/integration, Playwright for E2E

### Tasks
- [ ] Install and configure Vitest + Testing Library
- [ ] Write unit tests for `src/lib/` utilities (email, geocoding, invitations, rate-limit)
- [ ] Write integration tests for critical API routes (trips CRUD, invitations, auth)
- [ ] Install Playwright and write E2E smoke tests (login, create trip, invite member)
- [ ] Add test scripts to `package.json` and CI pipeline

---

## 🔴 PRIORITY 0: Error Monitoring (Sentry)

**Current State:** No monitoring in production
**Risk:** Bugs in production are invisible until users report them

### Tasks
- [ ] Install `@sentry/nextjs`
- [ ] Create Sentry project and obtain DSN
- [ ] Configure `sentry.client.config.ts` and `sentry.server.config.ts`
- [ ] Add `SENTRY_DSN` to Vercel environment variables
- [ ] Verify error capture on a test throw in development

---

## 🟠 PRIORITY 1: `img` → `next/image` Migration

**Current State:** Raw `<img>` tags in use; Next.js warns on build
**Goal:** Replace all `<img>` with `next/image` `<Image>` for optimization and LCP improvements

### Tasks
- [ ] Audit all `.tsx` files for `<img>` usage
- [ ] Replace each instance with `<Image>` (set `width`, `height`, or `fill` + `sizes`)
- [ ] Verify no layout shift introduced (check responsive breakpoints)
- [ ] Confirm build passes with zero `<img>` warnings

---

## 🟠 PRIORITY 1: `console.log` Cleanup

**Current State:** ~30 `console.log` calls in production code
**Convention:** Use `logger` (pino) for all diagnostic output

### Tasks
- [ ] Run `grep -r "console.log" src/` to enumerate all instances
- [ ] Replace each with appropriate `logger.info`, `logger.warn`, or `logger.error`
- [ ] Remove debug-only logs that provide no operational value
- [ ] Confirm `npm run build` produces zero console.log lint warnings

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
