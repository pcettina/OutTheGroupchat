# OutTheGroupchat - Full Implementation Stack

## Overview

OutTheGroupchat is a full-stack meetup-centric social network — "the social media app that wants to get you off your phone." V1 product implements the intent-to-group loop: signal intent → auto-group at ≥2 Crew on same Topic → coordinate + venue recs → opt-in location visibility (heatmap).

*Last Updated: 2026-05-16*

---

## Architecture Diagram

```
+-----------------------------------------------------------------------------+
|                              CLIENT LAYER                                    |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |  Next.js 14 |  |  React 18   |  |   Framer    |  |  Tailwind   |         |
|  |  App Router |  |   18.2.0    |  |   Motion 11 |  |    CSS 3    |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|                                                                              |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |  TanStack   |  |   Pusher    |  |  React Hook |  |   Lucide    |         |
|  |   Query 5   |  |     JS 8    |  |    Form 7   |  |   React     |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|                                                                              |
|  +-----------------------------+                                            |
|  | maplibre-gl + OpenFreeMap   |  (V1 Phase 4 heatmap basemap)              |
|  +-----------------------------+                                            |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                              API LAYER                                       |
|  +-----------------------------------------------------------------------+  |
|  |              Next.js API Routes (App Router, 59 routes)                |  |
|  |  /api/crew        /api/meetups    /api/checkins      /api/intents     |  |
|  |  /api/heatmap     /api/venues     /api/users         /api/feed        |  |
|  |  /api/notifications  /api/search  /api/auth          /api/profile     |  |
|  |  /api/beta        /api/cron       /api/pusher/auth   /api/geocoding   |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |  NextAuth   |  |    Zod      |  |   Prisma    |  |   Pusher    |         |
|  |  4.24.7     |  | 3.25.0      |  |   5.22.0    |  |   Server 5  |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|                                                                              |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |  Upstash    |  |    pino     |  |   Resend    |  | DOMPurify   |         |
|  | Rate Limit  |  |  Logging    |  |   Email     |  |  Sanitize   |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                            SERVICE LAYER                                     |
|  +---------------+  +---------------+  +---------------+                    |
|  |     Crew      |  |    Meetup     |  |  Heatmap      |                    |
|  |   Service     |  |   Service     |  | Contribution  |                    |
|  +---------------+  +---------------+  +---------------+                    |
|                                                                              |
|  +---------------+  +---------------+                                       |
|  |    Events     |  | Recommendation|                                       |
|  |   Service     |  |    Service    |                                       |
|  +---------------+  +---------------+                                       |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                            DATA LAYER                                        |
|  +-----------------------------------------------------------------------+  |
|  |        Neon PostgreSQL (via Vercel Marketplace, branch-per-PR)         |  |
|  |  Users | Crew | CrewMember | Intent | Meetup | MeetupAttendee          |  |
|  |  CheckIn | HeatmapContribution | Notification | TripComment | TripLike |  |
|  |  VerificationToken | PendingInvitation                                 |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |                         Prisma ORM 5.22.0                              |  |
|  |  Schema | Migrations | Client | Studio | Seed                          |  |
|  +-----------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                         EXTERNAL SERVICES                                    |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |   Google    |  |   Resend    |  |   Sentry    |  |  OpenFreeMap|         |
|  |   Places    |  |   Email     |  |   Errors    |  |  Tiles      |         |
|  | [key needed]|  |  [active]   |  | [DSN missing]| | [public]    |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|                                                                              |
|  +-------------+  +-------------+                                           |
|  |  Nominatim  |  |  Unsplash   |                                           |
|  |  Geocoding  |  |   Images    |                                           |
|  +-------------+  +-------------+                                           |
+-----------------------------------------------------------------------------+
```

---

