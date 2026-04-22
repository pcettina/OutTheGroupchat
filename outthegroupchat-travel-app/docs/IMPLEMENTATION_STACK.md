# OutTheGroupchat - Full Implementation Stack

## Overview

OutTheGroupchat is a full-stack **meetup-centric social network** built with modern web technologies, real-time infrastructure, and AI-powered recommendations. The platform connects friend crews for real-world hangouts — spontaneous check-ins, planned meetups, and social discovery.

*Last Updated: 2026-04-22*

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
|  |  TanStack   |  |   Pusher    |  |  React Hook |  |   Lucide    |         |
|  |   Query 5   |  |     JS      |  |    Form     |  |   React     |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                              API LAYER                                       |
|  +-----------------------------------------------------------------------+  |
|  |                  Next.js API Routes (App Router)                       |  |
|  |  /api/meetups   /api/checkins  /api/crew        /api/notifications     |  |
|  |  /api/feed      /api/users     /api/search      /api/venues            |  |
|  |  /api/auth      /api/beta      /api/ai          /api/cron              |  |
|  |  /api/pusher/auth              /api/geocoding   /api/images            |  |
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
|  | Recommendation|  |    Events     |  |   Email       |                    |
|  |    Service    |  |   Service     |  |   Meetup/Crew |                    |
|  +---------------+  +---------------+  +---------------+                    |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |                         AI Integration Layer                           |  |
|  |  +-------------+  +-------------+  +-------------+                    |  |
|  |  |   OpenAI    |  |  Anthropic  |  |  Embeddings |                    |  |
|  |  |   GPT-4o    |  |   Claude    |  |  In-memory  |                    |  |
|  |  |   (primary) |  |  (optional) |  |  Vector     |                    |  |
|  |  +-------------+  +-------------+  +-------------+                    |  |
|  +-----------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                            DATA LAYER                                        |
|  +-----------------------------------------------------------------------+  |
|  |                   Neon PostgreSQL Database                             |  |
|  |  Users | Crews | Meetups | CheckIns | Notifications | Feed             |  |
|  |  MeetupRSVP | MeetupInvite | Venue | ActivityComment                  |  |
|  |  VerificationToken | PendingInvitation                                 |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |                         Prisma ORM 5.22.0                              |  |
|  |  Schema | Migrations | Client | Studio                                 |  |
|  +-----------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------+
|                         EXTERNAL SERVICES                                    |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |   Google    |  |  Ticketmaster|  |   Pusher    |  |  Upstash   |         |
|  |   Places    |  |   Events    |  |  Real-time  |  |   Redis    |         |
|  | [configured]|  | [key needed]|  | [env vars   |  |  [active]  |         |
|  |             |  |             |  |  missing]   |  |            |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
+-----------------------------------------------------------------------------+
```

---

## Core Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 14.1.3 | React framework with App Router |
| **React** | 18.2.0 | UI component library |
| **TypeScript** | 5.4.2 | Type safety (strict mode, 0 `any` types) |
| **Tailwind CSS** | 3.4.1 | Utility-first CSS framework |
| **Framer Motion** | 11.0.0 | Animation library |
| **TanStack Query** | 5.59.0 | Server state management |
| **React Hook Form** | 7.54.2 | Form handling |
| **Zod** | 3.25.0 | Schema validation (all API inputs) |
| **Lucide React** | 0.576.0 | Icon library |
| **date-fns** | 3.6.0 | Date manipulation |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js API Routes** | 14.1.3 | REST API (52 endpoints as of 2026-04-22) |
| **Prisma** | 5.22.0 | Database ORM |
| **PostgreSQL** | 15+ | Relational database via Neon (migrated from Supabase 2026-04-17) |
| **NextAuth.js** | 4.24.7 | Authentication (credentials provider) |
| **bcryptjs** | 3.0.2 | Password hashing |
| **pino** | 10.1.0 | Structured logging (replaces console.*) |
| **Resend** | 6.6.0 | Transactional email (verification, meetup invites, crew emails) |
| **isomorphic-dompurify** | 2.34.0 | XSS sanitization |

### Rate Limiting & Caching

| Technology | Version | Purpose |
|------------|---------|---------|
| **@upstash/ratelimit** | 2.0.7 | Redis-based rate limiting |
| **@upstash/redis** | 1.35.8 | Redis client (rate limiting + beta status) |

### AI & ML

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vercel AI SDK** | 3.4.14 | AI provider abstraction + streaming |
| **@ai-sdk/openai** | 0.0.70 | OpenAI GPT-4o integration (primary) |
| **@ai-sdk/anthropic** | 0.0.54 | Claude integration (optional, key not required) |
| **Custom Embeddings** | - | In-memory vector search (cosine similarity) |

> Note: All AI routes return 503 gracefully when OPENAI_API_KEY is absent, preventing request hangs in production.

### Real-time

| Technology | Version | Purpose |
|------------|---------|---------|
| **Pusher** | 5.2.0 | Server-side WebSocket |
| **Pusher-js** | 8.4.0 | Client-side WebSocket |

> Note: Pusher powers meetup real-time updates and city-channel check-in broadcasts. Environment variables are missing in Vercel production as of 2026-04-22.

### Monitoring & Observability

| Technology | Version | Purpose |
|------------|---------|---------|
| **@sentry/nextjs** | 10.43.0 | Error tracking (needs real DSN in Vercel) |
| **@vercel/analytics** | 2.0.1 | Web analytics (active in production) |

### Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vitest** | 4.0.18 | Unit/integration test runner |
| **@playwright/test** | 1.48.0 | E2E testing (browsers need install) |

> As of 2026-04-22: 1048 Vitest tests across 55+ test files, 0 failures. Playwright spec exists; browsers need `npx playwright install chromium`.

### Database Hosting

| Technology | Purpose | Status |
|-----------|---------|--------|
| **Neon PostgreSQL** | Primary database (branch-per-PR workflow) | Active — migrated from Supabase 2026-04-17 |

> Branch-per-PR workflow: every PR automatically gets a Neon branch with `prisma migrate deploy` applied and a schema-diff comment posted.

### External APIs

| Service | Purpose | Status |
|---------|---------|--------|
| **Google Places** | Venue search for meetups | Configured |
| **Ticketmaster** | Event discovery | API key not set |
| **Resend** | Transactional email | Active (domain verification pending) |
| **Upstash Redis** | Rate limiting + beta status | Active |

---

## Database Schema

### Core Models (as of 2026-04-22)

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

  crewsInitiated  Crew[]    @relation("initiator")
  crewsReceived   Crew[]    @relation("recipient")
  notifications   Notification[]
  meetupsOrganized Meetup[] @relation("organizer")
  meetupRSVPs     MeetupRSVP[]
  meetupInvites   MeetupInvite[]
  checkIns        CheckIn[]
  activityComments ActivityComment[]
}

model Crew {
  id          String     @id @default(cuid())
  initiatorId String
  recipientId String
  status      CrewStatus @default(PENDING)
  label       String?
  activeUntil DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  initiator   User       @relation("initiator", fields: [initiatorId], references: [id])
  recipient   User       @relation("recipient", fields: [recipientId], references: [id])
}

model Meetup {
  id          String       @id @default(cuid())
  title       String
  description String?
  venue       Json?        // Google Places venue data
  scheduledAt DateTime
  status      MeetupStatus @default(UPCOMING)
  isPublic    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  organizerId String
  organizer   User         @relation("organizer", fields: [organizerId], references: [id])
  rsvps       MeetupRSVP[]
  invites     MeetupInvite[]
}

model CheckIn {
  id          String            @id @default(cuid())
  userId      String
  venue       Json?
  note        String?
  visibility  CheckInVisibility @default(PUBLIC)
  activeUntil DateTime
  createdAt   DateTime          @default(now())

  user        User              @relation(fields: [userId], references: [id])
}
```

