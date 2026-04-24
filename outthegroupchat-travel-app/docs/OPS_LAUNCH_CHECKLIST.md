# Ops Launch Checklist

**Scope:** the three remaining Lane A launch blockers as of 2026-04-23. All three are dashboard/ops work — no code changes needed. Code is already wired; these steps just put the keys in Vercel so production can read them.

1. [Sentry DSN](#1-sentry-dsn) — error monitoring
2. [Pusher env vars](#2-pusher-env-vars) — real-time features
3. [Resend domain verification](#3-resend-domain-verification) — production email deliverability

See [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md) for the full launch picture. See [`VERCEL_ENV_SETUP.md`](./VERCEL_ENV_SETUP.md) for the base env reference.

---

## 1. Sentry DSN

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
- Or run the quick check against `/api/ai/chat` — but that route is gone after PR #65. Use any existing route that throws on bad input (e.g. `POST /api/meetups` with `{}`).

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

## After all three

Lane A is closed. Remaining launch work rolls into Lane B (design sweep — continuing `/design-component` passes on auth'd pages) and Lane C (product depth — hero illustration, signature micro-interactions, NYC seed content). See [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md).

---

**Last updated:** 2026-04-23
