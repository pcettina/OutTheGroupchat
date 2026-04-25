# V1 Implementation Plan

**Status:** Drafted 2026-04-24 after 4 rounds of vision resolution. Translates [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) into phased shippable work. R-references throughout cite locked resolutions in the vision doc.

**Working principle:** Ship by user-journey, not by layer. Each phase ends with something a user can actually do. Phase 0 is the only infra-only ring.

---

## Journey map

| Phase | User journey | What exists after this phase |
|---|---|---|
| **0** | *(Infra)* Data model foundation | Schema + migrations + lib stubs. Nothing user-visible yet. |
| **1** | **A — Signal intent** | User types "drinks tonight," picks a window + cityArea, posts an `INTERESTED` Intent. Crew sees it. |
| **2** | **B — See alignment + join** | Two matched Intents auto-form a SubCrew. Others tap "I'm in." Group-formation notification fires. |
| **3** | **C — Coordinate + commit** | SubCrew picks a time, sees venue recommendations, each member transitions `INTERESTED → COMMITTED` with per-event 3-axis privacy picker. |
| **4** | **D — See where people are** | Interest + Presence heatmaps ship. Crew layer first, FoF layer adds threshold slider. |
| **5** | **E — Get prompted** | Morning daily prompt + per-member triggers wire in. |

Dependency direction: `0 → 1 → 2 → 3 → 4`. Phase 5 (notifications) can ship in parallel with 4 once Phase 2's formation-event hook exists.

---

## Phase 0 — Data model foundation

**Ship when:** `npx prisma migrate deploy` runs clean against a Neon branch, types regenerate without errors, one end-to-end smoke test (create Intent → retrieve → expire) passes.

### Schema additions (`prisma/schema.prisma`)

