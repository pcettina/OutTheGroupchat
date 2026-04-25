# Production Infrastructure Plan

**Status:** Drafted 2026-04-24. End-to-end front-to-back checklist for getting OutTheGroupchat from preview deploys to a real, observable, recoverable production. Companion to [`STYLE_IMPLEMENTATION_PLAN.md`](./STYLE_IMPLEMENTATION_PLAN.md), [`PRODUCT_VISION.md`](./PRODUCT_VISION.md), and [`V1_IMPLEMENTATION_PLAN.md`](./V1_IMPLEMENTATION_PLAN.md). Replaces / supersedes the older [`OPS_LAUNCH_CHECKLIST.md`](./OPS_LAUNCH_CHECKLIST.md) at a higher altitude.

**Goal:** every user-journey step in `PRODUCT_VISION.md` works in production with monitoring, rate limits, and rollback paths in place. Nothing silently no-ops in prod.

---

## System map

```
                        ┌─────────────────────────────────┐
                        │         User browser             │
                        └────────────────┬────────────────┘
                                         │ HTTPS
                                         ▼
       ┌──────────────────────── Vercel ────────────────────────┐
       │  Edge / CDN  →  Next.js App  →  Serverless Functions    │
       │                                                          │
       │                  Middleware (auth + rate limit)          │
       │                  Cron Jobs (vercel.json)                 │
       └────┬──────────┬──────────┬──────────┬──────────┬─────────┘
            │          │          │          │          │
        DATABASE   PUSHER     UPSTASH    SENTRY     RESEND
          ▼          ▼          ▼          ▼          ▼
       ┌─────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐
       │Neon │   │Pusher│   │Redis │   │Sentry│   │Resend│
       │ PG  │   │      │   │      │   │      │   │      │
       └─────┘   └──────┘   └──────┘   └──────┘   └──────┘
                                                       │
                                                       ▼ DNS / SPF / DKIM
                                                 (your domain registrar)
```

Each box has a section below. The table at the bottom maps every user journey from `PRODUCT_VISION.md` to the systems it touches, so we can verify each one end-to-end.

---

## 1. Vercel — hosting + serverless

**What it does:** Hosts the Next.js app. Edge CDN, serverless function execution, builds, env vars, deploy pipeline, the public URL.

**Status as of 2026-04-24:** Project linked, deploys working from `main` and from PR branches, preview URLs functional.

**Required actions before launch:**

| Item | Status | Action |
|---|---|---|
| Custom production domain | Not set | Configure domain in Vercel → Settings → Domains. Vercel issues SSL automatically. Confirm the domain registrar's nameservers point to Vercel. |
| `NEXTAUTH_URL` set to prod domain | ⚠️ verify | Vercel → env → set `NEXTAUTH_URL` to the production URL. Must match exactly or NextAuth callbacks fail. |
| Production env vars complete | ⚠️ partial | See section per service below. |
| Function `maxDuration` review | OK | `vercel.json` cron route at 300s. No AI routes left after PR #65, no other long-running. |
| Region pinning | Default | Default `iad1` (US East) is fine for NYC-first launch; pin via `vercel.json` if Pusher cluster cross-region latency becomes a factor. |
| Deployment promotion gate | Manual | Production deploys ship from `main` automatically. To gate: enable "Production deploys require approval" in project settings. Recommend ON for v1 launch. |
| Build & run logs retention | Default 30 days | Sufficient for v1. |

**Risks:**
- **Build failure on `main`** silently breaks production until rolled back. Mitigation: every PR is required to pass build via GitHub Actions before merging (already wired).
- **Env var typo in production** — read-only on prod, but a typo means features silently no-op. Mitigation: PR template should require an env-var-touched checkbox.

---

## 2. Neon — Postgres database

**What it does:** Hosts the Postgres instance backing Prisma. Branch-per-PR workflow gives every PR an isolated DB to run migrations against.

**Status as of 2026-04-24:** Primary branch live; per-PR branching active (per project memory). 24+ Prisma models in production schema.

**Required actions before launch:**

