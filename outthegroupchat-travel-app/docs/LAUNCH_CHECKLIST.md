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
- [~] Phase 8: Launch-readiness re-audit (IN PROGRESS — nightly/2026-05-11 advanced action #5 (E2E + integration coverage, +74 integration tests on V1 intent/subcrew/checkin surface) and action #6 (Sentry coverage — `/api/topics` + `/api/recommendations` instrumented 2026-05-10))

---

> **⚠️ Scope change (2026-04-16):** This checklist is now STALE against the new social-meetup product. It will be rewritten in Phase 8 of `docs/REFACTOR_PLAN.md`. Trip-era checklist items below remain visible for reference but should **NOT** be used to gate launch. Readiness scores below reflect the archived trip product and are intentionally left unchanged to avoid implying progress against the new scope.
>
> **Target Launch:** Q2 2026 (Beta) — to be re-baselined post-pivot
> **Current Status:** Refactoring (Phase 2 in progress — domain models added, DB migration pending)
> **Last Updated:** 2026-05-16 (POST_PIVOT_STEADY_STATE — V1 routes live; nightly/2026-05-16 added 172 tests, 3 file refactors, V1_API_ROUTES.md, JSDoc on src/lib/intent/*, README rewrites)

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
- [x] Intents → auto-grouping loop (`/api/intents/*`, `/api/subcrews/*`, `cron/expire-intents`)
- [x] Heatmap (Crew tier PR #86, FoF tier PR #87, threshold slider PR #88, MapLibre + OpenFreeMap)
- [x] Topics + Recommendations (`/api/topics`, `/api/recommendations`)
- [x] Feed (rescoped to meetup/checkin types — trip/activity items removed)
- [x] Search (people-first ordering)

### 8.4 Monitoring & observability

- [x] Sentry installed and configured (`instrumentation-client.ts`, `src/lib/sentry.ts`)
- [x] Sentry coverage on V1 hot paths — **44 / 59 live routes (74.6%)** — see `docs/SENTRY_COVERAGE_AUDIT.md`
- [x] Structured logging (pino via `@/lib/logger`)
- [x] Vercel Analytics enabled
- [ ] Sentry DSN set in production (blocks event ingestion)
- [ ] Sentry source maps uploaded
- [ ] Uptime monitor (BetterStack / Checkly)
- [ ] Status page

### 8.5 Testing

- [x] **1081 / 1081 tests passing** (Vitest, 64 test files on main as of 2026-05-08)
- [x] 0 TSC errors, 0 lint warnings
- [x] Service tests (recommendation, survey)
- [x] API route tests (auth, feed, notifications, crew, meetups, checkins, intents, subcrews, topics, heatmap, users, profile, beta, search, voting, sanitize, pusher)
- [x] Library tests (sanitize, pusher, email)
- [x] CI: GitHub Actions runs Node 20 + TSC + lint + Vitest + Playwright
- [x] E2E smoke spec (Playwright, public flows only)
- [ ] **E2E Playwright authenticated flows** — Crew → Meetup loop (Phase 8 outstanding)
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
- [ ] No search results state

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
4. E2E Playwright authenticated flow covering the canonical V1 loop: signup → set Intent → match into Subcrew → create Meetup → check in
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
