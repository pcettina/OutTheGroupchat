# OutTheGroupchat - Production Deployment & Feature Roadmap

> **Target:** Q2 2026 Beta Launch
> **Version:** 3.1 | **Last Updated:** 2026-04-05

---

## Current System Status (as of 2026-04-05)

### Overall Launch Readiness: 82% (Target: 85% for Beta)

| Category | Score | Target | Status |
|----------|-------|--------|--------|
| Infrastructure | 93% | 100% | Almost Ready |
| Core Features | 80% | 90% | In Progress |
| Security | 91% | 100% | In Progress |
| Testing | 80% | 80% | Met |
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
| Discover Page | Working | Auth-guarded (2026-03-24); category filters, search |
| Inspiration Page | Working | Zod coerce.number on query params |
| Trip Creation | Working | Basic creation working; wizard flow pending |
| Trip Itinerary | Working | GET/PUT with $transaction atomicity (2026-03-23) |
| AI Chat Assistant | Working | OpenAI connected, streaming; 503 guard when key absent |
| AI Activity Suggestions | Working | 503 guard when OPENAI_API_KEY absent (2026-03-23) |
| AI Itinerary Generation | Working | 503 guard when OPENAI_API_KEY absent (2026-03-23) |
| Survey API | Working | API structure complete; frontend integration pending |
| Voting API | Working | API structure complete; frontend integration pending |
| Member Invitations | Working | Email-based via Resend |
| Rate Limiting | Working | Upstash Redis-based on ALL 48 routes (100% coverage as of 2026-04-05) |
| CORS | Working | Configured in next.config.js (2026-03-23) |
| Security Headers | Working | HSTS, X-Frame-Options, CSP in next.config.js (2026-03-10) |
| Error Boundaries | Working | global-error.tsx, error.tsx, not-found.tsx |
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
| Rate limiting not on ALL endpoints | Medium | ✅ RESOLVED (2026-04-05, 48/48 routes) |
| NEXTAUTH_SECRET strength unverified | Medium | Manual check needed |
| Playwright browsers not installed in CI | Medium | `npx playwright install chromium` needed |

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

### April 2026 Sprint (In Progress)

- Rate limiting extended to ALL 48 routes (100% coverage — 2026-04-05)
- Email exposure fixed in trips/members, trips/invitations, trips/[tripId] routes (2026-04-04)
- Zod validation added to ai/suggest-activities, ai/chat (2026-04-04)
- Dead component removal: SignUpForm.tsx deleted (2026-04-04)
- Trip members management page created at /trips/[tripId]/members (2026-04-04)
- Public user profile page at /profile/[userId] (2026-04-01)
- Social components: FollowButton, EditTripModal, DeleteTripModal (2026-04-01)
- OG/Twitter Card meta tags on layout (2026-04-01)
- Settings and onboarding pages (2026-03-31)
- Test suite grown to 1370+ tests across 64 files, 0 failures (2026-04-05)
- JSDoc added to survey.service.ts, lib/api interface files (2026-04-04)

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
[x] Rate limiting on remaining unguarded endpoints — DONE (2026-04-05, 48/48)
[x] XSS prevention (DOMPurify) — installed and active
[ ] Trip editing flow — EditTripModal component exists; wired to trips/[tripId] page
[ ] Trip deletion/archiving — DeleteTripModal component exists; wired to trips/[tripId] page
[ ] Trip wizard (multi-step creation)
```

### Phase 2: Core Feature Completion

```
[ ] Survey frontend integration
[ ] Voting frontend integration
[ ] Real-time vote updates via Pusher
[ ] Survey results display
[ ] Follow system integration
[ ] No search results empty state
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
[x] Privacy Policy page — created (2026-04-05)
[x] Terms of Service page — created (2026-04-05)
[x] Open Graph tags — added to layout (2026-04-01)
[ ] Meta titles/descriptions on all pages
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
- [x] Rate limiting on ALL 48 endpoints (Upstash — 100% coverage as of 2026-04-05)
- [x] Input validation on all major API routes (Zod)
- [x] SQL injection prevention (Prisma)
- [x] XSS prevention (React handles, plus DOMPurify installed)
- [x] CORS configured (next.config.js, 2026-03-23)
- [x] Security headers (HSTS, X-Frame-Options, CSP — 2026-03-10)
- [x] Email exposure fixed in members, invitations, trip routes (2026-04-04)
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
- [x] Email exposure fixed in trips/[tripId]/members, invitations, route (2026-04-04)
- [x] Zod validation added to ai/suggest-activities, ai/chat (2026-04-04)

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
*Last Updated: 2026-04-05*
*Owner: Development Team*
