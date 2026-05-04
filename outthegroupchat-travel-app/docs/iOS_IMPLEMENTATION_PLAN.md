# OTG iOS Implementation Plan

**Compiled 2026-04-24.** Companion to `LAUNCH_RESEARCH_PORTFOLIO.md`. Scope: getting OutTheGroupchat into the Apple App Store. Synthesis of a 3-agent research swarm (architecture decision, App Review risk profile, codebase mobile-readiness audit).

The launch portfolio's strategic positioning, hot-path UX, trust-and-safety stack, notification charter, NYC GTM playbook, and 8 open questions remain authoritative — this doc adds the iOS layer on top.

---

## 1. Executive summary — the bet

**Recommendation: Expo SDK 54 + Expo Router rewrite for v1 iOS. Hedge with PWA for closed-beta NYC cohort while Expo build is in flight.**

| Path | Build time | App Store risk | Native fidelity | Code reuse | Verdict |
|---|---|---|---|---|---|
| **Expo SDK 54 + Expo Router** (rewrite UI, keep API) | 8-10 weeks | Low | Native | 100% API routes, schema, types, services; 0% UI | ✅ **Recommended** |
| Capacitor 7 wrap of Next.js | 4-6 weeks | High (4.2 WebView wrapper) | WKWebView | ~70% UI + 100% API | Faster but App Store reviewers actively reject "feels like a website" wrappers; NextAuth cookies + WKWebView is a multi-year wound |
| React Native vanilla rewrite | 12-16 weeks | Lowest | Native | 100% API; 0% UI; less ecosystem polish | Over-budget for v1 |
| iOS PWA only | 1-2 weeks | N/A (no App Store) | Safari | 95% | **Cannot satisfy women's-safety brief** — no background geofencing for safe-arrival; APNs install-gated |