### Key Enums

```prisma
enum CrewStatus {
  PENDING | ACCEPTED | REJECTED | BLOCKED
}

enum MeetupStatus {
  UPCOMING | STARTING_SOON | IN_PROGRESS | COMPLETED | CANCELLED
}

enum CheckInVisibility {
  PUBLIC | CREW | PRIVATE
}

enum NotificationType {
  CREW_REQUEST | CREW_ACCEPTED | MEETUP_INVITE | MEETUP_RSVP
  MEETUP_STARTING_SOON | MEETUP_CANCELLED | CREW_CHECKED_IN_NEARBY
  COMMENT_ON_POST
}
```

### Deprecated / Archived

The following models were archived when the product pivoted away from trip planning (2026-04-17):
- `Trip`, `TripMember`, `TripInvitation`, `TripSurvey`, `VotingSession`, `Vote`, `Activity`, `ItineraryDay`, `ItineraryItem`, `TripComment`, `TripLike`, `SavedActivity`, `ActivityRating`
- Source moved to `src/_archive/`

---

## API Endpoints (52 total as of 2026-04-22)

### Meetups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/meetups` | List / create meetups |
| GET/PATCH/DELETE | `/api/meetups/[id]` | Meetup detail, update, delete |
| POST | `/api/meetups/[id]/rsvp` | RSVP to a meetup |
| POST | `/api/meetups/[id]/invite` | Invite crew to meetup |
| GET | `/api/venues/search` | Google Places venue search |

