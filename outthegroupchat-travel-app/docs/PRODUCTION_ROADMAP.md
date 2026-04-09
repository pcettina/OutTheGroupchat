# OutTheGroupchat - Production Deployment & Feature Roadmap

> **Target:** Q2 2026 Beta Launch
> **Version:** 3.1 | **Last Updated:** 2026-04-08

---

## Current System Status (as of 2026-04-08)

### Overall Launch Readiness: 86% (Target: 85% for Beta)

| Category | Score | Target | Status |
|----------|-------|--------|--------|
| Infrastructure | 96% | 100% | Almost Ready |
| Core Features | 85% | 90% | In Progress |
| Security | 90% | 100% | In Progress |
| Testing | 85% | 80% | Exceeds Target |
| Monitoring | 65% | 80% | In Progress |

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
| Rate Limiting | Working | Upstash Redis-based on all major routes |
| CORS | Working | Configured in next.config.js (2026-03-23) |
| Security Headers | Working | HSTS, X-Frame-Options, CSP in next.config.js (2026-03-10) |
| Error Boundaries | Working | global-error.tsx, error.tsx, not-found.tsx |
| Sentry | Partial | Installed & configured, captureException in 8 routes; needs real DSN in Vercel |
| Real-time (Pusher) | Partial | Configured; env vars missing in production |
| Accessibility | Good | Skip links, ARIA patterns |
| Responsive Design | Good | Mobile-first, 44px touch targets |
| Privacy Policy | Working | /privacy page added (2026-04-07) |
| Terms of Service | Working | /terms page added (2026-04-07) |
| Trip Deletion UI | Working | DeleteTripModal wired to DELETE /api/trips/[tripId] (2026-04-07) |
| GitHub Actions CI | Working | .github/workflows/ci.yml added |
| Playwright Config | Working | playwright.config.ts configured |

### Active Blockers (Must Fix Before Launch)

| Issue | Priority | Status |
|-------|----------|--------|
| OPENAI_API_KEY not set in Vercel | Critical | Blocked by config |
| Pusher env vars missing in production | High | Blocked by config |
| Sentry DSN not set in Vercel | High | Blocked by config |
| Resend domain not verified | Medium | Email may go to spam |
| Rate limiting on ALL endpoints | Complete | 48/48 routes covered (2026-04-04) |
| NEXTAUTH_SECRET strength unverified | Medium | Manual check needed |
| Playwright browsers not in CI | High | `npx playwright install chromium` needed |

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

- Rate limiting on ALL 48 API routes complete (2026-04-04)
- Sentry captureException in 8 routes: chat, recommend, signup, generate-itinerary, suggest-activities, ai/search, trips GET/POST, trips/[tripId] GET/PATCH/DELETE (2026-04-05 to 2026-04-07)
- Test suite expanded to 1386 tests across 63 test files (2026-04-07)
- Privacy Policy page added at /privacy (2026-04-07)
- Terms of Service page added at /terms (2026-04-07)
- DeleteTripModal wired to DELETE /api/trips/[tripId] with owner permission guard (2026-04-07)
- EditTripModal wired to PATCH /api/trips/[tripId] (2026-04-06)
- Discover page wired to /api/discover/search with debounce and loading states (2026-04-06)
- GitHub Actions CI workflow added (.github/workflows/ci.yml)
- Playwright configuration added (playwright.config.ts)
- Notifications optimistic mark-as-read with error toast (2026-04-06)
- Email exposure security fix in members/invitations endpoints
- beta/status migrated from in-memory to Redis rate limiting (2026-04-07)
- JSDoc @module blocks added to email.ts, rate-limit.ts (2026-04-07)
- discover/import now returns 502 for upstream failures, 500 for internal errors (2026-04-07)
- setup.ts: Sentry mock added to prevent module-level logger.child crash in tests (2026-04-07)
- Security score raised to 9/10 (from 8/10)

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
[x] Rate limiting on ALL endpoints — 48/48 complete (2026-04-04)
[x] XSS prevention (DOMPurify) — verified active
[x] Trip editing flow — EditTripModal wired (2026-04-06)
[x] Trip deletion/archiving — DeleteTripModal wired (2026-04-07)
[ ] Trip wizard (multi-step creation)
```

### Phase 2: Core Feature Completion

```
[ ] Survey frontend integration
[ ] Voting frontend integration
[ ] Real-time vote updates via Pusher
[ ] Survey results display
[ ] Follow system integration (API exists; frontend partial)
[x] No search results empty state — discover page wired (2026-04-06)
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
[x] Privacy Policy page — /privacy added (2026-04-07)
[x] Terms of Service page — /terms added (2026-04-07)
[x] Open Graph tags — OG/Twitter Card meta tags added (2026-04-01)
[ ] Meta titles/descriptions on all pages (partial)
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
- [x] Input validation on major API routes (Zod)
- [x] SQL injection prevention (Prisma)
- [x] XSS prevention (React handles, plus DOMPurify installed)
- [x] CORS configured (next.config.js, 2026-03-23)
- [x] Security headers (HSTS, X-Frame-Options, CSP — 2026-03-10)
- [x] Rate limiting on ALL 48 endpoints (complete 2026-04-04)
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
- [x] Email exposure removed from members/invitations endpoints (2026-04-04 to 2026-04-06)
- [x] API key prefix logging removed from ai/chat and email service (security fix 2026-04-06)
- [x] beta/status migrated from in-memory to Redis rate limiting (2026-04-07)
- [x] Security score: 9/10 (updated 2026-04-08)

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
*Last Updated: 2026-04-08*
*Owner: Development Team*
