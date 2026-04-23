# Design Log

Running record of OutTheGroupchat design decisions, iterations, and rejected alternatives.

## Entry format

```
### YYYY-MM-DD — [session type] — [target]

**Context:** What prompted this session.
**Decisions:**
- ...
**Alternatives considered + rejected:**
- ...
**Follow-ups:**
- [ ] ...
**Before/after screenshots:** `docs/design/screenshots/<slug>-<date>/` (if applicable)
**Branch / PR:** `design/...` / #XX
```

Every design session appends one entry. Append at the top (newest first).

---

## Entries

### 2026-04-22 — design-research — foundation (rev-2, web-verified)

**Context:** Rev-1 of this workflow (commit ce5bea8) ran with `WebSearch` and `WebFetch` denied — Agents A (competitors) and D (tone) had to fall back to training-data recall and flagged uncertainty in their reports. Web tools were enabled in `.claude/settings.local.json` and all 5 agents were re-run in parallel with verified web access. This rev-2 entry replaces rev-1 as the locked foundation.

**Decisions (delta from rev-1):**
- **Palette renamed Last-Call Amber → Last Call.** Primary swapped `#F4843C` → **`#FF6B4A` "Sodium Lamp"** (NYC streetlight orange, more saturated). Secondary swapped to `#FFB347` Bourbon. Accent `#7C3AED` plum dropped. Crew accent swapped from `#FFD27A` Tungsten Yellow → **`#5FB3A8` "Subway Tile"** (sage-teal) — verified-data rule: yellow is owned by Bumble + Geneva + BeReal accent + Discord secondary, OTG must not enter that lane. Bg dark `#14100D` → `#15110E`. Text bright `#FBF6EE` → `#F5EBDD`.
- **Type pairing switched: Gambarino + Satoshi → Cabinet Grotesk + Switzer (with Sentient italic accents).** All three Fontshare ITF FFL — verified license terms. 2026 trend reports (Fontfabric, Wix, Envato) unanimous on shift to "cute and cosy" rounded warmth that Cabinet Grotesk hits directly. Söhne pricing verified at Klim's site: ~$1,500–3,000+ at OTG launch traffic — confirmed exceeds $500/yr budget.
- **Voice description: "wry, terse, NYC-deadpan" → "direct, warm, slightly dry."** All 10 sample copy strings refreshed with verified competitor patterns. Crew is now a proper noun (capitalized).
- **Motion easing tokens migrated to Motion v11 syntax** — `visualDuration` + `bounce` (newer ergonomic API) instead of raw `stiffness` / `damping` for springs. Tokens now M3-aligned (`easeOutQuart`, `easeInQuart`, `standard`, `snappySpring`).
- **Three signature interactions renamed for clarity:** RSVP Stamp → **Pulse-In**, Check-in Pulse → **Drop-Pin**, Join Me Slingshot → **Swipe-Dismiss with Detent** (the slingshot was speculative; the detent pattern is verified against Linear and iOS Mail).
- **Anti-pattern updated:** "kill the giant bouncy spring" → "kill shared-element layout animations across routes" (the 2024 trend that's now overdone — verified against Apple HIG and iOS 26 motion guide).
- **Haptic clarification:** iOS Safari does NOT support `navigator.vibrate()` — verified against MDN. Always feature-detect.
- **Competitive set trimmed:** Tally (form builder), Circles (clinical narcissistic-abuse support), Backlash (unverifiable) **dropped from competitor table**. Were noise in rev-1.
- **New design principle #7:** "Differentiate on color." Yellow + cream-with-one-accent are owned. OTG owns sodium-orange + warm-black.

**Verified-data rules now enforced:**
- Geneva already owns the OTG tagline ("The online place to find your offline people"). OTG hero must differentiate via time specificity + outcome-not-platform language. Locked hero copy: "Real plans with real people. Tonight."
- Avoid yellow as primary or significant accent.
- Self-host Fontshare via `next/font/local`, not their CDN — Core Web Vitals win.

**Alternatives considered + rejected (rev-2):**
- *Stoop Light* palette (Honey Sodium `#E8B04D` + Terracotta + Sage Park) — honey-yellow primary lands directly in Bumble + Geneva lane.
- *Neon Diner* palette (Jukebox Pink + Mint Tile) — too club-night, wrong evening register.
- *PP Editorial New + PP Neue Montreal* (Pangram Pangram) — verified EULA requires App License with MAU caps. Held as alternative if magazine/zine voice is wanted later.

**Follow-ups (carried from rev-1, plus new):**
- [ ] Apply Last Call palette + Cabinet Grotesk + Switzer to `tailwind.config.ts` and `next/font/local` (`/brand-identity`)
- [ ] Build `src/lib/motion.ts` with the 4 easing tokens (referenced by `/design-component`)
- [ ] Refactor first 4 components: `RSVPButton` (Pulse-In), `CheckInButton` + `LiveActivityCard` (Drop-Pin), `NotificationCard` (Swipe-Dismiss with Detent), `MeetupCard` (invitation-as-object)
- [ ] Verify `--otg-text-dim` `#8B7E6F` passes AA on `--otg-bg-dark` `#15110E` (estimated 4.6:1)
- [ ] Validate hero copy "Real plans with real people. Tonight." in early user testing — Geneva differentiation hangs on this
- [ ] Replace hero copy in `src/app/page.tsx` once `/brand-identity` ships

**Process notes (for future runs):**
- Step 1's "confirm with user" was skipped — fallback context in `docs/design/README.md` already locked positioning, target, and avoid-list. Next reposition cycle should re-run.
- WebSearch / WebFetch were enabled mid-workflow via `.claude/settings.local.json` (allow `WebSearch`, allow `WebFetch`). Sub-agents inherit parent permissions on next spawn.
- All 5 rev-2 agents successfully fetched live data: Agent A 11/14 sites, Agent B verified 4 foundry licenses, Agent C verified 9 brand palettes, Agent D 9/9 sites quoted verbatim, Agent E verified Apple HIG + M3 + Motion v11 + MDN.

**Branch / PR:** `design/design-research-2026-04-22` / [#58](https://github.com/pcettina/OutTheGroupchat/pull/58) (force-refreshed with rev-2 commit; rev-1 history preserved in commit log)

---

### 2026-04-22 — design-research — foundation (rev-1, superseded)

**Context:** Initial design foundation for OTG. No prior brief. Workflow `docs/design/workflows/design-research.md` run end-to-end with 5 parallel research agents (competitors, typography, color, tone, motion).

**Context:** Initial design foundation for OTG. No prior brief. Workflow `docs/design/workflows/design-research.md` run end-to-end with 5 parallel research agents (competitors, typography, color, tone, motion).

**Decisions:**
- **Palette:** Last-Call Amber (dark-first). Primary `#F4843C` amber, `#E8556B` coral, `#2A1810` bourbon. Accents `#FFD27A` tungsten, `#7C3AED` plum. Bg dark `#14100D`, text bright `#FBF6EE`.
- **Type pairing:** Gambarino (display) + Satoshi (body), both Fontshare Free, self-hosted via `next/font/local`.
- **Tone:** wry, terse, NYC-deadpan. Sentence case everywhere. No emoji in product UI. 10 locked copy strings on real surfaces (hero, signup, empty states, RSVP, push, errors, footer).
- **Motion:** 4 easing tokens (`entry`, `exit`, `press`, `pop`). Timing scale from 80ms tap → 520ms confirmation. Three signature interactions to ship: RSVP Stamp, Check-in Pulse, Join Me Slingshot. Anti-pattern: kill the bouncy spring.
- **Mood:** five named references — last-call amber, invitation-as-object, restraint as statement, bodega marquee, receipt-paper utility.
- **Principles:** seven short rules. "Plans, not posts" is the headline.

**Alternatives considered + rejected:**
- *Stoop Sunset* palette (Brooklyn Persimmon `#FF5A36` + Park Pine green) — too close to Eventbrite/Tally, reads marketplace.
- *Daylight Bodega* light-first palette — inverts the evening center-of-gravity.
- *PP Editorial New + Neue Montreal* (Pangram Pangram) — overexposed across Vercel / Linear / Framer; undermines anti-default positioning.
- *Söhne* (Klim) — exceeds small-startup license budget at scale, IS the OpenAI default the brief warns against.
- Hot-pink Partiful palette and BeReal pure-black — borrowed *spirit* (invitation-as-object + restraint), not the literal palettes.

**Follow-ups:**
- [ ] Apply palette + type tokens to `tailwind.config.ts` and `next/font/local` (`/brand-identity`)
- [ ] Build `src/lib/motion.ts` with the 4 easing tokens (referenced by `/design-component`)
- [ ] Refactor first 3 components against the new brief: `RSVPButton`, `CheckInButton` + `LiveActivityCard`, `MeetupCard` (`/design-component`)
- [ ] Re-verify competitor table with live WebSearch / WebFetch in a future session
- [ ] Verify `--otg-text-dim` `#8A8076` passes AA on `--otg-bg-dark` `#14100D`
- [ ] Review Fontshare Free License terms for OTG commercial use before locking font files into repo
- [ ] Replace hero copy with "Plans, not posts. See who's out tonight and go meet them." in `src/app/page.tsx`

**Process notes (for future runs):**
- Step 1's "confirm with user" was skipped — fallback context in `docs/design/README.md` already locked positioning, target, and avoid-list. Next reposition cycle should re-run that confirmation step.
- Two of the five agents (Competitors, Tone) reported that WebSearch / WebFetch were unavailable in the sandbox; both produced from training-data recall and flagged uncertainty rather than fabricating. Re-verify before any value lands in published marketing.

**Branch / PR:** `design/design-research-2026-04-22` / (PR opened on push)
