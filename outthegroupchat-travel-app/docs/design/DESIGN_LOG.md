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

### 2026-04-22 — design-research — foundation

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