### Check-ins

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST/GET | `/api/checkins` | Create check-in / get own check-ins |
| DELETE | `/api/checkins/[id]` | Delete own check-in |
| GET | `/api/checkins/feed` | Active crew check-in feed (city-filtered) |

### Crew

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/crew` | List crew / send crew request |
| GET/PATCH/DELETE | `/api/crew/[id]` | Crew detail, accept/reject, remove |
| GET | `/api/crew/[id]/members` | Crew members list |
| POST | `/api/crew/[id]/label` | Set crew label |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/generate-itinerary` | Generate AI suggestion (503 if no key) |
| POST | `/api/ai/suggest-activities` | Get activity suggestions (503 if no key) |
| POST | `/api/ai/chat` | Chat with assistant (streaming) |
| GET/POST | `/api/ai/search` | Semantic search |
| POST | `/api/ai/recommend` | AI recommendations |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | User registration + email verification |
| GET | `/api/auth/verify-email` | Email token verification |
| POST | `/api/auth/reset-password` | Initiate password reset |
| PATCH | `/api/auth/reset-password` | Confirm password reset |
| POST | `/api/auth/demo` | Demo auth (requires DEMO_MODE=true) |

### Users & Social

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PATCH | `/api/users/me` | Current user profile |
| GET/PATCH | `/api/users/[userId]` | User profile |
| GET | `/api/notifications` | User notifications (paginated) |
| PATCH | `/api/notifications/[id]` | Mark as read |
| GET | `/api/feed` | Activity feed (Meetups / Check-ins / Crews tabs) |
| GET/POST | `/api/feed/comments` | Feed comments |
| POST | `/api/feed/engagement` | Likes/reactions |
| POST | `/api/feed/share` | Share to feed |
| GET | `/api/search` | Global search |

### Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/discover` | Discovery browsing |
| GET | `/api/discover/search` | Search destinations/venues |
| GET | `/api/discover/recommendations` | AI recommendations |
| POST | `/api/discover/import` | Import template (rate limited) |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron` | Background jobs (CRON_SECRET protected) |
| GET | `/api/cron/meetup-starting-soon` | MEETUP_STARTING_SOON dispatch cron |
| POST | `/api/pusher/auth` | Pusher channel authentication |
| GET | `/api/geocoding` | Nominatim geocoding |
| GET | `/api/images/search` | Unsplash image search |
| GET/POST | `/api/inspiration` | Inspiration content |
| GET/POST | `/api/beta/signup` | Beta program signup |
| GET | `/api/beta/status` | Beta status check |
| POST | `/api/beta/initialize-password` | Beta password init (N8N_API_KEY protected) |
| GET | `/api/health` | Health check |

---

## File Structure (as of 2026-04-22)

```
src/
+-- app/                          # Next.js App Router
|   +-- api/                      # API Routes (52 endpoints)
|   |   +-- ai/                   # AI endpoints
|   |   +-- auth/                 # Auth endpoints (signup, verify-email, reset-password, demo)
|   |   +-- beta/                 # Beta program endpoints
|   |   +-- checkins/             # Check-in CRUD + feed
|   |   +-- cron/                 # Background jobs + meetup-starting-soon
|   |   +-- crew/                 # Crew management
|   |   +-- discover/             # Discovery (all routes auth-guarded)
|   |   +-- feed/                 # Feed, comments, engagement, share
|   |   +-- geocoding/route.ts    # Nominatim geocoding
|   |   +-- health/route.ts       # Health check
|   |   +-- images/               # Unsplash image search
|   |   +-- inspiration/          # Inspiration content
|   |   +-- meetups/              # Meetup CRUD, RSVP, invites
|   |   +-- notifications/        # Notifications
|   |   +-- pusher/auth/route.ts  # Pusher auth
|   |   +-- search/route.ts       # Global search
|   |   +-- users/                # User profiles
|   |   +-- venues/               # Google Places venue search
|   +-- auth/                     # Auth UI pages
|   +-- checkins/page.tsx         # "Who's Out Tonight?" check-in page
|   +-- crew/                     # Crew pages
|   +-- feed/page.tsx             # Social feed (Meetups / Check-ins / Crews)
|   +-- meetups/                  # Meetup list + detail pages
|   +-- privacy/page.tsx          # Privacy settings
|   +-- profile/[userId]/page.tsx # Public user profile
|   +-- layout.tsx
|   +-- page.tsx
|   +-- not-found.tsx
|   +-- error.tsx
|   +-- global-error.tsx
|
+-- _archive/                     # Archived trip-planning code (Phase 1 pivot)
|
+-- components/
|   +-- ui/                       # Base components (Button, Card, Input)
|   +-- checkins/                 # CheckInButton, LiveActivityCard, NearbyCrewList
|   +-- meetups/                  # MeetupCard, MeetupList, CreateMeetupModal, RSVPButton, VenuePicker
|   +-- social/                   # ActivityCard
|   +-- profile/                  # ProfileStatsTab
|   +-- Navigation.tsx
|
+-- hooks/
|   +-- usePusher.ts
|
+-- lib/
|   +-- ai/                       # AI client, embeddings, prompts
|   +-- api/                      # External API integrations (places, ticketmaster, unsplash)
|   +-- prisma.ts
|   +-- pusher.ts                 # Pusher server + triggerCheckinEvent + getCityCheckinChannel
|   +-- auth.ts
|   +-- email.ts                  # Resend email service (re-exports meetup + crew functions)
|   +-- email-meetup.ts           # Meetup-specific email functions
|   +-- email-crew.ts             # Crew-specific email functions
|   +-- geocoding.ts
|   +-- logger.ts                 # pino structured logging
|   +-- rate-limit.ts             # Upstash Redis rate limiting
|   +-- sanitize.ts               # DOMPurify wrapper
|   +-- sentry.ts                 # Sentry wrapper exports
|   +-- api-config.ts
|   +-- api-middleware.ts
|   +-- providers.tsx
|
+-- services/
|   +-- recommendation.service.ts
|   +-- recommendation-data.ts
|   +-- events.service.ts
|
+-- types/
|   +-- index.ts                  # Core types (264 lines — trimmed from 450, 19 dead trip types removed)
|   +-- checkin.ts                # CheckInResponse, CheckInFeedItem, CheckInVisibility
|   +-- meetup.ts                 # MeetupResponse, MeetupListItem, AttendeeResponse
|
+-- __tests__/
|   +-- setup.ts                  # Prisma mocks for all models
    (55+ test files, 1048 tests as of 2026-04-22)

