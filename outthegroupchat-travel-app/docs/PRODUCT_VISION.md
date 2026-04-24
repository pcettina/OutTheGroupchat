# Product Vision — v1

**Status:** Captured 2026-04-24 from founder direction. **20 resolutions locked 2026-04-24** (R1–R8 round 1, R9–R15 round 2, R16–R20 round 3); 1 sub-question provisionally defaulted (SQ7); 4 round-3 sub-questions flagged. See the Resolutions log for full decision history. This document is the north star for v1 product scope. Pulls ahead of the current meetup/check-in primitives toward an **intent → group → coordinate → go** flow.

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

- **Intent** — `{ userId, topicId, windowPreset, startAt?, endAt?, dayOffset, state, cityArea?, venueId? }` where `windowPreset ∈ { EARLY_MORNING, MORNING, BRUNCH, AFTERNOON, EVENING, NIGHT }`, `dayOffset ∈ [0, 7]`, `state ∈ { INTERESTED, COMMITTED }`, `cityArea` is an optional rough-location hint (curated neighborhood dropdown per R16), and `venueId` is an optional specific-venue override (also per R16) that contributes at finer cell granularity. Lighter than a Meetup — no fixed time, no attendees, no commitment.
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

## Heatmaps: Interest window + Presence window × Crew/FoF tiers

Two orthogonal distinctions, each its own view. The user switches between them with tab-level controls.

### Interest window — "where people *want* to be"

Density overlay fed by live `INTERESTED` Intents (not check-ins). Each contribution is anchored to either the Intent's `cityArea` (neighborhood granularity) or `venueId` (specific-venue granularity) per R16.

- Shows aspirational clustering before anyone commits or leaves the house.
- Reads as: "3 Crew members are interested in drinks in LES this evening."
- Contribution lasts as long as the Intent is live (expires at `window.end + 2h` per R12).

### Presence window — "where people *are*"

Density overlay fed by actual `CheckIn`s from members who transitioned `INTERESTED → COMMITTED` and arrived at a venue (per R13).

- Shows the realized version of the Interest window. The two often disagree.
- Reads as: "Crew is actually at Williamsburg tonight even though Interest said LES."
- Ties to `Check-in.activeUntil` — drops off when check-ins expire.

### Both windows respect Crew + FoF tiers

Each heatmap window supports two overlay layers the user toggles independently:

- **Crew layer** — direct Crew members only (baseline trust tier).
- **Friend-of-friend layer** — 1-hop via Crew by default. Mutual-Crew threshold slider (≥1, ≥2, ≥3, …) tightens the graph.

Result: 4 conceptual views (Interest × Crew, Interest × FoF, Presence × Crew, Presence × FoF), surfaced via 2 tabs × 2 overlay toggles. Individuals never resolve in any view; Axes 2 + 3 of the Privacy model (granularity, identity) govern per-contribution detail. Display refreshes every 30s while visible (per R19).

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
2. **OTG "currently hot" signal** — derived from city-wide aggregated heatmap contributions (both Interest + Presence windows). A venue whose adjacent cell has rising density in the relevant time-window gets a hotness boost in the ranked list. Per R10, hotness aggregates at city level so new users still see meaningful signal; a user-facing **"weight by my Crew"** filter re-ranks or highlights venues where the user's own Crew is contributing.

Combined score = Places relevance × topic match × (1 + hotness boost). Crew-weight filter optionally multiplies the boost by a Crew-contribution factor at read time.

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

### R9 — Classifier approach: deterministic keyword dictionary (v1), upgrade later
**Question:** Deterministic keyword matching or embedding-based fuzzy matching?
**Resolution:** **Deterministic keyword dictionary** for v1 (e.g. `{drinks, beer, wine, cocktail, bar} → DRINKS`). When user text matches zero tags, a picker chip appears so the user can assign a tag explicitly. Upgrade to embedding-based classification in v1.5 when the dictionary becomes unwieldy or ambiguous phrasing becomes common.

### R10 — Hotness aggregation: city-wide base + Crew-weighted filter
**Question:** Rolling window length? Scope — Crew, FoF, city?
**Resolution:** **City-wide aggregation** as the base — everyone's contributions (Crew + FoF + strangers) feed the hot-venue signal so new users still see meaningful results. **Rolling window: 6 hours, linear decay.** A user-facing **"weight by my Crew"** filter toggle re-ranks or highlights venues where the viewer's direct Crew is contributing, letting users choose between broad-network hot spots and Crew-specific hot spots at read time.

