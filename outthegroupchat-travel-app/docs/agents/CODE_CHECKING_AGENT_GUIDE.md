# 🔍 Code Checking Agent Guide

## Mission Statement
> "A social network that not just showcases experiences, but helps you build them."

**Your Role:** Ensure code quality, security, and maintainability as the platform scales.

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

> **Known issue:** Always run `rm -rf .next` before `npm run build`. Stale cache causes ENOENT errors (confirmed 2026-03-10, 2026-03-13, 2026-03-16).

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
// ❌ BAD: No ownership check
const trip = await prisma.trip.findUnique({ where: { id: tripId } });

// ✅ GOOD: Check ownership/membership
const trip = await prisma.trip.findFirst({
  where: {
    id: tripId,
    OR: [
      { ownerId: session.user.id },
      { members: { some: { userId: session.user.id } } },
      { isPublic: true }
    ]
  }
});
```

### 3. Unvalidated Input
```typescript
// ❌ BAD: Raw input usage
const { title, description } = await req.json();
await prisma.trip.create({ data: { title, description } });

// ✅ GOOD: Zod validation
const schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});
const result = schema.safeParse(await req.json());
if (!result.success) {
  return NextResponse.json({ error: result.error }, { status: 400 });
}
```

### 4. Type Assertion Abuse
```typescript
// ❌ BAD: Unsafe type casting
destination: destination as any,
budget: budget as any,

// ✅ GOOD: Proper typing
destination: destination as Prisma.InputJsonValue,
// OR use satisfies
const validData = data satisfies TripCreateInput;
```

### 5. N+1 Query Patterns
```typescript
// ❌ BAD: Query in loop
for (const trip of trips) {
  const members = await prisma.tripMember.findMany({
    where: { tripId: trip.id }
  });
}

// ✅ GOOD: Use includes or batch
const trips = await prisma.trip.findMany({
  include: { members: true }
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

## 🔧 Known Issues to Fix

### Critical (Block deployment)
```typescript
// File: src/lib/auth.ts
// Issue: DB query on every JWT callback
const dbUser = await prisma.user.findFirst(); // ← Add trigger check

// File: prisma/schema.prisma
// Issue: Typo in field name
oderId   String   // ← Should be "orderId"
```

> **Resolved (2026-03-23):** In-memory rate limiting replaced with Redis-backed `@upstash/ratelimit` in `src/lib/rate-limit.ts`. Applied to 8+ routes.

### High Priority
```typescript
// File: src/app/api/search/route.ts
// Issue: Email exposed in search
{ email: { contains: query, mode: 'insensitive' } } // ← Remove

// File: src/app/api/trips/[tripId]/invitations/route.ts
// Issue: Placeholder user creation abuse
user = await prisma.user.create({ data: { email } }); // ← Remove
```

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
- [ ] Business logic in `lib/` services
- [ ] Utility functions
- [ ] Zod schemas (edge cases)
- [ ] AI prompt builders

### Integration Tests Required For:
- [ ] API routes (happy path + error cases)
- [ ] Auth flows
- [ ] Database operations

### E2E Tests Required For:
- [ ] User signup/signin
- [ ] Trip creation flow
- [ ] Invitation acceptance
- [ ] Voting flow

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
| Test Coverage | >80% | 865+ tests passing (45 files) ✅ |
| API Routes | 48 | 48 ✅ |
| Cyclomatic Complexity | <10 | Varies |
| Bundle Size | <500KB | TBD |

---

## 🧪 Sentry Mock Pattern (Test Files)

### Background

`src/lib/sentry.ts` calls `logger.child()` at **module level** during import. Any test file that overrides `vi.mock('@/lib/logger')` locally without including a `child()` stub will crash with `"logger.child is not a function"` as soon as its route imports `sentry.ts`.

### Solution

A global `vi.mock('@/lib/sentry')` is registered in `src/__tests__/setup.ts`. This intercepts the Sentry module before any route can trigger the module-level `logger.child()` call.

**Rule:** Never add a local `vi.mock('@/lib/sentry')` in individual test files. The global mock in `setup.ts` handles it. If you add a local override you risk overriding the global and causing unpredictable behavior in other test files.

### Spying on Sentry in a Test

```typescript
import * as sentry from '@/lib/sentry';

// In your test:
const captureSpy = vi.spyOn(sentry, 'captureException');

// Assert it was called:
expect(captureSpy).toHaveBeenCalledWith(expect.any(Error));
```

### Import Source Rule

Always import Sentry utilities from `@/lib/sentry`, **never** from `@sentry/nextjs` directly. The wrapper module is the conditional entry point for all Sentry exports. Direct `@sentry/nextjs` imports cause `TS2305` type errors.

```typescript
// CORRECT
import { captureException, addBreadcrumb } from '@/lib/sentry';

// WRONG — causes TS2305
import { captureException } from '@sentry/nextjs';
```

### Checklist When Adding Sentry to a Route

- [ ] Import only from `@/lib/sentry`
- [ ] Do NOT add `vi.mock('@/lib/sentry')` to the route's test file (global mock already in setup.ts)
- [ ] If the test file has a local `vi.mock('@/lib/logger')`, verify it includes `child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })`
- [ ] Run `tsc --noEmit` to confirm no TS2305 errors from the import

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

4. **Social Feature Alignment**
   - [ ] Generates shareable content?
   - [ ] Supports collaboration?
   - [ ] Integrates with feed?

---

*Quality is not negotiable. Every line of code should serve the mission.*

*Last Updated: 2026-04-14*

