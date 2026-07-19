# Two-Week Build Plan — OutTheGroupchat

**Created:** 2026-06-29 · **Horizon:** 14 nightly builds, `nightly/2026-06-30` → `nightly/2026-07-13`
**Owner of execution:** the `nightly-otgc-build` scheduled agent (reads this file in Phase 0, executes one Day per run).
**Status legend:** ⬜ PENDING · 🟡 IN PROGRESS · ✅ COMPLETE (`<PR link>`, `<date>`) · ⏭️ SKIPPED (reason)

---

## 0. How the nightly agent consumes this plan (READ FIRST)

The nightly build is **plan-driven** for the next two weeks. Each night, in Phase 0, the coordinator:

1. Reads this file's **Day table** (§2) top-to-bottom.
2. Selects the **first Day whose Status is not ✅ COMPLETE** → that becomes tonight's `PLANNED_BUILD`. The `Target branch` date is a **label/guide, not a hard gate** — if a night was missed, the queue simply advances to the next unstarted Day (catch-up). If the build is running ahead, it still only takes the next unstarted Day.
3. Phase 4 generates its task list **from that Day's Tasks** (they already specify files + acceptance) instead of the generic refactor-phase heuristic.
4. Phase 5 executes them in the usual 3 waves (tests → features → shared files).
5. Phase 6 validates (build/lint/test/prisma — all must stay green).
6. Wave 3 marks **this Day ✅ COMPLETE** in §2 with the PR link + date, and appends any carry-over to the Day's "Carry-over" line.

**Guard rails (unchanged, still authoritative):**
- The **escalation guard wins.** If `main` is ≥5 nightlies behind the clean linear tip (Phase 1 check), the night stays **doc-only / no feature fan-out** regardless of this plan — do NOT execute a Day's feature tasks while the backlog is stalled. Resume plan execution the night after `main` is fast-forwarded.
- All standing **conventions** apply to every task: Zod on inputs, `getServerSession()` on protected routes, no `any`, no `console.*` (use pino), files <600 lines, Sentry `captureException` on new routes, Neon migrations additive/idempotent, no two agents touch the same file, **Wave 3 owns all shared files**, and **never reintroduce AI or revive trip-planning** code.
- **Reserved (Wave-3-only) files** now include this one: `docs/BUILD_PLAN.md`. Feature/test agents must not edit it.
- If a Day is **larger than one night**, complete what's safely green, mark it 🟡 IN PROGRESS with a "Carry-over" note, and finish it the next run *before* advancing to the next Day.
- When **all 14 Days are ✅**, revert to `POST_PIVOT_STEADY_STATE` generic task generation (the prior behavior) and flag in recommendations that the plan is exhausted and needs a refresh.

**Sizing within a Day:** each Day is one coherent epic = ~2–4 build tasks + their tests. This is intentionally leaner than the legacy 12-task night — depth on one theme beats breadth. Test tasks (Wave 1) and feature tasks (Wave 2) for the same Day ship together.

---

## 1. Why this plan (grounding)

V1's full intent-to-group loop is **already built** (intents + classifier, auto-SubCrew formation, "I'm in" join, coordination + commit, 3-axis per-event privacy picker, Interest/Presence heatmap with Crew + FoF tiers, recommendations, 3 notification types + crons). Verified live on `main` (`6bbf4dd`). So this plan does **not** rebuild V1 — it closes the **depth gaps** where a backend capability has no UI, a happy path stops one step short, or a vision-locked feature is stubbed, then layers engagement/growth/safety on top.

**The launch-blocking code gaps (verified directly 2026-06-29) drive Week 1:**
- `src/lib/hotness/score.ts` is a literal `return 1.0` stub → the OTG "currently hot" venue signal (the differentiator vs. a plain Maps search) does nothing.
- `CrewRelationshipSetting` is **read** by `lib/heatmap/aggregate.ts` but **never written** — no route/UI to set per-relationship privacy defaults (R4/R20 allow/block-lists unreachable).
- SubCrew never graduates into a Meetup (`meetupId` is read-only; no `meetup.create`).
- Onboarding is a single unmounted `InterestSelector.tsx` with stale trip-era framing → cold-start users land on empty surfaces.
- No Trust & Safety (block / remove-from-Crew / report) — critical for a social + **location** product.

