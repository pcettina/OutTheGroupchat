# OutTheGroupchat — Social Meetup Network

**The social media app that wants to get you off your phone.**

A meetup-centric social network organized around a single loop: signal what you want to do, get auto-grouped with Crew members who want the same thing, coordinate a venue, and (opt-in) share live presence on a privacy-tiered heatmap. Online intent → in-person time together.

## The core loop

1. **Signal intent** — pick a Topic (drinks, run, coffee, brunch, etc.) and a time window.
2. **Auto-group into a Subcrew** — when ≥2 Crew members hold overlapping Intents on the same Topic, a Subcrew surfaces.
3. **Coordinate** — Subcrew picks a time, gets venue recommendations (Google Places + OTG "currently hot" signal).
4. **Commit + go** — each member picks per-event location visibility (social scope × spatial granularity × identity mode) before contributing to any heatmap.
5. **Check in** — live presence broadcasts to Crew (or Subcrew, or nobody) based on the visibility spec.

See `docs/PRODUCT_VISION.md` for the canonical v1 spec.

## Features

- **Crew** — mutual, bidirectional graph of people you actually meet up with
- **Intent + Subcrew** — lightweight "what I'm interested in doing" signal that coalesces into a group
- **Meetups** — create events, RSVP, invite Crew
- **Check-ins** — broadcast live presence with per-event privacy controls
- **Heatmaps** — Crew tier + Friend-of-Friend tier, h3-cell aggregated density (no raw coordinates leave aggregation)
- **Feed** — people-first activity from your Crew
- **Real-time** — Pusher-powered live updates for check-ins, RSVPs, notifications

## Status

> **Active refactor: Phase 8 of 8 — launch-readiness re-audit (in progress as of 2026-05-10).**

- **Phase 0** ✅ COMPLETE — PR backlog merged, `v1.0-trip-planning` tagged.
- **Phase 1** ✅ COMPLETE — Trip code archived to `src/_archive/`, navigation cleaned.
- **Phase 2** ✅ COMPLETE — Schema + Crew + `crewLabel` + `activeUntil` + Neon migration applied (PRs #43–#45).
- **Phase 3** ✅ COMPLETE — Crew API (6 routes), CrewButton/CrewList UI, emails, `/profile/[userId]` (PRs #46, #47).
- **Phase 4** ✅ COMPLETE — Meetup API routes, MeetupDetail page, Pusher real-time, `MEETUP_STARTING_SOON` cron, Google Places API (PRs #48, #49, #51).
- **Phase 5** ✅ COMPLETE — Check-ins API + UI, "Join me" flow, privacy settings, NearbyCrewList (PRs #52–#54).
- **Phase 6** ✅ COMPLETE — Notification types pruned, Follow @deprecated, feed rescoped, search people-first (PR #55).
- **Phase 7** ✅ COMPLETE — About page, OG/Twitter Card tags, `email-auth.ts`, README rewrite, RichFeedItem refactor (PR #56).
- **Phase 8** 🟡 IN PROGRESS — Launch-readiness re-audit. Remaining: Sentry DSN in Vercel production, E2E Playwright authenticated flows, drain remaining nightly PR backlog.

Trip-planning code is archived in `src/_archive/` (see `docs/REFACTOR_PLAN.md`). All infrastructure — auth, database, real-time, API layer — is reused.

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
│   ├── api/               # API routes (58 active routes)
│   │   ├── meetups/      # Meetup CRUD + RSVP
│   │   ├── crew/         # Crew requests
│   │   ├── checkins/     # Live presence
│   │   ├── intents/      # Intent + Subcrew signals
│   │   ├── heatmap/      # Crew + FoF heatmap tiers
│   │   ├── feed/         # Social feed
│   │   ├── users/        # User profiles
│   │   └── ...
│   ├── meetups/          # Meetup pages
│   ├── crew/             # Crew pages
│   ├── checkins/         # Check-in pages
│   └── feed/             # Social feed
├── _archive/              # Archived trip-planning code (Phase 1)
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── meetups/          # Meetup components
│   ├── crew/             # Crew components
│   ├── checkins/         # Check-in components
│   ├── heatmap/          # MapLibre heatmap layers (Crew + FoF)
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
| PostgreSQL (Neon) | Yes | Database |
| NextAuth.js | Yes | Authentication |
| Pusher | No | Real-time updates |
| Google Places | No | Venue search + recommendations |
| MapLibre + OpenFreeMap | No | Heatmap base tiles |
| Sentry | No | Error monitoring |

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
- `vercel.json` with cron job configuration (meetup-starting-soon, daily-digest)
- Neon branch-per-PR migration workflow (`prisma migrate deploy` per PR)
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

- `GET/POST /api/intents` — Signal interest in a Topic + window (forms Subcrews)
- `GET/POST /api/meetups` — List and create meetups
- `GET/PATCH/DELETE /api/meetups/[meetupId]` — Meetup CRUD
- `POST /api/meetups/[meetupId]/rsvp` — RSVP to a meetup
- `GET/POST /api/crew` — List and send crew requests
- `PATCH /api/crew/[id]` — Accept or decline a request
- `GET/POST /api/checkins` — List and broadcast check-ins
- `GET /api/heatmap/crew` — Crew-tier aggregated density (h3-cell)
- `GET /api/heatmap/fof` — Friend-of-Friend tier aggregated density
- `GET /api/feed` — Social feed (Crew activity)
- `GET /api/users/[userId]` — Public profile
- `GET /api/notifications` — User notifications
- `GET /api/search` — People-first global search

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

- **2026-05-10:** V1 Phase 4 heatmap shipped (Crew tier + FoF tier, PRs #86/#87), production Neon migration workflow live (PR #90), heatmap seed fixtures + standalone runner (PRs #91/#92). Phase 8 launch-readiness re-audit underway.
- **2026-04-20:** Phase 5 session 2 complete (PR #53). Privacy settings (GET/PATCH /api/users/privacy), Pusher city broadcast on check-in, GET /api/checkins/[id] visibility gate, /checkins/[id] detail page, feed visibility filter. 994 tests passing across 51 active API routes.
- **2026-04-16:** Product pivot to social meetup network initiated. Phase 1 complete: trip-planning surface archived to `src/_archive/` (routes, pages, components, services). README and docs updated to reflect new vision. 841 tests passing post-archive across 35 active API routes.
- **2026-04-16:** Sentry error monitoring expanded to 19/48 API routes; beta/status migrated to Redis rate limiting; dead components removed (DestinationCard, CategoryFilter, TrendingSection, TravelBadges); 112 new tests added (1,346+ total pre-archive)
- **2026-04-15:** Sentry instrumented on 13 routes; beta/status Redis migration; JSDoc additions across lib/api modules
- **2026-04-14:** Zod validation added to flights, suggestions, cron routes; Sentry expanded to 18 routes on branch
- **2026-04-13:** Sentry installed on auth and AI routes; addBreadcrumb wrapper exported from lib/sentry; structured logging complete
- **2026-04-08:** GitHub Actions CI configured; DeleteTripModal wired; survey/vote page error handling improved
- **2026-04-06:** Security audit score 8→9/10; JSDoc added across 14 lib/service files; discover search wired

---

*Last Updated: 2026-05-10 | 917+ tests passing | 58 active API routes | 86 test files | 290 TS files | files >600 lines: 2 | 0 any types | 0 console.* | Build: PASS | Pivot: Phase 8 of 8 (launch-readiness re-audit)*
