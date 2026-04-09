# OutTheGroupchat - Future Implementation Roadmap

## Overview

This document outlines future features, improvements, and technical debt to address for the OutTheGroupchat platform. Items already completed as of 2026-04-08 are marked accordingly.

*Last Updated: 2026-04-08*

---

## Current State Summary (2026-04-08)

The following items from earlier versions of this roadmap have been **completed**:

### Completed from Former "Phase 1: MVP Enhancements"
- [x] **Email Verification** — VerificationToken + email on signup (2026-03-21)
- [x] **Password Reset** — POST/PATCH API + frontend UI (2026-03-14)
- [x] **Activity Management** — Full CRUD via /api/trips/[tripId]/activities
- [x] **Account Settings (partial)** — Profile PATCH with preferences
- [x] **Shared Expenses (partial)** — Budget field on Trip model

### Completed from Former "Technical Debt"
- [x] **TypeScript strict mode** — Enabled, 0 `any` types
- [x] **Error Handling** — Global error boundary, standardized API error responses, pino logging
- [x] **Testing** — 1386 unit/integration tests across 63 Vitest test files; Playwright E2E framework configured (2026-04-07)
- [x] **Rate Limiting** — Upstash Redis on ALL 48 routes (100% coverage, 2026-04-04)
- [x] **Input Sanitization** — Zod on all major API endpoints
- [x] **Security Headers** — HSTS, X-Frame-Options, CSP (2026-03-10)
- [x] **CORS** — Configured in next.config.js (2026-03-23)
- [x] **Itinerary API** — GET/POST/PUT with $transaction atomicity (2026-03-23)
- [x] **GitHub Actions CI** — .github/workflows/ci.yml added
- [x] **Playwright Config** — playwright.config.ts configured
- [x] **Privacy Policy** — /privacy page added (2026-04-07)
- [x] **Terms of Service** — /terms page added (2026-04-07)
- [x] **Trip Deletion UI** — DeleteTripModal wired to DELETE /api/trips/[tripId] (2026-04-07)
- [x] **Trip Editing UI** — EditTripModal wired to PATCH /api/trips/[tripId] (2026-04-06)
- [x] **Sentry captureException** — Active in 8 routes: chat, recommend, signup, generate-itinerary, suggest-activities, ai/search, trips (2026-04-05 to 2026-04-07)

### Completed from Former "Phase 3: Monitoring"
- [x] **Sentry installed and configured** — Needs real DSN in Vercel production
- [x] **Vercel Analytics** — Active in production (2026-03-16)
- [x] **Structured logging** — pino via @/lib/logger (2026-03-09)

---

## Phase 1: Immediate Pre-Beta (Weeks 1-4)

These items are blockers or near-blockers for the Q2 2026 beta launch. See LAUNCH_CHECKLIST.md for the full authoritative list.

### 1.1 Environment & Infrastructure

| Item | Priority | Status |
|------|----------|--------|
| Set OPENAI_API_KEY in Vercel | Critical | Missing |
| Set Pusher env vars in Vercel | Critical | Missing |
| Obtain Sentry DSN + set in Vercel | High | Missing (infrastructure ready, 8 routes instrumented) |
| Verify Resend domain | High | Pending |
| Install Playwright browsers in CI | High | `npx playwright install chromium` needed |
| NEXTAUTH_SECRET rotation (32+ chars) | High | Unverified |

### 1.2 Core Feature Completion

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Trip wizard (multi-step) | High | Medium | Replace single-page form with step-by-step wizard |
| Trip editing flow | Complete | Low | PATCH /api/trips/[tripId] UI — EditTripModal wired (2026-04-06) |
| Trip deletion/archiving | Complete | Low | DELETE + soft-delete UI — DeleteTripModal wired (2026-04-07) |
| Survey frontend integration | High | Medium | Connect survey API to frontend |
| Voting frontend integration | High | Medium | Connect voting API to frontend |
| Real-time vote updates | High | Medium | Pusher event on vote cast |
| Survey results display | Medium | Medium | Results visualization |
| Follow system integration | Medium | Medium | Follow API exists; FollowButton component added (2026-04-01) |

### 1.3 Security Completions

| Item | Priority | Description |
|------|----------|-------------|
| Rate limiting on remaining endpoints | Complete | 48/48 routes covered (2026-04-04) |
| Session timeout configuration | High | NextAuth session maxAge |
| Failed login attempt limiting | High | Track failures per IP/email |
| Form validation errors inline | Medium | Client-side Zod feedback |

---

## Phase 2: Beta Hardening (Month 1-2 Post-Beta)

### 2.1 Authentication Expansion

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| OAuth Providers | High | Low | Google, Apple login via NextAuth |
| Profile Photos | Medium | Low | Avatar upload with S3/Cloudinary |
| Account Deletion | Medium | Medium | GDPR-compliant removal |
| Two-Factor Authentication | Low | Medium | TOTP-based 2FA |

