# Product Vision — v1

**Status:** Captured 2026-04-24 from founder direction. This document is the north star for v1 product scope. Pulls ahead of the current meetup/check-in primitives toward an **intent → group → coordinate → go** flow.

---

## The core loop

The shortest version:

1. **Signal intent** — after work, each Crew member marks *what they're interested in doing tonight* (e.g. "grab a drink", "go for a run", "dinner", "live music").
2. **See alignment** — Crew members see what teammates have on their radar. When two or more land on the same intent, it surfaces as an emerging group.
3. **Opt in** — other Crew members can join an emerging group with one tap ("I'm in").
4. **Coordinate** — the formed group picks a time and receives venue recommendations tuned to the intent.
5. **Commit + go** — once the group agrees on a location, members individually **opt in to location visibility** (see below) and head out.

**Worked example** (founder's words):
> "Me and my buddy both put we want to grab a drink tonight. Our other friend sees that's on our radar to do and he also says he's in. Then they create a group and try to coordinate a time and get location recommendations."

---

## Hotspot heatmap (Crew-scoped)

A **heatmap**, not pin-drops. Shows *where* your Crew activity is concentrated tonight without exposing individual locations.

- Feeds off check-ins where the member opted in to heatmap visibility (see opt-in rules below).
- Aggregation is deliberate: reads like a density overlay, not a list of friends at specific venues.
- "My Crew is clustering in the East Village tonight" is the thing this view answers — not "Alex is at Ten Bells."

## Friend-of-friend heatmap (second window)

A **separate** view — not blended with the Crew heatmap — showing *associated but not direct* connections.

- Think "Crew mates of your Crew mates who you aren't directly connected to."
- Same density-overlay treatment; individuals never resolve.
- Answers "where is the broader scene going tonight" without compromising either side's privacy.

Open: exact graph distance (2-hop? Must share ≥1 mutual Crew?). See open questions.

---

## Opt-in rules for location visibility

Privacy is the load-bearing part. Defaults favor invisibility; visibility is an affirmative choice.

Every time a group agrees on a destination, each member individually picks one of:

| Choice | Who can see your location contribution |
|---|---|
| **Full Crew** | Everyone in your Crew appears in your heatmap |
| **Subgroup only** | Only the members who agreed to this specific plan |
| **Nobody** | Default — you attend but don't add to any heatmap |

**Constraints we should preserve:**
- Opt-in is per-decision, not a global setting — you can be Full Crew for drinks Friday and Subgroup-only for a date Saturday.
- Once opted in, the contribution is time-bounded (ties to `Check-in.activeUntil`).
- Opting in never reveals your precise location to another user — only feeds the aggregation.

---

## What this asks of the data model

Rough sketch — treat as direction, not schema:

- **Intent** — a lightweight signal with `userId`, `topic`, `activeUntil`. Lighter than a Meetup (no venue, no time, no attendees). Tonight-scoped.
- **Topic** — curated taxonomy (drinks, run, coffee, dinner, live music, gym, casual meet). Open question on free-form vs. constrained.
- **IntentGroup** — formed when ≥2 Crew members share a live Intent on the same Topic. Members opt in individually.
- **VenueRecommendation** — per-Topic + per-geo shortlist; surfaced into an IntentGroup during coordination.
- **HeatmapContribution** — derives from `Check-in` with `visibility ∈ {CREW_HEATMAP, SUBGROUP_HEATMAP, NONE}`. Never stores raw coordinates beyond aggregation window.
- **Second-degree edge** — computed, not stored. Used only for the friend-of-friend heatmap read path.

Existing primitives (`Meetup`, `CheckIn`, `CrewMember`) mostly stay — Intent/IntentGroup sits *above* Meetup in the funnel.

---

## Open questions (founder + design to resolve)

1. **Topic taxonomy.** Curated list (8–12 tags) vs. free-text vs. hybrid? Curated is easier to match on and suggest venues for; free-text is more expressive but doesn't cluster well.
2. **Group-formation threshold.** Does it surface at 2 Crew members? 3? Only when all members of a sub-crew land on the same Topic?
3. **Intent time horizon.** Is "tonight" = today-until-2am, or does the user set an `activeUntil`? How far in advance can you signal? (Tomorrow? Weekend?)
4. **Heatmap granularity.** Neighborhood-level (e.g. East Village)? 5-block grid? Dynamic h3-cell?
5. **Friend-of-friend definition.** 2-hop via Crew (my Crew's Crew)? Mutual-Crew threshold? Includes pending-Crew or only accepted?
6. **Opt-in UX.** Modal after "we've agreed to go"? Inline toggle during group chat? Single-question prompt?
7. **Recommendations source.** OTG-curated list per Topic? Integrate Google Places with a Topic filter? Venue has its own "currently hot" signal?
8. **Friction budget for the daily signal.** "What are you up for tonight?" arrives as a push? Default-off and user-triggered? Opt-in once per day vs. once per afternoon?

---

## What this means for current PRs

The **meetup + check-in primitives already in the app are v0 scaffolding** that feeds this vision:
- A **CheckIn with opt-in visibility** → heatmap contribution.
- A **Meetup** → what an IntentGroup becomes after coordination.
- A **Crew** → the trust boundary for both heatmaps.

The Lane B design passes (RSVPButton Pulse-In, MeetupCard palette, CheckInButton Drop-Pin, etc.) are still on-scope — they polish the primitives this vision is built on.

**Net-new surface** that doesn't exist yet:
- Intent signal capture (the "what are you up for tonight" prompt)
- IntentGroup formation + coordination surface
- Heatmap view (Crew + friend-of-friend, two windows)
- Per-decision opt-in flow

These are v1 scope, not v0. Nothing in the current PR backlog ships them yet.

---

**Last updated:** 2026-04-24
**Source:** Founder direction, captured mid-Lane B.
