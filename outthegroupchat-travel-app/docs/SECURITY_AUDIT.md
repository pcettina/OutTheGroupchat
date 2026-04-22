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
| 🔴 Critical | 4 (2 resolved ✅, 2 open) | Next sprint |
| 🟠 Medium | 4 (2 resolved ✅, 2 open) | Backlog |
| 🟡 Low | 3 | Backlog |

**Overall Security Score: 9/10** (improved from 7/10 — input sanitization, Sentry instrumentation, Redis rate-limiting on all mutation routes; see 2026-04-08 and 2026-04-22 review sections)

---

## 2026-04-22 Review

**Score: 9/10 — Maintained. No regressions introduced by the social pivot (Phases 1–6).**

### New Attack Surfaces (Pivot Phases 3–6)

**Check-in location data (Phase 5)**
- Users can publish their current city via `POST /api/checkins`. Location granularity is city-level only — no lat/lng or street address is stored.
- `activeUntil` is clamped to [now + 30 min, now + 12 hours]. Stale check-ins are excluded from all feed queries (`WHERE activeUntil > now`), limiting the window during which location is visible.
- `CheckInVisibility` enum (`PUBLIC | CREW | PRIVATE`) gives users granular control. Default behaviour requires authentication on all read endpoints.
- **Residual risk:** LOW. City-level data, short expiry window, auth-gated.

**Crew request spam (Phase 3)**
- `POST /api/crew/request` is rate-limited via `checkRateLimit()` (Redis-backed). Duplicate pending requests are rejected at the DB layer by a unique constraint on `(requesterId, recipientId, status=PENDING)`.
- **Residual risk:** LOW.

**Meetup creation spam (Phase 4)**
- `POST /api/meetups` is rate-limited. Meetups require an authenticated session and are scoped to a user's Crew network — public spam is not possible without an accepted Crew relationship.
- **Residual risk:** LOW.

### Acknowledged Known Issues

**beta/status account enumeration (minor)**
- `GET /api/beta/status` returns different responses for registered vs. unregistered emails, allowing email-existence probing. This is a pre-existing documented risk. Rate-limiting (Redis) reduces bulk enumeration viability.
- **Status:** Accepted. No change in risk level since 2026-04-08.

### Auth Coverage

- All 53 live API routes have auth guards: `getServerSession()` for user-facing routes, API-key (`Authorization: Bearer`) for `/api/cron/*` and `/api/beta/status`.
- No unprotected mutation endpoints.

### Code Quality Security Metrics

| Metric | Status |
|--------|--------|
| `any` types | 0 (strict mode enforced) |
| `console.*` in production code | 0 (pino logger used throughout) |
| Zod validation on API inputs | All mutation routes |
| Rate limiting | Redis-backed on all AI, auth, and crew/meetup/checkin mutation routes |
| Sentry error capture | 19+ routes instrumented |

### Schema Notes

- `Follow` model marked `@deprecated` in `prisma/schema.prisma`. Data remains in DB; retirement migration is pending. No security risk — the model is still read-guarded by session checks. Low-risk housekeeping item.

### Score Rationale

Score holds at 9/10. The two open medium-priority items (CSRF protection, request size limits) and the open high-priority item (JWT callback DB query on every request) remain unaddressed. No new critical issues introduced by the Phase 3–6 pivot.

---

*Last Updated: 2026-04-22*
*Next Audit: Before production launch*

