# Style Implementation Plan

**Status:** Drafted 2026-04-24 from a fresh codebase audit. Translates the Lane B work (palette + typography + signature interactions on a handful of components) into a project-wide sweep so the whole app reads as **Last Call**, not a half-converted mosaic.

**Goal:** Zero legacy color tokens (`slate`, `emerald`, `amber`, `gray`, `red`, `blue`, etc. with numeric scales) outside the `_archive/` tree and intentional brand-required hex (third-party logos). Every page reads on warm-black with sodium / bourbon / tile / maraschino accents per [`docs/design/DESIGN_BRIEF.md`](./design/DESIGN_BRIEF.md) §3.

---

## Audit baseline (2026-04-24)

| Metric | Count |
|---|---|
| Files with legacy color utilities | **70** |
| Total occurrences | **965** |
| Files using `font-display` directly | 7 (most headings still default to Switzer) |

**Color skew across the 965 occurrences:**

| Token family | Count | % | Most likely role |
|---|---|---|---|
| `slate-*` | 625 | 65% | Text / background / border neutrals |
| `emerald-*` | 173 | 18% | Success / primary CTAs (legacy "warm sunset" pivot leftover) |
| `gray-*` | 76 | 8% | Same as slate; collapse to neutrals |
| `teal-*` | 53 | 5% | CTAs, Crew accents |
| `red-*` | 51 | 5% | Errors, destructive actions |
| `amber-*` | 24 | 2% | Warnings |
| `blue/indigo/purple/pink/green/orange` | 61 combined | 6% | Notification accents, gradients, social badges |

**Heaviest directories:**

| Directory | Occurrences |
|---|---|
| `src/components/ui/` | 125 |
| `src/components/feed/` | 121 |
| `src/components/settings/` | 105 |
| `src/app/auth/` | 90 |
| `src/components/profile/` | 89 |
| `src/app/profile/` | 62 |
| `src/components/social/` | 43 |
| `src/components/onboarding/` | 42 |

**Heaviest individual files:**

| File | Occurrences |
|---|---|
| `src/app/profile/page.tsx` | 50 |
| `src/components/settings/SecuritySettings.tsx` | 48 |
| `src/components/feed/RichFeedItem.tsx` | 42 |
| `src/app/inspiration/page.tsx` | 36 |
| `src/components/profile/BadgeShowcase.tsx` | 31 |
| `src/app/auth/reset-password/confirm/page.tsx` | 29 |
| `src/app/meetups/new/page.tsx` | 28 |
| `src/components/search/SearchFilters.tsx` | 24 |
| `src/components/feed/ShareModal.tsx` | 24 |

---

## Token migration table

This is the canonical mapping every PR in this plan applies. It's deliberately coarse — judgment calls are flagged in the comments column.

### Neutrals (slate / gray / zinc / neutral / stone)

| Legacy | Last Call replacement | Notes |
|---|---|---|
| `bg-white`, `bg-slate-50`, `bg-gray-50` | `bg-otg-bg-light` (light mode) / `bg-otg-maraschino` (dark) | Card surface; defaults to maraschino in dark-first |
| `bg-slate-100`, `bg-slate-200`, `bg-gray-100` | `bg-otg-bg-dark` (subdued surface) or `bg-otg-border/50` (chip backgrounds) | |
| `bg-slate-800`, `bg-slate-900`, `bg-slate-950` | `bg-otg-bg-dark` or `bg-otg-maraschino` | Maraschino for elevated cards on warm-black |
| `text-slate-900`, `text-white` (headings) | `text-otg-text-bright` | |
| `text-slate-700`, `text-slate-600` | `text-otg-text-bright` (high-emphasis body) | |
| `text-slate-500`, `text-slate-400`, `text-gray-500` | `text-otg-text-dim` | |
| `text-slate-300` (icons) | `text-otg-text-dim/60` | |
| `border-slate-200`, `border-slate-700` | `border-otg-border` | |
| `divide-slate-200` | `divide-otg-border` | |

### Role colors

