# brand/ — Future Work

Deferred brand-identity items. Keep entries dated. Remove when shipped.

---

## Marketing animation — "Leading-arm avatars" (logged 2026-04-23)

**Concept.** Animate sequences that originate from the tip of the Hybrid Exit logo's long bottom arm — the leading edge already extending past the phone silhouette. The rounded cap morphs/transforms into avatar silhouettes performing IRL activities.

**Activity set (initial).**
- Running
- Biking
- At a bar (glass in hand)
- Playing golf (swing)
- Dancing (loose/warehouse)
- Walking with coffee
- (Expandable per campaign context)

**Why this encodes the brand.** The logo's geometry already says *you escape the phone* — the rounded cap is the moment of exit. Animation completes the story by showing **what you escape to**. Directly encodes OTG's core thesis ("the social media app that wants to get you off your phone") as motion, not just as static mark.

**Target surfaces.**
- Hero video on landing page (single loop, ~2s)
- Social-ad loops (Instagram Reels / TikTok vertical, 5–10s with multiple activity cycles)
- Email header motion variants (per meetup type — bar activity for nightlife invites, running for morning meetups)
- App onboarding welcome screens
- Launch campaign key visuals

**Technical notes.**
- Format: Lottie (via After Effects or Rive) for lightweight web delivery; `<video>` MP4/WebM fallback for email where Lottie is unsupported
- Keep avatar silhouettes monochrome sodium `#FF6B4A` to stay on-palette
- Animation duration 1.5–3s per activity cycle; gentle loop
- Respect `prefers-reduced-motion` — fallback to static Exit mark
- Reference motion tokens from [`DESIGN_BRIEF.md §6`](../docs/design/DESIGN_BRIEF.md):
  - `snappySpring` for the arm-to-avatar morph
  - `easeOutQuart` for activity motion entrances
  - stay below 3s total per loop to respect Apple HIG "brevity and precision"

**Dependencies / blocked until.**
- Core brand-identity PR ships (this workflow)
- Phase 4 design-component passes establish avatar illustration style (silhouette treatment, line weight, proportions)
- Motion SDK decision (Lottie vs Rive) — probably Lottie given existing Framer Motion use in the app

**Owner.** TBD — assign when marketing calendar kicks off post-launch.
