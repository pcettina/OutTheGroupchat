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

### 2026-04-23 — brand-identity — logo (mark locked, MVP ship)

**Context:** Second `/brand-identity` artifact pass. Palette shipped separately on PR #61; this pass locks the visual mark. Scope deliberately narrowed to mark + derived icons/favicon — horizontal wordmark SVG, stacked SVG, light-mode variant, OG image, and email headers deferred to a later pass once Fontshare fonts (Cabinet Grotesk + Switzer + Sentient italic per brief §4) are loaded into the app via `next/font/local`.

**Decisions:**
- **Locked concept: Hybrid Exit.** Portrait phone silhouette (rounded rectangle, hand-inked stamp texture from the Receipt concept) containing a vertical bracket with asymmetric arms: short TOP arm stays inside the phone; long BOTTOM arm extends past the right edge through a visible gap in the phone outline, with a rounded cap on the leading edge. Curved "out the groupchat · out the groupchat" micro-text runs along the inside perimeter. The mark is a direct geometric translation of the positioning thesis: "the screen exists to put you in a room" (phone = screen, bracket = you, gap + rounded cap = the exit).
- **Dual-fidelity strategy adopted.**
  - Inked Exit (PIL-rendered PNG, round-2 concepts folder) — for hero/OG/email/marketing surfaces where the hand-drawn texture carries personality.
  - Clean Exit (`brand/logo/logo-mark.svg`, hand-authored SVG) — for UI chrome / favicon / small app icon, where the ink-bleed texture muds together at sub-60px sizes. Same geometry, crisp vector.
  - Rationale: most well-built brands (Stripe, Linear, Cash App) maintain simplified icon variants for small scales. Treating small-scale rendering as a designed-for constraint rather than a degraded fallback.
- **Concept rounds.** Round 1 generated 5 genuinely distinct directions (Marquee Letter, Pin-Drop, Clink, Bracket, Receipt). User selected Receipt + Clink + Bracket as go-tos. Round 2 produced refinements of each + three hybrids (Tab = Receipt×Clink, Stub = Bracket×Receipt, Breakout = Clink×Bracket). User proposed a further hybrid combining Receipt's texture + Bracket's breakout geometry + a phone-silhouette form factor; this became Hybrid Exit and locked after one polish pass (arm flip + rounded leading cap).
- **Font substitutions (render-time only).** Concept renders used local Fontshare-similar fonts from the canvas-design skill: Bricolage Grotesque (→ Cabinet Grotesk), Instrument Sans (→ Switzer), Instrument Serif Italic (→ Sentient italic). Production assets will re-render once the real Fontshare fonts are loaded per brief §4.

**Alternatives considered + rejected:**
- Long TOP arm exiting upward/right (round 2 first render) — user preferred bottom-arm orientation for anchored-above / escaping-below energy. Shipped version has long bottom arm.
- Squared leading edge on the exit arm — replaced with rounded cap for motion/energy signal; also sets up the logged marketing-animation work (future rounded cap → avatar morphs).
- Single-fidelity inked mark everywhere — rejected. At 32px the ink texture is indistinguishable from a rendering artifact. Dual-fidelity is more honest.
- Full horizontal wordmark SVG ship this pass — deferred. Requires Fontshare fonts loaded in the app, which is its own non-trivial PR (italic Sentient via `next/font/local`). Blocking the mark on fonts would slow down downstream design-component work that needs the icon wired in.
- Auto-derived OG image + email headers — deferred. These are composition-level design (logo + tagline + visual hook), not mechanical asset derivation. Better handled when marketing copy and hero page are being designed together.

**Verification:**
- `npx tsc --noEmit` — 0 errors
- `npm run lint` — ✔ 0 warnings / errors
- `npm run build` — ✅ clean, new icon.png / apple-icon.png / favicon.ico auto-detected by Next.js app-router convention

