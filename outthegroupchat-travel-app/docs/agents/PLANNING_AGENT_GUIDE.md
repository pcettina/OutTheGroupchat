# 🗺️ Planning Agent Guide

## Mission Statement
> "The social media app that wants to get you off your phone."

**Your Role:** Architect V1 features that move users along the Crew → Intent → SubCrew → Meetup loop. Keep the surface small, ship to launch.

---

## 🎯 Core Planning Principles

### 1. V1 Loop Alignment
Every feature should answer: **"Which step of Crew → Intent → SubCrew → Meetup does this advance?"**

```
✅ GOOD: "Let users batch-signal Intent across multiple Topics in one tap"
❌ BAD: "Add an itinerary builder for confirmed Meetups" (out of V1 scope)
```

### 2. IRL Conversion Bias
Prefer features that move users toward an in-person meetup. Treat on-app retention as a cost, not a goal.

```
✅ GOOD: "RSVP nudge 1h before Meetup with a one-tap directions handoff"
❌ BAD: "Threaded comments on past Meetups to drive re-engagement"
```

### 3. Crew-First Privacy
Default all new visibility surfaces to Crew-only. Anything broader must be explicit user opt-in via `PrivacyPickerModal`.

### 4. Don't Reintroduce Removed Surface
- AI was fully removed PR #65 (2026-04-23). No `@ai-sdk/*`, no `/api/ai/*`, no `src/lib/ai`, no `src/components/ai`.
- Trip planning is archived to `src/_archive/trips/`. Do not propose features that resurrect it without explicit founder direction.

---

## 📐 Feature Planning Template

Use this for every new feature:

```markdown
## Feature: [Name]

### V1 Loop Step
- Which of {Crew, Intent, SubCrew, Meetup, Check-in} does this serve?
- Does it shorten time-to-Meetup or improve match quality?

### IRL Conversion Value
- Does this raise Intent → SubCrew rate, SubCrew → Meetup rate,
  or Meetup → check-in rate?
- Does it shorten median session length while preserving conversion?

### Privacy Posture
- Default visibility tier? (Crew-only unless justified)
- What opt-in surface (PrivacyPickerModal?) gates broader visibility?

### User Stories
1. As a [role], I want to [action] so that [outcome]

### Technical Requirements
- Database changes needed (does the schema need a new model, or can it extend Intent/SubCrew/Meetup?)
- API endpoints required
- Real-time requirements (Pusher channel? Existing channel or new?)
- Notification types touched (V1 set is pruned — don't add without need)

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
- **Frontend:** Next.js 14 App Router, React 18, TypeScript strict
- **Database:** PostgreSQL (Neon via Vercel Marketplace) + Prisma 5
- **Auth:** NextAuth.js with Prisma adapter
- **Real-time:** Pusher (env vars missing in prod — gates several V1 surfaces)
- **Styling:** TailwindCSS 3.4 + Framer Motion
- **Maps:** maplibre-gl + OpenFreeMap tiles (no API key)
- **Rate limiting:** Upstash Redis (`@upstash/ratelimit`), 46/46 live routes covered
- **Monitoring:** Sentry (`src/lib/sentry.ts`) — 47/59 routes instrumented; DSN missing in Vercel prod
- **Email:** Resend (domain not yet verified in prod)
- **Per-PR DB:** Neon branch-per-PR with `prisma migrate deploy`

### Upgrades on the radar (`docs/UPGRADE_PLAN.md`)
- next 14 → 16
- react 18 → 19
- prisma 5 → 7
- 11 major package upgrades total — not executed yet

### Don't add new infra without justification
The V1 launch surface is intentionally small. Resist proposing CDNs, search services, analytics SaaS, or new vendor integrations unless they unblock a specific Phase 8 action.

---

## 📊 Data Models to Understand

### Core V1 Graph
```
User ─┬─ crewWith ──↔ User                (mutual, accepted)
      ├─ signals ──→ Intent ──→ Topic
      ├─ memberOf ──→ SubCrew ──→ Topic
      ├─ hosts/attends ──→ Meetup ──→ Venue
      └─ checksInAt ──→ Venue
```

### Primary user journey
```
Sign up + verify email
  ↓
Build Crew (mutual; both sides accept once)
  ↓
Signal Intent on a Topic (one tap, scoped to window + city)
  ↓
SubCrew auto-forms when ≥2 Crew share the same Topic
  ↓
