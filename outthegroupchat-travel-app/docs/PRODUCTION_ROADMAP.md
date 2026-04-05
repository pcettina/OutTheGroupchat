# OutTheGroupchat - Production Deployment & Feature Roadmap

> **Target:** Q2 2026 Beta Launch
> **Version:** 3.1 | **Last Updated:** 2026-04-04

---

## Current System Status (as of 2026-04-04)

### Overall Launch Readiness: 81% (Target: 85% for Beta)

| Category | Score | Target | Status |
|----------|-------|--------|--------|
| Infrastructure | 92% | 100% | Almost Ready |
| Core Features | 80% | 90% | In Progress |
| Security | 88% | 100% | In Progress |
| Testing | 78% | 80% | Near Target |
| Monitoring | 55% | 80% | In Progress |

### Implemented & Working

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication (Email/Password) | Working | NextAuth with credentials provider |
| Email Verification | Working | VerificationToken created + email sent at signup (2026-03-21) |
| Password Reset | Working | API + UI complete (2026-03-14) |
| Navigation & Routing | Working | App Router, all pages functional |
| Feed System | Working | Basic feed with engagement bar |
| Like/React System | Working | Optimistic updates, emoji reactions |
| Comment System | Working | Trip support added |
| Share Modal | Working | POST /api/feed/share implemented with Zod + notification |
| Profile Page | Working | Full profile with stats, preferences |
| Public User Profile | Working | /profile/[userId] page added (2026-04-01) |
| Discover Page | Working | Auth-guarded (2026-03-24); category filters, search; FollowButton integrated (2026-04-03) |
| Inspiration Page | Working | Zod coerce.number on query params |
| Trip Creation | Working | Basic creation working; wizard flow pending |
| Trip Editing | Working | EditTripModal with owner/admin permission check (2026-04-01) |
| Trip Deletion | Working | DeleteTripModal with owner-only check (2026-04-01) |
| Trip Members Page | Working | /trips/[tripId]/members page (2026-04-01); linked from trip nav (2026-04-03) |
| Trip Itinerary | Working | GET/PUT with $transaction atomicity (2026-03-23) |
| AI Chat Assistant | Working | OpenAI connected, streaming; 503 guard when key absent |
| AI Activity Suggestions | Working | 503 guard when OPENAI_API_KEY absent (2026-03-23) |
| AI Itinerary Generation | Working | 503 guard when OPENAI_API_KEY absent (2026-03-23) |
| Survey API | Working | API structure complete; frontend integration pending |
| Voting API | Working | API structure complete; frontend integration pending |
| Member Invitations | Working | Email-based via Resend |
| Rate Limiting | Working | Upstash Redis-based on nearly all routes (expanded to 14 more routes 2026-04-04) |
| CORS | Working | Configured in next.config.js (2026-03-23) |
| Security Headers | Working | HSTS, X-Frame-Options, CSP in next.config.js (2026-03-10) |
| Error Boundaries | Working | global-error.tsx, error.tsx, not-found.tsx |
| OG / Social Meta Tags | Working | Full Open Graph + Twitter Card meta on all major pages (2026-04-01) |
| Sentry | Partial | Installed & configured; needs real DSN in Vercel |
| Real-time (Pusher) | Partial | Configured; env vars missing in production |
| Accessibility | Good | Skip links, ARIA patterns |
| Responsive Design | Good | Mobile-first, 44px touch targets |

### Active Blockers (Must Fix Before Launch)

| Issue | Priority | Status |
|-------|----------|--------|
| OPENAI_API_KEY not set in Vercel | Critical | Blocked by config |
| Pusher env vars missing in production | High | Blocked by config |
| Sentry DSN not set in Vercel | High | Blocked by config |
| Resend domain not verified | Medium | Email may go to spam |
| Rate limiting on a few remaining edge endpoints | Low | Near complete |
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

### March–April 2026 Sprint (In Progress)

