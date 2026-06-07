# OTG Launch Research Portfolio

**Compiled 2026-04-24.** Synthesis of a 6-stream research swarm (competitive teardown, NYC GTM, trust & safety, notifications, production-readiness audit, hot-path UX) into a single phased launch portfolio.

The lens through every recommendation below: **success metric is IRL meetups completed, not time-in-app.** Anything that asks the user to stay longer is a bug, not a feature.

---

## 1. Executive summary — 10 things that matter

1. **The product moat is not "another meetup app" — it's "bottom-up intent + threshold-triggered group formation + time-bounded state."** No competitor combines the three. Meetup is organizer-led, Partiful is host-led, Timeleft is algorithm-led; none let the user broadcast intent and have the system aggregate friends. Defend this corner.
2. **Hot-path target: 3 taps, 1 biometric, 0 keyboard inputs, app open → IRL commitment in 30 seconds.** Anything slower betrays the brand. The home screen is a single verb: *what are you up to tonight.*
3. **Day 1 cannot ship without Block, Report, age-gate, selfie liveness, safe-arrival check-in, emergency contact, panic button.** None of these exist in the codebase today. They are App Store gates, lawsuit insurance, and the price of admission for an IRL-meetup app.
4. **Sentry coverage is actually 83% (39/47 routes), better than docs claim** — but the DSN is missing in Vercel prod, so `captureException` is a no-op everywhere. Setting one env var fixes a quarter of the observability story.
5. **Two production-config bugs to fix before launch:** `tracesSampleRate: 1.0` (will burn Sentry quota on day 1; should be 0.1 in prod), and `Access-Control-Allow-Origin: *` with `Allow-Credentials: true` (non-spec, CSRF surface).
6. **NYC seeding order:** LES → East Village → Williamsburg → Greenpoint → Astoria. The first two are within walking distance and double the matchable graph. Skip UWS/UES/Park Slope (wrong demo), Bushwick (lower disposable income), LIC (doorman commuter zone, weak street-level word-of-mouth).
7. **Cold-start liquidity number:** ~250–400 active Crew-connected users per ~1.5 sq-mi neighborhood polygon to hit "≥40% of intents find ≥2 mutual-Crew matches within 90 minutes." Below this, the loop fails silently and trust dies.
8. **Notification charter is the most counter-intuitive part of the product:** 6 pushes/day hard cap, single bundled daily prompt at 5:30 PM ±30 min, group-formation as the only "wake the user" event. **Zero engagement-bait pushes — ever.** No likes, no profile views, no streaks, no "we miss you."
9. **Press play:** Feed Me (Sundberg) > Hell Gate > NYT Styles > The Cut > Curbed > Eater > Time Out. Pitch the *anti-feed* angle, not the feature list. The IRL stunt ("Group Chat Funeral" launch night, synchronized Friday 5pm "Down" wave) gives press something photographable.
10. **The North Star metric on the org dashboard is one number:** *meetups confirmed completed per week* — not DAU, not session length, not retention curves. If you ever look at "time in app" with pride, the product has already failed.

---

## 2. Strategic positioning

### What OTG is, in one sentence
OTG is a NYC-first meetup app where you broadcast a vague intent ("drinks tonight"), the system groups you with ≥2 of your Crew on the same Topic, you coordinate a venue in under a minute, and the app closes itself.

### The five gaps OTG can dominate that nobody else covers

| Gap | Who's missing it | Why OTG wins |
|---|---|---|
| **Bottom-up intent → top-down formation** | All competitors | OTG's threshold-triggered SubCrew is structurally novel |
| **Existing-trust + new-IRL hybrid** | Geneva (trust, no IRL); Timeleft (IRL, no trust) | Crew = mutual-acceptance graph + IRL coordination layer |
| **Time-bounded intent (`activeUntil`)** | Every competitor signals indefinitely | Already in schema. Self-destructing state kills the feed structurally |
| **Opt-in location reveal post-match** | Timeleft hides venue late; nobody hides *people's* location | 3-axis privacy model encodes gradual reveal as a primitive |
| **NYC-density-first launch** | Meetup is global-thin; Partiful is everywhere-but-nowhere | Win Manhattan before being challenged |

