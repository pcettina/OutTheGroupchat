# OutTheGroupchat - Production Deployment & Feature Roadmap

> **Target:** Q2 2026 Beta Launch
> **Version:** 3.3 | **Last Updated:** 2026-04-23

---

## Pivot Status (2026-04-23)

- **Active refactor phase:** Phase 8 — Launch-readiness re-audit
- **Phases complete:** Phases 0–7 (see docs/REFACTOR_PLAN.md for details)
- **Phases remaining:** Phase 8 (active — launch-readiness hardening)
- **Pre-pivot tag:** v1.0-trip-planning (git tag, recoverable)
- **AI removal:** All AI routes, lib, components, and deps (`@ai-sdk/*`, `ai`) deleted 2026-04-23 (PR #65 `ops/kill-all-ai-2026-04-23`). This reduces dependency footprint and eliminates the OPENAI_API_KEY requirement.
- **Design sprint complete:** Last Call landing page, brand palette (`otg.*` Tailwind namespace), Fontshare fonts, dark-mode default, Hybrid Exit logo mark (PRs #61–#64).

---

## Current System Status (as of 2026-04-23)

### Codebase Health Snapshot

| Metric | Value |
|--------|-------|
| Tests passing (main) | 1,108 (47 test files) |
| API routes | 45 (AI routes removed; all rate-limited) |
| TypeScript files | ~260 |
| `any` types | 0 |
| `console.*` in prod | 0 |
| Files > 600 lines (prod) | 0 |
| Build | PASS |
| Lint warnings | 0 |
| TSC errors | 0 |
| Security score | 9/10 |
| Sentry coverage | 19/45 routes |
| GitHub Actions CI | Passing |

### Overall Launch Readiness: ~85% — Phase 8 re-audit active; primary blockers are production env vars (Sentry DSN, Pusher, Resend domain)

| Category | Score | Target | Status |
|----------|-------|--------|--------|
| Infrastructure | 95% | 100% | Almost Ready |
| Core Features | 90% | 90% | Met (Phases 0–7 complete) |
| Security | 90% | 100% | In Progress |
| Testing | 85% | 80% | Met |
| Monitoring | 65% | 80% | In Progress (Sentry DSN missing in Vercel) |

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
| AI features | Removed | All AI routes, lib (`src/lib/ai`), components (`src/components/ai`), and deps (`@ai-sdk/*`, `ai`) deleted 2026-04-23 (PR #65) |
| Survey API | Working | API structure complete; frontend integration pending |
| Voting API | Working | API structure complete; frontend integration pending |
| Member Invitations | Working | Email-based via Resend |
| Rate Limiting | Working | Upstash Redis-based on all major routes |
| CORS | Working | Configured in next.config.js (2026-03-23) |
| Security Headers | Working | HSTS, X-Frame-Options, CSP in next.config.js (2026-03-10) |
| Error Boundaries | Working | global-error.tsx, error.tsx, not-found.tsx |
| Sentry | Partial | 19/45 routes instrumented (2026-04-16); needs real DSN in Vercel |
| Real-time (Pusher) | Partial | Configured; env vars missing in production |
| Accessibility | Good | Skip links, ARIA patterns |
| Responsive Design | Good | Mobile-first, 44px touch targets |

### Active Blockers (Must Fix Before Launch)

| Issue | Priority | Status |
|-------|----------|--------|
| Sentry DSN not set in Vercel | High | Blocked by config |
| Pusher env vars missing in production | High | Blocked by config (real-time features disabled) |
| Resend domain not verified | Medium | Email may go to spam |
| NEXTAUTH_SECRET strength unverified | Medium | Manual check needed |
| Rate limiting not on ALL endpoints | Medium | RESOLVED — 45/45 routes covered |
| OPENAI_API_KEY not set in Vercel | N/A | RESOLVED — AI surface fully removed (PR #65) |

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

- Test suite at 1,108 tests on main (47 test files)
- **AI surface fully removed** — all `/api/ai/*` routes, `@ai-sdk/*` deps, `src/lib/ai`, `src/components/ai` deleted (PR #65, 2026-04-23); dependency footprint reduced
- **Design sprint:** Last Call landing page, brand palette (`otg.*` Tailwind namespace), Fontshare fonts, dark-mode default, Hybrid Exit logo mark (PRs #61–#64, 2026-04-22)
- Phase 7 complete: About page, OG/Twitter Card tags, email-auth.ts extraction, RichFeedItem refactor 717→337 lines (PR #56, 2026-04-22)
- Phase 8 active: Launch-readiness re-audit, middleware gap fixed, LAUNCH_CHECKLIST rewritten meetup-centric
- Rate limiting expanded to all 45 active API routes (45/45 — 100% coverage)
- Security score raised to 9/10 (JSDoc, Zod coerce, input sanitization)
- Sentry error monitoring at 19/45 routes (2026-04-16)
- beta/status route migrated from in-memory Map to Redis checkRateLimit (2026-04-16)
- GitHub Actions CI pipeline added (.github/workflows/ci.yml) with TSC, lint, Vitest, Playwright
- Privacy + Terms of Service pages added
- JSDoc added across 14+ lib/service files
- Dead components removed: DestinationCard, CategoryFilter, TrendingSection, TravelBadges

---

## Remaining Work Before Beta Launch

### Phase 1: Critical Fixes (Do First)

```
[ ] Set Pusher env vars in Vercel production
[ ] Obtain real Sentry DSN + set in Vercel
[ ] Verify Resend domain for email deliverability
[ ] NEXTAUTH_SECRET rotation (32+ chars)
[ ] Session timeout configuration
[ ] Failed login attempt limiting
[x] Rate limiting on all endpoints (COMPLETE — 45/45 covered)
[x] AI routes removed — OPENAI_API_KEY no longer required (PR #65)
[ ] XSS prevention (DOMPurify) verification
[ ] Expand Sentry to remaining routes (19/45 instrumented)
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
[ ] Privacy Policy page
[ ] Terms of Service page
[ ] Meta titles/descriptions on all pages
[ ] Open Graph tags
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
|  +---------------+    +---------------+                               |
|  |  Sentry       |    |  BetterStack  |                               |
|  |  [needs DSN]  |    |  [pending]    |                               |
|  +---------------+    +---------------+                               |
|                                                                        |
+-----------------------------------------------------------------------+
```

### Actual Database: Neon PostgreSQL
> Note: Migrated from Supabase to Neon (via Vercel Marketplace) on 2026-04-17. Connected via Prisma 5.22.0. Neon branch-per-PR workflow active.

### Cost Estimation (Monthly)

| Service | Free Tier | Starter | Growth |
|---------|-----------|---------|--------|
| **Vercel** (Hosting) | $0 | $20 | $70 |
| **Neon** (Database) | $0 | $19 | $69 |
| **Upstash** (Redis) | $0 (10k/day) | $10 | $25 |
| **Pusher** (Real-time) | $0 (200k msg) | $49 | $99 |
| **Sentry** (Errors) | $0 (5k events) | $26 | $80 |
| **Total** | **~$0-20** | **~$124** | **~$343** |

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
- [x] Rate limiting on ALL 45 active endpoints (COMPLETE — 2026-04-16)
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

---

*Document Version: 3.3*
*Target Launch: Q2 2026 (Beta)*
*Last Updated: 2026-04-23*
*Owner: Development Team*
