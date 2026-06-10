# Package Upgrade Plan

**Last Updated:** 2026-06-10
**Status:** Planning — none of the documented major upgrades have been performed yet

This document tracks major version upgrades identified for the OutTheGroupchat stack. Upgrades are ordered by priority and dependency chain.

> **Reconciliation note (2026-06-10):** Current versions below were re-verified against `package.json`. As of this date, every package is still on the version the plan targets upgrading *from* — no major upgrade in this plan has been executed. The Vercel AI SDK and provider packages were fully removed (see AI removal note), so any previously-listed AI upgrade is now N/A.
>
> The "Latest" target versions in each entry were captured 2026-04-09. This environment cannot fetch live npm registry data, so those targets are retained as-is — **re-verify the latest published version before starting any upgrade.**

---

## Priority Order

1. React + Next.js (upgrade together — tightly coupled)
2. Zod (schema validation used across all API routes)
3. Prisma (ORM core — affects all DB access)
4. TypeScript (compiler — affects all files)
5. Tailwind CSS (styling — affects all components)
6. ESLint + hookform/resolvers (tooling — lower risk)

> Vercel AI SDK + provider packages previously sat at position 2 — removed 2026-04-23 when all AI functionality was deleted (`ops/kill-all-ai-2026-04-23`).

---

## Upgrade Entries

### 1. React + React DOM + Next.js

| Field | Value |
|-------|-------|
| **Current (package.json)** | react/react-dom `^18.2.0`, next `^14.1.3` (still on React 18 / Next 14 — not upgraded) |
| **Latest (as of 2026-04-09, re-verify)** | react/react-dom 19.2.5, next 16.2.3 |
| **Priority** | High |
| **Status** | Not started |

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

### 2. Zod

| Field | Value |
|-------|-------|
| **Current (package.json)** | `^3.25.0` (still on Zod 3 — not upgraded) |
| **Latest (as of 2026-04-09, re-verify)** | 4.3.6 |
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
2. Audit every API route that uses Zod schemas for parse/safeParse error handling (live route count is ~46 after the AI-route removal — confirm against `src/app/api/` before starting).
3. Test edge cases: optional transforms, enum validation, coerce patterns (known Zod v3 quirks that v4 may handle differently).

---

### 4. Prisma + @prisma/client

| Field | Value |
|-------|-------|
| **Current (package.json)** | `prisma` + `@prisma/client` `^5.22.0` (still on Prisma 5 — not upgraded) |
| **Latest (as of 2026-04-09, re-verify)** | 7.7.0 |
| **Priority** | Medium |
| **Status** | Not started |

**Key breaking changes to watch for:**
- Prisma 6+: `PrismaClient` instantiation options and log levels may differ.
- Driver adapters and edge runtime support changes — the database is now PostgreSQL on Neon (migrated from Supabase 2026-04-17); verify Neon connection-string/pooler and any adapter compatibility against the target Prisma version.
- `prisma.$queryRaw` template literal API: verify tag function behavior is unchanged.
- Generated client types may change — particularly around relation includes and select return types.
- `prisma generate` output format changes may require test mock updates (setup.ts mock object structure).

**Recommended approach:**
1. Run `npx prisma migrate dev` after upgrade to confirm schema compatibility.
2. Regenerate client with `npm run db:generate` and fix any TypeScript errors.
3. Update setup.ts mock if generated client interface changed.
4. Run full test suite — pay attention to any Prisma delegate mock type cast failures.

---

### 5. TypeScript

| Field | Value |
|-------|-------|
| **Current (package.json)** | `^5.4.2` (still on TypeScript 5 — not upgraded) |
| **Latest (as of 2026-04-09, re-verify)** | 6.0.2 |
| **Priority** | Medium |
| **Status** | Not started |

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
| **Current (package.json)** | `^3.4.1` (still on Tailwind 3 — not upgraded) |
| **Latest (as of 2026-04-09, re-verify)** | 4.2.2 |
| **Priority** | Medium |
| **Status** | Not started |

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
| **Current (package.json)** | `^8.57.1` (still on ESLint 8 — not upgraded) |
| **Latest (as of 2026-04-09, re-verify)** | 10.2.0 |
| **Priority** | Low |
| **Status** | Not started |

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
| **Current (package.json)** | `^3.10.0` (paired with `react-hook-form` `^7.54.2` — not upgraded) |
| **Latest (as of 2026-04-09, re-verify)** | 5.2.2 |
| **Priority** | Low |
| **Status** | Not started |

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
Step 1: Next.js 14 → 15 (async params/headers fixes)
Step 2: Next.js 15 → 16 + React 18 → 19
Step 3: Zod 3 → 4
Step 4: Prisma 5 → 7
Step 5: TypeScript 5 → 6
Step 6: Tailwind 3 → 4 (visual audit required)
Step 7: ESLint 8 → 10 + hookform/resolvers
```

The former "AI SDK 3 → 6 + provider packages" step has been dropped — all AI functionality was removed (PR #65, `ops/kill-all-ai-2026-04-23`); there is no `ai`, `@ai-sdk/*`, `openai`, or `anthropic` dependency to upgrade.

Each upgrade should be a separate PR with passing CI before merging.

---

## Notes

- Never upgrade multiple major versions in a single PR — isolate to diagnose issues.
- Always run `rm -rf .next && npm run build` after framework upgrades (stale cache causes false failures).
- Update test mocks (`src/__tests__/setup.ts`) after any Prisma upgrade that changes generated client types.
- AI was fully removed (PR #65, 2026-04-23) — there are no `ai`, `@ai-sdk/*`, `openai`, or `anthropic` packages, no `/api/ai/*` routes, and no `src/lib/ai` / `src/components/ai`. Do not reintroduce AI dependencies as part of any upgrade.
