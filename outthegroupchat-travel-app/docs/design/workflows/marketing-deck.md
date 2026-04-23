# Workflow: Marketing Deck / Assets

Produce investor deck, landing page, promo video, or press kit. External-facing.

**Estimated session length:** varies wildly by asset — pitch deck 1–3 hrs; landing page 2–4 hrs; promo video 1–2 hrs; press kit 30–60 min.

---

## Inputs

**Required:**
- `asset` — one of: `pitch-deck`, `landing-page`, `promo-video`, `press-kit`, `all`

**Optional:**
- `audience` — `investors` (default for pitch-deck) / `early-users` / `press` / `partners`
- `length` — for pitch-deck: number of slides (10 / 12 / 15, default 12)
- `round-stage` — for pitch-deck: `pre-seed` / `seed` / `series-a` (default `pre-seed`)

---

## Dependencies

- `DESIGN_BRIEF.md` populated
- Brand identity complete (`brand/` directory populated — see `workflows/brand-identity.md`)

---

## Output

Depends on asset type.

### `pitch-deck`

- `marketing/pitch-deck.pdf` (final export)
- `marketing/pitch-deck-notes.md` (speaker notes, one paragraph per slide)
- `marketing/pitch-deck-slides/*.html` (source slides)

### `landing-page`

Either a polish pass on the existing `/about` page OR a dedicated marketing site under `marketing/landing/` (separate Next.js sub-app or static export).

- Above-fold hero (tagline + single CTA)
- 3 feature sections ("How it works" in 3 steps is usually the shape)
- Social proof block (beta-user testimonials, founder quote, press logos)
- Footer + legal links

### `promo-video`

- `marketing/promo/` — Remotion composition
- Exported `.mp4` (vertical 9:16 for Instagram / TikTok; optional horizontal 16:9 for landing-page embed)
- 15–30 sec length

### `press-kit`

- `marketing/press-kit.pdf` — founder bio, logos (links to `brand/logo/`), app screenshots, tagline, contact
- `marketing/press-kit.zip` — all assets bundled for journalists to download

---

## Workflow — Pitch deck path (most common)

### Step 1 — Gather inputs (15 min)

- Read `CLAUDE.md` for positioning + tagline
- Read `DESIGN_BRIEF.md` for visual style
- Read current traction numbers (users, meetups created, retention — if any exist)
- Confirm with user:
  - Audience (investors / partners)
  - Round stage (pre-seed / seed)
  - Length (10 / 12 / 15)
  - Competitors to mention (confirm the list from the brief)
  - The Ask (raise amount, use of funds)

### Step 2 — Invoke `pitch-deck` skill (30–60 min)

The `pitch-deck` skill handles:

- Parallel market-research agents (TAM / SAM / SOM, competitor deep-dives, market trends)
- Slide scaffolding (standard investor arc: Problem → Solution → Product → Market → Traction → Competition → Business Model → Team → Ask → Vision)
- HTML slide generation with brutalist or futuralist styling (pick one based on the brief)
- Playwright-based PDF export

Let the skill run. When it surfaces design / narrative choices, bring them to the user.

### Step 3 — Review draft (20–40 min)

- Walk through every slide with the user.
- Ask on each: "Is this the sharpest version of this point?"
- Iterate on weak slides (usually Problem, Traction, Team, Ask — these are where decks live or die).

### Step 4 — Visual pass

- Confirm each slide uses brand palette + type from `DESIGN_BRIEF.md`.
- Logo / wordmark on cover + closing.
- Consistent slide numbering + footer.

### Step 5 — Final export

- Playwright renders to `marketing/pitch-deck.pdf`.
- Verify PDF opens correctly in Preview / Chrome / Keynote import.
- Generate speaker notes file.

### Step 6 — Log

```
### YYYY-MM-DD — marketing-deck — pitch-deck

**Context:** <who is the deck for, what's the ask>
**Decisions:**
- Structure: <slide arc>
- Visual style: <brutalist / futuralist / other>
- Length: <N> slides
**Alternatives considered + rejected:**
- <rejected narratives or slide orderings>
**Follow-ups:**
- [ ] Record voiceover Loom (owner: Patrick)
- [ ] Send to 3 practice audiences before live investor meetings
**Branch/PR:** design/marketing-pitch-deck-<date> / #XX
```

### Step 7 — PR

Commit `marketing/` assets + log update. PR for tracking, not for production deploy.

---

## Workflow — Landing page path (abbreviated)

1. Read brief + existing `/about` page.
2. Decide: polish `/about` (faster) vs. dedicated site (cleaner boundary).
3. Wireframe hero + 3-step + social-proof + footer.
4. Implement + run build + deploy preview.
5. Iterate copy with user.
6. Log + PR.

Copy tone MUST follow the DESIGN_BRIEF tonal guide. If the brief says "irreverent but earnest," reject any copy that drifts into corporate-speak or hype.

---

## Workflow — Promo video path (abbreviated)

1. Storyboard: 3–5 scenes showing the core value prop (sign up → see crew → meet IRL, usually).
2. Invoke `remotion-ads` skill — Remotion composition with brand colors + type.
3. Generate multiple cuts (15 sec + 30 sec + 9:16 vs 16:9).
4. Export to `.mp4`.
5. Log + PR.

---

## Workflow — Press kit path (abbreviated)

1. Pull founder bio + headshot.
2. Bundle logos, app screenshots (App Store style, from `brand/`), one-line + one-paragraph pitch, contact email.
3. Generate PDF via `anthropic-skills:pdf`.
4. Zip everything for journalist-friendly download.
5. Log + PR.

---

## Invocation example

```
Follow the workflow in outthegroupchat-travel-app/docs/design/workflows/marketing-deck.md
Asset: pitch-deck
Audience: pre-seed investors
Length: 12
Round-stage: pre-seed
```

```
Follow the workflow in outthegroupchat-travel-app/docs/design/workflows/marketing-deck.md
Asset: promo-video
```

---

## Failure modes to watch

- **Building the deck before having real traction numbers** → reserve this for when there's signal. A deck with "0 beta users" and no waitlist hurts fundraising. If pre-traction, do the landing page + press kit first.
- **Copy drift from brand voice** → every external-facing sentence should pass the tone rubric in the brief. If it doesn't, rewrite.
- **Skipping the practice-audience step** → decks always feel tighter than they are. Get 3 non-investor people to read it before shipping.
- **Promo video that's just UI screen recording** → needs a story arc (before / after / resolution). Pure UI demos die on social.
