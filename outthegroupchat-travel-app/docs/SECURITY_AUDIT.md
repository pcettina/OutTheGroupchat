# 🔒 Security Audit Report

## Mission Statement
> "The social media app that wants to get you off your phone."

OutTheGroupchat is a meetup-centric social network built around the V1 intent-to-group loop: signal intent → auto-form SubCrew at ≥2 matched Crew → coordinate + venue recs → opt-in presence visibility. This audit identifies vulnerabilities, risks, and recommendations across the 59 live API routes that back that loop.

---

## 📦 Stack snapshot (2026-05-16)

- **Runtime:** Next.js 14 App Router, React 18, TypeScript strict.
- **Database:** **Neon Postgres** (Vercel Marketplace, migrated from Supabase 2026-04-17). Per-PR Neon branches with `prisma migrate deploy` on PR open.
- **ORM:** Prisma 5.
- **Auth:** NextAuth.js + Prisma adapter (JWT strategy).
- **Realtime:** Pusher (server-authoritative channel auth via `/api/pusher/auth`).
- **Rate limiting:** Redis-backed `@upstash/ratelimit` via `src/lib/rate-limit.ts` → `checkRateLimit()`.
- **Error monitoring:** Sentry (`src/lib/sentry.ts` re-exports `captureException`, `addBreadcrumb`, `setUser`) + structured logging via Pino.
- **AI surface:** ❌ Fully removed PR #65 (2026-04-23). No OpenAI/Anthropic deps, no `/api/ai/*` routes, no `src/lib/ai`, no `src/components/ai`. Do not reintroduce without explicit product direction.
- **Live API routes:** **59** (under `src/app/api/`, excluding `_archive/`). Trip-planning routes archived during the V1 pivot remain on disk under `src/app/api/_archive/` and are not registered.

---

## 🚨 CRITICAL ISSUES (Fix Immediately)

### 1. ~~In-Memory Rate Limiting Vulnerability~~ — RESOLVED
**File:** `src/lib/rate-limit.ts`
**Risk Level:** ✅ RESOLVED (2026-03-23)

Redis-backed rate limiting via `@upstash/ratelimit` is implemented. All V1 routes (intents, subcrews, heatmap, recommendations), auth mutation routes, and meetup/crew/checkin routes use `checkRateLimit()`. In-memory limiters have been removed. `beta/status` migrated from in-memory `Map` to Redis (2026-04-15).

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
- Performance degradation under load (compounds at V1 heatmap polling cadence)
- Potential DoS vector

