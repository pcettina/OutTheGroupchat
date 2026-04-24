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

---

## Phase 8 Security Review — 2026-04-23

**Reviewer:** Nightly build pipeline (Phase 8 launch-readiness re-audit)
**Previous score:** 9/10 (2026-04-08)
**Current score:** 9/10 (maintained — no regressions; new surfaces secured at launch)

### Changes Since Last Audit (2026-04-08)

**Attack surface reduced:**
- AI surface fully removed (PR #65, 2026-04-23). All `/api/ai/*` routes deleted, `@ai-sdk/*` and `ai` packages removed, `src/lib/ai` and `src/components/ai` directories deleted. Eliminates prompt-injection, LLM-abuse, and AI-specific rate-limit bypass vectors entirely.

**New API surfaces added and audited:**
| Surface | Routes | Auth | Rate-limited | Notes |
|---------|--------|------|--------------|-------|
| Crew API | `/api/crew/*` (6 routes) | `getServerSession` on all | Yes — per-user `checkRateLimit` | Crew membership validated before every mutation |
| Meetups API | `/api/meetups/*` (5 routes + rsvp + invite) | `getServerSession` on all | Yes | Organizer ownership enforced on PATCH/DELETE |
| Check-ins API | `/api/checkins/*` (3 routes) | `getServerSession` on all | Yes | `activeUntil` window clamps exposure; visibility enum enforced |
| Venues API | `/api/venues/search` | `getServerSession` | Yes | Read-only Google Places proxy; no user data written |

**Auth coverage — confirmed 100% on all new routes.** Cron jobs authenticate via `CRON_SECRET` header; n8n webhook integration uses `N8N_API_KEY`. No route accepts unauthenticated writes.

**No hardcoded secrets found.** All credentials (Pusher, Neon, Resend, Upstash, Google Places) read exclusively from environment variables.

**Prisma ORM in use throughout.** No raw SQL string concatenation. Parameterized queries on all new endpoints — SQL injection risk is not present.

**Search email exposure — confirmed resolved.** `GET /api/search` user projections do not include the `email` field. Email is not searchable or returned in results.

### Social-Feature-Specific Risk Assessment

**Check-in stalking risk — mitigated.**
- `activeUntil` defaults to `now + 6 hours`, clamped to `[now + 30 min, now + 12 h]`.
- `CheckInVisibility` enum (`PUBLIC | CREW | PRIVATE`) enforced at the route level; feed query filters to accepted Crew members when visibility is `CREW`.
- Location data is city-level only (no lat/lng stored).

**Crew request spam — mitigated.**
- `POST /api/crew` is rate-limited per user via Redis `checkRateLimit`.
- Crew requests require both parties to accept; one-sided requests do not expose any user data.

**Meetup invite abuse — partially mitigated.**
- Invites gated behind `getServerSession`; only authenticated users can send.
- Bulk invite endpoint (`POST /api/meetups/[id]/invite`) is rate-limited.
- No anonymous invite creation path exists.

### Outstanding Gaps

| Gap | Severity | Status |
|-----|----------|--------|
| No block/report user flow | 🟠 MEDIUM | Not implemented — trust & safety gap; P1 before scale |
| Sentry DSN not set in Vercel production | 🟠 MEDIUM | Error monitoring blind spot in production |
| Pusher env vars missing in production | 🟠 MEDIUM | Real-time features silently disabled; no security risk but ops gap |
| Resend domain not verified | 🟡 LOW | Email deliverability gap; transactional emails may bounce |
| JWT callback DB query on every request | 🔴 HIGH | Carried over from previous audit — not yet resolved |
| Missing CSRF protection | 🟠 MEDIUM | Carried over — NextAuth SameSite=Lax provides partial mitigation |
| No content moderation pipeline | 🟠 MEDIUM | Required before public launch; meetup titles/descriptions unmoderated |

### Security Checklist — Updated 2026-04-23

| Feature | Status | Priority |
|---------|--------|----------|
| Rate limiting (Redis) | ✅ | P0 — all routes including new Crew/Meetup/Checkin/Venue |
| Auth on all API routes | ✅ | P0 |
| No hardcoded secrets | ✅ | P0 |
| No email exposure in search | ✅ | P0 |
| Check-in privacy controls | ✅ | P0 |
| AI attack surface | ✅ Removed | P0 — PR #65 |
| Input sanitization (XSS) | ❌ | P0 |
| Block/report users | ❌ | P1 — trust & safety gap |
| Content moderation | ❌ | P1 |
| JWT callback optimization | ❌ | P1 |
| Private profiles | ❌ | P1 |
| Sentry DSN in production | ❌ | P1 |
| Data export (GDPR) | ❌ | P2 |
| Account deletion | ❌ | P2 |
| 2FA authentication | ❌ | P2 |
| Audit logging | ❌ | P2 |
| Encryption at rest | ❌ | P3 |

### Score Rationale

Score held at **9/10**. AI surface removal reduces risk; new social API surfaces (Crew, Meetups, Check-ins, Venues) are fully authenticated and rate-limited with no new high-severity findings. The open JWT optimization issue and absent block/report flow are the primary reasons the score does not reach 10/10.

---

*Last Updated: 2026-04-23*
*Next Audit: Before production launch*

