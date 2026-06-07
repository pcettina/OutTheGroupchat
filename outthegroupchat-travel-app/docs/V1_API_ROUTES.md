# V1 API Routes

> Last Updated: 2026-05-16
> Source of truth for the intent-to-group loop API surface. Once docs/API_STATUS.md is updated to include these routes, this file may be deprecated.

This document covers the V1 product surface — the **intent → auto-group → coordinate → venue recs → opt-in location visibility** loop. All routes require an authenticated session (`getServerSession(authOptions)`) and return `401 Unauthorized` otherwise. All routes use the shared `apiRateLimiter` (per-user keyed) unless noted.

Convention used throughout: handlers return `{ success: true, data: ... }` on success and `{ success: false, error: '...' }` on failure.

---

## Intents

### POST /api/intents

Create an `INTERESTED` Intent. Runs `classifyIntentText(rawText)` to resolve a `Topic`; if the classifier returns no match, response carries `needsTopicPicker: true` (HTTP 422) so the UI can prompt for a manual topic. After creation, `tryFormSubCrew(intent)` is invoked best-effort — failure is non-fatal.

- **Auth:** required
- **Rate limit:** `intent-create:<userId>` (apiRateLimiter)
- **Body (Zod `createIntentSchema`):**
  - `rawText?: string` (1–280, trimmed) — required if `topicId` not supplied
  - `topicId?: cuid` — required if `rawText` not supplied
  - `windowPreset: WindowPreset` (enum, required)
  - `dayOffset?: int 0..MAX_DAY_OFFSET` (default 0)
  - `startAt?: ISO datetime with offset`
  - `endAt?: ISO datetime with offset`
  - `cityArea?: string` (1–100)
  - `venueId?: cuid`
  - Refinement: `rawText` OR `topicId` must be present
- **Response 201:** `{ success, data: Intent, matchedKeywords: string[], subCrewId: string|null }`
- **Response 422:** `{ success: false, needsTopicPicker: true, message }`
- **Side effects:** writes `Intent`; may form a `SubCrew` via `tryFormSubCrew` (writes `SubCrew` + `SubCrewMember` rows). No pusher; no notifications fired directly by POST (downstream formation may emit them).

### PATCH /api/intents/[id]

Edit an Intent's window / cityArea / venueId, or transition `INTERESTED → COMMITTED`. Owner-only.

- **Auth:** required; owner-only (returns 403 otherwise)
- **Rate limit:** `intent-patch:<userId>`
- **Body (Zod `patchSchema`):**
  - `state?: IntentState`
  - `windowPreset?: WindowPreset`
  - `dayOffset?: int 0..MAX_DAY_OFFSET`
  - `startAt?: ISO datetime | null`
  - `endAt?: ISO datetime | null`
  - `cityArea?: string (1–100) | null`
  - `venueId?: cuid | null`
  - Refinement: at least one field required
- **Response 200:** `{ success, data: Intent }` (window recomputed via `resolveIntentWindow` when window fields change)
- **Side effects:** updates `Intent`. No privacy metadata persisted on commit transition here — that's owned by `POST /api/subcrews/[id]/commit`.

### DELETE /api/intents/[id]

Owner-only manual expiry. Sets `expiresAt = now` (no hard delete — audit trail preserved).

- **Auth:** required; owner-only
- **Rate limit:** `intent-delete:<userId>`
- **Response 200:** `{ success, data: { id, expiresAt } }`

### GET /api/intents/crew

R2 (Crew tier). Live `INTERESTED` Intents from the caller's accepted Crew partners. `COMMITTED` intents are filtered (they're privacy-tagged per R20 and surface via the per-event heatmap).

- **Auth:** required
- **Rate limit:** `intent-crew:<userId>`
- **Query (Zod `querySchema`):**
  - `topicId?: cuid`
  - `limit?: int 1..100` (default 50)
- **Response 200:** `{ success, data: { intents: Intent[] } }` (each includes `user{id,name,image}` and `topic{id,slug,displayName}`)
- **Filter:** `userId IN crewIds AND state='INTERESTED' AND expiresAt > now`

### GET /api/intents/mine

Caller's own Intents.

- **Auth:** required
- **Rate limit:** `intent-mine:<userId>`
- **Query:**
  - `state?: IntentState`
  - `includeExpired?: boolean` (default false)
  - `limit?: int 1..100` (default 50)
- **Response 200:** `{ success, data: { intents: Intent[] } }` (includes `topic`)

---

## SubCrews

### GET /api/subcrews/emerging

SubCrews the caller can join: at least one current member is in caller's accepted Crew, caller is not already a member, SubCrew window still live (`endAt > now`). Powers the feed "Crew aligned around X — I'm in?" card.