**Fix:**
```typescript
async jwt({ token, user, trigger }) {
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

Status: ❌ still open. Worsens with V1 traffic patterns (frequent heatmap GETs).

---

### 3. User Search Exposes Email Addresses
**File:** `src/app/api/search/route.ts`
**Risk Level:** 🔴 HIGH

User email is still in the OR clause for the `people` search branch — enables email enumeration via name-search prefixing.

**Fix:** Remove `email` from searchable fields; restrict to `name` and `city` (and the new V1 `cityArea` once exposed).

Status: ❌ still open.

---

### 4. Placeholder User Creation Abuse
**File:** `src/app/api/_archive/trips/[tripId]/invitations/route.ts`
**Risk Level:** ✅ NEUTRALIZED (route archived)

The original placeholder-user bug lived in the trip invitations route, which is no longer registered (moved to `_archive/` during the V1 pivot). The current `meetups/[id]/invite/route.ts` does **not** auto-create placeholder users — it requires an existing User.

Re-audit if trips invitations are ever revived from archive.

---

## 🟠 MEDIUM PRIORITY ISSUES

### 5. Missing CSRF Protection
**Files:** All state-changing API routes
**Risk Level:** 🟠 MEDIUM

No CSRF tokens on state-changing operations. NextAuth uses SameSite=Lax cookies, which mitigates classic CSRF for browser flows but does not cover cross-site fetch with credentials from CORS-enabled origins. Add a double-submit cookie pattern or move to Next.js Server Actions where appropriate.

Status: ❌ still open.

---

### 6. Missing Request Size Limits
**Files:** All POST/PATCH routes
**Risk Level:** 🟠 MEDIUM

No body size validation could allow memory exhaustion attacks. App Router routes do not honor the old `pages` `bodyParser` config — enforce via middleware (read `Content-Length`) or a shared `withBodyLimit()` wrapper.

Status: ❌ still open.

---

### 7. ~~Demo Credentials Hardcoded~~ — RESOLVED
**File:** `src/app/api/auth/demo/route.ts`
**Risk Level:** ✅ RESOLVED (2026-03-23)

Reads `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` from env. Gated by `DEMO_MODE=true`; returns 403 otherwise. Production currently has `DEMO_MODE=false` — endpoint is closed.

---

### 8. ~~Type Casting Bypasses Validation~~ — RESOLVED
**File:** `src/app/api/trips/route.ts`
**Risk Level:** ✅ RESOLVED (2026-03-23)

`any` count remains at target ≈0 across the live tree. Zod `safeParse` is the standard ingress pattern across V1 routes (verified in `intents/route.ts`, `subcrews/[id]/route.ts`, `heatmap/route.ts`, `recommendations/route.ts`).

---

### 9. Unrate-limited read routes
**Files:** `feed/*`, `notifications/*`, `profile/route.ts`, `users/me/route.ts`, `users/[userId]/route.ts`, `search/route.ts`, `topics/route.ts`, `invitations/*`, `inspiration/route.ts`
**Risk Level:** 🟠 MEDIUM (new)

Of the 59 live routes, **35 are rate-limited via `checkRateLimit()`** and **24 are not**. The unprotected set decomposes as:

- 4 cron routes (`cron/*`) — auth via `CRON_SECRET` header; not user-facing. Acceptable.
- 1 NextAuth handler (`auth/[...nextauth]`) — handled internally by NextAuth. Acceptable.
- 3 beta routes (`beta/*`) — `beta/status` uses Redis `checkRateLimit` via a different code path (2026-04-15); the other two are invite-gated. Acceptable.
- 1 health route — intentionally open for liveness probes. Acceptable.
- 1 pusher auth — guarded by session check; should still add per-user limit. **Add limit.**
- **14 user-facing read/mutation routes without limiters** — `feed/route.ts`, `feed/comments`, `feed/engagement`, `feed/share`, `notifications/route.ts`, `notifications/[notificationId]`, `profile/route.ts`, `users/me/route.ts`, `users/[userId]/route.ts`, `search/route.ts`, `topics/route.ts`, `invitations/route.ts`, `invitations/[invitationId]`, `inspiration/route.ts`. **Add `checkRateLimit()` to each.** Search and feed are the highest-priority abuse vectors.

---

## 🟡 LOW PRIORITY ISSUES

### 10. Console.error Logging in Production
**Files:** Scattered API routes
**Risk Level:** 🟡 LOW

Pino loggers (`apiLogger`, `dbLogger`, `aiLogger` removed with AI) exist but legacy `console.error` calls remain in older handlers. Sweep and replace.

### 11. Sentry coverage gaps
**Risk Level:** 🟡 LOW

Sentry / `logError` instrumentation observed on **45 of 59 live routes**. Gap is mostly read routes (`profile/route.ts`, `users/me/route.ts`, `users/[userId]/route.ts`, `health/route.ts`, `pusher/auth/route.ts`, plus the V1 `topics/route.ts`). Close the gap as part of the rate-limit pass.

---

## 🆕 V1 Routes Security Posture (2026-05-16)

V1 added 14 routes between Phase 1 and Phase 4b. Posture summary:

| Route | Auth | Zod | Rate-limit | Sentry |
|---|---|---|---|---|
| `POST/GET /api/intents` | ✅ session | ✅ `createIntentSchema` | ✅ `apiRateLimiter` | ✅ |
| `GET /api/intents/mine` | ✅ session | ✅ query schema | ✅ | ✅ |
| `GET /api/intents/crew` | ✅ session | ✅ query schema | ✅ | ✅ |
| `GET/DELETE /api/intents/[id]` | ✅ session | ✅ | ✅ | ✅ |
| `GET /api/subcrews/emerging` | ✅ session | ✅ | ✅ | ✅ |
| `GET /api/subcrews/mine` | ✅ session | ✅ | ✅ | ✅ |
| `GET/PATCH /api/subcrews/[id]` | ✅ session | ✅ | ✅ | ✅ |
| `PATCH /api/subcrews/[id]/members/me` | ✅ session | ✅ privacy schema | ✅ | ✅ |
| `POST /api/subcrews/[id]/join` | ✅ session | ✅ | ✅ | ✅ |
| `POST /api/subcrews/[id]/commit` | ✅ session | ✅ | ✅ | ✅ |
| `GET /api/topics` | ✅ session | ⚠️ minimal (no body) | ❌ **missing** | ❌ |
| `GET /api/heatmap` | ✅ session | ✅ `heatmapQuerySchema` | ✅ | ✅ |
| `GET /api/recommendations` | ✅ session | ✅ `querySchema` | ✅ | ✅ |
| `POST /api/cron/expire-intents` | ✅ `CRON_SECRET` | n/a | n/a (cron) | ✅ |

**Action items from V1 posture review:**
- Add `checkRateLimit()` + Sentry to `GET /api/topics`. It returns user-readable taxonomy, abuse risk is low, but rate-limit-by-default is the standing rule.
- Privacy picker in `subcrews/[id]/members/me` is the load-bearing surface for V1's location-visibility contract. Add an integration test that proves PATCH cannot widen visibility above the per-event ceiling.
- Heatmap's `tier=fof` branch must continue to enforce the threshold lower-bound. Add a regression test that asserts a single-contributor cell never surfaces at FoF tier (already covered by Phase 4b PR #87 fixtures — keep green).

---

## 📋 Security Checklist for Social Features

| Feature | Status | Priority |
|---|---|---|
| Rate limiting (Redis) | ✅ 35/59 | P0 — close the remaining 14 user-facing routes |
| Input sanitization (XSS) | ⚠️ partial (`src/lib/sanitize.ts` shipped 2026-04-09) | P0 |
| Privacy ceiling (per-event) | ✅ V1 picker shipped | P0 |
| Content moderation | ❌ | P1 |
| Report/block users | ❌ | P1 |
| Private profiles | ⚠️ partial — users/privacy route shipped | P1 |
| Location visibility opt-in | ✅ V1 default-private heatmap | P0 |
| Data export (GDPR) | ❌ | P2 |
| Account deletion | ❌ | P2 |
| 2FA authentication | ❌ | P2 |
| Audit logging | ❌ | P2 |
| Encryption at rest | ✅ Neon-managed | P3 |

---

## 🔐 Recommended Security Headers

Add to `next.config.js` (still not present in repo):

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

For the V1 heatmap, also set a tight `Content-Security-Policy` `connect-src` allowlist that includes the OpenFreeMap tile origin and Pusher — currently unset.

---

## 📊 Risk Summary

| Severity | Count | Action Required |
|---|---|---|
| 🔴 Critical | 4 (3 resolved/neutralized ✅, 1 open: JWT N+1) | Immediate fix |
| 🟠 Medium | 5 (2 resolved ✅, 3 open: CSRF, body-size, unrate-limited reads) | Next sprint |
| 🟡 Low | 2 | Backlog |

**Overall Security Score: 8/10**

Rationale for the change from 9/10 → 8/10: the route count grew 48 → 59 with the V1 ship, and the rate-limit coverage gap on user-facing read routes (feed, search, notifications, profile) is a real abuse vector that did not exist at the same scale in March. Closing the 14-route rate-limit gap restores 9/10. The JWT N+1 issue and missing CSRF/body-size limits prevent a 10/10 until addressed.

---

## 🧾 Open issues to triage

1. JWT callback N+1 query (Critical #2).
2. Email enumeration via `/api/search` (Critical #3).
3. Rate-limit 14 user-facing routes (Medium #9).
4. CSRF strategy + body size limit (Medium #5, #6).
5. Sentry instrumentation on the 14 uncovered routes (Low #11).
6. Pusher channel auth: add per-user `checkRateLimit()` even though session is required.
7. Security headers in `next.config.js`.
8. Confirm Sentry DSN configured in Vercel production (still listed as a Known Blocker in MEMORY).

---

## 📜 Changelog

- **2026-05-16** — Refresh after V1 ship (Phases 0–4b, 14 new routes), AI removal (PR #65, 2026-04-23), and Neon migration (2026-04-17). Route count 48 → 59. Score adjusted 9 → 8 with rationale tied to the unrate-limited read-route gap that grew with the V1 surface. Added "V1 Routes Security Posture" section. Reclassified placeholder-user issue as neutralized (route archived).
- **2026-04-15** — beta/status migrated to Redis rate limiter; Sentry expansion to 19/48.
- **2026-03-23** — Critical #1 (rate limiting), #7 (demo creds), #8 (any-casts) resolved.

---

*Last Updated: 2026-05-16*
*Next Audit: After the 14-route rate-limit pass lands, or before V1 public launch — whichever comes first.*