```prisma
enum WindowPreset {
  EARLY_MORNING
  MORNING
  BRUNCH
  AFTERNOON
  EVENING
  NIGHT
}

enum IntentState {
  INTERESTED
  COMMITTED
}

enum JoinMode {
  SEED                 // one of the original 2 that formed the SubCrew
  JOINED_VIA_IM_IN     // opted in after formation
}

enum ContributionType {
  INTEREST
  PRESENCE
}

enum GranularityMode {
  BLOCK                // baseline (R4)
  DYNAMIC_CELL         // finer; per-relationship opt-in
  HIDDEN               // block-listed
}

enum IdentityMode {
  KNOWN                // name attributed
  ANONYMOUS            // unattributed (subject to N≥3 floor, R14)
  CREW_ANCHORED        // FoF attribution: "anonymous friend of [X]" (R20)
}

enum SocialScope {
  FULL_CREW
  SUBGROUP_ONLY
  NOBODY               // default
}

enum NotificationTrigger {
  DAILY_PROMPT
  PER_MEMBER_INTENT
  GROUP_FORMATION      // auto, per R8/Phase 2
}

model Topic {
  id                String   @id @default(cuid())
  slug              String   @unique     // "drinks", "run", "coffee"
  displayName       String
  placesCategories  String[]             // R15: ["bar", "night_club"]
  keywords          String[]             // R9: dictionary for the classifier
  createdAt         DateTime @default(now())

  intents           Intent[]
  subCrews          SubCrew[]
}

model Intent {
  id             String       @id @default(cuid())
  userId         String
  topicId        String
  windowPreset   WindowPreset
  startAt        DateTime?                // override of preset default
  endAt          DateTime?                // override of preset default
  dayOffset      Int          @default(0) // 0..7 per R3
  state          IntentState  @default(INTERESTED)
  cityArea       String?                  // neighborhood slug per R16
  venueId        String?                  // specific-venue override per R22
  rawText        String?                  // original user input (audit + v1.5 embedder training)
  createdAt      DateTime     @default(now())
  expiresAt      DateTime                 // = windowEnd + 2h per R12

  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  topic          Topic        @relation(fields: [topicId], references: [id])
  venue          Venue?       @relation(fields: [venueId], references: [id])

  subCrewMemberships SubCrewMember[]

  @@index([userId, state, expiresAt])     // "my live intents"
  @@index([topicId, windowPreset, dayOffset, expiresAt])  // SubCrew formation scan
  @@index([cityArea])                     // Interest heatmap aggregation
}

model SubCrew {
  id           String        @id @default(cuid())
  topicId      String
  windowPreset WindowPreset
  startAt      DateTime                   // broadest of the seed Intents' windows
  endAt        DateTime
  cityArea     String?
  venueId      String?
  createdAt    DateTime      @default(now())
  // `meetupId` optional — once SubCrew coordinates into a concrete Meetup, this links
  meetupId     String?       @unique

  topic        Topic         @relation(fields: [topicId], references: [id])
  members      SubCrewMember[]
  meetup       Meetup?       @relation(fields: [meetupId], references: [id])

  @@index([topicId, windowPreset, startAt])
}

model SubCrewMember {
  id          String   @id @default(cuid())
  subCrewId   String
  userId      String
  intentId    String?                      // what opted them in
  joinedAt    DateTime @default(now())
  joinMode    JoinMode

  subCrew     SubCrew  @relation(fields: [subCrewId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  intent      Intent?  @relation(fields: [intentId], references: [id])

  @@unique([subCrewId, userId])
}

model CrewRelationshipSetting {
  id               String          @id @default(cuid())
  viewerId         String                              // the user setting the preference
  targetId         String                              // about whom
  granularityMode  GranularityMode @default(BLOCK)
  identityMode     IdentityMode    @default(KNOWN)     // R20: Crew → Known default
  updatedAt        DateTime        @updatedAt

  viewer           User            @relation("RelSettingViewer", fields: [viewerId], references: [id], onDelete: Cascade)
  target           User            @relation("RelSettingTarget", fields: [targetId], references: [id], onDelete: Cascade)

  @@unique([viewerId, targetId])
}

model HeatmapContribution {
  id             String           @id @default(cuid())
  userId         String
  type           ContributionType
  sourceId       String                                  // Intent.id or CheckIn.id depending on type
  cellLat        Float                                   // anonymized cell center
  cellLng        Float
  cellPrecision  GranularityMode                         // BLOCK or DYNAMIC_CELL
  topicId        String?
  windowPreset   WindowPreset?
  socialScope    SocialScope
  identityMode   IdentityMode
  expiresAt      DateTime
  createdAt      DateTime         @default(now())

  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([type, expiresAt, topicId])  // heatmap reads
  @@index([userId, expiresAt])         // cleanup
}

model NotificationPreference {
  id               String              @id @default(cuid())
  userId           String
  trigger          NotificationTrigger
  enabled          Boolean             @default(false)
  schedule         String?                               // e.g. "09:00" for DAILY_PROMPT
  perMemberTargets String[]                              // userIds this viewer has flagged (PER_MEMBER_INTENT)
  updatedAt        DateTime            @updatedAt

  user             User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, trigger])
}
```

**Relations to existing models:** `User` gains back-relations for `intents`, `subCrewMemberships`, `crewRelationshipSettingsAsViewer`, `crewRelationshipSettingsAsTarget`, `heatmapContributions`, `notificationPreferences`. `Venue` gains `intents`. `Meetup` gains optional `subCrew` back-relation.

### Seed data (`prisma/seed/`)

- `seed/topics.ts` — 10 curated Topics with keywords (drinks, run, coffee, brunch, dinner, live music, gym, casual meet, gallery/museum, outdoor activity) + their `placesCategories` per R15.
- `seed/neighborhoods-nyc.ts` — ~30 NYC cityAreas (East Village, LES, Williamsburg, etc.).

### Library stubs (skeleton only — no logic yet)

- `src/lib/intent/topic-classifier.ts` — exports `classifyIntentText(text: string): { topicId: string | null, matchedKeywords: string[] }`. Stub returns `null`.
- `src/lib/intent/topic-places-map.ts` — exports `getPlacesCategoriesForTopic(topicId): PlacesCategory[]`. Reads from seed for now.
- `src/lib/hotness/config.ts` — exports `HOTNESS_CONFIG = { rollingWindowHours: 6, decayCoefficient: 1.0, crewWeightFactor: 1.5 }` per R18.
- `src/lib/motion.ts` — **already exists** from Lane B, no work here.

