# OutTheGroupchat — Social Meetup Network

**The social app that wants to get you off your phone.**

A LinkedIn-style social network built for in-person meetups, not trip planning. Connect with people, create and RSVP to local meetups, check in live when you're out, and see who else is around — all designed to turn online connections into real-world moments.

## Features

- **Crew** - Send and accept crew requests to build your network
- **Meetups** - Create events and RSVP; discover what's happening near you
- **Check-ins** - Broadcast live presence so your network knows you're out
- **Feed** - See who's out, what's happening, and activity from your connections
- **Real-time** - Pusher-powered live updates for check-ins, RSVPs, and notifications

## Pivot Status

> **Active refactor: Phase 8 of 8 (Launch-readiness re-audit).** Phases 0–7 complete. AI surface fully removed (PR #65 — no `/api/ai/*` routes, no `@ai-sdk/*` deps). Recent design work: Last Call landing page, brand palette, and Fontshare fonts (PRs #61–#64). Trip-planning code archived in `src/_archive/` (see `docs/REFACTOR_PLAN.md`). All infrastructure — auth, database, real-time, API layer — is 100% reused.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
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
│   ├── api/               # API routes (45 active routes)
│   │   ├── meetups/      # Meetup CRUD + RSVP
│   │   ├── crew/         # Crew requests
│   │   ├── checkins/     # Live presence
│   │   ├── feed/         # Social feed
│   │   ├── users/        # User profiles
│   │   └── ...
│   ├── meetups/          # Meetup pages
│   ├── crew/             # Crew pages
│   └── feed/             # Social feed
├── _archive/              # Archived trip-planning code (Phase 1)
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── meetups/          # Meetup components
│   ├── crew/             # Crew components
│   └── social/           # Feed + social components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and clients
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
| Pusher | No | Real-time updates |
| Google Places | No | Venue search |

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
- Automatic builds on push

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

- `GET/POST /api/meetups` - List and create meetups
- `GET/PATCH/DELETE /api/meetups/[meetupId]` - Meetup CRUD
- `POST /api/meetups/[meetupId]/rsvp` - RSVP to a meetup
- `GET/POST /api/crew` - List and send crew requests
- `PATCH /api/crew/[id]` - Accept or decline a request
- `GET/POST /api/checkins` - List and broadcast check-ins
- `GET /api/feed` - Social feed (connections' activity)
- `GET /api/users/[userId]` - Public profile
- `GET /api/notifications` - User notifications
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

- **2026-04-23:** Phase 8 (Launch-readiness re-audit) active. AI surface fully removed — all `/api/ai/*` routes, `@ai-sdk/*` deps, `src/lib/ai`, and `src/components/ai` deleted (PR #65). 1108+ tests passing across 45 active API routes.
- **2026-04-22:** Design sprint: Last Call landing page, brand palette (`otg.*` Tailwind namespace), Fontshare fonts, dark-mode default, Hybrid Exit logo mark (PRs #61–#64).
- **2026-04-22:** Phase 7 complete (PR #56). About page, OG/Twitter Card tags, email-auth.ts extracted, search type enum cleaned up, RichFeedItem refactored (717→337 lines).
- **2026-04-20:** Phase 5 session 2 complete (PR #53). Privacy settings, Pusher city broadcast on check-in, feed visibility filter.
- **2026-04-19:** Phase 5 complete (PR #52). Check-ins API + UI, "Join me" flow, NearbyCrewList, duration picker (PR #52–#54).
- **2026-04-18:** Phase 4 complete (PR #48–#51). Meetup API routes, MeetupDetail page, Pusher real-time, Google Places API.
- **2026-04-16:** Sentry error monitoring expanded to 19/48 API routes; beta/status migrated to Redis rate limiting; dead components removed.

---

*Last Updated: 2026-04-23 | 1108+ tests passing | 45 active API routes | 0 any types | 0 console.* | Build: PASS | Pivot: Phase 8 of 8 (Launch-readiness re-audit)*
