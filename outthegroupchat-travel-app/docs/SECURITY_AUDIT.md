# 🔒 Security Audit Report

## Mission Statement
> "A social network that not just showcases experiences, but helps you build them."

This security audit identifies vulnerabilities, risks, and recommendations to protect our users' data and experiences as we scale the social platform.

---

## 🚨 CRITICAL ISSUES (Fix Immediately)

### 1. ~~In-Memory Rate Limiting Vulnerability~~ — RESOLVED
**File:** `src/lib/rate-limit.ts`
**Risk Level:** ✅ RESOLVED (2026-03-23)

Redis-backed rate limiting via `@upstash/ratelimit` is now implemented. All AI routes, auth routes, and data-mutation routes use `checkRateLimit()` from `src/lib/rate-limit.ts`. In-memory rate limiting has been removed.

---

### 2. JWT Callback Database Query on Every Request
**File:** `src/lib/auth.ts`
**Lines:** 88-106
**Risk Level:** 🔴 HIGH

```typescript
async jwt({ token, user }) {
  const dbUser = await prisma.user.findFirst({  // ⚠️ Called on EVERY request
    where: { email: token.email },
  });
```

**Problem:** 
- N+1 query pattern on every authenticated request
- Performance degradation under load
- Potential DoS vector

**Fix:**
```typescript
async jwt({ token, user, trigger }) {
  // Only query DB on sign-in or update
  if (trigger === "signIn" || trigger === "update") {
    const dbUser = await prisma.user.findFirst({
      where: { email: token.email },
    });
    if (dbUser) {
      token.id = dbUser.id;
      token.name = dbUser.name;
    }
  }
  return token;
}
```

---

### 3. User Search Exposes Email Addresses
**File:** `src/app/api/search/route.ts`
**Lines:** 105-127
**Risk Level:** 🔴 HIGH

```typescript
const users = await prisma.user.findMany({
  where: {
    OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },  // ⚠️ Privacy violation
```

**Problem:** Allows enumeration of user emails

**Fix:** Remove email from searchable fields for privacy:
```typescript
OR: [
  { name: { contains: query, mode: 'insensitive' } },
  { city: { contains: query, mode: 'insensitive' } },
],
```

---

### 4. Placeholder User Creation Abuse
**File:** `src/app/api/trips/[tripId]/invitations/route.ts`
**Lines:** 110-118
**Risk Level:** 🟠 MEDIUM-HIGH

```typescript
if (!user) {
  user = await prisma.user.create({
    data: {
      email,
      name: email.split('@')[0],
    },
  });
}
```

**Problem:** 
- Attackers can create unlimited placeholder users
- Database pollution
- Potential email spoofing

**Fix:**
```typescript
if (!user) {
  // Don't create user - send email invitation instead
  await sendInvitationEmail(email, tripId);
  invitations.push({ email, status: 'email_sent' });
  continue;
}
```

---

## 🟠 MEDIUM PRIORITY ISSUES

### 5. Missing CSRF Protection
**Files:** All API routes
**Risk Level:** 🟠 MEDIUM

No CSRF tokens on state-changing operations.

**Fix:** Add Next.js CSRF middleware or use SameSite cookies.

---

### 6. Missing Request Size Limits
**Files:** All POST/PATCH routes
**Risk Level:** 🟠 MEDIUM

No body size validation could allow memory exhaustion attacks.

**Fix:**
```typescript
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};
```

---

### 7. ~~Demo Credentials Hardcoded~~ — RESOLVED
**File:** `src/app/api/auth/demo/route.ts`
**Risk Level:** ✅ RESOLVED (2026-03-23)

Demo credentials are now read from `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` environment variables. The endpoint is gated behind `DEMO_MODE=true` — if not set, the endpoint returns 403. No hardcoded credentials remain.

---

### 8. ~~Type Casting Bypasses Validation~~ — RESOLVED
**File:** `src/app/api/trips/route.ts`
**Risk Level:** ✅ RESOLVED (2026-03-23)

`any` type casts have been eliminated. The codebase currently has 0 `any` types. Prisma InputTypes and Zod schemas are used throughout.

---

## 🟡 LOW PRIORITY ISSUES

### 9. Database Schema Typo
**File:** `prisma/schema.prisma`
**Line:** 331

```prisma
oderId   String   // ⚠️ Should be "orderId"
```

---

### 10. Missing .gitignore File
**Risk Level:** 🟡 LOW

No `.gitignore` detected - risk of committing sensitive files.

---

### 11. Console.error Logging in Production
**Files:** All API routes
**Risk Level:** 🟡 LOW

Should use structured logging (e.g., Pino, Winston).

---

## 📋 Security Checklist for Social Features

As we expand social features, implement:

| Feature | Status | Priority |
|---------|--------|----------|
| Rate limiting (Redis) | ✅ | P0 |
| Input sanitization (XSS) | ❌ | P0 |
| Content moderation | ❌ | P1 |
| Report/block users | ❌ | P1 |
| Private profiles | ❌ | P1 |
| Data export (GDPR) | ❌ | P2 |
| Account deletion | ❌ | P2 |
| 2FA authentication | ❌ | P2 |
| Audit logging | ❌ | P2 |
| Encryption at rest | ❌ | P3 |

---

## 🔐 Recommended Security Headers

Add to `next.config.js`:

```javascript
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
```

---

## 📊 Risk Summary

| Severity | Count | Action Required |
|----------|-------|-----------------|
| 🔴 Critical | 4 (2 resolved ✅, 2 open) | Immediate fix |
| 🟠 Medium | 4 (2 resolved ✅, 2 open) | Next sprint |
| 🟡 Low | 3 | Backlog |

**Overall Security Score: 7/10** (improved from 6/10 — rate limiting, demo credentials, and `any` types resolved)

---

*Last Updated: 2026-03-30*
*Next Audit: Before production launch*