## Core Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | ^14.1.3 | React framework with App Router |
| **React** | ^18.2.0 | UI component library |
| **TypeScript** | ^5.4.2 | Type safety (strict mode, 0 `any` types) |
| **Tailwind CSS** | ^3.4.1 | Utility-first CSS framework |
| **Framer Motion** | ^11.0.0 | Animation library |
| **TanStack Query** | ^5.59.0 | Server state management |
| **React Hook Form** | ^7.54.2 | Form handling |
| **@hookform/resolvers** | ^3.10.0 | Zod adapter for RHF |
| **Zod** | ^3.25.0 | Schema validation (all API inputs) |
| **Lucide React** | ^0.576.0 | Icon library |
| **date-fns** | ^3.6.0 | Date manipulation |
| **maplibre-gl** | ^4.7.1 | Heatmap basemap rendering (V1 Phase 4) |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js API Routes** | ^14.1.3 | REST API (59 endpoints as of 2026-05-16) |
| **Prisma** | ^5.22.0 | Database ORM |
| **@prisma/client** | ^5.22.0 | Type-safe DB client |
| **Neon PostgreSQL** | 15+ | Serverless Postgres via Vercel Marketplace (migrated from Supabase 2026-04-17) |
| **NextAuth.js** | ^4.24.7 | Authentication (credentials provider) |
| **@auth/prisma-adapter** | ^2.8.0 | NextAuth Prisma adapter |
| **bcryptjs** | ^3.0.2 | Password hashing |
| **pino** | ^10.1.0 | Structured logging (no bare `console.*`) |
| **pino-pretty** | ^13.1.3 | Pretty dev logs |
| **Resend** | ^6.6.0 | Transactional email (verification, Crew, meetup invites) |
| **isomorphic-dompurify** | ^2.34.0 | XSS sanitization |
| **axios** | ^1.8.4 | External API HTTP client |

### Rate Limiting & Caching

| Technology | Version | Purpose |
|------------|---------|---------|
| **@upstash/ratelimit** | ^2.0.7 | Redis-based rate limiting |
| **@upstash/redis** | ^1.35.8 | Redis client |

### Real-time

| Technology | Version | Purpose |
|------------|---------|---------|
| **Pusher** | ^5.2.0 | Server-side WebSocket (Crew/meetup/check-in events) |
| **Pusher-js** | ^8.4.0 | Client-side WebSocket |

> Note: Pusher is configured but environment variables are missing in Vercel production as of 2026-05-16. Real-time events fall back to silent.

### Monitoring & Observability

| Technology | Version | Purpose |
|------------|---------|---------|
| **@sentry/nextjs** | ^10.43.0 | Error tracking (needs real DSN in Vercel) |
| **@vercel/analytics** | ^2.0.1 | Web analytics (active in production) |

### Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vitest** | ^4.0.18 | Unit/integration test runner |
| **@playwright/test** | ^1.48.0 | E2E testing |

> As of 2026-05-16: ~1253 Vitest tests on `main`, 0 failures, 0 TSC errors, 0 lint warnings. Playwright smoke spec ships in CI via `.github/workflows/ci.yml`; authenticated flows pending (Phase 8).

### Deployment & Tooling

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vercel** | — | Hosting + edge network + Cron + Marketplace (Neon) |
| **ESLint** | ^8.57.1 | Linting (`eslint-config-next` ^14.2.35) |
| **PostCSS / Autoprefixer** | ^8.4.35 / ^10.4.18 | CSS pipeline |
| **TypeScript** | ^5.4.2 | Compiler |
| **@types/node** | ^20.11.25 | Node 20 typings |

### External APIs

| Service | Purpose | Status |
|---------|---------|--------|
| **Google Places** | Venue search for meetups | API key needed |
| **OpenFreeMap** | Map tile basemap (heatmap) | Public, no key |
| **Nominatim** | Geocoding | Public (rate-limited) |
| **Unsplash** | Discovery images | Working |
| **Resend** | Transactional email | Active (domain verification pending) |