### Voice & posture (locked)
- "Corner booth at a dimly-lit LES bar at 10:47 PM."
- Direct, warm, slightly dry. Sentence case everywhere. No emoji. No exclamations. Last Call palette (sodium #FF6B4A, dark #15110E).
- Press narrative: *"I built the social media app that wants you to close it."*

---

## 3. Hot-path UX charter

The single most important UX target: **app-open to IRL-commitment in under 30 seconds, with 3 taps and 1 biometric and zero keyboard inputs.** The keyboard is summoned only if the user *overrides* a smart default — that's the rare path, not the default path.

### 30-second hot-path script (this is the spec)

| t (s) | Step | Action |
|---|---|---|
| 0.0 | App double-tap | Face ID under-the-hood; no splash |
| 1.4 | Home renders: top chip `Drinks · East Williamsburg · 8pm` | Sub-headline: *"Sam and Maya are looking too."* |
| 3.2 | User taps top chip | 1 tap |
| 3.6 | Sheet rises: time slider, neighborhood, identity-mode — all pre-filled | Glance |
| 8.5 | User adjusts time 8pm → 9pm | Slider drag |
| 11.0 | Tap **"I'm Out"**, Face ID confirms | 1 tap + biometric |
| 12.4 | Optimistic toast: *"You're Out. 2 Crew aligned — auto-grouping…"* with [Undo] | — |
| 18.7 | SubCrew-formed notif slides in: *"Sam, Maya, Patrick. Drinks, 9pm, EWB."* | — |
| 21.0 | Tap **"I'm In"** | 1 tap |
| 22.2 | 3 venue chips appear (Lucky Dog, Skinny Dennis, Hotel Delmano); tap first | 1 tap |
| 24.5 | Screen dims: *"Locked. See you at 9. Phone goes back in pocket."* | — |
| 30.0 | App auto-backgrounds | Done |

Total: **3 taps, 1 biometric, 1 slider drag, 0 keyboard, 0 modals.**

### "Off your phone" design charter (8 rules — non-negotiable)

1. **No infinite scroll, ever.** Feeds are bounded — today's intents only, then they're gone.
2. **No public counts.** No likes, no follower numbers, no streaks. Vanity = engagement = mission failure.
3. **Auto-close after commit.** App dims and recommends backgrounding within 6s of "I'm In."
4. **Session-length soft-cap.** At 4 min in-app, friendly nudge: *"Looks like you're set. Phone back in pocket?"*
5. **The app sleeps post-meet.** No "share your night" feed. Next surface is *tomorrow.*
6. **One push category, one cadence.** Crew-aligned + daily prompt only. Nothing else, ever.
7. **No notifications during active meetups.** Geofence + check-in detected → DnD until post-meet check-in.
8. **Time-on-app is displayed weekly, with shame.** *"You spent 11 min in OTG and met 4 people IRL. That's the goal."*

### 12 friction sources to eliminate

| # | Friction | Fix |
|---|---|---|
| 1 | Confirmation modals | 6s undo-toast; no "Are you sure?" ever |
| 2 | Multi-step intent forms | Single sheet, all defaults pre-filled |
| 3 | First-open permission prompts | Defer location/notif/contacts until moment of need |
| 4 | Long onboarding | 3 screens max: name+photo, neighborhood, 3 Topic taps |
| 5 | Loading spinners | Skeleton + optimistic UI; never block thumb |
| 6 | "No Crew yet" empty state | Active CTA: *"Invite 2 friends — Crew of 2 unlocks the loop"* |
| 7 | Mode toggles (list/map/dark/light) | System default only; no in-app toggle in v1 |
| 8 | Profile completion gates | Progressive: signal first, profile fills as you use it |
| 9 | Username/email login | Phone + biometric only. No passwords. |
| 10 | Notification settings overload | One toggle: *"Crew aligned"* on/off |
| 11 | Search-first homepage | Action-first homepage; search is a tab, not the front door |
| 12 | Decision fatigue at venue pick | Venue is post-commit, 3 ranked options, tap-to-lock |

---

## 4. Feature priority matrix (must / should / cut for v1)

### MUST-HAVE for v1 launch — 13 features
Without any of these, the product is incomplete or unsafe.

- Intent signal ("Tonight at X")
- Topic browse (curated, ≤8 — paradox-of-choice prevention)
- SubCrew auto-form (≥2 on Topic)
- Crew (accept/decline, list)
- Group-form push notification
- Identity-mode picker (Public / Crew / Private)
- Location obfuscation (neighborhood, not pin)
- Phone verification + Twilio VOIP block
- **Selfie liveness verification (Persona or Stripe Identity Liveness)**
- **Block + Report + Age-gate (currently missing)**
- **Safe-arrival check-in + emergency contact + panic button (currently missing)**
- Post-meet check-in ("Made it?" Y/N) — closes the loop, powers Crew vouching
- Profile (minimal: photo, name, 3 topics)
- Venue picker (3 ranked options post-commit)
- In-Crew chat (per-SubCrew, ephemeral 24hr — logistics only)

### SHOULD-HAVE for v1.5 — 7 features
Improves retention but not blocking.

- Daily prompt push (1/day, dinner-time)
- Crew labels (close / casual / work)
- Mutual-Crew vouching
- Recurring intents ("every Thursday")
- Calendar export
- Per-member trigger ("ping when Sam's Out")
- Google Places integration (pre-curated NYC venue list is sufficient for v1)

### CUT or defer to v2 — 10 features
Distracting or off-mission.

- Interest heatmap (zoom-aware) — map-as-feature creep
- Presence heatmap — privacy minefield, not needed for the loop
- Friends-of-Friends heatmap — graph-density problem at launch
- Photo verification (selfie-match) beyond liveness — high effort, modest lift; v2
- Public events feed — becomes Eventbrite-lite
- Search/discover (people-first) — re-introduces scroll
- Follow-only mode — OTG isn't a follow-graph product
- Apple Wallet push — cute, irrelevant to loop
- Dark/light toggle — system default only
- Settings page (deep) — one screen, 5 toggles max

**Note on heatmaps:** the V1_IMPLEMENTATION_PLAN includes Interest + Presence + FoF heatmaps as Phase 4. The competitive + UX research argues against them at launch — they re-introduce a browsable map surface that invites scrolling. Recommend deferring all heatmap layers to v1.5 and using the saved engineering time on Block / Report / safe-arrival flows. **This is the biggest scope-cut decision to make.**

---

## 5. Trust & safety stack — required ship list

This is non-negotiable for an IRL meetup app where strangers may meet. Items 2, 4, 5, 6 below are launch-blockers; if they're missing, do not launch.

| # | Item | Effort | Status today |
|---|---|---|---|
| 1 | Phone verification + Twilio Lookup VOIP block | S | ✅ Phone exists; VOIP block to verify |
| 2 | **Selfie liveness via Persona / Stripe Identity Liveness** | M | ❌ Not built |
| 3 | Crew-graph trust tiers (NEW / ESTABLISHED / TRUSTED, computed nightly) | S | ❌ Not built |
| 4 | **Safe-arrival check-in cron (push 30 min post-start, escalate at 60 min)** | S | ❌ Not built |
| 5 | **Emergency contact + one-tap live-location share + panic button** | M | ❌ Not built |
| 6 | **Total-erasure Block (bidirectional, cascades through 2-hop graph)** | L | ❌ `CrewStatus.BLOCKED` enum exists, no API/UI |
| 7 | Women-attested women-only meetup mode (selfie-attested, not ID-gated) | M | ❌ Not built |
| 8 | Late-night meetup gating (≥ ESTABLISHED tier OR public-venue-only) | S | ❌ Not built |
| 9 | In-app report flow (4 categories) + 3-distinct-reporter shadow-suspend rule | M | ❌ No `Report` table exists |
| 10 | Staffed human mod queue from day 1 (one FT + on-call) with appeal path | — | ❌ Not staffed |

**Why these are existential:** Tinder/Match Group has been sued repeatedly (2019 ProPublica investigation: known sex offenders on platform). Meetup.com's history includes well-documented stalking incidents from public RSVP lists. The "Tea" app (women-only review of men) is currently in defamation litigation (2024). The pattern is clear — the first stalker headline kills the product. Items 4, 5, 6 are the trio that prevents the headline.

**What can defer to v1.5:** government ID verification (gate behind incident trigger, not default), voice verification, ML-based pattern flagging, trust scores visible to users, in-app E2E messaging encryption.

---

## 6. Notification + habit-loop charter

### Three notification types, hard caps

| Type | Timing | Bundling | Cap |
|---|---|---|---|
| **(a) Daily prompt** | Per-user learned window, default 5:30–7:00 PM ±30 min. Suppress if user already signaled today. | N/A — already the bundle | 1/day |
| **(b) Per-member trigger** | Real-time when a Crew member signals on a Topic the user signaled within 30 days. Quiet hours 10pm–8am roll into morning. | Silent-bundle if ≥2 in 20 min → single push. Break out only when SubCrew is one-away from forming. | 3/day |
| **(c) Group formation** | Real-time, no delay. The only "wake the user" push. | Never bundle. | 2/day (rare) |

**Daily total cap: 6 pushes/day.** Above this, silent in-app only.

### Copy templates (OTG voice — sentence case, no emoji, no exclamations)

**(a) Daily prompt:**
- *"what are you up to tonight. takes about ten seconds to put it down."*
- *"evening's open. tell us where you're headed and we'll see who else is."*
- *"no plans yet. signal something — coffee, a walk, a show — see who lines up."*

**(b) Per-member trigger:**
- *"maya put down 'lower east side bar' for 9pm. you've gone for that before."*
- *"two from your crew are eyeing brooklyn coffee saturday morning."*
- *"leo signaled a film at metrograph tonight. seat next to his is open."*

**(c) Group formation:**
- *"you and two others lined up: ramen in the east village, 8pm. tap to see."*
- *"subcrew formed for the comedy show thursday. four of you, seats together."*
- *"alignment hit. coffee saturday 10am, three crew in. open the thread."*

### Habit loop

**Primary trigger: post-work 5:00–7:00 PM.** Fogg behavior model: motivation high (transition out of work), ability high (phone in hand on commute), prompt arrives at the exact moment users decide what to do tonight. Secondary trigger: Sunday 6:00–8:00 PM for week-ahead planning. Reject lunch (12–1pm) — too short a runway.

**Reward design:**
- No alignment → silence (correct behavior; false-positive pushes erode trust)
- 1 Crew aligned, no group yet → low-key in-app card on next open, no push
- SubCrew formed → the only push reward; locks attention into IRL exit velocity

### 7 anti-pattern rules — never ship

1. No like / react / comment-count pushes
2. No "X viewed your profile"
3. No follower-count milestones
4. No streaks or daily-login rewards
5. No "you might know" or "people you may like" pushes
6. No "we miss you" re-engagement after 3+ days dormant
7. No notifications about content (someone posted a photo from the meetup, etc.)

---

## 7. NYC GTM playbook

### Top 5 neighborhoods to seed

| Rank | Neighborhood | Why first |
|------|---|---|
| 1 | **Lower East Side** | Highest density of walkable bars; post-work spillover from FiDi/Midtown; brand voice ("corner booth at 10:47 PM") literally describes LES |
| 2 | **East Village** | 68k residents, walking distance to LES = doubles matchable graph; eclectic nightlife |
| 3 | **Williamsburg** | Youngest median age in city (32.3); $4,418 avg rent filters for disposable income |
| 4 | **Greenpoint** | Williamsburg overflow at lower price; run-club epicenter (NBR); tightly-knit blocks |
| 5 | **Astoria** | 43% adults 25-44; Greek nightlife strip on Ditmars/30th Ave acts as built-in venue grid |

### Anchor venues per neighborhood (5 each)

- **LES:** Clandestino, Bar Goto, Pianos, Forgtmenot, Beverly's
- **East Village:** Phebe's, Amor y Amargo, Death & Co, Ruffian, Rue B
- **Williamsburg:** Hotel Delmano, The Springs, Maison Premiere, Brooklyn Boulders Williamsburg, Devoción
- **Greenpoint:** Achilles Heel, t.b.d., Lobster Joint, Greenpoint Run Club (Sunday meet), Variety Coffee
- **Astoria:** Bohemian Hall & Beer Garden, The Ditty, Astoria Coffee, Chip NYC, Astoria Park run loop

### Cold-start sequence (concrete numbers)

| Week | Focus | Cumulative users |
|---|---|---|
| W-2 | Founder hand-curated seed (LES + East Village) | 50 |
| W-1 | Run-club / climbing-gym / trivia ambassador recruit | 200 |
| W1 | "Group Chat Funeral" launch night; 3-invite cap activated | 600 |
| W2 | Friday 5pm "Down" wave (synchronized intent post) | 1,200 |
| W3 | Williamsburg/Greenpoint via 11211/11222 zip unlock | 2,000 |
| W4 | Astoria + East Village deepening; first liquid Thursday in LES | 3,000 |
| W5 | Cross-neighborhood Crew (LES↔Williamsburg) emerges | 4,000 |
| W6 | Open waitlist (NYC-only); first 1k-attendee meetup weekend | 5,000+ |

**Supply-side incentive:** "Crew Captain" badge for first 200 ambassadors — permanent profile flag, early access, 4 free venue-partner perks/month. **No cash.** Status > money for this demo.

### Press targets ranked by fit

| Rank | Outlet | Angle |
|---|---|---|
| 1 | **Feed Me (Emily Sundberg)** | Daily NYC business+culture, 150k+ readers, throws her own community parties — exact reader |
| 2 | **Hell Gate** | Worker-owned NYC alt-weekly with civic-NYC voice; "off-your-phone, into-the-city" love letter |
| 3 | **NYT Styles** | Trend piece on "the post-app generation"; needs IRL evidence to bite |
| 4 | **The Cut / NYMag** | Best fit for gendered post-dating-app fatigue narrative |
| 5 | **Curbed** | Neighborhood-specific angle ("how OTG is reshaping LES Thursday nights") |
| 6 | **Eater NY** | Anchor-venue partnerships angle |
| 7 | **Time Out NY** | Reach but lower prestige; week-3 amplification |
| 8 | **The Information** | Save for Series A — not the audience |

### Verified NYC creators to reach (8–12, curated not sprayed)

Verified through search:
- @jeremyjacobowitz / Brunchboys (~600k IG, NYC food insider)
- @thirdplacebarnyc (NYC sober nightlife — "third place" thesis aligns 1:1)
- @creatorsnyc (Saturday creator meetups — supply-side recruit pool)
- Emily Sundberg / @emilysundberg (Feed Me — kingmaker)
- @karienyc, @sincerelymaureen
- NBR (North Brooklyn Runners) + Lunge Run Club captains
- Dyckman Run Club leadership

@likeanormalperson and @noplansjustvibes referenced in prior notes — **founder to confirm handles directly before outreach** (not verified in 2026 search).

### IRL stunt ideas
- **"Group Chat Funeral"** — launch event in LES backroom, RSVP via Partiful (deliberate jiu-jitsu), ~120 people, every attendee onboards as Crew Captain
- **Friday 5pm "Down" wave** — week 1 synchronized intent post → photographable cluster of meetups → press visual
- **Anchor-venue takeover nights** — 1 venue per neighborhood per week with reserved "OTG corner"
- **Run-club crossover** — Sat-morning NBR + Lunge joint run, post-run coffee at Variety. Position OTG as the *post-run* coordination layer.

### Hashtag / copy hooks

`#OutTheGroupchat` · `#DownTonight` · *"Stop screenshotting plans. Make them."* · *"The 8 unread group chats walked so this could run."* · *"Crew on. Phone off."* · *"10:47 PM. Corner booth. You in?"*

---

## 8. Production launch sequence — 12 ordered steps

This is the minimum sequence to soft-launch state. **Bold items are immovable gates;** everything else can interleave.

1. **Confirm prod domain + Neon PITR ≥7d + DEMO_MODE=false** — half-day of dashboard work
2. **Set Sentry DSN; fix `tracesSampleRate` from 1.0 → 0.1 in `sentry.{server,edge}.config.ts` and `instrumentation.ts`** — unblocks observability and prevents quota burn
3. **Set Pusher 6 env vars (APP_ID, KEY, SECRET, CLUSTER + 2 NEXT_PUBLIC_*)** — unblocks real-time before SubCrew formation lands
4. **Verify Resend domain + flip EMAIL_FROM off `onboarding@resend.dev`** — DNS propagation can take hours, start early
5. **Restrict CORS in `vercel.json` (currently `*` with `Allow-Credentials: true` — broken); finish rate-limiting on remaining 18 routes** (notifications/*, feed/*, search, profile, users/me)
6. **Add account-deletion endpoint (DELETE /api/users/me); add sitemap.ts, robots.ts, OG image, Twitter card** — quick S-tier sweep
7. **Phase 1 frontend: `/intents/new`, IntentChip, IntentList, feed integration** — currently in progress (user driving)
8. **Phase 2: SubCrew auto-form logic + APIs + group-formation Pusher push + persisted Notification row**
9. **Build Block flow + Report flow + age-gate at signup (+DOB column migration)** — App Store gates and women's-safety blockers
10. **Phase 3: coordinate surface + 3-axis privacy picker + recommendations API; confirm raw-coords guard (responses never include another user's `latitude`/`longitude`)**
11. **Selfie liveness via Persona; safe-arrival cron; emergency contact + panic button; total-erasure block; women-only mode; late-night gating**
12. **Audit Privacy/Terms for V1 scope (Intent venueId, CheckIn lat/lng, 3-axis privacy, retention, deletion); add `/safety` contact page; run Playwright E2E + smoke matrix from PRODUCTION_INFRASTRUCTURE_PLAN.md §10; open beta**

**Note on Phase 4 (heatmaps):** recommend deferring all three heatmap layers (Interest, Presence, FoF) to v1.5. They re-introduce a browsable map surface and burn engineering time better spent on Block/Report/safe-arrival. This is a scope-cut decision; the V1_IMPLEMENTATION_PLAN should be updated if accepted.

---

## 9. Top 5 risks + mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **First stalker / harassment incident before safety stack ships** | High at scale | Existential | Block + Report + safe-arrival + emergency contact + panic button must ship before any open-signup wave. Item 9 + 11 in launch sequence. |
| 2 | **Cold-start fails — no Crew density, no SubCrew formations** | Medium | High | Founder-curated seed of 50 with pre-loaded mutual Crew; ambassador layer (200) before public; 3-invite cap forces friend-graph clusters not random spillover |
| 3 | **App becomes a feed (engagement creep)** | Medium | High (mission failure) | "Off your phone" charter (8 rules) is a product-review checklist; any PR that adds counts, infinite scroll, streaks, or re-engagement pushes is rejected on principle |
| 4 | **Sentry quota burned on day 1** | High if not fixed | Medium | `tracesSampleRate: 1.0` → `0.1` before DSN goes live; gate by `NODE_ENV === 'production'` |
| 5 | **Privacy / location-leak incident** | Medium | High | Server-side raw-coords audit (item 10); N≥3 anonymous floor enforced server-side, never client-only (item 11); 3-axis default = NOBODY for new Crew relationships |

---

## 10. Open questions for founder review

These need a decision before the corresponding launch-sequence step lands:

1. **Heatmap scope cut** — defer Interest/Presence/FoF layers to v1.5 (recommended)? Updates V1_IMPLEMENTATION_PLAN Phase 4.
2. **Selfie liveness vendor** — Persona vs Stripe Identity Liveness vs Veriff. Cost ~$0.50–1.50/verification; pick on integration speed.
3. **Mod team staffing** — one full-time + on-call for v1; do we have budget? Outsourced trust at launch is high-risk.
4. **Age-gate strictness** — DOB-only (self-attest) for v1, gov-ID escalation for incident-triggered cases? Or DOB + ID-on-flag from day 1?
5. **Press embargo strategy** — Feed Me drops morning-of-launch (W1) — do we want a 24h Hell Gate exclusive before that, or simultaneous?
6. **Crew Captain perk pool** — venue partnerships need to be locked W-2 to deliver "4 free perks/month" — who's running venue outreach?
7. **Daily-prompt timing** — fixed 5:30 PM window vs randomized ±30 min vs per-user-learned. Recommend per-user-learned with default seed; needs telemetry foundation.
8. **Block cascading** — confirm Block hides through 2-hop Crew-of-Crew graph (recommended) vs 1-hop direct only (smaller blast radius, larger stalking surface).

---

## Appendix — sources & agent reports

This portfolio synthesizes 6 parallel research streams. Full agent outputs are not committed to docs/ to keep the portfolio tight. Key sources:

- **Competitive teardown** — Sherwood News (Partiful), TechCrunch (IRL/Bumble/Yubo/Hinge/Cocoon/Friended/Geneva), Wikipedia (Lex), bereal.com help, calmtech.com, Discord support, NoGood (Partiful marketing), one-sec.app, opal.so
- **NYC GTM** — Pinpointe, StreetEasy, Point2Homes (Astoria demographics), Andrew Chen (Tinder cold start), GrowthGirls (BeReal ambassadors), AInvest (Partiful 500k MAU), a16z (Lyft two-sided), Dear Media (Feed Me profile), Hell Gate, NBC News (NYC run clubs as dating markets), Queens Chronicle (Astoria Greek nightlife)
- **Trust & safety** — ProPublica 2019 investigation (Match Group / sex offenders), Bumble safety stack docs, Persona/Stripe Identity pricing pages, Tea app defamation litigation (2024), Discord T&S patterns, Reddit AutoModerator
- **Notifications** — BeReal user metrics 2022→2024, Mark (UC Irvine, attention fragmentation), Cal Newport, Fogg behavior model, Eyal *Hooked*
- **Production audit** — direct codebase scan (47 routes, 39/47 with Sentry, middleware, vercel.json, sentry configs)
- **Hot-path UX** — Robinhood / Cash App / Apple Pay design pattern teardowns; Light Phone interaction studies; calendar/transit-app calm-tech research

---

*Last updated: 2026-04-24. Maintained by: research swarm. Next review: post-soft-launch retro.*
