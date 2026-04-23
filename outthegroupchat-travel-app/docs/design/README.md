# Design Workflows

Reusable, independent-session design workflows for OutTheGroupchat.

## Why this exists

Design work has a fundamentally different cadence than the nightly feature pipeline. The nightly is fire-and-forget: agents generate features, tests, and refactors autonomously. Design is conversational and iterative — it needs human judgment on every decision.

These workflows let you spin up a fresh Claude session, point it at a playbook, and get consistent, scoped design output without re-explaining context.

## Available workflows

| Workflow | When to invoke | Primary output |
|----------|----------------|----------------|
| [`workflows/design-research.md`](workflows/design-research.md) | Once, first. Establishes the visual + tonal foundation. | `DESIGN_BRIEF.md` populated |
| [`workflows/design-component.md`](workflows/design-component.md) | Any time we want to polish a specific component or page | Component refactor on a `design/<slug>-<date>` branch + `DESIGN_LOG.md` entry |
| [`workflows/brand-identity.md`](workflows/brand-identity.md) | Once research is locked | Logo, icon, OG image, favicon, palette, email graphics in `brand/` |
| [`workflows/marketing-deck.md`](workflows/marketing-deck.md) | After brand identity exists | Pitch deck, landing page, promo video, or press kit in `marketing/` |

## How to run a workflow in a fresh session

Start a new Claude Code conversation and paste:

```
Follow the workflow in outthegroupchat-travel-app/docs/design/workflows/<name>.md
```

Optionally add parameters inline (each workflow documents its inputs).

You can also register a slash-command wrapper locally at `.claude/skills/<name>/SKILL.md` that points to the playbook (gitignored — local-only, won't sync to the repo).

## Recommended ordering

1. **Research** (`/design-research`) — one-time, populates `DESIGN_BRIEF.md`.
2. **Brand identity** (`/brand-identity`) — logo, icon, palette, OG image. Depends on (1).
3. **Components** (`/design-component`) — many passes, one component at a time. Depends on (1), benefits from (2).
4. **Marketing** (`/marketing-deck`) — pitch deck, landing page, promo. Depends on (1) + (2).

Don't skip step 1 — every later workflow references `DESIGN_BRIEF.md`. Without it, design decisions drift and become inconsistent.

## Design log

Every session must append an entry to [`DESIGN_LOG.md`](DESIGN_LOG.md). This is our running record — what we decided, why, what we rejected, what's still open.

## Files in this directory

```
docs/design/
├── README.md            (this file)
├── DESIGN_BRIEF.md      (populated by /design-research)
├── DESIGN_LOG.md        (running history, appended every session)
├── workflows/
│   ├── design-research.md
│   ├── design-component.md
│   ├── brand-identity.md
│   └── marketing-deck.md
└── screenshots/         (before/after captures from component sessions)
```

## Fallback context (until DESIGN_BRIEF is populated)

- **Positioning:** "The social media app that wants to get you off your phone"
- **Core actions:** Check in → RSVP → invite Crew → meet up IRL
- **Target:** Gen Z / Millennial, NYC launch (soft focus initially)
- **Tone (assumed):** Irreverent but earnest, low on hype, high on specificity
- **Avoid:** Generic "AI aesthetic," Material Design defaults, Instagram cosplay, anything that looks like another social app's leftovers
