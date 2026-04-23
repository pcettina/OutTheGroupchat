# Design Brief — OutTheGroupchat

**Status:** ✅ Locked 2026-04-22 (rev-2 web-verified; refresh only on repositioning).
**Method:** `docs/design/workflows/design-research.md` — 5 parallel research agents + synthesis.
**Provenance:** Rev-2 of this brief was produced with `WebSearch` and `WebFetch` enabled. Every quoted competitor string in §2 was fetched verbatim; every license and motion token in §4 and §6 was verified against the foundry's or platform's live docs. Source URLs accompany each section.

---

## 1. Positioning anchor

OTG is **the social media app that wants to get you off your phone.** A meetup-centric network where the screen exists to put you in a room. NYC-first launch, Gen Z + Millennial, evening-skewed usage. Core actions: check in → RSVP → invite Crew → meet up IRL.

The brief locks design choices that consistently support this thesis. Anything that makes OTG feel like a feed-first, scroll-friendly social product is wrong by construction.

---

## 2. Competitor landscape (Source: Agent A — web-verified)

11 of 14 sites verified via live `WebFetch`. **Tally, Circles, and Backlash dropped from the competitive set** — Tally is a form builder, Circles is a clinical narcissistic-abuse support service, and Backlash could not be confirmed as a real product in this category.

| App | Audience | Visual style | Verified hero copy | Verified CTA | Color tag | Does well | Does badly |
|---|---|---|---|---|---|---|---|
| Partiful | Gen Z / Millennial party hosts | Theme-driven, no fixed identity | "Parties are back" | Create invite | Black + Majorelle Blue `#6050DC` + per-host themes | Treats invite as creative output | No fixed visual identity |
| Timeleft | Adults wanting weekly dinner companions | Clean, photographic, intimate | "The weekly gatherings turning strangers into friends" | Sign Up Now | White + dark text + soft accents | Single weekly ritual is the product | Anonymous-before-night feels transactional |
| Meetup.com | Hobbyists, broad age | Friendly, illustrative, dated | "The people platform. Where interests become friendships." | Join Meetup | White + blue + illustrated icons | Massive group catalog | Web-2.0 visual residue |
| Lu.ma (luma.com) | Tech organizers; indie hosts | Minimalist, polished, neutral | "Delightful events start here." | Create Your First Event | White + host-uploaded poster art | Beautiful event pages | Hero is host-facing, not attendee-facing |
| Eventbrite | Mass ticket buyers | Corporate, category-grid | (no single hero — leads with category cards) | Search events | White + blue + city photos | Discovery via browse | No headline = no point of view |
| Geneva | Local interest groups | Warm, illustrative, community | **"The online place to find your offline people"** | Download | Yellow / honey + cream + black | Tagline nails offline intent | **Closest direct competitor** |
| IRL (defunct) | Was: Gen Z event discovery | — | Site reads "has shut down" | n/a | n/a | Cautionary tale (TechCrunch, 2024 fraud) | Don't reuse the trust narrative |
| Nextdoor | Neighbors, local businesses | Utilitarian, dense, civic | "If it's happening in your neighborhood, it's on Nextdoor." | Connect to your neighborhood | Green + white | Hyperlocal anchor | Skews older, civic not social |
| Bumble BFF | Women+ seeking platonic friendship | Bold, warm, branded | (HTTP 426 — not directly fetched; Mobbin verified) | — | Yellow `#FFC629` + white + honey `#E3AA1F` | Yellow ownership is total | Friendship gated behind dating DNA |
| BeReal (bereal.com) | Gen Z anti-curation | Stark, monochrome | **"Your daily dose of real life."** | Get the app | Black `#000` + White `#FFF` + Golden Tainoi `#FFCC4D` | "No filters, no AIs allowed" stance | Daily-prompt mechanic plateaued |
| Discord | Gamers, friend groups | Playful, character-driven, dark-mode | "Group chat that's all fun & games" | Download for Windows | Blurple `#5865F2` + Green `#57F287` + Yellow `#FEE75C` + Fuchsia `#EB459E` + Red `#ED4245` | Mascots give brand a face | Gaming DNA limits crossover |

