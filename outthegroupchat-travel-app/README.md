# OutTheGroupchat — Social Meetup Network

**The social app that wants to get you off your phone.**

A LinkedIn-style social network built for in-person meetups, not trip planning. Connect with people, create and RSVP to local meetups, check in live when you're out, and see who else is around — all designed to turn online connections into real-world moments.

## Features

- **Crew** - Send and accept crew requests to build your network
- **Meetups** - Create events and RSVP; discover what's happening near you
- **Check-ins** - Broadcast live presence so your network knows you're out
- **Feed** - See who's out, what's happening, and activity from your connections
- **Real-time** - Pusher-powered live updates for check-ins, RSVPs, and notifications

## Status

> **Post-pivot: V1 product loop active (intent → subcrew → meetup), heatmap shipped (Crew + FoF tiers, PR #86/#87).** The v1 product vision (signal intent → auto-group at ≥2 Crew on same Topic → coordinate + venue recs → opt-in location visibility) is founder-locked. See `docs/PRODUCT_VISION.md` for the full spec. Trip-planning code archived in `src/_archive/`. AI surface fully removed (PR #65, 2026-04-23).

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
│   ├── api/               # API routes (51 active routes)
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
- Optimized function durations for AI routes
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

- **2026-04-30:** Intents/subcrews test coverage (+76 tests) plus TSC fix — strengthens v1 loop reliability.
- **2026-04-29:** V1 Phase 5 partial — coordination + venue recommendation surfaces wired into the subcrew flow.
- **2026-04-25:** V1 Phase 4 heatmap shipped — Crew tier (PR #86) + FoF tier (PR #87) with maplibre-gl + OpenFreeMap, R22 z=15 venue markers, R24 anchor priority 1/3/4. Contribution writers wired into commit + check-in paths.
- **2026-04-23:** Production Neon migration workflow merged (PR #90) — automated `prisma migrate deploy` against the Neon production branch.
- **2026-04-23:** AI surface fully removed (PR #65) — no `/api/ai/*` routes, no `@ai-sdk/*`, no `src/lib/ai`, no `src/components/ai`. Project no longer ships any LLM dependencies.
- **2026-04-23:** CSP fix (PR #89) — allow maplibre tiles + worker, drop stale AI origins so the heatmap renders cleanly under strict CSP.
- **2026-04-22:** Phase 7/Phase 8 launch-readiness work landed — About page, OG/Twitter cards, README rewrite, email-auth split, search cleanup, RichFeedItem refactor.

---

*Last Updated: 2026-05-04 | 1100+ tests passing | 46 active API routes | 0 any types | 0 console.* | Build: PASS | V1 product loop active | Heatmap (Crew + FoF) shipped*