### 2.2 Trip Features

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Trip Templates | High | Medium | Bachelor party, family reunion, weekend getaway |
| Trip Duplication | Medium | Low | Clone existing trip |
| Trip Archiving | Medium | Low | Hide without deleting |
| Shared Expenses | High | High | Split costs, track who owes what |
| Trip Documents | Medium | Medium | Upload confirmations, tickets |
| Departure Cities | High | Medium | Track where each member flies from |

### 2.3 Itinerary Improvements

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Drag-and-Drop Editor | High | High | Reorder activities visually |
| Map Integration | High | High | View itinerary on interactive map |
| Time Conflict Detection | Medium | Medium | Detect overlapping activities |
| Weather Integration | Medium | Medium | Show forecast for each day |
| PDF Export | Low | Low | Print-friendly itinerary export |

### 2.4 Monitoring Completions

| Item | Priority | Complexity | Description |
|------|----------|------------|-------------|
| Uptime monitoring | High | Low | BetterStack or Checkly |
| Status page | High | Low | Public status.outthegroupchat.com |
| Alert channels | High | Low | Slack/email for errors and downtime |
| Log aggregation | Medium | Medium | Centralized log storage |
| Core Web Vitals monitoring | Medium | Low | Vercel Analytics integration |
| Database backup schedule | High | Low | Supabase automated backups |

---

## Phase 3: Booking & Commerce (Month 2-4)

### 3.1 Booking Integrations

| Integration | Priority | Complexity | Description |
|-------------|----------|------------|-------------|
| **Flights** | High | High | Amadeus deep integration (key needed) |
| **Hotels** | High | High | Booking.com affiliate API |
| **Airbnb** | Medium | High | Vacation rentals |
| **Activities** | Medium | Medium | Viator/GetYourGuide |
| **Restaurants** | Low | Medium | OpenTable/Resy |

### 3.2 Payment Features

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Stripe Integration | High | Medium | Payment processing |
| Group Payment Collection | High | High | Collect deposits from members |
| Split Payments | High | High | Pay together or separately |
| Payment Reminders | Medium | Low | Automated nudges |
| Refund Management | Medium | Medium | Handle cancellations |

### 3.3 Price Tracking

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Flight Price Alerts | High | Medium | Notify when prices drop |
| Budget Tracking | High | Medium | Real-time budget vs. actual spend |
| Currency Conversion | Medium | Low | Multi-currency support |
| Price Prediction | Low | High | AI-powered best time to book |

---

## Phase 4: AI & Intelligence (Month 2-4)

### 4.1 Advanced AI Features

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| **Vector Database** | High | High | Migrate from in-memory to pgvector or Pinecone |
| **RAG Pipeline** | High | High | Activity/destination knowledge base |
| **Personalization** | High | High | Learn user preferences over time |
| **Smart Scheduling** | Medium | High | AI optimizes daily schedule |
| **Photo Generation** | Low | Medium | Generate trip preview images |

### 4.2 Natural Language Features

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Trip Search | High | Medium | Natural language: "beach trips under $1000" |
| Voice Input | Medium | Medium | Spoken queries for mobile |
| Multilingual | Low | High | i18n support |

### 4.3 Predictive Features

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Destination Matching | High | Medium | AI suggests perfect destinations |
| Group Compatibility | Medium | High | Predict trip success based on preferences |
| Weather Impact | Medium | Medium | Suggest backup plans automatically |

### 4.4 AI Observability

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Langfuse Tracing | High | Medium | LLM call tracing and cost monitoring |
| Prompt A/B Testing | Medium | Medium | Evaluate prompt variants |
| AI Latency Tracking | High | Low | Track p50/p95/p99 for AI endpoints |

### Target AI Architecture (Future State)

```
+-------------------------------------------------------------------+
|                   Enhanced AI Stack                                |
+-------------------------------------------------------------------+
|                                                                    |
|  +-----------+    +-----------+    +-----------+                  |
|  | Vercel AI |    |  Agents   |    |   Tools   |                  |
|  |    SDK    | -> | (ReAct)   | -> | (Booking) |                  |
|  +-----------+    +-----------+    +-----------+                  |
|        |                                                           |
|        v                                                           |
|  +-----------+    +-----------+    +-----------+                  |
|  |  pgvector |    | Knowledge |    |  Web      |                  |
|  | or Pinecone    |   Base    | <- | Scraping  |                  |
|  +-----------+    +-----------+    +-----------+                  |
|        |                                                           |
|        v                                                           |
|  +-----------+    +-----------+                                    |
|  |  Langfuse |    |   Eval    |                                    |
|  |  Tracing  |    | Pipeline  |                                    |
|  +-----------+    +-----------+                                    |
|                                                                    |
+-------------------------------------------------------------------+
```