### R11 — Window overlap: adjacent enum values count as alignment
**Question:** Exact-enum match only, or fuzzy-adjacent?
**Resolution:** **Adjacent windows count as alignment.** Defined adjacency pairs: `EARLY_MORNING↔MORNING`, `MORNING↔BRUNCH`, `BRUNCH↔AFTERNOON`, `AFTERNOON↔EVENING`, `EVENING↔NIGHT`. Non-adjacent (`MORNING+NIGHT`) does not. Intents with custom `startAt/endAt` overrides use actual time-range intersection instead of the enum adjacency graph.

### R12 — Intent expiration: window end + 2h grace, then auto-delete
**Question:** When does an unmatched `INTERESTED` Intent decay?
**Resolution:** **Intent expires at `window.end + 2h` and auto-deletes.** Handles the "walked in at 11pm on a NIGHT Intent" case. User can also manually expire at any time. Expired Intents stop contributing to the Interest heatmap immediately.

### R13 — Two heatmap windows: Interest + Presence
**Question:** Does heatmap contribution start at `COMMITTED` (pre-arrival) or at `CheckIn` (at venue)?
**Resolution:** **Both, in separate heatmap views.** Interest heatmap feeds off live `INTERESTED` Intents with their `cityArea` hint. Presence heatmap feeds off actual `CheckIn`s after the user transitions to `COMMITTED` and arrives. The two views often disagree — that disagreement is informative ("we said LES but ended up in Williamsburg"). See the revised Heatmaps section above.

### R14 — Anonymous floor: require N ≥ 3 contributors for Anonymous mode
**Question:** Minimum contributors for Anonymous mode to actually anonymize?
**Resolution:** **N ≥ 3.** Below 3 contributors, the Anonymous option is disabled with a tooltip explaining why ("anonymous requires at least 3 contributors — right now you'd be the only one"). Known + Subgroup-only remains available at any size. Applies to both Interest and Presence heatmaps independently.

### R15 — Topic → Places category mapping: static TS config (v1), DB-backed (v1.5)
**Question:** Static config, DB table, or embedded in classifier?
**Resolution:** **Static TS config** in v1 at `src/lib/intent/topic-places-map.ts` as `Record<TopicId, PlacesCategory[]>`. Promote to a DB-backed table in v1.5 when ops needs to tune mappings without deploys. v1 tradeoff accepted: every mapping change = code change + deploy, but the taxonomy is small (~10 Topics × 1–3 Places categories each) so drift is rare.

### R16 — `cityArea` taxonomy: curated neighborhood list + optional venue override
**Question:** Fixed list per city? Free-text? Lat/lng cell fallback?
**Resolution:** **Curated per-city neighborhood list** as the baseline (NYC v1 ≈ 30 named neighborhoods). User picks from a dropdown when creating an Intent. `"Anywhere in [city]"` is an explicit option. **Plus an optional specific-venue override:** when a user knows exactly where they want to be, the Intent can carry a `venueId` in addition to (or instead of) `cityArea`. When set, the Interest heatmap contributes at the venue's cell (subject to the 3-axis privacy model) rather than the broader neighborhood cell. Free-text `cityArea` with geocoding is a v1.5 upgrade.

Data-model consequence: `Intent` gains an optional `venueId` field alongside `cityArea`.

