# OutTheGroupchat - Full Implementation Stack

## Overview

OutTheGroupchat is a full-stack group travel planning application built with modern web technologies, AI integration, and real-time collaboration features.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Next.js   │  │   React     │  │   Framer    │  │  Tailwind   │        │
│  │  App Router │  │   18.2      │  │   Motion    │  │    CSS      │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                          │
│  │  TanStack   │  │   Pusher    │  │  React Hook │                          │
│  │   Query     │  │     JS      │  │    Form     │                          │
│  └─────────────┘  └─────────────┘  └─────────────┘                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Next.js API Routes (App Router)                    │    │
│  │  /api/trips    /api/ai    /api/notifications    /api/search          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  NextAuth   │  │    Zod      │  │   Prisma    │  │   Pusher    │        │
│  │     .js     │  │ Validation  │  │   Client    │  │   Server    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SERVICE LAYER                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                    │
│  │    Survey     │  │ Recommendation│  │    Events     │                    │
│  │   Service     │  │    Service    │  │   Service     │                    │
│  └───────────────┘  └───────────────┘  └───────────────┘                    │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         AI Integration Layer                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │  │
│  │  │   OpenAI    │  │  Anthropic  │  │  Embeddings │                    │  │
│  │  │   GPT-4o    │  │   Claude    │  │   Vector    │                    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        PostgreSQL Database                              │  │
│  │  Users │ Trips │ Activities │ Surveys │ Votes │ Notifications          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                           Prisma ORM                                    │  │
│  │  Schema │ Migrations │ Client │ Studio                                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Amadeus   │  │Ticketmaster │  │   Google    │  │  Eventbrite │        │
│  │   Flights   │  │   Events    │  │   Places    │  │   Events    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 14.1.3 | React framework with App Router |
| **React** | 18.2.0 | UI component library |
| **TypeScript** | 5.4.2 | Type safety |
| **Tailwind CSS** | 3.4.1 | Utility-first CSS framework |
| **Framer Motion** | 11.0.0 | Animation library |
| **TanStack Query** | 5.59.0 | Server state management |
| **React Hook Form** | 7.54.2 | Form handling |
| **Zod** | 3.24.2 | Schema validation |
| **date-fns** | 3.6.0 | Date manipulation |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js API Routes** | 14.1.3 | REST API endpoints |
| **Prisma** | 5.22.0 | Database ORM |
| **PostgreSQL** | 15+ | Relational database |
| **NextAuth.js** | 4.24.7 | Authentication |
| **bcryptjs** | 3.0.2 | Password hashing |

### AI & ML

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vercel AI SDK** | 3.4.14 | AI provider abstraction |
| **@ai-sdk/openai** | 0.0.70 | OpenAI integration |
| **@ai-sdk/anthropic** | 0.0.54 | Claude integration |
| **Custom Embeddings** | - | In-memory vector search |

### Real-time

| Technology | Version | Purpose |
|------------|---------|---------|
| **Pusher** | 5.2.0 | Server-side WebSocket |
| **Pusher-js** | 8.4.0 | Client-side WebSocket |

### External APIs

| Service | Purpose |
|---------|---------|
| **Amadeus** | Flight search and booking |
| **Ticketmaster** | Event discovery |
| **Eventbrite** | Event discovery |
| **Google Places** | Location and venue data |

---

## Database Schema

### Core Models

```prisma
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  name            String
  password        String?
  emailVerified   DateTime?
  image           String?
  city            String?
  bio             String?
  phone           String?
  preferences     Json?
  lastActive      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  ownedTrips      Trip[]   @relation("owner")
  tripMemberships TripMember[]
  followers       Follow[] @relation("followers")
  following       Follow[] @relation("following")
  notifications   Notification[]
  surveyResponses SurveyResponse[]
  votes           Vote[]
  savedActivities SavedActivity[]
  activityComments ActivityComment[]
  activityRatings  ActivityRating[]
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
  
  // Relations
  members     TripMember[]
  invitations TripInvitation[]
  survey      TripSurvey?
  activities  Activity[]
  itinerary   ItineraryDay[]
  votingSessions VotingSession[]
}

model Activity {
  id          String   @id @default(cuid())
  tripId      String
  name        String
  description String?
  category    String?
  status      ActivityStatus @default(SUGGESTED)
  location    Json?
  date        DateTime?
  duration    Int?     // minutes
  cost        Float?
  priceRange  PriceRange?
  externalId  String?
  externalUrl String?
  imageUrl    String?
  isPublic    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  trip        Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  itineraryItems ItineraryItem[]
  savedBy     SavedActivity[]
  comments    ActivityComment[]
  ratings     ActivityRating[]
}

model TripSurvey {
  id        String   @id @default(cuid())
  tripId    String   @unique
  title     String
  status    SurveyStatus @default(DRAFT)
  questions Json     // Array of question configs
  expiresAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  responses SurveyResponse[]
}

model VotingSession {
  id          String   @id @default(cuid())
  tripId      String
  title       String
  description String?
  type        VotingType @default(SINGLE_CHOICE)
  status      VotingStatus @default(ACTIVE)
  options     Json     // Array of voting options
  expiresAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  trip        Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  votes       Vote[]
}
```

### Enums

```prisma
enum TripStatus {
  PLANNING
  SURVEYING
  VOTING
  BOOKED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum MemberRole {
  OWNER
  ADMIN
  MEMBER
}

enum ActivityStatus {
  SUGGESTED
  APPROVED
  REJECTED
  COMPLETED
}

enum PriceRange {
  BUDGET
  MODERATE
  EXPENSIVE
  LUXURY
}
```

---