---

## Phase 5: Social & Community (Month 3-5)

### 5.1 Social Features

| Feature | Priority | Complexity | Status |
|---------|----------|------------|--------|
| **User Profiles** | High | Medium | Basic profile exists; public profile page added (2026-04-01) |
| **Follow System** | High | Medium | API exists; FollowButton component added (2026-04-01), wired in discover (2026-04-03) |
| **Trip Reviews** | High | Medium | Rate and review completed trips |
| **Activity Sharing** | Medium | Low | Share activities to feed |
| **Group Matching** | Low | High | Find travel buddies |

### 5.2 Communication

| Feature | Priority | Complexity | Status |
|---------|----------|------------|--------|
| **In-App Chat** | High | High | Not yet built |
| **@Mentions** | Medium | Low | Tag members in comments |
| **Push Notifications** | High | Medium | Web push API |
| **Reactions** | Low | Low | Emoji reactions on activities |

### 5.3 Gamification

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Travel Badges | Low | Low | Achievements for trips taken |
| Referral Program | Medium | Medium | Invite friends, earn rewards |

---

## Phase 6: Mobile & Platform (Month 4-6)

### 6.1 Mobile Experience

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| **PWA Optimization** | High | Medium | Better offline, install prompt |
| **Location Features** | Medium | Medium | Nearby activities, check-ins |
| **Offline Mode** | Medium | High | View trips offline via service worker |
| **React Native App** | Low | Very High | Native iOS/Android (post-launch) |

### 6.2 Integrations

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| **Calendar Sync** | High | Medium | Google/Apple/Outlook calendar export |
| **SMS Notifications** | Medium | Medium | Twilio for reminders |
| **WhatsApp** | Medium | High | Share trips via WhatsApp |
| **Slack Bot** | Low | Medium | Trip updates in Slack |

### 6.3 Legal & Compliance

| Item | Priority | Complexity | Description |
|------|----------|------------|-------------|
| Privacy Policy page | Complete | Low | /privacy page added (2026-04-07) |
| Terms of Service page | Complete | Low | /terms page added (2026-04-07) |
| SEO meta tags | Partial | Low | OG/Twitter Card tags added (2026-04-01); all pages need audit |
| GDPR account deletion | Medium | Medium | Permanent data removal flow |

---

## Phase 7: Enterprise & Scale (Post-Beta, 6+ Months)

### 7.1 Infrastructure

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| **CDN for Assets** | High | Low | Already via Vercel Edge |
| **Background Jobs** | High | Medium | Migrate cron to proper queue (BullMQ) |
| **Caching Layer** | Medium | Medium | Redis for hot query results |
| **Horizontal Scaling** | Medium | High | Multi-region deployment |
| **Database Sharding** | Low | Very High | Scale beyond single Supabase DB |

### 7.2 Business Features

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Analytics Dashboard | Medium | Medium | Trip insights and engagement stats |
| Team Plans | Low | Medium | Organization accounts |
| API for Partners | Low | High | Public API for third-party integrations |
| White Label | Low | Very High | B2B solution for travel agencies |

---

## Recommended Implementation Order

```
Q2 2026 — Beta Launch Prep (Current)
+-- Set production env vars (OpenAI, Pusher, Sentry)
+-- Trip wizard + trip editing UI
+-- Survey/voting frontend integration
+-- Uptime monitoring
+-- Privacy Policy + Terms of Service
+-- Beta launch

Q3 2026 — Post-Beta Hardening
+-- OAuth providers (Google)
+-- Stripe + group payments
+-- Shared expenses
+-- Drag-and-drop itinerary editor
+-- PWA optimization + offline mode

Q4 2026 — AI & Booking
+-- Vector DB migration (pgvector)
+-- Flight search (Amadeus)
+-- Price alerts
+-- Personalization engine
+-- Langfuse tracing

Q1 2027 — Social & Mobile
+-- In-app chat
+-- Travel badges + referral program
+-- Calendar sync
+-- Native app exploration
```

---

## Success Metrics

### User Engagement
- Daily Active Users (DAU)
- Trips created per user per month
- Survey completion rate
- Voting participation rate
- AI chat sessions per trip

### Business Metrics
- User acquisition cost (CAC)
- Booking conversion rate (once bookings are live)
- Revenue per trip
- Customer lifetime value (CLV)

### Technical Metrics
- API response time (p50, p95, p99)
- Error rate < 1% (Sentry)
- AI latency (per provider)
- Uptime > 99.9%
- Test coverage (currently 1386 tests across 63 files, targeting > 80% line coverage)

---

*Last Updated: 2026-04-08*
