# 🌐 Social Engagement Agent Guide

## Mission Statement
> "The social media app that wants to get you off your phone."

**Your Role:** Design and implement the V1 intent-to-group loop — Crew, Intent, SubCrew, Meetup — so the social graph translates into IRL meetups, not screen time.

---

## 🧬 V1 Domain Model (founder-locked 2026-04-24)

| Entity | What it is | Where it lives |
|--------|-----------|----------------|
| **Crew** | Peer-tier mutual relationship (bidirectional, accepted). The persistent graph. | `prisma.crew` (model), `src/components/social/` |
| **Topic** | Catalog of things people do together (run, climb, coffee, board games, etc.) — curated, finite. | `prisma.topic` |
| **Intent** | A user's signal: "I want to do {Topic} in {window}". Has a lifecycle (active → expired). | `prisma.intent`, `src/components/intents/`, `src/lib/intent-lifecycle.ts` |
| **SubCrew** | Auto-formed group when ≥2 Crew members signal Intent on the same Topic in overlapping window + city. | `prisma.subCrew`, `src/components/subcrews/`, `src/lib/subcrew-formation.ts` |
| **Meetup** | Coordination unit: chosen Venue, time, RSVPs, check-ins. Created from a SubCrew. | `prisma.meetup`, `src/components/meetups/`, `src/components/checkins/` |

**Full spec:** `docs/PRODUCT_VISION.md`. Do not introduce concepts (Trips, Activities, Surveys, Voting Sessions, AI chat) that don't map onto this model — they're archived.

---

## 🎯 Core Engagement Principles

### 1. Signal → Match → Meet
The whole loop fits in one sentence: a user signals Intent, the system matches them with their Crew, and the SubCrew converges on a Meetup.

### 2. Crew Is Sacred
Crew is mutual and accepted. No one-sided follows in the V1 loop (`Follow` is `@deprecated` in the schema). Trust gates everything downstream.

### 3. Off-Phone Is the Win Condition
A successful session ends with the user closing the app and walking to the venue. Engagement features that *retain* attention past that point are anti-goals.

### 4. Privacy By Default
Location visibility, Intent visibility, and SubCrew membership are all opt-in (see `src/components/privacy/PrivacyPickerModal.tsx`). Do not surface user state without consent.

---

## 📊 Current V1 Surface (2026-05-19)

