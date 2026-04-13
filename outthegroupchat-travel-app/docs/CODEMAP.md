# OutTheGroupchat — Full Codemap

> Auto-generated 2026-03-10. Last updated 2026-04-13. Comprehensive reference for agents and developers.

## Table of Contents

- [Project Overview](#project-overview)
- [Directory Structure](#directory-structure)
- [Tech Stack & Dependencies](#tech-stack--dependencies)
- [Configuration Files](#configuration-files)
- [Prisma Data Model](#prisma-data-model)
- [Authentication](#authentication)
- [API Routes](#api-routes)
- [Pages (App Router)](#pages-app-router)
- [Components](#components)
- [Libraries & Utilities](#libraries--utilities)
- [Services](#services)
- [Hooks & Contexts](#hooks--contexts)
- [Types](#types)
- [Tests](#tests)
- [E2E Tests](#e2e-tests)
- [Codebase Health](#codebase-health)

---

## Project Overview

Full-stack Next.js 14 collaborative travel planning app. Groups plan trips together with AI recommendations, real-time collaboration, surveys, voting, and a social feed.

**App root:** `outthegroupchat-travel-app/`
**Source:** `outthegroupchat-travel-app/src/`
**Stats:** ~266 TS/TSX files | ~33,500 LOC | 48 API routes | 92 components | 20 pages

---

## Directory Structure

```
outthegroupchat-travel-app/
├── prisma/
│   ├── schema.prisma              # 675 lines — full data model
│   ├── migrations/                # Auto-generated migration history
│   └── seed/
│       ├── index.ts               # Seed orchestration
│       └── generators/
│           ├── users.ts           # User/profile seed data
│           ├── trips.ts           # Trip/invitation/voting seed data
│           ├── activities.ts      # Activity/itinerary seed data
│           └── social.ts          # Feed/comments/engagement seed data
├── e2e/
│   └── smoke.spec.ts              # 156 lines — Playwright E2E smoke tests (4 suites)
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (fonts, providers, metadata)
│   │   ├── page.tsx               # Landing page (/)
│   │   ├── metadata.ts            # Site metadata
│   │   ├── error.tsx              # Route-level error boundary
│   │   ├── global-error.tsx       # Global error boundary (catches root layout errors, reports to Sentry)
│   │   ├── not-found.tsx          # 404 page
│   │   ├── loading.tsx            # Root loading skeleton
│   │   ├── auth/
│   │   │   ├── signin/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── reset-password/
│   │   │       ├── page.tsx       # Password reset request form (sends email via POST /api/auth/reset-password)
│   │   │       └── confirm/page.tsx  # Password reset confirmation form (submits via PATCH /api/auth/reset-password)
│   │   ├── trips/
│   │   │   ├── page.tsx           # Trip list
│   │   │   ├── new/page.tsx       # Trip creation wizard
│   │   │   └── [tripId]/
│   │   │       ├── page.tsx       # Trip detail
│   │   │       ├── survey/page.tsx
│   │   │       └── vote/page.tsx
│   │   ├── discover/page.tsx
│   │   ├── feed/
│   │   │   ├── page.tsx
│   │   │   └── loading.tsx
│   │   ├── inspiration/page.tsx
│   │   ├── notifications/page.tsx
│   │   ├── profile/page.tsx
│   │   └── api/                   # 49 API route files (see API Routes section)
│   ├── components/                # 92 files across 16 feature directories
│   │   ├── accessibility/         # FocusTrap, SkipLinks, VisuallyHidden, LiveRegion
│   │   ├── ai/                    # TripChat (360L), ChatMessage, ChatLoadingIndicator, ChatQuickPrompts, chat-types.ts
│   │   ├── auth/                  # SignUpForm
│   │   ├── discover/              # CategoryFilter, DestinationCard, TrendingSection
│   │   ├── feed/                  # FeedItem, RichFeedItem, CommentThread, ShareModal, etc.
│   │   ├── notifications/         # NotificationBell, NotificationCenter, NotificationList
│   │   ├── onboarding/            # WelcomeScreen, InterestSelector, TravelStyleQuiz
│   │   ├── profile/               # ProfileHeader, TripHistory, BadgeShowcase, PreferencesCard
│   │   ├── search/                # SearchFilters, FilterChip, SearchResults
│   │   ├── settings/              # NotificationSettings, PrivacySettings, ProfileSettings, SecuritySettings
│   │   ├── social/                # ActivityCard, TravelBadges
│   │   ├── surveys/               # SurveyBuilder, SurveyForm, QuestionRenderer, question types
│   │   ├── trips/                 # TripCard, TripWizard, TripHeader, MemberList, ItineraryTimeline, etc.
│   │   ├── ui/                    # Button, Card, Input, Dialog, Avatar, Badge, Toast, etc.
│   │   ├── voting/                # VotingSession, VotingCard, ResultsChart, CreateVotingModal
│   │   └── Navigation.tsx         # Top nav bar
│   ├── contexts/
│   │   ├── RealtimeContext.tsx     # Pusher connection & notification state
│   │   └── ToastContext.tsx        # Toast notification dispatch
│   ├── hooks/
│   │   ├── useTrips.ts            # React Query: CRUD hooks for trips
│   │   └── usePusher.ts           # Pusher channel subscriptions
│   ├── lib/
│   │   ├── auth.ts                # NextAuth config (Google + Credentials)
│   │   ├── prisma.ts              # Prisma client singleton
│   │   ├── logger.ts              # Pino structured logging
│   │   ├── pusher.ts              # Pusher server/client + channel helpers
│   │   ├── email.ts               # Resend email templates
│   │   ├── rate-limit.ts          # Upstash rate limiter
│   │   ├── sanitize.ts            # XSS prevention
│   │   ├── sentry.ts              # Centralized Sentry helpers (captureException, addBreadcrumb, setUser) ✅ 2026-03-25
│   │   ├── geocoding.ts           # Nominatim reverse geocoding
│   │   ├── invitations.ts         # Invite token generation/validation
│   │   ├── api-config.ts          # API constants
│   │   ├── api-middleware.ts       # Auth decorators, Zod validation helpers
│   │   ├── providers.tsx          # React Query + Session providers
│   │   ├── ai/
│   │   │   ├── client.ts          # Vercel AI SDK wrapper
│   │   │   ├── embeddings.ts      # Vector embeddings + similarity search
│   │   │   └── prompts/
│   │   │       ├── index.ts
│   │   │       ├── budget.ts
│   │   │       ├── itinerary.ts
│   │   │       └── recommendations.ts
│   │   ├── api/
│   │   │   ├── unsplash.ts        # Unsplash image search
│   │   │   ├── places.ts          # Google Places API
│   │   │   ├── ticketmaster.ts    # Ticketmaster events
│   │   │   └── flights.ts         # Flight search
│   │   └── utils/
│   │       └── costs.ts           # Cost calculation helpers
│   ├── services/
│   │   ├── recommendation.service.ts  # 459L — AI + survey recommendation engine
│   │   ├── recommendation-data.ts     # 185L — Static destination/activity data for RecommendationService
│   │   ├── survey.service.ts          # 377L — Survey CRUD + analysis
│   │   └── events.service.ts          # Event discovery (Ticketmaster)
│   ├── types/
│   │   └── index.ts               # 449L — All TypeScript interfaces & types
│   ├── styles/
│   │   ├── globals.css            # Tailwind directives, CSS variables
│   │   └── themes.css             # Dark/light mode definitions
│   ├── middleware.ts              # Route protection (redirect unauthenticated)
│   └── __tests__/
│       ├── setup.ts               # Test environment config
│       ├── api/
│       │   ├── trips.test.ts      # 525L — 30 Vitest tests for trips API
│       │   ├── voting.test.ts     # 10 Vitest tests for voting API
│       │   ├── survey.test.ts     # 11 Vitest tests for survey API
│       │   ├── feed.test.ts       # 12 Vitest tests for feed API
│       │   ├── auth.test.ts       # 10 Vitest tests for auth flow
│       │   ├── notifications.test.ts # 19 Vitest tests for notifications API
│       │   ├── profile.test.ts    # 10 Vitest tests for profile API
│       │   ├── reset-password.test.ts # 286L — 12 Vitest tests for password reset API
│       │   ├── ai.test.ts         # 411L — 19 Vitest tests for AI routes
│       │   ├── users.test.ts      # 316L — 19 Vitest tests for users/follow API
│       │   ├── share.test.ts      # 204L — 13 Vitest tests for feed share endpoint
│       │   ├── inspiration.test.ts # 358L — 20 Vitest tests for inspiration API
│       │   ├── search.test.ts     # 328L — 15 Vitest tests for search API
│       │   └── beta-initialize-password.test.ts # 274L — 15 Vitest tests for beta password init
│       └── lib/
│       └── api/
│           ├── trips.test.ts      # 525L — 30 Vitest tests for trips API
│           ├── trips-suggestions.test.ts # 23 Vitest tests for trips suggestions API
│           ├── trips-flights.test.ts     # 26 Vitest tests for trips flights API
│           ├── trips-members.test.ts     # 29 Vitest tests for trips members API
│           ├── voting.test.ts     # 10 Vitest tests for voting API
│           ├── survey.test.ts     # 11 Vitest tests for survey API
│           ├── feed.test.ts       # 12 Vitest tests for feed API
│           ├── email.test.ts      # 14 Vitest tests for email service
│           ├── geocoding.test.ts  # 26 Vitest tests for geocoding
│           ├── invitations.test.ts # 16 Vitest tests for invitation tokens
│           └── rate-limit.test.ts # 13 Vitest tests for rate limiting
├── docs/                          # 23 markdown files (see docs/README.md)
├── public/                        # Empty (assets via CDN)
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts           # 44 lines — Playwright E2E configuration (chromium, auto dev server in CI)
├── instrumentation.ts             # Sentry server + edge init via Next.js instrumentation hook
├── instrumentation-client.ts      # Sentry client init with Session Replay (10% sample, 100% on error)
├── vercel.json
├── .eslintrc.json
└── .env.example
```

---

## Tech Stack & Dependencies

### Core

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | ^14.1.3 |
| Language | TypeScript (strict) | ^5.4.2 |
| React | React + ReactDOM | ^18.2.0 |
| ORM | Prisma Client | ^5.22.0 |
| Database | PostgreSQL (Supabase) | — |
| Auth | NextAuth.js + Prisma Adapter | ^4.24.7 |
| Styling | Tailwind CSS | ^3.4.1 |
| Animation | Framer Motion | ^11.0.0 |

### AI & ML

| Package | Version | Purpose |
|---------|---------|---------|
| ai (Vercel AI SDK) | ^3.4.14 | Streaming chat, completions |
| @ai-sdk/openai | ^0.0.70 | OpenAI provider |
| @ai-sdk/anthropic | ^0.0.54 | Anthropic provider |

### Real-time & Communication

| Package | Version | Purpose |
|---------|---------|---------|
| pusher | ^5.2.0 | Server-side Pusher |
| pusher-js | ^8.4.0 | Client-side Pusher |
| resend | ^6.6.0 | Transactional email |

### Data & State

| Package | Version | Purpose |
|---------|---------|---------|
| @tanstack/react-query | ^5.59.0 | Server state management |
| react-hook-form | ^7.54.2 | Form handling |
| @hookform/resolvers | ^3.10.0 | Zod form validation |
| zod | ^3.25.0 | Runtime schema validation |

### Infrastructure

| Package | Version | Purpose |
|---------|---------|---------|
| @upstash/ratelimit | ^2.0.7 | API rate limiting |
| @upstash/redis | ^1.35.8 | Redis client for rate limits |
| pino / pino-pretty | ^10.1.0 | Structured logging |
| bcryptjs | ^3.0.2 | Password hashing |
| isomorphic-dompurify | ^2.34.0 | XSS sanitization |
| axios | ^1.8.4 | HTTP client |
| date-fns | ^3.6.0 | Date utilities |
| lucide-react | ^0.576.0 | Icon library |
| @sentry/nextjs | — | Error monitoring (server, edge, client) |

### Testing

| Package | Purpose |
|---------|---------|
| vitest | Unit/integration test runner |
| @playwright/test | E2E test runner |

### Scripts

```
dev            → next dev
build          → prisma generate && next build
lint           → next lint
test           → vitest run
test:watch     → vitest
test:e2e       → playwright test
test:e2e:ui    → playwright test --ui
db:push        → prisma db push
db:migrate     → prisma migrate dev
db:generate    → prisma generate
db:studio      → prisma studio
db:seed        → npx tsx prisma/seed/index.ts
```

---

## Configuration Files

### next.config.js
- **reactStrictMode:** true
- **Image domains:** Google, GitHub, Google Maps, Ticketmaster, Unsplash, DiceBear
- **Experimental:** serverActions (allowedOrigins: localhost:3000, bodySizeLimit: 1mb)
- **Security headers:** CSP, HSTS (2yr), X-Frame-Options, nosniff, strict referrer, permissions-policy
- **Redirects:** /dashboard → /trips (permanent)

### tailwind.config.js
- **Dark mode:** class-based
- **Fonts:** Outfit (display), Poppins (body), system-ui fallback
- **Primary color:** Emerald (#10b981, full 50-950 scale)
- **Animations:** float, pulse-slow, slide-up, fade-in
- **Shadows:** glow-emerald, glow-amber

### tsconfig.json
- **Strict mode:** enabled
- **Target:** ES5, module: ESNext, moduleResolution: bundler
- **Path alias:** `@/*` → `./src/*`

### playwright.config.ts
- **testDir:** `./e2e`
- **baseURL:** `http://localhost:3000` (or `PLAYWRIGHT_BASE_URL` env var)
- **Projects:** chromium (Desktop Chrome) only
- **CI:** retries=2, workers=1, GitHub reporter, auto-starts `npm run start`
- **Artifacts:** trace on first retry, screenshot on failure, video on first retry

### instrumentation.ts
- Sentry server + edge initialization via Next.js instrumentation hook
- Reads `SENTRY_DSN` from env; `tracesSampleRate: 1.0`; `debug: false`

### instrumentation-client.ts
- Sentry browser initialization with Session Replay integration
- `replaysSessionSampleRate: 0.1` (10% of all sessions)
- `replaysOnErrorSampleRate: 1.0` (100% of sessions with errors)

---

## Prisma Data Model

### Enums

| Enum | Values |
|------|--------|
| NotificationType | TRIP_INVITATION, TRIP_UPDATE, TRIP_COMMENT, TRIP_LIKE, ACTIVITY_COMMENT, ACTIVITY_RATING, SURVEY_REMINDER, VOTE_REMINDER, FOLLOW, SYSTEM |
| TripStatus | PLANNING, INVITING, SURVEYING, VOTING, BOOKED, IN_PROGRESS, COMPLETED, CANCELLED |
| TripMemberRole | OWNER, ADMIN, MEMBER |
| InvitationStatus | PENDING, ACCEPTED, DECLINED, EXPIRED |
| SurveyStatus | DRAFT, ACTIVE, CLOSED, ANALYZED |
| VotingType | DESTINATION, ACTIVITY, DATE, ACCOMMODATION, CUSTOM |
| VotingStatus | ACTIVE, CLOSED, CANCELLED |
| ActivityCategory | FOOD, CULTURE, SHOPPING, NATURE, ENTERTAINMENT, SPORTS, NIGHTLIFE, TRANSPORTATION, ACCOMMODATION, OTHER |
| ActivityStatus | SUGGESTED, APPROVED, BOOKED, COMPLETED, CANCELLED |
| PriceRange | FREE, BUDGET, MODERATE, EXPENSIVE, LUXURY |
| BookingStatus | NOT_NEEDED, RECOMMENDED, REQUIRED, BOOKED, CONFIRMED |
| ExternalSource | OPENTRIPMAP, FOURSQUARE, OPENSTREETMAP, WIKIVOYAGE, GOOGLE_PLACES, YELP, TRIPADVISOR, MANUAL |

### Models

#### Auth (NextAuth managed)

| Model | Key Fields | Notes |
|-------|-----------|-------|
| **Account** | id, userId, provider, providerAccountId, access_token, refresh_token | Unique on [provider, providerAccountId] |
| **Session** | id, sessionToken (unique), userId, expires | Cascade delete with User |
| **VerificationToken** | identifier, token (unique), expires | Unique on [identifier, token]; also used for password reset tokens (identifier prefix: `reset:`) |

#### User Domain

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **User** | id, email (unique), password?, name?, image?, bio?, city?, preferences (Json), betaSignupDate?, newsletterSubscribed, passwordInitialized | accounts[], sessions[], ownedTrips[], tripMemberships[], invitations[], surveyResponses[], followers[], following[], savedActivities[], notifications[] | Indexed on email |
| **Follow** | id, followerId, followingId | User (follower), User (following) | Unique on [followerId, followingId] |
| **Notification** | id, userId, type (enum), title, message, data (Json), read | User | Indexed on [userId, read] |

#### Trip Domain

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **Trip** | id, title, description?, status (enum), destination (Json), startDate, endDate, budget (Json), ownerId, coverImage?, isPublic, viewCount | owner (User), members[], invitations[], survey?, votingSessions[], activities[], itinerary[], comments[], likes[] | Indexed on ownerId, status, startDate |
| **TripMember** | id, tripId, userId, role (enum), budgetRange (Json), departureCity?, flightDetails (Json) | Trip, User | Unique on [tripId, userId] |
| **TripInvitation** | id, tripId, userId, status (enum), expiresAt | Trip, User | Unique on [tripId, userId] |
| **PendingInvitation** | id, email, tripId, invitedBy, expiresAt | Trip, User (inviter) | For users not yet registered |
| **TripComment** | id, tripId, userId, text | Trip, User | — |
| **TripLike** | id, tripId, userId | Trip, User | Unique on [userId, tripId] |

#### Survey & Voting

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **TripSurvey** | id, tripId (unique), title, status (enum), questions (Json), expiresAt? | Trip, SurveyResponse[] | One survey per trip |
| **SurveyResponse** | id, surveyId, userId, answers (Json) | TripSurvey, User | Unique on [surveyId, userId] |
| **VotingSession** | id, tripId, type (enum), status (enum), title, expiresAt, options (Json) | Trip, Vote[] | — |
| **Vote** | id, sessionId, orderId, optionId, rank? | VotingSession | Unique on [sessionId, orderId, optionId] |

#### Activity Domain

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **Activity** | id, tripId, name, description?, category (enum), status (enum), location (Json), date?, startTime?, endTime?, duration?, cost?, priceRange (enum), bookingStatus (enum), bookingUrl?, isPublic, shareCount, externalLinks (Json) | Trip, savedBy[], comments[], ratings[], itineraryItems[] | Indexed on tripId, category, isPublic |
| **SavedActivity** | id, userId, activityId | User, Activity | Unique on [userId, activityId] |
| **ActivityComment** | id, activityId, userId, text | Activity, User | — |
| **ActivityRating** | id, activityId, userId, score (1-5), review? | Activity, User | Unique on [activityId, userId] |

#### Itinerary

| Model | Key Fields | Relations | Notes |
|-------|-----------|-----------|-------|
| **ItineraryDay** | id, tripId, dayNumber, date, notes? | Trip, ItineraryItem[] | Unique on [tripId, dayNumber] |
| **ItineraryItem** | id, itineraryDayId, activityId?, order, startTime?, endTime?, customTitle?, notes? | ItineraryDay, Activity? | Supports non-activity items |

#### External Data

| Model | Key Fields | Notes |
|-------|-----------|-------|
| **ExternalActivity** | id, externalId, source (enum), name, description?, category, tags[], latitude, longitude, city, country, rating?, priceLevel?, imageUrl?, websiteUrl?, searchText, popularity | Unique on [externalId, source], indexed on [city, category], [lat, lng] |
| **DestinationCache** | id, city, country (unique together), activityCount, averageRating?, topCategories[], description?, highlights (Json), bestTimeToVisit?, averageBudget (Json), dataQuality (0-100) | Indexed on country |

---

## Authentication

**File:** `src/lib/auth.ts`

- **Strategy:** JWT sessions via NextAuth.js
- **Adapter:** PrismaAdapter
- **Providers:**
  1. **Google OAuth** — requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  2. **Credentials** — email + bcrypt password verification
- **Session callback:** Injects user.id and user.name from JWT
- **JWT callback:** Queries DB only on signIn (optimized, avoids N+1)
- **Pages:** signIn → /auth/signin, error → /auth/error
- **Middleware:** `src/middleware.ts` redirects unauthenticated users to sign-in
- **Password reset:** Token-based flow via `VerificationToken` model (identifier prefix `reset:`), 1-hour expiry, email sent via Resend

---

## API Routes

### Authentication & Beta

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/auth/[...nextauth]` | * | NextAuth | — | NextAuth handler |
| `/api/auth/signup` | POST | No | No | User registration + pending invitation processing |
| `/api/auth/demo` | POST, GET | No | No | Demo account creation/retrieval |
| `/api/auth/reset-password` | POST, PATCH | No | Yes | POST: request reset token (always 200, prevents enumeration); PATCH: confirm reset with token + new password |
| `/api/auth/verify-email` | GET | No | Yes | Email token verification ✅ 2026-03-19 |
| `/api/beta/signup` | POST | API Key | Yes | Beta signup via N8N |
| `/api/beta/initialize-password` | POST | API Key | Yes | Password init for beta users — N8N_API_KEY auth protection added 2026-03-19 |
| `/api/beta/status` | GET | No | No | Beta signup status check |

### Trips CRUD

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/trips` | GET, POST | Yes | Yes (POST) | List user trips, create trip |
| `/api/trips/[tripId]` | GET, PATCH, DELETE | Yes | Yes (PATCH) | Trip detail, update, delete |
| `/api/trips/[tripId]/members` | GET, PATCH, DELETE | Yes | Yes (PATCH) | Member management, role changes |
| `/api/trips/[tripId]/activities` | GET, POST | Yes | Yes (POST) | Trip activities CRUD |
| `/api/trips/[tripId]/invitations` | GET, POST | Yes | Yes (POST) | Send/list invitations |
| `/api/trips/[tripId]/itinerary` | GET, PUT | Yes | Yes (PUT) | Day-by-day itinerary |
| `/api/trips/[tripId]/survey` | GET, POST, PUT | Yes | Yes (POST/PUT) | Trip preference surveys |
| `/api/trips/[tripId]/voting` | GET, POST, PUT | Yes | Yes (POST/PUT) | Voting sessions with auto-close |
| `/api/trips/[tripId]/recommendations` | GET, POST | Yes | No | AI recommendations from survey data |
| `/api/trips/[tripId]/suggestions` | GET | Yes | No | Destination-based suggestions |

### Activities

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/activities/[activityId]` | GET, POST, PUT | Yes | Yes (PUT) | Activity detail, save/unsave, comments, ratings |

### Users & Social

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/users/me` | GET, PATCH | Yes | Yes (PATCH) | Current user profile + preferences |
| `/api/users/[userId]` | GET, POST | Yes* | No | Public profiles, follow/unfollow |
| `/api/profile` | GET, PUT | Yes | No | Legacy profile endpoint |
| `/api/search` | GET | Yes | No | Global search (trips, activities, users) |

### Feed & Engagement

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/feed` | GET, POST | Yes | No | Activity feed with pagination |
| `/api/feed/comments` | GET, POST, DELETE | Yes* | No | Comments with notifications |
| `/api/feed/engagement` | GET, POST | Yes | No | Likes/engagement tracking |

### Notifications & Invitations

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/notifications` | GET, PATCH | Yes | No | Notification inbox, bulk mark read |
| `/api/notifications/[notificationId]` | PATCH, DELETE | Yes | No | Individual notification ops |
| `/api/invitations` | GET | Yes | No | User's pending invitations |
| `/api/invitations/[invitationId]` | GET, POST | Yes | Yes (POST) | Respond to invitation |

### Discovery & Content

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/discover` | GET, POST | Yes | Yes (GET) | Destination discovery + flight search |
| `/api/discover/search` | GET | Yes | Yes | Internal + external activity search |
| `/api/discover/import` | POST | Yes | No | Import from OpenTripMap |
| `/api/discover/recommendations` | GET | Yes | No | Personalized recommendations |
| `/api/inspiration` | GET, POST | Yes | Yes (GET) | Trip templates, trending, popular |

### AI Endpoints

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/ai/chat` | GET, POST | Yes | Yes | Streaming travel chat (rate limited) |
| `/api/ai/recommend` | GET, POST | Yes | Yes | AI + DB recommendation engine |
| `/api/ai/suggest-activities` | POST | Yes | Yes | Activity suggestions with events |
| `/api/ai/search` | GET, POST | Yes | Yes | Semantic search with embeddings |
| `/api/ai/generate-itinerary` | POST | Yes | Yes | AI itinerary generation (Prisma tx) |

### Infrastructure

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/geocoding` | GET | Yes | No | Nominatim autocomplete (cached) |
| `/api/images/search` | GET | Yes | No | Unsplash image search |
| `/api/pusher/auth` | POST | Yes | No | Pusher channel auth |
| `/api/newsletter/subscribe` | POST | API Key | Yes | Newsletter sub via N8N |
| `/api/cron` | GET | Bearer | No | Daily cron: expire invites, close surveys |

---

## Pages (App Router)

| Route | File | Type | Auth | Description |
|-------|------|------|------|-------------|
| `/` | `app/page.tsx` | Client | Public | Landing page — hero, features, CTA |
| `/auth/signin` | `app/auth/signin/page.tsx` | Client | Public | Email/password + OAuth sign-in |
| `/auth/signup` | `app/auth/signup/page.tsx` | Client | Public | Registration form |
| `/auth/reset-password` | `app/auth/reset-password/page.tsx` | Client | Public | Password reset request form — submits email to POST /api/auth/reset-password |
| `/auth/reset-password/confirm` | `app/auth/reset-password/confirm/page.tsx` | Client | Public | Password reset confirmation — reads token+email from query params, submits PATCH /api/auth/reset-password |
| `/trips` | `app/trips/page.tsx` | Client | Required | Trip list with stats, filters, creation |
| `/trips/new` | `app/trips/new/page.tsx` | Client | Required | Multi-step trip wizard |
| `/trips/[tripId]` | `app/trips/[tripId]/page.tsx` | Client | Required | Trip detail: itinerary, members, activities |
| `/trips/[tripId]/survey` | `app/trips/[tripId]/survey/page.tsx` | Client | Required | Survey form for preferences |
| `/trips/[tripId]/vote` | `app/trips/[tripId]/vote/page.tsx` | Client | Required | Voting interface |
| `/discover` | `app/discover/page.tsx` | Client | Public | Destination discovery & inspiration |
| `/inspiration` | `app/inspiration/page.tsx` | Client | Public | Trending trips, events |
| `/feed` | `app/feed/page.tsx` | Client | Required | Social activity feed |
| `/notifications` | `app/notifications/page.tsx` | Client | Required | Notification inbox |
| `/profile` | `app/profile/page.tsx` | Client | Required | User profile, badges, trip history |

**Utility pages:** `error.tsx` (route error boundary), `global-error.tsx` (root error boundary + Sentry), `not-found.tsx` (404), `loading.tsx` (skeleton)

---

## Components

### Accessibility (`components/accessibility/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `FocusTrap` | children, active?, onEscape?, initialFocus?, returnFocus? | Trap keyboard focus in modals |
| `SkipLinks` | links: {id, label}[] | Skip-to-content for keyboard nav |
| `VisuallyHidden` | children, as? | Screen reader only content |
| `LiveRegion` | children, role? (polite\|assertive) | Announce dynamic updates |

### AI (`components/ai/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `TripChat` | 360 | tripContext?, onAction?, className? | Floating AI travel assistant with streaming, localStorage history, quick prompts, retry on 429 |
| `ChatMessage` | 73 | message, isStreaming? | Renders a single chat message bubble (user or assistant) |
| `ChatLoadingIndicator` | 29 | — | Animated loading dots shown while AI is responding |
| `ChatQuickPrompts` | 56 | prompts, onSelect | Horizontal row of quick-prompt pill buttons |
| `chat-types.ts` | 34 | — | Shared TypeScript types for chat components (ChatMessage, ChatState, etc.) |

### Auth (`components/auth/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `SignUpForm` | — | Email/password registration with validation, auto sign-in |

### Discover (`components/discover/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `CategoryFilter` | categories, selectedCategory, onSelectCategory | Horizontal category pill selector |
| `DestinationCard` | id, city, country, image?, averagePrice?, rating?, tags?, featured? | Destination grid card with hover zoom |
| `TrendingSection` | destinations?, events? | Horizontal trending content row |

### Feed (`components/feed/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `FeedItem` | 298 | id, type, timestamp, user, trip?, activity?, media?, onSave, onComment, onShare | Basic feed post |
| `RichFeedItem` | 432 | id, type, timestamp, user, content?, reactions?, comments? | Enhanced post with reactions |
| `CommentThread` | 385 | itemId, itemType, comments, onAddComment? | Nested comments with reply |
| `EngagementBar` | — | itemId, itemType, initialLiked?, likeCount?, commentCount? | Like/comment/share bar |
| `MediaGallery` | — | media[], maxDisplay?, onMediaClick? | Image/video grid |
| `ReactionPicker` | — | onSelect, reactions? | Emoji reaction popover |
| `ShareModal` | 295 | open, onOpenChange, itemId, itemType, itemTitle? | Share to socials / copy link |
| ~~`SharePreview`~~ | — | — | Removed 2026-03-26 (confirmed unused dead code) |

### Notifications (`components/notifications/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `NotificationBell` | — | unreadCount?, onClick? | Bell icon with badge |
| `NotificationList` | — | notifications, onItemClick?, onDelete? | Notification list view |
| `NotificationItem` | — | notification, onClick?, onDelete? | Single notification entry |

> **Note:** `NotificationCenter` was removed 2026-03-26 (confirmed unused dead code).

### Onboarding (`components/onboarding/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `WelcomeScreen` | — | onNext, onSkip? | First-time welcome slides |
| `InterestSelector` | — | interests?, onSelect, multiple? | Multi-select interest picker |
| `TravelStyleQuiz` | 236 | onComplete | Travel style questionnaire |

### Profile (`components/profile/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `ProfileHeader` | user, stats?, isOwn?, onEdit? | Cover + avatar + bio |
| `TripHistory` | trips, userId?, variant? | Past trips timeline |
| `BadgeShowcase` | badges, showCount? | Achievement badge grid |
| `PreferencesCard` | preferences, onUpdate?, editable? | Travel preference display/edit |

### Search (`components/search/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `SearchFilters` | 295 | filters, onFilterChange, categories? | Filter panel (price, date, rating) |
| `FilterChip` | — | label, icon?, onRemove?, active? | Individual filter tag |
| `SearchResults` | — | results, loading?, noResults?, onResultClick? | Paginated results |

### Settings (`components/settings/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `NotificationSettings` | 237 | preferences?, onSave? | Email/push/in-app toggles |
| `PrivacySettings` | — | settings?, onSave? | Profile visibility, trip privacy |
| `ProfileSettings` | — | user?, onSave? | Name, bio, avatar, email |
| `SecuritySettings` | 279 | user?, onPasswordChange? | Password, 2FA, sessions |

### Social (`components/social/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `ActivityCard` | — | activity, trip?, onSave?, onShare? | Activity recommendation card |
| `TravelBadges` | 391 | badges, userId?, interactive? | Achievement/travel badges |

### Surveys (`components/surveys/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `SurveyBuilder` | 473 | questions?, onSave?, readOnly? | Drag-drop question builder |
| `SurveyForm` | 317 | survey, onSubmit?, loading? | Survey response form |
| `QuestionRenderer` | — | question, response?, onResponseChange? | Routes to correct question type |
| `MultipleChoice` | — | options, value, onChange, multiple? | Radio/checkbox selection |
| `TextInput` | — | value, onChange, placeholder?, type? | Open-ended text |
| `RangeSlider` | — | min, max, step?, value, onChange | Budget range / Likert |
| `DateRangePicker` | — | startDate, endDate, onStartChange, onEndChange | Date range |
| `RankingQuestion` | — | items, onReorder, dragHint? | Drag-to-rank priorities |

### Trips (`components/trips/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `TripCard` | — | trip, variant? (default\|compact) | Trip card for list view |
| `TripList` | — | trips, loading?, onTripClick?, groupBy? | Trip grid/list with filtering |
| `TripWizard` | — | onComplete? | Multi-step: destination → dates → budget → members |
| `TripHeader` | — | trip, onEdit?, onShare?, editable? | Hero with cover image + title |
| `TripOverview` | — | trip, compact? | Summary (dates, members, budget) |
| `MemberList` | — | members, onRemove?, onRoleChange?, editable? | Member list with roles |
| `ItineraryTimeline` | — | days, onAddDay?, onEditDay?, editable? | Day-by-day schedule |
| `InviteModal` | — | tripId, open, onOpenChange, onInvite? | Email invite form |
| `InviteMemberModal` | — | tripId, open, onOpenChange, onInvited? | Invite member UI with member search and email invite ✅ 2026-03-19 |
| `AddActivityModal` | 492 | tripId, date?, open, onOpenChange, onAdd? | Add activity to itinerary |

**Trip wizard steps** (`components/trips/steps/`):
- `DestinationStep` — City/country search
- `DateStep` — Start & end dates
- `BudgetStep` — Total budget & currency
- `MembersStep` — Invite by email

### UI (`components/ui/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `Button` | variant (primary\|secondary\|ghost), size, disabled, onClick | Action button with Framer Motion |
| `Card` | className, children, hover? | Content container |
| `Input` | type, placeholder, value, onChange, error?, label? | Text input with error state |
| `Dialog` | open, onOpenChange, trigger, content, header, footer | Radix modal dialog |
| `Dropdown` | trigger, items, onSelect | Menu dropdown |
| `Tooltip` | content, children, side? | Hover tooltip (Radix + Framer) |
| `Avatar` | src, alt, size (sm\|md\|lg), fallback | User avatar with initials |
| `AvatarStack` | avatars[], maxDisplay, size?, onViewAll? | Overlapping avatar group |
| `Badge` | variant (primary\|secondary\|success\|danger), children, icon? | Status/count badge |
| `Skeleton` | className, width?, height? | Loading placeholder |
| `EmptyState` | icon, title, description, action? | Empty state UI |
| `Tabs` | tabs[], defaultValue?, onValueChange? | Radix tab navigation |
| `Switch` | checked, onCheckedChange, disabled?, label? | Toggle switch |
| `Select` | options, value, onChange, placeholder? | Dropdown select |
| `ImagePicker` | onSelect, aspect?, maxSize? | Image upload & crop |
| `FloatingShareButton` | itemId, itemType, onShare? | Floating share FAB |
| `Toast` | message, type (success\|error\|info), duration?, onClose | Toast notification |

### Voting (`components/voting/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `VotingSession` | 274 | session, tripId, currentUserId, onVoteComplete? | Vote UI (single, multiple, ranking) |
| `VotingCard` | — | session, onVote? | Compact voting card |
| `VotingOption` | — | option, selected?, onSelect?, percentage?, voters? | Single option with progress |
| `ResultsChart` | — | results, type? (pie\|bar\|ranking) | Results visualization |
| `VotingDeadline` | — | expiresAt, onExpire?, compact? | Countdown timer |
| `CreateVotingModal` | 281 | tripId, open, onOpenChange, onCreate? | Create voting session |

### Navigation

| Component | Purpose |
|-----------|---------|
| `Navigation.tsx` | Fixed top nav: logo, links, auth buttons, profile dropdown, notification bell |

---

## Libraries & Utilities

### Auth & Middleware

| File | Exports | Purpose |
|------|---------|---------|
| `lib/auth.ts` | authOptions, getServerSession | NextAuth config (Google + Credentials) |
| `lib/api-middleware.ts` (283L) | withAuth, withValidation, validateZod | Request validation, error handling, auth decorators |
| `middleware.ts` | — | Route protection redirect |

### Real-time & Communication

| File | Exports | Purpose |
|------|---------|---------|
| `lib/pusher.ts` | getPusherServer, getPusherClient, channels, events, broadcastToTrip, broadcastToUser | Pusher instances + helpers |
| `lib/email.ts` (392L) | sendInvite, sendNotification, sendTripUpdate | Resend email templates |
| `lib/rate-limit.ts` | rateLimit, getRemainingQuota | Upstash rate limiter |

### AI/LLM

| File | Exports | Purpose |
|------|---------|---------|
| `lib/ai/client.ts` | generateCompletion, streamCompletion | Vercel AI SDK wrapper |
| `lib/ai/embeddings.ts` | getEmbedding, similaritySearch | Vector embedding + cosine similarity |
| `lib/ai/prompts/budget.ts` | BUDGET_ANALYSIS_PROMPT | Budget prompts |
| `lib/ai/prompts/itinerary.ts` | ITINERARY_GENERATION_PROMPT | Itinerary prompts |
| `lib/ai/prompts/recommendations.ts` | RECOMMENDATION_ANALYSIS_PROMPT | Recommendation prompts |

### External APIs

| File | Exports | Purpose |
|------|---------|---------|
| `lib/api/unsplash.ts` | searchImages, getImage | Unsplash image search |
| `lib/api/places.ts` | searchPlaces, getPlaceDetails, getPlacePhotos | Google Places API |
| `lib/api/ticketmaster.ts` | searchEvents, getEventDetails | Ticketmaster events |
| `lib/api/flights.ts` | searchFlights, estimateCost | Flight search |

### Core Utilities

| File | Exports | Purpose |
|------|---------|---------|
| `lib/prisma.ts` | prisma | Singleton Prisma client |
| `lib/logger.ts` | logger, apiLogger, authLogger, logError, logSuccess | Pino structured logging |
| `lib/sanitize.ts` | sanitizeHTML, sanitizeInput | XSS prevention |
| `lib/geocoding.ts` (289L) | getLocationFromCoords, getCoordsFromLocation | Nominatim geocoding |
| `lib/invitations.ts` | generateInviteToken, validateToken, redeemInvite | Invitation tokens |
| `lib/api-config.ts` | API_ENDPOINTS, API_TIMEOUT | Centralized API constants |
| `lib/utils/costs.ts` | — | Cost calculation helpers |
| `lib/providers.tsx` | — | React Query + SessionProvider wrapper |

---

## Services

| Service | File | Lines | Key Methods | Purpose |
|---------|------|-------|-------------|---------|
| RecommendationService | `services/recommendation.service.ts` | 459 | generateRecommendations(tripMembers, preferences), analyzeDestination(destination, budget), rankDestinations(options, preferences) | AI + survey-based recommendation engine |
| RecommendationData | `services/recommendation-data.ts` | 185 | — | Static destination databases, activity lists, cost constants, and airport code mappings used by RecommendationService (extracted to keep service under 600 lines) |
| SurveyService | `services/survey.service.ts` | 377 | createSurvey(tripId, questions), recordResponse(surveyId, userId, response), analyzeSurvey(surveyId) | Survey CRUD + analysis |
| EventsService | `services/events.service.ts` | — | searchEvents(destination, date), getEventDetails(eventId) | Event discovery (Ticketmaster) |

---

## Hooks & Contexts

### Hooks (`hooks/`)

| Hook | File | Returns | Purpose |
|------|------|---------|---------|
| `useTrips` | useTrips.ts | {data: Trip[], isLoading, error} | React Query: list user trips |
| `useTrip` | useTrips.ts | {data: Trip, isLoading, error} | React Query: single trip |
| `useCreateTrip` | useTrips.ts | {mutate, isPending, error} | Mutation: create trip |
| `useUpdateTrip` | useTrips.ts | {mutate, isPending, error} | Mutation: update trip |
| `useDeleteTrip` | useTrips.ts | {mutate, isPending, error} | Mutation: delete trip |
| `usePusherChannel` | usePusher.ts | {channel, isConnected, bind} | Generic Pusher channel sub |
| `useTripChannel` | usePusher.ts | — | Trip-specific channel |
| `useUserChannel` | usePusher.ts | — | User notification channel |
| `useVotingChannel` | usePusher.ts | {channel, onVoteCast, onVotingClosed} | Voting channel events |
| `useNotifications` | usePusher.ts | {notifications, clearNotification} | Real-time notifications |

### Contexts (`contexts/`)

| Context | File | Lines | Value | Purpose |
|---------|------|-------|-------|---------|
| RealtimeContext | RealtimeContext.tsx | 258 | isConnected, notifications, unreadCount, markAsRead, subscribeToTrip, onTripUpdate, onActivityAdded | Global Pusher + notification state |
| ToastContext | ToastContext.tsx | — | showToast, hideToast | Global toast dispatch |

---

## Types

**File:** `src/types/index.ts` (449 lines)

### Key Type Categories

| Category | Types |
|----------|-------|
| User | UserPreferences, UserWithRelations |
| Trip | Destination, TripBudget, MemberBudgetRange, FlightDetails, TripWithRelations |
| Survey | QuestionType, SurveyQuestion, SurveyResponse |
| Voting | VotingSession |
| Recommendations | TripRecommendation, SurveyAnalysis |
| Itinerary | ItineraryDayData |

---

## Tests

**Total: 1425 tests across 64 Vitest unit/integration test files** (0 TSC errors in production code, 0 in test files as of 2026-04-13)

| File | Lines | Tests | Coverage |
|------|-------|-------|----------|
| `src/__tests__/api/trips.test.ts` | 525 | 30 | Trips API (GET, POST, PATCH, DELETE) |
| `src/__tests__/api/trips-suggestions.test.ts` | — | 23 | Trips suggestions API (Ticketmaster + Places) |
| `src/__tests__/api/trips-flights.test.ts` | — | 26 | Trips flights API (Amadeus-style) |
| `src/__tests__/api/trips-members.test.ts` | — | 41 | Trips members API (GET, POST, PATCH, DELETE) — 12 POST tests added 2026-03-21 |
| `src/__tests__/api/verify-email.test.ts` | — | 9 | Email verification token flow (GET /api/auth/verify-email) |
| `src/__tests__/api/pusher-auth.test.ts` | — | 14 | Pusher channel auth (POST /api/pusher/auth) |
| `src/__tests__/api/auth-signup.test.ts` | — | 15 | POST /api/auth/signup — validation, token creation, email send ✅ 2026-03-22 |
| `src/__tests__/api/trips-tripid.test.ts` | — | 20 | GET/PATCH/DELETE /api/trips/[tripId] ✅ 2026-03-22 |
| `src/__tests__/api/ai-chat.test.ts` | — | ~12 | POST /api/ai/chat ✅ 2026-03-22 |
| `src/__tests__/api/ai-recommend.test.ts` | — | ~12 | POST/GET /api/ai/recommend ✅ 2026-03-22 |
| `src/__tests__/api/trips-tripid-invitations.test.ts` | — | 14 | GET/POST /api/trips/[tripId]/invitations ✅ 2026-03-22 |
| `src/__tests__/api/trips-tripid-recommendations.test.ts` | — | 11 | GET/POST /api/trips/[tripId]/recommendations ✅ 2026-03-22 |
| `src/__tests__/api/trips-voting.test.ts` | — | 50 | Full voting session lifecycle — GET/POST/PUT /api/trips/[tripId]/voting ✅ 2026-03-23 |
| `src/__tests__/api/trips-invitations.test.ts` | — | 33 | GET/POST /api/trips/[tripId]/invitations with edge cases ✅ 2026-03-23 |
| `src/__tests__/api/pusher-feed-social.test.ts` | — | 38 | pusher/auth, feed/comments, feed/engagement, feed/share social routes ✅ 2026-03-23 |
| `src/__tests__/api/trips-itinerary.test.ts` | — | 43 | GET/POST/PUT /api/trips/[tripId]/itinerary ✅ 2026-03-23 |
| `src/__tests__/api/trips-itinerary.test.ts` | — | 21 | GET/PUT /api/trips/[tripId]/itinerary (expanded) ✅ 2026-03-24 |
| `src/__tests__/api/auth-demo.test.ts` | — | 13 | POST/GET /api/auth/demo — DEMO_MODE guard, Zod validation ✅ 2026-03-24 |
| `src/__tests__/api/cron.test.ts` | — | 10 | GET /api/cron — CRON_SECRET validation, job execution ✅ 2026-03-24 |
| `src/__tests__/api/discover-search.test.ts` | — | 12 | GET /api/discover/search — auth guard, rate limiting, Zod params ✅ 2026-03-24 |
| `src/__tests__/api/invitations-post.test.ts` | — | 18 | POST /api/trips/[tripId]/invitations — accept/decline flows ✅ 2026-03-25 |
| `src/__tests__/api/ai-get-methods.test.ts` | — | 16 | GET /api/ai/chat + GET /api/ai/recommend ✅ 2026-03-25 |
| `src/__tests__/api/beta-extended.test.ts` | — | 21 | Extended beta route coverage ✅ 2026-03-25 |
| `src/__tests__/api/users-follow.test.ts` | — | 24 | POST /api/users/[userId] follow/unfollow lifecycle ✅ 2026-03-25 |
| `src/__tests__/services/recommendation.service.test.ts` | — | 45 | RecommendationService: analyzeSurveyResponses, dateAnalysis, locationPreferences, activityPreferences, createTripSurvey ✅ 2026-03-26 |
| `src/__tests__/services/survey.service.test.ts` | — | 36 | SurveyService: getUserPreferencesSurvey, getTripPlanningSurvey, analyzeSurveyResponses, closeSurvey, createTripSurvey (default+custom expiry) ✅ 2026-03-26 |
| `src/__tests__/api/geocoding-images.test.ts` | — | 32 | GET /api/geocoding + GET /api/images/search ✅ 2026-03-26 |
| `src/__tests__/api/ai-generate-itinerary.test.ts` | — | 31 | POST /api/ai/generate-itinerary — auth, 503 guard, rate-limit, validation, 404/403, multi-day, AI/DB failures ✅ 2026-03-29 |
| `src/__tests__/api/ai-suggest-activities.test.ts` | — | 25 | POST /api/ai/suggest-activities — pure AI generation, no Prisma ✅ 2026-03-29 |
| `src/__tests__/api/discover-import.test.ts` | — | 21 | POST /api/discover/import — rate limiting, auth guard, externalActivity.upsert, OpenTripMap fetch ✅ 2026-03-29 |
| `src/__tests__/api/health.test.ts` | — | 11 | GET /api/health — DB connected/error states, timestamp format, concurrent requests ✅ 2026-04-13 |
| `src/__tests__/api/trip-collaboration-integration.test.ts` | — | 31 | Integration: trip creation, member management, real-time collaboration, invitation lifecycle ✅ 2026-04-13 |
| `src/__tests__/services/events.service.test.ts` | — | 44 | EventsService: searchEvents, searchPlaces, getPlaceDetails, searchFlights, getPriceEstimate, getDestinationInfo ✅ 2026-04-13 |
| `src/__tests__/lib/sanitize.test.ts` | — | 66 | sanitizeHTML, sanitizeInput: XSS vectors, edge cases, DOMPurify integration ✅ 2026-04-13 |
| `src/__tests__/lib/pusher-lib.test.ts` | — | 39 | Pusher server/client instantiation, channel helpers, broadcastToTrip/broadcastToUser ✅ 2026-04-13 |
| `src/__tests__/api/voting.test.ts` | — | 10 | Voting API (create, vote, close session) |
| `src/__tests__/api/survey.test.ts` | — | 11 | Survey API (create, respond, analyze) |
| `src/__tests__/api/feed.test.ts` | — | 12 | Feed API (pagination, comments, engagement) |
| `src/__tests__/lib/email.test.ts` | — | 14 | Email service (templates, delivery) |
| `src/__tests__/lib/geocoding.test.ts` | — | 26 | Geocoding (coords, city lookup, caching) |
| `src/__tests__/lib/invitations.test.ts` | — | 16 | Invitation tokens (generate, validate, redeem) |
| `src/__tests__/lib/rate-limit.test.ts` | — | 13 | Rate limiting (quota, window, headers) |
| `src/__tests__/lib/geocoding.test.ts` | — | 25 | Geocoding (coords, city lookup, caching) |
| `src/__tests__/lib/invitations.test.ts` | — | 16 | Invitation tokens (generate, validate, redeem) |
| `src/__tests__/lib/rate-limit.test.ts` | — | 38 | Rate limiting (quota, window, headers) |
| `src/__tests__/api/auth.test.ts` | — | 10 | Auth flow (signup, signin, session) |
| `src/__tests__/api/notifications.test.ts` | — | 19 | Notifications API (inbox, mark-read, delete) |
| `src/__tests__/api/profile.test.ts` | — | 10 | Profile API (GET, PATCH preferences) |
| `src/__tests__/api/reset-password.test.ts` | 286 | 12 | Password reset API (POST request, PATCH confirm, token validation, expiry) |
| `src/__tests__/api/ai.test.ts` | 411 | 19 | AI routes (chat, recommend, suggest-activities, search, generate-itinerary) |
| `src/__tests__/api/users.test.ts` | 316 | 19 | Users API (follow/unfollow, profile, social) |
| `src/__tests__/api/share.test.ts` | 204 | 13 | Feed share endpoint |
| `src/__tests__/api/inspiration.test.ts` | 358 | 20 | Inspiration API (templates, trending, popular) |
| `src/__tests__/api/search.test.ts` | 328 | 15 | Search API (global, activities, users) |
| `src/__tests__/api/beta-initialize-password.test.ts` | 274 | 15 | Beta password initialization endpoint |
| `src/__tests__/api/inspiration.test.ts` | — | 20 | Inspiration API |
| `src/__tests__/api/search.test.ts` | — | 15 | Search API |
| `src/__tests__/api/share.test.ts` | — | 13 | Feed share API |
| `src/__tests__/api/ai.test.ts` | — | 19 | AI routes (suggest-activities, generate-itinerary) |
| `src/__tests__/api/users.test.ts` | — | 19 | Users API + health endpoint |
| `src/__tests__/api/activities.test.ts` | — | 15 | Activities API (GET, POST save/unsave, PUT comment/rate) |
| `src/__tests__/api/beta.test.ts` | — | 21 | Beta signup, beta status, newsletter subscribe |
| `src/__tests__/api/trips-suggestions-flights.test.ts` | — | 20 | GET /api/trips/[tripId]/suggestions and /flights |
| `src/__tests__/api/trips-members.test.ts` | — | 29 | GET/PATCH/DELETE /api/trips/[tripId]/members |
| `src/__tests__/api/trips-activities-itinerary.test.ts` | — | 37 | GET/POST /api/trips/[tripId]/activities; GET/PUT /api/trips/[tripId]/itinerary |
| `src/__tests__/api/users-me.test.ts` | — | 18 | GET/PATCH /api/users/me |
| `src/__tests__/api/feed-comments-engagement.test.ts` | — | 46 | GET/POST /api/feed/comments; POST /api/feed/engagement |
| `src/__tests__/api/invitations.test.ts` | — | 24 | GET /api/invitations; GET/POST /api/invitations/[invitationId] |
| `src/__tests__/setup.ts` | — | — | Test environment/fixture config |
| `vitest.config.ts` | 16 | — | Vitest runner configuration |

---

## E2E Tests

**Framework:** Playwright (`@playwright/test`)
**Config:** `playwright.config.ts` — chromium only, auto dev server in CI
**Run:** `npm run test:e2e` (local) / `npm run test:e2e:ui` (interactive)
**Install:** `npx playwright install chromium`

| File | Lines | Suites | Tests | Coverage |
|------|-------|--------|-------|----------|
| `e2e/smoke.spec.ts` | 156 | 4 | 11 | Landing page CTA, auth flow (signup/signin/validation), protected route redirects, API health checks |

### E2E Suite Summary

| Suite | Tests | Description |
|-------|-------|-------------|
| Landing Page | 2 | Title, CTA button visibility, nav links |
| Auth Flow | 4 | Signup/signin page load, email validation, invalid credentials error |
| Protected Routes | 3 | Unauthenticated redirect for /trips, /profile, /feed |
| API Health | 6 | /api/health 200, unauthenticated 401s, password reset 200, feed validation 400 |

---

## Codebase Health

| Metric | Status |
|--------|--------|
| Lint warnings | 0 |
| `any` types | 0 ✅ |
| `console.*` | 0 ✅ |
| TSC errors (prod + test) | 0 ✅ |
| Vitest tests | 1425 passing (64 files) |
| E2E tests | 11 Playwright smoke tests (4 suites) |
| Error monitoring | Sentry installed (server + client + edge) — 9/48 routes instrumented — needs `SENTRY_DSN` in Vercel |
| Files >400 lines | ~10 (0 files exceed 600 lines) |
| Production env gaps | OPENAI_API_KEY, Pusher vars, Sentry DSN, Resend domain |

### Largest Files (>400 lines)

| File | Lines | Action |
|------|-------|--------|
| `app/profile/page.tsx` | 539 | Extract profile sections |
| `components/trips/AddActivityModal.tsx` | 485 | Extract form sections |
| `components/surveys/SurveyBuilder.tsx` | 473 | Extract question editor |
| `services/recommendation.service.ts` | 459 | Consider splitting by concern |
| `types/index.ts` | 449 | Split by domain |
| `components/feed/RichFeedItem.tsx` | 432 | Extract reaction/comment sections |
| `app/inspiration/page.tsx` | 401 | Extract template/trending sections |
| `app/api/inspiration/route.ts` | 398 | Extract template data |

---

## Documentation Index

| File | Purpose |
|------|---------|
| `docs/README.md` | Documentation index |
| `docs/CODEMAP.md` | This file — full codebase reference |
| `docs/IMPLEMENTATION_STACK.md` | Tech stack details |
| `docs/FUTURE_IMPLEMENTATION.md` | Planned features |
| `docs/PRODUCTION_ROADMAP.md` | Production deployment plan |
| `docs/LAUNCH_CHECKLIST.md` | Pre-launch validation |
| `docs/SECURITY_AUDIT.md` | Security assessment |
| `docs/TEST_CASES.md` | QA test scenarios |
| `docs/N8N_SETUP_SUMMARY.md` | N8N automation config |
| `docs/N8N_BETA_NEWSLETTER_INTEGRATION.md` | N8N workflow docs |
| `docs/N8N_DEPLOYMENT_CHECKLIST.md` | N8N deployment steps |
| `docs/agents/CODE_CHECKING_AGENT_GUIDE.md` | Linting/type-checking agent |
| `docs/agents/FRONTEND_AGENT_GUIDE.md` | Component/UI agent |
| `docs/agents/PLANNING_AGENT_GUIDE.md` | Task planning agent |
| `docs/agents/SOCIAL_ENGAGEMENT_AGENT_GUIDE.md` | Feed/social agent |
