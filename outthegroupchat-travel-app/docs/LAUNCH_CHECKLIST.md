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
> **Last Updated:** 2026-05-10 (Phase 8 IN PROGRESS — nightly/2026-05-11: +74 integration tests on V1 intent/subcrew/checkin surface; Sentry instrumented on `/api/topics` + `/api/recommendations`. Remaining: Sentry DSN env, Pusher env, Resend domain, Playwright authenticated E2E flows.)

### ✅ Newly closed (nightly/2026-05-11, 2026-05-10)
- [x] Sentry on `/api/topics`
- [x] Sentry on `/api/recommendations`
- [x] Integration tests for `/api/intents/[id]` (PATCH/DELETE — 19)
- [x] Integration tests for `/api/intents/mine` + `/api/intents/crew` (18)
- [x] Integration tests for `/api/subcrews/*` (23)
- [x] Integration tests for `/api/checkins/feed` (14)

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

- [x] Skeleton loaders on data-fetching pages
- [x] Loading spinners on actions
- [x] Optimistic updates where appropriate
- [x] Empty states for feed, notifications, crew list
- [x] Global error boundary (`global-error.tsx`)
- [x] Friendly 404 (`not-found.tsx`) and 500 (`error.tsx`) pages
- [x] Mobile-first responsive design
- [x] Touch targets ≥ 44px
- [x] Skip links + ARIA patterns
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