### Shipped ✅
| Feature | Notes |
|---------|-------|
| Crew (send/accept/reject, bidirectional pairing) | `src/app/api/crew/*` (6 routes), `CrewButton`, `CrewList` |
| Intent (signal, list, expire) | `src/app/api/intents/*`, `src/components/intents/*` |
| SubCrew auto-formation (≥2 Crew on same Topic) | `src/lib/subcrew-formation.ts`, `EmergingSubCrewCard`, `ImInButton` |
| Meetup (create, RSVP, invite) | `src/app/api/meetups/*`, `src/components/meetups/*` |
| Check-ins ("Who's out tonight") | `src/app/api/checkins/*`, `NearbyCrewList`, `LiveActivityCard` |
| Crew + FoF heatmap (Phase 4) | `src/components/heatmap/HeatmapMap.tsx` (maplibre-gl, OpenFreeMap) |
| Real-time (RSVP / formation / check-in via Pusher) | `src/lib/pusher.ts` (env vars missing in prod) |
| Notifications (V1 types only — pruned in PR #55) | `Notification` model |
| Public profiles | `src/app/profile/[userId]/page.tsx` |
| Email (Crew invite, Meetup invite/RSVP, starting-soon) | `src/lib/email.ts`, `email-meetup.ts`, `email-auth.ts` |

### Deferred / Out of scope
| Item | Status |
|------|--------|
| Reactions beyond LIKE, threaded comments | Not in V1 scope |
| Stories, ephemeral content | Not in V1 scope |
| Group chat / DMs | Not in V1 (Pusher channels exist for events, not freeform chat) |
| Gamification / achievements | Not in V1 |
| AI suggestions / chat / icebreakers | **Removed PR #65 (2026-04-23)** — do not propose |
| Trip planning / itineraries / surveys / voting | **Archived** to `src/_archive/trips/` |

---

## 🔥 The V1 Loop

### Primary Loop: Signal → Match → Meet → Show Up
```
┌──────────────────────────────────────────────────┐
│                                                  │
│  User signals Intent on a Topic (one tap)        │
│              ↓                                   │
│  System checks: ≥2 Crew on same Topic +          │
│  overlapping window + same city?                 │
│              ↓                                   │
│  SubCrew auto-forms → push + Pusher event        │
│              ↓                                   │
│  Members tap "I'm in" → coordinate venue/time    │
│              ↓                                   │
│  Meetup confirmed → RSVP + venue + reminder      │
│              ↓                                   │
│  Check-in IRL → optional public "Crew at venue"  │
│              ↓                                   │
│  Contribution writes back into heatmap +         │
│  trust score → next Intent matches better        │
│              ↓                                   │
└──────────── (Loop continues) ────────────────────┘
```

### Secondary Loop: Discover → Add to Crew → Co-meet
```
User sees a Crew member at a Venue on the heatmap (opt-in only)
        ↓
Or sees a FoF (friend-of-friend) repeatedly at the same Topics
        ↓
Sends Crew request
        ↓
Mutual accept → bidirectional Crew pairing
        ↓
Future Intents now match against the larger Crew
```

---

## 🎮 V1 Engagement Surfaces

The schemas below already exist in `prisma/schema.prisma`. This section describes how to think about them, not what to add.

### 1. Crew (the persistent graph)
- Mutual & accepted. A single accept writes both sides.
- Optional `crewLabel` per user (how this person knows them, e.g. "climbing partner").
- `activeUntil` lets Crew members opt into ephemeral elevated visibility windows.
- Notifications: `CREW_REQUEST_RECEIVED`, `CREW_REQUEST_ACCEPTED`.

### 2. Intent (the signal)
- One row per (user, topic, window). `activeUntil` defaults to a short horizon (tonight, this weekend).
- Visibility: Crew-only by default; broader tiers are opt-in.
- Auto-expires; `src/lib/intent-lifecycle.ts` is the source of truth.
- Writing an Intent triggers `subcrew-formation.ts` synchronously to look for matches.

### 3. SubCrew (the auto-formed group)
- Created when ≥2 Crew share Intent on the same Topic in overlapping window + city.
- Membership starts as "emerging" (system invited); becomes "joined" on "I'm in" tap.
- Notifications: `SUBCREW_EMERGING`, `SUBCREW_FORMED`, `SUBCREW_RECOMMENDATION`.
- Lifecycle ends when the spawned Meetup wraps or all Intents expire.

### 4. Meetup (the coordination unit)
- Hosted by one SubCrew member; venue chosen via Google Places (`/api/venues/search`).
- RSVP states: YES / NO / MAYBE / WAITLIST. Invitees can be additional Crew outside the SubCrew.
- `MEETUP_STARTING_SOON` cron pushes reminder ~1h before.
- Real-time: Pusher channel per Meetup for RSVP + chat-lite updates.

### 5. Check-ins ("Who's out tonight")
- POST `/api/checkins` clamps `activeUntilOverride` to `[now+30m, now+12h]` (default `now+6h`).
- Visibility: `PUBLIC | CREW | PRIVATE` (no `CLOSE_CREW`).
- Crew-only check-ins dispatch `CREW_CHECKED_IN_NEARBY` notifications.
- Drives `NearbyCrewList` UI and contributes to the heatmap.

### 6. Heatmap (visualized momentum)
- `src/components/heatmap/HeatmapMap.tsx` — maplibre-gl + OpenFreeMap (no API key).
- Crew tier (R22) and FoF tier shipped (PR #86, #87).
- Contribution writers wired into commit + check-in flows.
- Venue markers appear at z=15. Anchor priorities 1/3/4 wired (priority 2 deferred to post-V1).

> **Pruned NotificationType (PR #55, 2026-04-22):** only V1-relevant types remain. Do not reintroduce trip/follow notification variants.

---

## 📈 Engagement Metrics to Track (V1)

### Core Metrics
| Metric | Definition | Target |
|--------|-----------|--------|
| Intent → SubCrew rate | % of Intents that find ≥1 Crew match | >30% |
| SubCrew → Meetup rate | % of SubCrews that produce a confirmed Meetup | >40% |
| Meetup → Check-in rate | % of confirmed Meetups with ≥1 IRL check-in | >60% |
| Median time-to-Meetup | Intent signal → Meetup confirm | <24h |
| Crew size (median) | accepted mutual relationships per active user | 8+ |
| Repeat-meetup rate | % of users with ≥2 Meetups in a month | >25% |

### Health metrics (anti-engagement guardrails)
```
Median session length          → SHORTER is better (target <3 min/session)
Notifications-per-Meetup       → keep low; quality over volume
Off-app conversion             → % of sessions that end with a check-in or
                                 venue map open within 6h
```

---

## 🚀 V1 Status & Path to Launch

The V1 build is mostly shipped. See `docs/REFACTOR_PLAN.md` for the canonical phase tracker.

```
✅ Phase 0–7  (Pivot, archive trips, Crew + Intent + SubCrew + Meetup +
              Check-ins + Marketing surface) — all merged
🟡 Phase 8    Launch readiness — IN PROGRESS
              ✅ Actions #1–#4
              □ #5 E2E Playwright authenticated flows
              □ #6 Sentry full coverage audit (47/59 routes as of 2026-05-19)
```

### What's left to ship for V1
- Sentry DSN in Vercel + full route coverage
- Pusher env vars in Vercel (real-time disabled in prod without them)
- Resend domain verification
- Playwright E2E for the four signed-in flows (Crew accept, Intent → SubCrew, Meetup RSVP, check-in)
- Heatmap anchor priority 2 polish (deferred — track for post-V1)

---

## 🎯 Social Feature Design Principles

### 1. Visibility Creates Value
```
User action → Visible to network → Social validation → More action
```

### 2. Friction Where Needed
```
Easy: Like, follow, view
Medium: Comment, share, create
Hard: Report, block, delete account
```

### 3. Defaults Matter
```
New trip → Suggest inviting friends
New activity → Suggest sharing
Milestone → Auto-celebrate
```

### 4. Crew Proximity, Not FOMO
```
Show: "Sarah and 3 of your Crew want coffee tomorrow morning"
Show: "Your SubCrew has a venue picked — RSVP by 6pm"
Show: "2 Crew are already at Roast Co. — head over?"
```
The pull is *your people, near you, now* — not anonymous trending content.

---

## 🔒 Safety & Moderation

### Content Policies
- No hate speech or harassment
- No spam or self-promotion
- No adult content
- No misleading information
- No illegal activities

### Moderation Tools Needed
```
□ Report system with categories
□ Block user functionality
□ Mute notifications from user
□ Hide content from feed
□ Admin dashboard for review
□ AI content moderation (future)
```

### Trust & Safety Features
```
□ Private profile option
□ Approve followers option
□ Trip visibility controls
□ Comment filtering
□ DM restrictions
```

---

## 📋 Social Feature Checklist

Before launching any social feature:

- [ ] Works on mobile
- [ ] Real-time updates (if applicable)
- [ ] Proper notifications
- [ ] Privacy controls
- [ ] Report mechanism
- [ ] Rate limiting
- [ ] Accessible
- [ ] Engaging animations
- [ ] Clear empty states
- [ ] Error handling
- [ ] Analytics events
- [ ] A/B testable

---

*Make connections that turn Crew into the people you actually saw this week.*

*Last Updated: 2026-05-19*

