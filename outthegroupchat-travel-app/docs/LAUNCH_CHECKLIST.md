# 🚀 OutTheGroupchat - Launch Checklist

## Pivot Progress (see docs/REFACTOR_PLAN.md)
- [x] Phase 0: PR backlog merged, `v1.0-trip-planning` tagged
- [x] Phase 1: Trip code archived to `src/_archive/`, tests excluded, Navigation cleaned
- [~] Phase 2: Schema ✅ | Generate ✅ | setup.ts mocks ✅ | Crew rename + `crewLabel` + `activeUntil` on branch `refactor/phase-2-crew-domain` (2026-04-17) | DB migration ⏳ (manual step)
- [x] Phase 3: Crew system (routes + UI) — `/api/crew/*`, `CrewButton`, `CrewList` ✅ 2026-04-18 (PR #46 + #47)
- [x] Phase 4: Meetups core — All 3 sessions complete (2026-04-18): API routes ✅ | venue search (Places API) ✅ | meetup UI (MeetupDetail, AttendeeList, MeetupInviteModal) ✅ | RSVP ✅ | invite ✅ | Pusher real-time ✅ | MEETUP_STARTING_SOON cron ✅ (PRs #48, #49, #51)
- [x] Phase 5: Check-ins + presence — COMPLETE 2026-04-20 (PR #53): POST /api/checkins ✅ | GET /api/checkins/feed ✅ | DELETE /api/checkins/[id] ✅ | GET /api/checkins/[id] ✅ | CheckInButton (duration picker) ✅ | LiveActivityCard ("Join me" wired) ✅ | NearbyCrewList ✅ | /checkins page ✅ | /checkins/[id] page ✅ | Privacy settings page (/settings/privacy) ✅ | /api/users/privacy ✅ | Pusher city-channel broadcast ✅ | All Phase 5 exit criteria met ✅
- [x] Phase 6: Feed/AI/notifications rescope — COMPLETE 2026-04-22 (PR #55): Feed rescoped (meetup/checkin types, trip/activity queries removed, POST returns 410) ✅ | Search people-first (users→meetups→venues) ✅ | 9 trip notification types removed from schema ✅ | Follow marked @deprecated ✅ | types/index.ts cleaned (264 lines) ✅ | All AI routes later deleted 2026-04-23 (ops/kill-all-ai)
- [ ] Phase 7: Marketing surface
- [ ] Phase 8: Launch-readiness re-audit

---

> **⚠️ Scope change (2026-04-16):** This checklist is now STALE against the new social-meetup product. It will be rewritten in Phase 8 of `docs/REFACTOR_PLAN.md`. Trip-era checklist items below remain visible for reference but should **NOT** be used to gate launch. Readiness scores below reflect the archived trip product and are intentionally left unchanged to avoid implying progress against the new scope.
>
> **Target Launch:** Q2 2026 (Beta) — to be re-baselined post-pivot
> **Current Status:** Refactoring (Phase 2 in progress — domain models added, DB migration pending)
> **Last Updated:** 2026-04-30 (V1 Phase 1–5 shipped on main: signal intent, subcrews, heatmap tiers, daily prompt cron + notification settings. Tonight's nightly: +76 tests on intents/subcrews routes, TSC regression fix in seed-heatmap-only.ts.)

---

## 📊 Launch Readiness Score

| Category | Score | Target | Status |
|----------|-------|--------|--------|
| Infrastructure | 92% | 100% | 🟡 Almost Ready |
| Core Features | 77% | 90% | 🟠 In Progress |
| Security | 83% | 100% | 🟠 In Progress |
| Testing | 72% | 80% | 🟠 In Progress |
| Monitoring | 55% | 80% | 🟠 In Progress |

**Overall Readiness: 78%** → Target: 85% for Beta Launch

> Last updated: 2026-04-16

---

## ✅ PHASE 1: Infrastructure (COMPLETE)

### Hosting & Deployment
- [x] Vercel project configured
- [x] Production environment set up
- [x] Build pipeline working
- [x] Auto-deployment from main branch
- [ ] Custom domain configured (optional for beta)
- [x] SSL certificate active (Vercel automatic)

### Database
- [x] Supabase PostgreSQL connected
- [x] Prisma ORM configured
- [x] Connection pooling enabled
- [ ] Database backup schedule configured
- [ ] Database monitoring active

### External Services
- [x] Upstash Redis connected (rate limiting)
- [ ] Sentry DSN set in Vercel — see [`OPS_LAUNCH_CHECKLIST.md#1-sentry-dsn`](./OPS_LAUNCH_CHECKLIST.md#1-sentry-dsn)
- [ ] Pusher env vars set in Vercel (6 vars) — see [`OPS_LAUNCH_CHECKLIST.md#2-pusher-env-vars`](./OPS_LAUNCH_CHECKLIST.md#2-pusher-env-vars)
- [x] Email service configured (Resend) ✅ Dec 17
- [ ] Resend domain verified + `EMAIL_FROM` switched off sandbox — see [`OPS_LAUNCH_CHECKLIST.md#3-resend-domain-verification`](./OPS_LAUNCH_CHECKLIST.md#3-resend-domain-verification)
- [x] .env.example with all required vars ✅ 2026-03-10 (AI provider vars removed 2026-04-23)

---

## 🔧 PHASE 2: Core Features (IN PROGRESS)

### Authentication ✅
- [x] Email/password signup
- [x] Email/password signin
- [x] Session management (NextAuth)
- [x] Password reset flow ✅ 2026-03-14 (API + UI complete)
- [x] Email verification endpoint ✅ 2026-03-19 (GET /api/auth/verify-email created)
- [x] Email verification sending on signup ✅ 2026-03-21 (VerificationToken created + email sent at signup)
- [ ] OAuth providers (Google, Apple) - *Post-beta*

### Trip Management 🔶
- [x] Create trip API
- [x] Trip listing
- [x] Trip detail page
- [ ] Trip wizard (multi-step creation)
- [ ] Trip editing
- [ ] Trip deletion/archiving
- [x] Member invitation via email ✅ Dec 17
- [x] Activity management ✅ Dec 17
- [x] Itinerary route complete (GET/POST/PUT with $transaction atomicity) ✅ 2026-03-23

### Social Features 🔶
- [x] Basic feed display
- [x] Engagement bar UI
- [x] Comments API (Trip support added) ✅ Dec 17
- [x] Reactions/Likes API (Trip support added) ✅ Dec 17
- [x] Share functionality ✅ 2026-03-16 (POST /api/feed/share implemented with Zod + notification)
- [ ] Follow system integration

### Group Coordination 🔶
- [x] Survey API structure
- [x] Voting API structure
- [ ] Survey frontend integration
- [ ] Voting frontend integration
- [ ] Real-time vote updates
- [ ] Survey results display

### AI Features (removed)
- All AI routes, library code, components, and dependencies (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `ai`) deleted 2026-04-23 in `ops/kill-all-ai-2026-04-23`. `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are no longer consumed. Not on the launch path.

---

## 🔒 PHASE 3: Security (CRITICAL)

### Authentication Security
- [x] Password hashing (bcrypt)
- [x] Secure session cookies
- [ ] NEXTAUTH_SECRET is strong (32+ chars)
- [ ] Session timeout configuration
- [ ] Failed login attempt limiting

### API Security
- [x] SQL injection prevention (Prisma)
- [x] Rate limiting infrastructure (Upstash)
- [x] Rate limiting on all authentication endpoints ✅ 2026-03-26 (signup, reset-password, verify-email — rate limiting now first operation)
- [ ] Rate limiting on ALL remaining endpoints
- [x] Input validation on major API routes (Zod) ✅ 2026-03-24 — notifications, feed/comments, feed/engagement, pusher/auth, users/[userId], discover/*, images/search, inspiration, cron, auth/demo added; ai/chat Zod strengthened + JSON.parse safety on 5 AI routes + notifications/[notificationId] ✅ 2026-03-29
- [x] /api/discover/search requires authentication ✅ 2026-03-24 (security improvement — was unauthenticated)
- [x] /api/discover/recommendations requires authentication ✅ 2026-03-24
- [x] /api/auth/demo has Zod input validation ✅ 2026-03-24
- [x] XSS prevention (DOMPurify) ✅ 2026-03-25 (RichFeedItem.tsx)
- [x] CORS configured properly ✅ 2026-03-23 — /api/:path* CORS headers added to next.config.js

### Critical Fixes Required
```
⚠️ MUST FIX BEFORE LAUNCH:

1. [x] Fix in-memory rate limiting → Use Upstash Redis ✅ Dec 2025
   File: src/lib/rate-limit.ts (Redis-based implementation)

2. [x] Fix JWT callback DB query on every request ✅ Dec 2025
   File: src/lib/auth.ts (trigger check on signIn/update only)

3. [x] Remove email from user search ✅ 2026-03-20
   File: src/app/api/search/route.ts

4. [x] Fix placeholder user creation abuse ✅ Dec 2025
   File: src/app/api/trips/[tripId]/invitations/route.ts

5. [x] Fix unauthenticated /api/beta/initialize-password (account takeover) ✅ 2026-03-19
   File: src/app/api/beta/initialize-password/route.ts (N8N_API_KEY auth added)

6. [x] Narrow /api/beta/status response (data minimization) ✅ 2026-03-22
   File: src/app/api/beta/status/route.ts (response now returns only {exists, passwordInitialized})

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
- [ ] Screen reader tested

---

## 📝 PHASE 7: Content & Legal

### Pages Required
- [ ] Privacy Policy
- [ ] Terms of Service
- [ ] About page (optional)
- [ ] Help/FAQ (optional)

### SEO
- [ ] Meta titles on all pages
- [ ] Meta descriptions
- [ ] Open Graph tags
- [ ] Favicon configured

---

## 🚀 LAUNCH DAY CHECKLIST

### T-24 Hours
- [ ] Final production build tested
- [ ] All environment variables verified
- [ ] Database backed up
- [ ] Team notification channels ready
- [ ] Monitoring dashboards accessible

### T-1 Hour
- [ ] Verify DNS propagation
- [ ] Test all critical flows on production
- [ ] Confirm monitoring is working
- [ ] Team on standby

### Launch
- [ ] Deploy final version
- [ ] Verify deployment successful
- [ ] Test signup flow
- [ ] Test trip creation
- [ ] Announce to beta users

### Post-Launch (First 24 Hours)
- [ ] Monitor error rates
- [ ] Monitor server load
- [ ] Respond to user feedback
- [ ] Hot-fix critical issues if needed

---

## 📅 Launch Timeline

```
Week 1 (Dec 16-22)
├── ✅ Infrastructure complete
├── 🔄 Security critical fixes
├── ✅ Core API completion ✅ Dec 17
└── ✅ Comments/Reactions fix ✅ Dec 17

Week 2 (Dec 23-29)
├── Trip wizard integration
├── Email service setup
├── Testing phase
└── UI polish

Week 3 (Dec 30 - Jan 5)
├── Security hardening
├── Monitoring setup
├── Final testing
└── Pre-launch prep

Week 4 (Jan 6-12)
├── Beta user invites
├── **BETA LAUNCH** 🚀
├── Monitor & iterate
└── Collect feedback
```

---

## 🎯 Success Metrics for Beta

| Metric | Target | How to Track |
|--------|--------|--------------|
| User signups | 20-50 | Database count |
| Trips created | 10+ | Database count |
| Error rate | < 1% | Sentry |
| Page load time | < 3s | Vercel Analytics |
| Uptime | > 99% | BetterStack |

---

## 📞 Quick Commands

```bash
# Local Development
npm run dev

# Build & Test
npm run build
npm run lint

# Database
npx prisma studio
npx prisma db push
npx prisma generate

# Deploy
git push origin main  # Auto-deploys to Vercel
```

---

## 🔗 Important Links

| Resource | URL |
|----------|-----|
| Production | https://outthegroupchat-travel-app.vercel.app |
| Vercel Dashboard | https://vercel.com/patrick-cettinas-projects/outthegroupchat-travel-app |
| Supabase Dashboard | (from env vars) |
| Upstash Dashboard | https://console.upstash.com |

---

*This checklist should be reviewed daily during launch preparation.*

*Last Updated: 2026-03-26 - 153 new tests (1156 total, 56 files); rate limiting added as first operation on auth/signup, auth/reset-password, auth/verify-email; newsletter/subscribe now requires auth; ai/search GET+POST fully implemented; dead components removed (NotificationCenter.tsx, SharePreview.tsx); recommendation.service.test.ts, survey.service.test.ts, geocoding-images.test.ts created. Also includes 2026-03-29 changes: JSON.parse safety on 5 AI routes + notifications/[notificationId]; Zod strengthened on ai/chat; notifications/[notificationId] bugfix (read was hardcoded true); JSDoc added to geocoding.ts; 3 new test files (ai-generate-itinerary, ai-suggest-activities, discover-import)*