SubCrew picks Venue + time → Meetup
  ↓
RSVP → starting-soon reminder → check-in IRL
  ↓
Contribution writes back to heatmap + trust → better future matches
```

### Notes on legacy models
`Trip`, `TripMember`, `Activity`, `Survey`, `VotingSession`, `Follow` are kept in the schema (some `@deprecated`) but are not part of the V1 loop. `Follow` is superseded by Crew. The `Poll` surface from `TripSurvey` may be repurposed inside SubCrew coordination — see `docs/REFACTOR_PLAN.md` §2.3.

---

## 🎯 Planning Priorities — Phase 8: Launch Readiness (2026-05-19)

The V1 loop is built. Phase 8 closes the gap between "works in dev" and "shippable to beta users." See `docs/REFACTOR_PLAN.md` and `docs/LAUNCH_CHECKLIST.md` for the canonical tracker.

### Phase 8 actions
| # | Action | Status |
|---|--------|--------|
| 1 | NotificationType pruned to V1 set | ✅ |
| 2 | Marketing surface (About page, OG tags, README, email-auth split) | ✅ |
| 3 | Dead component cleanup + 600-line file size ceilings | ✅ |
| 4 | Rate-limit + Sentry instrumentation audit (47/59 routes) | ✅ |
| 5 | E2E Playwright authenticated flows (Crew accept, Intent → SubCrew, Meetup RSVP, check-in) | 🟡 IN PROGRESS |
| 6 | Sentry full coverage audit (47/59 → 59/59) | 🟡 IN PROGRESS |

### Production env gaps (must close before launch)
- Sentry DSN in Vercel prod
- Pusher env vars in Vercel prod (real-time SubCrew / RSVP / check-in disabled without them)
- Resend domain verification (auth + Meetup emails currently bounce)
- `DEMO_MODE=true` for the demo auth endpoint

### Post-V1 (do not ship before launch)
- Heatmap anchor priority 2 polish (deferred — priority 1/3/4 shipped)
- prisma 5 → 7, next 14 → 16, react 18 → 19 upgrades (see `docs/UPGRADE_PLAN.md`)
- Any reintroduction of trip-planning or AI surface

---

## ⚠️ Anti-Patterns to Avoid

### 1. Reintroducing removed surface
AI (PR #65) and trip planning (`src/_archive/trips/`) are intentionally out. Don't propose them without explicit founder direction.

### 2. Engagement-for-its-own-sake
Threaded comments, reactions ladders, stories, gamification badges — all explicitly cut from V1. The goal is to *end* sessions in a meetup, not to extend them.

### 3. New vendor / infra without justification
The V1 launch surface is small. New SaaS dependencies need a clear Phase 8 unblock.

### 4. Bypassing Crew-first privacy
Don't default new visibility surfaces to public or FoF without a PrivacyPickerModal gate.

### 5. Complex onboarding
First-run flow must get a user to their first Crew + first Intent in under 90 seconds.

---

## 📋 Planning Checklist

Before any feature is approved:

- [ ] Advances a step in Crew → Intent → SubCrew → Meetup → Check-in
- [ ] Raises (or at minimum preserves) Intent→SubCrew, SubCrew→Meetup, or Meetup→check-in rates
- [ ] Default Crew-only visibility, with opt-in gate for broader tiers
- [ ] Doesn't reintroduce removed surface (AI, trip planning)
- [ ] Mobile-first by design
- [ ] Has measurable success metric (and an anti-engagement guardrail)
- [ ] Real-time path uses an existing Pusher channel where possible
- [ ] Respects rate-limit + Sentry conventions
- [ ] Fits within Phase 8 — or is explicitly tagged post-V1

---

## 🔮 Long-Term Vision (post-V1)

### Beta launch (Phase 8 close)
- All actions #5–#6 complete
- All four prod env gaps closed (Sentry, Pusher, Resend, demo)
- E2E green in CI

### V1.1 — Densify
- More cities seeded; Topic catalog expanded
- Heatmap anchor priority 2 polish
- Onboarding tuning to <60s time-to-first-Intent

### V2 (subject to founder direction)
- Reactivate trip planning as a Crew sub-feature
- Reconsider AI-assisted Topic/Venue suggestions (founder sign-off required)
- Partner / venue integrations

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

*Remember: we're not building a trip planner. We're building the loop that signals Intent and ends with you walking into a venue with your Crew.*

*Last Updated: 2026-05-19*