| Legacy | Last Call replacement | Use case |
|---|---|---|
| `bg-emerald-500`, `text-emerald-600`, `from-emerald-*` | `bg-otg-sodium`, `text-otg-sodium`, `from-otg-sodium` | Primary CTAs, success affirmation |
| `bg-emerald-100`, `text-emerald-700` (chips) | `bg-otg-sodium/15 text-otg-sodium ring-1 ring-inset ring-otg-sodium/30` | Sodium chip pattern (matches MeetupCard PR #69) |
| `bg-teal-*`, `text-teal-*` | `bg-otg-tile`, `text-otg-tile` | Crew-accent role; same chip pattern |
| `bg-amber-*`, `text-amber-*` | `bg-otg-bourbon`, `text-otg-bourbon` | Warm secondary, Maybe states, warnings |
| `bg-red-*`, `text-red-*` | `bg-otg-danger`, `text-otg-danger` | Errors, destructive actions |
| `bg-blue-*`, `bg-indigo-*` (notification accents) | Map to nearest role color (tile for Crew-related; sodium for action-related) | Judgment per file |
| `from-emerald-500 to-teal-500` (gradients) | `from-otg-sodium to-otg-bourbon` (warm) or solid `bg-otg-sodium` | Most gradients should collapse to solid fills per brief minimalism |
| `bg-pink-*`, `bg-purple-*`, `bg-rose-*` (badge accents) | Pick role color per context (sodium / bourbon / tile / danger) | These were trip-era novelty colors |

### Typography

| Element | Rule |
|---|---|
| `<h1>`, `<h2>`, `<h3>` | `font-display` (Cabinet Grotesk) — currently only 7 files do this |
| Hero / large numbers | `font-display` |
| Body text, paragraphs | `font-sans` (Switzer, default) — no class needed |
| Editorial accents (italics) | `font-serif italic` (Instrument Serif Italic) |
| Buttons | `font-sans` Medium |

---

## Phased rollout

Six PRs, ordered by *impact-per-line-changed*. UI primitives first (every page consumes them), then high-traffic surfaces, then long-tail.

### Phase S1 — UI primitives (`src/components/ui/`)

**Why first:** 125 occurrences, but every other component composes these. Touching these once wins compounding benefit.

**Files** (top): `FloatingShareButton.tsx` (18), `Modal.tsx`, `Button.tsx`, `Input.tsx`, `Card.tsx`, `Toast.tsx`, `Skeleton.tsx`, etc.

**Per-file work:** Apply token migration table. No structural changes. Add `font-display` to any heading slots inside primitives.

**Ship criteria:** Zero non-`otg-*` color utilities in `src/components/ui/`. Tsc + lint + tests all green. Visual check: every page that uses these primitives looks like Last Call without per-page edits.

**Estimated PR count:** 1.

### Phase S2 — Auth surface (`src/app/auth/`)

**Why second:** 90 occurrences, *first impression* — every new user lands here. Public-facing.

**Files:** `signin/page.tsx` (20), `signup/page.tsx` (21), `reset-password/page.tsx` (20), `reset-password/confirm/page.tsx` (29), email verify pages.

**Per-file work:** Token migration. Hero/title slots get `font-display`. Submit buttons → sodium. Input borders → `otg-border`, focus → `otg-sodium`. Error toasts → `otg-danger`.

**Ship criteria:** Auth flow renders consistently dark/sodium across all 4–5 pages. No slate or emerald remaining.

**Estimated PR count:** 1.

### Phase S3 — Settings surface (`src/components/settings/` + `src/app/settings/`)

**Why third:** 105+ occurrences across deep auth'd pages. SecuritySettings (48) is the densest single file.

**Files:** `SecuritySettings.tsx`, `ProfileSettings.tsx` (21), `PrivacySettings.tsx` (19), `NotificationSettings.tsx`, related pages.

**Per-file work:** Token migration. *Special case:* SecuritySettings has Google logo SVG with brand-required hex (`#4285F4` etc.) — those stay literal per Google brand guidelines. Add a `// Google brand colors — required, do not retint` comment.

**Ship criteria:** Settings reads as Last Call; Google brand colors preserved with comment.

**Estimated PR count:** 1.

### Phase S4 — Profile surface (`src/app/profile/` + `src/components/profile/`)

**Why fourth:** 151 combined occurrences (50+62+89). Profile is high-frequency for any returning user.

**Files:** `app/profile/page.tsx` (50), `components/profile/BadgeShowcase.tsx` (31), `PreferencesCard.tsx` (21), header + crew sections + check-in section + badges.

**Per-file work:** Token migration. Avatar gradients (sodium-bourbon `.avatar` global utility) only on prominent placements; muted neutrals for inline placeholders (per the MeetupCard pattern).

**Ship criteria:** Profile reads cohesively; badges, crew section, check-ins all on-palette.

**Estimated PR count:** 1.

### Phase S5 — Feed surface (`src/components/feed/` + `src/app/feed/`)

**Why fifth:** 146 combined occurrences (121+25). RichFeedItem (42) is the densest. Feed is daily-active surface.

**Files:** `feed/RichFeedItem.tsx`, `FeedItem.tsx` (20), `CommentThread.tsx` (21), `ShareModal.tsx` (24), `app/feed/page.tsx`.

**Per-file work:** Token migration. Engagement bar buttons → sodium for affirmative, otg-text-dim for muted. Comment threads inherit settings card pattern.

**Special note:** `RichFeedItem.tsx` may be in flight from earlier nightly PRs (#56/#59 mentioned in memory); coordinate with whoever owns that branch before opening this PR. If the file is restructured upstream, rebase this PR's changes onto the new structure.

**Ship criteria:** Feed reads as warm-black with sodium engagement signals.

**Estimated PR count:** 1.

### Phase S6 — Long tail (everything else)

**Why last:** 200+ occurrences scattered across smaller directories. Lower-frequency surfaces: `social/`, `onboarding/`, `search/`, `inspiration/`, `meetups/new/`, `crew/`, `notifications/`, `checkins/`, `discover/`.

**Per-file work:** Token migration applied uniformly. Inspiration page (36) and meetups/new (28) are the densest in this group.

**Ship criteria:** Final grep confirms zero non-`otg-*` color utilities outside `_archive/` and outside flagged exceptions (Google brand SVG, email-template inline HTML, `global-error.tsx` static fallback).

**Estimated PR count:** 1–2 (may split if the long tail proves unwieldy in review).

---

## Special cases (do NOT migrate)

These stay on legacy or hardcoded colors deliberately:

1. **`src/_archive/`** — entire tree excluded from build (per `tsconfig.json`); leave untouched.
2. **`src/app/global-error.tsx`** — runs *outside* the App Router shell. Cannot access Tailwind tokens reliably; keeps inline `#111827` / `#6b7280` for guaranteed render even when CSS bundle fails to load. Add a comment marking this as intentional.
3. **`src/components/settings/SecuritySettings.tsx` Google logo** — brand-required hex (`#4285F4`, `#34A853`, `#FBBC05`, `#EA4335`). Add `// Google brand SVG — third-party brand requirement, do not retint`.
4. **Email templates** (`src/lib/email.ts`, `email-meetup.ts`, `email-crew.ts`, `auth/reset-password/route.ts`) — system-font + neutral-hex by design for cross-client deliverability. Migrating them to OTG palette would risk rendering inconsistency in Outlook / older Gmail. Email visual identity is a separate v1.5 design pass with its own constraints.

---

## Process per PR

Same shape every time:

1. **Branch:** `design/style-{phase}-2026-04-24` (or whichever date applies).
2. **Apply token migration table** to every file in scope. Use multi-cursor or `sed` carefully — most replacements are one-to-one (e.g. `text-slate-500` → `text-otg-text-dim`).
3. **Add `font-display` to heading slots** while in the file.
4. **Run** `npx tsc --noEmit && npm run lint && npm test` — should be 0/0/all-pass.
5. **Run** `npm run build` — verifies no Tailwind purge regressions.
6. **Visual smoke:** preview deploy, click through the affected pages.
7. **Final grep** for the file's directory: `grep -rE "(slate|emerald|gray|teal|red|amber|blue|indigo|purple|pink|rose|orange|green|yellow|cyan|sky|violet|fuchsia|lime|zinc|neutral|stone)-(50-950)"` should return zero matches outside the documented exceptions.

---

## Cross-cutting

- **Tests are unaffected.** Token migrations don't touch logic.
- **Storybook (if added later):** lock the new palette as default tokens so future component additions inherit Last Call automatically.
- **Lighthouse / WCAG:** sodium #FF6B4A on `otg-bg-dark` #15110E passes AA contrast for normal text (>4.5:1); verify per page.
- **Reduced-motion / dark-mode toggle:** dark mode is the canonical state per Lane B. If a light-mode toggle ships in v1.5, that's a separate palette pass (use the `light` color values from `brand/palette.json`).

---

## Open questions

1. **`RichFeedItem` ownership** — coordinate with nightly PR pipeline before Phase S5 to avoid merge conflicts on a file that's actively being refactored elsewhere.
2. **Light-mode palette** — full plan or defer to v1.5? Current pages assume `dark` class on `<html>`. Some legacy components have `dark:` prefix variants; should we drop those entirely or leave for the eventual light-mode pass?
3. **Email template visual refresh** — when does that happen and who owns it (designer vs. dev)?

---

**Last updated:** 2026-04-24
**Source:** Audit-driven plan derived from 965-occurrence sweep across 70 files.
