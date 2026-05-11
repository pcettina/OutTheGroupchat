# OutTheGroupchat - Production Deployment & Feature Roadmap

> **Target:** Q2 2026 Beta Launch
> **Version:** 3.3 | **Last Updated:** 2026-05-10

---

## Pivot Status (2026-05-10)

- **Active refactor phase:** Phase 8 — launch-readiness re-audit (in progress)
- **Phases complete:** Phase 0 (PR backlog merged), Phase 1 (trip-planning archived), Phase 2 (Crew/Meetup/Venue models + Neon migration), Phase 3 (Crew API + UI), Phase 4 (Meetup API + Pusher real-time + Google Places), Phase 5 (Check-ins + privacy + NearbyCrewList), Phase 6 (NotificationType pruned, search people-first), Phase 7 (About page + OG tags + email-auth split + RichFeedItem refactor)
- **V1 Phase 4 heatmap:** SHIPPED — Crew-tier (PR #86) + FoF-tier (PR #87)
- **Pre-pivot tag:** v1.0-trip-planning (git tag, recoverable)
- **AI surface:** removed entirely 2026-04-23 (PR #65, `ops/kill-all-ai-2026-04-23`). No `/api/ai/*`, no `@ai-sdk/*` deps, no `src/lib/ai`, no `src/components/ai`.
- **Next milestone:** Phase 8 exit criteria — Sentry DSN live in Vercel, E2E Playwright authenticated flows landed, ~11 open PRs triaged/merged.

---

## V1 Phase 4 — Geo Heatmap (COMPLETE)

V1 Phase 4 ships the intent-to-group geo surface (see `docs/PRODUCT_VISION.md` for the founder-locked v1 product loop). Two tiers merged 2026-05:

| Tier | PR | Scope |
|------|----|-------|
| Crew-tier heatmap | #86 | Real-time density layer over Crew contributions; maplibre-gl + OpenFreeMap tiles; contribution writers wired into commit + checkins paths |
| FoF-tier heatmap | #87 | Friends-of-friends density tier with threshold slider; opt-in visibility honored |

Key implementation details:
- **Renderer:** maplibre-gl (open-source, no Mapbox account required)
- **Tiles:** OpenFreeMap (free, attribution-only)
- **Venue markers:** R22 at z=15 — venue markers materialize from heatmap density
- **Anchor priority:** R24 — priority 1 (Crew on Topic), priority 3, priority 4; priority 2 deferred
- **Contribution writers:** integrated into `/api/checkins` and Crew commit flow so the heatmap auto-populates

Outstanding heatmap follow-ups (post-launch, not blockers):
- R24 priority 2 anchor
- Heatmap perf budget tuning at z<10

---

## Current System Status (as of 2026-05-10)

### Codebase Health Snapshot

| Metric | Value |
|--------|-------|
| Tests passing (main) | 917 Vitest (48 test files) |
| API routes | 46 live routes (rate-limited) |
| `any` types | 0 |
| `console.*` in prod | 0 |
| Files > 600 lines (prod) | 2 (RichFeedItem 717, profile 623 — refactors in open PRs) |
| Build | PASS |
| Lint warnings | 0 |
| TSC errors | 0 |
| Security score | 9/10 |
| Sentry coverage | 19/46 routes (instrumentation expanded; DSN still missing in Vercel) |
| GitHub Actions CI | Passing |
| Neon branch-per-PR | Active (every PR gets a Neon branch with `prisma migrate deploy`) |

### Overall Launch Readiness: ~88%

| Category | Score | Target | Status |
|----------|-------|--------|--------|
| Infrastructure | 95% | 100% | Almost Ready |
| Core Features | 92% | 90% | Met (heatmap shipped, meetups + checkins live) |
| Security | 90% | 100% | In Progress |
| Testing | 88% | 80% | Met |
| Monitoring | 70% | 80% | In Progress (Sentry DSN gap) |

### Implemented & Working

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication (Email/Password) | Working | NextAuth with credentials provider |
| Email Verification | Working | VerificationToken created + email sent at signup |
| Password Reset | Working | API + UI complete |
| Crew domain | Working | 6 Crew API routes, CrewButton/CrewList, /profile/[userId] (Phase 3) |
| Meetups | Working | 5 meetup routes, MeetupDetail page, Pusher real-time, MEETUP_STARTING_SOON cron, Google Places (Phase 4) |
| Check-ins | Working | POST/GET/DELETE checkins, "Join me" flow, privacy (PUBLIC/CREW/PRIVATE), NearbyCrewList, duration picker, activeUntil clamping (Phase 5) |
| Heatmap (Crew + FoF tier) | Working | maplibre-gl + OpenFreeMap, R22 venue markers, R24 anchor priority 1/3/4 (PR #86, #87) |
| Navigation & Routing | Working | App Router, all pages functional |
| Feed System | Working | Rescoped meetup-centric (Phase 6) |
| Search | Working | People-first; types: all/people/meetups/venues |
| Profile Page | Working | Full profile with stats, preferences, /profile/[userId] |
| Discover Page | Working | Auth-guarded |
| Member Invitations | Working | Email-based via Resend |
| Rate Limiting | Working | Upstash Redis-based on all routes (46/46) |
| CORS | Working | Configured in next.config.js |
| Security Headers | Working | HSTS, X-Frame-Options, CSP |
| Error Boundaries | Working | global-error.tsx, error.tsx, not-found.tsx |
| Sentry | Partial | 19/46 routes instrumented; needs real DSN in Vercel |
| Real-time (Pusher) | Partial | Configured + wired (meetup/checkin channels); env vars missing in production |
| About / Privacy / Terms | Working | About page, OG tags, Privacy + ToS pages |
| Accessibility | Good | Skip links, ARIA patterns |
| Responsive Design | Good | Mobile-first, 44px touch targets |
| AI features | REMOVED | All AI routes, lib, components, and deps deleted 2026-04-23 (PR #65) |

### Active Blockers (Must Fix Before Launch)

| Issue | Priority | Status |
|-------|----------|--------|
| Sentry DSN not set in Vercel | High | Blocked by config (instrumentation ready, DSN env missing) |
| Pusher env vars missing in production | High | Blocked by config |
| Resend domain not verified | Medium | Production emails may go to spam |
| E2E Playwright authenticated flows | Medium | Test framework configured; auth-flow specs pending |
| NEXTAUTH_SECRET strength unverified | Medium | Manual check needed |
| Open PR backlog (~11 PRs) | Medium | Triage + merge before launch |

---

## Risk Register (Updated 2026-05-10)

### Resolved (no longer risks)

| Item | Resolution |
|------|-----------|
| Trip-planning surface technical debt | Archived to `src/_archive/`, v1.0-trip-planning git tag preserved (Phase 1) |
| AI surface (OpenAI/Anthropic deps, /api/ai/*) | Fully removed PR #65, 2026-04-23 |
| Missing Crew/Meetup/Checkin domain | Shipped Phases 3-5 (PRs #46-#54) |
| Heatmap not shipped (V1 Phase 4) | Shipped PRs #86 + #87 |
| Rate-limiting gaps | 100% route coverage on Upstash Redis |
| In-memory rate limiter on /api/beta/status | Migrated to Redis (PR #38, 2026-04-15) |

### Open

| Risk | Severity | Mitigation |
|------|----------|------------|
| Sentry DSN absent in Vercel production | High | Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` env vars before launch |
| Pusher env vars absent in Vercel production | High | Set Pusher creds; meetup/checkin real-time fails silently otherwise |
| Resend domain unverified | Medium | Verify sending domain in Resend dashboard; production emails currently bounce |
| E2E coverage of authenticated flows | Medium | Playwright framework live (smoke.spec.ts); add auth + meetup-creation + checkin specs |
| Major dependency upgrades pending | Medium | next 14→16, react 18→19, prisma 5→7 — tracked in `docs/UPGRADE_PLAN.md` |
| ~11 open PRs unmerged | Medium | Triage; nightly/2026-04-24 (PR #59) has AI-suggest-meetups test conflicts with PR #65 |
| DEMO_MODE=false | Low | Set DEMO_MODE=true in preview if demo auth flow desired |

---

## Completed Milestones

### V1 Pivot Phase 4 (May 2026) — Heatmap Geo Layer
- PR #86: Crew-tier heatmap (maplibre-gl, OpenFreeMap, contribution writers in commit + checkin paths)
- PR #87: FoF-tier heatmap with threshold slider
- R22 z=15 venue markers materializing from density
- R24 anchor priority 1, 3, 4 (priority 2 deferred)

### V1 Pivot Phases 0-7 (March–April 2026)
- Phase 0: PR backlog merged, v1.0-trip-planning tagged
- Phase 1: Trip code archived to `src/_archive/`, navigation cleaned
- Phase 2: Crew/Meetup/Venue models, `User.crewLabel`, `CheckIn.activeUntil`, Neon migration applied (PR #43-#45)
- Phase 3: 6 Crew API routes, CrewButton/CrewList UI, Crew emails, /profile/[userId] (PR #46-#47)
- Phase 4: Meetup routes (POST/GET/PATCH/DELETE + RSVP + invite), MeetupDetail page, Pusher real-time, MEETUP_STARTING_SOON cron, Google Places API (PR #48-#51)
- Phase 5: Check-ins API + UI, "Join me" flow, privacy settings (PUBLIC/CREW/PRIVATE), NearbyCrewList, duration picker (PR #52-#54)
- Phase 6: NotificationType pruned, Follow @deprecated, feed rescoped, search people-first, AI suggest-meetups + icebreakers routes (PR #55) — later removed in PR #65
- Phase 7: About page, OG tags, README rewrite, email-auth.ts split, search cleanup, RichFeedItem refactor (PR #56)
- AI surface fully removed (PR #65, 2026-04-23) — no AI routes, libs, components, or deps
- Nightly builds adding ~60-100 tests per run

### March 2026 Sprint (COMPLETE)
- `img` → `next/image` migration complete
- `console.*` cleanup complete (0 in production)
- `any` type elimination complete (0 remaining)
- Zod validation on all major API routes
- Test suite from 0 to 925+ tests baseline (49 test files)
- Vitest + Testing Library configured
- Playwright E2E framework configured
- Password reset API + UI complete
- Email verification endpoint wired into signup
- Global error boundary + custom 404/500 pages
- Sentry installed and configured (needs production DSN)
- Vercel Analytics enabled
- Structured logging via pino
- Security hardening: /api/beta/initialize-password, /api/beta/status, /api/auth/demo
- CORS configured
- Security headers added (HSTS, X-Frame-Options, CSP)

### December 2025 Sprint (COMPLETE)
- Redis-based rate limiting replacing in-memory implementation
- JWT callback optimization (only queries DB on signIn/update)
- Email removed from user search (privacy fix)
- Placeholder user creation fix (PendingInvitation model)
- Email service via Resend
- Geocoding with Nominatim
- Invitation acceptance flow with auto-accept on signup

---

## Remaining Work Before Beta Launch

### Phase 8 Exit (Active)

```
[ ] Set SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN in Vercel production
[ ] Set Pusher env vars in Vercel production (NEXT_PUBLIC_PUSHER_KEY, PUSHER_APP_ID, PUSHER_SECRET, PUSHER_CLUSTER)
[ ] Verify Resend sending domain (DKIM, SPF, DMARC)
[ ] E2E Playwright authenticated flow coverage:
    - signup → email verify → login
    - Crew add → meetup create → RSVP
    - check-in → NearbyCrewList visibility
[ ] Triage and merge open PR backlog (~11 PRs as of 2026-05-10)
[ ] Sentry full coverage audit — expand to remaining 27/46 routes
[ ] NEXTAUTH_SECRET rotation (32+ chars) and verification
```

### Phase 9: Pre-Beta Infrastructure

```
[ ] Uptime monitoring (BetterStack/Checkly)
[ ] Status page
[ ] Alert channels (Slack/Email)
[ ] Log aggregation
[ ] Custom domain (optional for beta)
[ ] Major dependency upgrades (next 14→16, react 18→19, prisma 5→7) — see docs/UPGRADE_PLAN.md
```

### Phase 10: Launch Polish

```
[ ] Meta titles/descriptions audit on all pages
[ ] Open Graph tags audit (Phase 7 covered marketing pages — verify Crew/Meetup/Checkin pages)
[ ] Favicon configured
[ ] Heatmap perf tuning at z<10
[ ] R24 anchor priority 2 (post-launch follow-up)
```

---

## Infrastructure Notes

### Database: Neon PostgreSQL (via Vercel Marketplace)
Migrated from Supabase 2026-04-17. Connected via Prisma 5.22.0.

- **Production Neon migration workflow:** added PR #90 (2026-05-10). Applies migrations to production Neon branch via GitHub Actions.
- **PR-scoped Neon branches:** Every PR gets a Neon branch with `prisma migrate deploy` applied automatically. Failed migrations stick across pushes — close + reopen the PR to reset.

### Real-time: Pusher
Configured in `src/lib/pusher.ts`. Channels:
- `presence-meetup-{id}` — meetup attendance and chat
- `presence-checkin-city-{cityKey}` — city-scoped checkin feed
- `private-user-{userId}` — direct notifications

### Geocoding & Tiles
- **Geocoding:** Nominatim (`src/lib/geocoding.ts`)
- **Heatmap tiles:** OpenFreeMap (free, attribution-only)
- **Renderer:** maplibre-gl
- **Places search:** Google Places API (server-side, `/api/venues/search`)

### Technical Architecture (Current State)

```
+-----------------------------------------------------------------------+
|                          PRODUCTION ARCHITECTURE                       |
+-----------------------------------------------------------------------+
|                                                                        |
|  +---------------+    +---------------+    +-------------------+      |
|  |  Vercel       |    |  Next.js 14   |    |  Cloudflare CDN   |      |
|  |  Hosting      | <- |  App Router   | <- |  (via Vercel)     |      |
|  |  (SSR/ISR)    |    |  API Routes   |    |                   |      |
|  +---------------+    +---------------+    +-------------------+      |
|         |                    |                                         |
|         v                    v                                         |
|  +---------------+    +---------------+    +-------------------+      |
|  | Neon          |    |  Upstash      |    |  Pusher           |      |
|  | PostgreSQL    |    |  Redis        |    |  (Real-time)      |      |
|  | (via Prisma5) |    |  Rate Limit   |    |  [needs env vars] |      |
|  +---------------+    +---------------+    +-------------------+      |
|         |                                                              |
|         v                                                              |
|  +---------------+    +---------------+    +-------------------+      |
|  |  Sentry       |    |  BetterStack  |    | OpenFreeMap +     |      |
|  |  [needs DSN]  |    |  [pending]    |    | maplibre-gl       |      |
|  +---------------+    +---------------+    +-------------------+      |
|                                                                        |
+-----------------------------------------------------------------------+
```

### Cost Estimation (Monthly)

| Service | Free Tier | Starter | Growth |
|---------|-----------|---------|--------|
| **Vercel** (Hosting) | $0 | $20 | $70 |
| **Neon** (Database) | $0 | $19 | $69 |
| **Upstash** (Redis) | $0 (10k/day) | $10 | $25 |
| **Pusher** (Real-time) | $0 (200k msg) | $49 | $99 |
| **Sentry** (Errors) | $0 (5k events) | $26 | $80 |
| **OpenFreeMap** (tiles) | $0 | $0 | $0 (or self-host) |
| **Google Places** (venues) | Pay-as-go | ~$10 | ~$50 |
| **Resend** (email) | $0 (100/day) | $20 | $85 |
| **Total** | **~$0-20** | **~$154** | **~$478** |

---

## Security Checklist

### Critical (Must Have Before Beta)

- [x] HTTPS only (Vercel handles this)
- [ ] NEXTAUTH_SECRET is strong (32+ chars) — verify
- [x] Database credentials not in code
- [x] API keys not exposed to client
- [x] Rate limiting on major endpoints (Upstash)
- [x] Input validation on major API routes (Zod)
- [x] SQL injection prevention (Prisma)
- [x] XSS prevention (React handles, plus DOMPurify installed)
- [x] CORS configured (next.config.js)
- [x] Security headers (HSTS, X-Frame-Options, CSP)
- [x] Rate limiting on ALL 46 endpoints (COMPLETE)
- [ ] Session timeout configuration
- [ ] Failed login attempt limiting

### Completed Security Fixes

- [x] In-memory rate limiting replaced with Upstash Redis (all routes including beta/status)
- [x] JWT callback DB query optimized (signIn/update only)
- [x] Email removed from user search (privacy)
- [x] Placeholder user creation abuse fixed (PendingInvitation model)
- [x] /api/beta/initialize-password protected by N8N_API_KEY auth
- [x] /api/beta/status response narrowed to {exists, passwordInitialized}
- [x] /api/auth/demo guarded by DEMO_MODE env var
- [x] /api/discover/search requires auth
- [x] /api/discover/recommendations requires auth
- [x] AI attack surface eliminated (all AI routes removed PR #65)
- [x] Check-in `activeUntil` clamping prevents indefinite location-visibility windows ([now+30min, now+12h])

### Post-Beta (Nice to Have)

- [ ] Two-factor authentication
- [ ] OAuth providers (Google, Apple)
- [ ] IP-based rate limiting
- [ ] Audit logging for sensitive operations

---

## Success Metrics for Beta Launch

### Technical Targets

- [ ] 0 critical bugs in production
- [ ] < 3s page load time (Vercel Analytics)
- [ ] > 99% uptime (BetterStack)
- [ ] Error rate < 1% (Sentry)
- [ ] Heatmap render < 500ms at z=12 for typical viewport

### User Targets

- [ ] 20-50 beta users signed up
- [ ] 10+ Crew formed (≥2 users)
- [ ] 10+ meetups created end-to-end
- [ ] 10+ check-ins with NearbyCrewList visibility verified
- [ ] Heatmap density visible in at least one metro

---

## Emergency Procedures

### If Site Goes Down
1. Check Vercel status page
2. Check Neon status (dashboard.neon.tech)
3. Review Sentry for errors (once DSN set)
4. Check BetterStack alerts (once configured)
5. Rollback to previous deployment if needed

### If Database Issues
1. Check Neon dashboard for branch health
2. Verify connection string (DATABASE_URL + DIRECT_URL)
3. Check for query timeouts in Sentry
4. Inspect production Neon migration workflow runs (PR #90)
5. Scale Neon compute or connection pool if needed

### If Real-time Features Stall
1. Verify Pusher env vars in Vercel (`PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`)
2. Check Pusher dashboard for connection limits / message budget
3. Meetup detail + checkin feed degrade to polling-free static (no fallback yet)

### If Heatmap Tiles Fail
1. Check OpenFreeMap status / CDN
2. Verify maplibre-gl bundle loaded
3. Confirm contribution writers are emitting (commit + checkin paths)

---

*Document Version: 3.3*
*Target Launch: Q2 2026 (Beta)*
*Last Updated: 2026-05-10*
*Owner: Development Team*