### R17 — Adjacent-window hedge: collapse to one SubCrew
**Question:** If a Crew member hedges (signals `EVENING` AND `NIGHT`), does each match form a separate SubCrew?
**Resolution:** **Collapse to one SubCrew.** A user signaling two adjacent windows is expressing availability breadth, not declaring two distinct plans. When another Crew member matches either window, one SubCrew forms spanning the broader time range. One notification fires, not two. Collapse only applies to *adjacent* pairs (per R11's adjacency graph); non-adjacent hedges (`MORNING + NIGHT`) would form separate SubCrews if matched.

### R18 — Hotness math ownership: static TS config in v1
**Question:** Admin surface for post-launch tuning, or code-change-only?
**Resolution:** **Static TS config** in v1 at `src/lib/hotness/config.ts` exporting tuning constants (rolling window length, decay coefficient, Crew-weight factor). Every change = code change + deploy. Promote to a DB-backed table + minimal admin surface in v1.5, but only for the specific parameters that prove to need runtime tuning — premature admin UI is wasted work. Pattern mirrors R15.

### R19 — Heatmap refresh cadence: 30s client poll, Pusher push as v1.5 upgrade
**Question (surfaced mid-round):** How quickly does the heatmap display update as new contributions land?
**Resolution:** **Client polls `/api/heatmap` every 30 seconds** while the user has the map in view; skips polling while the tab is hidden (Page Visibility API). That 30-second cadence balances freshness against server load in v1. Pusher-based push updates (per-`cityArea` channel) are a v1.5 optimization if polling proves too laggy during peak hours. Note: *aggregation* windows (how far back contributions count) are already set by R12 (Intent expiry = `window.end + 2h`) and `Check-in.activeUntil` — those govern content, not refresh.

### R20 — Identity-mode default: Known for direct Crew, Crew-anchored Anonymous for FoF
**Question:** What identity mode does a just-accepted Crew relationship default to?
**Resolution:** **Direct Crew defaults to `Known`.** Crew membership is an explicit two-way opt-in — it *is* the trust signal. Defaulting Crew to Anonymous would mute the feature in the case where users want it most visible. **FoF defaults to `Crew-anchored Anonymous`:** the contributor's personal identity is not revealed, but the shared anchor is — viewers see *"an anonymous friend of [your crew member]"* rather than a bare "someone." This preserves social context ("this is in Alex's circle") without compromising FoF anonymity. Both defaults are user-overridable per relationship.

Open (see round-3 sub-questions): when a FoF user shares multiple mutual Crew anchors with the viewer, which anchor is named?

---

## New open sub-questions

One question from the round-1 sub-question pass remains open:

1. **SubCrew gating after the initial 2.** Can a 3rd Crew member drop in via "I'm in" without approval? Does the 2-person seed gate further joiners, or is any Crew member with a matching Intent auto-added?
   - **Provisional default** (not yet founder-confirmed): open to any direct Crew member with a matching Intent, no approval needed. The original 2 already opted into the Topic; they don't gate other matching members.

Round-3 sub-questions surfaced by R16–R20 (no ship blocker for Lane B — all now complete — but need answers before the Intent surface builds):

2. **Intent with both `cityArea` and `venueId`.** When the user picks both (venue within neighborhood), does `venueId` override the neighborhood entirely for the heatmap, or does the Intent contribute to both the venue cell AND the wider neighborhood cell? Simpler model = venue overrides; richer signal = both.
3. **Pusher channel granularity for heatmap push** (deferred until v1.5). Per-city (noisy), per-neighborhood (balanced), per-cell (precise but fan-out heavy)? Per-neighborhood feels right but locks in early what "neighborhood" means structurally.
4. **Crew-anchor selection when multiple mutuals exist.** If an FoF user shares 3 of the viewer's Crew as mutuals, which one is named in the `"anonymous friend of [X]"` attribution? Strongest tie (most interaction history)? Most-recent Crew addition? Random? User-ordered preference?
5. **Minimum-change threshold for heatmap polls.** Should the 30s refresh skip re-rendering if the underlying density hasn't changed meaningfully (< N% delta), or always re-render? Affects perceived flicker and rendering cost on low-end devices.

---

## What this means for current PRs

The **meetup + check-in primitives already in the app are v0 scaffolding** that feeds this vision:
- A **CheckIn with opt-in visibility** → heatmap contribution.
- A **Meetup** → what a SubCrew becomes after coordination.
- A **Crew** → the trust boundary for both heatmaps.

Lane B is **complete** as of 2026-04-24: RSVPButton Pulse-In ✅, MeetupCard palette ✅, CheckInButton Drop-Pin ✅, NotificationItem + NearbyCrewList palette ✅, NotificationCard Swipe-Dismiss + meetup-surface palette sweep (AttendeeList, CreateMeetupModal, MeetupInviteModal, VenuePicker, MeetupDetail) ✅. All three brief §6 signature interactions shipped.

**Net-new surface** that doesn't exist yet:
- Intent signal capture (the "what are you up for tonight" prompt — free-text field with tag classifier)
- SubCrew formation + coordination surface (the "emerging group" list + "I'm in" flow)
- 3-axis privacy picker (per-relationship defaults + per-event override)
- Heatmap views (Crew-scoped + friend-of-friend, two separate windows with mutual-count slider)
- 3-type notification system (daily prompt, per-member trigger, group-formation event)

These are v1 scope, not v0. Nothing in the current PR backlog ships them yet.

---

**Last updated:** 2026-04-24 (round 3: R16–R20 locked; 4 round-3 sub-questions surfaced; SQ7 still provisional; Lane B complete)
**Source:** Founder direction, captured across three resolution rounds on 2026-04-24.
