# Package Upgrade Plan

**Last Updated:** 2026-04-22
**Status:** Planning

This document tracks major version upgrades identified for the OutTheGroupchat stack. Upgrades are ordered by priority and dependency chain.

> **Pivot note (2026-04-22):** The app completed Phase 6 of the social pivot — NotificationType pruned, Follow model deprecated, feed rescoped to Meetups/Check-ins/Crews. Phase 7 (marketing surface: landing page, OG tags, README rewrite) is next. No major package upgrades have been executed yet. Priority ordering below reflects the meetup-centric social network focus rather than the original trip-planning context.

---

## Priority Order

1. React + Next.js (upgrade together — tightly coupled)
2. Vercel AI SDK + provider packages (large version jump, breaking changes; **priority elevated** — icebreaker suggestions, meetup recommendations, and `ai/recommend` + `ai/chat` routes are core to the social UX)
3. Prisma (ORM core — affects all DB access; meetups, check-ins, crew, RSVPs all depend on it)
4. Zod (schema validation used across all API routes)
5. TypeScript (compiler — affects all files)
6. Tailwind CSS (styling — affects all components)
7. ESLint + hookform/resolvers (tooling — lower risk)

---

## Upgrade Entries

### 1. React + React DOM + Next.js

| Field | Value |
|-------|-------|
| **Current** | react/react-dom 18.3.1, next 14.2.35 |
| **Latest** | react/react-dom 19.2.5, next 16.2.3 |
| **Priority** | High |

**Key breaking changes to watch for:**
- React 19: `forwardRef` is deprecated — refs are now passed as props. Remove all `forwardRef` wrappers and accept `ref` in props directly.
- React 19: `use()` hook is stable. Context reading via `use(Context)` replaces `useContext` in some patterns.
- React 19: `ReactDOM.render` and `createRoot` API differences — confirm no legacy render calls.
- Next.js 15+: `params` and `searchParams` in page/layout components are now Promises — must be `await`ed. This affects all route segments using `params.tripId` etc.
- Next.js 15+: `cookies()` and `headers()` from `next/headers` are now async.
- Next.js 16: Turbopack is default dev bundler. Run `next dev --turbo` to test early.
- `next/font` and image optimization APIs may have changes — audit `next/image` usage.

**Recommended approach:**
1. Upgrade Next.js 14 → 15 first (separate PR), fix `params`/`searchParams` async patterns across all page components.
2. Then upgrade Next.js 15 → 16 (separate PR), address any new breaking changes.
3. Upgrade React 18 → 19 alongside Next.js 16 (they are compatible at that version).
4. Run `npx @next/codemod` migration tools where available.
5. Full test suite + typecheck after each step.

---

### 2. Vercel AI SDK + Provider Packages

| Package | Current | Latest |
|---------|---------|--------|
| `ai` | 3.4.14 | 6.0.156 |
| `@ai-sdk/anthropic` | 0.0.54 | 3.0.68 |
| `@ai-sdk/openai` | 0.0.70 | 3.0.52 |

**Priority:** High — **elevated post-pivot.** The `ai/recommend` and `ai/chat` routes power meetup suggestions and icebreakers, which are now core social features. AI SDK v5+ introduces `ToolLoopAgent` patterns that would improve these routes. Upgrading unblocks model ID refreshes and tool-use improvements directly relevant to the meetup recommendation UX.

**Key breaking changes to watch for:**
- AI SDK v4+: `useChat` hook signature changed significantly. The `messages` type, `append` function, and streaming behavior have all been updated — do not rely on v3 patterns.
- `streamText`, `generateText`, `generateObject` — parameter names changed: `parameters` renamed to `inputSchema` in tool definitions. Audit all tool definitions in AI routes.
- Provider instantiation changed: `openai('model-id')` and `anthropic('model-id')` pattern via `@ai-sdk/openai` / `@ai-sdk/anthropic` — confirm initialization still matches v3 patterns.
- `ToolLoopAgent` and agent patterns introduced in v5+ — consider adopting for agentic routes.
- Model IDs must be refreshed — do not assume old model IDs remain valid.

**Recommended approach:**
1. Read `node_modules/ai/docs/` after upgrade for current API surface.
2. Upgrade `ai` package first, then provider packages to matching major versions.
3. Fix type errors file by file — start with `src/app/api/ai/` routes.
4. Update all `useChat` client usages in components — check common-errors reference.
5. Run `tsc --noEmit` and fix all type errors before testing.

---

### 3. Prisma + @prisma/client

| Field | Value |
|-------|-------|
| **Current** | 5.22.0 |
| **Latest** | 7.7.0 |
| **Priority** | Medium-High — **priority elevated post-pivot.** Meetups, check-ins, crew, and RSVPs all depend on Prisma. Prisma 7 improves edge-runtime performance (relevant for Neon/Vercel serverless) and has better TypeScript inference for relation includes. |

**Key breaking changes to watch for:**
- Prisma 6+: `PrismaClient` instantiation options and log levels may differ.
- Driver adapters and Neon edge runtime support changes — verify `@neondatabase/serverless` adapter compatibility after upgrade.
- `prisma.$queryRaw` template literal API: verify tag function behavior is unchanged.
- Generated client types may change — particularly around relation includes and select return types.
- `prisma generate` output format changes may require test mock updates (setup.ts mock object structure).

