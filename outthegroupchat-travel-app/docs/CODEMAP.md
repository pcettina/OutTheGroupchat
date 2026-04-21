# OutTheGroupchat — Full Codemap

> Auto-generated 2026-03-10. Last updated 2026-04-22 (Phase 6 complete — feed rescope, search people-first, notification migration, types cleanup). Comprehensive reference for agents and developers.
>
> **🔀 Pivot in progress:** See `docs/REFACTOR_PLAN.md`. Trip-planning surface archived under `_archive/` directories as of Phase 1 (2026-04-16). See [Archived surface (Phase 1)](#archived-surface-phase-1) section below and `src/_archive/README.md` for the preservation scheme.
>
> **Naming locked 2026-04-17:** Relationship entity is `Crew` (not `Connection`). Nightly build scaffolded as `Connection`; Phase 2 PR on `refactor/phase-2-crew-domain` renames to `Crew`. User-facing term defaults to "Crew" but is personalizable via `User.crewLabel String? @db.VarChar(20)` (1–20 chars). See REFACTOR_PLAN §3.5.

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
**Stats (post-Phase-6-complete, 2026-04-22):** 50 live API routes (35 base + 6 Crew routes + 9 Phase 4 meetup/venue/cron routes + 3 Phase 5 check-in routes + privacy route + 2 Phase 6 AI routes: suggest-meetups, icebreakers; 13 archived in Phase 1; feed POST now 410) | live component groups: auth, feed (rescoped to meetup/checkin types, tabs updated), social (incl. `CrewButton`, `CrewRequestCard`, `CrewList`), meetups (incl. `MeetupCard`, `MeetupList`, `CreateMeetupModal`, `RSVPButton`, `VenuePicker`, `AttendeeList`, `MeetupInviteModal`), checkins (incl. `CheckInButton`, `LiveActivityCard`, `NearbyCrewList`), discover, notifications, profile (incl. Recent Check-ins section), search, settings (incl. `PrivacySettingsForm`), onboarding, ai, ui, accessibility + Navigation (incl. privacy link) | live pages: /, /auth/*, /profile, `/profile/[userId]`, /feed, /discover, /inspiration, /notifications, /search, /settings, `/settings/privacy`, /onboarding, /privacy, /terms, `/crew`, `/crew/requests`, `/meetups`, `/meetups/new`, `/meetups/[id]`, `/checkins`, `/checkins/[id]` | middleware: auth-protects `/profile/:path*`, `/crew/:path*`, `/meetups/:path*`, `/checkins/:path*`, `/settings/:path*`, `/api/checkins/*`, plus select `/api/*` paths
**Test Health (2026-04-22):** 58 live test files (+3: feed.test.ts, feed-extended.test.ts, notifications-rescoped.test.ts) | ~1050 tests passing | 0 TSC errors | Phase 6 COMPLETE: feed rescoped, search people-first, 9 trip notification types removed, types/index.ts cleaned (264 lines), suggest-meetups + icebreakers AI routes live

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
│   │   └── api/                   # 57 API route files (see API Routes section)
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
| **User** | id, email (unique), password?, name?, image?, bio?, city?, preferences (Json), betaSignupDate?, newsletterSubscribed, passwordInitialized, **crewLabel? (VarChar(20), 1–20 chars alphanumeric + spaces — Phase 2, 2026-04-17)** | accounts[], sessions[], ownedTrips[], tripMemberships[], invitations[], surveyResponses[], followers[], following[], savedActivities[], notifications[], crewA[], crewB[] (Phase 2) | Indexed on email |
| **Follow** | id, followerId, followingId | User (follower), User (following) | Unique on [followerId, followingId]. Legacy (retained until Phase 6). |
| **Notification** | id, userId, type (enum), title, message, data (Json), read | User | Indexed on [userId, read] |

#### Social Domain (Phase 2, added on `refactor/phase-2-crew-domain` 2026-04-17)

> Schema extended with 10 new models + 8 enums. Nightly build scaffolded under `Connection`; Phase 2 PR renames to `Crew`. Zod validation in `src/lib/validations/social.ts`. TypeScript composites in `src/types/social.ts`. Seed data in `prisma/seed/generators/socialDomain.ts`.

| Model | Key Fields | Notes |
|-------|-----------|-------|
| **Crew** (renames `Connection`) | id, userAId, userBId, status (PENDING/ACCEPTED/DECLINED/BLOCKED), requestedById, createdAt, updatedAt | **Single-row bidirectional** with `userAId < userBId` convention + DB CHECK constraint (Q2 resolved 2026-04-17). `requestedById` tracks initiator. Unique on [userAId, userBId]. Replaces/extends `Follow`. |
| **Meetup** | id, hostId, venueId, title, description?, startsAt, endsAt?, capacity?, visibility (PUBLIC/CREW/INVITE_ONLY/PRIVATE — **default `CREW`**, Q3 resolved 2026-04-17) | Replaces `Trip`. Visibility-scoped feed queries. |
| **MeetupAttendee** | id, meetupId, userId, status (GOING/MAYBE/DECLINED), rsvpedAt, checkedInAt? | RSVP record; unique on [meetupId, userId] |
| **MeetupInvite** | id, meetupId, inviterId, inviteeId, status, expiresAt | Explicit invite; separate from Crew request |
| **Venue** | id, name, address, latitude, longitude, cityId, category, externalSource?, externalId? | Places API + geocoding |
| **City** | id, name, country, latitude, longitude, timezone | Geographic grouping |
| **CheckIn** | id, userId, venueId, visibility, note?, createdAt, **activeUntil DateTime @default(dbgenerated("now() + interval '6 hours'"))** (Q4 resolved 2026-04-17) | Feed/presence queries filter `WHERE activeUntil > now()`. Row persists indefinitely for attendance history. |
| **Poll** | id, meetupId?, hostId, type (SURVEY/VOTE/RSVP_POLL), question, options (Json), closesAt? | Generalizes `TripSurvey` + `VotingSession` |
| **PollResponse** | id, pollId, userId, choice, rank? | Unique on [pollId, userId]; merges `SurveyResponse` + `Vote` |
| **Post** | id, authorId, content, mediaUrls[], meetupId?, checkInId? | Generalized feed entry (to be adopted in Phase 6) |

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

### Trips CRUD (📦 ARCHIVED 2026-04-16)

> Moved to `src/app/api/_archive/trips/`. See [Archived surface (Phase 1)](#archived-surface-phase-1). Paths below no longer resolve at runtime.

### Activities (📦 ARCHIVED 2026-04-16)

> `/api/activities/[activityId]` moved to `src/app/api/_archive/activities/`. See [Archived surface (Phase 1)](#archived-surface-phase-1).

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
| `/api/feed` | GET | Yes | No | Activity feed with pagination — **rescoped 2026-04-21**: types now `meetup_created`, `check_in_posted`, `crew_formed`, `meetup_attended`, `post_created`; trip/activity queries removed; POST returns 410 Gone |
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
| `/api/ai/suggest-meetups` | POST | Yes | Yes | **Phase 6 (2026-04-21)** — Given user city/Crew/check-ins, suggest meetup ideas via OpenAI |
| `/api/ai/icebreakers` | POST | Yes | Yes | **Phase 6 (2026-04-21)** — Given a new Crew member context, return conversation starters via OpenAI |

### Meetups & Venues (Phase 4, 2026-04-18)

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/meetups` | POST | Yes | Yes | Create meetup (default visibility=`CREW`) |
| `/api/meetups` | GET | Yes | Yes | List meetups (city filter, visibility-scoped to caller's Crew, paginated) |
| `/api/meetups/[id]` | GET | Yes | Yes | Meetup detail |
| `/api/meetups/[id]` | PATCH | Yes | Yes | Edit meetup (host only) |
| `/api/meetups/[id]` | DELETE | Yes | Yes | Cancel meetup (host only) |
| `/api/meetups/[id]/rsvp` | POST | Yes | Yes | RSVP — GOING / MAYBE / DECLINED |
| `/api/meetups/[id]/invite` | POST | Yes | Yes | Invite Crew members to meetup |
| `/api/venues/search` | GET | Yes | Yes | Venue search — DB-first with Google Places API fallback + auto-caching |
| `/api/cron/meetup-starting-soon` | GET | Bearer | Yes | Cron: MEETUP_STARTING_SOON reminder dispatch (T-55–65min, idempotent) |

### Check-ins (Phase 5, 2026-04-19/2026-04-20)

| Endpoint | Methods | Auth | Zod | Purpose |
|----------|---------|------|-----|---------|
| `/api/checkins` | POST | Yes | Yes | Create check-in (`activeUntilMinutes` override 30–720; default 360=6h); triggers `CREW_CHECKED_IN_NEARBY` notifications + Pusher city-channel broadcast; Phase 5 S1+S2 |
| `/api/checkins` | GET | Yes | Yes | Get own check-ins |
| `/api/checkins/feed` | GET | Yes | Yes | Crew's recent check-ins (`WHERE activeUntil > now()`), visibility-scoped |
| `/api/checkins/[id]` | GET | Yes | Yes | Check-in detail; Phase 5 Session 2, 2026-04-20 |
| `/api/checkins/[id]` | DELETE | Yes | Yes | Cancel own check-in |
| `/api/users/privacy` | POST, PATCH | Yes | Yes | Check-in privacy settings (PUBLIC/CREW/PRIVATE); Phase 5 Session 2, 2026-04-20 |

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
| ~~`/trips`~~ | 📦 archived to `app/_archive/trips/page.tsx` 2026-04-16 | — | — | Archived in Phase 1 pivot |
| ~~`/trips/new`~~ | 📦 archived 2026-04-16 | — | — | — |
| ~~`/trips/[tripId]`~~ | 📦 archived 2026-04-16 | — | — | — |
| ~~`/trips/[tripId]/survey`~~ | 📦 archived 2026-04-16 | — | — | — |
| ~~`/trips/[tripId]/vote`~~ | 📦 archived 2026-04-16 | — | — | — |
| `/discover` | `app/discover/page.tsx` | Client | Public | Destination discovery & inspiration |
| `/inspiration` | `app/inspiration/page.tsx` | Client | Public | Trending trips, events |
| `/feed` | `app/feed/page.tsx` | Client | Required | Social activity feed |
| `/notifications` | `app/notifications/page.tsx` | Client | Required | Notification inbox |
| `/profile` | `app/profile/page.tsx` | Client | Required | User profile, badges, trip history |
| `/settings/privacy` | `app/settings/privacy/page.tsx` | Client | Required | Check-in privacy settings — visibility controls; Phase 5 Session 2, 2026-04-20 |
| `/checkins` | `app/checkins/page.tsx` | Client | Required | "Who's Out Tonight?" feed — NearbyCrewList + CheckInButton; Phase 5 Session 1 |
| `/checkins/[id]` | `app/checkins/[id]/page.tsx` | Client | Required | Check-in detail page; Phase 5 Session 2, 2026-04-20 |

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

> Note: `SignUpForm` was deleted 2026-04-16 (confirmed unused dead code).

### Discover (`components/discover/`)

> Note: `CategoryFilter`, `DestinationCard`, `TrendingSection` were deleted 2026-04-16 (confirmed unused dead code).

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
| `PrivacySettingsForm` | — | initialVisibility?, onSave? | Check-in visibility controls (PUBLIC/CREW/PRIVATE); wires to `/api/users/privacy`; Phase 5 Session 2, 2026-04-20 |
| `ProfileSettings` | — | user?, onSave? | Name, bio, avatar, email |
| `SecuritySettings` | 279 | user?, onPasswordChange? | Password, 2FA, sessions |

### Meetups (`components/meetups/`) — Phase 4, 2026-04-18

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `MeetupCard` | — | meetup, onRSVP?, onShare? | Meetup summary card with RSVP count + host |
| `MeetupList` | — | meetups, loading?, onRSVP? | Grid/list of MeetupCards with empty state |
| `CreateMeetupModal` | — | open, onOpenChange, onSuccess? | Modal form to create a new meetup with VenuePicker |
| `RSVPButton` | — | meetupId, currentStatus?, onStatusChange? | GOING / MAYBE / DECLINED toggle |
| `VenuePicker` | — | onSelect, cityId? | Searchable venue selector wired to /api/venues/search |
| `AttendeeList` | 153 | attendees, hostId? | Attendee grouping by GOING/MAYBE/DECLINED with count badges |
| `MeetupInviteModal` | 335 | open, onOpenChange, meetupId | Framer Motion modal; multi-select Crew member invite |

### Check-ins (`components/checkins/`) — Phase 5, 2026-04-18

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `CheckInButton` | — | onSuccess? | Post a check-in with optional venue + note |
| `LiveActivityCard` | 175 | checkIn, onJoinMe?, className? | Check-in card with active timer, venue, note, and "Join me" CTA |
| `NearbyCrewList` | 110 | className? | Polls `/api/checkins/feed` every 60s, renders `LiveActivityCard` list |

### Social (`components/social/`)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `ActivityCard` | — | activity, trip?, onSave?, onShare? | Activity recommendation card |

> Note: `TravelBadges` was deleted 2026-04-16 (confirmed unused dead code).

### Surveys (`components/surveys/`) — 📦 ARCHIVED 2026-04-16

> Moved to `src/components/_archive/surveys/`. May be repurposed for Poll UI in Phase 2. See [Archived surface (Phase 1)](#archived-surface-phase-1).

### Trips (`components/trips/`) — 📦 ARCHIVED 2026-04-16

> All trip components (TripCard, TripList, TripWizard, TripHeader, TripOverview, MemberList, ItineraryTimeline, InviteModal, InviteMemberModal, AddActivityModal, wizard steps) moved to `src/components/_archive/trips/`. See [Archived surface (Phase 1)](#archived-surface-phase-1).

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

### Voting (`components/voting/`) — 📦 ARCHIVED 2026-04-16

> All voting components moved to `src/components/_archive/voting/`. May be repurposed for Poll UI in Phase 2. See [Archived surface (Phase 1)](#archived-surface-phase-1).

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
| SurveyService | `services/survey.service.ts` | 377 | createSurvey, recordResponse, analyzeSurvey | Retained (may be repurposed as generic Poll service in Phase 2) |
| ~~RecommendationService~~ | 📦 `services/_archive/recommendation.service.ts` | — | — | Archived 2026-04-16 |
| ~~RecommendationData~~ | 📦 `services/_archive/recommendation-data.ts` | — | — | Archived 2026-04-16 |
| ~~EventsService~~ | 📦 `services/_archive/events.service.ts` | — | — | Archived 2026-04-16 |

---

## Hooks & Contexts

### Hooks (`hooks/`)

| Hook | File | Returns | Purpose |
|------|------|---------|---------|
| ~~`useTrips` / `useTrip` / `useCreateTrip` / `useUpdateTrip` / `useDeleteTrip`~~ | 📦 archived to `hooks/_archive/useTrips.ts` 2026-04-16 | — | — |
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

**Files:** `src/types/index.ts` (449 lines) | `src/types/social.ts` (Phase 2, social domain composites) | `src/types/meetup.ts` (Phase 4, meetup/venue/attendee types) | `src/types/checkin.ts` (Phase 5, CheckIn types + `CheckInVisibility` enum)

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

**Total: ~1050 tests across 58 Vitest unit/integration test files** (Phase 6 complete, 2026-04-22; +3 test files; 0 TSC errors)

| File | Lines | Tests | Coverage |
|------|-------|-------|----------|
| `src/__tests__/api/feed.test.ts` | — | 12 | GET /api/feed — rescoped meetup/checkin item types, pagination, auth ✅ 2026-04-22 Phase 6 |
| `src/__tests__/api/feed-extended.test.ts` | — | 25 | Feed edge cases — empty feed, multiple content types, DB errors, feedType params ✅ 2026-04-22 Phase 6 |
| `src/__tests__/api/notifications-rescoped.test.ts` | — | 18 | Social notification types — CREW_REQUEST, CREW_ACCEPTED, MEETUP_INVITED, MEETUP_RSVP, MEETUP_STARTING_SOON, CREW_CHECKED_IN_NEARBY, SYSTEM ✅ 2026-04-22 Phase 6 |
| `src/__tests__/api/search.test.ts` | — | 21 | GET /api/search — people-first ordering (users→meetups→venues), type enum validation, empty results ✅ 2026-04-22 Phase 6 (rewrote from 13 trip-focused tests) |
| `src/__tests__/api/discover-recommendations.test.ts` | — | 26 | GET /api/discover/recommendations — auth, category filter, rate limiting, pagination, empty results, error paths ✅ 2026-04-21 Phase 6 S1 |
| `src/__tests__/api/suggest-meetups.test.ts` | — | 11 | POST /api/ai/suggest-meetups — auth, Zod validation, OpenAI integration, error handling ✅ 2026-04-21 Phase 6 S1 |
| `src/__tests__/api/icebreakers.test.ts` | — | 10 | POST /api/ai/icebreakers — auth, Zod validation, OpenAI integration, graceful degradation ✅ 2026-04-21 Phase 6 S1 |
| `src/__tests__/api/privacy-settings.test.ts` | — | 28 | GET/PATCH /api/users/privacy — auth, visibility enum validation, Zod errors, update flow ✅ 2026-04-20 Phase 5 S2 |
| `src/__tests__/api/checkins-pusher.test.ts` | — | 16 | Pusher broadcast on POST /api/checkins — city channel trigger, visibility gating, graceful degradation ✅ 2026-04-20 Phase 5 S2 |
| `src/__tests__/api/venues-search-places.test.ts` | 474 | 18 | GET /api/venues/search — auth, DB-only path, Places API path, upsert, dedupe, category filter ✅ 2026-04-18 Phase 4 S3 |
| `src/__tests__/api/cron-meetup-starting-soon.test.ts` | 477 | 18 | GET /api/cron/meetup-starting-soon — auth, query shape, dispatch, idempotency, graceful degradation ✅ 2026-04-18 Phase 4 S3 |
| `src/__tests__/api/meetups.test.ts` | — | 11 | POST/GET /api/meetups — auth, validation, create, list, visibility scoping ✅ 2026-04-18 |
| `src/__tests__/api/meetups-id.test.ts` | — | 16 | GET/PATCH/DELETE /api/meetups/[id] — auth, host-only edit, Pusher broadcast, cancel ✅ 2026-04-18 |
| `src/__tests__/api/meetups-rsvp-invite.test.ts` | — | 22 | RSVP + invite routes — auth, status transitions, Pusher/email wiring, graceful degradation ✅ 2026-04-18 |
| `src/__tests__/api/feed-extended.test.ts` | — | 42 | Feed API edge cases: pagination, empty following, multiple activity types, DB errors, feedType params, POST errors ✅ 2026-04-16 |
| `src/__tests__/api/notifications-extended.test.ts` | — | 33 | Notifications lifecycle edge cases ✅ 2026-04-16 |
| `src/__tests__/api/health.test.ts` | — | 14 | GET /api/health — healthy/degraded paths, content-type, $queryRaw invocation ✅ 2026-04-16 |
| `src/__tests__/api/trips-survey-voting-extended.test.ts` | — | 23 | Survey + voting API edge cases ✅ 2026-04-16 |
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
| Vitest tests | ~1050 passing, 58 test files (Phase 6 complete, 2026-04-22; +3 new: feed.test.ts, feed-extended.test.ts, notifications-rescoped.test.ts); archived tests runnable on demand via `npm run test:archive` |
| E2E tests | 11 Playwright smoke tests (4 suites) — trip-specific specs archived |
| Error monitoring | Sentry — 19/48 coverage on pre-archive branch; coverage recomputed on new live surface in Phase 2 |
| Live API routes | 50 (35 base + 6 Crew + 9 Phase 4 meetup/venue/cron + 3 Phase 5 check-in + privacy + 2 Phase 6 AI: suggest-meetups, icebreakers; feed POST now 410) |
| Files >400 lines | 0 in prod (email.ts 507 lines, email-crew.ts extracted; types/index.ts reduced to 264 lines in Phase 6) |
| Production env gaps | OPENAI_API_KEY, Pusher vars, Sentry DSN, Resend domain, GOOGLE_PLACES_API_KEY |
| **Phase status** | **Phase 6 COMPLETE** (2026-04-22): feed rescoped, search people-first, 9 trip notification types removed, types/index.ts cleaned. Phase 7 (Marketing surface) is next. |

---

## Archived surface (Phase 1)

As of **2026-04-16** the trip-planning product surface has been archived to `_archive/` directories with zero runtime footprint. The code remains browsable, `grep`-able, and revivable. See `src/_archive/README.md` for the preservation scheme and reactivation steps.

### What's archived
| Layer | Destination |
|-------|-------------|
| API routes (14) | `src/app/api/_archive/trips/**`, `src/app/api/_archive/activities/**` |
| Pages | `src/app/_archive/trips/**` |
| Components | `src/components/_archive/trips/**`, `src/components/_archive/surveys/**`, `src/components/_archive/voting/**` |
| Services | `src/services/_archive/recommendation.service.ts`, `recommendation-data.ts`, `events.service.ts` |
| Tests | `src/__tests__/_archive/**` (excluded from default `npm test`) |
| Docs snapshots | `docs/archive/trip-planning/` (owned by agent F) |
| Prisma models | 16 models marked `@deprecated` (Trip, TripMember, TripInvitation, PendingInvitation, TripSurvey, SurveyResponse, VotingSession, Vote, Activity, SavedActivity, ActivityComment, ActivityRating, ItineraryDay, ItineraryItem, ExternalActivity) |
| Git tag | `v1.0-trip-planning` anchors the pre-pivot commit |

### What remains live
- **API (~35 routes):** auth/*, beta/*, feed/*, users/*, profile, search, notifications/*, invitations/*, discover/*, inspiration, ai/* (chat/recommend/search), pusher/auth, geocoding, images/search, newsletter, cron, health
- **Pages:** /, /auth/*, /profile, /feed, /discover, /inspiration, /notifications, /search, /settings, /onboarding, /privacy, /terms
- **Components:** accessibility, ai (chat), auth, discover, feed, notifications, onboarding, profile, search, settings, social, ui + Navigation.tsx (trip links removed)
- **Services:** survey.service.ts (repurpose-pending)
- **Prisma models retained:** User, Account, Session, VerificationToken, Follow, Notification, TripComment, TripLike (last two to be generalized into Post* in Phase 2+)

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
