# OutTheGroupchat - Full Implementation Stack

## Overview

OutTheGroupchat is a full-stack group travel planning application built with modern web technologies, AI integration, and real-time collaboration features.

*Last Updated: 2026-04-03*

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
|  |  /api/trips    /api/ai    /api/notifications    /api/discover          |  |
|  |  /api/feed     /api/users /api/search           /api/geocoding         |  |
|  |  /api/auth     /api/beta  /api/inspiration      /api/images            |  |
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
|  |                   Supabase PostgreSQL Database                         |  |
|  |  Users | Trips | Activities | Surveys | Votes | Notifications          |  |
|  |  TripComments | TripLikes | ItineraryDay | ItineraryItem               |  |
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
|  |   Amadeus   |  |Ticketmaster |  |   Google    |  |  Eventbrite |         |
|  |   Flights   |  |   Events    |  |   Places    |  |   Events    |         |
|  | [key needed]|  | [key needed]|  | [key needed]|  |             |         |
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
| **Next.js API Routes** | 14.1.3 | REST API (48 endpoints as of 2026-04-03) |
| **Prisma** | 5.22.0 | Database ORM |
| **PostgreSQL** | 15+ | Relational database via Supabase |
| **NextAuth.js** | 4.24.7 | Authentication (credentials provider) |
| **bcryptjs** | 3.0.2 | Password hashing |
| **pino** | 10.1.0 | Structured logging (replaces console.*) |
| **Resend** | 6.6.0 | Transactional email (verification, invitations) |
| **isomorphic-dompurify** | 2.34.0 | XSS sanitization |

### Rate Limiting & Caching

| Technology | Version | Purpose |
|------------|---------|---------|
| **@upstash/ratelimit** | 2.0.7 | Redis-based rate limiting |
| **@upstash/redis** | 1.35.8 | Redis client |

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

> Note: Pusher is configured but environment variables are missing in Vercel production as of 2026-04-03.

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

> As of 2026-04-03: 1349+ Vitest tests across 64 test files, 0 failures. Playwright spec exists; browsers need `npx playwright install chromium`.

### External APIs

| Service | Purpose | Status |
|---------|---------|--------|
| **Amadeus** | Flight search | API key not set |
| **Ticketmaster** | Event discovery | API key not set |
| **Eventbrite** | Event discovery | Not yet integrated |
| **Google Places** | Location and venue data | API key not set |

---

## Database Schema

### Core Models (Actual, as of 2026-04-03)

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

  ownedTrips      Trip[]    @relation("owner")
  tripMemberships TripMember[]
  followers       Follow[]  @relation("followers")
  following       Follow[]  @relation("following")
  notifications   Notification[]
  surveyResponses SurveyResponse[]
  votes           Vote[]
  savedActivities SavedActivity[]
  activityComments ActivityComment[]
  activityRatings  ActivityRating[]
  tripComments    TripComment[]
  tripLikes       TripLike[]
}

model Trip {
  id          String     @id @default(cuid())
  title       String
  description String?
  destination Json       // { city, country, coordinates }
  startDate   DateTime
  endDate     DateTime
  status      TripStatus @default(PLANNING)
  budget      Json?      // { total, currency, breakdown }
  isPublic    Boolean    @default(false)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  ownerId     String
  owner       User       @relation("owner", fields: [ownerId], references: [id])

  members     TripMember[]
  invitations TripInvitation[]
  survey      TripSurvey?
  activities  Activity[]
  itinerary   ItineraryDay[]
  votingSessions VotingSession[]
  comments    TripComment[]
  likes       TripLike[]
}
```

### Additional Models Added Since Initial Setup

- `TripComment` — trip-level comments
- `TripLike` — trip-level likes/reactions
- `ItineraryDay` / `ItineraryItem` — structured itinerary (GET/PUT with $transaction atomicity)
- `VerificationToken` — email verification on signup
- `PendingInvitation` — prevents placeholder user creation abuse

### Enums

```prisma
enum TripStatus {
  PLANNING | SURVEYING | VOTING | BOOKED | IN_PROGRESS | COMPLETED | CANCELLED
}

enum MemberRole {
  OWNER | ADMIN | MEMBER
}

enum ActivityStatus {
  SUGGESTED | APPROVED | REJECTED | COMPLETED
}