- **Auth:** required
- **Rate limit:** `subcrew-emerging:<userId>`
- **Query:** `limit?: int 1..50` (default 10)
- **Response 200:** `{ success, data: { subCrews: SubCrew[] } }` with `topic` + `members{ id, userId, joinMode, user }`

### GET /api/subcrews/mine

Caller's live SubCrews — caller is a member, `endAt > now` (unless `includeExpired`).

- **Auth:** required
- **Rate limit:** `subcrew-mine:<userId>`
- **Query:**
  - `includeExpired?: boolean` (default false)
  - `limit?: int 1..100` (default 50)
- **Response 200:** `{ success, data: { subCrews: SubCrew[] } }` (includes `meetupId`, `venueId`, members)

### GET /api/subcrews/[id]

Single SubCrew detail. Visibility (R2): members + Crew of any current member. Anyone else: **404** (non-leaking, not 403).

- **Auth:** required
- **Rate limit:** `subcrew-get:<userId>`
- **Response 200:** `{ success, data: { subCrew, viewerIsMember: boolean } }`
- **Response 404:** when not found OR caller is neither member nor Crew of a member

### PATCH /api/subcrews/[id]

Seed-only (Phase 3) — freeze the meeting time and bind a venue. Non-seed callers get **404** (existence non-leak).

- **Auth:** required; `SubCrewMember.joinMode === 'SEED'` required
- **Rate limit:** `subcrew-patch:<userId>`
- **Body (Zod `patchSchema`):**
  - `startAt?: ISO datetime`
  - `endAt?: ISO datetime`
  - `venueId?: cuid | null`
  - `cityArea?: string (1–100) | null`
  - Refinement: at least one field required
  - Cross-field: `endAt > startAt` if both provided
- **Response 200:** `{ success, data: { id, startAt, endAt, venueId, cityArea } }`

### POST /api/subcrews/[id]/commit

V1 Phase 3 — Journey C "Commit." Atomically: validates caller is a member with a matching `INTERESTED` Intent, flips Intent `INTERESTED → COMMITTED`, stamps `SubCrewMember.committedAt`, and writes a `HeatmapContribution` (Interest type) via `buildInterestContributionData`. All three writes happen in a single `prisma.$transaction`.

- **Auth:** required; caller must be SubCrew member; Intent must belong to caller and be in `INTERESTED` state
- **Rate limit:** `subcrew-commit:<userId>`
- **Body (Zod `commitSchema`):**
  - `intentId: cuid`
  - `socialScope?: HeatmapSocialScope` (default `NOBODY`)
  - `granularity?: HeatmapGranularityMode` (default `BLOCK`)
  - `identityMode?: HeatmapIdentityMode` (default `KNOWN` — R20 Crew default)
- **Response 200:** `{ success, data: { subCrewId, intentId, memberId, committedAt, heatmapContributionId } }`
- **Response 409:** member already committed OR Intent not in `INTERESTED`
- **Side effects:** `Intent.state` updated; `SubCrewMember.committedAt` set; `HeatmapContribution` row created. Venue lat/lng resolved from `Intent.venueId` when present (falls back to cityArea centroid inside contribution writer).

### POST /api/subcrews/[id]/join

R21 — "I'm in." Appends caller as `joinMode = JOINED_VIA_IM_IN`. Open to any Crew of an existing member (no approval).

- **Auth:** required
- **Rate limit:** `subcrew-join:<userId>`
- **Body:** none
- **Validation:** caller not already a member (409); caller must be Crew of at least one current member (404 — non-leak)
- **Response 201:** `{ success, data: { memberId, joinedAt } }`
- **Side effects:**
  - Writes `SubCrewMember`. Best-effort auto-attaches caller's live `INTERESTED` Intent matching topic + adjacent windowPreset (`adjacentPresets`).
  - Bulk-creates `SUBCREW_JOINED` `Notification` rows for all existing members (`skipDuplicates: true`).
  - No pusher event in this route.

### PATCH /api/subcrews/[id]/members/me

> Note: the task brief lists `GET, DELETE` for this path; the file currently exports **only `PATCH`**. GET/DELETE are not implemented.

Phase 3 coordination — caller updates their own `proposedTime` ("when works?"). Seed members consume proposals on the SubCrew detail page when deciding whether to freeze `SubCrew.startAt`.

- **Auth:** required; caller must be a member of the SubCrew
- **Rate limit:** `subcrew-member-me:<userId>`
- **Body (Zod `patchSchema`):**
  - `proposedTime: ISO datetime | null` (required key; nullable to clear)
- **Response 200:** `{ success, data: { id, proposedTime } }`
- **Response 404:** caller is not a member