> **AI dependencies removed (PR #65, 2026-04-23):** no `@ai-sdk/*`, no `ai` package, no `/api/ai/*` routes, no `src/lib/ai`, no `src/components/ai`.

---

## Database Schema (V1)

### Core Models (Actual, as of 2026-05-16)

```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  name            String
  password        String?
  emailVerified   DateTime?
  image           String?
  city            String?
  bio             String?
  phone           String?
  preferences     Json?
  lastActive      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // V1 relations
  crewMembers       CrewMember[]
  intents           Intent[]
  meetupsHosted     Meetup[]      @relation("host")
  meetupAttendances MeetupAttendee[]
  checkIns          CheckIn[]
  heatmapContribs   HeatmapContribution[]
  notifications     Notification[]
}

model Crew {
  id          String       @id @default(cuid())
  crewLabel   String       // Lexicographic ordering enforced
  activeUntil DateTime
  createdAt   DateTime     @default(now())
  members     CrewMember[]
  intents     Intent[]
  meetups     Meetup[]
}

model Intent {
  id        String   @id @default(cuid())
  topic     String   // Auto-groups at >=2 Crew on same Topic
  userId    String
  crewId    String?
  expiresAt DateTime
}

model Meetup {
  id          String   @id @default(cuid())
  hostId      String
  crewId      String?
  title       String
  venueId     String?  // Google Places place_id
  startsAt    DateTime
  endsAt      DateTime
  attendees   MeetupAttendee[]
}

model CheckIn {
  id           String          @id @default(cuid())
  userId       String
  visibility   CheckInVisibility  // PUBLIC | CREW | PRIVATE
  lat          Float
  lng          Float
  activeUntil  DateTime
}

model HeatmapContribution {
  id        String   @id @default(cuid())
  userId    String
  lat       Float
  lng       Float
  weight    Float
  source    String   // "commit" | "checkin"
  createdAt DateTime @default(now())
}
```

### Enums

```prisma
enum CheckInVisibility {
  PUBLIC | CREW | PRIVATE
}

enum NotificationType {
  CREW_INVITE | CREW_ACCEPTED | MEETUP_INVITE | MEETUP_RSVP
  MEETUP_STARTING_SOON | CREW_CHECKED_IN_NEARBY | ...
}
```

> Note: Legacy trip models (`Trip`, `Activity`, `TripSurvey`, etc.) remain in the schema for archived data but are no longer surfaced in the V1 product. Trip-planning UI is parked under `src/_archive/`.

---

## API Endpoints (59 total as of 2026-05-16)

High-level groups (see `docs/V1_API_ROUTES.md` for the full list):

### V1 Core
- `/api/crew` + sub-routes — Crew create, invite, accept, list members, leave
- `/api/intents` + sub-routes — signal intent, list active, auto-grouping triggers
- `/api/meetups` + sub-routes — create, RSVP, invite, detail, list
- `/api/checkins` + sub-routes — POST/GET own, GET active Crew feed, DELETE
- `/api/heatmap` — Crew tier + FoF tier contribution reads
- `/api/venues/search` — Google Places venue discovery

### Auth
- `/api/auth/signup`, `/api/auth/verify-email`, `/api/auth/reset-password`, `/api/auth/demo`

### Users & Social
- `/api/users/me`, `/api/users/[userId]`, `/api/notifications`, `/api/feed` (+ comments / engagement / share), `/api/search` (people-first), `/api/profile/[userId]`

### System
- `/api/cron` (CRON_SECRET protected, includes MEETUP_STARTING_SOON)
- `/api/pusher/auth`, `/api/geocoding`, `/api/images/search`
- `/api/beta/signup`, `/api/beta/status` (Redis-backed rate limit), `/api/beta/initialize-password`

---

## File Structure (Actual, 2026-05-16)

```
src/
+-- app/                          # Next.js App Router
|   +-- api/                      # API Routes (59 endpoints)
|   |   +-- auth/                 # signup, verify-email, reset-password, demo
|   |   +-- beta/                 # Beta program endpoints
|   |   +-- checkins/             # V1 check-in routes
|   |   +-- crew/                 # V1 Crew routes
|   |   +-- cron/route.ts         # Background jobs (includes MEETUP_STARTING_SOON)
|   |   +-- feed/                 # Feed, comments, engagement, share
|   |   +-- geocoding/route.ts    # Nominatim geocoding
|   |   +-- heatmap/              # Crew + FoF tier reads
|   |   +-- images/search/        # Unsplash
|   |   +-- intents/              # V1 intent loop
|   |   +-- invitations/          # Crew/meetup invitations
|   |   +-- meetups/              # V1 meetup routes
|   |   +-- notifications/        # User notifications
|   |   +-- profile/[userId]/     # Public profile
|   |   +-- pusher/auth/route.ts  # Pusher channel auth
|   |   +-- search/route.ts       # People-first search
|   |   +-- users/                # User profiles
|   |   +-- venues/search/        # Google Places venue search
|   +-- about/page.tsx            # "Off your phone" ethos
|   +-- checkins/page.tsx         # "Who's Out Tonight?"
|   +-- crew/                     # Crew UI pages
|   +-- heatmap/page.tsx          # maplibre-gl heatmap
|   +-- meetups/                  # Meetups list + new + [id]
|   +-- profile/[userId]/page.tsx
|   +-- privacy/page.tsx
|   +-- terms/page.tsx
|   +-- layout.tsx                # OG/Twitter Card meta tags
|   +-- page.tsx
|   +-- not-found.tsx
|   +-- error.tsx
|   +-- global-error.tsx
|
+-- _archive/                     # Trip-planning code parked for reference
|
+-- components/
|   +-- ui/                       # Base components
|   +-- crew/                     # CrewButton, CrewList
|   +-- meetups/                  # MeetupCard, MeetupList, CreateMeetupModal, RSVPButton, VenuePicker
|   +-- checkins/                 # CheckInButton, LiveActivityCard, NearbyCrewList
|   +-- heatmap/                  # Heatmap layer components
|   +-- feed/                     # RichFeedItem (refactored), FeedItemHeader, FeedItemActions, ...
|   +-- profile/                  # ProfileCheckinsSection, ProfileStatsTab
|   +-- Navigation.tsx
|
+-- hooks/
|   +-- usePusher.ts
|   +-- useCrew.ts
|
+-- lib/
|   +-- api/                      # External API integrations (places, unsplash)
|   +-- prisma.ts
|   +-- pusher.ts                 # +triggerCheckinEvent, +getCityCheckinChannel
|   +-- auth.ts
|   +-- email.ts                  # Resend wrapper + meetup helpers
|   +-- email-auth.ts             # Welcome/verification/reset emails
|   +-- email-meetup.ts           # Meetup invite/RSVP/starting-soon emails
|   +-- geocoding.ts              # Nominatim
|   +-- logger.ts                 # pino structured logging
|   +-- rate-limit.ts             # Upstash Redis rate limiting
|   +-- sanitize.ts               # DOMPurify wrapper
|   +-- sentry.ts                 # Sentry wrappers (addBreadcrumb, captureException, setUser)
|   +-- api-config.ts
|   +-- api-middleware.ts
|   +-- providers.tsx
|
+-- services/
|   +-- crew.service.ts
|   +-- meetup.service.ts
|   +-- events.service.ts
|   +-- recommendation.service.ts
|
+-- styles/
|   +-- globals.css
|
+-- types/
|   +-- checkin.ts
|   +-- meetup.ts
|   +-- index.ts
|
+-- __tests__/
|   +-- setup.ts                  # Prisma mocks (incl. checkIn, crew, meetup, intent, heatmap)
    (~1253 tests on main as of 2026-05-16)

e2e/
+-- smoke.spec.ts                 # Playwright smoke
+-- (authenticated flows pending — Phase 8)
```

---

## Environment Variables

```bash
# Database (Neon via Vercel Marketplace)
DATABASE_URL="postgresql://..."          # Pooled
DIRECT_URL="postgresql://..."            # Direct (for prisma migrate)

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."                    # Must be 32+ chars in production

# Real-time
PUSHER_APP_ID=""                         # MISSING in Vercel production
PUSHER_KEY=""
PUSHER_SECRET=""
PUSHER_CLUSTER="us2"
NEXT_PUBLIC_PUSHER_KEY=""
NEXT_PUBLIC_PUSHER_CLUSTER="us2"

# Email
RESEND_API_KEY=""                        # Set; domain verification pending

# Rate Limiting (Upstash)
UPSTASH_REDIS_REST_URL=""                # Set
UPSTASH_REDIS_REST_TOKEN=""              # Set

# Monitoring
SENTRY_DSN=""                            # Installed; MISSING real DSN in Vercel

# External APIs
GOOGLE_PLACES_API_KEY=""                 # Needed for venue search
GOOGLE_CLIENT_ID=""                      # OAuth (planned Phase 9)
GOOGLE_CLIENT_SECRET=""

# Cron
CRON_SECRET=""

# Beta
N8N_API_KEY=""                           # Required for /api/beta/initialize-password
DEMO_MODE=""                             # Set to "true" to enable /api/auth/demo

# Logging
LOG_LEVEL=""                             # pino level: info | debug | warn | error
```

---

## Deployment Configuration

### Vercel Settings

```json
{
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron", "schedule": "0 0 * * *" },
    { "path": "/api/cron/meetup-starting-soon", "schedule": "*/5 * * * *" }
  ],
  "functions": {
    "app/api/cron/route.ts": { "maxDuration": 300 }
  }
}
```

### Neon Branch-Per-PR

Every PR gets its own Neon branch with `prisma migrate deploy` applied via GitHub Actions. Production migrations land via the `ops/production-neon-migration.yml` workflow (PR #90).

### Build Commands

```bash
npm run dev          # Next dev server
npm run build        # prisma generate + next build
npm run db:push      # Push schema to database
npm run db:migrate   # Create + apply migration (dev)
npm run db:generate  # Regenerate Prisma client
npm run db:seed      # Seed (npx tsx prisma/seed/index.ts)
npm run test         # Run Vitest test suite (~1253 tests)
npm run test:e2e     # Run Playwright E2E (CI installs chromium)
npm run lint         # ESLint
```

---

## Security Measures (Current)

1. **Authentication**: NextAuth.js session-based + bcryptjs password hashing
2. **Authorization**: Role-based + `getServerSession()` guards on all protected routes
3. **Input Validation**: Zod schemas on all API endpoints
4. **Rate Limiting**: Upstash Redis-backed on all high-risk routes (incl. `/api/beta/status`)
5. **CORS**: Configured in `vercel.json` and `next.config.js`
6. **Security Headers**: HSTS, X-Frame-Options, Content-Security-Policy
7. **Logging**: pino structured logging (0 bare `console.*` in production code)
8. **Type Safety**: TypeScript strict mode, 0 `any` types
9. **XSS**: React + isomorphic-dompurify
10. **SQL Injection**: Prisma ORM parameterized queries
11. **Check-in Privacy**: Per-check-in visibility (PUBLIC | CREW | PRIVATE) + activeUntil clamping [now+30min, now+12h]

---

## Code Quality Metrics (2026-05-16)

| Metric | Target | Current |
|--------|--------|---------|
| `any` types | 0 | ~12 (legacy) |
| `console.*` in prod | 0 | ~30 (legacy) |
| Files > 600 lines | 0 | 0 |
| TSC errors | 0 | 0 |
| Test count | 500+ | ~1253 |
| API routes | — | 59 |
| Lint warnings/errors | 0 | 0 |

---

## Performance Optimizations

1. **React Query Caching**: optimistic updates on Crew/RSVP actions
2. **Database Indexing**: Prisma indexes on Crew/Meetup/CheckIn relations
3. **Image Optimization**: Next.js `<Image>` component (0 raw `<img>` tags)
4. **Code Splitting**: App Router automatic per-route splitting
5. **Edge Caching**: Vercel edge network
6. **Structured Logging**: pino for low-overhead production logging
7. **Heatmap Tile Strategy**: OpenFreeMap public tile CDN (no per-request cost)
8. **Check-in TTL**: activeUntil filter on heatmap reads prunes stale contributions

---

*Last Updated: 2026-05-16*
