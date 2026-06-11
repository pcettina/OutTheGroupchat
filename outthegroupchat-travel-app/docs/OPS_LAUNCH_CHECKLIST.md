# Ops Launch Checklist

**Scope:** the launch blockers that live in the Vercel/Resend/Pusher dashboards (and one strength audit) for the meetup-centric OutTheGroupchat app. Most are pure ops work — the application code is already wired (Crew, Meetup, Venue, CheckIn, Intent/SubCrew, and Heatmap domains all live; ~63/64 routes have Sentry instrumentation). These steps put the keys in Vercel so production can read them, plus a couple of items that still need a human eye.

**Open ops blockers (as of 2026-06-11):**

1. [Sentry DSN](#1-sentry-dsn) — error monitoring (code instrumented, DSN not set in Vercel prod)
2. [Pusher env vars](#2-pusher-env-vars) — real-time check-in / meetup features (env vars missing in prod)
3. [Resend domain verification](#3-resend-domain-verification) — production email deliverability (domain unverified)
4. [NEXTAUTH_SECRET strength audit](#4-nextauth_secret-strength-audit) — confirm the prod secret is a strong, rotated value
5. [Uptime / health monitor](#5-uptime--health-monitor) — external ping on `/api/health`
6. [E2E authenticated flow verification](#6-e2e-authenticated-flow-verification) — spec authored, not yet browser-verified
7. [DEMO_MODE flag](#7-demo_mode-flag) — `DEMO_MODE=false` in prod; flip only intentionally for demos

See [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md) for the full launch picture. See [`VERCEL_ENV_SETUP.md`](./VERCEL_ENV_SETUP.md) for the base env reference.

> **Product note:** this app is a meetup-centric social network ("the social media app that wants to get you off your phone"). The trip-planning product was archived (`src/_archive/`) and the AI surface was fully removed (PR #65, 2026-04-23) — there are no `/api/ai/*` routes, no OpenAI/Anthropic deps. Verification steps below reference live meetup routes, not the retired AI/trip routes.

---

## 1. Sentry DSN

**Status:** code instrumentation effectively complete — ~63/64 live API routes call into `src/lib/sentry.ts`. The only remaining gap is the DSN env var in Vercel production; until it is set, `captureException()` no-ops.

**Why:** without a DSN, `captureException()` calls silently no-op. Production errors go uncaught.

**Code already wired:** [`sentry.server.config.ts`](../sentry.server.config.ts), [`sentry.client.config.ts`](../sentry.client.config.ts), [`sentry.edge.config.ts`](../sentry.edge.config.ts), [`instrumentation.ts`](../instrumentation.ts), [`instrumentation-client.ts`](../instrumentation-client.ts) — all read `process.env.SENTRY_DSN` and fall back to `undefined` (disabled) when unset.

### Steps

1. **Create / pick a Sentry project.** Go to [sentry.io](https://sentry.io) → your org → **Projects** → **Create Project** → platform **Next.js** → project name `outthegroupchat` (or reuse existing if one exists).
2. **Copy the DSN.** Project **Settings** → **Client Keys (DSN)** → copy the value (format: `https://<hash>@o<orgid>.ingest.sentry.io/<projectid>`).
3. **Add to Vercel.** [Vercel dashboard](https://vercel.com/dashboard) → the OutTheGroupchat project → **Settings** → **Environment Variables** → **Add New**:

   | Key | Value | Environments |
   |-----|-------|--------------|
   | `SENTRY_DSN` | `<DSN from step 2>` | Production, Preview, Development |

4. **Optional — source map uploads for readable stack traces** (skip if you don't need symbolicated stack traces yet):

   | Key | Value | Environments |
   |-----|-------|--------------|
   | `SENTRY_ORG` | your Sentry org slug | Production, Preview |
   | `SENTRY_PROJECT` | `outthegroupchat` | Production, Preview |
   | `SENTRY_AUTH_TOKEN` | generate at Sentry **Settings** → **Auth Tokens** with `project:releases` + `project:write` scopes | Production, Preview |

5. **Redeploy.** Either push any commit or click **Redeploy** on the latest deployment.

### Verify

- Trigger a deliberate error in production (any 500 — easiest: hit a route with an intentional bad payload). Within 60s it should appear at `sentry.io/organizations/<org>/issues/`.
- Easiest live target: `POST /api/meetups` with `{}` (fails Zod validation → 400) or any authenticated meetup/check-in route with a malformed body. The old `/api/ai/*` routes no longer exist (removed PR #65), so do not reference them in smoke checks.

---

## 2. Pusher env vars

**Why:** without these, check-in broadcasts, meetup real-time RSVP updates, and the `/checkins` live feed silently degrade — `getPusherServer()` returns `null` and no events fire.

**Code already wired:** [`src/lib/pusher.ts:18`](../src/lib/pusher.ts) reads 4 server-side vars; the client reads 2 `NEXT_PUBLIC_*` vars. All 6 must be set for production real-time to work.

### Steps

1. **Create / pick a Pusher app.** Go to [dashboard.pusher.com](https://dashboard.pusher.com) → **Channels** → **Create app** (or reuse existing). Pick a cluster close to Vercel region (default `us2` matches `.env.example`).
2. **Grab credentials.** App → **App Keys** tab. Copy: `app_id`, `key`, `secret`, `cluster`.
3. **Add to Vercel.** All 6 variables, all environments:

   | Key | Value | Exposure |
   |-----|-------|----------|
   | `PUSHER_APP_ID` | from App Keys | Server only |
   | `PUSHER_KEY` | from App Keys | Server only |
   | `PUSHER_SECRET` | from App Keys | Server only — never expose |
   | `PUSHER_CLUSTER` | e.g. `us2` | Server only |
   | `NEXT_PUBLIC_PUSHER_KEY` | **same value as `PUSHER_KEY`** | Bundled into client JS |
   | `NEXT_PUBLIC_PUSHER_CLUSTER` | **same value as `PUSHER_CLUSTER`** | Bundled into client JS |

   > **Note:** The `NEXT_PUBLIC_*` duplicates are intentional — Next inlines them into browser bundles. The `key` (not `secret`) is safe to expose. `secret` must **never** be prefixed with `NEXT_PUBLIC_`.

4. **Redeploy.**

### Verify

- Open two browser tabs authenticated as two Crew members in the same city.
- In tab A: check in somewhere public (`/checkins` → new check-in).
- Tab B should receive the live event and render the new check-in without refresh within ~2s.
- Or inspect the Pusher dashboard → **Debug Console** while triggering any `/api/checkins` POST — you should see the event fire.

---

## 3. Resend domain verification

**Why:** with an unverified domain, Resend only delivers from the sandbox sender (`onboarding@resend.dev`). Mail from that sender lands in promotions/spam for most recipients, or bounces entirely.

**Code already wired:** [`src/lib/email.ts:10`](../src/lib/email.ts) reads `process.env.EMAIL_FROM` with fallback `OutTheGroupchat <noreply@outthegroupchat.com>`. `RESEND_API_KEY` is already set in Vercel (verified 2026-03). Current `EMAIL_FROM` in prod is the sandbox sender.

### Steps

1. **Add the domain in Resend.** [resend.com/domains](https://resend.com/domains) → **Add Domain** → enter `outthegroupchat.com` (or `outthegroupchat.org` if that's the production apex — whichever is the live site). Region: **North America** (matches Vercel default).
2. **Copy the DNS records Resend shows.** 4 records total:
   - 1× **SPF** (TXT at `send`)
   - 2× **DKIM** (TXT at `resend._domainkey` and a second `resend._domainkey` with a longer value)
   - 1× **DMARC** recommended (TXT at `_dmarc`) — optional but improves deliverability
3. **Add DNS records at your registrar.** Wherever the domain is hosted (Vercel DNS / Cloudflare / Namecheap / etc.). Exact UI varies; Resend's docs link shows per-registrar instructions.
4. **Wait for verification.** Usually 5–15 minutes, up to 48h in the worst case. Resend's domain page flips from "Pending" to "Verified" automatically.
5. **Switch `EMAIL_FROM` in Vercel.** Once verified:

   | Key | Value | Environments |
   |-----|-------|--------------|
   | `EMAIL_FROM` | `OutTheGroupchat <noreply@outthegroupchat.com>` (use the verified domain) | Production |

   Leave Preview + Development on `onboarding@resend.dev` so test sends don't burn domain reputation.

6. **Redeploy production.**

### Verify

- Trigger a real email send: sign up a new test account at production URL, or request a password reset.
- The email should arrive from `noreply@outthegroupchat.com` (or your chosen address) and land in inbox, not spam.
- Check Resend dashboard → **Emails** → latest entry should show **Delivered** (not **Bounced**).

---

## 4. NEXTAUTH_SECRET strength audit

**Why:** `NEXTAUTH_SECRET` signs the NextAuth session JWT. A weak, short, or reused secret lets an attacker forge sessions. This is a one-time audit, not a wiring task — the code already reads the env var.

### Steps

1. **Inspect the production value.** [Vercel dashboard](https://vercel.com/dashboard) → OutTheGroupchat project → **Settings** → **Environment Variables** → `NEXTAUTH_SECRET` (Production).
2. **Confirm it is strong.** It should be at least 32 bytes of base64/hex randomness, generated with `openssl rand -base64 32` (or `npx auth secret`), and **not** shared with Preview/Development.
3. **Rotate if in doubt.** If the value looks short, human-typed, or copied from `.env.example`, generate a fresh one and replace it. Rotating invalidates existing sessions (users re-login) — acceptable pre-launch.
4. **Redeploy** after any change.

### Verify

- After rotation, an existing logged-in session should be rejected on next request and prompt re-login.
- A fresh login should succeed and persist.

---

## 5. Uptime / health monitor

**Why:** there is currently no external monitor pinging production. If the app or database goes down, no one is paged. `/api/health` already returns DB connectivity status and is unauthenticated, so it is the natural target.

**Code already wired:** `GET /api/health` (no auth, no params) returns a JSON status payload including a DB check.

### Steps

1. **Pick a monitor.** Vercel's built-in monitoring, UptimeRobot, BetterStack, or Checkly — any will do.
2. **Add an HTTP check** against `https://<prod-domain>/api/health`, interval 1–5 min, expecting HTTP 200.
3. **Wire an alert channel** (email / SMS / Slack) so a non-200 or timeout pages someone.

### Verify

- The monitor dashboard shows the check **green** within one interval.
- Optionally take the DB offline in a Neon branch to confirm the alert fires (then restore).

---

## 6. E2E authenticated flow verification

**Why:** an authenticated Playwright spec covering the core meetup loop (sign in → create/join Crew → create Meetup → RSVP / check in) has been **authored**, but has not yet been run green in a real browser against a seeded environment. Until it passes, we have no end-to-end proof the happy path works post-pivot.

### Steps

1. **Seed a test account + city data** in a disposable Neon branch (or the Preview DB).
2. **Run the authenticated spec:** `npx playwright install chromium` then `npx playwright test` (the auth spec, not just the public smoke spec).
3. **Triage failures** — these are likely fixtures/selectors drifting after the trip→meetup pivot, not product bugs. Fix the spec or the underlying UI as appropriate.

### Verify

- The authenticated spec passes in CI (or locally headed) end to end.
- Mark the corresponding item in [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md) done only after a green browser run.

---

## 7. DEMO_MODE flag

**Why:** `DEMO_MODE` gates the demo auth endpoint (one-click demo login). It must stay `false` in production so the demo bypass is not exposed to real users; it is flipped to `true` only for intentional investor/demo environments.

### Steps

1. **Confirm prod value.** Vercel → Production env → `DEMO_MODE` should be `false` (or unset, which the code treats as disabled).
2. **For a demo build only:** set `DEMO_MODE=true` on a Preview deployment, never on the production domain.

### Verify

- In production, the demo auth endpoint returns 403/404 (disabled).
- On a demo Preview with `DEMO_MODE=true`, one-click demo login works.

---

## After the ops blockers

Once Sentry DSN, Pusher, Resend, the secret audit, the uptime monitor, the E2E green run, and the DEMO_MODE confirmation are all closed, production observability and the core meetup loop are launch-verified. Remaining launch work is product/design polish (auth'd-page design sweep, seed content for the launch city) tracked in [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md).

---

**Last updated:** 2026-06-11
