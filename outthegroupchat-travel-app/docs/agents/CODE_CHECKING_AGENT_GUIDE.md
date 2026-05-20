# 🔍 Code Checking Agent Guide

## Mission Statement
> "The social media app that wants to get you off your phone."

**Your Role:** Ensure code quality, security, and maintainability of the V1 intent-to-group meetup network (Crew → Intent → SubCrew → Meetup) as it approaches launch.

---

## ⚙️ Environment Setup Requirements

Before running tests, ensure the following are installed:

```bash
# Install Playwright browsers (required for E2E tests)
npx playwright install chromium

# Run unit tests
npm test

# Run lint
npm run lint

# Build check (always clear cache first to avoid stale ENOENT errors)
rm -rf .next && npm run build
```

> **Known issue:** Always run `rm -rf .next` before `npm run build`. Stale cache causes ENOENT errors (recurring throughout 2026-03 nightly builds).
>
> **TSC tooling:** For per-agent verification during nightly waves, use `npx tsc --noEmit` (cheap, no Next compile, no .next writes). Reserve full `npm run build` for the final validation phase.

---

## 🎯 Code Review Priorities

### Priority 1: Security (BLOCK if violated)
### Priority 2: Data Integrity (BLOCK if violated)
### Priority 3: Performance (WARN)
### Priority 4: Maintainability (SUGGEST)
### Priority 5: Style (COMMENT)

---

## 🚨 Critical Patterns to Catch

### 1. Authentication Bypass
```typescript
// ❌ BAD: No auth check
export async function GET(req: Request) {
  const data = await prisma.trip.findMany();
  return NextResponse.json(data);
}

// ✅ GOOD: Auth check first
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ...
}
```

### 2. Authorization Bypass (IDOR)
```typescript
// ❌ BAD: No membership check on a Meetup
const meetup = await prisma.meetup.findUnique({ where: { id: meetupId } });

// ✅ GOOD: Check Crew/SubCrew membership or host
const meetup = await prisma.meetup.findFirst({
  where: {
    id: meetupId,
    OR: [
      { hostId: session.user.id },
      { attendees: { some: { userId: session.user.id } } },
      { subCrew: { members: { some: { userId: session.user.id } } } }
    ]
  }
});
```

### 3. Unvalidated Input
```typescript
// ❌ BAD: Raw input usage
const { topicId, note } = await req.json();
await prisma.intent.create({ data: { topicId, note } });

// ✅ GOOD: Zod validation
const schema = z.object({
  topicId: z.string().cuid(),
  note: z.string().max(280).optional(),
  activeUntil: z.string().datetime().optional(),
});
const result = schema.safeParse(await req.json());
if (!result.success) {
  return NextResponse.json({ error: result.error }, { status: 400 });
}
```

### 4. Type Assertion Abuse
```typescript
// ❌ BAD: Unsafe type casting
metadata: metadata as any,
location: location as any,

// ✅ GOOD: Proper typing
metadata: metadata as Prisma.InputJsonValue,
// OR use satisfies
const validData = data satisfies MeetupCreateInput;
```

### 5. N+1 Query Patterns
```typescript
// ❌ BAD: Query in loop
for (const subCrew of subCrews) {
  const members = await prisma.subCrewMember.findMany({
    where: { subCrewId: subCrew.id }
  });
}

// ✅ GOOD: Use includes or batch
const subCrews = await prisma.subCrew.findMany({
  include: { members: { include: { user: true } } }
});
```

---

## 📋 Review Checklist

### Security Checks
- [ ] All endpoints check authentication
- [ ] Authorization verified for resource access
- [ ] Input validated with Zod schemas
- [ ] No SQL/NoSQL injection possible
- [ ] No XSS vectors in user content
- [ ] Sensitive data not logged
- [ ] Rate limiting applied to expensive operations
- [ ] No secrets in code

### Performance Checks
- [ ] No N+1 queries
- [ ] Pagination implemented for lists
- [ ] Indexes used for filtered queries
- [ ] No unnecessary data fetched
- [ ] Caching considered for frequent reads
- [ ] Async operations not blocking

### Data Integrity Checks
- [ ] Transactions used for multi-step operations
- [ ] Foreign key constraints respected
- [ ] Cascade deletes handled properly
- [ ] Unique constraints enforced
- [ ] Required fields validated

