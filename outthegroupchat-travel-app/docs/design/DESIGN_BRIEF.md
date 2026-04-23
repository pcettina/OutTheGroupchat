# Design Brief — OutTheGroupchat

**Status:** ✅ Locked 2026-04-22 (initial foundation; refresh only on repositioning).
**Method:** `docs/design/workflows/design-research.md` — 5 parallel research agents + synthesis.
**Provenance:** Each section cites the source agent. WebSearch / WebFetch were unavailable mid-research; competitor data and exact strings should be re-verified before being used as published reference.

---

## 1. Positioning anchor

OTG is **the social media app that wants to get you off your phone.** A meetup-centric network where the screen exists to put you in a room. NYC-first launch, Gen Z + Millennial, evening-skewed usage. Core actions: check in → RSVP → invite Crew → meet up IRL.

The brief locks design choices that consistently support this thesis. Anything that makes OTG feel like a feed-first, scroll-friendly social product is wrong by construction.

---

## 2. Competitor landscape (Source: Agent A)

> ⚠️ Web access was denied during research; values reflect best-recall public brand identity and should be re-verified before use as published reference.

| App | Audience | Visual style | Type | Color | Hero | CTA | Does well | Does badly |
|---|---|---|---|---|---|---|---|---|
| Partiful | Gen Z party hosts | Maximalist, retro-Y2K, playful | Display serif + mono body | Hot pink `~#FF3D8B` + lime + deep purple on near-black | "Throw a great party" | Create event | Party-flyer feel, not SaaS | Cluttered, chaotic for older users |
| Timeleft | Late-20s urban pros | Warm, photographic, intimate | Geometric sans + serif accent | Cream `~#F5EFE6` + terracotta `~#C75D3F` | "Have dinner with 5 strangers" | Book my dinner | Owns one ritual; copy is the product | Quiz-like first-run, paywall buried |
| Meetup.com | Hobbyists, expats | Corporate, dated, generic-friendly | Graphik-class sans | Coral red `~#ED1C40` + gray | "Find your people" | Sign up | Long-tail niche depth | Looks 2014, low trust |
| Lu.ma | Tech event hosts | Minimal, neutral, utilitarian | Inter | Near-monochrome + accent | "Delightful events start here" | Sign up | Calm, beautifully typeset | Brandless, no emotional pull |
| Eventbrite | Mass ticket buyers | Corporate, dense, marketplace | Neue Plak | Bright orange `~#F05537` + navy | "Discover events" | Find events | Inventory + ticketing infra | Reads as marketplace, not social |
| Geneva | Gen Z creators | Friendly, rounded, app-store cute | Rounded geometric sans | Soft purple `~#9B7EDC` gradients | "The home for your community" | Get Geneva | Best-in-class group-chat UX | Discord-lite, weak discovery |
| IRL (closed) | Gen Z friends | Bubbly, gradient, Snapchat-coded | Rounded geometric sans | Magenta-purple gradient | "See your friends in real life" | Get the app | Owned the IRL naming first | Bot-fraud collapse |
| Nextdoor | Suburban, 35+ | Civic, leafy, utilitarian | Proprietary sans | Forest green `~#00B246` | "Neighbors helping neighbors" | Sign up free | Verified-address local trust | Toxic culture, anti-Gen-Z |
| Bumble BFF | Women 22–32 | Warm, hand-drawn-accent, optimistic | Proprietary serif + sans | Honey `#FFC629` | "Make friends, not just matches" | Join Bumble | Owns yellow + first-move ritual | Buried in dating app |
| Circles | Anonymous mental-health | Clinical-warm, soft-blue | Inter-class sans | Soft blue `~#5B7FFF` | "Feel better with people who get it" | Get started | Anonymity feels safe | Anonymity blocks IRL conversion |
| BeReal | Anti-Instagram teens | Brutalist, deliberately ugly | System default (no custom font) | Pure black + white + red dot | "Your friends for real" | Download BeReal | Refusal IS the brand | No monetization path |
| Discord (Crew ref) | Gamers, communities | Dark-mode-native, dense | Ginto Nord + ABC Ginto | Blurple `#5865F2` on `#1E1F22` | "Group chat that's all fun & games" | Open Discord | Server / role hierarchy | Reads as "tech," not "going outside" |