enum PriceRange {
  BUDGET | MODERATE | EXPENSIVE | LUXURY
}
```

---

## API Endpoints (48 total as of 2026-04-03)

### Trips

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips` | List user's trips |
| POST | `/api/trips` | Create new trip |
| GET | `/api/trips/[tripId]` | Get trip details |
| PATCH | `/api/trips/[tripId]` | Update trip |
| DELETE | `/api/trips/[tripId]` | Delete trip |
| GET/PUT | `/api/trips/[tripId]/itinerary` | Itinerary management (atomic PUT) |
| POST | `/api/trips/[tripId]/itinerary` | Add itinerary day |
| GET/POST | `/api/trips/[tripId]/survey` | Survey management |
| GET/POST/PUT | `/api/trips/[tripId]/voting` | Voting sessions |
| GET/POST | `/api/trips/[tripId]/activities` | Activities |
| GET/POST/PATCH/DELETE | `/api/trips/[tripId]/members` | Members |
| GET/POST | `/api/trips/[tripId]/invitations` | Invitations |
| GET/POST | `/api/trips/[tripId]/recommendations` | AI recommendations |
| GET | `/api/trips/[tripId]/suggestions` | Activity suggestions (external APIs) |
| GET | `/api/trips/[tripId]/flights` | Flight data (Amadeus) |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/generate-itinerary` | Generate AI itinerary (503 if no key) |
| POST | `/api/ai/suggest-activities` | Get activity suggestions (503 if no key) |
| POST | `/api/ai/chat` | Chat with trip assistant (streaming) |
| GET/POST | `/api/ai/search` | Semantic search |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | User registration + email verification send |
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
| GET | `/api/feed` | Activity feed |
| GET/POST | `/api/feed/comments` | Feed comments |
| POST | `/api/feed/engagement` | Likes/reactions |
| POST | `/api/feed/share` | Share a trip to feed |
| GET | `/api/search` | Global search (email excluded for privacy) |

### Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/discover` | Discovery browsing (auth required) |
| GET | `/api/discover/search` | Destination search (auth required, 2026-03-24) |
| GET | `/api/discover/recommendations` | AI recommendations (auth required, 2026-03-24) |
| POST | `/api/discover/import` | Import trip template (rate limited + auth) |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron` | Background jobs (CRON_SECRET protected) |
| POST | `/api/pusher/auth` | Pusher channel authentication |
| GET | `/api/geocoding` | Nominatim geocoding |
| GET | `/api/images/search` | Unsplash image search |
| GET/POST | `/api/inspiration` | Trip inspiration content |
| GET/POST | `/api/beta/signup` | Beta program signup |
| GET | `/api/beta/status` | Beta status check (narrowed response) |
| POST | `/api/beta/initialize-password` | Beta password init (N8N_API_KEY protected) |

---

## File Structure (Actual, 2026-04-03)

```
src/
+-- app/                          # Next.js App Router
|   +-- api/                      # API Routes (48 endpoints)
|   |   +-- ai/                   # AI endpoints
|   |   +-- auth/                 # Auth endpoints (signup, verify-email, reset-password, demo)
|   |   +-- beta/                 # Beta program endpoints
|   |   +-- cron/route.ts         # Background jobs
|   |   +-- discover/             # Discovery (all routes auth-guarded)
|   |   +-- feed/                 # Feed, comments, engagement, share
|   |   +-- geocoding/route.ts    # Nominatim geocoding
|   |   +-- images/               # Unsplash image search
|   |   +-- inspiration/          # Inspiration content
|   |   +-- invitations/          # Invitation management
|   |   +-- notifications/        # Notifications
|   |   +-- pusher/auth/route.ts  # Pusher auth
|   |   +-- search/route.ts       # Global search
|   |   +-- trips/                # Trip management (all sub-routes)
|   |   +-- users/                # User profiles
|   +-- auth/                     # Auth UI pages
|   |   +-- reset-password/       # Password reset pages
|   +-- discover/page.tsx
|   +-- feed/page.tsx
|   +-- trips/
|   |   +-- page.tsx
|   |   +-- new/page.tsx
|   |   +-- [tripId]/
|   |       +-- page.tsx
|   |       +-- survey/page.tsx
|   |       +-- vote/page.tsx
|   +-- layout.tsx
|   +-- page.tsx
|   +-- not-found.tsx             # Custom 404 page
|   +-- error.tsx                 # Custom error page
|   +-- global-error.tsx          # Global error boundary
|
+-- components/
|   +-- ui/                       # Base components (Button, Card, Input)
|   +-- trips/                    # TripCard, TripList, InviteMemberModal
|   +-- surveys/                  # QuestionRenderer
|   +-- voting/                   # VotingCard, ResultsChart
|   +-- social/                   # ActivityCard
|   +-- profile/                  # ProfileStatsTab
|   +-- Navigation.tsx
|
+-- hooks/
|   +-- useTrips.ts
|   +-- usePusher.ts
|
+-- lib/
|   +-- ai/                       # AI client, embeddings, prompts
|   +-- api/                      # External API integrations (flights, places, ticketmaster, unsplash)
|   +-- utils/                    # costs.ts, other utilities
|   +-- prisma.ts
|   +-- pusher.ts
|   +-- auth.ts
|   +-- email.ts                  # Resend email service
|   +-- geocoding.ts              # Nominatim geocoding
|   +-- logger.ts                 # pino structured logging
|   +-- rate-limit.ts             # Upstash Redis rate limiting
|   +-- sanitize.ts               # DOMPurify wrapper
|   +-- api-config.ts
|   +-- api-middleware.ts
|   +-- providers.tsx
|
+-- services/
|   +-- survey.service.ts
|   +-- recommendation.service.ts (407 lines, split from 568)
|   +-- recommendation-data.ts
|   +-- events.service.ts
|
+-- styles/
|   +-- globals.css
|
+-- types/
|   +-- index.ts
|
+-- __tests__/
|   +-- setup.ts                  # Prisma mocks for all models
    (64 test files, 1349+ tests as of 2026-04-03)

