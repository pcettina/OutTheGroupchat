# Workflow: Brand Identity

Produce brand assets (logo, icon, OG image, favicon, palette, email graphics). Static, one-time deliverables.

**Estimated session length:** 60–120 min depending on scope.

---

## Inputs

**Required:**
- `artifact` — one of: `logo`, `icon`, `favicon`, `og-image`, `palette`, `email-headers`, `all`

**Optional:**
- `references` — styles the user has seen and liked (URLs, screenshots, brand names)
- `constraints` — must-haves or must-avoids from the user

---

## Dependencies

- `DESIGN_BRIEF.md` populated. Brand identity without a brief is guessing.
- (Optional but recommended) one `/design-component` pass done first to validate the brief in practice.

---

## Output

Static assets under `outthegroupchat-travel-app/brand/`:

```
brand/
├── logo/
│   ├── logo-horizontal.svg
│   ├── logo-horizontal-light.svg
│   ├── logo-horizontal-dark.svg
│   ├── logo-stacked.svg
│   └── logo-mark.svg           (just the symbol, no wordmark)
├── icon/
│   ├── icon-1024.png            (App Store, Play Store)
│   ├── icon-512.png
│   ├── icon-256.png
│   ├── icon-180.png             (iOS home screen)
│   ├── icon-120.png
│   └── icon-60.png
├── favicon/
│   ├── favicon.ico              (multi-size)
│   ├── favicon-16.png
│   └── favicon-32.png
├── og-image.png                 (1200×630, Twitter / iMessage / Slack preview)
├── palette.json                 (hex values + Tailwind config snippet)
└── email-headers/
    ├── invite.png               (600×160, Resend meetup-invite template)
    ├── rsvp.png                 (600×160, RSVP confirmation)
    └── reminder.png             (600×160, starting-soon)
```

Code integrations:

- `src/app/icon.tsx` updated to render the new mark
- `public/favicon.ico` replaced
- `src/app/layout.tsx` metadata.openGraph.images → new OG image
- `tailwind.config.ts` palette extended with brand tokens
- `src/lib/email.ts` + children — email templates reference new header assets

`DESIGN_LOG.md` entry appended.

---

## Workflow

### Step 1 — Load brief (5 min)

- Read `DESIGN_BRIEF.md`. Confirm palette + type direction is locked.
- If palette is unspecified: stop and run `/design-research` first.
- Re-read OTG positioning (`CLAUDE.md`).

### Step 2 — Logo iterations (30 min)

Use `anthropic-skills:canvas-design` (PNG / PDF output via design philosophy) to generate 5 logo concepts. Each concept has:

- **A distinct core idea** (avoid "5 variations of the same shape")
- Wordmark rendering of "OutTheGroupchat"
- Mark-only version (the symbol alone)
- Rationale paragraph: what makes it fit OTG specifically

Present all 5 as a grid. User picks one direction (or selects elements from multiple to combine).

Refine 1–2 rounds until locked.

### Step 3 — Derive assets from locked logo (15 min)

Once the logo is locked:

- **Icon** — square crop or simplified mark only. Test at 60px (worst-case rendering).
- **Favicon** — further simplified; consider a 1-letter monogram if the mark doesn't scale.
- **OG image** — composition with logo + tagline + a visual hook (meetup scene, typographic flourish, brand pattern). Must read at 600×315 (half-size preview).
- **Email headers** — thin horizontal banners. Wordmark + one illustrative element. Variation per template (invite / RSVP / reminder) via color accent, not layout change.

Use `anthropic-skills:algorithmic-art` if we want a generative pattern motif (p5.js with seeded randomness) — good for email header backgrounds or empty-state illustrations.

### Step 4 — Palette lock (10 min)

Extract palette from the locked design. Write `brand/palette.json`:

```json
{
  "version": "1.0",
  "primary": { "50": "#...", "100": "#...", "500": "#...", "900": "#..." },
  "accent":  { "400": "#...", "600": "#..." },
  "neutral": { "50": "#...", "100": "#...", "400": "#...", "700": "#...", "900": "#..." },
  "semantic": { "success": "#...", "warning": "#...", "danger": "#..." }
}
```

Also emit the Tailwind config snippet to paste into `tailwind.config.ts`.

### Step 5 — Code integration (20 min)

Apply each asset to the codebase:

- `public/favicon.ico` — replace
- `src/app/icon.tsx` — render the new mark via `ImageResponse` or swap to a static import
- `src/app/layout.tsx` metadata:
  ```ts
  openGraph: {
    images: [{ url: '/brand/og-image.png', width: 1200, height: 630 }],
  },
  ```
- `tailwind.config.ts` — extend palette tokens
- `src/lib/email.ts` + `email-*.ts` children — reference the new header images (hosted at `https://outthegroupchat.org/brand/email-headers/...` once assets are live)
- Audit `src/components/` for hardcoded brand colors (hex literals, `bg-indigo-*` / `text-blue-*` etc.) — replace with the new palette tokens

Run `npm run build` + `npm run lint` + `npx tsc --noEmit`. Must be clean.

### Step 6 — Log (5 min)

Append to `DESIGN_LOG.md`:

```
### YYYY-MM-DD — brand-identity — <artifact-scope>

**Context:** <one sentence on why this pass>
**Decisions:**
- Logo direction: <one-sentence description>
- Palette: <hex codes>
- Type integration: <fonts loaded, how>
**Alternatives considered + rejected:**
- <each rejected logo direction, one line>
**Follow-ups:**
- [ ] Apply palette to remaining hardcoded-color components (catalog in this entry)
- [ ] Wire new OG image once deployed
**Branch/PR:** design/brand-identity-<date> / #XX
```

### Step 7 — PR

- Commit assets + code changes.
- Push `design/brand-identity-<YYYY-MM-DD>`.
- PR title: `design(brand): <one-line summary>`.
- PR body: DESIGN_LOG entry + screenshot of logo + OG image preview.

---

## Invocation example

```
Follow the workflow in outthegroupchat-travel-app/docs/design/workflows/brand-identity.md
Artifact: all
```

Scoped:

```
Follow the workflow in outthegroupchat-travel-app/docs/design/workflows/brand-identity.md
Artifact: og-image
References: Partiful's minimalist event-card aesthetic
```

---

## Failure modes to watch

- **Running this without `DESIGN_BRIEF.md` locked** → the logo will be a guess. Refuse and run research first.
- **5 logo concepts that are minor variations** → force genuinely distinct directions (different symbol systems, different typographic personalities, different color moods). One should feel uncomfortable — that's how you know the range is wide enough.
- **Over-polishing the first round** → it's a concept round, not a final. User's taste resolves fastest when shown range.
- **Skipping the code integration step** → assets on disk that aren't wired are worthless. Don't call this done until `favicon.ico`, `icon.tsx`, `layout.tsx`, and `tailwind.config.ts` are updated.