e2e/
+-- auth-flow.spec.ts
+-- smoke.spec.ts
```

---

## Environment Variables

```bash
# Database (Neon PostgreSQL — migrated from Supabase 2026-04-17)
DATABASE_URL="postgresql://..."

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."              # Must be 32+ chars in production

# AI
OPENAI_API_KEY="sk-..."           # MISSING in Vercel production
ANTHROPIC_API_KEY="sk-ant-..."    # Optional

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

# External APIs
GOOGLE_PLACES_API_KEY=""          # Set (venue search for meetups)
TICKETMASTER_API_KEY=""           # Not set
GOOGLE_CLIENT_ID=""               # OAuth (not yet configured)
GOOGLE_CLIENT_SECRET=""           # OAuth (not yet configured)

# Cron
CRON_SECRET=""

# Beta
N8N_API_KEY=""                    # Required for /api/beta/initialize-password
DEMO_MODE=""                      # Set to "true" to enable /api/auth/demo

# Logging
LOG_LEVEL=""                      # pino log level (info, debug, warn, error)
```

---

## Deployment Configuration

### Vercel Settings

```json
{
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron", "schedule": "0 0 * * *" },
    { "path": "/api/cron/meetup-starting-soon", "schedule": "*/15 * * * *" }
  ],
  "functions": {
    "app/api/ai/**/*.ts": { "maxDuration": 60 },
    "app/api/cron/route.ts": { "maxDuration": 300 }
  }
}
```

### Build Commands

```bash
npm run dev          # Start dev server
npm run build        # prisma generate + next build
npm run db:push      # Push schema to database
npm run db:migrate   # Create migrations
npm run db:generate  # Regenerate Prisma client
npm run test         # Run Vitest test suite (1048 tests)
npm run test:e2e     # Run Playwright E2E (requires browser install)
npm run lint         # ESLint
```

---

## Security Measures (Current)

1. **Authentication**: NextAuth.js with session-based auth, bcrypt password hashing
2. **Authorization**: Role-based guards + `getServerSession()` auth check on all protected routes
3. **Input Validation**: Zod schemas on all API endpoints
4. **Rate Limiting**: Upstash Redis-based rate limiting on all high-risk routes
5. **CORS**: Configured in vercel.json and next.config.js
6. **Security Headers**: HSTS, X-Frame-Options, Content-Security-Policy
7. **Logging**: pino structured logging (0 `console.*` in production code)
8. **Type Safety**: TypeScript strict mode, 0 `any` types
9. **XSS**: React + isomorphic-dompurify
10. **SQL Injection**: Prisma ORM parameterized queries

---

## Code Quality Metrics (2026-04-22)

| Metric | Target | Current |
|--------|--------|---------|
| `any` types | 0 | 0 |
| `console.*` in prod | 0 | 0 |
| Files > 600 lines (prod) | 0 | 0 |
| TSC errors | 0 | 0 |
| Lint warnings/errors | 0 | 0 |
| Test count | 500+ | 1048 |
| Test files | - | 55+ |
| API routes | - | 52 |

---

## Performance Optimizations

1. **React Query Caching**: 60-second stale time, optimistic updates
2. **API Route Streaming**: AI chat uses Vercel AI SDK streaming responses
3. **Database Indexing**: Prisma auto-indexes on relations; Neon connection pooling active
4. **Image Optimization**: Next.js `<Image>` component
5. **Code Splitting**: App Router automatic per-route splitting
6. **Edge Caching**: Vercel edge network
7. **Structured Logging**: pino for low-overhead production logging
8. **City-channel Pusher**: Check-in broadcasts scoped to city channels to limit fan-out

---

*Last Updated: 2026-04-22*