**Synthesis.** Two visual clichés dominate this category. First, the **Inter-on-white SaaS look** (Lu.ma, Tally, Circles, modern Meetup) — calm but emotionally inert; reads as "productivity tool," not "go outside." Second, the **gradient + rounded-sans bubblegum** (Geneva, IRL, Bumble app surface) — friendly but infantilizing, indistinguishable from a hundred wellness apps. A third trap is the **dense marketplace orange/red corporate stack** (Eventbrite, Meetup) which reads transactional. The closest references for "off your phone" positioning are **BeReal** (visual *refusal* — restraint as a thesis statement) and **Partiful** (the invite-as-object aesthetic — every screen reads as an artifact of a real event). OTG sits at the intersection: BeReal's restraint discipline + Partiful's printed-flyer physicality — a hand-set meetup card, not a notification stream.

---

## 3. Locked color palette: **"Last-Call Amber"** — dark-first

(Source: Agent C)

| Token | Hex | Role |
|---|---|---|
| `--otg-amber` | `#F4843C` | Primary CTA — Check in, RSVP, Get on the list |
| `--otg-coral` | `#E8556B` | Active state, "live now" pulse, Crew online indicator |
| `--otg-bourbon` | `#2A1810` | Surface tint, modal scrim, raised card on dark bg |
| `--otg-tungsten` | `#FFD27A` | Streak / badge / time-sensitive accent |
| `--otg-plum` | `#7C3AED` | Crew identity color, secondary tag |
| `--otg-bg-dark` | `#14100D` | App background (default mode) |
| `--otg-bg-light` | `#FBF6EE` | Light-mode background, warm-paper inversion |
| `--otg-text-bright` | `#FBF6EE` | Primary text on dark |
| `--otg-text-dim` | `#8A8076` | Secondary text, timestamps, helper copy |
| `--otg-border` | `#2D241D` | Hairlines on dark bg |

**Mode:** dark-first. The app's center-of-gravity is evening NYC; a dark amber UI reads as a warm room, not a notification surface. Light mode exists as an accessibility courtesy, not the canonical look.

**WCAG-AA verification.** `#FBF6EE` on `#14100D` = 16.1:1 (AAA). `#F4843C` on `#14100D` = 7.2:1 (AA for body text down to 14px regular). `--otg-text-dim` should be re-verified at 4.5:1 against the dark bg before final lock.

**Why this and not the alternatives.**
- Rejected *Stoop Sunset* (`#FF5A36` + Park Pine green): too close to Eventbrite/Tally orange, risks reading as marketplace.
- Rejected *Daylight Bodega* (light-first cream + lottery red): inverts the evening center-of-gravity; competes with Are.na and Mercury for "warm cream SaaS" mindshare.
- Rejected canonical tech defaults (navy + lime, indigo + amber Stripe-clone, purple + pink): every dating / finance app already lives there.

---

## 4. Type pairing: **Gambarino + Satoshi** (both Fontshare, free for commercial)

(Source: Agent B)

| Role | Family | Use |
|---|---|---|
| Display | **Gambarino** (Indian Type Foundry / Fontshare) | Hero, big numbers ("3 friends out tonight"), section openers |
| Body | **Satoshi** (Indian Type Foundry / Fontshare) | All UI 14–18px, lists, body text, button labels |
| Mono (optional) | System UI Mono fallback | Timestamps in raw form, debug surfaces only — not load-bearing |

**Licensing.** Both under the Fontshare Free License — commercial use allowed without attribution, no pageview limits. Total web cost: **$0/yr**.

**Loading.** ~45–60 KB total (woff2, 2 weights each, Latin subset). Self-host via `next/font/local` from `public/fonts/`. Use `display: swap`. Preload only the body weights rendered above the fold.