- `img` → `next/image` migration complete (0 remaining)
- `console.*` cleanup complete (0 in production code)
- `any` type elimination complete (0 remaining)
- Zod validation on all major API routes
- Test suite from 0 to 1341+ tests (63 test files) — 0 failures
- Vitest + Testing Library configured
- Playwright E2E framework configured (browsers need `npx playwright install chromium`)
- Password reset API + UI complete
- Email verification endpoint created and wired into signup
- Global error boundary + custom 404/500 pages
- Sentry installed and configured (needs production DSN)
- Vercel Analytics enabled
- Structured logging via pino (`@/lib/logger`)
- Security hardening: /api/beta/initialize-password, /api/beta/status, /api/auth/demo
- CORS configured (next.config.js)
- Security headers added (HSTS, X-Frame-Options, CSP)
- InviteMemberModal component
- /api/feed/share implemented
- discover/* routes require authentication (2026-03-24)
- auth/demo Zod input validation (2026-03-24)
- Trip members management page /trips/[tripId]/members (2026-04-01)
- Public profile page /profile/[userId] (2026-04-01)
- EditTripModal + DeleteTripModal with permission checks (2026-04-01)
- FollowButton component in discover user cards (2026-04-03)
- Full Open Graph + Twitter Card meta tags on all major pages (2026-04-01)
- Email exposure fixed: members, invitations, trips endpoints (2026-04-03)
- Auth bug fixed: flights/suggestions use TripMember.userId (2026-04-03)
- Rate limiting expanded to 14 more routes (2026-04-04)
- Members nav link added to trip detail page (2026-04-03)

---

## Remaining Work Before Beta Launch

### Phase 1: Critical Fixes (Do First)

```
[ ] Set OPENAI_API_KEY in Vercel production
[ ] Set Pusher env vars in Vercel production
[ ] Obtain real Sentry DSN + set in Vercel
[ ] Verify Resend domain for email deliverability
[ ] NEXTAUTH_SECRET rotation (32+ chars)
[ ] Session timeout configuration
[ ] Failed login attempt limiting
[x] Rate limiting on remaining major endpoints (expanded 2026-04-04 — near complete)
[x] XSS prevention (DOMPurify) — installed and active
[x] Trip editing flow — EditTripModal complete (2026-04-01)
[x] Trip deletion/archiving — DeleteTripModal complete (2026-04-01)
[ ] Trip wizard (multi-step creation)
```

### Phase 2: Core Feature Completion

```
[ ] Survey frontend integration
[ ] Voting frontend integration
[ ] Real-time vote updates via Pusher
[ ] Survey results display
[x] Follow system integration — FollowButton component active in discover (2026-04-03)
[x] No search results empty state — SearchResults empty state added (2026-04-01)
[ ] Form validation errors inline
```

### Phase 3: Pre-Beta Infrastructure

```
[ ] Uptime monitoring (BetterStack/Checkly)
[ ] Status page
[ ] Alert channels (Slack/Email)
[ ] Log aggregation
[ ] Database backup schedule
[ ] Playwright browsers installed in CI
[ ] Auth flow E2E tests complete
[ ] Custom domain (optional for beta)
```

### Phase 4: Legal & Content

```
[x] Privacy Policy page — added (2026-03-31)
[x] Terms of Service page — added (2026-03-31)
[x] Meta titles/descriptions on all pages — buildMetadata() helper + layout (2026-04-01)
[x] Open Graph tags — full OG + Twitter Card meta (2026-04-01)
[ ] Favicon configured
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
|  | Supabase      |    |  Upstash      |    |  Pusher           |      |
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

### Actual Database: Supabase PostgreSQL
> Note: An earlier version of this document referenced PlanetScale (MySQL). The actual database is Supabase PostgreSQL, connected via Prisma 5.22.0.

### Cost Estimation (Monthly)

| Service | Free Tier | Starter | Growth |
|---------|-----------|---------|--------|
| **Vercel** (Hosting) | $0 | $20 | $70 |
| **Supabase** (Database) | $0 | $25 | $100 |
| **Upstash** (Redis) | $0 (10k/day) | $10 | $25 |
| **Pusher** (Real-time) | $0 (200k msg) | $49 | $99 |
| **OpenAI** (AI) | Pay-as-go | ~$20 | ~$100 |
| **Sentry** (Errors) | $0 (5k events) | $26 | $80 |
| **Total** | **~$0-20** | **~$150** | **~$474** |

---

## Security Checklist

### Critical (Must Have Before Beta)

- [x] HTTPS only (Vercel handles this)
- [ ] NEXTAUTH_SECRET is strong (32+ chars) — verify
- [x] Database credentials not in code
- [x] API keys not exposed to client
- [x] Rate limiting on major endpoints (Upstash)
- [x] Rate limiting expanded to invitations, profile, users, pusher, notifications, feed, activities, survey, voting, members (2026-04-04)
- [x] Input validation on major API routes (Zod)
- [x] SQL injection prevention (Prisma)
- [x] XSS prevention (React handles, plus DOMPurify installed)
- [x] CORS configured (next.config.js, 2026-03-23)
- [x] Security headers (HSTS, X-Frame-Options, CSP — 2026-03-10)
- [ ] Rate limiting on remaining edge endpoints
- [ ] Session timeout configuration
- [ ] Failed login attempt limiting

### Completed Security Fixes

- [x] In-memory rate limiting replaced with Upstash Redis
- [x] JWT callback DB query optimized (signIn/update only)
- [x] Email removed from user search (privacy)
- [x] Placeholder user creation abuse fixed (PendingInvitation model)
- [x] /api/beta/initialize-password protected by N8N_API_KEY auth (2026-03-19)
- [x] /api/beta/status response narrowed to {exists, passwordInitialized} (2026-03-22)
- [x] /api/auth/demo guarded by DEMO_MODE env var (2026-03-22)
- [x] /api/discover/search requires auth (2026-03-24)
- [x] /api/discover/recommendations requires auth (2026-03-24)
- [x] Email exposure fixed in trips/members, trips/invitations, trips/route (2026-04-03)
- [x] Auth bug fixed: flights/suggestions membership check uses userId (2026-04-03)
- [x] GET members endpoint: membership check before data fetch (2026-04-03)

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

### User Targets

- [ ] 20-50 beta users signed up
- [ ] 10+ trips created
- [ ] Survey/voting flows tested end-to-end

---

## Emergency Procedures

### If Site Goes Down
1. Check Vercel status page
2. Check Supabase status
3. Review Sentry for errors
4. Check BetterStack alerts (once configured)
5. Rollback to previous deployment if needed

### If Database Issues
1. Check Supabase dashboard
2. Verify connection string
3. Check for query timeouts in Sentry
4. Scale connection pool if needed

### If AI Not Working
1. Verify OPENAI_API_KEY is set in Vercel environment
2. Check OpenAI status page
3. Routes return 503 gracefully when key absent (implemented 2026-03-23)
4. Fall back to manual itinerary planning UI

---

*Document Version: 3.1*
*Target Launch: Q2 2026 (Beta)*
*Last Updated: 2026-04-04*
*Owner: Development Team*
