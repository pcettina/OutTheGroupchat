# Workflow: Design Research

One-time deep dive to establish OTG's visual and tonal foundation. Invoke once. Refresh only when repositioning the product.

**Estimated session length:** 45–90 minutes (agents run in parallel; synthesis + review with user is the longer tail).

---

## Inputs

Optional focus area (default: `all`):

- `competitors` — analyze apps in the same space
- `typography` — font references + concrete recommendations
- `color` — palette exploration with hex codes
- `tone` — copy / voice references
- `motion` — animation + micro-interaction patterns
- `all` (default)

---

## Dependencies

None. This is the first workflow to run.

---

## Output

Populates `docs/design/DESIGN_BRIEF.md` with:

1. **Competitor landscape table** — 5–10 apps with target audience, visual style, typography, color, primary action, what works, what doesn't
2. **Locked color palette** — 3 primary + 2 accent + neutral scale, in hex, with rationale
3. **Type pairing** — display font + body font (+ optional mono/accent), named specifically (not "a sans"), with licensing notes
4. **Tone guide** — do's, don'ts, 10+ sample copy strings on real OTG surfaces (signup CTA, empty-state, RSVP confirmation, error, notification, etc.)
5. **Motion language** — timing + easing values, haptic use guidelines
6. **Visual mood-board** — 3–5 reference style names (e.g., "neo-brutalist night-out," "late-capitalism diner")
7. **5–7 design principles** — short, actionable, project-specific

Also appends entry to `DESIGN_LOG.md`.

---

## Workflow

### Step 1 — Context gathering (5 min)

- Read `outthegroupchat-travel-app/CLAUDE.md` (product positioning, tagline)
- Read `docs/design/README.md` (fallback context)
- Confirm with user:
  - Target demographic (confirm Gen Z / Millennial, NYC)
  - Any existing visual preferences or references they've seen and liked
  - Any brands they *don't* want to look like

### Step 2 — Parallel research agents (10–20 min wall clock)

Deploy 5 agents concurrently (single message, multiple Agent tool calls) so this stays under 20 min. Each agent is self-contained and reports back in under 400 words.

**Agent A — Competitor landscape**
> Research these apps in the "IRL social / meetup / off-your-phone" space: Partiful, Timeleft, Meetup.com, Lu.ma, Eventbrite, Geneva, IRL (closed), Tally, Backlash, Nextdoor, Bumble BFF, Circles, BeReal (for anti-social-media tonal reference), Discord (for Crew-style grouping).
>
> For each app: target audience, visual style in 3 adjectives, typography (named fonts if you can ID), color palette, hero copy, primary CTA, one thing they do well, one thing they do badly.
>
> Output: markdown table + 2-paragraph synthesis of dominant patterns.

**Agent B — Typography trends 2026**
> Research trending display + body font pairings in consumer social apps targeting Gen Z / Millennials in 2025–2026. Surface 5 pairings with:
> - Specific font names (e.g., Gambarino + Inter)
> - Free vs. paid licensing (commercial use OK?)
> - Example brands using them
> - Why it fits / doesn't fit an "off your phone" social app
>
> Recommend one primary pairing + one alternative.

**Agent C — Color psychology + palettes**
> Research color palettes for consumer social apps where the positioning is explicitly *anti*-Instagram / *anti*-doomscroll. Consider:
> - Warm + muted vs. bright + energetic (tradeoffs)
> - Dark-mode-first vs. light-mode-first as default
> - Night-time aesthetic (app is meetup-centric, evening-skewed usage)
> - Palettes that avoid the "tech startup" defaults (navy + lime, purple + pink, etc.)
>
> Output: 2–3 concrete palettes with hex codes + 1-sentence rationale each.

**Agent D — Tone + voice**
> Read copy from Partiful, Timeleft, BeReal, Geneva, Cash App, Tally, and any 2 more social apps you pick. Extract tonal patterns (sentence length, formality, humor use, emoji frequency, sentence-case vs. Title Case).
>
> Recommend a voice for OTG that matches "the social media app that wants to get you off your phone." Produce 10 sample copy strings on these real OTG touchpoints:
> 1. Landing hero
> 2. Signup CTA
> 3. Empty crew state
> 4. Empty meetup feed
> 5. RSVP confirmation toast
> 6. "Starting soon" notification
> 7. Check-in button label
> 8. Error ("something went wrong")
> 9. Legal / terms footer
> 10. Unsubscribe email footer

**Agent E — Motion + micro-interactions**
> Research motion design in leading 2026 consumer social apps. Answer:
> - What Framer Motion / native transition patterns feel "alive" vs. "laggy"?
> - Easing curves in use (`easeOutQuart`, `spring(stiffness, damping)`, etc.)?
> - When to use haptics (`Navigator.vibrate`, iOS Haptic Feedback)?
> - What micro-interactions make RSVP / check-in / "join me" actions feel satisfying?
>
> Output: a motion language spec with specific timing (ms) + easing values + 3 recommended micro-interactions to build.

### Step 3 — Synthesis (15 min, Claude)

- Read all 5 agent reports.
- Resolve conflicts between agents explicitly (don't paper over them).
- Identify the through-line: what tonal / visual identity do these findings point toward?
- Draft `DESIGN_BRIEF.md` with **decisive** recommendations (not "here are options" — specific picks with justification).
- Cite the source agent for each recommendation so provenance is clear.

### Step 4 — Present + confirm (20–40 min, user)

- Show user the brief.
- Walk through each section.
- User: accept / modify / reject each recommendation.
- Iterate until locked.
- Final version committed to `DESIGN_BRIEF.md` on branch.

### Step 5 — Log

Append to `DESIGN_LOG.md`:

```
### YYYY-MM-DD — design-research — foundation

**Context:** Initial design foundation for OTG. No prior brief.
**Decisions:**
- Palette: [hex codes]
- Type pairing: [fonts]
- Tone: [one-line summary]
- Motion language: [one-line summary]
**Alternatives considered + rejected:**
- [each thing we almost picked, and why we didn't]
**Follow-ups:**
- [ ] Apply palette to Tailwind config (/brand-identity)
- [ ] Refactor top 3 components against new brief (/design-component)
**Branch / PR:** design/design-research-YYYY-MM-DD / #XX
```

### Step 6 — PR

Commit `DESIGN_BRIEF.md` + `DESIGN_LOG.md` changes, push branch, open PR titled "Design research: lock foundation brief."

---

## Invocation example

```
Follow the workflow in outthegroupchat-travel-app/docs/design/workflows/design-research.md
Focus: all
```

With a focus limit:

```
Follow the workflow in outthegroupchat-travel-app/docs/design/workflows/design-research.md
Focus: typography, color
```

---

## Failure modes to watch

- **Agent reports disagree** → Don't average; pick one and justify. Hand-waving produces bad briefs.
- **User wants to skip this and jump to components** → Push back gently once; if they still insist, proceed but flag every subsequent design decision as "provisional, pre-brief."
- **Research fields are too broad** → Keep each agent's scope tight. Better 5 focused reports than 5 sprawling ones.
- **Brief becomes a wishlist instead of decisions** → If a section has more than 2 options, it's not finalized. Force a pick.