e2e/
+-- auth-flow.spec.ts             # Playwright E2E (browsers need install)
+-- smoke.spec.ts
```

---

## Environment Variables

```bash
# Database
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

# External APIs (all missing in production)
AMADEUS_API_KEY=""
AMADEUS_API_SECRET=""
TICKETMASTER_API_KEY=""
EVENTBRITE_API_KEY=""
GOOGLE_PLACES_API_KEY=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

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
    { "path": "/api/cron", "schedule": "0 0 * * *" }
  ],
  "functions": {
    "app/api/ai/**/*.ts": { "maxDuration": 60 },
    "app/api/cron/route.ts": { "maxDuration": 300 }
  }
}
```

### Build Commands

```bash
npm run build        # prisma generate + next build
npm run db:push      # Push schema to database
npm run db:migrate   # Create migrations
npm run db:generate  # Regenerate Prisma client
npm run test         # Run Vitest test suite (1349+ tests)
npm run test:e2e     # Run Playwright E2E (requires browser install)
```

---

## Security Measures (Current)

1. **Authentication**: NextAuth.js with session-based auth, bcrypt password hashing
2. **Authorization**: Role-based access control (OWNER, ADMIN, MEMBER) + auth guards on all protected routes
3. **Input Validation**: Zod schemas on all major API endpoints
4. **Rate Limiting**: Upstash Redis-based rate limiting on all high-risk routes
5. **CORS**: Configured in vercel.json and next.config.js (2026-03-23)
6. **Security Headers**: HSTS, X-Frame-Options, Content-Security-Policy (2026-03-10)
7. **Logging**: pino structured logging (0 `console.*` in production code)
8. **Type Safety**: TypeScript strict mode, 0 `any` types
9. **XSS**: React + isomorphic-dompurify
10. **SQL Injection**: Prisma ORM parameterized queries

---

## Code Quality Metrics (2026-04-03)

| Metric | Target | Current |
|--------|--------|---------|
| `any` types | 0 | 0 |
| `console.*` in prod | 0 | 0 |
| Files > 600 lines (prod) | 0 | 0 |
| TSC errors | 0 | 0 |
| Test count | 500+ | 1349+ |
| Test files | - | 64 |
| API routes | - | 48 |
| TypeScript files | - | ~270 |
| Lint warnings/errors | 0 | 0 |

---

## Performance Optimizations

1. **React Query Caching**: 60-second stale time, optimistic updates
2. **API Route Streaming**: AI chat uses Vercel AI SDK streaming responses
3. **Database Indexing**: Prisma auto-indexes on relations
4. **Image Optimization**: Next.js `<Image>` component (0 raw `<img>` tags)
5. **Code Splitting**: App Router automatic per-route splitting
6. **Edge Caching**: Vercel edge network
7. **Structured Logging**: pino for low-overhead production logging

---

*Last Updated: 2026-04-03*
