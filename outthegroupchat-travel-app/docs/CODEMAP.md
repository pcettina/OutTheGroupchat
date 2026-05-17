# OutTheGroupchat — Full Codemap

> Last updated **2026-05-16**. V1 (intent-to-group) shipped Phases 1–4. Trip-planning surface fully archived under `_archive/` directories. Comprehensive reference for agents and developers.
>
> **Naming locked 2026-04-17:** Relationship entity is `Crew` (user-facing term personalizable via `User.crewLabel`). See `docs/PRODUCT_VISION.md` for the V1 intent-to-group product loop.

## Table of Contents

- [Project Overview](#project-overview)
- [Repo Stats](#repo-stats)
- [Directory Structure](#directory-structure)
- [Tech Stack & Dependencies](#tech-stack--dependencies)
- [Prisma Data Model](#prisma-data-model)
- [API Routes](#api-routes)
- [Pages (App Router)](#pages-app-router)
- [Components](#components)
- [Libraries & Utilities](#libraries--utilities)
- [Services](#services)
- [Hooks & Contexts](#hooks--contexts)
- [Tests](#tests)
- [Archived Surface](#archived-surface)
- [Codebase Health](#codebase-health)

---

## Project Overview

Full-stack Next.js 14 meetup-centric social network: "The social media app that wants to get you off your phone."

V1 product loop (per `docs/PRODUCT_VISION.md`):
1. User signals **Intent** to do something (Topic + time window).
2. When ≥2 Crew share intent on the same Topic, a **SubCrew** auto-forms.
3. SubCrew coordinates time/place; venue recommendations surface.
4. Opt-in location visibility powers the **heatmap** (Crew tier + FoF tier).

**App root:** `outthegroupchat-travel-app/`
**Source:** `outthegroupchat-travel-app/src/`

---

## Repo Stats

| Metric | Count |
|---|---|
| Live API route files | **59** (`route.ts` under `src/app/api`, excluding `_archive`) |
| Archived API route files | 13 (under `src/app/api/_archive/`, trip-planning surface) |
| Live test files (`*.test.ts`) | **69** (under `src/__tests__/`, excluding `_archive`) |
| Archived test files | 22 (under `src/__tests__/_archive/`) |
| TS/TSX source files | **~296** (under `src/`, excluding `_archive` + `node_modules`) |
| Prisma models | 40 (includes archived-domain models still in schema) |
| Tests passing | ~1253 Vitest |
| TypeScript errors | 0 |
| ESLint warnings/errors | 0 |
| `console.*` calls in production | 0 |
| Real `any` types | 0 |
| Files >600 lines | 2 (`components/feed/RichFeedItem.tsx` 717L, `app/profile/page.tsx` 623L) |

---

## Directory Structure

```
outthegroupchat-travel-app/
├── prisma/
│   ├── schema.prisma              # Full data model — 40 models
│   ├── migrations/                # Migration history (Neon Postgres)
│   └── seed/                      # Seed orchestration + generators
├── e2e/
│   └── smoke.spec.ts              # Playwright E2E smoke tests
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx, page.tsx, error.tsx, global-error.tsx, not-found.tsx, loading.tsx, metadata.ts
│   │   ├── about/                 # /about — "off your phone" ethos
│   │   ├── auth/                  # signin, signup, reset-password (+ confirm)
│   │   ├── api/                   # 59 live API routes (see API Routes section)
│   │   ├── checkins/              # /checkins, /checkins/[id]
│   │   ├── crew/                  # /crew, /crew/requests
│   │   ├── discover/              # /discover
│   │   ├── feed/                  # /feed
│   │   ├── heatmap/               # /heatmap — V1 Phase 4 (Crew + FoF tiers)
│   │   ├── inspiration/           # /inspiration
│   │   ├── intents/               # /intents, /intents/new
│   │   ├── main/                  # /main
│   │   ├── meetups/               # /meetups, /meetups/new, /meetups/[id]
│   │   ├── notifications/         # /notifications
│   │   ├── onboarding/            # /onboarding
│   │   ├── privacy/, terms/       # Legal pages
│   │   ├── profile/               # /profile, /profile/[userId]
│   │   ├── search/                # /search
│   │   ├── settings/              # /settings, /settings/notifications, /settings/privacy
│   │   ├── subcrews/              # /subcrews, /subcrews/[id] — V1 Phase 3
│   │   └── _archive/trips/        # Archived trip-planning pages
│   ├── components/                # See Components section
│   ├── contexts/                  # RealtimeContext (Pusher), ToastContext
│   ├── hooks/                     # React hooks (Pusher, query helpers)
│   ├── lib/                       # Core libs (auth, prisma, email, sentry, pusher, rate-limit, heatmap, intent, subcrew, hotness, ...)
│   ├── services/                  # Service classes
│   ├── styles/                    # globals.css, themes.css
│   ├── types/                     # TypeScript interfaces
│   ├── middleware.ts              # Route protection
│   ├── _archive/                  # Trip-planning archive (Phase 1, 2026-04-16)
│   └── __tests__/
│       ├── setup.ts, api/, lib/, services/, integration/
│       └── _archive/              # 22 archived trip-era test files
├── docs/                          # Markdown docs (see docs/README.md)
├── public/
├── package.json, next.config.js, tailwind.config.js, tsconfig.json
├── vitest.config.ts, playwright.config.ts
├── instrumentation.ts, instrumentation-client.ts
├── vercel.json, .eslintrc.json, .env.example
```

---

## Tech Stack & Dependencies

### Core
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| React | 18 |
| ORM | Prisma 5 |
| Database | PostgreSQL — **Neon** (via Vercel Marketplace; migrated from Supabase 2026-04-17) |
| Auth | NextAuth.js + Prisma Adapter |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Maps | maplibre-gl + OpenFreeMap (V1 Phase 4 heatmap) |

### Real-time & Communication
| Package | Purpose |
|---|---|
| pusher / pusher-js | Real-time channels (meetups, check-ins, crew) |
| resend | Transactional email |

### Data & State
| Package | Purpose |
|---|---|
| @tanstack/react-query | Server state |
| react-hook-form + @hookform/resolvers + zod | Forms + validation |

### Infrastructure
| Package | Purpose |
|---|---|
| @upstash/ratelimit + @upstash/redis | Rate limiting |
| pino / pino-pretty | Structured logging |
| bcryptjs | Password hashing |
| isomorphic-dompurify | XSS sanitization |
| @sentry/nextjs | Error monitoring |

### Scripts
```
dev           → next dev
build         → prisma generate && next build
lint          → next lint
test          → vitest run
test:e2e      → playwright test
db:push       → prisma db push
db:migrate    → prisma migrate dev
db:generate   → prisma generate
db:studio     → prisma studio
db:seed       → npx tsx prisma/seed/index.ts
```

> **Note (AI surface):** All AI deps + routes removed 2026-04-23 (PR #65). No `openai`/`anthropic`/`ai`/`@ai-sdk/*` deps; no `/api/ai/*` routes; no `src/lib/ai`; no `src/components/ai`.

---

## Prisma Data Model

`prisma/schema.prisma` defines **40 models**. Grouped by domain:

### Auth & users
`Account`, `Session`, `VerificationToken`, `User`, `NotificationPreference`

### Social graph (V1 canonical)
`Crew` (relationship entity; lex-ordered pair), `CrewRelationshipSetting`, `Follow` (`@deprecated`, kept for back-compat)

### V1 intent-to-group loop
`Topic`, `Intent`, `SubCrew`, `SubCrewMember`, `HeatmapContribution`

### Meetups & check-ins
`Meetup`, `MeetupAttendee`, `MeetupInvite`, `CheckIn`, `Venue`, `City`

### Notifications & feed
`Notification`, `Post`, `Poll`, `PollResponse`

### Trip-planning (archived domain — models retained for read-only migrations only)
`Trip`, `TripMember`, `TripInvitation`, `PendingInvitation`, `TripComment`, `TripLike`, `TripSurvey`, `SurveyResponse`, `VotingSession`, `Vote`, `Activity`, `SavedActivity`, `ActivityComment`, `ActivityRating`, `ItineraryDay`, `ItineraryItem`, `ExternalActivity`, `DestinationCache`

> Trip models remain in the schema to avoid destructive migrations on existing rows; all API surface under `_archive/`.

---

## API Routes

**59 live routes** (`src/app/api/**/route.ts`, excluding `_archive`), grouped by domain:

### auth (5)
- `POST /api/auth/[...nextauth]` — NextAuth handler
- `POST /api/auth/demo` — demo-mode login (gated by `DEMO_MODE=true`)
- `POST|PATCH /api/auth/reset-password`
- `POST /api/auth/signup`
- `POST /api/auth/verify-email`

### beta (3)
- `POST /api/beta/initialize-password`
- `POST /api/beta/signup`
- `GET /api/beta/status` — uses Redis `checkRateLimit` + `NextRequest`

### checkins (3) — V1 Phase 5
- `POST|GET /api/checkins`
- `DELETE /api/checkins/[id]`
- `GET /api/checkins/feed` — active Crew check-ins, filtered by `activeUntil > now`

### crew (5) — V1 Phase 3
- `GET /api/crew` — list accepted Crew
- `DELETE /api/crew/[id]`
- `POST /api/crew/request`
- `GET /api/crew/requests`
- `GET /api/crew/status/[userId]`

### cron (3)
- `POST /api/cron` — generic cron handler (Zod-validated Authorization)
- `POST /api/cron/expire-intents` — V1 intent TTL sweeper
- `POST /api/cron/meetup-starting-soon`

### discover (3)
- `POST /api/discover/import`
- `GET /api/discover/recommendations`
- `GET /api/discover/search`

### feed (4)
- `GET /api/feed` — meetup/check-in scoped (POST returns 410)
- `POST /api/feed/comments`
- `POST /api/feed/engagement`
- `POST /api/feed/share`

### geocoding / images (2)
- `GET /api/geocoding`
- `GET /api/images/search`

### health (1)
- `GET /api/health`

### heatmap (1) — V1 Phase 4
- `GET /api/heatmap` — Crew tier + FoF tier, R22 z=15 venue markers, R24 anchor priority

### inspiration (1)
- `GET /api/inspiration`

### intents (4) — V1 Phase 2
- `POST|GET /api/intents`
- `GET|PATCH|DELETE /api/intents/[id]`
- `GET /api/intents/crew` — Crew's active intents
- `GET /api/intents/mine`

### invitations (2)
- `GET /api/invitations`
- `POST /api/invitations/[invitationId]`

### meetups (4) — V1 Phase 4
- `POST|GET /api/meetups`
- `GET|PATCH|DELETE /api/meetups/[id]`
- `POST /api/meetups/[id]/invite`
- `POST /api/meetups/[id]/rsvp`

### newsletter (1)
- `POST /api/newsletter/subscribe`

### notifications (2)
- `GET /api/notifications`
- `PATCH|DELETE /api/notifications/[notificationId]`

### profile (1)
- `GET|PATCH /api/profile`

### pusher (1)
- `POST /api/pusher/auth` — private channel auth

### recommendations (1)
- `GET /api/recommendations`

### search (1)
- `GET /api/search` — people-first (type enum: `all|people|meetups|venues`)

### subcrews (6) — V1 Phase 3
- `GET /api/subcrews/[id]`
- `POST /api/subcrews/[id]/commit`
- `POST /api/subcrews/[id]/join`
- `DELETE /api/subcrews/[id]/members/me`
- `GET /api/subcrews/emerging`
- `GET /api/subcrews/mine`

### topics (1)
- `GET /api/topics`

### users (3)
- `GET /api/users/[userId]`
- `GET|PATCH /api/users/me`
- `PATCH /api/users/privacy`

### venues (1)
- `GET /api/venues/search` — Google Places API wrapper

> The following live route directories were also detected with no `route.ts` (placeholder or in flight): `/api/cron/send-daily-prompts`, `/api/subcrews/[id]/members`, `/api/users/notification-preferences`. Count as 0 toward the 59.

---

## Pages (App Router)

Live pages under `src/app/`:

- `/` (landing), `/about`, `/privacy`, `/terms`
- `/auth/signin`, `/auth/signup`, `/auth/reset-password`, `/auth/reset-password/confirm`
- `/feed`, `/discover`, `/inspiration`, `/notifications`, `/search`
- `/profile`, `/profile/[userId]`
- `/settings`, `/settings/notifications`, `/settings/privacy`
- `/onboarding`
- `/crew`, `/crew/requests`
- `/meetups`, `/meetups/new`, `/meetups/[id]`
- `/checkins`, `/checkins/[id]`
- `/intents`, `/intents/new`
- `/subcrews`, `/subcrews/[id]`
- `/heatmap`
- `/main`

Middleware (`src/middleware.ts`) auth-protects: `/profile/:path*`, `/crew/:path*`, `/meetups/:path*`, `/checkins/:path*`, `/intents/:path*`, `/subcrews/:path*`, `/settings/:path*`, `/heatmap/:path*`, and selected `/api/*` paths.

---

## Components

Live component directories under `src/components/`:

| Directory | Purpose |
|---|---|
| `accessibility/` | FocusTrap, SkipLinks, VisuallyHidden, LiveRegion |
| `auth/` | Auth forms |
| `checkins/` | CheckInButton, LiveActivityCard, NearbyCrewList |
| `discover/` | SearchResults |
| `feed/` | RichFeedItem (717L, split into `rich-item/` subcomponents), FeedItem, CommentThread, ShareModal |
| `heatmap/` | maplibre-gl wrappers, tier toggles, anchor pins |
| `inspiration/` | Inspiration cards |
| `intents/` | Intent composer, Intent list |
| `meetups/` | MeetupCard, MeetupList, CreateMeetupModal (+ `createMeetup/` subdir), RSVPButton, VenuePicker, AttendeeList, MeetupInviteModal |
| `notifications/` | NotificationBell, NotificationCenter, NotificationList |
| `onboarding/` | WelcomeScreen, InterestSelector |
| `privacy/` | Privacy toggles |
| `profile/` | ProfileHeader, ProfileCheckinsSection |
| `search/` | SearchFilters, FilterChip, SearchResults |
| `settings/` | PrivacySettings, NotificationSettings, ProfileSettings, SecuritySettings |
| `social/` | CrewButton, CrewRequestCard, CrewList |
| `subcrews/` | SubCrew detail, join/commit UI |
| `ui/` | Button, Card, Input, Dialog, Avatar, Badge, Toast, etc. |
| `Navigation.tsx` | Top nav (includes Crew, Meetups, Check-ins, Heatmap links) |
| `_archive/` | trips/, surveys/, voting/ — preserved trip-era components |

---

## Libraries & Utilities

`src/lib/`:

| Module | Purpose |
|---|---|
| `auth.ts` | NextAuth config (Google + Credentials) |
| `prisma.ts` | Prisma client singleton |
| `logger.ts` | Pino structured logging (aiLogger, dbLogger, createRequestLogger) |
| `pusher.ts` | Pusher server/client + channel helpers (incl. checkin events) |
| `email.ts` | Resend email entry (re-exports meetup helpers) |
| `email-auth.ts` | Welcome, verification, password-reset emails |
| `email-meetup.ts` | Meetup invite/RSVP/starting-soon emails |
| `rate-limit.ts` | Upstash `checkRateLimit` |
| `sanitize.ts` | XSS prevention (DOMPurify) |
| `sentry.ts` | Centralized Sentry helpers (`captureException`, `addBreadcrumb`, `setUser`) |
| `geocoding.ts` | Nominatim reverse geocoding |
| `invitations.ts` | Invite token gen/validation |
| `api-config.ts`, `api-middleware.ts` | API constants + auth decorators + Zod helpers |
| `providers.tsx` | React Query + Session providers |
| `api/unsplash.ts`, `api/places.ts`, `api/ticketmaster.ts`, `api/flights.ts` | External API wrappers |
| `heatmap/*` | Aggregation (Crew + FoF), anchor selection, contribution writer, FoF graph |
| `hotness/*` | Hotness score calculator |
| `inspiration/*` | Inspiration content helpers |
| `intent/*` | Intent classifier, topic→places mapping |
| `subcrew/*` | Cell anonymization, try-form, window adjacency |
| `validations/*` | Zod schema modules |
| `utils/costs.ts` | Cost calculation |

---

## Services

`src/services/`:

| Service | Purpose |
|---|---|
| `events.service.ts` | Event discovery (Ticketmaster) |
| `_archive/` | recommendation.service.ts, survey.service.ts (trip-era) |

---

## Hooks & Contexts

`src/hooks/`: React Query / Pusher hooks.
`src/contexts/`: `RealtimeContext.tsx` (Pusher connection + notification state), `ToastContext.tsx`.

---

## Tests

**69 live test files** under `src/__tests__/` (excluding `_archive/`), ~1253 tests passing.

### `src/__tests__/api/` (49 files)
`auth.test.ts`, `auth-demo.test.ts`, `auth-signup.test.ts`, `beta.test.ts`, `beta-extended.test.ts`, `beta-initialize-password.test.ts`, `checkins.test.ts`, `checkins-edge.test.ts`, `checkins-pusher.test.ts`, `crew.test.ts`, `cron.test.ts`, `cron-expire-intents.test.ts`, `cron-meetup-starting-soon.test.ts`, `discover-import.test.ts`, `discover-recommendations.test.ts`, `discover-search.test.ts`, `feed.test.ts`, `feed-comments-engagement.test.ts`, `feed-extended.test.ts`, `geocoding-api.test.ts`, `geocoding-images.test.ts`, `health.test.ts`, `heatmap.test.ts`, `images-search.test.ts`, `inspiration.test.ts`, `intents.test.ts`, `invitations.test.ts`, `invitations-post.test.ts`, `meetups.test.ts`, `meetups-id.test.ts`, `meetups-rsvp-invite.test.ts`, `newsletter.test.ts`, `notifications.test.ts`, `notifications-extended.test.ts`, `notifications-rescoped.test.ts`, `privacy-settings.test.ts`, `profile.test.ts`, `pusher-auth.test.ts`, `pusher-feed-social.test.ts`, `recommendations.test.ts`, `reset-password.test.ts`, `search.test.ts`, `share.test.ts`, `subcrew-coordination.test.ts`, `subcrews.test.ts`, `topics.test.ts`, `users.test.ts`, `users-me.test.ts`, `venues-search-places.test.ts`, `verify-email.test.ts`

### `src/__tests__/lib/` (20 files)
`api-middleware.test.ts`, `costs.test.ts`, `email.test.ts`, `geocoding.test.ts`, `heatmap-aggregate.test.ts`, `heatmap-aggregate-fof.test.ts`, `heatmap-anchor-select.test.ts`, `heatmap-contribution-writer.test.ts`, `heatmap-fof-graph.test.ts`, `hotness-score.test.ts`, `intent-classifier.test.ts`, `invitations.test.ts`, `rate-limit.test.ts`, `sanitize.test.ts`, `subcrew-cell-anonymize.test.ts`, `subcrew-try-form.test.ts`, `subcrew-window-adjacency.test.ts`, `topic-places-map.test.ts`, `validations-social.test.ts`

### `src/__tests__/setup.ts`
Global Vitest setup. Mocks include: `prisma.*` (all V1 + meetup + checkin + intent + subcrew + heatmap + crew models with full method coverage), `@/lib/sentry`, `@/lib/logger` (aiLogger, dbLogger, createRequestLogger), `@/lib/pusher`. Use `vi.resetAllMocks()` in `beforeEach` to avoid `mockResolvedValueOnce` queue leakage.

### Mock conventions (per MEMORY.md)
- **Rate-limit re-arm:** `vi.mocked(checkRateLimit).mockResolvedValue({...})` must be re-set in `beforeEach` after `vi.resetAllMocks()` — factory-level defaults are wiped.
- **Static class method mocks:** for services mocked via `vi.mock()` factory, use `(Service.prototype.method as unknown as { mockResolvedValueOnce: Function }).mockResolvedValueOnce(...)`.
- **beta/status route:** uses `NextRequest` not `Request` — test helpers must construct `new NextRequest(url)`.

---

## Archived Surface

### `src/_archive/` and `src/app/_archive/` and `src/app/api/_archive/`
Trip-planning surface archived in V1 Phase 1 (2026-04-16). Includes:
- **API:** `_archive/api/trips/**` (13 route.ts files: trips CRUD, members, activities, itinerary, invitations, suggestions, flights, recommendations, survey, voting), `_archive/api/activities/[activityId]`, `_archive/api/discover/`.
- **Pages:** `_archive/trips/` (list, new, `[tripId]/*`, survey, vote, members).
- **Components:** `components/_archive/trips/`, `_archive/surveys/`, `_archive/voting/`.
- **Services:** `services/_archive/` (recommendation, survey).

### `src/__tests__/_archive/`
22 archived test files for the trip-planning surface (kept for forensic reference only).

### AI surface (fully removed)
PR #65 (2026-04-23) deleted `/api/ai/*`, `src/lib/ai/*`, `src/components/ai/*` and all `openai`/`anthropic`/`ai`/`@ai-sdk/*` deps. Not under `_archive/` — fully deleted.

---

## Codebase Health

| Metric | Value | Target |
|---|---|---|
| Vitest tests passing | ~1253 | green |
| TypeScript errors (`tsc --noEmit`) | 0 | 0 |
| ESLint warnings/errors | 0 | 0 |
| `console.*` in production code | 0 | 0 |
| Real `any` types | 0 | 0 |
| Files >600 lines | 2 (`feed/RichFeedItem.tsx` 717L, `app/profile/page.tsx` 623L) | 0 |
| Prisma schema | valid | valid |
| Live API routes | 59 | — |
| Live test files | 69 | — |
| Source TS/TSX files (excl. archive) | ~296 | — |

### Known production blockers (as of 2026-05-16)
- Sentry DSN missing in Vercel production (error monitoring gap)
- Pusher env vars missing in production (real-time features disabled)
- Resend domain not verified (production email deliverability)
- `DEMO_MODE=false` — demo auth endpoint disabled
- Major dependency upgrades pending: Next 14→16, React 18→19, Prisma 5→7 (see `docs/UPGRADE_PLAN.md`)
- 2 files still >600 lines (refactors tracked in open PRs)

### Infrastructure notes
- **Database:** Neon Postgres via Vercel Marketplace (migrated from Supabase 2026-04-17). Per-PR Neon branches via `create-branch-action@v6` with `prisma migrate deploy`. Note: failed migrations stick on a PR branch across pushes — close+reopen the PR to reset.
- **Real-time:** Pusher (private channels: meetups, check-ins per city, crew).
- **Maps:** maplibre-gl + OpenFreeMap (no Mapbox key required).
- **Deploy:** Vercel.
