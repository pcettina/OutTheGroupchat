# OutTheGroupchat - Future Implementation Roadmap

## Overview

This document outlines future features, improvements, and technical debt to address for the OutTheGroupchat platform. The product has pivoted to a meetup-centric social network ("the social media app that wants to get you off your phone"). Items already shipped are marked accordingly.

*Last Updated: 2026-05-16*

---

## Current State Summary (2026-05-16)

### V1 Product (Intent-to-Group Meetup Loop) — Phases 0–4b SHIPPED on `main`

- [x] **Phase 0** — PR backlog merged, `v1.0-trip-planning` tagged
- [x] **Phase 1** — Trip code archived to `src/_archive/`, navigation cleaned
- [x] **Phase 2** — Schema migration: Crew + crewLabel + activeUntil applied on Neon
- [x] **Phase 3** — Crew API (6 routes), CrewButton / CrewList UI, Crew emails, `/profile/[userId]`
- [x] **Phase 4** — Meetup API routes, MeetupDetail page, Pusher real-time, MEETUP_STARTING_SOON cron, Google Places venue search
- [x] **Phase 5** — Check-ins API + UI, "Join me" flow, privacy settings (PUBLIC | CREW | PRIVATE), NearbyCrewList, duration picker
- [x] **Phase 6** — Notification pruning, Follow `@deprecated`, feed rescoped, search people-first
- [x] **Phase 7** — About page, OG/Twitter Card tags, README rewrite, email-auth split, RichFeedItem refactor
- [x] **Phase 4a/4b Heatmap** — maplibre-gl + OpenFreeMap tile basemap, Crew tier (PR #86) + FoF tier (PR #87), contribution writers wired into commit + checkins, R22 z=15 venue markers, R24 anchor priorities 1/3/4

### Infrastructure Migrations Completed

- [x] **Neon PostgreSQL** via Vercel Marketplace (migrated from Supabase on 2026-04-17)
- [x] **AI surface fully removed** (PR #65, 2026-04-23) — no `@ai-sdk/*`, no `ai` dep, no `/api/ai/*` routes, no `src/lib/ai`, no `src/components/ai`
- [x] **Branch-per-PR Neon workflow** active — every PR gets a Neon branch with `prisma migrate deploy` applied
- [x] **Heatmap stack** — maplibre-gl + OpenFreeMap (V1 Phase 4)

### Foundational Quality Bars (Already Met)

- [x] **TypeScript strict mode** — 0 `any` types, 0 TSC errors
- [x] **Structured logging** — pino via `@/lib/logger` (no bare `console.*` in production code)
- [x] **Rate limiting** — Upstash Redis on all high-risk routes
- [x] **Input sanitization** — Zod on all API endpoints; isomorphic-dompurify for XSS
- [x] **Security headers** — HSTS, X-Frame-Options, CSP
- [x] **CORS** — configured in `next.config.js`
- [x] **Email verification** — VerificationToken + Resend
- [x] **Password reset** — POST/PATCH API + frontend UI
- [x] **Sentry installed** — needs real DSN in Vercel production
- [x] **Vercel Analytics** — active in production
- [x] **Testing** — ~1253 Vitest tests on `main`, 0 failures; Playwright framework configured (CI install step in `.github/workflows/ci.yml`)

---

## Phase 8 (CURRENT) — Launch-Readiness Re-Audit

These are the remaining items blocking a public beta of the V1 meetup product. See `docs/LAUNCH_CHECKLIST.md` for the authoritative list.

### 8.1 Environment & Infrastructure

| Item | Priority | Status |
|------|----------|--------|
| Set Pusher env vars in Vercel | Critical | Missing — real-time meetup/check-in events disabled in prod |
| Obtain Sentry DSN + set in Vercel | Critical | Missing — error monitoring gap |
| Verify Resend domain | High | Pending — production sends bounce |
| `DEMO_MODE=true` for demo auth | Medium | Currently `false` |
| NEXTAUTH_SECRET rotation (32+ chars) | High | Unverified |

### 8.2 Quality / Coverage Gaps Still Open

| Item | Priority | Notes |
|------|----------|-------|
| E2E Playwright authenticated flows | High | Smoke spec exists; needs full Crew → Meetup → Check-in journey |
| Sentry full coverage audit | High | Confirm `captureException` on every catch block across all 59 routes |
| Doc refresh sweep | Medium | Multi-week stale docs (this sweep is part of it) |
| Mobile companion app | Medium | `outthegroupchat-mobile/` exists as untracked scaffold; needs spec |

---

## Phase 9 — Post-Beta Hardening (Q3 2026)

### 9.1 Authentication Expansion

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| OAuth Providers | High | Low | Google, Apple login via NextAuth |
| Profile Photos | Medium | Low | Avatar upload (Vercel Blob or Cloudinary) |
| Account Deletion | High | Medium | GDPR-compliant removal flow |
| Two-Factor Authentication | Low | Medium | TOTP-based 2FA |

### 9.2 Meetup & Crew Features

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Subcrew labels (deeper UX) | High | Medium | Subgroup organization within larger Crews |
| Search filters | High | Medium | People/meetups by city, intent, time window, distance |
| Meetup templates | Medium | Medium | Common patterns: coffee, dinner, run club |
| Recurring meetups | Medium | Medium | Weekly/biweekly cadence |
| Meetup chat (lightweight) | High | High | In-meetup ephemeral threads |
| Cross-Crew discovery | Medium | High | Find adjacent Crews near you |

### 9.3 Heatmap Roadmap (Phase 4 Follow-ups)

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| R24 priority 2 (deferred from Phase 4b) | Medium | Medium | Second-tier anchor placement |
| Public tier (FoF + public check-ins blended) | Medium | High | Privacy-safe public layer |
| Time-decay visualization | Medium | Medium | Fade contributions over time |
| Personal heat history | Low | Medium | "Your week" view |

### 9.4 Notifications & Engagement

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Web Push Notifications | High | Medium | VAPID push for meetup/Crew events |
| Native push (via mobile companion) | High | High | iOS/Android push tokens once mobile app ships |
| SMS reminders (Twilio) | Medium | Medium | Opt-in for meetup-starting-soon |
| @Mentions in feed/meetup comments | Medium | Low | Notification on tag |
| Reactions on feed items | Low | Low | Emoji reactions |

---

## Phase 10 — Mobile & Platform (Q4 2026)

### 10.1 Mobile Experience

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| **React Native companion** | High | Very High | `outthegroupchat-mobile/` scaffold exists; needs implementation |
| PWA polish | High | Medium | Offline-tolerant check-in/heatmap views, install prompt |
| Location features (background) | Medium | High | Opt-in background presence for live heatmap |
| Calendar sync | High | Medium | Google/Apple/Outlook export of meetups |

### 10.2 Integrations

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Apple/Google Wallet meetup passes | Low | Medium | Add meetup to wallet |
| WhatsApp/Telegram share-out | Medium | Medium | Share meetup invite links |
| Slack/Discord bot | Low | Medium | Crew updates in community servers |

### 10.3 Legal & Compliance

| Item | Priority | Complexity | Notes |
|------|----------|------------|-------|
| Privacy Policy page | Done | — | Shipped (Phase 3 era) |
| Terms of Service page | Done | — | Shipped (Phase 3 era) |
| SEO meta tags | Done | — | Phase 7 (PR #56) updated OG/Twitter Cards |
| GDPR account deletion | High | Medium | Permanent data removal flow (ties to 9.1) |
| Location-data DPA review | High | Medium | Needed before public heatmap launch |

---

## Phase 11 — Scale & Business (2027+)

### 11.1 Infrastructure

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| CDN for assets | Done | — | Vercel Edge |
| Background jobs queue | High | Medium | Migrate cron handlers to BullMQ or Inngest |
| Caching layer | Medium | Medium | Upstash Redis for hot heatmap tiles + venue lookups |
| Multi-region deployment | Medium | High | Latency optimization for live presence |
| Database read replicas | Medium | High | Neon read pool for heatmap reads |

### 11.2 Business Features

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| Analytics dashboard | Medium | Medium | Crew/meetup engagement stats |
| Venue partner program | Medium | Medium | Verified venue accounts, promotions |
| Premium tier | Low | Medium | Extended check-in radius, advanced filters |
| Public API for partners | Low | High | Third-party integrations |

---

## Major Dependency Upgrades (Tracked Separately)

See `docs/UPGRADE_PLAN.md` for the full plan. Current Next 14 / React 18 / Prisma 5 stack works; planned upgrades:

- next 14 → 16
- react 18 → 19
- prisma 5 → 7
- node-related typings + testing-library refresh

---

## Recommended Implementation Order

```
Q2 2026 — Public Beta Prep (Current = Phase 8)
+-- Pusher + Sentry env wiring in Vercel
+-- Resend domain verification
+-- E2E Playwright authenticated flows
+-- Sentry full coverage audit
+-- Doc refresh sweep
+-- Public beta launch

Q3 2026 — Post-Beta Hardening (Phase 9)
+-- OAuth (Google) + native push prep
+-- Search filters + subcrew UX
+-- Web push notifications
+-- Heatmap R24 priority 2 + time-decay
+-- Meetup chat MVP

Q4 2026 — Mobile + Major Upgrades (Phase 10 / UPGRADE_PLAN)
+-- React Native companion launch
+-- Calendar sync
+-- Next 16 / React 19 / Prisma 7 upgrade
+-- Background jobs queue migration

2027 — Scale & Business (Phase 11)
+-- Venue partner program
+-- Analytics dashboard
+-- Caching + read replicas
```

---

## Success Metrics

### User Engagement
- Daily Active Users (DAU)
- Crew formation rate (intent → ≥2 Crew on same Topic)
- Meetup completion rate (created → attended)
- Check-in frequency per active user
- Heatmap contribution rate

### Technical Metrics
- API response time (p50, p95, p99)
- Error rate < 1% (Sentry)
- Uptime > 99.9%
- Heatmap tile generation latency
- Test coverage (currently ~1253 tests on main; targeting > 80% line coverage)

### Business Metrics
- User acquisition cost (CAC)
- Crew retention (% still active at 30/60/90 days)
- Venue partner adoption (post-launch)

---

*Last Updated: 2026-05-16*