| Item | Status | Action |
|---|---|---|
| Production `DATABASE_URL` set in Vercel | ✅ | Verified during 2026-04-17 migration from Supabase. |
| Production `DIRECT_URL` set in Vercel | ✅ | Required for `prisma migrate deploy`. |
| Connection pooling (`pgbouncer=true`) on `DATABASE_URL` | ✅ | Pooler URL in use; non-pooled `DIRECT_URL` only for migrations. |
| Backup schedule | ⚠️ verify | Neon Pro tier has automatic point-in-time recovery (7-day window default). Confirm tier and PITR retention. |
| Read replicas | Not needed v1 | NYC-first traffic doesn't justify. Add at v1.5 if read latency on heatmap aggregation hits limits. |
| Migration rollback drill | ⚠️ pending | Practice rolling back the largest pending migration (Phase 0 of `V1_IMPLEMENTATION_PLAN.md`) on a throwaway branch before it lands. Document the steps in `docs/MIGRATION_ROLLBACK_PLAYBOOK.md`. |
| Connection limit headroom | ⚠️ verify | Default Neon limit per branch is ~100 conns; with Vercel functions cold-starting under burst load, can saturate. Tune `pool_max` in Prisma if function logs show pool timeouts. |

**Risks:**
- **Migration that adds NOT NULL on a populated table** — fails or locks. Mitigation: every migration that adds columns goes default-nullable, then a follow-up backfill, then a constraint. Pattern documented in `V1_IMPLEMENTATION_PLAN.md` Phase 0.
- **Long-running migration on prod** — locks tables. Mitigation: Neon's branch-per-PR catches this in CI; if a real prod migration must run during low traffic, schedule a maintenance window.

---

## 3. Auth — NextAuth.js

**What it does:** Email/password signup + signin, password reset, email verification, session management. (Phase 6 OAuth providers like Google/Apple are post-beta.)

**Status as of 2026-04-24:** Email/password flow live; password reset live; email verification live. Demo mode disabled in prod.

**Required actions before launch:**

| Item | Status | Action |
|---|---|---|
| `NEXTAUTH_SECRET` ≥ 32 chars in prod | ⚠️ verify | Run `openssl rand -base64 32` if regenerating; set in Vercel → env → Production. |
| `NEXTAUTH_URL` matches prod domain exactly | ⚠️ verify | Mismatch breaks the OAuth callback URL (will matter once Google/Apple add). |
| `DEMO_MODE=false` in prod | ✅ (per memory) | Verify; demo endpoint should 401 in prod. |
| Password reset token expiry tuned | ✅ | Default 1h is fine. |
| Email verification required at signup | ✅ | Already wired (per memory). |
| Failed-login rate limit | ⚠️ partial | Upstash rate limit on `/api/auth/*` should cap brute-force. Confirm spec — current setup may rate-limit the IP, not the email; both is better. |
| Session timeout | Default 30 days | Acceptable v1. |
| OAuth (Google/Apple) | Post-v1 | Skip for launch. |

**Risks:**
- **Password reset email lands in spam** — kills the recovery flow. Mitigation: Resend domain verification (section 6) is the load-bearing fix.
- **Account takeover via predictable tokens** — already audited in earlier security reviews; tokens use `crypto.randomBytes(32)`.

---

## 4. Pusher — real-time

**What it does:** WebSocket push for check-in feed updates, meetup RSVP changes, group-formation events, and (eventually, v1.5) heatmap pushes per [`R23`](./PRODUCT_VISION.md).

**Status as of 2026-04-24:** Code wired (`src/lib/pusher.ts`); env vars **missing in production** per project memory blockers.

**Required actions before launch:**