### Code Quality Checks
- [ ] TypeScript strict mode compliant
- [ ] No `any` types without justification
- [ ] Error handling comprehensive
- [ ] Functions under 50 lines
- [ ] Clear naming conventions
- [ ] Comments for complex logic

---

## 🔧 Known Issues / Open Blockers (2026-05-19)

### Production env gaps (non-code; tracked in CLAUDE.md)
- Sentry DSN not set in Vercel production (code instrumented on 47/59 routes, but no events flow)
- Pusher env vars missing in production (real-time intent/SubCrew/meetup events disabled)
- Resend domain not verified (auth + meetup emails bounce)
- `DEMO_MODE=false` — set to `true` to enable demo auth endpoint

### Test / mock cleanliness
- See `MOCK PATTERNS` below — many nightly test failures trace back to mock state leakage across tests.

> **Resolved (2026-03-23):** In-memory rate limiting replaced with Redis-backed `@upstash/ratelimit` in `src/lib/rate-limit.ts`. All 46 live API routes are now rate-limited.
>
> **Resolved (2026-04-23):** AI surface fully removed (PR #65) — no `@ai-sdk/*`, no `ai` dep, no `/api/ai/*`, no `src/lib/ai`, no `src/components/ai`. Do not flag AI-removal as a bug; do not propose reintroducing AI without explicit user direction.

---

## 📁 File Structure Standards

```
src/
├── app/
│   ├── api/
│   │   └── [resource]/
│   │       ├── route.ts          # GET (list), POST (create)
│   │       └── [id]/
│   │           └── route.ts      # GET, PATCH, DELETE (single)
│   └── [page]/
│       ├── page.tsx              # Page component
│       ├── loading.tsx           # Loading state
│       └── error.tsx             # Error boundary
├── components/
│   ├── ui/                       # Reusable UI components
│   ├── [feature]/                # Feature-specific components
│   └── index.ts                  # Export barrel
├── lib/
│   ├── prisma.ts                 # DB client singleton
│   ├── auth.ts                   # Auth configuration
│   └── [service]/                # Business logic services
└── types/
    └── index.ts                  # Shared TypeScript types
```

---

## 🧪 Testing Requirements

### Unit Tests Required For:
- [ ] Business logic in `lib/` services (e.g. `src/lib/subcrew-formation.ts`, `src/lib/intent-lifecycle.ts`)
- [ ] Utility functions
- [ ] Zod schemas (edge cases)

### Integration Tests Required For:
- [ ] API routes (happy path + error cases)
- [ ] Auth flows
- [ ] Crew accept/reject + bidirectional pairing
- [ ] Intent → SubCrew auto-formation (≥2 Crew on same Topic)
- [ ] Meetup RSVP + invite + check-in
- [ ] Database operations

### E2E Tests Required For (Phase 8 Action #5):
- [ ] User signup / email verification / signin
- [ ] Send + accept Crew request (mutual pairing)
- [ ] Signal Intent → see SubCrew form when threshold hit
- [ ] Create Meetup from SubCrew → RSVP → check-in

---

## 🧷 Mock Patterns (Vitest)

These patterns are load-bearing for the nightly pipeline. Violating them is the most common cause of flaky test failures.

### `vi.resetAllMocks()` vs `vi.clearAllMocks()`
- `clearAllMocks()` only resets call history. It does **NOT** flush queued `mockResolvedValueOnce` / `mockReturnValueOnce` values.
- Use `vi.resetAllMocks()` in `beforeEach` when there is any chance of mock-queue leakage between tests (which is most of the time for API route tests).
- **Caveat:** `resetAllMocks()` ALSO wipes factory-level `mockResolvedValue` defaults set inside `vi.mock(...)` factories. After `resetAllMocks()`, you must re-arm any default behavior (e.g. `checkRateLimit` is the classic example — re-set it in `beforeEach` or every post-auth test returns 500).

### `mockResolvedValueOnce` discipline
- Use `mockResolvedValueOnce` (queue) for happy-path test setup, not `mockResolvedValue` (sticky), so one test's setup cannot bleed into the next.
- If you set a sticky default in a factory, re-arm it after `resetAllMocks()`.

### Sentry mock approach
- A global `vi.mock('@/lib/sentry')` is registered in `src/__tests__/setup.ts`. It stubs `logError`, `captureException`, `addBreadcrumb`, `setUser`.
- For error-path tests, assert via `vi.mocked(logError).toHaveBeenCalled()` or the spy on the specific export your route uses.
- `src/lib/sentry.ts` exports `addBreadcrumb` as a wrapper — do not import `addBreadcrumb` directly from `@sentry/nextjs` in route code (it bypasses the mock and breaks TSC in test files).

### Prisma mock type-cast pitfalls
- When Wave 1 test agents create `vi.mocked(prisma.X)`, methods not in the inferred intersection type (often `create`, `createMany`, `count`) must be cast:
  ```ts
  (prisma.meetupInvite as unknown as { createMany: ReturnType<typeof vi.fn> })
    .createMany.mockResolvedValueOnce({ count: 3 });
  ```
- Static class methods mocked via `vi.mock()` factory: `vi.mocked(Service.prototype.method)` may not have `mockResolvedValueOnce`. Use:
  ```ts
  (Service.prototype.method as unknown as { mockResolvedValueOnce: Function })
    .mockResolvedValueOnce(...);
  ```

### `NextRequest` vs `Request` in tests
- Routes that read headers via the rate limiter must use `NextRequest`. Test helpers for those routes must construct `new NextRequest(url)`, NOT `new Request(url)`. The `/api/beta/status` route is the canonical example.

---

## 🛠️ Common Fixes

### Fix: Add Missing Auth Check
```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of handler
}
```

### Fix: Add Input Validation
```typescript
import { z } from 'zod';

const schema = z.object({
  // Define your schema
});

export async function POST(req: Request) {
  const body = await req.json();
  const result = schema.safeParse(body);
  
  if (!result.success) {
    return NextResponse.json({
      success: false,
      error: 'Validation failed',
      details: result.error.flatten()
    }, { status: 400 });
  }
  
  const validatedData = result.data;
  // ... use validatedData
}
```

### Fix: Add Pagination
```typescript
const page = parseInt(searchParams.get('page') || '1');
const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
const skip = (page - 1) * limit;

const [items, total] = await Promise.all([
  prisma.item.findMany({ skip, take: limit }),
  prisma.item.count()
]);

return NextResponse.json({
  data: items,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit)
  }
});
```

---

## 📊 Code Metrics to Track

| Metric | Target | Current |
|--------|--------|---------|
| TypeScript Coverage | 100% | ~98% |
| Any Types | 0 | 0 ✅ |
| Console Statements | 0 (prod) | 0 ✅ |
| Test Coverage | >80% | ~950+ Vitest passing on main (post-2026-05-19 nightly) ✅ |
| API Routes | ~46 live | 46 ✅ (post-AI removal + V1 routes) |
| Cyclomatic Complexity | <10 | Varies |
| Bundle Size | <500KB | TBD |

---

## 🚫 Auto-Reject Patterns

These patterns should automatically fail code review:

1. **Hardcoded secrets**
   ```typescript
   const apiKey = "sk-xxx"; // NEVER
   ```

2. **Disabled security**
   ```typescript
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   ```

3. **TODO in production code**
   ```typescript
   // TODO: fix this later // Block until fixed
   ```

4. **Catching and ignoring errors**
   ```typescript
   try { ... } catch (e) {} // Must handle
   ```

5. **Direct DOM manipulation in React**
   ```typescript
   document.getElementById()... // Use refs
   ```

---

## 🔄 PR Review Process

1. **Automated Checks**
   - [ ] TypeScript compiles
   - [ ] ESLint passes
   - [ ] Tests pass
   - [ ] Build succeeds

2. **Security Review**
   - [ ] Auth patterns correct
   - [ ] Input validation present
   - [ ] No sensitive data exposed

3. **Code Quality**
   - [ ] Follows file structure
   - [ ] Proper error handling
   - [ ] Good naming

4. **V1 Alignment**
   - [ ] Respects the Crew / Intent / SubCrew / Meetup model
   - [ ] Drives toward IRL meetup (not just on-app engagement)
   - [ ] Doesn't reintroduce trip-planning surface or AI routes

---

*Quality is not negotiable. Every line of code should serve the mission.*

*Last Updated: 2026-05-19*