### Ship criteria
- `prisma migrate deploy` succeeds on a Neon branch
- `npm run db:generate` regenerates types with no errors
- `npm run build` passes
- Smoke test: one script creates an Intent via Prisma directly, retrieves it, auto-expires it past its `expiresAt`
- 0 TSC errors, 0 lint errors

**Estimated PRs:** 1 (schema + seed + stubs bundled). ~500 LOC mostly in Prisma + seed.

---

## Phase 1 — Journey A: Signal intent

**Ship when:** A user can open the app, type "drinks tonight" (or similar), and see an `INTERESTED` Intent appear in their own profile. Crew members see it on their feed.

### API routes
- `POST /api/intents` — body: `{ rawText, windowPreset, dayOffset, cityArea?, venueId? }`. Runs `classifyIntentText(rawText)` to resolve `topicId`. If classifier returns `null`, response includes `needsTopicPicker: true` and frontend prompts the user. Writes Intent with computed `expiresAt`.
- `GET /api/intents/mine` — list my live Intents (state != expired).
- `GET /api/intents/crew` — Intents from my direct Crew, live only.
- `PATCH /api/intents/[id]` — transition state (`INTERESTED → COMMITTED`, tied to Phase 3 privacy picker); edit windows.
- `DELETE /api/intents/[id]` — manual expiry.
- Zod validation + rate limit + Sentry instrumentation on all.

### Classifier implementation (real logic)
`src/lib/intent/topic-classifier.ts` — deterministic keyword dictionary match per R9:
```
function classifyIntentText(text) {
  const tokens = tokenize(text.toLowerCase());
  const scores = {};
  for (const topic of TOPICS) {
    scores[topic.id] = topic.keywords.filter(k => tokens.includes(k)).length;
  }
  const top = maxBy(scores);
  return top.score > 0 ? { topicId: top.topicId, matchedKeywords: ... } : { topicId: null, matchedKeywords: [] };
}
```

