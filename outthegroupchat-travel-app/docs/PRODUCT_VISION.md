# Product Vision — v1

**Status:** Captured 2026-04-24 from founder direction; **8 open questions resolved 2026-04-24** (see Resolutions log). This document is the north star for v1 product scope. Pulls ahead of the current meetup/check-in primitives toward an **intent → group → coordinate → go** flow.

---

## The core loop

The shortest version:

1. **Signal intent** — after work (or any time of day), each Crew member marks *what they're interested in doing* with a topic + time window (e.g. "grab a drink, evening").
2. **See alignment** — Crew members see what teammates have on their radar. When two or more land on the same topic in an overlapping window, it surfaces as an emerging sub-crew.
3. **Opt in** — other Crew members join with one tap ("I'm in"). Initial state is `INTERESTED`; moves to `COMMITTED` once the sub-crew coalesces.
4. **Coordinate** — the formed sub-crew picks a time and receives venue recommendations tuned to the topic (Google Places + OTG "currently hot" signal).
5. **Commit + go** — each `COMMITTED` member individually picks **location visibility** across three axes (social scope × spatial granularity × identity mode) before contributing to any heatmap.

**Worked example** (founder's words):
> "Me and my buddy both put we want to grab a drink tonight. Our other friend sees that's on our radar to do and he also says he's in. Then they create a group and try to coordinate a time and get location recommendations."

---

## Data model sketch

Rough direction, not schema. Each of these is refined by the Resolutions log below.

- **Intent** — `{ userId, topicId, windowPreset, startAt?, endAt?, dayOffset, state }` where `windowPreset ∈ { EARLY_MORNING, MORNING, BRUNCH, AFTERNOON, EVENING, NIGHT }`, `dayOffset ∈ [0, 7]`, `state ∈ { INTERESTED, COMMITTED }`. Lighter than a Meetup — no venue, no fixed time, no attendees.
- **Topic** — curated taxonomy (~8–12 tags: drinks, run, coffee, brunch, dinner, live music, gym, casual meet, etc.). Free-text user input is bucketed into a Topic by a classifier; the user sees their phrasing plus a clickable tag chip.
- **SubCrew** — auto-formed when ≥2 Crew members hold live `INTERESTED` Intents on the same Topic with overlapping windows. Members transition their Intent state from `INTERESTED` → `COMMITTED` as they confirm.
- **VenueRecommendation** — per-Topic + per-geo shortlist. Google Places API (topic-filtered) is the primary source; each venue carries an OTG-derived "currently hot" signal drawn from aggregated heatmap contributions.
- **HeatmapContribution** — derived from a `CheckIn` at a `COMMITTED` moment, tagged with a 3-axis visibility spec (see Privacy model). Raw coordinates never leave the aggregation window.
- **Second-degree edge** — computed on read, not stored. Used only by the friend-of-friend heatmap.

Existing primitives (`Meetup`, `CheckIn`, `CrewMember`) stay. Intent/SubCrew sits *above* Meetup in the funnel — an Intent coordinating into a time/venue IS a Meetup.

---

## Privacy model (3 axes, per-relationship defaults + per-event overrides)

Privacy is the load-bearing part of v1. Defaults favor invisibility; visibility is always affirmative.

**Axis 1 — Social scope (per-event).** Chosen when a SubCrew agrees on a destination.

| Choice | Who sees your contribution |
|---|---|
| Full Crew | Every direct Crew member |
| Subgroup only | Only members of the SubCrew for this specific plan |
| Nobody (default) | You attend but don't add to any heatmap |

**Axis 2 — Spatial granularity (per-relationship default, per-event overridable).**

| Level | What the viewer sees |
|---|---|
| Block-radius (baseline) | Aggregated density at ~one-block cell |
| Dynamic cell (fine) | Smaller h3-cell / street level — opt-in per-relationship |
| Hidden | Explicit block-list — viewer sees nothing |

**Axis 3 — Identity mode (per-relationship default, per-event overridable).**

| Mode | Whose contribution |
|---|---|
| Anonymous | Contribution is unattributed — feeds density, no name attached |
| Known | Contribution is attributed — viewer sees it's you |

Picking social-scope = `Nobody` short-circuits the other two (no contribution = nothing to reveal). All other combinations are legal:

- *Full Crew + Anonymous + block* → "someone in my Crew is in the East Village" (default behavior for most relationships)
- *Subgroup + Known + dynamic cell* → "the 3 people I'm going out with see I'm at Ten Bells"
- *Full Crew + Known + block* → "my Crew sees me in the East Village" (identity shared, precise location isn't)

**Constraints we preserve across all combinations:**
- Opt-in is per-decision, not a global setting.
- Contribution is time-bounded (ties to `Check-in.activeUntil`).
- Precise coordinates never transit to another user — only aggregation.

---

## Hotspot heatmap (Crew-scoped) + Friend-of-friend heatmap

Two heatmap views, kept **deliberately separate** so neither pollutes the other.

### Crew-scoped heatmap

Density overlay of where your direct Crew is concentrated tonight.

- Feeds off `CheckIn`s from members who opted in to heatmap visibility for your relationship tier.
- Reads as density, not a list: "My Crew is clustering in the East Village" — not "Alex is at Ten Bells."
- Spatial and identity modes per contribution are set by Axes 2 + 3 above.

### Friend-of-friend heatmap (second window)

Separate view. Associated-but-not-direct connections only.

- **Default:** 1-hop via Crew — anyone who's a Crew member of one of your Crew members.
- **Tightening slider:** user can filter to "people sharing ≥N mutual Crew members" where N ∈ {1, 2, 3, ...}. Higher N = tighter graph, smaller but more-relevant heatmap.
- Never resolves individuals regardless of N. Always aggregated density.

---

## Notifications (3 types, all opt-in per device)

| Type | Trigger | Copy sketch | User control |
|---|---|---|---|
| **Daily prompt** | Time-of-day (default morning) | "What should we get up to today?" | Single toggle per device; time adjustable |
| **Per-member trigger** | Specific flagged Crew member creates an Intent | "[Name] is up for drinks tonight" | Per-member flag in settings |
| **Group-formation event** | Second `INTERESTED` Intent on same Topic + overlap | "You and [name] both want drinks tonight — want to plan?" | Fires to both (or all) matching members automatically |

Per-member triggers let close friends' Intents pierce quieter notification budgets while leaving the broad Crew muted by default.

---

## Recommendations pipeline

Two data sources, combined into the SubCrew coordination surface:

1. **Google Places API** — topic-filtered venue discovery. Each Topic maps to one or more Places categories (e.g. `drinks` → `bar`, `night_club`; `run` → `park`). Provides metadata, hours, location, rating.
2. **OTG "currently hot" signal** — derived from aggregated heatmap contributions. A venue whose adjacent cell has rising density in the relevant time-window gets a hotness boost in the ranked list.

Combined score = Places relevance × topic match × (1 + hotness boost). Exact weighting is an open sub-question.

---

## Resolutions log (2026-04-24)

Formal capture of the 8 questions the original draft flagged as open, now resolved by founder direction. Retained here as a dated record.

### R1 — Topic taxonomy: hybrid free-text + curated bucketing
**Question:** Curated list (8–12 tags) vs. free-text vs. hybrid?
**Resolution:** **Hybrid.** Users type free-form intent text. A classifier reads the text and buckets it into the underlying curated taxonomy. The user sees their phrasing preserved plus a clickable tag chip that opens the recommendation surface for that tag.

### R2 — Group-formation threshold: 2 Crew members
**Question:** Does it surface at 2 Crew members? 3? Only when all of a sub-crew land on the same Topic?
**Resolution:** **2 Crew members.** The instant two direct Crew connections hold live `INTERESTED` Intents on the same Topic with overlapping windows, they surface as an emerging SubCrew. That's the seed that forms the group.

### R3 — Intent time horizon: preset windows, 7-day lookahead
**Question:** "Tonight" or user-set `activeUntil`? How far in advance can you signal?
**Resolution:** **Six preset windows** — `EARLY_MORNING`, `MORNING`, `BRUNCH`, `AFTERNOON`, `EVENING`, `NIGHT` — each with default start/end times. Users can override the default time bounds per Intent. Users can signal up to **7 days** in advance.

### R4 — Heatmap granularity: per-relationship, 3-axis privacy model
**Question:** Neighborhood-level? 5-block grid? Dynamic h3-cell?
**Resolution:** **Per-relationship preferences, not a global setting.** Block-radius is the baseline for everyone. Users opt specific people up to finer dynamic cells (allow-list) or hide entirely (block-list). Identity mode is a second independent axis — users pick anonymous (location-only density contribution) or known (name-attributed contribution) per relationship. See the Privacy model section for the full 3-axis matrix.

### R5 — Friend-of-friend definition: 1-hop baseline, mutual-Crew threshold slider
**Question:** 2-hop via Crew? Mutual-Crew threshold? Includes pending-Crew or only accepted?
**Resolution:** **Default = 1-hop** (anyone who's a Crew member of one of your Crew members). User sets a mutual-Crew threshold to tighten: `≥1` (broadest), `≥2`, `≥3`, up to `≥N+` user-configurable cap. Only accepted Crew edges count.

### R6 — Opt-in UX: 2-stage Intent state
**Question:** Modal after "we've agreed"? Inline toggle? Single prompt?
**Resolution:** **Two-stage state on the Intent itself.** User initially posts `INTERESTED` (pure signal — visible to Crew, no heatmap contribution). Once they see Crew alignment, they transition to `COMMITTED` (which triggers the 3-axis visibility picker and any heatmap contribution). The transition is a tap in the SubCrew surface, not a separate modal flow.

### R7 — Recommendations source: Google Places + OTG hotness signal
**Question:** OTG-curated list? Google Places? Venue "currently hot" signal?
**Resolution:** **Google Places as primary** (topic-filtered venue discovery with metadata + hours). **Plus an OTG-derived "currently hot" signal** computed from aggregated heatmap contributions — venues adjacent to rising density get a hotness boost in the ranked list.

### R8 — Friction budget for daily signal: opt-in, 3 notification types
**Question:** Push? Default-off? Frequency?
**Resolution:** **All notifications are opt-in per device.** Three types:
- **Daily prompt** — morning push "What should we get up to today?" (user sets time + toggle)
- **Per-member trigger** — user flags specific Crew members; fires when those members signal intent
- **Group-formation event** — automatic, fires to all members of an emerging SubCrew the moment it forms

---

## New open sub-questions

The resolutions above surface questions that didn't exist before. These need answers before the Intent surface can ship:

1. **Classifier approach.** Deterministic keyword matching (v1 simple) or embedding-based fuzzy matching (v1.5 upgrade)? What happens when user text matches zero tags — prompt them to pick, auto-tag as `OTHER`, or silently store free-text only?
2. **Hotness signal math.** Rolling window length? Decay function? Whose contributions count in the hotness — your Crew, your FoF tier, the whole city? Does hotness leak across tiers or stay partitioned?
3. **Time-window overlap semantics.** If I signal `EVENING` and my Crew mate signals `NIGHT`, do we match? Exact-enum match only, or fuzzy-adjacent?
4. **Intent expiration rules.** When does an `INTERESTED` Intent decay if nothing matches? End of window? `+2 hours` after window? When the user next opens the app? Explicit expire-at?
5. **`COMMITTED` → heatmap contribution timing.** Does visibility start the moment I commit (before I leave), or only when I check in at the venue? Two distinct UX models with different privacy implications.
6. **Anonymous identity minimum-N.** In a 2-person SubCrew, "anonymous" is trivially deanonymized by the other member. Do we require a minimum N (say 3–5) for anonymous mode to actually anonymize, or accept the leaky-for-small-groups tradeoff?
7. **SubCrew gating after the initial 2.** Can a 3rd Crew member drop in via "I'm in" without approval? Does the 2-person seed gate further joiners, or is any Crew member with a matching Intent auto-added?
8. **Topic → Google Places category mapping.** Where does the mapping live — a static config file, a DB table, or embedded in the classifier? Who maintains it as Places' categories evolve?

---

## What this means for current PRs

The **meetup + check-in primitives already in the app are v0 scaffolding** that feeds this vision:
- A **CheckIn with opt-in visibility** → heatmap contribution.
- A **Meetup** → what a SubCrew becomes after coordination.
- A **Crew** → the trust boundary for both heatmaps.

The Lane B design passes (RSVPButton Pulse-In ✅, MeetupCard palette ✅, CheckInButton Drop-Pin ✅, NotificationItem + NearbyCrewList palette 🟡) remain on-scope — they polish the primitives this vision is built on.

**Net-new surface** that doesn't exist yet:
- Intent signal capture (the "what are you up for tonight" prompt — free-text field with tag classifier)
- SubCrew formation + coordination surface (the "emerging group" list + "I'm in" flow)
- 3-axis privacy picker (per-relationship defaults + per-event override)
- Heatmap views (Crew-scoped + friend-of-friend, two separate windows with mutual-count slider)
- 3-type notification system (daily prompt, per-member trigger, group-formation event)

These are v1 scope, not v0. Nothing in the current PR backlog ships them yet.

---

**Last updated:** 2026-04-24 (8 open questions resolved; 8 new sub-questions flagged)
**Source:** Founder direction, captured mid-Lane B.