**Why this and not the alternatives.**
- Rejected *PP Editorial New + Neue Montreal* (Pangram Pangram): now overexposed across Vercel / Linear / Framer marketing — actively undermines our "not the AI-startup default" positioning.
- Rejected *Söhne* (Klim): exceeds the small-startup web-license budget at scale and IS the OpenAI / NYT default the brief warns against.
- Held as **alternative**: *Migra + General Sans* if we ever want a more editorial NYC-magazine-cover energy. Not chosen now — Migra italic + multiple weights balloons past 80 KB / weight.

---

## 5. Voice & tone (Source: Agent D)

**Three adjectives:** wry, terse, NYC-deadpan.

**Rules.**
- Sentence case everywhere, including buttons. No Title Case.
- ALL-CAPS reserved for one-word system alerts ("LIVE", "TONIGHT").
- No emoji in product UI. One pin / clock glyph allowed in push notifications. Never in body copy.
- Em-dashes welcome (max one per string). No ellipses.
- Periods on full sentences; drop periods on buttons.
- Question marks rare — only when actually asking.
- Contractions always.

**Five do's:** be specific (name the bar, the time, the train); use second person; trust the reader; sound like a text from a friend; end strong.

**Five don'ts:** no "let's"; no "amazing/awesome"; no "your journey"; no exclamation marks; no growth-hack urgency.

**Ten locked OTG copy strings.**

| # | Surface | Copy |
|---|---|---|
| 1 | Landing hero | Plans, not posts. See who's out tonight and go meet them. |
| 2 | Signup CTA button | Get on the list |
| 3 | Empty crew state | No crew yet. Add three people and the app starts working. |
| 4 | Empty meetup feed | Quiet night. Be the one who picks the spot. |
| 5 | RSVP confirmation toast | You're in. We'll nudge you an hour out. |
| 6 | "Starting soon" push | Starts at 8 — leave in 20 if you're taking the train. |
| 7 | Check-in button | I'm out |
| 8 | Generic error | That didn't go through. Try again in a sec. |
| 9 | Footer legal link | Terms & privacy |
| 10 | Email unsub footer | You can mute these anytime. Unsubscribe. |

**What this voice rejects.** Not Partiful's emoji-maximalist host energy (they're throwing it; we're meeting up). Not Timeleft's earnest connection-therapy moralizing. Not Geneva's warm-community-manager voice. Not Lu.ma's calendar-app neutrality. Closest references: Cash App's confident terseness + BeReal's deadpan system voice. Furthest: Eventbrite + Meetup joiner copy.

---

## 6. Motion language (Source: Agent E)

**Timing tokens.**

| Action | Duration |
|---|---|
| Page transition (route) | 220–280ms |
| Modal / sheet open | 320–380ms |
| Modal / sheet close | 200–240ms |
| Toast in / out | 180–220ms in, 240–300ms out, 3.5s hold |
| Button press feedback | 80–120ms |
| List item enter (staggered) | 240ms each, 40–60ms stagger |
| Success confirmation | 400–520ms total (200ms ack + 320ms resolve) |
| Skeleton → content swap | 160ms crossfade |

**Easing tokens** (drop into `src/lib/motion.ts`):

```ts
export const ease = {
  entry: [0.16, 1, 0.3, 1],                                          // easeOutQuart
  exit:  [0.7, 0, 0.84, 0],                                          // easeInQuart
  press: { type: "spring", stiffness: 500, damping: 30, mass: 0.6 }, // tap feedback
  pop:   { type: "spring", stiffness: 380, damping: 18, mass: 0.8 }, // confirmations
};
```

**Haptic map.**

| OTG Action | Web `vibrate()` | iOS Haptic |
|---|---|---|
| Default tap | none | none |
| RSVP confirm | `[12]` | `selectionChanged` |
| Check-in success | `[20, 40, 30]` | `notificationSuccess` |
| "Join me" sent | `[15, 30, 15]` | `impactMedium` |
| Swipe-to-dismiss release | `[10]` | `impactLight` |
| Validation error | `[40, 60, 40]` | `notificationError` |
| Pull-to-refresh trigger | `[8]` | `selectionChanged` |

**Rule.** Never haptic on idle scroll, route navigation, or initial render.