**Synthesis.** The dominant visual mode in this set is **white-first minimalism + a single accent + stock-friend hero photo + transactional CTA** (Meetup, Geneva, Bumble, Luma all do exactly this). If OTG ships that combo, it will be visually indistinguishable from Geneva — which, critically, **already owns the OTG tagline verbatim**. The alternative anti-system (Partiful's per-host theme tokens) means OTG would have no recognizable identity in app-store screenshots, press, or paid ads. **Rule that emerged from verified data: avoid yellow as a primary or significant accent — Bumble (`#FFC629`), Geneva (honey/gold), BeReal (`#FFCC4D`), and Discord secondary (`#FEE75C`) all live in that lane.**

**Closest to "off your phone" positioning.** **Geneva** is the most direct semantic competitor (its tagline is OTG's promise) — but Geneva keeps users *in-app* (audio rooms, broadcasts, forums) rather than pushing them out. **BeReal** owns the *anti-social-media tonal stance* with austere monochrome and explicit "no filters" copy. OTG's opportunity: take BeReal's tonal austerity and bolt it to a check-in/RSVP mechanic that *ends* in the app closing — neither competitor does that. The visual identity should signal NYC + evening + warm room, not "wellness app cream + smiley illustration."

---

## 3. Locked color palette: **"Last Call"** — dark-first

(Source: Agent C — web-verified against Partiful, BeReal, Cash App, Mercury, Geneva, Tally, Marshmallow, Are.na, Linear)

| Token | Hex | Role |
|---|---|---|
| `--otg-sodium` | `#FF6B4A` | Primary CTA — Check in, RSVP, Get on the list. Reads as NYC streetlight orange. |
| `--otg-bourbon` | `#FFB347` | Secondary action, check-in glow |
| `--otg-brick` | `#7A2C1A` | Pressed states, depth wells, raised card on dark bg |
| `--otg-tile` | `#5FB3A8` | **Crew identity color, "you're in" confirmations.** Replaces the original yellow Crew accent — yellow is too crowded in this category (see §2). |
| `--otg-maraschino` | `#3A1F2B` | "Live now" / meetup-active badge — deep warm glow |
| `--otg-bg-dark` | `#15110E` | App background (default mode) |
| `--otg-bg-light` | `#FAF3E7` | Light-mode background, warm-paper inversion |
| `--otg-text-bright` | `#F5EBDD` | Primary text on dark |
| `--otg-text-dim` | `#8B7E6F` | Secondary text, timestamps, helper copy |
| `--otg-border` | `#2B221C` | Hairlines on dark bg |

**Mode:** dark-first. The app's center-of-gravity is evening NYC; dark sodium-orange UI reads as a warm room, not a notification surface. Light mode exists as accessibility courtesy.

**WCAG-AA verification.** `#FF6B4A` on `#15110E` ≈ 6.8:1 (AA). `#F5EBDD` on `#15110E` ≈ 14.2:1 (AAA). Tightest pair to verify pre-ship: `--otg-text-dim` `#8B7E6F` on `--otg-bg-dark` ≈ 4.6:1 (passes AA at 14px+).

**Why this and not the alternatives.**
- Rejected *Stoop Light* (Honey Sodium `#E8B04D` + Terracotta `#C76E4A` + Sage Park `#A8C49A`): the honey-yellow primary lands directly in the Bumble + Geneva lane.
- Rejected *Neon Diner* (Jukebox Pink `#FF3D7F` + Mint Tile `#00C7B7`): too high-energy, reads "club-night marketing" rather than "warm evening meetup."
- Replaced original Booth Yellow `#F4D35E` accent with **Subway Tile `#5FB3A8`** (cool counterpoint to the warm core; sage-teal that signals "active/positive" without joining the yellow-saturated pile in the category).

---

## 4. Type pairing: **Cabinet Grotesk + Switzer** (with Sentient italic for accents)

(Source: Agent B — web-verified against Pangram Pangram EULA, Klim Web Font License, ITF Free Font License, 2026 trend reports)

| Role | Family | Use |
|---|---|---|
| Display | **Cabinet Grotesk** (Indian Type Foundry / Fontshare) | Hero, big numbers, section openers — rounded warmth |
| Body | **Switzer** (Indian Type Foundry / Fontshare) | All UI 14–18px, lists, body, button labels — neo-grotesque legibility |
| Italic accent | **Sentient italic** (Fontshare) | Editorial moments — quoted host strings, "you're in" tone |
| Mono | System UI Mono fallback | Timestamps in raw form only |

**Licensing.** All three under the **ITF Free Font License (FFL)** — verified at fontshare.com/licenses/itf-ffl. Allowed across "any media, any scale, any location worldwide." No MAU caps. No pageview caps. **Total annual cost: $0**, no surprise invoices as OTG scales.

**Loading.** ~50–60 KB total subset (Cabinet Grotesk + Switzer Latin). Self-host via `next/font/local` from `public/fonts/`. Use `display: 'swap'`. Preload only the body weights rendered above the fold. (Fontshare's CDN works but self-hosting wins on Core Web Vitals.)

**Why this and not the alternatives.**
- **Why switched from rev-1's Gambarino + Satoshi:** verified 2026 trend reporting (Fontfabric, Wix, Envato) is unanimous on the shift from sharp geometric sans to "cute and cosy" rounded warmth. Cabinet Grotesk hits that beat directly; Gambarino's quirky-serif personality reads more "indie portfolio" than "consumer social."
- **Rejected PP Editorial New + PP Neue Montreal** (Pangram Pangram): verified per their EULA, "to use a Font on a phone application, web application or video game, the Licensee needs to purchase an App License for each individual application... limited to a certain number of active users per month." Held as paid-tier alternative if we want a magazine/zine voice later.
- **Rejected Söhne** (Klim): verified pricing — "5,000 MAUs/downloads for $630 USD" with full family ~$1,500–3,000+ at OTG launch traffic. Exceeds $500/yr budget AND IS the OpenAI / Atlantic / Doordash default the brief warns against.

---

## 5. Voice & tone (Source: Agent D — web-verified against 9 live sites)

**Three adjectives:** direct, warm, slightly dry.

**Rules.**
- Sentence case everywhere (CTAs included). No Title Case.
- Zero emoji in product UI and transactional copy. Permitted only inside user-generated content. **Never in CTAs.**
- Em-dashes allowed sparingly. **No ellipses** (signal hesitation). Question marks only when literally asking. Periods on full sentences; CTA buttons no period.
- Contractions always.
- 2nd person ("you") for the user; 1st plural ("we") only for system actions. Never "I" except in the user's own check-in voice ("I'm out").
- Capitalize **Crew** when referring to the user's group (proper noun).

**Five do's:** lead with the verb; name the IRL outcome, not the feature; keep CTAs under 4 words; acknowledge user hesitation then remove it (Tally's "No signup required" pattern); be specific (name the bar, the time, the train).

**Five don'ts:** no emoji in product chrome (Partiful overshoots — we go cleaner); no exclamation marks in transactional copy; no "Let's…" or "Ready to…" cheerleader openers; no engagement-bait verbs ("Don't miss!", "Hurry"); no corporate hedging ("may," "might," "could potentially").

**Ten locked OTG copy strings.**

| # | Surface | Copy |
|---|---|---|
| 1 | Landing hero | Real plans with real people. Tonight. |
| 2 | Signup CTA button | Get on the list |
| 3 | Empty crew state | Your Crew lives here. Add the first three. |
| 4 | Empty meetup feed | Quiet night out there. Drop a check-in and start one. |
| 5 | RSVP confirmation toast | You're in. We told the Crew. |
| 6 | "Starting soon" push | Heads up — you're on in an hour. |
| 7 | Check-in button | I'm out |
| 8 | Generic error | That didn't go through. Try again. |
| 9 | Footer legal link | Terms |
| 10 | Email unsub footer | Not for you? Unsubscribe. |

**What this voice rejects.** Not Partiful's emoji-forward party-host energy ("See who's going 👀"); not BeReal's manifesto posture ("we reject filters"); not Cash App's bank-utility flatness; not Are.na's literary lowercase intellectualism. We borrow Tally's plain-spoken honesty, Timeleft's "show up and settle in" reassurance, and Marshmallow's friendly directness — without the punny insurance dad-jokes. Sounds like a text from the friend who actually plans things, not a notification from an app trying to retain you.

---

## 6. Motion language (Source: Agent E — web-verified against Apple HIG, M3 motion tokens, Motion v11 docs, MDN Vibration API)

**Timing tokens** (M3-aligned: short1=50, short2=100, short3=150, short4=200, medium1=250, medium2=300, medium3=350, medium4=400, long1=450, long2=500, long3=550, long4=600).

| Action | Range | Why |
|---|---|---|
| Button press / tap feedback | 80–120ms | Sub-150ms feels instant (Apple HIG, M3 short1–short2) |
| Toast / chip enter | 150–200ms | M3 short3 / short4 — registers without blocking |
| Modal / sheet present | 300–400ms | Standard sheet present (M3 medium2–medium4) |
| Page / route transition | 300–500ms | Multi-element comprehension band (Apple iOS 26) |
| List item enter (staggered) | 180–260ms each, 30–50ms stagger | Below 180 jitters; above 300 drags |
| Success confirmation (RSVP / check-in) | 400–600ms total | "Showy" zone is OK here — single moment of delight per session |
| Skeleton → content swap | 160ms crossfade | Below flicker threshold |
| Anything > 700ms on tap | LAGGY — never | Apple HIG's "brevity and precision" rule |

**Easing tokens** (Motion for React v11+ syntax) — drop into `src/lib/motion.ts`:

```ts
export const motion = {
  easeOutQuart: [0.25, 1, 0.5, 1] as const,   // entrances — M3 standard-decelerate
  easeInQuart:  [0.5, 0, 0.75, 0] as const,   // exits     — M3 standard-accelerate
  standard:     [0.4, 0, 0.2, 1] as const,    // two-way   — M3 standard
  snappySpring: { type: "spring", visualDuration: 0.28, bounce: 0.35 } as const,
} as const;
```

Motion v11+ uses `visualDuration` + `bounce` (newer ergonomic API) rather than raw `stiffness` / `damping` for most cases — verified against motion.dev/docs/react-transitions.

**Haptic map.** Web Vibration API works on Android Chrome; **iOS Safari does NOT support `navigator.vibrate()`** — feature-detect and fall back silently. For a future native iOS shell, map to `UIImpactFeedbackGenerator` / `UINotificationFeedbackGenerator`.

| OTG Action | Web `vibrate()` | iOS native | Android native |
|---|---|---|---|
| Button press | `vibrate(8)` | `.light` impact | `EFFECT_TICK` |
| RSVP confirm | `vibrate([12, 40, 18])` | `.success` notification | `EFFECT_DOUBLE_CLICK` |
| Check-in success | `vibrate([20, 30, 35])` | `.medium` impact + `.success` | `EFFECT_HEAVY_CLICK` |
| Swipe-to-dismiss release | `vibrate(6)` on threshold cross | `.soft` impact | `EFFECT_TICK` |
| Validation error | `vibrate([60, 40, 60])` | `.error` notification | `EFFECT_DOUBLE_CLICK` ×2 |

Wrap every call: `if ('vibrate' in navigator) navigator.vibrate(...)`. Respect `prefers-reduced-motion`.

**Three signature micro-interactions to ship.**

1. **Pulse-In** (RSVP confirm) — Button scales 1 → 0.94 (80ms easeInQuart) → 1.06 → 1 via `snappySpring`; a teal radial glow expands behind it (opacity 0.6 → 0, scale 1 → 1.8, 500ms easeOutQuart). Haptic: `vibrate([12, 40, 18])`. *Reference: Partiful "Going" button.* Compress→overshoot→glow recipe matches biological weight transfer — reads as committed effort.
2. **Drop-Pin** (Check-in success) — Pin SVG drops 24px from above with `snappySpring` (bounce 0.5), then a single concentric ring pulses outward (scale 1 → 2.4, opacity 0.4 → 0, 600ms easeOutQuart). Haptic: medium impact + success notification. *Reference: Apple Wallet Express Transit confirm + Cash App payment-sent ring.* The pin lands "in the world," not "on the screen."
3. **Swipe-Dismiss with Detent** (notification swipe) — Card follows finger 1:1; at 35% screen-width threshold it snaps the rest with `{ type: "spring", visualDuration: 0.22, bounce: 0 }` and fades opacity 1 → 0. Below threshold it springs back with `bounce: 0.4`. Haptic: `vibrate(6)` exactly when threshold is crossed. *Reference: Linear issue swipe + iOS Mail swipe-to-archive.* The haptic at the detent point teaches gesture threshold without a tutorial.

**Anti-pattern.** **Big page-level "morph" transitions with shared-element layout animations across routes** (the 2024 trend popularized by complex `layoutId` route demos). On mobile they routinely add 400–700ms of perceived latency, conflict with iOS swipe-back gestures, and break when destination data is async. Use them only inside a single screen (card → detail sheet within the same route). For navigation: 200ms cross-fade or native-feel slide. (Honorable mention: blob/SVG morph hero loaders. Done in 2024.)

---

## 7. Visual mood-board

Five named reference styles. Brand-identity work pulls mood, not literal imagery.

1. **Last Call** — The corner booth at a dimly-lit Lower East Side bar at 10:47 PM. Sodium-lamp orange + bourbon glow against warm black.
2. **Invitation-as-object** — The Partiful school: every meetup screen reads as a printed flyer or hand-set invite, not a feed card.
3. **Restraint as statement** — The BeReal discipline (`#000` + `#FFF` + `#FFCC4D`, system fonts, no decoration): removed elements earn their absence.
4. **Bodega marquee** — Hand-painted NYC signage and transit-line color logic. Display type with weight and presence; copy that names the place and the time.
5. **Receipt-paper utility** — Ticket stubs, bar tabs, coat-check tags. Information-dense, deliberately unfussy, satisfying when you keep one in your pocket.

---

## 8. Design principles

Seven short rules. Test every screen against these.

1. **Plans, not posts.** Every screen serves a meetup. There is no scroll-for-its-own-sake surface in this product.
2. **Specificity over hype.** Name the bar, the time, the train. Concrete beats aspirational every time.
3. **Dark by default, warm by default.** The app meets the user in evening light, not in a notification.
4. **Stamp, then settle.** Confirmations are tactile and two-beat. The user knows the moment it landed.
5. **Restraint is the brand.** Every removed element is a decision. If a screen needs an illustration to feel complete, the screen is wrong.
6. **Sentence case, no exclamations.** The voice rule applies everywhere copy lives — buttons, errors, push, email.
7. **Differentiate on color.** Yellow is owned (Bumble, Geneva, BeReal accent, Discord). Cream-with-one-accent is owned (Lu.ma, Mercury, Marshmallow). OTG owns sodium-orange + warm-black.

---

## 9. Open questions / handoffs

- **`/brand-identity`** — Translate Last Call into Tailwind tokens (`tailwind.config.ts`); design logo + favicon + OG card in this palette and Cabinet Grotesk. Decide whether the wordmark uses Cabinet Grotesk, Sentient italic, or a hand-set custom letter.
- **`/design-component`** — First targets:
  - `RSVPButton` — apply Pulse-In interaction
  - `CheckInButton` + `LiveActivityCard` — apply Drop-Pin
  - `NotificationCard` (or wherever swipe-to-dismiss lives) — apply Swipe-Dismiss with Detent
  - `MeetupCard` — apply invitation-as-object treatment
- **Accessibility** — Verify `--otg-text-dim` (`#8B7E6F`) hits 4.5:1 on `--otg-bg-dark` (`#15110E`); confirm `--otg-sodium` outline-on-dark passes AA-large for interactive states; gate haptics on `prefers-reduced-motion`.
- **Iconography decision** — bodega-marquee mood implies hand-set / chunky icons. Whether to license Phosphor / Lucide / draw custom is a downstream call.
- **Geneva differentiation** — Geneva already owns "online place to find your offline people." OTG hero ("Real plans with real people. Tonight.") leans on **time specificity** + **outcome-not-platform** language to differentiate. Validate this resonates in early user testing.
