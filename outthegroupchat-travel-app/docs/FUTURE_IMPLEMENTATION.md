# OutTheGroupchat - Future Implementation Roadmap

## Overview

This document outlines future features, improvements, and technical debt for OutTheGroupchat — a meetup-centric social network ("the social media app that wants to get you off your phone"). The product centers on the **intent-to-group loop**: members build a **Crew**, signal **Intent** on shared **Topics**, **auto-group** when 2+ Crew land on the same Topic, coordinate **Meetups**, broadcast live **Check-ins**, and see Crew presence on a **heatmap**.

This roadmap was reconciled against the post-pivot reality on 2026-06-10. The app pivoted away from collaborative group-trip-planning; that code is archived under `src/_archive/` and its future features are **out of scope** (see "Archived / Out of Scope"). The **AI surface was fully removed** (PR #65, 2026-04-23) — any AI roadmap items below are marked removed and are not planned.

*Last Updated: 2026-06-10*

---

## Shipped Since This Roadmap Was Written

The core meetup loop that earlier versions of this document listed as "future" is now **built and merged**:

- [x] **Crew system** — requests/accept, Crew list, profile pages (`/profile/[userId]`) — Phase 3
- [x] **Meetups** — create/list/detail, RSVP, invite, MeetupDetail page, Google Places venue search — Phase 4
- [x] **Real-time** — Pusher events for meetups and check-ins; MEETUP_STARTING_SOON cron — Phase 4
- [x] **Check-ins / live presence** — "Who's Out Tonight?", join-me flow, visibility (PUBLIC/CREW/PRIVATE), NearbyCrewList — Phase 5
- [x] **Heatmap** — MapLibre GL + OpenFreeMap, Crew tier + Friends-of-Friends tier, contribution writers on commit and check-in — Phase 4 (heatmap)
- [x] **Notifications** — typed notifications + preference triggers (DAILY_PROMPT, PER_MEMBER_INTENT, GROUP_FORMATION, CREW_CHECKED_IN_NEARBY) — Phase 5
- [x] **People-first feed & search** — feed rescoped to people/meetups; search types narrowed to all/people/meetups/venues — Phase 6
- [x] **Email** — Crew, meetup invite/RSVP/starting-soon, and auth emails via Resend (`email-auth.ts`, `email-meetup.ts`)
- [x] **About page** — "off your phone" ethos, OG/Twitter tags updated from trip copy — Phase 7

### Platform / quality items already done

- [x] **TypeScript strict mode** enabled
- [x] **Error handling** — global error boundary, standardized API errors, pino logging
- [x] **Rate limiting** — Upstash Redis on high-risk routes
- [x] **Input validation** — Zod on API endpoints
- [x] **Security headers** — HSTS, X-Frame-Options, CSP
- [x] **Sentry installed** (still needs a real DSN in Vercel production)
- [x] **Vercel Analytics** active in production
- [x] **Structured logging** — pino via `@/lib/logger`
- [x] **Neon migration** — Postgres on Neon (Vercel Marketplace), per-PR Neon branch workflow

---

## Phase 1: Immediate Pre-Launch (Launch-Readiness, Phase 8 active)

Blockers / near-blockers for launch. See `docs/LAUNCH_CHECKLIST.md` for the authoritative list.

### 1.1 Environment & Infrastructure

| Item | Priority | Status |
|------|----------|--------|
| Set Pusher env vars in Vercel (real-time disabled without them) | Critical | Missing |
| Obtain Sentry DSN + set in Vercel | High | Missing |
| Verify Resend domain (prod sends bounce until verified) | High | Pending |
| Set GOOGLE_PLACES_API_KEY in prod (venue search) | High | Missing |
| NEXTAUTH_SECRET rotation (32+ chars) in prod | High | Unverified |
| `DEMO_MODE=true` only where demo auth is intended | Medium | Off by default |

### 1.2 Launch-Readiness Work (Phase 8 remaining)

| Item | Priority | Complexity | Description |
|------|----------|------------|-------------|
| Authenticated E2E flows (Playwright) | High | Medium | Crew → Intent → group-formation → meetup → check-in happy paths (Phase 8 #5) |
| Sentry full coverage audit | High | Low | Confirm captureException on all live meetup-domain routes (Phase 8 #6) |
| Failed-login attempt limiting | High | Medium | Track failures per IP/email |
| Session timeout configuration | Medium | Low | NextAuth session maxAge |
| Inline client-side validation feedback | Medium | Low | Surface Zod errors on Crew/meetup/check-in forms |

---

## Phase 2: Meetup-Loop Depth (Post-Launch)

Deepen the core intent-to-group experience.

### 2.1 Intents & Grouping

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Intent expiry & re-prompt | High | Medium | Auto-expire stale intents; nudge to re-signal |
| Group chat on formation | High | High | Lightweight thread when a MeetupGroup auto-forms |
| Topic discovery / browse | Medium | Medium | Browse popular Topics, see how many Crew are in |
| Recurring intents | Medium | Medium | "Every Friday I'm down for X" |
| Group size / quorum controls | Medium | Medium | Let users tune the 2+ Crew threshold per Topic |

### 2.2 Meetups

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Meetup edit / cancel flows | High | Low | PATCH/DELETE UI with attendee notification |
| Venue recommendations ranking | Medium | Medium | Rank Google Places results by Crew fit / distance |
| Calendar export (.ics) | Medium | Low | Add meetup to Google/Apple/Outlook calendar |
| Recurring meetups | Low | Medium | Standing weekly/monthly meetups |
| Meetup recap / photos | Low | Medium | Post-meetup recap to feed |

### 2.3 Check-ins & Presence

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Presence privacy granularity | High | Medium | Per-Crew visibility overrides beyond PUBLIC/CREW/PRIVATE |
| Heatmap anchor priority 2 | Medium | Medium | Deferred tier from the Phase 4 heatmap work |
| "Ping nearby Crew" | Medium | Medium | One-tap nudge to active Crew nearby |
| Check-in reactions | Low | Low | Lightweight reactions on live check-ins |

---

## Phase 3: Authentication & Account

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| OAuth Providers (Google, Apple) | High | Low | Via NextAuth |
| Profile Photos | High | Low | Avatar upload (S3/Cloudinary) |
| Account Deletion (GDPR) | Medium | Medium | Permanent data + presence removal |
| Two-Factor Authentication | Low | Medium | TOTP-based 2FA |

---

## Phase 4: Monitoring & Reliability

| Item | Priority | Complexity | Description |
|------|----------|------------|-------------|
| Uptime monitoring | High | Low | BetterStack or Checkly |
| Status page | Medium | Low | Public status page |
| Alert channels | High | Low | Slack/email for errors and downtime |
| Database backup schedule | High | Low | Neon automated backups |
| Core Web Vitals monitoring | Medium | Low | Vercel Analytics integration |
| Background jobs queue | Medium | Medium | Migrate cron to a proper queue (e.g. BullMQ) if cron volume grows |

---

## Phase 5: Social & Community Growth

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| @Mentions in comments | Medium | Low | Tag Crew in feed/meetup comments |
| Web Push Notifications | High | Medium | Push for group formation & nearby check-ins |
| Friend-of-Friend Crew suggestions | High | Medium | Suggest new Crew from FoF graph (already powering heatmap FoF tier) |
| Referral program | Medium | Medium | Invite friends to grow Crew |
| Reputation / reliability signal | Low | Medium | Show-up reliability for meetups |

---

## Phase 6: Mobile & Platform

A dedicated mobile app effort exists (`outthegroupchat-mobile/`). Web-side platform work:

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| PWA optimization | High | Medium | Install prompt, better offline shell |
| Native location features | Medium | Medium | Background presence for check-ins (mobile) |
| SMS notifications | Medium | Medium | Twilio for meetup reminders |
| Calendar sync | Medium | Medium | Two-way Google/Apple/Outlook |

### Legal & Compliance

| Item | Priority | Complexity | Status |
|------|----------|------------|--------|
| Privacy Policy page | High | Low | Exists (`/privacy`) — keep current with presence/location data |
| Terms of Service page | High | Low | Exists (`/terms`) |
| Location-data disclosure | High | Low | Clear copy on heatmap/check-in location use |
| GDPR account deletion | Medium | Medium | Permanent data removal flow |

---

## Phase 7: Scale & Business

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Caching layer (Redis hot queries) | Medium | Medium | Cache heatmap/presence aggregates |
| Horizontal / multi-region | Low | High | Multi-region deployment |
| Analytics dashboard | Medium | Medium | Crew/meetup engagement insights |
| Public API for partners | Low | High | Third-party integrations |

---

## Removed — Not Planned

The **AI surface was fully removed** in PR #65 (2026-04-23): no OpenAI/Anthropic dependencies, no `/api/ai/*` routes, no `src/lib/ai`. The following items from earlier roadmaps are **removed and not on the plan**. Do not reintroduce AI without explicit founder direction.

- Vector database (pgvector / Pinecone) — N/A (AI removed)
- RAG pipeline / knowledge base — N/A (AI removed)
- AI personalization / smart scheduling — N/A (AI removed)
- AI trip search / destination matching / group-compatibility prediction — N/A (AI removed)
- Langfuse tracing, prompt A/B testing, AI latency tracking — N/A (AI removed)
- Vercel AI SDK / agent (ReAct) / tool-calling stack — N/A (AI removed)
- Photo / image generation — N/A (AI removed)

---

## Archived / Out of Scope (Trip-Planning Era)

The following belonged to the collaborative trip-planning product that OutTheGroupchat pivoted away from. The code is archived under `src/_archive/`; these are **not planned** for the meetup-centric product and are recorded here only to explain their absence from the roadmap:

- Trip wizard, trip editing/duplication/templates/archiving
- Survey + voting flows, itinerary drag-and-drop editor, PDF itinerary export
- Shared expenses / split payments / departure-city tracking
- Booking integrations (Amadeus flights, Booking.com/Airbnb hotels, Viator/GetYourGuide activities, OpenTable/Resy)
- Flight price alerts / price prediction / budget vs. actual tracking
- Trip reviews, travel badges tied to trips, travel-buddy matching

If any of these concepts return, they would be re-scoped to the meetup domain (e.g. "shared expenses" → splitting a meetup tab) rather than restored as trip-planning features.

---

## Recommended Implementation Order

```
Now — Launch-Readiness (Phase 8 active)
+-- Set production env vars (Pusher, Sentry, Google Places)
+-- Verify Resend domain
+-- Authenticated E2E flows (Crew → group → meetup → check-in)
+-- Sentry coverage audit
+-- Launch

Post-Launch — Meetup-Loop Depth
+-- Intent expiry + re-prompt
+-- Group chat on formation
+-- Meetup edit/cancel + calendar export
+-- Presence privacy granularity
+-- OAuth (Google/Apple) + profile photos

Growth
+-- Web push (group formation, nearby check-ins)
+-- FoF Crew suggestions + referral program
+-- PWA optimization + mobile presence
+-- Uptime monitoring + status page
```

---

## Success Metrics

### User Engagement (meetup loop)
- Daily Active Users (DAU)
- Intents signalled per user per week
- Group-formation rate (intents → auto-formed MeetupGroups)
- Meetup creation & RSVP rate
- Check-in rate; show-up rate for formed meetups

### Business Metrics
- User acquisition cost (CAC)
- Crew growth per user (network density)
- Customer lifetime value (CLV)

### Technical Metrics
- API response time (p50, p95, p99)
- Error rate < 1% (Sentry, once DSN is set)
- Uptime > 99.9%
- Test coverage (currently ~1814 tests across 91 files)

---

*Last Updated: 2026-06-10*