## API Endpoints

### Trips

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips` | List user's trips |
| POST | `/api/trips` | Create new trip |
| GET | `/api/trips/[tripId]` | Get trip details |
| PATCH | `/api/trips/[tripId]` | Update trip |
| DELETE | `/api/trips/[tripId]` | Delete trip |
| GET | `/api/trips/[tripId]/itinerary` | Get itinerary |
| PUT | `/api/trips/[tripId]/itinerary` | Update itinerary |
| GET/POST | `/api/trips/[tripId]/survey` | Survey management |
| GET/POST | `/api/trips/[tripId]/voting` | Voting sessions |
| GET/POST | `/api/trips/[tripId]/activities` | Activities |
| GET/POST | `/api/trips/[tripId]/members` | Members |
| GET/POST | `/api/trips/[tripId]/invitations` | Invitations |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/generate-itinerary` | Generate AI itinerary |
| POST | `/api/ai/suggest-activities` | Get activity suggestions |
| POST | `/api/ai/chat` | Chat with trip assistant (streaming) |
| GET/POST | `/api/ai/search` | Semantic search |

### Users & Social

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PATCH | `/api/users/me` | Current user profile |
| GET/PATCH | `/api/users/[userId]` | User profile |
| GET | `/api/notifications` | User notifications |
| PATCH | `/api/notifications/[id]` | Mark as read |
| GET | `/api/feed` | Activity feed |
| GET | `/api/search` | Global search |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron` | Background jobs (Vercel cron) |
| POST | `/api/pusher/auth` | Pusher authentication |

---

## File Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── ai/                   # AI endpoints
│   │   │   ├── chat/route.ts
│   │   │   ├── generate-itinerary/route.ts
│   │   │   ├── search/route.ts
│   │   │   └── suggest-activities/route.ts
│   │   ├── cron/route.ts
│   │   ├── feed/route.ts
│   │   ├── notifications/
│   │   ├── pusher/auth/route.ts
│   │   ├── search/route.ts
│   │   ├── trips/
│   │   │   ├── route.ts
│   │   │   └── [tripId]/
│   │   │       ├── route.ts
│   │   │       ├── activities/route.ts
│   │   │       ├── invitations/route.ts
│   │   │       ├── itinerary/route.ts
│   │   │       ├── members/route.ts
│   │   │       ├── recommendations/route.ts
│   │   │       ├── survey/route.ts
│   │   │       └── voting/route.ts
│   │   └── users/
│   ├── discover/page.tsx
│   ├── feed/page.tsx
│   ├── trips/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [tripId]/
│   │       ├── page.tsx
│   │       ├── survey/page.tsx
│   │       └── vote/page.tsx
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── ui/                       # Base components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── index.ts
│   ├── trips/
│   │   ├── TripCard.tsx
│   │   ├── TripList.tsx
│   │   └── index.ts
│   ├── surveys/
│   │   ├── QuestionRenderer.tsx
│   │   └── index.ts
│   ├── voting/
│   │   ├── VotingCard.tsx
│   │   ├── ResultsChart.tsx
│   │   └── index.ts
│   ├── social/
│   │   ├── ActivityCard.tsx
│   │   └── index.ts
│   └── Navigation.tsx
│
├── hooks/
│   ├── useTrips.ts
│   └── usePusher.ts
│
├── lib/
│   ├── ai/
│   │   ├── client.ts
│   │   ├── embeddings.ts
│   │   └── prompts/
│   │       ├── itinerary.ts
│   │       ├── recommendations.ts
│   │       ├── budget.ts
│   │       └── index.ts
│   ├── prisma.ts
│   ├── pusher.ts
│   ├── auth.ts
│   └── providers.tsx
│
├── services/
│   ├── survey.service.ts
│   ├── recommendation.service.ts
│   └── events.service.ts
│
├── styles/
│   └── globals.css
│
└── types/
    └── index.ts
```

---

## Environment Variables

```bash
# Database
DATABASE_URL="postgresql://..."

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."

# AI
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."

# Real-time
PUSHER_APP_ID=""
PUSHER_KEY=""
PUSHER_SECRET=""
PUSHER_CLUSTER="us2"
NEXT_PUBLIC_PUSHER_KEY=""
NEXT_PUBLIC_PUSHER_CLUSTER="us2"

# External APIs
AMADEUS_API_KEY=""
AMADEUS_API_SECRET=""
TICKETMASTER_API_KEY=""
EVENTBRITE_API_KEY=""
GOOGLE_PLACES_API_KEY=""

# Cron
CRON_SECRET=""
```

---

## Deployment Configuration

### Vercel Settings (`vercel.json`)

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
npm run build      # Production build
npm run db:push    # Push schema to database
npm run db:migrate # Create migrations
npm run db:seed    # Seed demo data
```

---

## Security Measures

1. **Authentication**: NextAuth.js with session-based auth
2. **Authorization**: Role-based access control (OWNER, ADMIN, MEMBER)
3. **Input Validation**: Zod schemas on all API endpoints
4. **Rate Limiting**: Custom rate limiter for AI endpoints
5. **CORS**: Configured in vercel.json
6. **Password Hashing**: bcryptjs with salt rounds
7. **Environment Variables**: Sensitive data in env vars only

---

## Performance Optimizations

1. **React Query Caching**: 60-second stale time, optimistic updates
2. **API Route Streaming**: AI chat uses streaming responses
3. **Database Indexing**: Prisma auto-indexes on relations
4. **Image Optimization**: Next.js Image component
5. **Code Splitting**: App Router automatic splitting
6. **Edge Caching**: Vercel edge network

---

*Last Updated: December 2024*

