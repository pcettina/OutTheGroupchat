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

### 2026-04-23 — landing — homepage + nav refactor ("Last Call lands")

**Context:** After shipping the palette (PR #61), logo mark (PR #62), and foundation — fonts + dark-mode default (PR #63), production still didn't *look* like the brief. Visiting outthegroupchat.org rendered the emerald "OG" square nav logo, an emerald→teal→cyan `.text-gradient` hero, and the stale "The social app that gets you off your phone" headline. The tokens were loaded; nothing was using them yet. This pass wires the `otg.*` tokens and the Hybrid Exit mark into the three surfaces a first-time visitor actually sees: the root landing page, the nav bar, and the app-wide `@layer components` utility classes that the rest of the app inherits from.

**Decisions:**
- **Retired emerald from `@layer components` and `@layer utilities` in `globals.css`.** Every app-wide utility class (`.btn-primary`, `.btn-secondary`, `.btn-accent`, `.btn-ghost`, `.btn-outline`, `.card`, `.card-gradient`, `.card-glass`, `.input`, `.badge-*`, `.avatar`, `.nav-link`, `.progress-bar`, `.stat-value`, `.skeleton`, `.divider`, `.text-gradient`, `.text-gradient-sunset`, `.glass`, `.glow-emerald`, `.glow-amber`, scrollbar track/thumb) now references `otg.*` tokens. Class names preserved for non-breaking migration — every existing call site inherits the new look with zero code changes.
  - `.btn-primary`: sodium fill on warm-black text, brick on active. Replaces emerald→teal gradient.
  - `.btn-secondary`: bourbon fill. `.btn-accent`: tile (Crew accent).
  - `.card`: `bg-otg-maraschino` with `border-otg-border` — matches brief §3 dim-bar feel.
  - `.text-gradient`: sodium→bourbon (was emerald→teal→cyan).
  - `.glow-emerald` / `.glow-amber`: names retained, values repointed to sodium / bourbon rgba.
- **Refactored `src/app/page.tsx`** — full rebuild from pre-pivot travel-app copy to brief-locked meetup copy.
  - Hero headline: **"Real plans with real people. Tonight."** (brief §1 verbatim), with "Tonight." rendered in the new sodium→bourbon `.text-gradient`.
  - Subhead split into two lines to match brief voice — "The social media app that wants to get you off your phone." + "NYC-first meetup network — check in, RSVP, invite your Crew, meet up IRL."
  - Pre-hero pill: `"NYC — last call, tonight"` in sodium-on-maraschino with a ping dot. Brief voice check: dry, sentence-case, no emoji/exclamation.
  - Primary CTA: `"Get in the Groupchat"` (logged-out) / `"Who's out tonight"` (authenticated, routes to `/checkins`).
  - Secondary CTA for logged-out visitors reworked from "Explore Demo 🎮" → "Look around first" (demo session) — removed emoji, removed "Demo" marketing label, replaced with dry voice.
  - Feature section headline: `"From group chat to real life"` with "to" set in Instrument Serif Italic (editorial accent role). Three feature cards — Build your Crew (sodium), Check in somewhere (tile), Actually show up (bourbon) — icon tones applied via a static `toneClasses` map (Tailwind JIT-safe, no dynamic string interpolation).
  - CTA card headline swapped from "Ready to Meet Someone?" → `"Put your phone down somewhere good."` — brief voice hit. CTA repoints to `/meetups/new` when authenticated.
  - Stats row kept but sentence-cased (`"meetups posted"`, `"people connected"`, `"cities"`, `"rating"`) and retinted to sodium→bourbon.
  - Background blobs: sodium/bourbon/tile halos replace emerald/amber/pink. Reads like sodium-lamp light through a dim bar window.
  - Icons swapped from inline SVG paths to `lucide-react` (`Users`, `MapPin`, `CheckCircle2`, `ArrowRight`) — consistent icon kit.
- **Refactored `src/components/Navigation.tsx`** — replaced the emerald gradient "OG" square with the Hybrid Exit mark served from `public/logo-mark.svg` via `next/image` at `h-9 w-auto`. Wordmark "OutTheGroupchat" retained with sodium accent on "Out". Nav chrome: `bg-otg-bg-dark/70` glass + `border-otg-border`, all slate-* token references replaced with `text-otg-text-bright` / `text-otg-text-dim` / `hover:bg-otg-maraschino`. Notification badge recolored sodium-on-warm-black. Profile dropdown, sign-in/sign-up CTAs, and mobile menu all retinted. Copy sentence-cased throughout ("Sign in", "Get started", "Sign out", "Privacy settings").
- **Copied `brand/logo/logo-mark.svg` → `public/logo-mark.svg`** so it's servable at `/logo-mark.svg`. Kept the `brand/` source file as the canonical editable artifact.
- **First-time visitor path is now on-brief.** Landing page, nav bar, every CTA, every card, every badge, every avatar, every progress bar — all render Last Call without touching any individual feature component.

**Alternatives considered + rejected:**
- **Rename `.btn-primary` → `.btn-sodium`** — rejected. 40+ call sites site-wide; rename forces a mass-edit PR for zero user-visible benefit. Preserving class names is the cheaper path to the same rendered result.
- **Scope the PR to only `page.tsx` (leave Navigation + component classes for later)** — rejected. The emerald "OG" square is visible on *every* page, not just the landing page. Half-shipping means every authenticated page still looks pre-pivot. Nav had to land in the same PR.
- **Drop the legacy `primary` emerald scale in `tailwind.config.js` while we're here** — rejected. Still 117 files / 1721 references to emerald utilities outside the three files in this PR. Removing the scale would red-screen every non-refactored component. Logged as a follow-up (gated on the `/design-component` audit).
- **Use a Framer Motion morph from logo-mark's long-arm cap to an avatar silhouette in the hero** — rejected. Brief is clear: animations come last (Phase 6 per brief §6 priority order). Cataloged in `brand/FUTURE_WORK.md` from PR #62.
- **Keep emoji 🎮 on the demo CTA** — rejected. Brief voice: no emoji, no exclamation.

**Verification:**
- `npx tsc --noEmit` — 0 errors
- `npm run lint` — ✔ 0 warnings / errors
- `npm run build` — ✅ clean production build
- `npm test` — **1048 passed** (matches main; no route logic touched)

**Follow-ups:**
- [ ] Continue the `/design-component` pass on individual feature components (117-file emerald/amber/pink audit continues) — first targets per brief §9: `RSVPButton` (Pulse-In micro-interaction), `CheckInButton`, `MeetupCard`, `NotificationCard`.
- [ ] `src/app/profile/page.tsx` retains some hardcoded slate utilities outside the `btn-primary` site. Lower priority since profile isn't a landing surface, but should sweep in a `/design-component` pass.
- [ ] Remove the legacy `primary` emerald scale + legacy `--color-primary` CSS vars from `tailwind.config.js` + `globals.css` `:root` once the utility audit completes.
- [ ] Horizontal wordmark SVG (`logo-wordmark.svg`) — now unblocked by the Fontshare fonts shipped in PR #63. Will replace the text-based wordmark in `Navigation.tsx` + footer with the set type for pixel-perfect kerning.
- [ ] OG image (1200×630) + email header strips (3× 600×160) — still deferred from PR #62 logo ship. Both use the new mark + Fontshare type; plan is a single render script that emits all three.
- [ ] Hero illustration ("phone + group of people walking out" per brief §7) is currently stubbed with three floating receipt cards. Deferred to illustration pass (Phase 4).
- [ ] Landing-page screenshot capture into `docs/design/screenshots/last-call-lands-2026-04-23/` — not automated; manual capture after Vercel deploy.

**Artifacts shipped:**
- `src/app/page.tsx` — full landing rebuild (342 → 310 lines, brief-locked copy, sodium/bourbon/tile halos, Hybrid Exit in footer)
- `src/components/Navigation.tsx` — Hybrid Exit mark, warm-black chrome, sentence-case nav copy
- `src/styles/globals.css` — `@layer components` + `@layer utilities` + scrollbar utilities fully retinted to `otg.*` tokens
- `public/logo-mark.svg` — Hybrid Exit mark served from public/

**Branch / PR:** `design/last-call-lands-2026-04-23` / (PR on push)

---

### 2026-04-23 — foundation — fonts + dark-mode default ("Last Call lights up")

**Context:** Palette PR (#61) and logo PR (#62) are merged but the app itself doesn't yet *look* like the brief — still boots to light mode, still renders Outfit/Poppins, still uses the pre-pivot emerald/slate gradient. This pass wires the Fontshare fonts and flips dark-mode default so every subsequent `/design-component` pass sees the correct rendering context.

**Decisions:**
- **Flipped dark-mode default.** `<html class="dark">` added to `src/app/layout.tsx`. Brief §3 ("dark-first, warm-black") is now literal. Light mode exists as accessibility courtesy but is no longer the default.
- **Loaded Fontshare fonts via `next/font/local`.** Self-hosted (not Fontshare's CDN) per brief guidance — wins on Core Web Vitals. Files in `public/fonts/`:
  - Cabinet Grotesk Medium (500) + Bold (700) → `--font-display`
  - Switzer Regular (400) + Medium (500) → `--font-sans`
  - Instrument Serif Italic (400) → `--font-serif` (Sentient italic substitute — Fontshare Sentient italic API returns HTTP 500 across all weights as of 2026-04-23; all non-italic Sentient weights work. See follow-up to swap back.)
- **Font stack exposed via Tailwind.** `fontFamily.sans = Switzer → system-ui → sans-serif`. `fontFamily.display = Cabinet → Switzer → system-ui`. `fontFamily.serif = Instrument Serif → Georgia → serif`. Any component can now use `font-display` / `font-sans` / `font-serif`.
- **Re-pointed `.dark` CSS custom properties to Last Call tokens.** `--color-background` = `21 17 14` (warm-black), `--color-foreground` = `245 235 221` (bright cream), `--color-muted` = `139 126 111` (text-dim), `--color-border` = `43 34 28`, `--color-card` = `58 31 43` (maraschino). Components already using `bg-background` / `text-foreground` / `bg-muted` / `border-border` / `bg-card` now automatically render Last Call in dark mode. Components with hardcoded `bg-emerald-500` etc. still render the old palette — deferred to component refactor passes.
- **Replaced metadata copy** with meetup-pivot language — title `"OutTheGroupchat — Real plans with real people. Tonight."`, description leads with "the social media app that wants to get you off your phone", keywords swapped from travel/vacation to meetup/nyc/irl/crew/nightlife.
- **Updated `theme-color` meta** from emerald `#10b981` to warm-black `#15110E`. Mobile browser chrome now matches the dark app body.
- **Selection + scrollbar** retinted to sodium/warm-black in `globals.css` — small but visible palette touch.

**Alternatives considered + rejected:**
- **Keep dark-mode as opt-in** (default light, toggle button) — rejected. Brief §3 is explicit ("dark-first, warm by default"). Shipping light-default would mean every design-component pass validates against the wrong context.
- **Use Sentient italic anyway (non-italic + CSS `font-style: italic`)** — rejected. Synthesized italic from a non-italic cut usually looks worse than a true italic font. Instrument Serif Italic is a proper italic cut with similar editorial register — better fidelity.
- **Use Fraunces or Crimson Text as italic serif** — rejected for now. Instrument Serif is what the concept renders used and what the user approved. Keep visual continuity.
- **Load Fontshare via their CDN** (<link rel="stylesheet" href="api.fontshare.com...">) — rejected per brief. Self-hosted wins on Core Web Vitals, removes third-party CDN dependency.
- **Refactor all 1721 hardcoded emerald/amber/pink utility occurrences in this PR** — rejected. 117-file refactor is too large and unrelated to the foundation goal. Belongs in `/design-component` passes.

**Verification:**
- `npx tsc --noEmit` — 0 errors
- `npm run lint` — ✔ 0 warnings / errors
- `npm run build` — ✅ full production build clean (pre-existing Sentry deprecation + punycode Node warnings only; nothing new introduced)

**Follow-ups:**
- [ ] **Swap Instrument Serif Italic → Fontshare Sentient italic** when Fontshare's CSS API heals. Single-file change (`src/app/layout.tsx` + rerun `public/fonts/download-fontshare.mjs`).
- [ ] **Subset Instrument Serif TTF to Latin basic + common punctuation** — current TTF is 63 KB; subsetted woff2 would be ~15 KB. Blocks only bundle-size optimization.
- [ ] **Component-level palette + font migration** — the 117-file / 1721-occurrence emerald/amber/pink audit catalogued in PR #61 plus all hardcoded `font-*` utilities that don't reference the new CSS vars. Largest single follow-up, belongs in `/design-component` passes (first targets: `RSVPButton`, `CheckInButton`, `MeetupCard`, `NotificationCard` per brief §9).
- [ ] **Audit `@layer components` block in `globals.css`** — `.btn-primary`, `.btn-secondary`, `.btn-accent`, `.card-gradient`, `.avatar`, `.progress-bar`, `.text-gradient`, `.glow-emerald` all still reference the pre-pivot emerald/amber gradients. These aren't component instances but they're app-wide classes that need Last Call rewiring before any component using them can be considered on-brief.
- [ ] Remove the legacy `primary` emerald scale from `tailwind.config.js` once all utility references are migrated. Logged in PR #61 follow-ups — unblocks after component pass.
- [ ] First `/design-component` pass on `RSVPButton` with Pulse-In interaction (brief §6 signature micro-interaction #1).

**Artifacts shipped:**
- `public/fonts/CabinetGrotesk-{Medium,Bold}.woff2` (40 KB total)
- `public/fonts/Switzer-{Regular,Medium}.woff2` (35 KB total)
- `public/fonts/InstrumentSerif-Italic.ttf` (63 KB, unsubsetted — subset follow-up noted)
- `public/fonts/download-fontshare.mjs` — re-runnable downloader script
- `src/app/layout.tsx` — fonts wired + dark-mode default + pivot metadata
- `tailwind.config.js` — fontFamily stack updated
- `src/styles/globals.css` — `.dark` tokens retargeted to Last Call, selection retinted to sodium

**Branch / PR:** `design/last-call-foundation-2026-04-23` / (PR on push)

---

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
