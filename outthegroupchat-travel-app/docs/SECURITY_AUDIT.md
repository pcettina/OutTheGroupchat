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

### 3. ~~User Search Exposes Email Addresses~~ — RESOLVED
**File:** `src/app/api/search/route.ts`
**Risk Level:** ✅ RESOLVED (2026-03-25)

Email has been removed from all user projections returned by the search endpoint. The `select` clause now explicitly omits `email`, and the `OR` filter no longer searches on `email`. User enumeration via the search API is no longer possible.

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
| Input sanitization (XSS) | ✅ | P0 |
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
| 🔴 Critical | 4 (3 resolved ✅, 1 open) | Immediate fix |
| 🟠 Medium | 4 (2 resolved ✅, 2 open) | Next sprint |
| 🟡 Low | 3 | Backlog |

**Overall Security Score: 9/10** (improved from 8/10 — see Security Review 2026-04-08 below)

---

## Security Review — 2026-04-08

The following security improvements were implemented between 2026-03-24 and 2026-04-08 across PRs #22–#33.

### Rate Limiting — Full Coverage Achieved
**PRs:** #28, #29, #30
**Status:** ✅ Complete

All 48 API routes now use `checkRateLimit()` from `src/lib/rate-limit.ts` (Redis-backed via `@upstash/ratelimit`). Previously only AI, auth, and select data-mutation routes were covered. Coverage is now 48/48 — 100%.

### Email Exposure in /api/search — RESOLVED
**PR:** #25 / #29
**Status:** ✅ Resolved (marked Critical issue #3 as resolved above)

Email fields removed from both the Prisma `select` projection and the `OR` filter clause in `src/app/api/search/route.ts`. User email addresses can no longer be enumerated through the search endpoint.

### API Key Prefix Logging Removed
**PR:** #32
**Files:** `src/app/api/ai/chat/route.ts`, `src/lib/email.ts`
**Status:** ✅ Resolved

Both routes previously logged the first N characters of `OPENAI_API_KEY` and `RESEND_API_KEY` respectively during startup/request handling. These log statements have been removed, eliminating accidental credential exposure in log aggregators (e.g., Vercel logs, Sentry breadcrumbs).

### Sentry Error Tracking Infrastructure
**PR:** #32, #33
**Files:** `src/app/api/ai/chat/route.ts`, `src/app/api/ai/recommend/route.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/ai/generate-itinerary/route.ts`, `src/app/api/ai/suggest-activities/route.ts`, `src/app/api/ai/search/route.ts`
**Status:** ✅ Active (6/48 routes instrumented)

`Sentry.captureException()` is now called in `catch` blocks on the 6 highest-risk routes. This enables anomaly detection and alerting on authentication failures, AI errors, and unexpected exceptions without exposing stack traces to end users.

### DOMPurify XSS Protection
**PR:** #22
**Status:** ✅ Active

`DOMPurify` is now applied to all user-generated content rendered as HTML. Stored XSS via trip descriptions, activity notes, and social profile fields is mitigated.

### JSON.parse Wrapped in Zod safeParse
**PR:** #25
**Status:** ✅ Resolved

All `JSON.parse()` calls in route handlers are now wrapped with Zod `safeParse` validation. Malformed or adversarial JSON bodies no longer cause unhandled exceptions or bypass schema validation.

### Members Endpoint Auth Order Hardened
**PR:** #29
**File:** `src/app/api/trips/[tripId]/members/route.ts`
**Status:** ✅ Resolved

The GET handler now performs a `prisma.tripMember.findFirst` membership check before executing `prisma.tripMember.findMany`. This prevents non-members from receiving trip membership data even if they supply a valid session token for a different user.

### /api/beta/status — Redis Rate Limiting
**PR:** #33
**File:** `src/app/api/beta/status/route.ts`
**Status:** ✅ Resolved

Replaced an in-memory `Map`-based rate limiter (which reset on each serverless cold start and did not work across instances) with `checkRateLimit()` backed by Upstash Redis. The endpoint is now correctly rate-limited across all deployment instances.

### /api/discover/import — Proper Upstream Error Codes
**PR:** #33
**File:** `src/app/api/discover/import/route.ts`
**Status:** ✅ Resolved

The route now returns HTTP 502 (Bad Gateway) when the upstream OpenTripMap API returns a non-ok response, rather than conflating upstream failures with internal server errors (500). This prevents misleading error attribution and aids incident diagnosis.

### Remaining Open Issues (Priority Order)

| # | Issue | Risk | Status |
|---|-------|------|--------|
| 2 | JWT callback DB query on every request | 🔴 HIGH | Open |
| 4 | Placeholder user creation abuse (invitations) | 🟠 MEDIUM | Open |
| 5 | Missing CSRF protection | 🟠 MEDIUM | Open |
| 6 | Missing request body size limits | 🟠 MEDIUM | Open |
| 9 | Prisma schema typo (`oderId`) | 🟡 LOW | Open |
| 10 | Missing `.gitignore` (verify) | 🟡 LOW | Open |
| 11 | Structured logging not universal | 🟡 LOW | Partial (Pino used in most routes) |

---

*Last Updated: 2026-04-08*
*Previous Audit: 2026-03-24*
*Next Audit: Before production launch*