**Follow-ups:**
- [ ] **Load Fontshare fonts** via `next/font/local` per brief §4. Blocks horizontal wordmark SVG, on-brief marketing typography, and proper email templates.
- [ ] Horizontal wordmark SVG (mark + "OutTheGroupchat" italic serif, right-aligned). After fonts load.
- [ ] Stacked SVG (mark above wordmark, centered).
- [ ] Light-mode SVG variant (swap bg + text colors; maybe invert sodium → brick for paper surfaces).
- [ ] Favicon-optimized SVG for 16/32px (chunkier strokes, simplified gap — current favicon.ico renders from the hero-sized SVG and is marginal at 32px).
- [ ] OG image 1200×630 — logo + "Real plans with real people. Tonight." hero + visual hook (inked Exit, per dual-fidelity).
- [ ] Email header variants 600×160 × 3 (invite / RSVP / reminder) — once Resend templates are rewired post-Phase 8.
- [ ] **Marketing animation — "Leading-arm avatars"** — see `brand/FUTURE_WORK.md`. Rounded cap on the long bottom arm morphs into running/biking/bar/golf/etc avatar silhouettes. Encodes "off your phone" as motion. Blocked until brand-identity PR ships + Phase 4 avatar illustration style locks.
- [ ] Audit `src/components/` for hardcoded emerald / amber / pink utilities still referencing the pre-pivot palette — 1721 occurrences across 117 files (catalogued in palette PR #61). Largest single follow-up; belongs in `/design-component` passes.

**Artifacts shipped:**
- `brand/logo/logo-mark.svg` — locked clean vector mark
- `brand/logo/logo-mark-{1024,512,256,180,120,60,32,16}.png` — rendered previews at standard sizes
- `brand/logo/concepts/` — round 1 concept exploration (5 directions × wordmark + mark + contact sheets + grand grid)
- `brand/logo/concepts/round-2/` — round 2 (3 refinements + 4 hybrids × wordmark + mark + contact sheet)
- `brand/logo/concepts/design-philosophy.md` — "Last Call" manifesto governing the round-1 explorations
- `brand/logo/render-clean-previews.mjs` — Playwright-based SVG→PNG renderer (uses project's installed Chromium)
- `brand/logo/compile-favicon.py` — ICO compiler + app-router icon copier
- `brand/FUTURE_WORK.md` — marketing animation concept logged
- `src/app/icon.png` — 32×32 app-router default icon (auto-served at `/icon`)
- `src/app/apple-icon.png` — 180×180 iOS home-screen icon (auto-served at `/apple-icon`)
- `src/app/favicon.ico` — multi-size (16+32) favicon

**Branch / PR:** `design/brand-identity-logo-2026-04-23` / (PR on push)

---

### 2026-04-23 — brand-identity — palette

**Context:** First `/brand-identity` artifact pass off the rev-2 locked brief. Scope deliberately narrowed to palette only — logo concepts, icon, favicon, OG, email headers deferred. Goal: emit a single source-of-truth file for the Last Call palette, wire it into Tailwind + CSS vars without breaking the existing emerald/amber "warm sunset" tokens still used across 117 files / 1721 utility occurrences.

**Decisions:**
- Created `brand/palette.json` as source of truth. Structure: `roles` (10 brief-verbatim tokens), `scales` (50–950 derived for sodium / tile / bourbon for Tailwind utility ergonomics), `semantic` (success/warning/danger mapping), `accessibility` (WCAG pairs carried from brief), `tailwindExtend` + `cssVariables` (copy-paste ready).
- Extended `tailwind.config.js` `theme.extend.colors` with `otg.*` namespace. Legacy `primary` emerald scale kept in place with a TODO comment — removing it now would nuke the app. Reserved for `/design-component` pass.
- Added 11 `--otg-*` CSS custom properties to `:root` in `src/styles/globals.css`, coexisting with the legacy sunset vars.
- **Derived two semantic tokens not in brief §3:** `danger` `#D04A3C` (redder sibling to sodium — needed for destructive/error surfaces) and `warning` (mapped to existing `bourbon` `#FFB347`). Both flagged in `palette.json` with `note` fields. Proposing for brief rev-3.
- Decision point on shade scales: brief uses role-based tokens only. Chose to emit numeric scales for `sodium`, `tile`, `bourbon` on top of the role tokens — matches how the rest of Tailwind works and lets components use `bg-otg-sodium-100` for tints without lookup tables. Other role tokens (brick, maraschino, bg, text, border) ship as single hex values because brief treats them as single-purpose.

**Alternatives considered + rejected:**
- Mass-replace emerald utilities site-wide in this pass — rejected, violates workflow scope (palette, not component refactor). 1721 occurrences across 117 files is its own multi-session effort. Logged as the largest follow-up.
- Reconcile `palette.json` to the workflow spec's literal shape (`primary.50/100/500/900`, `accent.400/600`, etc.) — rejected. Brief §3 is role-based with 10 distinct semantic tokens; flattening into a 3-bucket shape would lose fidelity. Instead extended the spec with role-first + scales-alongside.
- Adding an explicit dark-mode inversion block to `globals.css` `.dark { --otg-bg: var(--otg-bg-light); ... }` — rejected for this pass. Brief locks dark-first; light mode is "accessibility courtesy." Defer the inversion until the component refactor pass proves we need it.

**Verification:**
- `npx tsc --noEmit` — 0 errors
- `npm run lint` — ✔ 0 warnings/errors
- `npm run build` — ✅ full production build clean

**Follow-ups:**
- [ ] **Largest:** Replace 1721 emerald/amber/pink utility occurrences across 117 files with `otg.*` equivalents. Catalog per component in `/design-component` passes (`RSVPButton`, `CheckInButton` + `LiveActivityCard`, `NotificationCard`, `MeetupCard` first per brief §9).
- [ ] Rewrite `src/styles/globals.css` component classes (`.btn-primary`, `.btn-secondary`, `.card-gradient`, `.avatar`, `.progress-bar`, `.text-gradient`, `.glow-emerald`, `::selection`) to use `otg.*`. These hold the inherited "warm sunset" gradient language that contradicts Last Call dark-first.
- [ ] Flip `darkMode: 'class'` → `darkMode: ['class']` + wire default `<html class="dark">` on app shell. Brief is explicit that dark is default; current default is light. Blocking for any meaningful Last Call rendering.
- [ ] Retire `--color-primary` / `--color-secondary` / `--color-accent` CSS vars in favor of `--otg-*`. Audit `globals.css` `@layer components` block (nav-link, progress, skeleton, divider).
- [ ] Propose brief rev-3 additions: explicit `--otg-danger` (`#D04A3C`) and `--otg-warning` (alias of bourbon). Dim-text 4.6:1 ratio verified on paper — verify rendered at 14px in a real surface once a component migrates.
- [ ] Delete legacy `primary` emerald scale from `tailwind.config.js` once all utility references are migrated.

**Artifacts shipped:**
- `outthegroupchat-travel-app/brand/palette.json` (new, source of truth)
- `outthegroupchat-travel-app/tailwind.config.js` (extended with `otg.*` namespace)
- `outthegroupchat-travel-app/src/styles/globals.css` (`:root` extended with `--otg-*` vars)

**Branch / PR:** `design/brand-identity-palette-2026-04-23` / (PR on push — awaiting user go-ahead)

---

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
