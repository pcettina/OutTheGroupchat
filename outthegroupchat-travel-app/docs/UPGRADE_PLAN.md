# Package Upgrade Plan

**Last Updated:** 2026-05-19
**Status:** Planning (no major upgrades shipped yet — still tracking)

This document tracks major version upgrades identified for the OutTheGroupchat stack. Upgrades are ordered by priority and dependency chain. Versions reflect the current `outthegroupchat-travel-app/package.json` on `main`.

---

## Recent Changes (not upgrade work — context)

- **2026-04-23 — AI surface removed (PR #65, `ops/kill-all-ai-2026-04-23`).** The previous "Vercel AI SDK + provider packages" upgrade entry is **obsolete**. There are no `@ai-sdk/*`, `ai`, `openai`, or `@anthropic-ai/sdk` packages in `package.json` anymore, and no `/api/ai/*` routes, `src/lib/ai`, or `src/components/ai`. Do not re-add an AI upgrade row without explicit founder direction.
- **V1 Phase 4 (PR #86 / #87) — heatmap stack added.** `maplibre-gl ^4.7.1` is now a runtime dependency, paired with the free OpenFreeMap vector tile service (no SDK package — used via raw URL in the map style). No upgrade is currently planned; v5 of maplibre-gl is recent but Phase 4 ships on v4.x and is stable.
- **Sentry, Pusher, Prisma, Next, React all unchanged on `main`** since the last revision of this doc — no major version PRs have landed.

---

## Priority Order

1. React + Next.js (upgrade together — tightly coupled)
2. Zod (schema validation used across all API routes)
3. Prisma (ORM core — affects all DB access)
4. TypeScript (compiler — affects all files)
5. Tailwind CSS (styling — affects all components)
6. ESLint + hookform/resolvers (tooling — lower risk)

> The former position 2 ("Vercel AI SDK + provider packages") was removed 2026-04-23 when all AI functionality was deleted.

---

## Upgrade Entries

### 1. React + React DOM + Next.js

| Field | Value |
|-------|-------|
| **Current** | react/react-dom 18.2.0, next 14.1.3 |
| **Latest** | react/react-dom 19.x, next 16.x |
| **Priority** | High |
| **Status** | Not started |

**Key breaking changes to watch for:**
- React 19: `forwardRef` is deprecated — refs are now passed as props. Remove all `forwardRef` wrappers and accept `ref` in props directly.
- React 19: `use()` hook is stable. Context reading via `use(Context)` replaces `useContext` in some patterns.
- React 19: `ReactDOM.render` and `createRoot` API differences — confirm no legacy render calls.
- Next.js 15+: `params` and `searchParams` in page/layout components are now Promises — must be `await`ed. This affects all route segments using `params.tripId`, `params.userId`, `params.meetupId`, `params.crewId`, etc.
- Next.js 15+: `cookies()` and `headers()` from `next/headers` are now async.
- Next.js 16: Turbopack is default dev bundler. Run `next dev --turbo` to test early.
- `next/font` and image optimization APIs may have changes — audit `next/image` usage.

**Recommended approach:**
1. Upgrade Next.js 14 → 15 first (separate PR), fix `params`/`searchParams` async patterns across all page components. Pay extra attention to the new V1 routes: `/profile/[userId]`, `/meetups/[id]`, `/crew/[crewId]`, `/checkins`.
2. Then upgrade Next.js 15 → 16 (separate PR), address any new breaking changes.
3. Upgrade React 18 → 19 alongside Next.js 16 (they are compatible at that version).
4. Run `npx @next/codemod` migration tools where available.
5. Full test suite + typecheck after each step.

---

### 2. Zod

| Field | Value |
|-------|-------|
| **Current** | 3.25.0 |
| **Latest** | 4.x |
| **Priority** | High |
| **Status** | Not started |

**Key breaking changes to watch for:**
- Zod v4 has a rewritten core with different internal types — some advanced type utilities (`z.infer`, `z.input`, `z.output`) may have subtle changes.
- `z.string().email()` and other string validators may have stricter behavior.
- `.safeParse()` error shape may differ — audit any code reading `error.issues` directly.
- Custom error maps (`z.setErrorMap`) API may have changed.
- Performance is significantly improved — no behavior regressions expected for standard usage.

**Recommended approach:**
1. Upgrade in a single PR. Run `tsc --noEmit` immediately after.
2. Audit all ~46 live API routes that use Zod schemas for parse/safeParse error handling (crew, meetups, checkins, feed, notifications, trips legacy, etc.).
3. Test edge cases: optional transforms, enum validation, coerce patterns (known Zod v3 quirks that v4 may handle differently). The `CheckInVisibility` and search `type` enums are good first targets.

---

### 3. Prisma + @prisma/client

| Field | Value |
|-------|-------|
| **Current** | 5.22.0 |
| **Latest** | 7.x |
| **Priority** | Medium |
| **Status** | Not started — Neon branch-per-PR workflow already running migrations cleanly on v5, so no forced upgrade pressure |

**Key breaking changes to watch for:**
- Prisma 6+: `PrismaClient` instantiation options and log levels may differ.
- Driver adapters and edge runtime support changes — verify Neon adapter compatibility (project migrated Supabase → Neon 2026-04-17).
- `prisma.$queryRaw` template literal API: verify tag function behavior is unchanged.
- Generated client types may change — particularly around relation includes and select return types.
- `prisma generate` output format changes may require test mock updates (`src/__tests__/setup.ts` mock object structure — specifically the Crew, CrewMember, Meetup, Checkin, MeetupInvite, Contribution delegate mocks).

**Recommended approach:**
1. Run `npx prisma migrate dev` after upgrade to confirm schema compatibility against the current 30+ migration history.
2. Regenerate client with `npm run db:generate` and fix any TypeScript errors.
3. Update `setup.ts` mock if generated client interface changed. The nightly pipeline already documents common mock-type-cast gotchas — re-check those after upgrade.
4. Run full test suite — pay attention to any Prisma delegate mock type cast failures.

---

### 4. TypeScript

| Field | Value |
|-------|-------|
| **Current** | 5.4.2 |
| **Latest** | 5.9+ / 6.x |
| **Priority** | Medium |
| **Status** | Not started — minor `5.4 → 5.9` upgrade is low-risk and could be done independently before the 5 → 6 jump |

**Key breaking changes to watch for:**
- TypeScript 6 strictness improvements — some previously-passing code may produce new errors.
- Decorator and `experimentalDecorators` behavior may change (currently unused, but worth verifying).
- `noImplicitAny` and related flags may catch new edge cases in existing code.
- Module resolution changes — `moduleResolution: bundler` behavior may differ.

**Recommended approach:**
1. Bump to latest 5.x first (5.4 → 5.9), confirm green, then attempt 5 → 6 as a separate PR.
2. Immediately run `tsc --noEmit` after each — fix all new errors before merging.
3. Update `tsconfig.json` if any compiler options were deprecated or renamed.

---

### 5. Tailwind CSS

| Field | Value |
|-------|-------|
| **Current** | 3.4.1 |
| **Latest** | 4.x |
| **Priority** | Medium |
| **Status** | Not started — visual-regression risk is high; defer until v1 UI stabilizes post-Phase 4 |

**Key breaking changes to watch for:**
- Tailwind v4 has a completely new configuration system — `tailwind.config.js` is replaced by CSS-native `@import "tailwindcss"` + `@theme` blocks.
- JIT mode is now always-on and the config key is removed.
- Utility class names have changed: some v3 classes renamed or removed (e.g., `bg-opacity-*` → opacity modifier syntax).
- `@apply` behavior changes in some edge cases.
- PostCSS configuration may need updating.
- Maplibre-gl's own CSS (`maplibre-gl/dist/maplibre-gl.css`) is imported globally — verify load order with the new Tailwind layer system to avoid map control styling regressions.

**Recommended approach:**
1. Use the official v4 upgrade guide and codemod: `npx @tailwindcss/upgrade`.
2. Migrate `tailwind.config.js` to CSS `@theme` syntax.
3. Visually audit all major pages after upgrade — UI regressions are common with Tailwind major versions. Heatmap page, MeetupDetail, CheckIns feed, and RichFeedItem are highest-risk.
4. Do this upgrade in a dedicated PR with visual screenshot comparison.

---

### 6. ESLint

| Field | Value |
|-------|-------|
| **Current** | 8.57.1 |
| **Latest** | 9.x / 10.x |
| **Priority** | Low |
| **Status** | Not started — current 8.57.x has 0 warnings on `main`; no functional pressure |

**Key breaking changes to watch for:**
- ESLint 9+ uses flat config (`eslint.config.js`) by default — `eslintrc` format is deprecated.
- All plugins must be compatible with ESLint 9 flat config (e.g., `@typescript-eslint`, `eslint-plugin-react`, `eslint-config-next`).
- `eslint-config-next` is currently pinned to `^14.2.35` and must be upgraded in lockstep with the Next.js 15/16 upgrade.
- Rules and plugin versions must be upgraded in lockstep.

**Recommended approach:**
1. Upgrade ESLint and migrate config from `.eslintrc.*` to `eslint.config.js` flat format **after** Next.js is on 15+ (so `eslint-config-next` matches).
2. Upgrade `@typescript-eslint` and other plugins to ESLint 9-compatible versions simultaneously.
3. Run `npm run lint` and fix any new rule violations.

---

### 7. @hookform/resolvers

| Field | Value |
|-------|-------|
| **Current** | 3.10.0 |
| **Latest** | 5.x |
| **Priority** | Low |
| **Status** | Not started |

**Key breaking changes to watch for:**
- Major version bump likely follows `react-hook-form` major version compatibility.
- If upgrading to support Zod v4 schemas, ensure resolver is compatible with both Zod v4 and react-hook-form v7+.
- `zodResolver` function signature is stable across versions — no breaking changes expected in usage.

**Recommended approach:**
1. Upgrade after Zod upgrade is complete.
2. Test all forms (signup, crew invite, meetup creation, check-in modal, profile edit) to verify validation still works.

---

### 8. framer-motion

| Field | Value |
|-------|-------|
| **Current** | 11.x |
| **Latest** | 12.x |
| **Priority** | Low |
| **Status** | Not started — newly tracked; v11 → v12 is a relatively small API delta |

**Key breaking changes to watch for:**
- `motion()` HOC and tree-shaking behavior tweaks.
- Some animation defaults (spring stiffness/damping) changed between majors.
- LayoutGroup / AnimateSharedLayout final removal — confirm no remaining references.

**Recommended approach:**
1. Bump in isolation, run the full test suite (snapshots / RTL render tests will catch most regressions).
2. Smoke-test feed scroll animations, modal mount/unmount, and the CheckInButton confetti/burst flow.

---

## Upgrade Sequencing

```
Week 1: Next.js 14 → 15 (async params/headers fixes across all route segments + V1 pages)
Week 2: Next.js 15 → 16 + React 18 → 19
Week 3: Zod 3 → 4 (+ @hookform/resolvers in same PR if compatible)
Week 4: Prisma 5 → 7 (verify Neon adapter, regenerate setup.ts mocks)
Week 5: TypeScript 5.4 → 5.9 → 6 (two PRs)
Week 6: Tailwind 3 → 4 (visual audit required — heatmap + meetup pages highest risk)
Week 7: ESLint 8 → 9/10 + eslint-config-next bump (after Next.js 15+ lands)
Week 8: framer-motion 11 → 12
```

Each upgrade should be a separate PR with passing CI before merging.

---

## Notes

- Never upgrade multiple major versions in a single PR — isolate to diagnose issues.
- Always run `rm -rf .next && npm run build` after framework upgrades (stale cache causes false failures — the nightly pipeline already enforces this).
- Update test mocks (`src/__tests__/setup.ts`) after any Prisma upgrade that changes generated types.
- AI SDK upgrade guidance has been removed — see the "Recent Changes" section above. Do not reintroduce AI-related upgrade work without explicit founder direction.
- `maplibre-gl` is intentionally pinned to v4.x for now; revisit only if a security advisory or a v1 Phase 5 requirement forces it.
