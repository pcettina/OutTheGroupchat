# OutTheGroupchat - Future Implementation Roadmap

## Overview

This document outlines future features, improvements, and technical debt to address for the OutTheGroupchat platform. The product has pivoted from trip planning to a **meetup-centric social network** — connecting friend crews for real-world hangouts, check-ins, and spontaneous meetups.

Items completed as of 2026-04-22 are marked accordingly.

*Last Updated: 2026-04-22*

---

## Current State Summary (2026-04-22)

### Completed — Core Platform (Phases 1–6)

- [x] **Authentication** — Email/password, verification token, password reset, demo mode
- [x] **Crew System** — Mutual crew relationships (replaced follow/trip member model), crew labels, activeUntil expiry
- [x] **Meetups** — Full CRUD, RSVP, invites, MeetupDetail page, Google Places venue search, Pusher real-time, MEETUP_STARTING_SOON cron
- [x] **Check-ins** — POST/GET/DELETE, duration picker (30 min–12 h), activeUntil clamping, CREW visibility, Pusher city-channel broadcast, crew notification dispatch
- [x] **Feed** — Rescoped to Meetups / Check-ins / Crews tabs (trip content removed)
- [x] **Notifications** — 8 social notification types active; 9 trip types removed; optimistic mark-as-read
- [x] **Rate Limiting** — Upstash Redis on all high-risk routes
- [x] **Input Sanitization** — Zod on all API endpoints
- [x] **Security Headers** — HSTS, X-Frame-Options, CSP
- [x] **Sentry** — Installed and wired to 19+ routes; real DSN missing in Vercel
- [x] **Testing** — 1048 Vitest tests passing across 55+ test files; Playwright E2E framework configured
- [x] **Neon PostgreSQL** — Migrated from Supabase 2026-04-17; branch-per-PR workflow active
- [x] **Privacy Settings** — Nav link and settings page live

---

## Phase 1: Immediate Pre-Beta (Weeks 1-4)

These items are blockers or near-blockers for the Q2 2026 beta launch. See LAUNCH_CHECKLIST.md for the authoritative list.

### 1.1 Environment & Infrastructure

| Item | Priority | Status |
|------|----------|--------|
| Set OPENAI_API_KEY in Vercel | Critical | Missing |
| Set Pusher env vars in Vercel | Critical | Missing |
| Obtain Sentry DSN + set in Vercel | High | Missing |
| Verify Resend domain | High | Pending |
| NEXTAUTH_SECRET rotation (32+ chars) | High | Unverified |
| Install Playwright browsers in CI | Medium | `npx playwright install chromium` needed |

### 1.2 Core Feature Completion

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Marketing landing page | High | Medium | Replace placeholder with product-focused landing page |
| OG tags / SEO meta | High | Low | All pages need titles, descriptions, Open Graph tags |
| Block / report user flows | High | Medium | Critical moderation tooling before public launch |
| Age verification | High | Medium | Required for nightlife/bar venue context |
| Meetup editing UI | Medium | Low | PATCH /api/meetups/[id] wired to frontend |
| Meetup cancellation flow | Medium | Low | Cancel + notify RSVPs via email |

### 1.3 Security Completions

| Item | Priority | Description |
|------|----------|-------------|
| Rate limiting on remaining endpoints | High | Ensure 100% route coverage |
| Session timeout configuration | High | NextAuth session maxAge |
| Failed login attempt limiting | High | Track failures per IP/email |
| Form validation errors inline | Medium | Client-side Zod feedback |

---

## Phase 2: Social Discovery (Month 1-2 Post-Beta)

### 2.1 Location-Based Discovery

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Find meetups near you | High | High | Geospatial query by lat/lng radius; show active meetups on map |
| City-channel presence scaling | High | Medium | Shard Pusher city channels by geo-grid cell as user count grows |
| Venue-tagged check-ins | High | Medium | Tag a check-in to a Google Places venue for discoverability |
| Nearby crew detection | Medium | Medium | Surface crew members active in same city/neighborhood |
| Map view for active check-ins | Medium | High | Interactive map of who's out tonight |

### 2.2 Push Notifications

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Web Push API (PWA) | High | Medium | Browser push for nearby crew check-ins |
| Push for meetup RSVP confirmations | High | Low | Confirm RSVP via push, not just email |
| Push for MEETUP_STARTING_SOON | High | Low | Supplement existing email dispatch |
| Push opt-in / notification preferences | Medium | Low | Per-type toggle in Privacy Settings |

### 2.3 Authentication Expansion

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| OAuth Providers | High | Low | Google, Apple login via NextAuth |
| Profile Photos | Medium | Low | Avatar upload with S3/Cloudinary |
| Account Deletion | Medium | Medium | GDPR-compliant permanent data removal |
| Two-Factor Authentication | Low | Medium | TOTP-based 2FA |

### 2.4 Monitoring Completions

| Item | Priority | Complexity | Description |
|------|----------|------------|-------------|
| Uptime monitoring | High | Low | BetterStack or Checkly |
| Status page | High | Low | Public status.outthegroupchat.com |
| Alert channels | High | Low | Slack/email for errors and downtime |
| Log aggregation | Medium | Medium | Centralized log storage (e.g. Axiom) |
| Core Web Vitals monitoring | Medium | Low | Vercel Analytics integration |
| Database backup schedule | High | Low | Neon automated backups verified |

---

## Phase 3: Content & Community (Month 2-4)

### 3.1 Meetup Photo Sharing / Recaps

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Photo upload on meetup | High | High | Upload photos to a meetup post-event |
| Meetup recap page | High | Medium | Summary view: attendees, venue, photos, duration |
| Photo feed on profile | Medium | Medium | User's past meetup photos publicly visible |
| Crew photo albums | Medium | High | Shared album per crew, auto-tagged from meetups |

