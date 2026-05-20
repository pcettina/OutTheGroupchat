# OutTheGroupchat - Production Deployment & Feature Roadmap

> **Target:** Q2 2026 Beta Launch
> **Version:** 3.3 | **Last Updated:** 2026-05-19

---

## Pivot Status (2026-05-19)

- **Active phase:** Phase 8 — Launch-readiness re-audit (in progress)
- **Phases complete:**
  - Phase 0 — PR backlog merged, `v1.0-trip-planning` tagged
  - Phase 1 — Trip-planning code archived to `src/_archive/`
  - Phase 2 — Crew/Meetup/Venue/CheckIn models, `User.crewLabel`, `CheckIn.activeUntil`, Neon migrations applied
  - Phase 3 — Crew API + UI (CrewButton, CrewList, /profile/[userId])
  - Phase 4a/4b — Meetup API + Pusher real-time + Google Places + heatmap (Crew + FoF tiers shipped via PRs #86 + #87)
  - Phase 5 — Check-ins API + UI, "Join me" flow, privacy settings, NearbyCrewList
  - Phase 6 — Notification rescope, Follow @deprecated, feed/search rescoped to people-first
  - Phase 7 — Marketing pass: About page, OG tags, README rewrite, email-auth split, RichFeedItem refactor
- **AI surface fully removed (2026-04-23, PR #65):** no `/api/ai/*` routes, no `@ai-sdk/*`/`ai` deps, no `src/lib/ai`, no `src/components/ai`.
- **V1 product loop locked (2026-04-24):** signal intent → auto-group at ≥2 Crew on same Topic → coordinate + venue recs → opt-in location visibility. Full spec in `docs/PRODUCT_VISION.md`.
- **Next milestone:** complete Phase 8 — rate-limit + Sentry coverage expanded to all V1 routes (meetups, checkins, crew, venues, heatmap), Playwright authenticated E2E, production env vars set.

---

## Current System Status (as of 2026-05-19)

### Codebase Health Snapshot

| Metric | Value |
|--------|-------|
| Tests passing (main) | 1,081 (64 test files) |
| API routes | 53 live routes (rate-limited) |
| TypeScript files | ~280 |
| `any` types | 0 |
| `console.*` in prod | 0 |
| Files > 600 lines (prod) | 0 (RichFeedItem refactored 717 → 199) |
| Build | PASS |
| Lint warnings | 0 |
| TSC errors | 0 |
| Security score | 9/10 |
| Sentry coverage | 47/53 routes (expanding to V1 routes this sprint) |
| GitHub Actions CI | Passing |
| Neon per-PR branch workflow | Active (every PR gets its own DB branch) |
| Production migration workflow | Added 2026-05-17 (PR #90) |

### Overall Launch Readiness: ~85–87%

| Category | Score | Target | Status |
|----------|-------|--------|--------|
| Infrastructure | 95% | 100% | Almost Ready |
| Core Features (V1 loop) | 90% | 95% | In Progress |
| Security | 92% | 100% | In Progress |
| Testing | 88% | 80% | Met |
| Monitoring | 75% | 90% | In Progress |

### Implemented & Working (V1 surface)

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication (Email/Password) | Working | NextAuth with credentials provider |
| Email Verification | Working | VerificationToken created + email sent at signup |
| Password Reset | Working | API + UI complete |
| Navigation & Routing | Working | App Router; people-first nav after Phase 6 rescope |
| Feed System (rescoped) | Working | People-first, meetup/crew/checkin oriented; legacy trip cards in `src/_archive/` |
| Like/React System | Working | Optimistic updates, emoji reactions |
| Comment System | Working | Crew + meetup contexts |
| Share Modal | Working | POST /api/feed/share with Zod + notification |
| Profile Page | Working | `/profile/[userId]` with stats, crewLabel, contributions |
| Discover (people-first) | Working | Auth-guarded; category filters, search (`type=people|meetups|venues`) |
| Crew System | Working | 6 routes + CrewButton/CrewList/emails (Phase 3, PR #46, #47) |
| Meetup System | Working | Create/RSVP/Invite + Pusher real-time + MEETUP_STARTING_SOON cron (Phase 4, PR #48, #49, #51) |
| Venues (Google Places) | Working | `/api/venues/search` (Phase 4, PR #51) |
| Check-ins | Working | API + UI, activeUntil clamping [30min, 12h], CREW_CHECKED_IN_NEARBY notifications (Phase 5, PR #52, #53, #54) |
| Heatmap (Crew tier) | Working | R22 venue markers at z=15, R24 anchor priority 1/3/4 (PR #86, 2026-05-07) |
| Heatmap (FoF tier) | Working | Friend-of-friend tier (PR #87, 2026-05-11) |
| AI features | Removed | All AI routes, lib, components, and deps deleted 2026-04-23 (PR #65) |
| Member Invitations | Working | Email-based via Resend |
| Rate Limiting | Working | Upstash Redis on 53/53 routes |
| CORS | Working | Configured in next.config.js |
| Security Headers | Working | HSTS, X-Frame-Options, CSP |
| Error Boundaries | Working | global-error.tsx, error.tsx, not-found.tsx |
| Sentry | Mostly On | 47/53 routes instrumented; expanding to remaining V1 routes; **needs real DSN in Vercel** |
| Real-time (Pusher) | Partial | Configured; **env vars missing in production** |
| Accessibility | Good | Skip links, ARIA patterns |
| Responsive Design | Good | Mobile-first, 44px touch targets |

### Active Blockers (Must Fix Before Launch)

| Issue | Priority | Status |
|-------|----------|--------|
| Sentry DSN not set in Vercel | High | Blocked by config — Sentry installed on 47/53 routes but no events reach Sentry in prod |
| Pusher env vars missing in production | High | Blocked by config — meetup/checkin real-time disabled in prod |
| Resend domain not verified | Medium | Email may go to spam / bounce |
| DEMO_MODE=false in production | Medium | Required for demo auth endpoint |
| NEXTAUTH_SECRET strength unverified | Medium | Manual check needed |
| Playwright authenticated E2E flows | Medium | Smoke tests pass; auth + V1 happy-path flows still pending |
| Sentry coverage on remaining V1 routes | Medium | Heatmap/venues/checkins-feed still need instrumentation (this sprint) |

> **Note on dependency upgrades:** next 14→16, react 18→19, prisma 5→7 still pending per `docs/UPGRADE_PLAN.md`. Not blocking beta launch.

---

## Completed Milestones

### December 2025 Sprint (COMPLETE)

- Redis-based rate limiting replacing in-memory implementation
- JWT callback optimization (only queries DB on signIn/update)
- Email removed from user search (privacy fix)
- Placeholder user creation fix (PendingInvitation model)
- Email service via Resend (`src/lib/email.ts`)
- Geocoding with Nominatim (`src/lib/geocoding.ts`)
- TripComment + TripLike models added to schema
- Invitation acceptance flow with auto-accept on signup

### March 2026 Sprint (COMPLETE)

- `img` → `next/image` migration complete (0 remaining)
- `console.*` cleanup complete (0 in production code)
- `any` type elimination complete (0 remaining)
- Zod validation on all major API routes
- Vitest + Testing Library configured; Playwright framework configured
- Password reset API + UI complete
- Email verification endpoint created and wired into signup
- Global error boundary + custom 404/500 pages
- Sentry installed and configured (needs production DSN)
- Vercel Analytics enabled
- Structured logging via pino (`@/lib/logger`)
- Security hardening: /api/beta/initialize-password, /api/beta/status, /api/auth/demo
- CORS + security headers (HSTS, X-Frame-Options, CSP)
- InviteMemberModal component, /api/feed/share endpoint
- discover/* routes require authentication, auth/demo Zod validation

### April 2026 Sprint (COMPLETE)

- **AI fully removed (PR #65, 2026-04-23):** all `/api/ai/*` routes, `src/lib/ai`, `src/components/ai`, and `@ai-sdk/*`/`ai` deps deleted
- **Phase 6 rescope (PR #55, 2026-04-22) ✅:** NotificationType pruned, Follow @deprecated, feed rescoped, search people-first
- **Phase 7 marketing (PR #56, 2026-04-22) ✅:** About page, OG tags, README rewrite, email-auth.ts split, RichFeedItem 717 → 337 → 199 lines
- Rate limiting expanded to all live API routes (100% coverage)
- Security score raised to 9/10 (JSDoc, Zod coerce, input sanitization)
- DeleteTripModal, Privacy + Terms pages, JSDoc across 14+ lib/service files
- Dead components removed: TripHistory, BadgeShowcase, PreferencesCard, FloatingShareButton, DestinationCard, CategoryFilter, TrendingSection, TravelBadges
- email-crew.ts dead-code deleted (crew emails wired via email.ts)
- Migrated from Supabase to Neon Postgres (via Vercel Marketplace, 2026-04-17)

### May 2026 Sprint (In Progress)

- **Phase 4 heatmap shipped:**
  - Crew tier (PR #86, 2026-05-07): maplibre-gl + OpenFreeMap, contribution writers wired into commit + checkins, R22 venue markers at z=15, R24 anchor priority 1/3/4 (priority 2 deferred)
  - Friend-of-friend tier (PR #87, 2026-05-11)
- **Production migration workflow (PR #90, 2026-05-17):** dedicated GitHub Actions workflow for production Neon migrations
- **Heatmap seed/test fixtures (PR #91, PR #92):** 3-user/Crew/Intent/contribution seed; standalone heatmap runner respecting Crew lex-order constraint
- Sentry coverage: 39 → 47 routes (target 53 by end of sprint)
- Test count growth: ~917 → 1,081 tests, 48 → 64 test files
- Nightly build pipeline continuing to add ~30–40 tests per run

---

## Remaining Work Before Beta Launch

### Phase 8: Launch-Readiness Re-Audit (Active)

```
[ ] Sentry DSN set in Vercel production (Blocker)
[ ] Pusher env vars set in Vercel production (Blocker)
[ ] Resend domain verified (email deliverability)
[ ] Sentry coverage to 53/53 routes (currently 47/53)
[ ] Playwright authenticated E2E for V1 happy path (signup → intent → auto-group → meetup → checkin)
[ ] NEXTAUTH_SECRET rotation (32+ chars) + verification
[ ] Session timeout configuration
[ ] Failed login attempt limiting
[ ] Rate-limit coverage audit on new V1 routes (meetups, checkins, crew, venues, heatmap contributions)
[x] AI surface removed (PR #65)
[x] Phase 6 rescope (PR #55)
[x] Phase 7 marketing (PR #56)
[x] Heatmap Crew tier (PR #86)
[x] Heatmap FoF tier (PR #87)
[x] Production migration workflow (PR #90)
[x] Rate limiting on all endpoints (100% coverage)
```

### Phase 9: Pre-Beta Infrastructure

```
[ ] Uptime monitoring (BetterStack/Checkly)
[ ] Status page
[ ] Alert channels (Slack/Email)
[ ] Log aggregation
[ ] Database backup schedule (Neon point-in-time confirmed)
[ ] Custom domain (optional for beta)
```

### Phase 10: V1 Polish (Nice to Have)

```
[ ] R24 anchor priority 2 (deferred from PR #86)
[ ] Heatmap visual polish on mobile
[ ] Form validation errors inline on V1 forms
[ ] Empty states across discover/meetups/checkins
```

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
|  |  Sentry       |    |  BetterStack  |    |  Google Places    |      |
|  |  [needs DSN]  |    |  [pending]    |    |  (venue search)   |      |
|  +---------------+    +---------------+    +-------------------+      |
|         |                                                              |
|         v                                                              |
|  +-------------------------------+                                     |
|  | maplibre-gl + OpenFreeMap     |                                     |
|  | (heatmap rendering)           |                                     |
|  +-------------------------------+                                     |
|                                                                        |
+-----------------------------------------------------------------------+
```

### Database: Neon PostgreSQL
> Migrated from Supabase to Neon (via Vercel Marketplace) on 2026-04-17. Connected via Prisma 5.22.0. Per-PR Neon branch workflow active; production migration workflow added in PR #90.

### Cost Estimation (Monthly)

| Service | Free Tier | Starter | Growth |
|---------|-----------|---------|--------|
| **Vercel** (Hosting) | $0 | $20 | $70 |
| **Neon** (Database) | $0 | $19 | $69 |
| **Upstash** (Redis) | $0 (10k/day) | $10 | $25 |
| **Pusher** (Real-time) | $0 (200k msg) | $49 | $99 |
| **Google Places** (Venues) | Pay-as-go | ~$20 | ~$100 |
| **Sentry** (Errors) | $0 (5k events) | $26 | $80 |
| **Resend** (Email) | $0 (3k/mo) | $20 | $90 |
| **Total** | **~$0-20** | **~$164** | **~$533** |

---

## Security Checklist

### Critical (Must Have Before Beta)

- [x] HTTPS only (Vercel handles this)
- [ ] NEXTAUTH_SECRET is strong (32+ chars) — verify
- [x] Database credentials not in code
- [x] API keys not exposed to client
- [x] Rate limiting on all endpoints (Upstash, 100% coverage)
- [x] Input validation on all V1 API routes (Zod)
- [x] SQL injection prevention (Prisma)
- [x] XSS prevention (React handles, plus DOMPurify installed)
- [x] CORS configured (next.config.js)
- [x] Security headers (HSTS, X-Frame-Options, CSP)
- [ ] Session timeout configuration
- [ ] Failed login attempt limiting

### Completed Security Fixes

- [x] In-memory rate limiting replaced with Upstash Redis
- [x] JWT callback DB query optimized (signIn/update only)
- [x] Email removed from user search (privacy)
- [x] Placeholder user creation abuse fixed (PendingInvitation model)
- [x] /api/beta/initialize-password protected by N8N_API_KEY auth
- [x] /api/beta/status response narrowed to {exists, passwordInitialized}; migrated to NextRequest + Redis checkRateLimit
- [x] /api/auth/demo guarded by DEMO_MODE env var
- [x] /api/discover/search + /api/discover/recommendations require auth
- [x] V1 routes (crew, meetups, checkins, venues, heatmap) all behind auth + rate limiting
- [x] AI attack surface eliminated (PR #65)

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

### User Targets (V1 loop)

- [ ] 20-50 beta users signed up
- [ ] 10+ intents signaled that result in auto-grouped Crew meetups
- [ ] 5+ check-ins per active user per week
- [ ] Heatmap engagement: users opening map ≥1×/session

---

## Emergency Procedures

### If Site Goes Down
1. Check Vercel status page
2. Check Neon status (status.neon.tech)
3. Review Sentry for errors (once DSN configured)
4. Check BetterStack alerts (once configured)
5. Rollback to previous deployment if needed

### If Database Issues
1. Check Neon dashboard (project + branch state)
2. Verify connection string (pooled vs direct)
3. Check for query timeouts in Sentry
4. Scale connection pool if needed
5. Roll back via production migration workflow (PR #90 added this)

### If Real-time Fails
1. Verify Pusher env vars set in Vercel production
2. Check Pusher dashboard for connection count + errors
3. Meetup updates / check-in feed fall back to polling on Pusher failure

---

*Document Version: 3.3*
*Target Launch: Q2 2026 (Beta)*
*Last Updated: 2026-05-19*
*Owner: Development Team*