**Three signature micro-interactions to ship.**

1. **RSVP Stamp** — The RSVP button compresses to 0.92 (80ms), then a checkmark + crew-avatar rim morphs into the button shape with a `pop` spring while the label crossfades to "You're in." Light medium haptic on land. *Reference: Partiful's "I'm in" tap.* The tap target *becomes* the confirmation — no jump.
2. **Check-in Pulse** — On check-in success, a 6px coral ring radiates from the user's avatar (320ms, easeOutQuart, opacity 0.6 → 0); the avatar settles with a `pop` spring while the activeUntil timer fades in below. Success haptic. *Reference: BeReal capture confirm + Phantom transaction success.* Broadcasts presence outward — mirrors the social meaning.
3. **Join Me Slingshot** — On "Join me" tap, the friend's check-in card lifts 4px (120ms, shadow expands), then a small avatar bubble launches from your corner along a 220ms cubic-bezier arc to land on their avatar with a tactile thunk. Medium impact haptic on launch. *Reference: Cash App send + Apple Wallet card add.* The motion enacts the intent — your presence travels.

**Anti-pattern.** Kill the giant bouncy spring. `stiffness: 100, damping: 8` overshoot was 2023–24 default (Vercel, Linear, every Framer template); it now reads juvenile. **Cap overshoot at 8% max. Use `damping: 18–30` everywhere.** Reserve any visible bounce for the single celebratory moment per session — not nav, not lists.

---

## 7. Visual mood-board

Five named reference styles. Brand identity work should pull mood, not literal imagery.

1. **Last-call amber** — The single overhead bulb at a Lower East Side wine bar at 9:47 PM. Warm dark room, not server-room dark.
2. **Invitation-as-object** — The Partiful school: every meetup screen reads as a printed flyer or hand-set invite, not a feed card.
3. **Restraint as statement** — The BeReal discipline: removed elements earn their absence. No gradients, no decorative illustration, no "feature spotlight" hero blocks.
4. **Bodega marquee** — Hand-painted NYC signage. Display type with weight and presence; copy that names the place and the time.
5. **Receipt-paper utility** — Ticket stubs, bar tabs, coat-check tags. Information dense, deliberately unfussy, satisfying when you keep one in your pocket.

---

## 8. Design principles

Seven short rules. Test every screen against these.

1. **Plans, not posts.** Every screen serves a meetup. There is no scroll-for-its-own-sake surface in this product.
2. **Specificity over hype.** Name the bar, the time, the train. Concrete beats aspirational every time.
3. **Dark by default, warm by default.** The app meets the user in evening light, not in a notification.
4. **Stamp, then settle.** Confirmations are tactile and two-beat. The user knows the moment it landed.
5. **Restraint is the brand.** Every removed element is a decision. If a screen needs an illustration to feel complete, the screen is wrong.
6. **Sentence case, no exclamations.** The voice rule applies everywhere copy lives — buttons, errors, push, email.
7. **One spring per session.** Reserve the visible bounce for the single celebratory moment (RSVP, check-in). Everywhere else: damped.

---

## 9. Open questions / handoffs

- **`/brand-identity`** — Translate Last-Call Amber into Tailwind tokens (`tailwind.config.ts`); design logo + favicon + OG card in this palette and Gambarino. Decide whether the wordmark uses Gambarino or a hand-set custom letter.
- **`/design-component`** — First three targets:
  - `RSVPButton` — apply RSVP Stamp interaction
  - `CheckInButton` + `LiveActivityCard` — apply Check-in Pulse
  - `MeetupCard` — apply invitation-as-object treatment
- **Accessibility** — Verify `--otg-text-dim` (`#8A8076`) hits 4.5:1 on `--otg-bg-dark`; confirm `--otg-amber` outline-on-dark passes AA-large for interactive states.
- **Re-verify competitor data** with live web access when this brief is opened in a session that has WebSearch / WebFetch.
- **Fontshare licensing review** — confirm the Fontshare Free License text covers OTG's commercial use case (signup, ads, marketing) before locking type files into the repo.
