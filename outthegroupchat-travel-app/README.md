# OutTheGroupchat — App

**The social media app that wants to get you off your phone.**

Meetup-centric social network with an intent-to-group loop: signal intent on a Topic, and when two or more of your Crew signal the same Topic, the app auto-forms a SubCrew, helps you coordinate, recommends a venue, and (opt-in) shows your friends on a live heatmap.

## Status

- V1 Phases 0-4b shipped on `main` (Crew + SubCrew formation + Topic intent + venue recs + heatmap Crew tier + FoF tier).
- Pivot Phase 8 (launch-readiness) in progress.
- Trip-planning code archived to `src/_archive/` and is no longer part of the product.
- AI surface fully removed 2026-04-23 (no OpenAI/Anthropic dependencies, no `/api/ai/*` routes).

## Tech Stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript (strict)
- **Database:** PostgreSQL via Neon (Vercel Marketplace; migrated from Supabase 2026-04-17) with Prisma ORM
- **Auth:** NextAuth.js with Prisma adapter
- **Real-time:** Pusher
- **Maps:** maplibre-gl + OpenFreeMap tiles
- **Styling:** Tailwind CSS, Framer Motion
- **State:** TanStack Query
- **Testing:** Vitest (+ Playwright for E2E)

## Getting Started

### Prerequisites

- Node.js 18+
- A PostgreSQL connection string (Neon recommended)
- API keys per `.env.example`

### Setup

```bash
git clone https://github.com/pcettina/OutTheGroupchat.git
cd OutTheGroupchat/outthegroupchat-travel-app
npm install
cp .env.example .env.local   # fill in DATABASE_URL, NEXTAUTH_SECRET, etc.
npm run db:push              # apply Prisma schema
npm run db:seed              # optional: seed demo Crew, Intents, contributions
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build (runs prisma generate)
npm run start        # Start production server
npm run lint         # ESLint
npm run test         # Vitest unit/integration suite
npm run test:e2e     # Playwright E2E
npm run db:generate  # Regenerate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Create migration
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed demo users and sample data
```

## Project Structure

```
src/
├── app/              # Next.js App Router pages + API routes
│   ├── api/         # API routes (crew, meetups, checkins, feed, intents, heatmap, ...)
│   ├── crew/        # Crew pages
│   ├── meetups/     # Meetup pages
│   ├── checkins/    # "Who's Out Tonight?" + check-ins
│   └── heatmap/     # Opt-in location visibility
├── _archive/         # Archived trip-planning code (no longer part of product)
├── components/       # React components (crew/, meetups/, checkins/, feed/, heatmap/, ui/)
├── hooks/            # Custom React hooks
├── lib/              # Prisma, Pusher, email, sentry, sanitize, rate-limit
├── services/         # Business logic
└── types/            # TypeScript types

prisma/
└── schema.prisma     # Crew, SubCrew, Intent, Topic, Meetup, CheckIn, HeatmapContribution
```

## Recent V1 Work

- PR #92 — Nightly 2026-05-14: +92 tests, refactors, Sentry coverage, dead-code cleanup
- PR #91, #92 — Heatmap seed fixtures + standalone heatmap runner (respects Crew lex-order constraint)
- PR #90 — Production Neon migration workflow
- PR #89 — CSP allows MapLibre tiles + worker; stale AI origins dropped
- PR #87 — Heatmap FoF tier
- PR #86 — Heatmap Crew tier (maplibre-gl + OpenFreeMap)
- PR #88 — Related V1 heatmap groundwork

## Documentation

- **Product vision:** [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) — intent-to-group loop spec
- **V1 implementation plan:** [`docs/V1_IMPLEMENTATION_PLAN.md`](docs/V1_IMPLEMENTATION_PLAN.md)
- **Codebase map:** [`docs/CODEMAP.md`](docs/CODEMAP.md) — full agent-friendly reference
- **API status:** [`docs/API_STATUS.md`](docs/API_STATUS.md)
- **Current sprint:** [`docs/CURRENT_SPRINT.md`](docs/CURRENT_SPRINT.md)
- **Launch checklist:** [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md)
- **Agent guides:** [`docs/agents/`](docs/agents/)

## Environment Variables

See `.env.example` for the canonical list. Required at minimum:

| Service | Required | Purpose |
|---------|----------|---------|
| `DATABASE_URL` (Neon) | Yes | PostgreSQL connection |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Yes | Auth |
| Pusher keys | No (recommended) | Real-time check-ins, RSVPs, notifications |
| Google Places key | No | Venue search |
| Sentry DSN | No (recommended) | Error monitoring |

## Deployment

Deploy to Vercel with the Neon integration installed. Environment variables are pulled from the Vercel project. `vercel.json` configures cron jobs (e.g., meetup-starting-soon, heatmap decay).

For manual deploys, run `npx prisma migrate deploy` against the target database before `npm start`.

## Contributing

1. Create a branch from `main`.
2. Make changes; keep TypeScript strict (no `any`), no `console.log` in production code, files under ~600 lines.
3. Run `npm run lint && npm run test` and `npx tsc --noEmit`.
4. Open a PR targeting `main`.

---

*Last Updated: 2026-05-16*