**Recommended approach:**
1. Run `npx prisma migrate dev` after upgrade to confirm schema compatibility.
2. Regenerate client with `npm run db:generate` and fix any TypeScript errors.
3. Update setup.ts mock if generated client interface changed.
4. Run full test suite — pay attention to any Prisma delegate mock type cast failures.

---

### 4. Zod

| Field | Value |
|-------|-------|
| **Current** | 3.25.76 |
| **Latest** | 4.3.6 |
| **Priority** | High |

**Key breaking changes to watch for:**
- Zod v4 has a rewritten core with different internal types — some advanced type utilities (`z.infer`, `z.input`, `z.output`) may have subtle changes.
- `z.string().email()` and other string validators may have stricter behavior.
- `.safeParse()` error shape may differ — audit any code reading `error.issues` directly.
- Custom error maps (`z.setErrorMap`) API may have changed.
- Performance is significantly improved — no behavior regressions expected for standard usage.

**Recommended approach:**
1. Upgrade in a single PR. Run `tsc --noEmit` immediately after.
2. Audit all 53 API routes that use Zod schemas for parse/safeParse error handling.
3. Test edge cases: optional transforms, enum validation, coerce patterns (known Zod v3 quirks that v4 may handle differently).

---

### 5. TypeScript

| Field | Value |
|-------|-------|
| **Current** | 5.9.3 |
| **Latest** | 6.0.2 |
| **Priority** | Medium |

**Key breaking changes to watch for:**
- TypeScript 6 strictness improvements — some previously-passing code may produce new errors.
- Decorator and `experimentalDecorators` behavior may change (currently unused, but worth verifying).
- `noImplicitAny` and related flags may catch new edge cases in existing code.
- Module resolution changes — `moduleResolution: bundler` behavior may differ.

**Recommended approach:**
1. Upgrade TypeScript in isolation from other packages.
2. Immediately run `tsc --noEmit` — fix all new errors before merging.
3. Update `tsconfig.json` if any compiler options were deprecated or renamed.

---

### 6. Tailwind CSS

| Field | Value |
|-------|-------|
| **Current** | 3.4.19 |
| **Latest** | 4.2.2 |
| **Priority** | Medium |

**Key breaking changes to watch for:**
- Tailwind v4 has a completely new configuration system — `tailwind.config.js` is replaced by CSS-native `@import "tailwindcss"` + `@theme` blocks.
- JIT mode is now always-on and the config key is removed.
- Utility class names have changed: some v3 classes renamed or removed (e.g., `bg-opacity-*` → opacity modifier syntax).
- `@apply` behavior changes in some edge cases.
- PostCSS configuration may need updating.

**Recommended approach:**
1. Use the official v4 upgrade guide and codemod: `npx @tailwindcss/upgrade`.
2. Migrate `tailwind.config.js` to CSS `@theme` syntax.
3. Visually audit all major pages after upgrade — UI regressions are common with Tailwind major versions.
4. Do this upgrade in a dedicated PR with visual screenshot comparison.

---

### 7. ESLint

| Field | Value |
|-------|-------|
| **Current** | 8.57.1 |
| **Latest** | 10.2.0 |
| **Priority** | Low |

**Key breaking changes to watch for:**
- ESLint 9+ uses flat config (`eslint.config.js`) by default — `eslintrc` format is deprecated.
- All plugins must be compatible with ESLint 9 flat config (e.g., `@typescript-eslint`, `eslint-plugin-react`).
- Rules and plugin versions must be upgraded in lockstep.

**Recommended approach:**
1. Upgrade ESLint and migrate config from `.eslintrc.*` to `eslint.config.js` flat format.
2. Upgrade `@typescript-eslint` and other plugins to ESLint 9-compatible versions simultaneously.
3. Run `npm run lint` and fix any new rule violations.

---

### 8. @hookform/resolvers

| Field | Value |
|-------|-------|
| **Current** | 3.10.0 |
| **Latest** | 5.2.2 |
| **Priority** | Low |

**Key breaking changes to watch for:**
- Major version bump likely follows `react-hook-form` major version compatibility.
- If upgrading to support Zod v4 schemas, ensure resolver is compatible with both Zod v4 and react-hook-form v7+.
- `zodResolver` function signature is stable across versions — no breaking changes expected in usage.

**Recommended approach:**
1. Upgrade after Zod upgrade is complete.
2. Test all forms (signup, trip creation, survey creation) to verify validation still works.

---

## Upgrade Sequencing

```
Week 1: Next.js 14 → 15 (async params/headers fixes)
Week 2: Next.js 15 → 16 + React 18 → 19
Week 3: AI SDK 3 → 6 + provider packages  ← elevated; unblocks meetup recommendation UX
Week 4: Prisma 5 → 7                       ← elevated; meetups/checkins/crew depend on it
Week 5: Zod 3 → 4
Week 6: TypeScript 5 → 6
Week 7: Tailwind 3 → 4 (visual audit required)
Week 8: ESLint 8 → 10 + hookform/resolvers
```

Each upgrade should be a separate PR with passing CI before merging.

---

## Notes

- Never upgrade multiple major versions in a single PR — isolate to diagnose issues.
- Always run `rm -rf .next && npm run build` after framework upgrades (stale cache causes false failures).
- Update test mocks (setup.ts) after any Prisma or AI SDK upgrade that changes generated types.
- The `ai` package docs are bundled at `node_modules/ai/docs/` — always read these after upgrading before writing AI route code.