### 3.2 In-App Messaging

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Direct messages (DMs) | High | High | 1:1 messaging between crew members |
| Crew group chat | High | High | Group thread per crew |
| @Mentions in comments | Medium | Low | Tag members in feed comments |
| Message reactions | Low | Low | Emoji reactions on messages |

### 3.3 Gamification & Engagement

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Meetup streaks | Medium | Low | Consecutive weeks with at least one meetup |
| Crew activity score | Medium | Medium | Score based on check-ins, meetups, photos |
| Badges / achievements | Low | Low | First check-in, 10 meetups, crew creator |
| Referral program | Medium | Medium | Invite friends, earn rewards |

---

## Phase 4: Safety & Trust (Month 2-5)

### 4.1 Moderation

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Block user | High | Low | Bilateral block, hide from feeds and searches |
| Report user / meetup | High | Medium | Flag inappropriate content to moderation queue |
| Admin moderation dashboard | High | High | Internal tool to review reports, ban users |
| Automated content moderation | Medium | High | AI-assisted flagging of photos/text |

### 4.2 Age & Identity

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Age verification gate | High | Medium | Confirm 21+ for bar/nightlife meetup categories |
| Phone number verification | Medium | Low | SMS OTP on registration (Twilio) |
| ID verification (optional) | Low | High | Third-party KYC for high-trust contexts |

### 4.3 Legal & Compliance

| Item | Priority | Complexity | Description |
|------|----------|------------|-------------|
| Privacy Policy page | High | Low | Live at /privacy — verify content is current |
| Terms of Service page | High | Low | Live at /terms — verify content is current |
| GDPR account deletion | Medium | Medium | Permanent data removal flow |
| CCPA compliance audit | Medium | Low | California data rights |

---

## Phase 5: AI & Intelligence (Month 3-5)

### 5.1 Meetup Intelligence

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| AI meetup suggestions | High | Medium | Suggest meetup times/venues based on crew patterns |
| Crew compatibility scoring | Medium | High | Recommend crews or people to add based on overlap |
| Smart venue recommendations | Medium | Medium | RAG over Google Places + past check-in history |
| Natural language meetup search | Low | Medium | "Rooftop bars open Friday near downtown" |

### 5.2 AI Observability

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Langfuse Tracing | High | Medium | LLM call tracing and cost monitoring |
| AI Latency Tracking | High | Low | Track p50/p95/p99 for AI endpoints |
| Prompt A/B Testing | Medium | Medium | Evaluate prompt variants |

---

## Phase 6: Mobile & Platform (Month 4-6)

### 6.1 Mobile Experience

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| PWA Optimization | High | Medium | Better offline support, install prompt, home screen icon |
| Location features | High | Medium | Use device GPS for nearby meetup/check-in detection |
| Offline mode | Medium | High | View crew and meetup info offline via service worker |
| React Native App | Low | Very High | Native iOS/Android (post-launch) |

### 6.2 Integrations

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Calendar export | High | Medium | Add meetup to Google/Apple/Outlook calendar |
| SMS notifications | Medium | Medium | Twilio for meetup reminders |
| WhatsApp sharing | Medium | High | Share meetup link via WhatsApp |
| Instagram integration | Low | High | Share meetup recap to Instagram story |

---

## Phase 7: Scale & Infrastructure (Post-Beta, 6+ Months)

### 7.1 Infrastructure

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| CDN for assets | High | Low | Already via Vercel Edge |
| Background job queue | High | Medium | Migrate cron to proper queue (BullMQ or Inngest) |
| Caching layer | Medium | Medium | Redis for hot query results (active check-ins, crew lists) |
| Horizontal scaling | Medium | High | Multi-region Vercel deployment |
| Database read replicas | Low | High | Neon read replicas for analytics queries |

### 7.2 Business Features

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Analytics dashboard | Medium | Medium | Crew/meetup engagement stats for internal use |
| Venue partner program | Low | Medium | Venues can sponsor meetup discovery placement |
| API for partners | Low | High | Public API for third-party integrations |

---

## Recommended Implementation Order

```
Q2 2026 — Beta Launch Prep (Current)
+-- Set production env vars (OpenAI, Pusher, Sentry)
+-- Marketing landing page + OG tags
+-- Block/report user flows
+-- Age verification
+-- Uptime monitoring
+-- Beta launch

Q3 2026 — Discovery & Safety
+-- Location-based meetup discovery (geospatial query + map)
+-- Web Push notifications for nearby crew
+-- OAuth providers (Google)
+-- Meetup photo sharing / recaps
+-- Moderation dashboard

Q4 2026 — Social Depth
+-- In-app DMs + crew group chat
+-- PWA optimization + GPS-based check-ins
+-- AI meetup suggestions
+-- Langfuse tracing
+-- Calendar export

Q1 2027 — Scale & Platform
+-- City-channel presence scaling
+-- Native app exploration
+-- Venue partner program
+-- Background job queue (BullMQ/Inngest)
```

---

## Success Metrics

### User Engagement
- Daily Active Users (DAU)
- Check-ins per user per week
- Meetups created per crew per month
- RSVP-to-attendance conversion rate
- Crew formation rate (new crews per week)

### Business Metrics
- User acquisition cost (CAC)
- Day-7 and Day-30 retention rates
- Crew size distribution
- Meetup repeat rate (same crew, recurring meetup)

### Technical Metrics
- API response time (p50, p95, p99)
- Error rate < 1% (Sentry)
- AI latency (per provider)
- Uptime > 99.9%
- Test coverage (currently 1048 tests, targeting > 80% line coverage)

---

*Last Updated: 2026-04-22*