### UI
- New route: `/intents/new` — form with free-text input, window-preset picker, cityArea dropdown (populated from the neighborhoods seed), optional "pick a specific venue" that opens VenuePicker (already exists from Lane B).
- New component: `src/components/intents/IntentCreateForm.tsx`.
- New component: `src/components/intents/IntentChip.tsx` (renders one Intent's topic + window).
- New component: `src/components/intents/IntentList.tsx` (renders Crew Intents).
- Home/feed integration: a prompt card "What are you up for tonight?" links to `/intents/new`.

### Auto-expiry job
- Scheduled (Vercel cron or GitHub Action if Hobby tier): `POST /api/cron/expire-intents` every 10 min. Finds Intents with `expiresAt < now()`, soft-deletes or marks expired. Must carry the existing `CRON_SECRET` pattern.

### Ship criteria
- User flow works end-to-end on preview deploy
- 5+ Vitest tests for `classifyIntentText` (exact-match, no-match, case, multi-word)
- 10+ route tests for `/api/intents/*`
- TSC/lint/build all clean

**Estimated PRs:** 2 (API + classifier in one, UI in another).

---

## Phase 2 — Journey B: See alignment + join

**Ship when:** Two users with matching `INTERESTED` Intents see a SubCrew form automatically, get a group-formation notification, and a 3rd user can tap "I'm in" to join.

### Formation detection
- On every `Intent` create or state change, run `tryFormSubCrew(intent)`:
  - Query for other live `INTERESTED` Intents matching on `(topicId, windowPreset or adjacent per R11, cityArea-overlap OR any)` from users in this user's Crew.
  - If ≥1 match (R2 threshold of 2 total), create a `SubCrew` + `SubCrewMember` rows for the seeds.
  - Fire `GROUP_FORMATION` notification to all seed members (R8 trigger #3).
- Adjacent-window collapse per R17: if a user holds both `EVENING` and `NIGHT` Intents, match logic collapses them so two separate SubCrews don't form from the same hedge.

### API routes
- `GET /api/subcrews/mine` — my live SubCrews (member of).
- `POST /api/subcrews/[id]/join` — the "I'm in" tap. Validates the joiner has a matching Intent (or creates one inline if provided in body). Appends a `SubCrewMember` with `joinMode = JOINED_VIA_IM_IN`. Per R21: open — no approval needed.
- `GET /api/subcrews/[id]` — read a SubCrew + its members (for the coordination surface in Phase 3).

### UI
- `src/components/subcrews/EmergingSubCrewCard.tsx` — shown in feed / intents list when a SubCrew forms around one of user's Intents. Lists matched members, topic, window.
- `src/components/subcrews/ImInButton.tsx` — "I'm in" CTA. Reuses `snappySpring` + haptic from `src/lib/motion.ts`.
- Feed integration: a SubCrew card appears at the top when one forms that you can join.

### Ship criteria
- End-to-end: user A + user B (Crew, matching Intents) → SubCrew row exists + notification sent
- User C (Crew, no Intent) sees the SubCrew in their feed with the "I'm in" CTA
- User D (not Crew) does NOT see the SubCrew
- `tryFormSubCrew` has unit tests covering adjacent-window collapse + multi-user match

**Estimated PRs:** 1–2 (formation logic + UI can bundle; FoF matching stays out per Phase 4).

---

## Phase 3 — Journey C: Coordinate + commit

**Ship when:** A formed SubCrew can coordinate on a time, see venue recommendations, and each member can transition their Intent to `COMMITTED` with per-event privacy picker.

### SubCrew coordination surface
- New route: `/subcrews/[id]` — shows members, agreed-time picker, venue recommendations, "Commit" CTA per member.
- Time coordination: simple picker that collects each member's "when works?" as a `SubCrewMember.proposedTime` field. When all proposed times converge or the seed manually sets a time, `SubCrew.startAt` is frozen.
- Meetup linkage: once the SubCrew has a time + venue, it optionally creates a `Meetup` and sets `SubCrew.meetupId` — reusing the existing Meetup surface from Lane B.

### Privacy picker modal
- `src/components/privacy/PrivacyPickerModal.tsx` — 3-axis picker (social scope × granularity × identity) per the R4 + R20 defaults.
- Triggered on each member's "Commit" tap; persists to `CrewRelationshipSetting` table (for per-relationship changes) and tags this event's contribution.

### Recommendations (MVP)
- `GET /api/recommendations?topicId=...&cityArea=...&venueId?=...` — calls Google Places with categories from `topic-places-map.ts`, ranks by (Places relevance) × (1 + hotness boost from `lib/hotness`).
- Hotness boost is minimal in Phase 3 (no heatmap data yet). Ships as a stub that returns pure Places ranking; gets real hotness input once Phase 4 ships.
- Component: `src/components/subcrews/RecommendationsList.tsx`.

### Ship criteria
- End-to-end: SubCrew → member commits → Intent state flips, privacy captured, contribution ready to feed heatmap once Phase 4 reads it
- Privacy picker has 3-axis tests
- Recommendations surface renders with real Places data

**Estimated PRs:** 2 (coordination + privacy picker, then recommendations).

---

## Phase 4 — Journey D: See where people are

**Ship when:** User can open a heatmap view, switch between Interest/Presence tabs, toggle Crew/FoF overlay, and see density render at 30s polling cadence.

### Phase 4a — Crew layer only
- `GET /api/heatmap?type=interest|presence&tier=crew&cityArea?=...` — server-side aggregation of `HeatmapContribution` rows. Enforces R4 granularity + R14 anonymous minimum-N (≥3) + R20 identity mode. Returns cells + optional venue markers.
- `src/app/heatmap/page.tsx` — full-page map (leaflet or maplibre).
- `src/components/heatmap/HeatmapView.tsx` — orchestrates tabs (Interest/Presence), overlay toggle (Crew on by default, FoF pending 4b), 30s polling with Page Visibility gating per R19.
- Zoom-aware rendering (R22): threshold zoom level switches between cell density and discrete venue markers.
- Contribution writer: on `Intent.create` and `CheckIn.create`, compute + write `HeatmapContribution` row with cell anonymization.

### Phase 4b — FoF layer
- Extend API to compute 1-hop FoF set on read (expensive; cache per-viewer for 60s).
- UI adds FoF overlay toggle + mutual-count threshold slider (R5).
- Crew-anchor attribution per R24 priority hierarchy — needs event-context detection (R24 follow-up SQ, still open but has a reasonable default).

### Ship criteria
- End-to-end: user with live Intent sees their cell render anonymously in the Interest tab from a Crew mate's view
- Presence tab updates within 60s of a check-in
- Zoom past threshold → venue markers appear
- Anonymous N<3 falls back to hidden or coarse aggregation
- 30s poll stops when tab is hidden (Page Visibility API)

**Estimated PRs:** 2–3 (Crew + API + UI one PR; FoF in a follow-up; zoom-aware rendering may need its own).

---

## Phase 5 — Journey E: Get prompted

**Ship when:** A user can opt into the daily morning prompt and per-member triggers; both deliver reliably.

### Daily prompt
- Cron: `POST /api/cron/send-daily-prompts` every 15 min. Finds users with `NotificationPreference.trigger = DAILY_PROMPT, enabled = true` whose local `schedule` matches the current cadence.
- Copy: `"What should we get up to today?"` (R8). Deep-links to `/intents/new`.

### Per-member trigger
- On `Intent.create`, find users who have flagged the author in `NotificationPreference.perMemberTargets`. Fire notification `"[Name] is up for [topic] tonight"`.

### Settings surface
- `/settings/notifications` — per-trigger toggles + per-member picker.
- `PATCH /api/users/notification-preferences`.

### Ship criteria
- Opt-in flows work per device
- Daily prompt fires at configured time, skips opt-outs
- Per-member trigger fires within 10s of flagged member's Intent create

**Estimated PRs:** 1–2 (cron + settings page).

---

## Cross-cutting concerns

### Testing
- Every phase carries ≥10 route tests + ≥5 unit tests for new libs
- Integration tests for the Intent → SubCrew → Meetup pipeline (Phase 1+2+3)
- Follow existing Vitest setup in `src/__tests__/`

### Telemetry
- Sentry instrumentation on every new route (existing pattern)
- New event types to log: `intent_created`, `subcrew_formed`, `commit_transition`, `privacy_picker_opened`, `heatmap_viewed`

### Migrations
- Neon branch-per-PR workflow already wired (per project memory). Each phase's PR gets its own Neon branch with `prisma migrate deploy` applied automatically.
- Phase 0 migration is the only one that adds breaking table changes; later phases only add columns on existing models (non-breaking).

### Privacy-by-default
- Social-scope default is `NOBODY` (R4). First-time commit must make the picker unmissable.
- Anonymous N<3 floor (R14) enforced at the aggregation layer, not the UI — can't be bypassed client-side.

---

## Known risks

1. **Classifier miss rate** (R9). If the keyword dictionary misses too many Intents, user ends up at the manual picker too often → friction. Mitigation: instrument the "no-match" path and review week 1 miss rate; add keywords iteratively.
2. **FoF graph expansion cost**. 1-hop FoF can grow large for users with well-connected Crews. Mitigation: cache + cap the FoF set size at read time (e.g. top 200 by mutual-count).
3. **Heatmap render cost on low-end devices**. 30s full re-render (R25) may jank. Mitigation: profile on a low-end phone in Phase 4a; fall back to R25's v1.5 skip-if-unchanged upgrade if needed.
4. **Google Places rate limits**. Recommendations (Phase 3) depend on Places quota; `GOOGLE_PLACES_API_KEY` already set. Mitigation: cache recommendations per `(topicId, cityArea)` for 5 minutes.
5. **Schema complexity**. Phase 0 adds ~8 new tables; migration rollback needs a clean path. Mitigation: practice the down-migration on a throwaway Neon branch before Phase 0 lands.

---

## Open sub-questions to revisit

These are documented in [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) and don't block Phase 0, but the later phase they gate:

| Sub-q | Phase that needs it |
|---|---|
| Zoom threshold for venue-marker rendering (R22 follow-up) | Phase 4 |
| Event-context detection for anchor selection (R24 follow-up) | Phase 4b |

---

**Last updated:** 2026-04-24
**Source:** Translation of `PRODUCT_VISION.md` (25 resolutions R1–R25) into phased work.
