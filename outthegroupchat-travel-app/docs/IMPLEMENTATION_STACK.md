# OutTheGroupchat - Full Implementation Stack

## Overview

OutTheGroupchat is a full-stack, meetup-centric social network — "the social media app that wants to get you off your phone." Members build a **Crew** (mutual connections), signal **Intent** on shared **Topics**, get **auto-grouped** when 2+ Crew land on the same Topic, coordinate **Meetups**, broadcast live **Check-ins**, and see Crew presence on a **heatmap**.

The product pivoted from a collaborative group-trip-planning app to this in-person meetup network. All legacy trip-planning code is archived under `src/_archive/` and is no longer part of the live product. The **AI surface was fully removed** (PR #65, 2026-04-23): there are no OpenAI/Anthropic dependencies, no `/api/ai/*` routes, and no `src/lib/ai`.

*Last Updated: 2026-06-10*

---

## Architecture Diagram

```
+-----------------------------------------------------------------------------+
|                              CLIENT LAYER                                    |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |  Next.js 14 |  |  React 18   |  |   Framer    |  |  Tailwind   |         |
|  |  App Router |  |   18.2.0    |  |   Motion    |  |    CSS 3    |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|                                                                              |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |  TanStack   |  |   Pusher    |  |  React Hook |  |  MapLibre   |         |
|  |   Query 5   |  |     JS      |  |    Form     |  |  GL (heatmap)        |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                              API LAYER                                       |
|  +-----------------------------------------------------------------------+  |
|  |                  Next.js API Routes (App Router)                       |  |
|  |  /api/crew     /api/meetups   /api/checkins      /api/notifications    |  |
|  |  /api/feed     /api/users     /api/search        /api/venues           |  |
|  |  /api/auth     /api/beta      /api/heatmap       /api/discover         |  |
|  |  /api/cron     /api/pusher/auth                                        |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |  NextAuth   |  |    Zod      |  |   Prisma    |  |   Pusher    |         |
|  |  4.24.7     |  | 3.25.0      |  |   5.22.0    |  |   Server   |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|                                                                              |
|  +-------------+  +-------------+  +-------------+                          |
|  |  Upstash    |  |    pino     |  |   Resend    |                          |
|  | Rate Limit  |  |  Logging    |  |   Email     |                          |
|  +-------------+  +-------------+  +-------------+                          |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                            SERVICE LAYER                                     |
|  +---------------+  +---------------+  +---------------+                    |
|  |    Survey     |  | Recommendation|  |    Events     |                    |
|  |   Service     |  |    Service    |  |   Service     |                    |
|  +---------------+  +---------------+  +---------------+                    |
|  (legacy services retained where still referenced; trip-only logic archived)|
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                            DATA LAYER                                        |
|  +-----------------------------------------------------------------------+  |
|  |               Neon PostgreSQL Database (via Vercel Marketplace)        |  |
|  |  User | Crew | Topic | Intent | MeetupGroup | Meetup | CheckIn         |  |
|  |  Notification | HeatmapContribution | VerificationToken                |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |                         Prisma ORM 5.22.0                              |  |
|  |  Schema | Migrations (per-PR Neon branch) | Client | Studio            |  |
|  +-----------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                         EXTERNAL SERVICES                                    |
|  +-------------+  +-------------+  +-------------+                          |
|  |   Google    |  | OpenFreeMap |  |   Resend    |                          |
|  |   Places    |  | (map tiles) |  |   Email     |                          |
|  | (venue recs)|  |             |  |             |                          |
|  +-------------+  +-------------+  +-------------+                          |
+-----------------------------------------------------------------------------+
```

> Note: The AI/LLM stack that previously sat in this diagram (OpenAI, embeddings, Vercel AI SDK) was removed in PR #65 and is intentionally absent. Travel-booking external services (Amadeus, Ticketmaster, Eventbrite) belonged to the archived trip-planning product and are no longer wired into the live app.

---

## Core Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | ^14.1.3 | React framework with App Router |
| **React** | ^18.2.0 | UI component library |
| **TypeScript** | ^5.4.2 | Type safety (strict mode) |
| **Tailwind CSS** | ^3.4.1 | Utility-first CSS framework |
| **Framer Motion** | ^11.0.0 | Animation library |
| **TanStack Query** | ^5.59.0 | Server state management |
| **React Hook Form** | ^7.54.2 | Form handling |
| **Zod** | ^3.25.0 | Schema validation (all API inputs) |
| **Lucide React** | ^0.576.0 | Icon library |
| **MapLibre GL** | ^4.7.1 | Interactive heatmap rendering (OpenFreeMap tiles) |
| **date-fns** | ^3.6.0 | Date manipulation |
| **axios** | ^1.8.4 | HTTP client |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js API Routes** | ^14.1.3 | REST API (61 routes as of 2026-06-09) |
| **Prisma** | ^5.22.0 | Database ORM |
| **PostgreSQL** | 15+ | Relational database via **Neon** (Vercel Marketplace) |
| **NextAuth.js** | ^4.24.7 | Authentication (credentials provider, Prisma adapter) |
| **bcryptjs** | ^3.0.2 | Password hashing |
| **pino** | ^10.1.0 | Structured logging (replaces console.*) |
| **Resend** | ^6.6.0 | Transactional email (verification, Crew, meetup, check-in) |
| **isomorphic-dompurify** | ^2.34.0 | XSS sanitization |

### Rate Limiting & Caching

| Technology | Version | Purpose |
|------------|---------|---------|
| **@upstash/ratelimit** | ^2.0.7 | Redis-based rate limiting |
| **@upstash/redis** | ^1.35.8 | Redis client |

### Real-time

| Technology | Version | Purpose |
|------------|---------|---------|
| **Pusher** | ^5.2.0 | Server-side WebSocket (check-ins, meetup updates) |
| **Pusher-js** | ^8.4.0 | Client-side WebSocket |

> Note: Pusher is configured in code but environment variables are missing in Vercel production as of 2026-06-09 — real-time features are disabled in prod until set.

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

> As of 2026-06-09: ~1814 Vitest tests across 91 test files. Playwright smoke spec exists; authenticated E2E flows are still in progress (Phase 8 #5).

### External APIs

| Service | Purpose | Status |
|---------|---------|--------|
| **Google Places** | Venue search / meetup venue recommendations | API key not set in prod |
| **OpenFreeMap** | Map tiles for the heatmap | No key required |

> **Removed / archived:** AI providers (OpenAI/Anthropic) removed entirely (PR #65). Amadeus (flights), Ticketmaster, and Eventbrite belonged to the archived trip-planning product and are no longer integrated.

---

## Database Schema

The schema is centered on the meetup loop: people, their Crew, the Topics they signal Intent on, the groups that auto-form, the Meetups they coordinate, live Check-ins, and notifications. The full authoritative schema lives in `prisma/schema.prisma`; the models below are the load-bearing entities.

### Core Models (meetup domain)

- **User** — identity, profile (`name`, `city`, `bio`, `image`), `lastActive` presence, notification preferences.
- **Crew** — mutual connection between two users (request → accept), the basis for grouping and presence visibility.
- **Topic** — a meetup interest/activity (carries a `displayName` label).
- **Intent** — a user signalling they want to do a Topic within a time window.
- **MeetupGroup** — auto-formed when **2+ Crew** signal Intent on the same Topic.
- **Meetup** — a coordinated in-person gathering with attendees/RSVPs and an optional venue.
- **CheckIn** — live presence broadcast with `CheckInVisibility` (PUBLIC | CREW | PRIVATE) and a clamped `activeUntil` window.
- **HeatmapContribution** — anonymized location signals written on commit and check-in, surfaced on the MapLibre heatmap.
- **Notification** — typed notifications (daily prompt, per-member intent, group formation, crew-checked-in-nearby, meetup events).
- **VerificationToken** — email verification on signup.

> Legacy trip-planning models (Trip, Activity, TripSurvey, VotingSession, ItineraryDay/Item, etc.) exist only in archived code paths and are not part of the live meetup product.

### Representative Enums

```prisma
enum CheckInVisibility {
  PUBLIC | CREW | PRIVATE
}
```

> `NotificationType` was pruned to the meetup domain during the pivot; see `prisma/schema.prisma` for the current member list.

---

## API Endpoints (61 routes as of 2026-06-09)

The live API is organized around the meetup loop. The canonical, always-current route inventory is maintained in `docs/API_STATUS.md` and `docs/CODEMAP.md` — the groupings below summarize the surface.

### Crew & Social

| Area | Description |
|------|-------------|
| `/api/crew/*` | Crew requests, accept/decline, list, removal |
| `/api/users/me`, `/api/users/[userId]` | Profiles (public profile at `/profile/[userId]`) |
| `/api/feed/*` | People-first activity feed (comments, engagement, share) |
| `/api/search` | People-first global search (types: all / people / meetups / venues) |
| `/api/notifications/*` | Typed notifications + preferences |

### Meetups, Intents & Check-ins

| Area | Description |
|------|-------------|
| `/api/meetups/*` | Create/list/detail, RSVP, invite |
| `/api/checkins/*` | Create check-in, active Crew feed, delete |
| `/api/venues/search` | Google Places venue search for meetups |
| `/api/heatmap/*` | Crew/FoF presence heatmap data |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Registration + verification email |
| GET | `/api/auth/verify-email` | Email token verification |
| POST / PATCH | `/api/auth/reset-password` | Initiate / confirm password reset |
| POST | `/api/auth/demo` | Demo auth (requires `DEMO_MODE=true`) |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron/*` | Background jobs (CRON_SECRET protected; e.g. MEETUP_STARTING_SOON) |
| POST | `/api/pusher/auth` | Pusher channel authentication |
| GET | `/api/health` | Health check |
| GET/POST | `/api/beta/*` | Beta signup + status (status route uses `NextRequest` for rate-limit header access) |

> **Removed:** `/api/ai/*` routes (suggest-meetups, icebreakers, chat, recommend, etc.) were deleted in PR #65 and must not be reintroduced without explicit direction. Trip-only routes (`/api/trips/*` survey/voting/itinerary/flights) belong to the archived product.

---

## Environment Variables

```bash
# Database (Neon via Vercel Marketplace)
DATABASE_URL="postgresql://..."

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."              # Must be 32+ chars in production

# Real-time
PUSHER_APP_ID=""                  # MISSING in Vercel production
PUSHER_KEY=""
PUSHER_SECRET=""
PUSHER_CLUSTER="us2"
NEXT_PUBLIC_PUSHER_KEY=""
NEXT_PUBLIC_PUSHER_CLUSTER="us2"

# Email
RESEND_API_KEY=""                 # Set; domain verification pending

# Rate Limiting
UPSTASH_REDIS_REST_URL=""         # Set
UPSTASH_REDIS_REST_TOKEN=""       # Set

# Monitoring
SENTRY_DSN=""                     # Installed; MISSING real DSN in Vercel

# Venues / Maps
GOOGLE_PLACES_API_KEY=""          # Venue search; not set in prod
# Heatmap tiles use OpenFreeMap (no key required)

# Cron
CRON_SECRET=""

# Beta
N8N_API_KEY=""                    # Required for /api/beta/initialize-password
DEMO_MODE=""                      # Set to "true" to enable /api/auth/demo

# Logging
LOG_LEVEL=""                      # pino log level (info, debug, warn, error)
```

> Removed from the live env surface: AI provider keys (OpenAI/Anthropic) and the archived trip-planning booking keys (AMADEUS_*, TICKETMASTER_API_KEY, EVENTBRITE_API_KEY).

---

## Deployment Configuration

### Vercel Settings

```json
{
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron", "schedule": "0 0 * * *" }
  ],
  "functions": {
    "app/api/cron/route.ts": { "maxDuration": 300 }
  }
}
```

> Database is Neon (Vercel Marketplace). Every PR gets a Neon branch with `prisma migrate deploy` applied for isolated testing.

### Build Commands

```bash
npm run build        # prisma generate + next build
npm run db:push      # Push schema to database
npm run db:migrate   # Create migrations
npm run db:generate  # Regenerate Prisma client
npm run test         # Run Vitest test suite (~1814 tests)
npm run test:e2e     # Run Playwright E2E
```

---

## Security Measures (Current)

1. **Authentication**: NextAuth.js with session-based auth, bcrypt password hashing, Prisma adapter
2. **Authorization**: `getServerSession()` auth guards on all protected routes; Crew/visibility checks on presence data
3. **Input Validation**: Zod schemas on all API endpoints
4. **Rate Limiting**: Upstash Redis-based rate limiting on high-risk routes
5. **CORS**: Configured in next.config.js
6. **Security Headers**: HSTS, X-Frame-Options, Content-Security-Policy
7. **Logging**: pino structured logging
8. **Type Safety**: TypeScript strict mode
9. **XSS**: React + isomorphic-dompurify
10. **SQL Injection**: Prisma ORM parameterized queries
11. **Presence privacy**: Check-in visibility (PUBLIC/CREW/PRIVATE) and opt-in heatmap contribution

---

## Code Quality Metrics (2026-06-09)

| Metric | Target | Current |
|--------|--------|---------|
| `console.*` in prod | 0 | tracked (see CLAUDE.md) |
| `any` types | 0 | tracked (see CLAUDE.md) |
| Files > 600 lines (prod) | 0 | tracked (see CODEMAP.md) |
| TSC errors | 0 | 0 |
| Test count | 500+ | ~1814 |
| Test files | - | 91 |
| API routes | - | 61 |
| Lint warnings/errors | 0 | 0 |

> Live counts (routes, test files, file-length offenders) are maintained authoritatively in `docs/API_STATUS.md` and `docs/CODEMAP.md`.

---

## Performance Optimizations

1. **React Query Caching**: stale-time caching, optimistic updates
2. **Database Indexing**: Prisma indexes on relations and presence queries
3. **Image Optimization**: Next.js `<Image>` component
4. **Code Splitting**: App Router automatic per-route splitting
5. **Edge Caching**: Vercel edge network
6. **Structured Logging**: pino for low-overhead production logging

---

*Last Updated: 2026-06-10*