---

## Topics

### GET /api/topics

R1 — the curated Topic list. Used by the Intent create form's manual-picker fallback. Lightweight (~10 rows).

- **Auth:** required
- **Rate limit:** none (read-only, small fixed result set)
- **Query:** none
- **Response 200:** `{ success, data: { topics: { id, slug, displayName }[] } }` (ordered by `displayName asc`)

---

## Recommendations

### GET /api/recommendations

V1 Phase 3 — venue recommendations for a SubCrew (Journey C). Resolves Google Places categories from `getPlacesCategoriesForTopic` (R15), runs `searchPlaces` text search, scores `rating × hotnessBoost`. Hotness is stubbed at 1.0 in Phase 3. Falls back to DB venues filtered by cityArea when Places is unavailable.

- **Auth:** required
- **Rate limit:** `recs:<userId>`
- **Query (Zod `querySchema`):**
  - `topicId: cuid` (required)
  - `cityArea?: string (1–100)` — slug resolved via `NYC_NEIGHBORHOODS`
  - `weightByCrew?: boolean` (default false)
  - `limit?: int 1..20` (default 8)
- **Response 200:** `{ success, data: { recommendations: RecommendedVenue[], categoriesUsed: string[] } }`
- **`RecommendedVenue` shape:** `{ id, name, address, city, category, latitude, longitude, imageUrl, source: 'google_places'|'db', rating, score, hotnessBoost }`
- **Side effects:** none (read-only; calls external Google Places API).

---

## Heatmap

### GET /api/heatmap

V1 Phase 4 — Journey D "See where people are." Returns aggregated cells (with R14 N≥3 anonymous floor) plus discrete venue markers for z≥15 (R22). Aggregation runs through `aggregateContributions`.

- **Auth:** required
- **Rate limit:** `heatmap-read:<userId>`
- **Query (Zod `heatmapQuerySchema`):**
  - `type: 'interest' | 'presence'` (required)
  - `tier: 'crew' | 'fof'` (required)
  - `cityArea?: string (1–100)` — validated via `isNeighborhoodSlug`
  - `topicId?: cuid`
  - `windowPreset?: WindowPreset`
  - `mutualThreshold?: int 1..10` (FoF only, defaults to 1 — R5)
  - `subCrewId?: cuid` (FoF only, activates R24 priority 1 anchor)
- **Response 200:** `{ success, data: { type, tier, cells: HeatmapCell[], venueMarkers: HeatmapVenueMarker[], generatedAt: ISO } }`
- **Side effects:** none (read-only aggregation).

---

## Cron

### GET /api/cron/expire-intents

Hygiene cron for V1 Intent retention (R12). Hard-deletes Intents whose `expiresAt < now - retentionDays` (default 90 days — preserves `rawText` for future embedder training). Reads filter `expiresAt > now` already enforce implicit live/expired semantics; this cron is strictly retention.

- **Auth:** Bearer token — `Authorization: Bearer ${CRON_SECRET}`. Returns 500 if `CRON_SECRET` env unset, 401 if header mismatch.
- **Rate limit:** none
- **Methods:** `GET` only (Vercel Cron issues GET). `POST` is **not** implemented in this file.
- **Query:**
  - `retentionDays?: int` (default 90, min 1; falls back to default if non-finite)
- **Response 200:** `{ success: true, expiredCount, deletedCount, retentionDays }`
- **Schedule:** daily 03:00 UTC via `vercel.json` (Hobby tier doesn't allow sub-daily — daily is acceptable because live/expired is implicit at read time).
- **Side effects:** `prisma.intent.deleteMany` (hard delete past retention cutoff). No notifications.

---

## Cross-cutting notes

- **Rate limiter:** all user-facing routes use `apiRateLimiter` with the per-route key listed; cron uses bearer-token auth (no rate limit).
- **Sentry:** every handler wraps its 500 path in `captureException(error)`.
- **Logging:** every handler emits a structured `apiLogger.info` on the success path with the route's tag (e.g. `[INTENT_POST]`, `[SUBCREW_COMMIT]`).
- **Existence non-leak:** SubCrew read/edit endpoints return **404** (not 403) when the caller is not in the visibility scope (R2 / R21).
- **Privacy defaults on commit:** `NOBODY` / `BLOCK` / `KNOWN` (per V1 plan + R4/R20).
- **Heatmap floor:** R14 N≥3 enforced inside `aggregateContributions`, not in the route.

## Pending API_STATUS.md integration

This file should be folded back into `docs/API_STATUS.md` once that document is updated to cover the V1 surface. At that point this file can be deprecated (or kept as a focused V1 reference).
