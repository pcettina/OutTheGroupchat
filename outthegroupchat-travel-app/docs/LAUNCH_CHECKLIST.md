# OutTheGroupchat — Launch Checklist (Meetup-Centric)

> **Last Updated: 2026-04-22**
> **Phase 8: Launch-readiness re-audit** — This checklist was fully rewritten during Phase 8 (2026-04-22) to reflect the meetup-centric social network product. The trip-era checklist has been superseded.
> **Target Launch:** Q2 2026 (Beta)
> **Overall Readiness: ~82%** (updated 2026-04-22, per PRODUCTION_ROADMAP.md v3.3)

## Pivot Progress (see docs/REFACTOR_PLAN.md)

- [x] Phase 0: PR backlog merged, `v1.0-trip-planning` tagged
- [x] Phase 1: Trip code archived to `src/_archive/`, tests excluded, Navigation cleaned
- [x] Phase 2: Schema + Crew rename + `crewLabel` + `activeUntil` + Neon migration applied (PR #43, #44, #45)
- [x] Phase 3: Crew system (6 routes + UI) — all Zod-validated, rate-limited, Sentry-instrumented, 32 tests (PR #46, #47)
- [x] Phase 4: Meetups core — All 3 sessions complete (2026-04-18): API routes, venue search (Places API), meetup UI, RSVP, invite, Pusher real-time, MEETUP_STARTING_SOON cron (PRs #48, #49, #51)
- [x] Phase 5: Check-ins + presence — COMPLETE 2026-04-20 (PR #53): POST/GET/DELETE check-in routes, CheckInButton (duration picker), LiveActivityCard ("Join me" wired), NearbyCrewList, /checkins page, /checkins/[id], privacy settings, Pusher city-channel broadcast
- [x] Phase 6: Feed/AI/notifications rescope — COMPLETE 2026-04-22 (PR #55): feed rescoped (meetup/checkin types), suggest-meetups + icebreakers AI routes, search people-first, 9 trip notification types removed
- [x] Phase 7: Marketing surface — COMPLETE 2026-04-22 (PR #56): /about page, OG metadata, README rewrite, CLAUDE.md updated, email-auth.ts extracted
- [~] Phase 8: Launch-readiness re-audit — ACTIVE 2026-04-22 (this nightly build)

---

## Core Loops

These are the critical user flows. All must work end-to-end before beta.

- [x] **Signup → email verification → profile complete** (incl. optional `crewLabel`)
  - [x] POST /api/auth/signup creates user + VerificationToken + sends email ✅
  - [x] GET /api/auth/verify-email validates token ✅
  - [x] Profile page shows city, bio, crewLabel fields ✅
- [x] **Crew request → accept → both users see each other in /crew**
  - [x] POST /api/crew/request creates Crew row (PENDING), fires CREW_REQUEST notification + email ✅
  - [x] PATCH /api/crew/[id] accept emits CREW_ACCEPTED notification + email ✅
  - [x] GET /api/crew lists accepted Crew members ✅
  - [x] CrewButton component reflects all states (SELF/NOT_IN_CREW/PENDING/ACCEPTED/DECLINED/BLOCKED) ✅
- [x] **Meetup create (default visibility=CREW) → invite Crew member → RSVP → count updates real-time**
  - [x] POST /api/meetups creates meetup, default visibility=CREW ✅
  - [x] POST /api/meetups/[id]/invite dispatches invite emails + MEETUP_INVITED notification ✅
  - [x] POST /api/meetups/[id]/rsvp emits attendee:joined/left via Pusher ✅
  - [x] MeetupDetail page subscribes to Pusher meetup channel, live-updates on events ✅
- [x] **Check-in → Crew sees it in feed within 5s; expired check-ins no longer appear**
  - [x] POST /api/checkins triggers Pusher city-channel broadcast ✅
  - [x] GET /api/checkins/feed filters WHERE activeUntil > now() ✅
  - [x] NearbyCrewList polls /api/checkins/feed every 60s + Pusher subscription ✅
- [x] **Notifications fire for: Crew request, meetup invite, nearby check-in**
  - [x] CREW_REQUEST notification dispatched on POST /api/crew/request ✅
  - [x] MEETUP_INVITED notification dispatched on POST /api/meetups/[id]/invite ✅
  - [x] CREW_CHECKED_IN_NEARBY notification bulk-dispatched to Crew on POST /api/checkins ✅

---

## Trust & Safety

Critical for social + location features. Most items require product decisions before engineering.

- [ ] **Block user / remove-from-Crew flow**
  - [x] PATCH /api/crew/[id] with action=block is implemented ✅
  - [ ] Block user UI — no frontend surface yet
  - [ ] Remove from Crew UI — no dedicated UI (API exists via DELETE /api/crew/[id])
- [ ] **Report user / report meetup**
  - [ ] POST /api/reports — not yet implemented
  - [ ] Report UI — not yet implemented
- [x] **Privacy settings (check-in visibility, profile visibility, activeUntil override bounds)**
  - [x] GET/PATCH /api/users/privacy — PUBLIC/CREW/PRIVATE visibility ✅
  - [x] /settings/privacy page + PrivacySettingsForm ✅
  - [x] activeUntilMinutes clamped to [30min, 12h] in POST /api/checkins ✅
- [ ] **Location data retention policy + user control**
  - [x] CheckIn.activeUntil hides from feed after window, row persists for history ✅
  - [ ] User-facing data deletion / export (GDPR/CCPA) — not yet implemented
- [ ] **Age verification** — not yet implemented (may not be legally required; Product decision needed)
- [ ] **Meetup abuse prevention**
  - [x] Rate limiting on POST /api/meetups via apiRateLimiter ✅
  - [ ] High-frequency creator flagging — not yet implemented
- [x] **Crew request rate limit per user (anti-spam)**
  - [x] apiRateLimiter applied to POST /api/crew/request ✅

---

## Performance

New requirements for social feed and real-time features.

- [ ] **Feed query < 200ms p95 (Crew graph fan-out)**
  - [ ] Benchmark /api/checkins/feed with 100+ Crew members — not yet measured
  - [ ] Benchmark /api/feed (meetup/checkin join) under load — not yet measured
- [ ] **Pusher connection count budget per user**
  - [ ] Document channel subscription pattern per page — not yet audited
  - [ ] Pusher env vars configured in Vercel production — BLOCKED (missing env vars)
- [ ] **City-channel sharding plan**
  - [x] City-channel pattern implemented: `city-checkins-{citySlug}` ✅
  - [ ] Sharding plan for high-density cities — not yet designed

---

## Platform (Infrastructure & Environment)

- [ ] **OPENAI_API_KEY in Vercel production** — BLOCKED (missing; icebreakers/suggestions will fail in prod)
- [ ] **SENTRY_DSN in Vercel production** — BLOCKED (missing; Sentry infra ready, needs real DSN)
- [ ] **Pusher env vars in production** — BLOCKED (PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER, NEXT_PUBLIC_PUSHER_KEY, NEXT_PUBLIC_PUSHER_CLUSTER all missing)
- [ ] **Resend domain verified** — BLOCKED (email goes to spam; onboarding@resend.dev is placeholder)
- [x] **Rate limiting coverage on all new routes** — all crew, meetup, checkin, and AI routes use `apiRateLimiter` ✅
- [x] **GOOGLE_PLACES_API_KEY** — documented in .env.example; optional fallback (DB-first venue search works without it) ✅
- [x] **Upstash Redis connected** (rate limiting, beta/status) ✅
- [x] **Neon PostgreSQL connected** (migrated from Supabase 2026-04-17) ✅
- [x] **Vercel deployment** — auto-deploy from main branch ✅
- [x] **SSL certificate** — Vercel automatic ✅

---

## Authentication & Security

- [x] Email/password signup ✅
- [x] Email/password signin ✅
- [x] Session management (NextAuth) ✅
- [x] Password reset flow (API + UI) ✅
- [x] Email verification on signup ✅
- [x] Rate limiting on auth endpoints (signup, reset-password, verify-email) — rate limit is first operation ✅
- [x] DEMO_MODE env guard on /api/auth/demo ✅
- [x] Input validation (Zod) on all API routes ✅
- [x] XSS prevention (DOMPurify) ✅
- [x] Security headers (CSP, HSTS, X-Frame-Options) ✅
- [x] CORS configured ✅
- [ ] NEXTAUTH_SECRET is strong (32+ chars) — verify in production
- [ ] Failed login attempt limiting — not yet implemented (rate limiter covers burst, not lockout)

---

## Testing & Quality

- [x] 1108 Vitest tests passing across 59 test files (2026-04-22) ✅
- [x] 0 TSC errors ✅
- [x] 0 lint warnings/errors ✅
- [x] 0 `any` types ✅
- [x] 0 `console.*` in production code ✅
- [x] 0 TODO/FIXME in production code ✅
- [x] 0 production files >600 lines ✅
- [x] Playwright E2E smoke tests (11 tests, 4 suites) ✅
- [x] Playwright E2E meetup+checkin tests (14 tests, e2e/meetup-checkin.spec.ts) ✅ 2026-04-22 Phase 8
- [x] GitHub Actions CI (build + lint + test + Prisma) ✅
- [x] Neon branch-per-PR workflow with prisma migrate deploy + schema-diff comment ✅
- [ ] E2E critical path: signup → Crew request → meetup create → RSVP → check-in (full user journey) — in progress
- [ ] Test coverage for /api/crew/* routes — 32 tests in crew.test.ts ✅; additional edge cases pending

---

## Monitoring & Observability

- [x] Sentry installed and configured (instrumentation-client.ts, instrumentation.ts) ✅
- [x] Sentry coverage on crew routes, checkins routes, AI routes confirmed ✅ 2026-04-22 Phase 8
- [ ] SENTRY_DSN configured in Vercel production — BLOCKED
- [ ] Source maps uploaded — BLOCKED (needs DSN)
- [x] Structured logging via pino ✅
- [ ] Log aggregation (Vercel log drain or external) — not yet configured
- [x] Vercel Analytics enabled ✅
- [ ] Core Web Vitals monitoring — not yet configured
- [ ] API response time tracking / p95 benchmarks — not yet measured
- [ ] Uptime monitoring — not yet configured

---

## UI/UX

- [x] Skeleton loaders on all data-fetching pages ✅
- [x] Loading spinners on actions ✅
- [x] Optimistic updates (CrewButton, RSVPButton) ✅
- [x] Empty states on feed, checkins, crew pages ✅
- [x] Friendly 404 page (not-found.tsx) ✅
- [x] Friendly 500 page (error.tsx) ✅
- [x] Global error boundary (global-error.tsx + Sentry) ✅
- [x] All pages tested on mobile ✅
- [x] Touch targets 44px minimum ✅
- [x] Accessibility skip links + ARIA patterns ✅
- [ ] Keyboard navigation tested end-to-end — not yet verified
- [ ] Screen reader tested — not yet verified

---

## Content & Legal

- [x] /privacy page ✅
- [x] /terms page ✅
- [x] /about page ✅ 2026-04-22 Phase 7
- [x] OG tags + Twitter Card metadata ✅ 2026-04-22 Phase 7
- [x] README rewritten for new product ✅ 2026-04-22 Phase 7
- [ ] Privacy Policy content — placeholder page exists; needs legal review
- [ ] Terms of Service content — placeholder page exists; needs legal review
- [ ] Favicon / brand assets updated — using legacy emerald theme

---

## Launch Day

### T-24 Hours
- [ ] Final production build verified clean (build + lint + test)
- [ ] All required environment variables set in Vercel (OPENAI_API_KEY, Pusher, Sentry, Resend)
- [ ] Database backup confirmed
- [ ] Monitoring dashboards accessible

### T-1 Hour
- [ ] Test all critical flows on production (signup, Crew request, meetup create, check-in)
- [ ] Confirm Sentry is capturing errors
- [ ] Confirm Pusher is connected in production
- [ ] Team on standby

### Launch
- [ ] Deploy final version
- [ ] Verify deployment successful
- [ ] Test signup flow on production
- [ ] Announce to beta users

### Post-Launch (First 24 Hours)
- [ ] Monitor error rates in Sentry
- [ ] Monitor Pusher connection counts
- [ ] Respond to user feedback
- [ ] Hot-fix critical issues if needed

---

## Key Blockers for Beta Launch

| Item | Blocked By | Action Required |
|------|-----------|-----------------|
| AI features (icebreakers, suggest-meetups) | OPENAI_API_KEY missing in Vercel | Add key to Vercel env vars |
| Real-time features (RSVP updates, checkin feed) | Pusher env vars missing in Vercel | Add PUSHER_* vars to Vercel |
| Error monitoring | SENTRY_DSN missing in Vercel | Create Sentry project, add DSN |
| Email deliverability | Resend domain not verified | Verify domain or use verified sender |

---

## Quick Commands

```bash
cd outthegroupchat-travel-app

# Dev
npm run dev

# Build & validate
npm run build
npm run lint
npx tsc --noEmit

# Tests
npm test                    # Vitest (all 59 test files)
npm run test:e2e            # Playwright E2E

# Database
npm run db:generate         # Regenerate Prisma client
npm run db:push             # Push schema to database
npm run db:studio           # Open Prisma Studio
```

---

*This checklist should be reviewed before each nightly build and before any release.*

*Last Updated: 2026-04-22 — Full rewrite for Phase 8 meetup-centric launch readiness. Previous trip-era checklist superseded.*
