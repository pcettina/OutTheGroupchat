# 🔍 Code Checking Agent Guide

## Mission Statement
> "A social network that not just showcases experiences, but helps you build them."

**Your Role:** Ensure code quality, security, and maintainability as the platform scales.

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
// File: src/lib/ai/client.ts
// Issue: In-memory rate limiting
const requestCounts = new Map(); // ← Must use Redis

// File: src/lib/auth.ts
// Issue: DB query on every JWT callback
const dbUser = await prisma.user.findFirst(); // ← Add trigger check

// File: prisma/schema.prisma
// Issue: Typo in field name
oderId   String   // ← Should be "orderId"
```

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
| TypeScript Coverage | 100% | ~95% |
| Any Types | 0 | ~12 |
| Console Statements | 0 (prod) | ~30 |
| Test Coverage | >80% | ~0% |
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

4. **Social Feature Alignment**
   - [ ] Generates shareable content?
   - [ ] Supports collaboration?
   - [ ] Integrates with feed?

---

*Quality is not negotiable. Every line of code should serve the mission.*

*Last Updated: December 2024*

