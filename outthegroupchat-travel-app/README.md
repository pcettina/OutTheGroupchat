# OutTheGroupchat

**The easiest way to plan group trips together.**

A modern web application that helps groups coordinate trip planning through surveys, voting, AI-powered recommendations, and real-time collaboration.

## Features

- **Trip Planning** - Create trips, invite members, set budgets and dates
- **Group Surveys** - Gather preferences from all group members
- **Democratic Voting** - Vote on destinations, activities, and decisions
- **AI-Powered Itineraries** - Generate personalized day-by-day plans
- **Real-time Updates** - Live voting results and collaboration
- **Activity Discovery** - Find and save activities from other travelers
- **Social Features** - Activity feed, comments, and ratings

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **AI**: Vercel AI SDK with OpenAI/Claude
- **Real-time**: Pusher
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **State Management**: TanStack Query

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- API keys (see `.env.example`)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/pcettina/OutTheGroupchat.git
   cd OutTheGroupchat/outthegroupchat-travel-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

4. Set up the database:
   ```bash
   npm run db:push
   npm run db:seed  # Seeds demo users and sample data
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (48 routes)
│   │   ├── ai/           # AI endpoints
│   │   ├── trips/        # Trip CRUD
│   │   └── ...
│   ├── trips/            # Trip pages
│   ├── discover/         # Discovery page
│   └── feed/             # Social feed
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── trips/            # Trip-specific components
│   ├── surveys/          # Survey components
│   ├── voting/           # Voting components
│   └── social/           # Social components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and clients
│   ├── ai/               # AI configuration
│   ├── prisma.ts         # Database client
│   └── pusher.ts         # Real-time client
├── services/              # Business logic
├── styles/               # Global styles
└── types/                # TypeScript types
```

## Environment Variables

See `.env.example` for all required variables. Key services:

| Service | Required | Purpose |
|---------|----------|---------|
| PostgreSQL | Yes | Database |
| NextAuth.js | Yes | Authentication |
| OpenAI/Anthropic | Yes | AI features |
| Pusher | No | Real-time updates |
| Amadeus | No | Flight search |
| Ticketmaster | No | Event discovery |
| Google Places | No | Location data |

## Scripts

```bash
npm run dev        # Start development server
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm run db:push    # Push schema to database
npm run db:migrate # Create migration
npm run db:studio  # Open Prisma Studio
npm run db:seed    # Seed demo users and sample data
```

## Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy!

The project includes:
- `vercel.json` with cron job configuration
- Optimized function durations for AI routes
- Automatic builds on push
- GitHub Actions CI (`.github/workflows/ci.yml`) — TSC, lint, Vitest, Playwright

### Manual Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Set production environment variables

3. Run database migrations:
   ```bash
   npx prisma migrate deploy
   ```

4. Start the server:
   ```bash
   npm start
   ```

## API Documentation

### Core Endpoints

- `GET/POST /api/trips` - List and create trips
- `GET/PATCH/DELETE /api/trips/[tripId]` - Trip CRUD
- `GET/POST /api/trips/[tripId]/survey` - Survey management
- `GET/POST /api/trips/[tripId]/voting` - Voting sessions
- `GET/POST /api/ai/generate-itinerary` - AI itinerary
- `POST /api/ai/chat` - AI chat (streaming)
- `POST /api/ai/suggest-activities` - AI suggestions
- `GET /api/notifications` - User notifications
- `GET /api/feed` - Activity feed
- `GET /api/search` - Global search

## Demo Accounts

> Note: Run `npm run db:seed` to create demo accounts, or use the `/api/auth/demo` endpoint (requires `DEMO_MODE=true`).

| Email | Password |
|-------|----------|
| alex@demo.com | demo123 |
| jordan@demo.com | demo123 |
| taylor@demo.com | demo123 |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.

---

Built with ❤️ by the OutTheGroupchat Team

---

## Recent Updates

- **2026-04-08** — GitHub Actions CI added, Playwright config added, Sentry instrumentation on 8 routes (chat, recommend, signup, generate-itinerary, suggest-activities, ai/search, trips GET/POST/PATCH/DELETE), security score reached 9/10, voting page error handling improved, survey page UX improvements, 109 new tests
- **2026-04-07** — DeleteTripModal wired to DELETE API, privacy/terms pages added, beta/status route migrated to Redis rate limiting, Sentry added to 3 AI routes, discover/import returns 502 on upstream failures, 152 new tests
- **2026-04-06** — EditTripModal wired to PATCH API, discover search wired to backend with debounce, API key logging security fix, notifications optimistic mark-as-read, JSDoc added to 14 files, 104 new tests
- **2026-04-01** — Members management page, public profile page, FollowButton component, edit/delete trip modals, OG/Twitter Card meta tags, rate limiting on 4 more routes, 110 new tests

---

*Last Updated: 2026-04-09 | 1343 tests passing (main: 1234 tests, 59 files) | 48 API routes | Security: 9/10 | CI: GitHub Actions ✅ | E2E: Playwright ✅ | Sentry: 8 routes ✅*