| Item | Status | Action |
|---|---|---|
| Pusher app provisioned | ⚠️ verify | Create or confirm app at [dashboard.pusher.com](https://dashboard.pusher.com). Region: `us2` (matches code default). |
| 6 Vercel env vars set | ❌ blocker | `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`. See [`OPS_LAUNCH_CHECKLIST.md` §2](./OPS_LAUNCH_CHECKLIST.md#2-pusher-env-vars) for exact config table. |
| Channel auth route | ✅ | `/api/pusher/auth` already implemented + tested. |
| Graceful no-op when env unset | ✅ | `getPusherServer()` returns `null` if any var missing — won't crash, just won't broadcast. |

**Risks:**
- **Free-tier connection limit** (100 concurrent on free tier). NYC beta should fit; upgrade to paid tier if approaching.
- **Channel name collisions** — current naming is `private-trip-{id}`, `presence-trip-{id}`, `city-checkins-{cityId}`. Confirm SubCrew + heatmap channels added in V1 don't conflict.

---

## 5. Upstash Redis — rate limiting

**What it does:** Per-IP and per-user rate limiting on every authenticated route. Backs `src/lib/rate-limit.ts`.

**Status as of 2026-04-24:** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set in production. 48/48 routes rate-limited per memory.

**Required actions before launch:** None additional. System is live.

**Risks:**
- **Rate limit too aggressive for legitimate users** — heatmap polls every 30s × multiple users could trip a per-user limit. Audit: confirm `/api/heatmap` rate-limit threshold accommodates the polling cadence (~120 req/hr per user just from polling).
- **Upstash region drift** from Vercel region adds latency. Confirm both are in the same region.

---

## 6. Resend — email deliverability

**What it does:** Transactional email — signup welcome, email verification, password reset, meetup invites, RSVP confirmations, crew requests.

**Status as of 2026-04-24:** `RESEND_API_KEY` set; **domain not yet verified** per memory blockers. Production sends currently use the sandbox sender (`onboarding@resend.dev`) which lands in spam.

**Required actions before launch:**

| Item | Status | Action |
|---|---|---|
| Production domain added to Resend | ❌ blocker | [resend.com/domains](https://resend.com/domains) → Add domain. |
| SPF + DKIM DNS records | ❌ blocker | Add at registrar. Resend's domain page shows the exact records. |
| DMARC record | Recommended | TXT at `_dmarc` improves inbox placement. |
| `EMAIL_FROM` switched off sandbox in prod | ❌ blocker | After verification: `EMAIL_FROM="OutTheGroupchat <noreply@outthegroupchat.com>"`. Leave preview/dev on `onboarding@resend.dev`. |
| Email templates | ✅ | All wired (`src/lib/email.ts`, `email-meetup.ts`, `email-crew.ts`, `email-auth.ts`). System-font HTML for cross-client deliverability — intentional. |

**Risks:**
- **High bounce rate on first send-burst** if too many test sends from sandbox sender are still in queue. Mitigation: warm the verified domain by sending small batches (employees, beta testers) before opening signup widely.

---

## 7. Sentry — observability

**What it does:** Error tracking, source maps, performance traces. Configured via `instrumentation.ts`, `sentry.{server,client,edge}.config.ts`.

**Status as of 2026-04-24:** Code wired; **DSN missing in production** per memory blockers. ~half the API routes instrumented with `captureException`; coverage audit pending.

**Required actions before launch:**

| Item | Status | Action |
|---|---|---|
| Sentry project created + DSN | ❌ blocker | [sentry.io](https://sentry.io) → Create project (Next.js). |
| `SENTRY_DSN` set in Vercel (all envs) | ❌ blocker | See [`OPS_LAUNCH_CHECKLIST.md` §1](./OPS_LAUNCH_CHECKLIST.md#1-sentry-dsn). |
| Source map upload (`SENTRY_AUTH_TOKEN` + org/project) | Optional v1 | Enables symbolicated stack traces. Recommend ON. |
| `tracesSampleRate` tuned | ⚠️ review | Currently `1.0` (100%) per CODEMAP. For prod, drop to `0.1` (10%) or use dynamic sampling to keep quota reasonable. |
| Coverage audit (every API route calls `captureException` on error path) | ⚠️ partial | Memory says ~19/48 instrumented as of 2026-04-16. Audit + bring to 100% before launch. |
| Alert rules | Not set | After DSN lands: configure alert on >10 errors/min in prod, on any SLO breach. |

**Risks:**
- **Quota burn** at 100% trace sampling — Sentry's free tier is 10k errors / 1M transactions/month. NYC beta probably fits but tighten the trace rate on day 1.

---

## 8. Cron jobs

**What it does:** Scheduled background work via `vercel.json` `crons` config. Currently runs `MEETUP_STARTING_SOON` and a generic `/api/cron` job. V1 adds: Intent expiration (per `R12`), daily prompt notifications (per `R8`), heatmap contribution cleanup.

**Status as of 2026-04-24:** Vercel cron functional. `CRON_SECRET` env var protects routes.

**Required actions before launch:**

| Item | Status | Action |
|---|---|---|
| `CRON_SECRET` set in Vercel | ✅ | |
| Existing cron route validates `Authorization: Bearer ${CRON_SECRET}` | ✅ | Pattern documented. |
| Add Intent expiration cron (Phase 1) | Pending V1 Phase 1 | `*/10 * * * *` — runs every 10 min. |
| Add daily prompt cron (Phase 5) | Pending V1 Phase 5 | `*/15 * * * *` — checks each user's local schedule. |
| Add heatmap contribution cleanup cron (Phase 4) | Pending V1 Phase 4 | `0 * * * *` — drops expired contributions hourly. |

**Risks:**
- **Cron skew on Vercel free tier** — best-effort scheduling, can drift up to a few minutes. Acceptable for these tasks.

---

## 9. SEO / metadata / OG / accessibility

**What it does:** First impression on social shares + search.

**Status as of 2026-04-24:** Root metadata in `layout.tsx` (title, description, keywords, themeColor); About + Privacy + Terms pages exist; Lane B landing copy is brief-locked.

**Required actions before launch:**

| Item | Status | Action |
|---|---|---|
| OG image (1200×630) | ❌ pending | Logged as Lane B follow-up. Render with Hybrid Exit logo + brief tagline. |
| Twitter card metadata | Partial | `metadata.twitter` not yet set in `layout.tsx`. Add OG + Twitter card. |
| `sitemap.xml` | ❌ pending | Use Next.js `app/sitemap.ts` to enumerate public pages (/, /about, /privacy, /terms). Authenticated routes excluded. |
| `robots.txt` | ❌ pending | `app/robots.ts` allowing crawl of public pages, disallowing `/api`, `/profile`, etc. |
| Structured data (JSON-LD Organization) | Optional | Light effort; helps brand search results. |
| Lighthouse score targets | TBD | Goal: ≥90 Performance, ≥95 Accessibility, ≥90 Best Practices, ≥95 SEO on production landing. |
| Skip-links | ✅ | `SkipLinks` component already used in `layout.tsx`. |
| Color-contrast audit | Pending | Lane B palette passes AA for normal text on warm-black; verify each page (per STYLE plan). |

---

## 10. Pre-launch verification — end-to-end smoke tests

Every user journey from `PRODUCT_VISION.md` must pass on production before opening signup widely.

### Smoke test matrix

| Journey | Path | Systems touched | Pass criteria |
|---|---|---|---|
| **Signup** | `/auth/signup` → email verify link → `/profile` | Vercel, Neon, NextAuth, Resend | Account created; email arrives in inbox (not spam) within 60s; verify-email link lands the user logged in. |
| **Password reset** | `/auth/reset-password` → email link → `/auth/reset-password/confirm` | Vercel, Neon, NextAuth, Resend | Reset email arrives; new password works on signin. |
| **Crew add** | `/profile/[userId]` → "Add to Crew" | Vercel, Neon, Resend (notification email), Pusher | Crew row created; target user gets notification + email. |
| **Meetup creation** | `/meetups/new` | Vercel, Neon, Resend (invites) | Meetup row created; invitees receive email. |
| **RSVP** | `/meetups/[id]` → tap Going | Vercel, Neon, Pusher (broadcast) | RSVP persists; other attendees see Pusher event without refresh. |
| **Check-in** | `/checkins` → check in at venue | Vercel, Neon, Pusher (city-channel) | Check-in row written; Crew within city see it on `NearbyCrewList`. |
| **Notification delete (Swipe-Dismiss)** | `/notifications` → swipe past 35% | Vercel, Neon | Card dismisses with detent haptic; row deleted on backend. |
| **(V1) Intent capture** | `/intents/new` → submit | Vercel, Neon, classifier | Intent stored; Crew sees it. |
| **(V1) SubCrew formation** | Two matched Intents | Vercel, Neon, Pusher (notification) | SubCrew auto-forms; both users get notification. |
| **(V1) Heatmap render** | `/heatmap` | Vercel, Neon (aggregation query), Pusher (v1.5 push) | Cells render at 30s polling cadence; FoF layer toggleable. |

Each row above becomes a Playwright e2e test in `e2e/`.

### Load test (lightweight)

Run [`k6`](https://k6.io) or [`artillery`](https://artillery.io) once with synthetic traffic of ~50 concurrent users hitting these endpoints:
- `GET /api/heatmap?type=interest&tier=crew` (heatmap polling, the heaviest read path)
- `POST /api/checkins` (write path)
- `GET /api/notifications` (read path)

Pass criteria: p95 latency < 500ms; error rate < 1%; no Sentry burst.

### Security audit refresh

Update `docs/SECURITY_AUDIT.md` with:
- v1 schema changes (Intent, SubCrew, HeatmapContribution — confirm RLS-equivalent privacy enforcement at API layer since Postgres RLS isn't used)
- 3-axis privacy model (R4) — confirm anonymous N≥3 floor (R14) is enforced server-side only
- FoF graph expansion limits (cap on FoF set size to prevent DoS via dense Crew graphs)

---

## 11. Rollback plan

When something breaks in production, the path back to working state must be one click or one command.

| Failure mode | Rollback action | Recovery time target |
|---|---|---|
| Bad deploy on `main` | Vercel → Deployments → "Promote previous to Production" | < 2 min |
| Bad migration | `prisma migrate resolve --rolled-back <migration_name>` + revert PR. Practice once on Neon throwaway branch first. | < 15 min (verify on staging then prod) |
| Pusher outage | App degrades gracefully (no broadcasts; polling works). No rollback needed. | N/A |
| Sentry down | App unaffected; errors lost during outage. Monitor Sentry status page. | N/A |
| Resend outage | Email delays; users can't sign up new accounts during the window. Communicate via Twitter / status page. | Vendor-dependent |
| Neon outage | App degrades to read-only or full-down depending on outage type. Vendor-dependent. | Vendor-dependent |

---

## 12. Launch sequence

The order in which the above lands matters. Recommended sequence:

1. **Style sweep** (per [`STYLE_IMPLEMENTATION_PLAN.md`](./STYLE_IMPLEMENTATION_PLAN.md), 6 PRs over ~1–2 weeks). Doesn't block launch but visual incoherence kills first-impression conversion.
2. **Lane A unblocks** in parallel: Sentry DSN, Pusher env vars, Resend domain verification (per [`OPS_LAUNCH_CHECKLIST.md`](./OPS_LAUNCH_CHECKLIST.md)).
3. **Sentry coverage audit** — bring instrumented routes from ~19/48 → 100%.
4. **V1 Phase 0 schema** lands on a Neon prod branch.
5. **V1 Phases 1 → 5** (per `V1_IMPLEMENTATION_PLAN.md`) ship sequentially. Each phase ends with a playable end-to-end journey.
6. **Smoke test matrix** runs green on prod.
7. **Lighthouse + accessibility audit** passes target scores.
8. **Load test** passes.
9. **Production domain + DNS** swap (Resend domain verify must be done by this step).
10. **Open signup** to a small beta group (~50 users in NYC). Monitor Sentry + Pusher dashboards.
11. **Scale signup** in waves once metrics hold.

---

## What's *not* in scope for v1 launch (deliberate)

- OAuth providers (Google / Apple) — defer to v1.5
- Pusher push for heatmap (v1.5 — polling carries v1)
- Embedding-based classifier (v1.5 — keyword dictionary carries v1)
- DB-backed admin surfaces for hotness math + topic-places mapping (v1.5)
- Native iOS / Android shells (v2)
- Multi-city expansion (v1.5+) — NYC-first per brief

---

**Last updated:** 2026-04-24
**Source:** Audit of current deploy state + translation of `PRODUCT_VISION.md` requirements into infrastructure obligations.
