# Workflow: Component / Page Design Pass

Scoped 1:1 design pass on a specific OTG component or page. Iterative. User makes every important choice.

**Estimated session length:** 30–90 min depending on scope.

---

## Inputs

**Required:**
- `target` — component name (e.g., `CheckInButton`) or page path (e.g., `/meetups/[id]`)

**Optional:**
- `concern` — specific issue to address ("duration chips feel cramped on mobile")
- `feel` — desired direction ("more playful," "more minimal," "more confident")
- `scope` — `visual` | `interaction` | `copy` | `accessibility` | `all` (default)

---

## Dependencies

- `DESIGN_BRIEF.md` populated (run `/design-research` first if not).
  - If the brief is missing: warn user, suggest running research first. If they insist, proceed but flag decisions as "provisional."

---

## Output

- Component / page refactor on branch `design/<slug>-<YYYY-MM-DD>` (e.g., `design/checkin-button-2026-04-22`)
- Before / after screenshot pair in `docs/design/screenshots/<slug>-<date>/` (if Preview MCP available)
- Entry in `DESIGN_LOG.md`
- PR against `main`

---

## Workflow

### Step 1 — Context load (3–5 min)

- Read the target file(s) and neighboring components for consistency context.
  - Example: if target is `MeetupCard`, also skim `CheckInCard`, `LiveActivityCard` to understand sibling patterns.
- Read `DESIGN_BRIEF.md` — lock in the palette / type / tone assumptions for this pass.
- Read the last 3 `DESIGN_LOG.md` entries to stay consistent with recent decisions.
- If a Vercel preview is live and Preview MCP is available: screenshot the target in current state. Save to `docs/design/screenshots/<slug>-<date>/before.png`.
- If no preview: render the component mentally from source. Describe what a user sees.

### Step 2 — Critique (10 min)

Surface issues across 4 dimensions. Prioritize by severity.

**Visual**
- Spacing, hierarchy, alignment
- Color choices vs. the brief's palette (any violations?)
- Typography vs. the brief's pairing (weights, sizes, line-heights)
- Density (too cluttered? too sparse?)

**Interaction**
- Every state covered? (default, hover, focus, active, disabled, loading, error, success)
- Affordances clear? (does the user know this is tappable / draggable / expandable?)
- Error recovery (if submit fails, can the user retry without losing input?)

**Copy**
- Tone match with the brief
- Length (every word earning its place?)
- Sentence-case vs. Title Case consistency

**Accessibility**
- Contrast ratios (WCAG AA minimum)
- Focus rings visible + logical tab order
- ARIA labels on non-obvious controls
- Keyboard navigation works without a mouse

Report format: bulleted list, one bullet per issue, tagged by dimension.

### Step 3 — Propose 2–3 directions (5 min)

Not one — user picks. Each direction:

- One-sentence description
- Key trade-off ("Direction A is tighter but less playful; Direction B is more expressive but may not fit on narrow phones")
- Rough sketch (ASCII layout, CSS snippet, or described visual)
- Which critique items it addresses

### Step 4 — Wait for user decision

**Do not implement** until user picks or modifies. Never assume. If user is ambiguous ("I like A but…"), ask clarifying questions before coding.

### Step 5 — Implement (15–45 min)

- Branch: `design/<slug>-<YYYY-MM-DD>`
- Implement the chosen direction.
- Keep changes scoped to the target surface — do not ripple to neighbors unless the user explicitly asked for it.
- Follow CLAUDE.md conventions (TypeScript strict, no `any`, no `console.log`, Tailwind classes consistent with existing patterns).
- Run `npx tsc --noEmit` — must be clean.
- Run tests for the target surface — must be green.
- Run `npm run lint` — must be clean.
- If Preview MCP: capture after screenshot to `docs/design/screenshots/<slug>-<date>/after.png`.

### Step 6 — Verify (5 min)

- Full test suite green (`npm test`)
- TSC + lint clean
- Before / after screenshots exist (if Preview available)

### Step 7 — Log (3 min)

Append to `DESIGN_LOG.md` (at the top, newest first):

```
### YYYY-MM-DD — design-component — <target>

**Context:** <one sentence on what prompted this pass>
**Decisions:**
- <the direction chosen + key implementation choices>
**Alternatives considered + rejected:**
- Direction B: <one-sentence why not>
- Direction C: <one-sentence why not>
**Follow-ups:**
- [ ] <anything we noticed but deferred>
**Before/after:** docs/design/screenshots/<slug>-<date>/
**Branch/PR:** design/<slug>-<date> / #XX
```

### Step 8 — PR (2 min)

- Commit.
- Push `design/<slug>-<date>`.
- Open PR titled `design(<target>): <one-line summary>`.
- PR body: copy the DESIGN_LOG entry.

---

## Invocation example

```
Follow the workflow in outthegroupchat-travel-app/docs/design/workflows/design-component.md
Target: CheckInButton
Concern: duration chips feel cramped on mobile (< 375px)
Scope: visual + interaction
```

Minimal version:

```
Follow the workflow in outthegroupchat-travel-app/docs/design/workflows/design-component.md
Target: MeetupCard
```

---

## Recommended first-pass targets (launch-critical)

In rough priority order:

1. `CheckInButton` — core product action, duration picker is new UX
2. `MeetupCard` — appears in 3 list surfaces, sets the tone
3. `RichFeedItem` (5 variants) — visual consistency across card types
4. `Navigation` — mobile responsiveness audit
5. Empty states — no crew, no meetups, no check-ins (first-impression surfaces)
6. `/meetups/new` `CreateMeetupModal` — complex form, high drop-off risk

---

## Failure modes to watch

- **Designer drift** — if the chosen direction contradicts `DESIGN_BRIEF.md`, either (a) update the brief in a separate PR first, or (b) pick a compliant direction. Never silently deviate.
- **Scope creep** — if refactoring the target pulls in neighboring components, stop. Open a separate session for each.
- **Test discipline** — if tests break after refactor, fix the implementation (CLAUDE.md rule). Never relax assertions to make failing tests pass.
- **No Preview MCP** — don't pretend you saw the rendered output. Say "working from source, couldn't verify visually" in the log.
