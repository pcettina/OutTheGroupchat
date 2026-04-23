# OutTheGroupchat - Production Deployment & Feature Roadmap

> **Target:** Q2 2026 Beta Launch
> **Version:** 3.3 | **Last Updated:** 2026-04-22

---

## Pivot Status (2026-04-22)

- **Active refactor phase:** Phase 8 — Launch-readiness re-audit (in progress)
- **Phases complete:** Phase 0 (PR backlog merged), Phase 1 (trip-planning archived), Phase 2 (Crew/Meetup/Venue schema), Phase 3 (Crew API + UI), Phase 4 (Meetup API + real-time), Phase 5 (Check-ins), Phase 6 (notification pruning, feed rescope, AI routes), Phase 7 (about page, OG metadata, email-auth split, README rewrite — PR #56, unmerged as of 2026-04-22)
- **Phases remaining:** Phase 8 (this phase) — launch-readiness re-audit
- **Pre-pivot tag:** v1.0-trip-planning (git tag, recoverable)
- **Next milestone:** Phase 8 complete — all blockers resolved, beta environment verified, PR #56 merged to main

---

## Current System Status (as of 2026-04-22)

### Codebase Health Snapshot

| Metric | Value |
|--------|-------|
| Tests passing (nightly/2026-04-23 branch) | 1,100 (58 test files) |
| Tests passing (main) | 1,048 |
| API routes | 52 (all rate-limited) |
| `any` types | 0 |
| `console.*` in prod | 0 |
| Files > 600 lines (prod) | 0 |
| Build | PASS |
| Lint warnings | 0 |
| TSC errors | 0 |
| Security score | 9/10 |
| Sentry coverage | 19/52 routes |
| GitHub Actions CI | Passing |
| Neon branch-per-PR workflow | Active |

### Overall Launch Readiness: ~82%

| Category | Score | Target | Status |
|----------|-------|--------|--------|
| Infrastructure | 95% | 100% | Almost Ready |
| Core Features | 88% | 90% | Near Complete |
| Security | 90% | 100% | In Progress |
| Testing | 88% | 80% | Met |
| Monitoring | 65% | 80% | In Progress |

### Implemented & Working

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication (Email/Password) | Working | NextAuth with credentials provider |
| Email Verification | Working | VerificationToken created + email sent at signup |
| Password Reset | Working | API + UI complete |
| Navigation & Routing | Working | App Router, all pages functional |
| Feed System | Working | Rescoped to meetup-centric content (Phase 6) |
| Like/React System | Working | Optimistic updates, emoji reactions |
| Comment System | Working | Trip support added |
| Share Modal | Working | POST /api/feed/share with Zod + notification |
| Profile Page | Working | Full profile with stats; ProfileCheckinsSection extracted |
| Discover Page | Working | People-first search (Phase 6 rescope) |
| Crew System | Working | 6 API routes, CrewButton/CrewList UI, crew emails |
| Meetup System | Working | Full CRUD, RSVP, invite, Pusher real-time, cron |
| Check-ins System | Working | POST/GET/DELETE, crew feed, privacy settings, NearbyCrewList |
| AI Meetup Suggestions | Working | POST /api/ai/suggest-meetups; 503 guard when key absent |
| AI Icebreakers | Working | POST /api/ai/icebreakers; 503 guard when key absent |
| AI Chat Assistant | Working | OpenAI connected, streaming; 503 guard when key absent |
| About Page | Working | Phase 7 — "off your phone" ethos (in PR #56) |
| OG / Twitter Card Metadata | Working | Updated from trip-planning copy (in PR #56) |
| Email (auth) | Working | email-auth.ts extracted — sendWelcomeEmail, sendAuthVerificationEmail, sendPasswordResetEmail |
| Rate Limiting | Working | Upstash Redis-based on all 52 routes |
| CORS | Working | Configured in next.config.js |
| Security Headers | Working | HSTS, X-Frame-Options, CSP in next.config.js |
| Error Boundaries | Working | global-error.tsx, error.tsx, not-found.tsx |
| Sentry | Partial | 19/52 routes instrumented; needs real DSN in Vercel |
| Real-time (Pusher) | Partial | Configured; env vars missing in production |
| Accessibility | Good | Skip links, ARIA patterns |
| Responsive Design | Good | Mobile-first, 44px touch targets |
| Privacy / Terms Pages | Working | Static pages present |

### Active Blockers (Must Fix Before Launch)

| Issue | Priority | Status |
|-------|----------|--------|
| OPENAI_API_KEY not set in Vercel | Critical | Blocked by config |
| PR #56 not merged to main (Phase 7) | High | Pending merge |
| Pusher env vars missing in production | High | Blocked by config |
| Sentry DSN not set in Vercel | High | Blocked by config |
| DEMO_MODE=false in production | High | Enable before beta onboarding |
| Resend domain not verified | Medium | Email may go to spam |
| NEXTAUTH_SECRET strength unverified | Medium | Manual check needed |

---

## Completed Milestones

### December 2025 Sprint (COMPLETE)

- Redis-based rate limiting replacing in-memory implementation
- JWT callback optimization (only queries DB on signIn/update)
- Email removed from user search (privacy fix)
- Placeholder user creation fix (PendingInvitation model)
- Email service via Resend (`src/lib/email.ts`)
- Geocoding with Nominatim (`src/lib/geocoding.ts`)
- AI chat connected to OpenAI (gpt-4o-mini, streaming)
- TripComment + TripLike models added to schema
- Invitation acceptance flow with auto-accept on signup

### March 2026 Sprint (COMPLETE)

- `img` → `next/image` migration complete (0 remaining)
- `console.*` cleanup complete (0 in production code)
- `any` type elimination complete (0 remaining)
- Zod validation on all major API routes
- Test suite from 0 to 925+ tests (49 test files)
- Vitest + Testing Library configured
- Playwright E2E framework configured
- Password reset API + UI complete
- Email verification endpoint wired into signup
- Global error boundary + custom 404/500 pages
- Sentry installed and configured (needs production DSN)
- Vercel Analytics enabled
- Structured logging via pino (`@/lib/logger`)
- Security hardening: /api/beta/initialize-password, /api/beta/status, /api/auth/demo
- CORS configured; security headers added (HSTS, X-Frame-Options, CSP)

### April 2026 Sprint (In Progress)

- Test suite scaled to 1,100 on nightly/2026-04-23 branch (1,048 on main, 58 test files)
- Rate limiting expanded to all 52 API routes (52/52 — 100% coverage)
- Security score raised to 9/10
- Sentry expanded to 19/52 routes (trips, activities, search, inspiration, users, profile, discover, AI, auth routes)
- beta/status route migrated from in-memory Map to Redis checkRateLimit
- GitHub Actions CI pipeline added with TSC, lint, Vitest, Playwright
- Neon branch-per-PR workflow activated (schema-diff comments on every PR)
- **Pivot Phases 1–7 complete:**
  - Phase 1: Trip code archived to src/_archive/
  - Phase 2: Crew/Meetup/Venue/CheckIn models in Prisma; crewLabel, activeUntil added
  - Phase 3: Crew API (6 routes), CrewButton/CrewList UI, crew emails
  - Phase 4: Meetup API (5 routes), MeetupDetail page, Pusher real-time, Google Places, cron
  - Phase 5: Check-ins API + UI, "Join me" flow, privacy settings, NearbyCrewList, duration picker
  - Phase 6: NotificationType pruned, feed rescoped, search people-first, AI routes (suggest-meetups + icebreakers)
  - Phase 7: About page, OG metadata, README rewrite, email-auth.ts extracted, search legacy types removed (PR #56)
- RichFeedItem.tsx refactored 717→337 lines (4 sub-components extracted)
- profile/page.tsx refactored 623→559 lines (ProfileCheckinsSection extracted)
- Dead components removed: DestinationCard, CategoryFilter, TrendingSection, TravelBadges, SignUpForm

---

## Remaining Work Before Beta Launch

### Phase 8: Launch-Readiness Re-Audit (Active)

```
[ ] Merge PR #56 to main (Phase 7 complete)
[ ] Set OPENAI_API_KEY in Vercel production
[ ] Set Pusher env vars in Vercel production
[ ] Obtain real Sentry DSN + set in Vercel
[ ] Verify Resend domain for email deliverability
[ ] Set DEMO_MODE=true for beta onboarding
[ ] NEXTAUTH_SECRET rotation (32+ chars) — verify
[ ] Session timeout configuration
[ ] Failed login attempt limiting
[ ] Expand Sentry to remaining 33/52 routes (19/52 instrumented)
[ ] Uptime monitoring (BetterStack/Checkly)
[ ] Alert channels (Slack/Email)
[ ] Database backup schedule verified
[ ] Playwright E2E tests: auth flow + check-in flow end-to-end
```

### Post-Phase 8: Pre-Beta Infrastructure

```
[ ] Status page
[ ] Log aggregation
[ ] Custom domain (optional for beta)
[ ] Two-factor authentication (post-beta)
[ ] OAuth providers: Google, Apple (post-beta)
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Location data stalker vector | Low | High | activeUntil clamped to max 12h; CHECK-IN visibility=PRIVATE/CREW supported |
| Crew-request abuse | Low | Medium | Crew requests require mutual acceptance; no auto-add |
| Location precision abuse | Low | Medium | Check-in stores city/neighborhood only — no lat/lng stored in CheckIn model |
| OpenAI key absent in prod | High | Medium | All AI routes return 503 gracefully; app fully functional without key |
| Email deliverability (Resend unverified) | High | Medium | Transactional emails may land in spam until domain verified |
| Pusher env vars missing | High | Medium | Real-time events silently no-op; check-in feed falls back to polling |
| Sentry DSN missing | High | Low | Errors not captured in production until DSN set |
| PR #56 unmerged | High | Low | Phase 7 features live on branch only; no user impact until merged |

---

## Technical Architecture (Current State)

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
|  |  Sentry       |    |  BetterStack  |    |  OpenAI           |      |
|  |  [needs DSN]  |    |  [pending]    |    |  [needs Vercel key]|     |
|  +---------------+    +---------------+    +-------------------+      |
|                                                                        |
+-----------------------------------------------------------------------+
```

> Note: Database migrated from Supabase → Neon (via Vercel Marketplace) on 2026-04-17. Neon branch-per-PR workflow active.

### Cost Estimation (Monthly)

| Service | Free Tier | Starter | Growth |
|---------|-----------|---------|--------|
| **Vercel** (Hosting) | $0 | $20 | $70 |
| **Neon** (Database) | $0 | $19 | $69 |
| **Upstash** (Redis) | $0 (10k/day) | $10 | $25 |
| **Pusher** (Real-time) | $0 (200k msg) | $49 | $99 |
| **OpenAI** (AI) | Pay-as-go | ~$20 | ~$100 |
| **Sentry** (Errors) | $0 (5k events) | $26 | $80 |
| **Total** | **~$0-20** | **~$144** | **~$443** |

---

## Security Checklist

### Critical (Must Have Before Beta)

- [x] HTTPS only (Vercel handles this)
- [ ] NEXTAUTH_SECRET is strong (32+ chars) — verify
- [x] Database credentials not in code
- [x] API keys not exposed to client
- [x] Rate limiting on all endpoints (Upstash — 52/52)
- [x] Input validation on all API routes (Zod)
- [x] SQL injection prevention (Prisma)
- [x] XSS prevention (React handles, plus DOMPurify installed)
- [x] CORS configured (next.config.js)
- [x] Security headers (HSTS, X-Frame-Options, CSP)
- [ ] Session timeout configuration
- [ ] Failed login attempt limiting
- [x] Check-in visibility controls (PUBLIC / CREW / PRIVATE)
- [x] activeUntil clamped (max 12h) — stalker vector mitigated

### Completed Security Fixes

- [x] In-memory rate limiting replaced with Upstash Redis
- [x] JWT callback DB query optimized (signIn/update only)
- [x] Email removed from user search (privacy)
- [x] Placeholder user creation abuse fixed (PendingInvitation model)
- [x] /api/beta/initialize-password protected by N8N_API_KEY auth
- [x] /api/beta/status response narrowed to {exists, passwordInitialized}
- [x] /api/auth/demo guarded by DEMO_MODE env var
- [x] /api/discover/search and /api/discover/recommendations require auth
- [x] Check-in location stores city/neighborhood only (no lat/lng)
- [x] Crew-request requires mutual acceptance (no auto-add)

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
- [ ] All Vercel env vars configured

### User Targets

- [ ] 20-50 beta users signed up
- [ ] 10+ meetups created
- [ ] Check-in flow tested end-to-end by at least 5 users

---

## Timeline

| Milestone | Target | Status |
|-----------|--------|--------|
| Phase 7 complete | 2026-04-22 | PR #56 open |
| Phase 8 complete (all blockers resolved) | 2026-04-30 | In progress |
| Beta launch | Q2 2026 | Pending Phase 8 |

---

## Emergency Procedures

### If Site Goes Down
1. Check Vercel status page
2. Check Neon status
3. Review Sentry for errors
4. Check BetterStack alerts (once configured)
5. Rollback to previous deployment if needed

### If Database Issues
1. Check Neon dashboard
2. Verify connection string / pooler URL
3. Check for query timeouts in Sentry
4. Scale connection pool if needed

### If AI Not Working
1. Verify OPENAI_API_KEY is set in Vercel environment
2. Check OpenAI status page
3. Routes return 503 gracefully when key absent
4. App is fully functional without AI features

---

*Document Version: 3.3*
*Target Launch: Q2 2026 (Beta)*
*Last Updated: 2026-04-22*
*Owner: Development Team*
