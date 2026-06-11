# 🗺️ Planning Agent Guide

## Mission Statement
> "The social media app that wants to get you off your phone."

**Your Role:** Architect features that turn online signals into real-world meetups — the intent → group → coordinate → meet loop.

> **Domain context:** OutTheGroupchat is a meetup-centric social network. The v1 product loop (founder-locked 2026-04-24) is: **signal Intent → auto-group when ≥2 Crew share a Topic → coordinate + get venue recs → opt-in location visibility (Heatmap)**. Core models: **Crew, Topic, Intent, SubCrew, Meetup, Venue, CheckIn, HeatmapContribution**. The trip-planning product was archived (`src/_archive/`) and the AI surface was fully removed (PR #65) — do not plan AI features or new trip-planning features without explicit founder direction. Trip/Survey/Voting models remain only as legacy backing the feed.

---

## 🎯 Core Planning Principles

### 1. Meetup-First Architecture
Every feature should answer: **"How does this get people to actually meet up?"**

```
✅ GOOD: "When 2+ Crew signal the same Topic, auto-form a SubCrew and prompt a meetup"
❌ BAD: "Users can browse Topics" (no path to the room)
```

### 2. Reduce Coordination Friction
Prioritize features that collapse the gap between intent and meeting.

```
✅ GOOD: "Surface venue recs + a time picker the moment a group forms"
❌ BAD: "Users can manually thread a long chat to pick a place" (high friction)
```

### 3. Group Dynamics
Always consider multi-user scenarios:
- How does a SubCrew form from individual Intents?
- What happens when interest fizzles (Intent expiry / `activeUntil`)?
- How is a meetup confirmed and who can see it?

---

## 📐 Feature Planning Template

Use this for every new feature:

```markdown
## Feature: [Name]

### Meetup Value
- How does this move users toward an in-person meetup?
- Does it strengthen Crew / SubCrew formation?
- What real-world coordination does it unblock?

### Friction / Loop Value
- Does it shorten intent → group → meet?
- Does it respect opt-in location visibility?
- What decision does it help a group make (where / when / who)?

### User Stories
1. As a [role], I want to [action] so that [outcome]

### Technical Requirements
- Database changes needed (schema)
- API endpoints required
- Real-time requirements (Pusher)
- Notification triggers (DAILY_PROMPT / PER_MEMBER_INTENT / GROUP_FORMATION)

### Success Metrics
- Engagement: [metric]
- Completion: [metric]
- Sharing: [metric]

### Dependencies
- Must have: [features]
- Nice to have: [features]

### Risks & Mitigations
- Risk: [description]
- Mitigation: [strategy]
```

---

## 🏗️ Architecture Decisions

### Current Tech Stack (Respect These)
- **Frontend:** Next.js 14 App Router
- **Database:** PostgreSQL + Prisma
- **Auth:** NextAuth.js
- **Real-time:** Pusher (configured, env vars missing in production)
- **Styling:** TailwindCSS + Framer Motion
- **Maps/Heatmap:** maplibre-gl + OpenFreeMap (location Heatmap, Crew & FoF tiers)
- **Monitoring:** Sentry (~63/64 routes instrumented in code; awaiting `SENTRY_DSN` env var in Vercel)

### Recommended Additions for Social Scale
1. **Redis** - Caching, rate limiting, sessions (Upstash already wired for rate limiting)
2. **CDN** - Cloudinary/Uploadcare for media
3. **Search** - Algolia or Elasticsearch (current search is Prisma-backed, people-first)
4. **Analytics** - Mixpanel or Amplitude
5. **Monitoring** - Sentry (code in place via `src/lib/sentry.ts`; needs `SENTRY_DSN` in Vercel) + Vercel Analytics + an external uptime monitor on `/api/health`

---

## 📊 Data Models to Understand

### Core Social Graph
```
User ─┬─ requests/accepts ──→ Crew (CrewStatus)
      ├─ signals ──→ Intent ──→ Topic
      ├─ memberOf ──→ SubCrew (auto-formed from shared Intent)
      ├─ hosts/RSVPs ──→ Meetup ──→ Venue
      ├─ posts ──→ CheckIn (visibility: PUBLIC/CREW/PRIVATE)
      └─ writes ──→ HeatmapContribution (opt-in location)
```

### Core Meetup Flow (v1 loop)
```
User signals Intent on a Topic
  ↓
≥2 Crew share that Topic → SubCrew auto-forms (GROUP_FORMATION notification)
  ↓
Group gets venue recs (Venue) + picks a time
  ↓
Meetup created → Crew RSVP (AttendeeStatus)
  ↓
Members check in (CheckIn) → opt-in location feeds Heatmap
  ↓
Meetup happens IRL → activity surfaces in feed
```

---

## 🎯 Planning Priorities (Phase 8: launch-readiness)

The v1 meetup loop is built (Phases 1–5 complete: Crew API/UI, Meetup + RSVP + Pusher, Check-ins, Heatmap Crew+FoF tiers, all 3 notification triggers). Remaining planning is launch hardening, not new product surfaces.

### Now: Launch hardening
| Item | Purpose | Status |
|------|---------|--------|
| Sentry DSN in Vercel | Production error visibility | Open (code done) |
| Pusher prod env vars | Live check-in / RSVP updates | Open |
| Resend domain verify | Deliverable transactional email | Open |
| Authenticated E2E green run | Prove the meetup loop end-to-end | Spec authored, not verified |
| Uptime monitor on `/api/health` | Paging when prod is down | Open |

### Next: Launch-city seeding & polish
| Item | Purpose |
|------|---------|
| Seed Topics + Venues for launch city | Cold-start the intent→group loop |
| Heatmap legend / tier toggle UX | Make Crew vs FoF visibility legible |
| Onboarding into first Crew / check-in | Activate new users fast |

### Later: Growth (post-launch, founder-gated)
| Item | Purpose |
|------|---------|
| SubCrew priority-2 anchor | Deferred heatmap anchor tier |
| Recurring meetups | Retention via standing plans |
| Friend-of-friend discovery | Expand the graph safely |

---

## ⚠️ Anti-Patterns to Avoid

### 1. Feature Creep Without Social
Don't add features that don't connect to social graph.

### 2. Solo-First Design
Every feature should work BETTER with groups, not just work alone.

### 3. Passive Content
Avoid "read-only" features. Everything should invite action.

### 4. Complex Onboarding
New users should join a Crew or post a check-in within 2 minutes.

### 5. Hidden Social Actions
Make sharing, inviting, and connecting obvious and easy.

---

## 📋 Planning Checklist

Before any feature is approved:

- [ ] Moves users toward an in-person meetup
- [ ] Connects to the Crew / SubCrew graph
- [ ] Has clear group dynamics (formation, expiry, confirmation)
- [ ] Includes real-time elements where coordination matters (Pusher)
- [ ] Respects opt-in location visibility
- [ ] Mobile-friendly by design
- [ ] Has measurable success metrics
- [ ] Doesn't duplicate existing functionality
- [ ] Scales to 100K+ users
- [ ] Does NOT reintroduce AI or trip-planning without founder sign-off

---

## 🔮 Long-Term Vision

### Year 1: Density in launch cities
- Strong per-city Crew density (the loop only works with critical mass)
- Meetups happening weekly per active Crew
- High intent → meetup conversion

### Year 2: Multi-city + venue partners
- Expand city by city (density-gated, not blanket)
- Venue partnerships (recs, deals for groups)
- Friend-of-friend graph expansion

### Year 3: Platform
- Organizer / community tools
- Local events ingestion
- Selective API for partners

---

## 📞 Communication Protocol

### Feature Requests
1. Create issue with template above
2. Tag with `planning`
3. Assign priority label
4. Link to this guide

### Architecture Decisions
1. Create ADR (Architecture Decision Record)
2. Document alternatives considered
3. Get team review before implementation

### Sprint Planning
1. Review this guide at sprint start
2. Ensure all features align with mission
3. Balance technical debt with features

---

*Remember: we're not building a feed to scroll. We're building the shortest path from "I'm bored" to "we're out together."*

*Last Updated: 2026-06-11*