**Week 2** turns the now-complete loop into something sticky: notification deep-links, search/topic discovery, growth (FoF suggestions, ping nearby), meetup depth, profile/auth depth, heatmap polish, and PWA/launch hardening.

## 1a. Parallel HUMAN ops track (NOT agent-buildable — do these alongside the plan)

These are launch-blocking but **cannot be done by the nightly agent** (Vercel/DNS/account config). They gate the *value* of several Days (e.g. hotness/Pusher), so the founder should land them in week 1:
- **Sentry DSN** + source maps in Vercel prod (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`).
- **Pusher** 6 env vars in prod (gates real-time + any heatmap push).
- **Resend** domain verification (DKIM/SPF/DMARC) — prod email currently bounces.
- **`GOOGLE_PLACES_API_KEY`** in prod (gates venue search / recommendations in unseeded metros).
- **`NEXTAUTH_SECRET`** strength audit/rotation.
- **Uptime monitor** (BetterStack/Checkly on `/api/health`) + status page + alert channel.

---

## 2. The 14-Day schedule

> Each Day below is the authoritative task spec. Sizes: **L** multi-file feature, **M** single route/component, **S** tweak. "Create/Modify" are starting points — agents may add adjacent files following conventions, but must respect file ownership within a wave.

### Day 1 — `nightly/2026-06-30` — **Hotness signal goes live** — Status: ✅ COMPLETE (https://github.com/pcettina/OutTheGroupchat/pull/134, 2026-06-29)
**Epic:** Replace the `1.0` hotness stub with a real density-derived "currently hot" boost so recommendations stop being pure Google-Places order.
**Goal:** A venue in a rising-density cell ranks above a higher-Places-rated cold venue; `weightByCrew` actually changes ranking.
**Depends on:** nothing (HeatmapContribution rows are already written on commit + check-in).
**Tasks:**
- **[L1] Implement `computeHotnessBoost`** — *modify* `src/lib/hotness/score.ts` (the file with the literal `return 1.0` stub — implement HERE; ignore the stale "compute.ts (not yet built)" note in `config.ts`). Read `HeatmapContribution` rows (both INTERESTED/PRESENCE per config) within `HOTNESS_CONFIG.rollingWindowHours`. Note: `HeatmapContribution` carries `cellLat`/`cellLng`/`cellPrecision` (no `venueId`), so **reuse the cell-quantization in `src/lib/heatmap/contribution-writer.ts`** to map a venue's lat/lng → cell key, then count density in that cell. Apply linear decay (`decayCoefficient`); optional Crew-weight (`crewWeightFactor`) when `weightByCrew`; return a multiplier in ~[1.0, 2.5]. Pure function, injectable clock for testability. *Acceptance:* given seeded contributions, returns >1.0 for hot cells, 1.0 for empty cells, monotonic in density.
- **[M1] Wire hotness into ranking** — *modify* `src/app/api/recommendations/route.ts`. Pass real contribution data + viewer Crew into `computeHotnessBoost`; activate the `weightByCrew` param; cache per `(topicId, cityArea)` for 5 min. *Acceptance:* response `hotnessBoost` is no longer constant; ordering reflects boost.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/lib/hotness-score.test.ts` (decay, window cutoff, crew-weight, empty-cell neutral) + extend recommendations route test for boost-driven reorder.
**Carry-over:** —

### Day 2 — `nightly/2026-07-01` — **Make "hot" visible + persist the chosen venue** — Status: ✅ COMPLETE (https://github.com/pcettina/OutTheGroupchat/pull/135, 2026-06-30)
**Epic:** Surface the now-real hotness in the UI and stop losing the SubCrew's chosen venue.
**Goal:** Users see "🔥 Hot now" badges + contributor counts; a frozen SubCrew remembers its venue.
**Depends on:** Day 1 (hotness signal).
**Tasks:**
- **[M1] Hot-now badges** — *modify* `src/components/subcrews/RecommendationsList.tsx` + `src/components/heatmap/HeatmapMap.tsx`. Render a rising-density badge + contributor-count chip from `hotnessBoost`/marker density. *Acceptance:* badge shows only above a threshold; hidden when neutral.
- **[M2] Surface SubCrew venue (UI only — API already persists it)** — the PATCH on `src/app/api/subcrews/[id]/route.ts` **already writes `venueId`** (verified: Zod `venueId` + `updateData.venueId` write). Do NOT re-implement the API. Build only the missing UI: *modify* `src/components/subcrews/SubCrewCoordinationPanel.tsx` to add a venue-select (from recommendations) + display the chosen venue (the panel has zero venue references today). *Acceptance:* selecting a venue calls the existing PATCH; panel reflects it on reload.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/subcrews-venue.test.ts` (venue persistence, seed-only authz) + a badge render test.
**Carry-over:** —

### Day 3 — `nightly/2026-07-02` — **SubCrew graduates into a Meetup** — Status: ✅ COMPLETE (https://github.com/pcettina/OutTheGroupchat/pull/143, 2026-07-11)
**Epic:** Close the funnel: a coordinated SubCrew (time + venue frozen) becomes a durable Meetup with attendees.
**Goal:** Freezing a SubCrew creates a linked Meetup; members appear as attendees; the panel links to it.
**Depends on:** Day 2 (venue persisted).
**Tasks:**
- **[L1] Graduate-to-Meetup** — *modify* `src/app/api/subcrews/[id]/route.ts` (or commit route): on time+venue freeze, `meetup.create` from SubCrew data, attach `SubCrewMember`s as `MeetupAttendee`s, set `SubCrew.meetupId` (idempotent — never double-create). Reuse the Lane B Meetup surface. *Acceptance:* one Meetup per SubCrew; re-freeze is a no-op; attendees match members.
- **[M1] "View Meetup" state** — *modify* `src/components/subcrews/SubCrewCoordinationPanel.tsx` to show the graduated state + deep link to `/meetups/[id]`.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/subcrew-graduation.test.ts` (creation, idempotency, attendee linkage, authz).
**Carry-over:** —

### Day 4 — `nightly/2026-07-03` — **Per-relationship privacy defaults (the load-bearing gap)** — Status: ✅ COMPLETE (https://github.com/pcettina/OutTheGroupchat/pull/144, 2026-07-13)
**Epic:** Make R4/R20 reachable: let a user set, once per Crew member, who sees their location and at what granularity/identity.
**Goal:** A user can open "Manage who sees my location," set BLOCK/DYNAMIC_CELL/HIDDEN + KNOWN/ANONYMOUS/CREW_ANCHORED per Crew member, and the aggregator honors it.
**Depends on:** nothing new (`CrewRelationshipSetting` schema + aggregate-read already exist).
**Tasks:**
- **[L1] Write route** — *create* `src/app/api/users/relationship-settings/route.ts` (GET list + PATCH upsert per `targetId`), Zod + auth + Sentry. *Acceptance:* upsert persists; GET returns viewer's settings; aggregate reads them unchanged.
- **[M1] Management UI** — *create* `src/components/privacy/RelationshipSettingsList.tsx` + mount under `src/app/settings/privacy/` (tab/section). Per-Crew-member granularity + identity toggles; N<3 anonymous tooltip (R14). *Acceptance:* renders Crew list, persists changes, reflects defaults (Crew→KNOWN).
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/relationship-settings.test.ts` (upsert, defaults, authz, Zod enum validation).
**Carry-over:** —

### Day 5 — `nightly/2026-07-04` — **Trust & Safety I: block a user** — Status: ✅ COMPLETE (https://github.com/pcettina/OutTheGroupchat/pull/145, 2026-07-16)
**Epic:** Baseline safety for a social+location product: block a user, enforced across every surface that could leak presence.
**Goal:** Blocking a user hides them from your Crew/feed/heatmap/check-in surfaces (and vice-versa).
**Depends on:** nothing (additive migration). NOTE: **remove-from-Crew already exists** — `DELETE /api/crew/[id]` severs the edge today; do NOT rebuild it. This Day adds *blocking* on top.
**Scope note:** block *enforcement* spans four independent query files — this is the bulk of the work and **may legitimately carry over per §0**; each surface ships with its own test. Mark 🟡 IN PROGRESS if not all four land green, and finish before Day 6.
**Tasks:**
- **[L1] UserBlock model + routes** — *modify* `prisma/schema.prisma` (additive `UserBlock` model + back-relations; idempotent migration) + *create* `src/app/api/users/[userId]/block/route.ts` (POST block / DELETE unblock). Auto-sever the Crew edge on block (reuse existing crew-delete logic). *Acceptance:* block/unblock persists; blocking an active Crew member also removes the edge.
- **[M1] Cross-surface block enforcement (carry-over-eligible)** — add block filtering to the **four** surfaces, each a separate change + test: (1) crew list `src/app/api/crew/route.ts`, (2) feed `src/app/api/feed/route.ts`, (3) heatmap aggregation `src/lib/heatmap/aggregate.ts`, (4) check-in feed `src/app/api/checkins/feed/route.ts`. *Acceptance:* a blocked pair sees nothing of each other on **all four** (no partial-leak — that is a safety regression).
- **[M2] Block UI** — *modify* `src/app/profile/[userId]/page.tsx` (+ crew list) to add block/unblock controls with confirm.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/user-block.test.ts` + `src/__tests__/api/block-enforcement.test.ts` (one assertion per surface). **Wave 3** adds `userBlock` mocks to `setup.ts`.
**Carry-over:** —

### Day 6 — `nightly/2026-07-05` — **Trust & Safety II: report + anti-spam** — Status: ✅ COMPLETE (https://github.com/pcettina/OutTheGroupchat/pull/146, 2026-07-17)
**Epic:** Reporting flow + abuse throttles.
**Goal:** Users can report a user/meetup; meetup creation and Crew requests are rate-limited per user.
**Depends on:** Day 5 (T&S foundation).
**Tasks:**
- **[L1] Report model + routes + UI** — *modify* `prisma/schema.prisma` (additive `Report` model) + *create* `src/app/api/reports/route.ts` (POST; admin GET list) + report buttons on profile + meetup detail. Zod + auth + Sentry. *Acceptance:* report persists with reason enum; duplicate-report idempotent.
- **[M1] Anti-spam quotas (tighten existing limiter — do NOT add a second one)** — both routes already call `checkRateLimit(apiRateLimiter, …)` via `src/lib/rate-limit.ts` (`meetup-create:<userId>`, `crew-request:<userId>`). *Modify* `src/app/api/meetups/route.ts` + `src/app/api/crew/request/route.ts` to add a **stricter creation-specific daily quota** on the existing key + a high-frequency-creator flag. *Acceptance:* over-quota returns 429; under-quota unaffected; no duplicate limiter on the same key.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/reports.test.ts` + extend meetup/crew-request tests for 429. **Wave 3** adds `report` mock to `setup.ts`.
**Carry-over:** —

### Day 7 — `nightly/2026-07-06` — **Activation: real onboarding + empty/error states** — Status: ✅ COMPLETE (https://github.com/pcettina/OutTheGroupchat/pull/147, 2026-07-19)
**Epic:** Get a brand-new user from signup to their first Intent without hitting blank surfaces.
**Goal:** First-run flow (add Crew → post first Intent) on a real route; every core surface has an empty state + visible error banner.
**Depends on:** nothing.
**Tasks:**
- **[L1] Onboarding flow** — *create* `src/app/onboarding/page.tsx` + onboarding step components (reuse/rewrite `src/components/onboarding/InterestSelector.tsx`, drop trip-era copy). Steps: pick Topics of interest → find/add Crew → "what are you up for?" first Intent. Mount post-signup redirect. *Acceptance:* a new user is routed through it once; completes to `/intents`.
- **[M1] Empty + error states** — *modify* `src/app/intents/page.tsx`, `src/app/subcrews/[id]/page.tsx`, `src/app/feed/page.tsx`: first-run empty states with CTAs ("You haven't signaled anything yet — what are you up for?") and replace silent catches with visible error banners. *Acceptance:* no blank/silent-fail surfaces remain on these pages.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/onboarding-flow.test.ts` (step gating) + empty-state render tests.
**Carry-over:** —

### Day 8 — `nightly/2026-07-07` — **Tighten the notification loop** — Status: ⬜ PENDING
**Epic:** Make the pull-back-in mechanics actually reachable and one-tap.
**Goal:** Users can star a Crew member's intents; the daily prompt deep-links straight into a pre-filled Intent; the privacy picker tells the truth about anonymity.
**Depends on:** nothing (per-member dispatch already runs server-side).
**Tasks:**
- **[M1] Per-member flag UI** — *modify* `src/app/crew/page.tsx` + `src/app/profile/[userId]/page.tsx` to add a star/bell toggle writing `NotificationPreference.perMemberTargets` via `PATCH /api/users/notification-preferences`. *Acceptance:* toggling flags the member; flagged member's Intent fires the existing dispatch.
- **[S1] Daily-prompt deep link + form prefill** — *modify* `src/lib/notifications/daily-prompt.ts` (actionUrl → `/intents/new?window=EVENING`) + `src/components/intents/IntentCreateForm.tsx` to accept query-param defaults. *Acceptance:* prompt → one tap to a pre-filled form.
- **[S2] Anonymous-floor live feedback** — *modify* `src/components/privacy/PrivacyPickerModal.tsx` to query a lightweight contributor count for the chosen cell/venue and disable Anonymous with the R14 tooltip when N<3. *Acceptance:* Anonymous disabled+explained below 3 contributors.
- **[T1] Tests (Wave 1)** — extend notification-preferences + privacy-picker tests.
**Carry-over:** —

### Day 9 — `nightly/2026-07-08` — **Search comes alive + Topic discovery** — Status: ⬜ PENDING
**Epic:** Mount the orphaned search surface and add a browse-by-Topic discovery page.
**Goal:** `/search` works against `/api/search`; users browse Topics with live "N Crew signaled" counts.
**Depends on:** nothing (search route + components already exist, unmounted).
**Tasks:**
- **[M1] Search page** — *create* `src/app/search/page.tsx` mounting `SearchResults`/`SearchFilters`/`FilterChip` wired to `GET /api/search`; add nav entry. *Acceptance:* people-first results render; filters work; empty state present.
- **[M2] Topic discovery** — *create* `src/app/topics/page.tsx` + extend `GET /api/topics` (or add a counts query) to return live signaled-Intent counts per Topic. *Acceptance:* topics list with counts; tapping a Topic deep-links to recommendations/intent.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/topics-counts.test.ts` + search page mount test.
**Carry-over:** —

### Day 10 — `nightly/2026-07-09` — **Growth: FoF Crew suggestions + ping nearby** — Status: ⬜ PENDING
**Epic:** Reuse the FoF graph for friend suggestions; let users nudge nearby checked-in Crew.
**Goal:** "People you may know" from the FoF graph; one-tap ping to nearby active Crew.
**Depends on:** FoF graph lib + check-ins exist. **Day 5 (`UserBlock`)** for the blocked-exclusion clause — if `UserBlock` is somehow absent (Day 5 slipped), degrade gracefully (skip the blocked filter, don't fail).
**Tasks:**
- **[M1] Crew suggestions** — *create* `src/app/api/crew/suggestions/route.ts` reusing `src/lib/heatmap/fof-graph.ts` (rank by mutual count; exclude existing Crew + blocked users) + a suggestions block on `src/app/crew/page.tsx`. *Acceptance:* returns ranked FoF, excludes existing Crew and (if Day 5 landed) blocked users, sends Crew request inline.
- **[M2] Ping nearby Crew** — *create* `src/app/api/checkins/ping/route.ts` (notify active checked-in Crew near the caller) + a button on `src/components/checkins/NearbyCrewList.tsx`. Rate-limit via the existing `checkRateLimit` (`src/lib/rate-limit.ts`). *Acceptance:* ping creates notifications for nearby active Crew only; rate-limited.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/crew-suggestions.test.ts` + `checkins-ping.test.ts`.
**Carry-over:** —

### Day 11 — `nightly/2026-07-10` — **Meetup depth: edit/cancel + .ics + @mentions** — Status: ⬜ PENDING
**Epic:** Round out the durable Meetup surface.
**Goal:** Hosts edit/cancel (attendees notified); attendees add to calendar; comments support @mentions.
**Depends on:** Meetup PATCH/DELETE already exist; feed comments already exist.
**Tasks:**
- **[M1] Edit/cancel UI + notify** — *create* an edit/cancel modal under `src/components/meetups/` wired to existing PATCH/DELETE; fire attendee notifications + Pusher "cancelled" broadcast. *Acceptance:* host-only; attendees notified on change/cancel.
- **[S1] .ics export** — *create* `src/app/api/meetups/[id]/ics/route.ts` + "Add to calendar" button on meetup detail. *Acceptance:* valid VCALENDAR with time/venue.
- **[S2] @mentions** — *modify* the feed/meetup comment pipeline to parse `@handle`, link it, and create a mention notification. *Acceptance:* mention creates a notification; renders as a link.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/meetup-ics.test.ts` + mention-parse + edit/cancel-notify tests.
**Carry-over:** —

### Day 12 — `nightly/2026-07-11` — **Profile + auth depth** — Status: ⬜ PENDING
**Epic:** Avatars, stronger sessions, and login abuse protection.
**Goal:** Users upload an avatar (degrades gracefully without storage env); sessions have explicit timeout; failed logins back off.
**Depends on:** nothing code-side (avatar needs a storage env to fully activate — build to degrade gracefully + flag the env need).
**Tasks:**
- **[M1] Avatar upload** — *create* `src/app/api/profile/avatar/route.ts` + storage client wrapper + profile UI; surface avatar in Crew/feed/attendee lists. *Acceptance:* upload sets `User.image`; missing storage env → graceful "configure storage" path, not a crash.
- **[S1] Session timeout config** — *modify* NextAuth options (`src/lib/auth.ts`) to set explicit `session.maxAge`/idle expiry + a test asserting it.
- **[M2] Failed-login limiting** — *modify* the credentials path to track per-identity failed attempts via the existing `checkRateLimit`/`src/lib/rate-limit.ts` and back off after a threshold. *Acceptance:* N failures → temporary lock/backoff; resets on success. **(Carry-over-eligible** — if all three feature tasks can't land green, ship M1+S1 and carry M2 per §0.)
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/avatar.test.ts` + auth session/lockout tests.
**Carry-over:** —

### Day 13 — `nightly/2026-07-12` — **Heatmap polish + GDPR deletion** — Status: ⬜ PENDING
**Epic:** Finish deferred heatmap sub-questions and ship account deletion.
**Goal:** R22 zoom threshold finalized + R24 anchor priority 2 + z<10 perf; users can permanently delete their account and all location history.
**Depends on:** heatmap built; profile built.
**Tasks:**
- **[M1] Heatmap finalize** — *modify* `src/components/heatmap/HeatmapMap.tsx` + `src/lib/heatmap/anchor-select.ts`: lock the R22 density→marker zoom threshold, add R24 priority-2 anchor tier, tune render budget at z<10. *Acceptance:* documented threshold; priority-2 anchor resolves; no jank at low zoom in profiling notes.
- **[M2] GDPR account deletion** — *create* `src/app/api/users/me/delete/route.ts` + confirm-flow UI; cascade across Crew/Meetup/CheckIn/Intent/HeatmapContribution/Notification; location-data retention disclosure. *Acceptance:* deletion removes all user rows + presence/location history; confirm-gated.
- **[T1] Tests (Wave 1)** — *create* `src/__tests__/api/account-deletion.test.ts` (cascade coverage) + anchor-priority test.
**Carry-over:** —

### Day 14 — `nightly/2026-07-13` — **PWA + share previews + safe schema hygiene** — Status: ⬜ PENDING
**Epic:** Installability, shareable dynamic pages, and a *conservative* schema audit.
**Goal:** Installable PWA with offline shell; dynamic pages have OG previews; only provably-isolated dead schema retired (build stays green); checklist reconciled.
**Depends on:** end of plan.
**Sequencing:** do M1 + S1 first. M2 is **gated and optional** — only proceed if the grep-gate passes; if any candidate is entangled, DEFER it to §3 and ship the rest green. Never let a schema change leave the build red on the final night.
**Tasks:**
- **[M1] PWA** — *create* `public/manifest.json` + install-prompt component + a basic offline shell / service-worker caching strategy. *Acceptance:* installable; offline shell renders.
- **[S1] Share previews + stale-comment sweep + checklist** — *modify* dynamic pages (`meetups/[id]`, `profile/[userId]`, `subcrews/[id]`) to emit OG/Twitter metadata; remove the stale `/api/ai` comment references in `src/types/index.ts` (so audits don't false-positive on AI revival); reconcile `docs/LAUNCH_CHECKLIST.md`. *Acceptance:* OG tags render; checklist reflects the 2-week deliveries.
- **[M2] Gated dead-schema retirement (DO NOT trust a pre-baked list)** — *modify* `prisma/schema.prisma` to remove a model **only if it passes BOTH gates**: (a) `grep -rn "prisma\.<model>" src/` excluding `_archive` returns nothing, AND (b) the model name does NOT appear as a relation-field TYPE on any kept/live model (`User`, `Venue`, `Meetup`, `CheckIn`, `Crew`, `Trip`, `Activity`, etc.). **Known-unsafe — keep:** `City` (live FK on Venue/Meetup/CheckIn), `Post` (live `User.posts` back-relation). **Entangled — DEFER to §3, do not touch here:** `Poll`, `PollResponse`, `Vote`, `SurveyResponse`, `ActivityRating`, `ItineraryDay`, `ItineraryItem` (all have back-relations on live `User`/`Trip`/`Activity`/`Survey`). Only fully-isolated leaves (e.g. `DestinationCache`, re-verified) may go, in one idempotent additive-down migration. *Acceptance:* every removal passed both gates; `prisma validate` + full `npm run build` green; if nothing passes, M2 is a documented no-op and that's fine.
- **[T1] Tests (Wave 1)** — metadata + (post-cleanup) regression sweep.
**Carry-over:** —

---

## 3. Backlog — beyond the two weeks (multi-session or ops-gated)

Pulled from research; **not scheduled** because each exceeds a single nightly or needs infra. Promote into a future plan once the 2-week arc lands:
- **Group chat on SubCrew/Meetup formation** (L, multi-session: Message/Thread models + Pusher channel + UI).
- **Web push / VAPID** (L: service worker + push-subscription schema + dispatch wiring) — pairs with the mobile app; the in-app notification rows exist today.
- **OAuth providers (Google/Apple)** (M, needs OAuth app credentials).
- **Heatmap real-time push via per-cityArea Pusher channels** (R23 v1.5 — needs Pusher prod env).
- **Embedding-based intent classifier** (R9 v1.5 — replaces keyword dictionary).
- **DB-backed Topic→Places + hotness config + admin surface** (R15/R18 v1.5).
- **Major dependency upgrades** Next 14→16, React 18→19, Prisma 5→7 (`docs/UPGRADE_PLAN.md`) — staged, full-suite-gated.
- **Legacy trip/discover/inspiration rescope-or-remove** (half-removed stack still referenced by feed/discover/cron). This is a **multi-night migration** and is the prerequisite for retiring the entangled dead schema (`Poll`, `PollResponse`, `Post`, `Vote`, `SurveyResponse`, `ActivityRating`, `ItineraryDay`, `ItineraryItem`) — each has a back-relation on a live `User`/`Trip`/`Activity`/`Survey` model, so removal requires first deleting those relation fields surface-by-surface, not a one-night drop.

---

**Last updated:** 2026-06-29 (created) · **Source:** grounded by a 6-agent research sweep over PRODUCT_VISION, V1_IMPLEMENTATION_PLAN, FUTURE_IMPLEMENTATION, PRODUCTION_ROADMAP, REFACTOR_PLAN, LAUNCH_CHECKLIST + live-surface audit; launch-blocking gaps verified directly against source.