**Why Expo specifically (and not Capacitor's 4-week shortcut):**

1. **Tea + TeaOnHer were pulled from the App Store Oct 21, 2025** for Guideline 1.2 + 5.1.2 + 5.6 violations. The bar for IRL-meetup apps tightened sharply. WKWebView wrappers are now a published rejection signal under 4.2.2.
2. **Live Activities** for active SubCrews ("9pm at Lucky Dog · 2 of 3 checked in") only exist on the native path. This is a near-perfect surface for OTG's brand — Lock Screen presence without opening the app, exactly the "off your phone" ethos.
3. **Background geofencing** for safe-arrival check-in is impossible on PWA, unreliable on Capacitor (plugin gaps, transistorsoft license cost), first-class on Expo via `expo-location` TaskManager.
4. **Cold-start performance** matches the brand promise. Native 0.4-0.8s vs WKWebView 1.5-2.5s. The 30-second hot-path target tolerates exactly zero perceptible lag at app open.
5. **Code reuse is actually fine.** OTG's 47 API routes, Prisma schema, Zod validators, Pusher channel logic, email templates, and TypeScript types are 100% reused. Only `src/components/` (~50 React components) gets rewritten as React Native equivalents — and most are simple enough that rewriting in RN is faster than fighting Capacitor's safe-area + keyboard + cookie quirks.

**Trade-off explicitly accepted:** ~4 extra weeks vs Capacitor; second repo (`outthegroupchat-mobile/`) to maintain alongside Next.js web.

**Hedge that costs nothing:** the existing Next.js web app, with the 5 codebase fixes from §10 below, ships as a PWA *today* for the founder-curated 50-user NYC closed beta. This validates the loop and provides early-adopter coverage during the 8-10 weeks Expo is being built. PWA never goes to App Store — it's the desktop + mobile-web fallback only.

---

## 2. Architecture decision — full reasoning

### Why not Capacitor

- **App Store Guideline 4.2.2** — reviewers reject apps that "primarily function as a web view." Median.co, Mobiloud, and Capgo's own 2026 case studies all flag this as the #1 capacitor-app rejection reason. For an IRL-meetup app already entering review under the 1.2/5.1.2 microscope, layering 4.2 on top is unnecessary risk.
- **NextAuth + WKWebView cookies** — documented in `nextauthjs/next-auth#9199`, `ionic-team/capacitor#1373`, `#6302`, `#7085`. The fix involves cross-origin SameSite=None cookies with `partitioned=true`, which works but adds debugging surface area and breaks under iOS Intelligent Tracking Prevention edge cases.
- **No Live Activities path.** Capacitor has no plugin for ActivityKit. The closest workaround is a hand-rolled Swift module — at which point you've already started the rewrite.
- **Cold-start.** WKWebView boot + Vercel network round-trip = 1.5-2.5s on iPhone 14. Native cold-start to first interactive screen (with cached state) = 0.4-0.8s. The hot-path UX charter (LAUNCH_RESEARCH_PORTFOLIO §3) is 30 seconds total; burning 8% of that on app boot is a brand-broken first impression.

### Why not vanilla React Native

The 2026 consensus from React Native blogs, Expo's own docs, and Solito's release notes: "the Expo vs vanilla RN debate is over, Expo won." Vanilla RN means hand-rolling EAS-equivalent build infra, manual APNs cert flow, manual Hermes config, manual New Architecture enablement. Pick this only if Expo's managed workflow forces a boundary OTG hits — it doesn't.

### Why not Solito

Solito 5 (web-first, Next.js + Expo unified, ~99% code share via Tamagui primitives) is genuinely interesting for a 12-month roadmap. For an 8-week sprint, Solito means rewriting both web and mobile UI in Tamagui — a third path, not a free upgrade. Defer to v2 if mobile-web parity becomes a stated goal.

### Why not "PWA only"

Background geolocation for the safe-arrival women's-safety primitive is **impossible** on iOS PWAs. APNs requires manual home-screen install (~10-15× audience drop). No Live Activities. No widgets. No native share sheet. PWA is the closed-beta hedge, not the iOS strategy.

---

## 3. Web/PWA hedge — ship in days, not weeks

While the Expo rewrite is in flight, the existing Next.js app becomes a PWA for the founder-curated NYC closed beta (50-200 users, weeks W-2 to W2 of the launch portfolio's 6-week timeline).

**What "PWA-ifying the web app" means:**

1. Add `public/manifest.json` (PWA-shaped: name, icons 192/512/1024, theme_color `#15110E`, background_color `#15110E`, display `standalone`, start_url `/`)
2. Add `apple-touch-icon` (180×180) + `apple-mobile-web-app-status-bar-style` + `apple-mobile-web-app-capable` meta in `src/app/layout.tsx`
3. Set viewport to `width=device-width, initial-scale=1, viewport-fit=cover` (currently default — no `viewport-fit=cover`)
4. Hand-roll a tiny `sw.js` to cache app shell + critical fonts (`/fonts/Switzer-*.woff2`, `Cabinet*.woff2`) — defer `next-pwa` integration to keep build clean
5. Fix safe-area collisions in `Navigation.tsx` and the 16 `fixed`-positioned modals so users on iOS 17+ don't get notch overlap
6. APNs push via iOS 16.4+ Web Push (limited but functional for daily prompt + group-formation notifications) — requires user to install to home screen first

**PWA limitations to communicate to closed-beta cohort:**
- No background geofencing → safe-arrival check-in works only when app is open
- No Live Activities
- Push notifications require home-screen install (one-time onboarding step)
- Slightly slower cold-start than native

**Why this hedge matters:** the launch portfolio's NYC GTM timeline calls for 50 users in W-2, growing to 600 by W1. If Expo isn't done by W1, the closed beta still ships and validates the loop. Worst case, the public open-signup wave (W3+) waits for the App Store version.

---

## 4. Expo build plan — phased

### Phase A — Foundation & API hardening (Week 1-2, 2 weeks)

**Goal:** repository + auth + push wiring ready before any UI is touched.

- [ ] Create `outthegroupchat-mobile/` repo with Expo SDK 54 scaffold (`pnpm create expo-app`)
- [ ] Configure `app.json` — bundle identifier `com.outthegroupchat.app`, version 1.0.0, build number 1, iOS minimum 16.0 (covers ~96% of active iPhones in 2026)
- [ ] Add EAS (Expo Application Services) build profile + EAS Submit for App Store Connect
- [ ] Apple Developer Program enrollment ($99/yr) — **founder action, see §11 open questions**
- [ ] Generate APNs key via Apple Developer portal; upload to Expo Push for managed push
- [ ] Convert OTG's auth from cookie-based to dual-mode: cookies for web (existing), Bearer tokens for mobile clients. Add `/api/auth/mobile/login` (phone OTP → JWT) and `/api/auth/mobile/refresh`
- [ ] Add `PushSubscription` Prisma model: `userId`, `expoPushToken`, `platform`, `enabled`, `lastSeenAt`
- [ ] Add `POST /api/users/push-token` endpoint for mobile client to register
- [ ] Add `src/lib/push.ts` server module that fans out to Expo Push API alongside existing Pusher broadcasts

### Phase B — Hot-path UI (Weeks 3-5, 3 weeks)

**Goal:** the 30-second hot-path script from LAUNCH_RESEARCH_PORTFOLIO §3 works end-to-end.

- [ ] App scaffold with Expo Router: `app/(tabs)/`, `app/intent/new`, `app/subcrew/[id]`, `app/profile/[id]`, `app/auth/`, `app/_layout.tsx`
- [ ] Last Call palette + Cabinet Grotesk + Switzer fonts (via `expo-font`)
- [ ] Tonight screen (home): preset chip stack with smart defaults
- [ ] Intent capture sheet (single screen, time slider, neighborhood, identity-mode)
- [ ] Biometric resume on app open via `expo-local-authentication`
- [ ] Native haptics on commit via `expo-haptics`
- [ ] Optimistic UI for intent submission with undo-toast (no modals)
- [ ] SubCrew formation alert handler — receives Expo Push → routes to SubCrew screen
- [ ] Auto-close-after-commit timer (6s dim → background)
- [ ] Crew list + Profile screens

### Phase C — Trust & safety surfaces (Weeks 5-7, 2 weeks, overlaps Phase B)

**Goal:** everything Apple Review demands for IRL-meetup apps + everything LAUNCH_RESEARCH_PORTFOLIO §5 calls launch-blocking.

- [ ] Block flow on every profile (long-press → menu → Block + Report)
- [ ] Report flow on every UGC surface (Crew, Meetup, Message, Profile, Check-in) — 4-category picker + free-text + confirmation
- [ ] EULA with zero-tolerance clause, accepted at signup with timestamp persisted
- [ ] Age gate at signup (DOB picker, hard 18+ block)
- [ ] Selfie liveness verification via Persona iOS SDK (or Stripe Identity Liveness — see §11 open questions)
- [ ] Safe-arrival check-in: 30-min push post-meetup-start, escalates at 60 min (server-side cron + Expo Push)
- [ ] Emergency contact: one-tap share live location for meetup duration via `expo-location` background mode
- [ ] Panic button on active-meetup screen: opens 911 dialer + sends SMS to emergency contact + posts Report row server-side
- [ ] Account deletion in `Settings → Account → Delete` (already required by Guideline 5.1.1(v))
- [ ] Server-side keyword filter on Crew names + Meetup titles + bios

### Phase D — App Store polish (Week 7-8, 1 week)

**Goal:** reviewable build with all Apple requirements satisfied.

- [ ] App icon set (1024×1024 + auto-generated sizes via Expo)
- [ ] Splash screen with OTG logo on `#15110E` background
- [ ] iPhone screenshots (6.7" + 6.5" + 5.5" required) — Tonight screen, intent commit, SubCrew formation, profile, Crew list
- [ ] App Store metadata: name "OutTheGroupchat", subtitle "the app that wants you off your phone", keywords (≤100 chars), description (≤4000 chars), promotional text (≤170 chars)
- [ ] Privacy Nutrition Label in App Store Connect (matches Privacy Manifest exactly — see §7)
- [ ] `PrivacyInfo.xcprivacy` file in iOS bundle with all required-reason API declarations
- [ ] Age rating: 17+ (frequent/intense mature themes — required because real-world meeting + alcohol context)
- [ ] Demo account `appreview+nyc@outthegroupchat.com` seeded with active NYC Crew/Topic activity for reviewer
- [ ] Sign in with Apple — **defer for v1** (not required since email + phone OTP only; reconsider in v1.5 if frictionful)
- [ ] App Store Connect submission: paste verbatim Review Notes from §8

### Phase E — TestFlight + launch (Week 8-10, 2 weeks)

- [ ] TestFlight internal testers: founder + ops team (up to 100)
- [ ] TestFlight external beta (Beta App Review ~24h): 50 founder-curated NYC seeds (already onboarded via PWA, transition them to TestFlight build)
- [ ] One round of bug-bash week
- [ ] App Store submission to public review (~24-48h typical 2026; can be 1-7 days under heavy review)
- [ ] Launch synchronized with NYC GTM W1 ("Group Chat Funeral" night)

**Total: 10 weeks worst case, 8 weeks if Phases B and C parallelize cleanly.**

---

## 5. App Store Review risk profile

The five rejection vectors most relevant to OTG, ranked by likelihood:

1. **Guideline 1.2 (UGC Safety) — highest risk.** Tea + TeaOnHer pulled Oct 21 2025. Reviewer expects: Block + Report on every content surface, EULA with zero-tolerance clause, **published 24-hour SLA** for moderation, and a way to demonstrate the moderation queue actually works. **Mitigation: §3 ships every required UGC safety primitive in Phase C; §8 verbatim Review Notes documents the SLA + EULA explicitly.**
2. **Guideline 1.1.4 (Hookup framing).** Apple has clarified casual dating is allowed but apps used as "cover for objectification" are pulled. **Mitigation:** marketing copy + Review Notes lead with "meetup coordinator, not dating, not anonymous social." Voice and design language reinforce this — sentence case, no engagement-bait, no swiping mechanic.
3. **Guideline 5.1.2 (Personal data without permission).** Tea's failure included exposed user data (incl. minors). **Mitigation:** the 3-axis privacy model is OTG's defensive moat here. Document opt-in location visibility in Review Notes. Confirm raw lat/lng never serializes to other users (already audited in `LAUNCH_RESEARCH_PORTFOLIO §8` step 10).
4. **Privacy Manifest missing/incomplete.** Mandatory since May 1, 2024. Auto-rejection. **Mitigation: §7 below.**
5. **Guideline 4.2 / 2.1 (Minimum Functionality).** New social apps with empty feeds reject. Reviewer hits a city with zero Crew/Topic activity = "incomplete." **Mitigation:** seeded demo account `appreview+nyc@` with active NYC Crew/Topic data — reviewer must see the loop work end-to-end on first try.

**App Review timeline 2026 reality:** typical 24-48h, can stretch to 1-7 days for IRL-meetup category. Plan for 5-day worst case before public launch.

---

## 6. Required features for submission (binary checklist)

| # | Feature | Phase | Status today |
|---|---|---|---|
| 1 | Block on every profile | C | ❌ `CrewStatus.BLOCKED` enum exists, no API/UI |
| 2 | Report on every UGC surface (Profile, Meetup, Message, Crew, Check-in) | C | ❌ Not built |
| 3 | EULA with zero-tolerance clause + signup acceptance timestamp | C | ⚠️ Privacy/Terms pages exist, EULA-as-distinct-doc needed |
| 4 | 24-hour moderation SLA + staffed `trust@` inbox | C + ops | ❌ Not staffed |
| 5 | Server-side keyword filter on user-generated text | C | ❌ Not built |
| 6 | Age gate at signup (DOB, hard 18+) + 17+ App Store rating | A | ❌ No DOB column in schema |
| 7 | Account deletion in Settings (DELETE /api/users/me) | A | ❌ Endpoint missing (flagged in `LAUNCH_RESEARCH_PORTFOLIO §8` step 6) |
| 8 | Privacy Manifest (`PrivacyInfo.xcprivacy`) | D | ❌ Mobile shell doesn't exist yet |
| 9 | Privacy Nutrition Label matching manifest | D | ❌ App Store Connect step |
| 10 | Working demo account with seeded NYC Crew/Topic activity | D | ❌ Will set up at Phase D |
| 11 | New-account rate limits (3 Crew creates / 24h, 10 messages / hr first 7 days) | A | ⚠️ `checkRateLimit` exists; per-account stricter limits needed |
| 12 | Selfie liveness verification (Persona) | C | ❌ Not built — vendor decision pending (§11) |
| 13 | Safe-arrival check-in cron | C | ❌ Not built |
| 14 | Emergency contact + panic button | C | ❌ Not built |
| 15 | Bundle ID + APNs cert + Apple Developer enrollment | A | ❌ Founder action |

**Items 1, 2, 6, 7, 8 are App Store-blocking.** 11 strongly recommended (Apple's 2025 guidance explicitly mentions rate limits for new social apps).

---

## 7. Privacy Manifest skeleton

`PrivacyInfo.xcprivacy` for the iOS bundle — declared in Expo's iOS extension config:

```xml
NSPrivacyTracking: false
NSPrivacyTrackingDomains: []

NSPrivacyCollectedDataTypes:
  - Email Address       — App Functionality, Linked, NOT for tracking
  - Phone Number        — App Functionality, Linked, NOT for tracking
  - Name                — App Functionality, Linked
  - Photos (selfie via Persona)  — App Functionality, Linked
  - Precise Location    — App Functionality, Linked, USER OPT-IN
  - User Content (messages, Crew posts) — App Functionality, Linked
  - Crash Data (Sentry) — Analytics, NOT linked, NOT tracking
  - Performance Data (Sentry) — Analytics, NOT linked, NOT tracking

NSPrivacyAccessedAPITypes:
  - UserDefaults (CA92.1 — App Functionality)
  - FileTimestamp (C617.1 — File Management) [if used]
  - SystemBootTime (35F9.1) [if used by performance instrumentation]
```

**Bundled SDK manifests to verify before submission:**
- `expo` / Expo runtime — Expo provides this automatically
- Sentry — provides one (confirmed in [Sentry Apple Privacy Manifest docs](https://docs.sentry.io/platforms/apple/data-management/apple-privacy-manifest/))
- Persona iOS SDK — verify with vendor at integration time
- Pusher iOS SDK — likely missing as of 2026; may need shim manifest in Pods Pre-Install hook
- Expo Push (handles APNs internally) — covered by Expo

**ATT (App Tracking Transparency):** OTG does NOT request — no IDFA tracking, no advertiser SDKs. Do NOT include `NSUserTrackingUsageDescription` in Info.plist.

---

## 8. Verbatim Review Notes (paste-ready)

Copy this into App Store Connect → App Information → Review Information → Notes:

```
Demo account:
  Email:    appreview+nyc@outthegroupchat.com
  Password: [SET BEFORE EACH SUBMIT — rotate]
  Phone OTP bypass code: 000000
  Region: New York City (seeded with active Crews + Topics)

OutTheGroupchat is a meetup coordination app for adults 18+ in NYC. Users
signal an intent ("Topic" — e.g. coffee, run club, gallery walk), are
auto-matched into a small "Crew" of 2-6 once others share the same intent
nearby, then coordinate a venue and meet IN PERSON. The app is explicitly
NOT a dating app and not anonymous social.

Safety + UGC moderation (Guideline 1.2):
  - All users agree to the in-app EULA at signup with explicit zero-
    tolerance for objectionable content and abuse.
  - Every Crew, Meetup, Message, Profile, and Check-in has a Report
    button (Profile > [...] > Report; Meetup > [...] > Report).
  - Every profile has a Block option that prevents all future contact
    and removes the user from shared Crews.
  - Reports are triaged by our moderation queue with a published 24-hour
    SLA. Email: trust@outthegroupchat.com.
  - Content is keyword-filtered server-side at create time on Crew
    names, Meetup titles, and profile bios.
  - New accounts are rate-limited (max 3 Crew creates / 24h, 10 messages
    / hr in first 7 days).
  - Account deletion: Settings > Account > Delete Account (immediate,
    irrevocable).

Age gate: 18+ DOB-required at signup; under-18 accounts are blocked and
not stored.

Privacy:
  - Location visibility is OPT-IN per session and only shared with a
    user's confirmed Crew (never public, never sold).
  - We do NOT use the IDFA. NSUserTrackingUsageDescription is not
    requested. No third-party advertising SDKs.
  - Selfie liveness via Persona is required for trust-tier upgrades
    only (not for app entry); raw biometric data is never stored on
    our servers.

Test flow for reviewer:
  1. Sign in with credentials above.
  2. Tap "Signal Intent" → "Coffee" → Confirm → you'll be matched
     into the seeded Crew "AppReview-NYC-Coffee" within 30 seconds.
  3. Tap a member → [...] → Report and Block (both flows demonstrable).
  4. Settings → Account → Delete Account demonstrates deletion.
  5. Active meetup screen has Panic button (top-right, opens 911 dialer
     + emergency-contact SMS).

Contact: appstore-contact@outthegroupchat.com (24h SLA).
```

---

## 9. Submission checklist (15 ordered steps)

1. Apple Developer Program enrollment ($99/yr) — founder action
2. Bundle ID `com.outthegroupchat.app` registered, App Store Connect record created
3. APNs key generated, uploaded to Expo Push
4. Phase A complete: mobile auth + push wiring on server, mobile app bootstrap building locally
5. Phase B complete: hot-path UX functional end-to-end (30-second commit)
6. Phase C complete: Block + Report + EULA + age-gate + safe-arrival + panic-button + selfie liveness shipped
7. App Store Connect: age questionnaire = 17+ (frequent/intense mature themes, alcohol context)
8. App Store Connect: Privacy Nutrition Label populated to match `PrivacyInfo.xcprivacy` exactly
9. ATT confirmed off — `NSUserTrackingUsageDescription` not present in Info.plist
10. Demo account `appreview+nyc@outthegroupchat.com` seeded with active NYC Crew/Topic data; password set fresh; phone OTP bypass code documented
11. EAS Build production iOS: `eas build --platform ios --profile production`
12. EAS Submit: `eas submit --platform ios` (uses Transporter under the hood; `xcrun altool` is deprecated 2026)
13. TestFlight internal first (founder + ops team, up to 100), then external 50 NYC seeds (Beta App Review ~24h)
14. Public App Store submission with Review Notes from §8 pasted into App Information; respond to reviewer messages within 4 hours
15. `trust@outthegroupchat.com` inbox staffed for first 30 days post-launch (Tea was pulled because Apple's complaints went unanswered for too long)

---

## 10. Codebase changes required (web side, before/during Expo build)

The Expo app talks to the existing Vercel API. Five changes on the web side are required before the mobile build can authenticate, push, and locate:

| # | Change | Path | Effort | Phase |
|---|---|---|---|---|
| 1 | **Bearer-token auth alongside cookies.** Add `/api/auth/mobile/login` (phone OTP → JWT) and `/api/auth/mobile/refresh`. Keep cookie-based for web. NextAuth's JWT session strategy already supports this; needs a thin adapter. | `src/app/api/auth/mobile/*`, `src/lib/auth.ts` | M | A |
| 2 | **`PushSubscription` Prisma model + register endpoint.** `userId`, `expoPushToken`, `platform`, `enabled`, `lastSeenAt`. `POST /api/users/push-token`. | `prisma/schema.prisma`, `src/app/api/users/push-token/route.ts` | S | A |
| 3 | **Server-side Expo Push fan-out.** New `src/lib/push.ts` that takes a userId + payload, looks up active push tokens, calls Expo Push API. Wire into existing notification dispatch (group-formation, daily-prompt, safe-arrival cron). Coexists with Pusher (in-app real-time) and Resend (email). | `src/lib/push.ts`, hook into `src/lib/email.ts` notification triggers | M | A |
| 4 | **Geolocation API contract.** Vision spec requires opt-in location for venue/Crew matching but client never requests it (zero `navigator.geolocation` calls in current codebase). Define the request/response contract on existing endpoints (`POST /api/checkins`, `POST /api/intents`). The web client gets it later (PWA hedge); the Expo client implements first. | `src/app/api/{checkins,intents}/route.ts` (verify lat/lng accepted + obfuscated correctly), document the contract in `docs/CODEMAP.md` | S | A |
| 5 | **Account deletion endpoint** (already flagged in `LAUNCH_RESEARCH_PORTFOLIO §8` step 6). `DELETE /api/users/me` cascades through Prisma. Required for both App Store + privacy policy. | `src/app/api/users/me/route.ts` | M | A |

**Bonus codebase fixes flagged by audit (worth doing during PWA hedge):**

- `next.config.js:62` CSP — drop `https://api.openai.com` and `https://api.anthropic.com` from `connect-src` (dead since AI removal in PR #65)
- `src/middleware.ts:6` — `getAllowedOrigins()` should be programmatic from request `Origin` header rather than static; safer for future native clients
- 16 `fixed`-positioned modals — wrap with `react-native-safe-area-context`-equivalent on mobile, add `padding-bottom: env(safe-area-inset-bottom)` on web for PWA polish
- 325 `hover:` Tailwind classes — wrap with `@media (hover: hover)` to prevent tap-and-stick on iOS PWA

---

## 11. Open questions for founder review

These are *additional* to the 8 open questions in `LAUNCH_RESEARCH_PORTFOLIO §10`. Decisions needed before Phase A starts:

1. **Apple Developer account holder** — sole proprietor in your name, or LLC entity? LLC requires DUNS number (free, ~3 days to issue) and changes the tax/liability surface.
2. **Bundle identifier** — `com.outthegroupchat.app` proposed. Lock now; cannot change after first App Store submission without a fresh listing.
3. **iOS minimum version** — recommend 16.0 (covers ~96% of active iPhones in 2026; required for iOS Web Push fallback in PWA hedge). iOS 17+ enables more Live Activities features. Iow 16+ is safer.
4. **Selfie liveness vendor** — Persona vs Stripe Identity Liveness vs Veriff. Persona is OTG-shaped (fraud-tuned, $0.50-1.50/check); Stripe is operationally simpler if you're already on Stripe; Veriff is enterprise-tier. **Need 1-vendor pick before Phase C.**
5. **Sign in with Apple** — defer for v1 (not required since email + phone OTP). Add in v1.5 if friction telemetry shows users dropping at signup. **Recommend: defer.**
6. **iPad support** — recommend defer entirely (iPhone-only for v1). iPad social-meetup is a tiny use case and adds App Store screenshot requirements.
7. **Android (Capacitor or Expo for Android)** — Expo SDK 54 supports both platforms with the same codebase. Recommend ship iOS first (W7-W8), Android 4 weeks later (W11-W12). Or punt Android to v1.5.
8. **PWA hedge approval** — green-light shipping the existing Next.js with the 5 audit fixes as a PWA for closed-beta starting W-2? (Recommend: yes, parallel-track with Expo.)
9. **EULA legal review** — zero-tolerance UGC clause, 18+ certification, IRL-meeting risk acknowledgment. Lawyer review needed before Phase C ends. **Founder action.**
10. **Mod team staffing for `trust@`** — App Review demands a 24h SLA. One FT + on-call rotation needed before submission. **Budget question.**
11. **Live Activities scope for v1** — minimum viable: SubCrew countdown ("9pm at Lucky Dog · 2 of 3 checked in"). Maximum useful: per-meetup live status, post-meet "Did you arrive safely?" prompt on Lock Screen. Recommend minimum for v1, expand in v1.5.
12. **WidgetKit Lock Screen widget** — "Tonight at X" prompt as a Lock Screen widget would be on-brand but adds a Swift module + complications. Defer to v1.5? (Recommend yes.)

---

## 12. Risk register (iOS-specific, additive to LAUNCH_RESEARCH_PORTFOLIO §9)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **App Review rejection on first submission** | Medium-high (IRL-meetup category) | Medium (1-7 day delay, fix and resubmit) | §8 verbatim Review Notes; demo account seeded; all 15 required features in §6 shipped before submit; `trust@` inbox responsive |
| 2 | **Apple's 2026 UGC policy tightens further** (post-Tea) | Medium | High | Over-comply on Block/Report/SLA; never market as "anonymous" or "dating"; keep moderation queue audit-able |
| 3 | **Persona iOS SDK changes pricing or breaks** | Low-medium | Medium | Document Stripe Identity as fallback vendor; abstract liveness behind `src/lib/identity.ts` |
| 4 | **Expo SDK breaking change during build** | Low | Medium | Lock to SDK 54.0.0 in `package.json`; do not bump SDK during the 8-10 week build window |
| 5 | **APNs delivery failure or quota cost** | Low | Low | Expo Push proxies APNs; monitor delivery via Expo dashboard; alert at <95% delivery |
| 6 | **PWA hedge confuses early users** ("why doesn't notification work?") | Medium | Low (cohort is 50 founder-curated) | Onboarding script explicitly covers home-screen install + notification permission; transition to TestFlight in W2-W3 |
| 7 | **Code duplication drift** between web and mobile UI | High over 12 months | Medium | Shared `src/types/`, `src/lib/api/`, Zod schemas as single source of truth; quarterly architecture review |
| 8 | **Background location triggers Apple "Always" scrutiny** | Medium | Medium | Only request "When In Use" by default; "Always" only when user opts into safe-arrival; document in Review Notes |

---

## Appendix — sources

- **Architecture decision** sources: Capacitor 7 update guide (capacitorjs.com/docs/updating/7-0); Capacitor + Next.js compatibility issues (vercel/next.js#59437, #67503, #64660); NextAuth + Capacitor (nextauthjs#9199, ionic-team/capacitor#7085, #1373, #6302); App Store webview rejection patterns (mobiloud.com, median.co); PWA iOS limitations (mobiloud.com, magicbell.com); Expo SDK 54 (expo.dev/blog, expo.dev/changelog/sdk-53); expo-local-authentication, expo-location, expo-widgets docs; React Native in 2026 consensus posts (medium.com/@andy.a.g); Solito 5 release (dev.to/redbar0n); Next.js + Capacitor case studies (nextnative.dev, capgo.app)
- **App Review** sources: Apple App Review Guidelines (developer.apple.com/app-store/review/guidelines/); Tea + TeaOnHer pull (TechCrunch 2025-10-22, MacRumors 2025-10-22, Daring Fireball 2025-10-22); Apple age-rating expansion (TechCrunch 2025-07-25); Privacy Manifest enforcement (Bitrise 2024); Sentry Apple Privacy Manifest docs; TestFlight overview + external testers (Apple Developer); App Review Guidelines 2025 checklists (NextNative, AppInstitute); Sign in with Apple guideline 4.8 (Apple Developer Forums #124006); Yubo age verification (yubo.live)
- **Codebase audit**: direct read of `next.config.js`, `package.json`, `src/middleware.ts`, `src/app/layout.tsx`, `src/lib/auth.ts`, `src/lib/pusher.ts`, `prisma/schema.prisma`, `src/components/Navigation.tsx`, plus grep across 122 client components

---

## 13. Resolutions (Q1-Q12, locked 2026-04-25)

Recommendations on the 12 open questions in §11. Each is a proposed lock; founder may override before Phase A starts. Format mirrors `PRODUCT_VISION.md` R1-R25.

**Q1. Apple Developer account holder — sole proprietor with Organization enrollment (founder confirmed 2026-04-25).** Sole prop legal status (no LLC); enroll Apple Developer as Organization to preserve brand presence on App Store listing.

Path:
1. NY county DBA filing for "OutTheGroupchat" (~$50-100, ~1-2 days, no LLC needed)
2. Free DUNS lookup via D&B (~3 days to issue if not already on file)
3. Apple Developer Program Organization enrollment ($99/yr, ~1-7 days approval) — App Store displays "OutTheGroupchat" as developer name

**Total prep time: ~1 week parallel-tracked alongside Phase A** (DBA + DUNS run while other prerequisites land; not on the critical path).

LLC conversion still deferred per founder; personal liability for IRL-meetup-app incidents accepted for v1. **Revisit LLC conversion pre-public-launch (W4-W6) if traction validates the product** — DBA + DUNS already filed reduces friction of a future LLC restructure.

**Q2. Bundle identifier — `com.outthegroupchat.app`.** Standard reverse-DNS. Locked now, immutable post-first-submission.

**Q3. iOS minimum version — iOS 16.0.** Covers ~96% of active iPhones in 2026; required for iOS Web Push fallback in the PWA hedge. Live Activities and Lock Screen widgets are available on iOS 16+ (with iOS 17+ adding Dynamic Island per-event and interactive widgets — conditionally enable when present rather than gating addressable audience).

**Q4. Selfie liveness vendor — Persona.** Fraud-tuned for IRL-meetup use case, $0.50-1.50/verification, dedicated selfie-liveness SDK with strong iOS ergonomics. Stripe Identity is a KYC-shaped flow (overkill, slower UX). Veriff is enterprise-tier (overkill cost). OTG is not on Stripe today, so "operational simplicity" argument doesn't apply. Abstract behind `src/lib/identity.ts` so vendor swap stays cheap.

**Q5. Sign in with Apple — defer to v1.5.** Not required by Guideline 4.8.5 since OTG uses email + phone OTP only (no third-party social login). Adds OAuth flow + App Store metadata + account-linking edge cases without addressing a real friction signal. Reconsider if signup conversion <70% in closed beta telemetry.

**Q6. iPad support — defer entirely.** iPad meetup is not a primary use case, adds App Store screenshot/layout requirements. iPhone-only filter at App Store Connect. Reconsider in v2 if telemetry shows >5% iPad attempts.

**Q7. Android — sequential, 4 weeks behind iOS (W11-W12).** Same Expo codebase, marginal incremental cost. Android is ~30% of US smartphone share in 2026 and OTG's NYC demo skews younger (higher Android share). Don't punt to v1.5; the user portfolio's NYC GTM W6 milestone (5,000+ users) leaves real audience on the table without Android.

**Q8. PWA hedge — green-light.** Ship Next.js as PWA in W-2 alongside Expo Phase A start. Parallel-track. Closed-beta cohort is 50 founder-curated users — PWA limitations (no background geofencing, push-via-home-screen-install) are explainable in onboarding. Transition cohort to TestFlight build in W7-W8 when external Beta App Review clears.

**Q9. EULA legal review — engage lawyer W3-W4.** Deliverable due W6 (EULA + updated Privacy Policy covering V1 scope: Intent venueId, CheckIn lat/lng, 3-axis privacy, Persona biometric handling, retention windows, deletion rights). Leaves buffer for Phase C integration in W7. Founder action: select counsel by W2.

**Q10. Mod team staffing — founder + 1 part-time contractor for first 30 days post-launch.** App Review demands 24h SLA; staffing model satisfies it for the closed-beta + W1 public-launch volume. Re-evaluate at W5 post-launch whether to hire FT trust-and-safety lead. The published SLA is the contract; the staffing scales with volume. Have `trust@outthegroupchat.com` inbox forwarded to founder + contractor with PagerDuty-style alerting.

**Q11. Live Activities scope for v1 — minimum (SubCrew countdown only).** "9pm at Lucky Dog · 2 of 3 checked in" on Lock Screen. Adds ActivityKit infrastructure once; safe-arrival prompt uses standard push (doesn't need Live Activity surface). Expand to per-meetup status + post-meet check-in prompt in v1.5.

**Q12. WidgetKit Lock Screen widget — defer to v1.5.** "Tonight at X" widget is on-brand but adds Swift module + complications (1-2 weeks to Phase D). Daily prompt push notification is sufficient for v1. Reconsider if v1.5 telemetry shows daily-prompt open rate <30%.

---

*Last updated 2026-04-25. Sequenced after `LAUNCH_RESEARCH_PORTFOLIO.md`. Next review: pre-Phase-A kick-off.*
