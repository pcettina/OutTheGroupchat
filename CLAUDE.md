# OutTheGroupchat - Project Instructions

## Project Overview
Full-stack Next.js social network for in-person meetups with real-time collaboration, AI-powered meetup suggestions, and Crew-based social graph. Tagline: "The social media app that wants to get you off your phone." App directory: `outthegroupchat-travel-app/`.

**Pivot status:** Phase 6 COMPLETE (2026-04-22). Trip-planning features archived. Core social primitives: Crews, Meetups, Check-ins, Feed. Phase 7 (marketing surface — landing page, OG tags, README rewrite) is next.

## Tech Stack
- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Next.js API Routes, Prisma ORM, PostgreSQL (Neon via Vercel Marketplace — migrated from Supabase 2026-04-17)
- **Auth:** NextAuth.js with Prisma adapter
- **Real-time:** Pusher
- **AI:** Vercel AI SDK + OpenAI
- **Deploy:** Vercel

## Development Commands
```bash
cd outthegroupchat-travel-app
npm run dev          # Start dev server
npm run build        # Build (includes prisma generate)
npm run lint         # ESLint
npm run db:generate  # Regenerate Prisma client
npm run db:push      # Push schema to database
npm run db:studio    # Open Prisma Studio
```

## Nightly Build Automation

### Notion Database
- **Nightly Build Reports** database ID: `4e8051a0-553b-465a-89de-54e5b739c266`
- Parent page: OutTheGroupchat (`16f86bc7-60e7-803e-a698-dba3bdb4d78b`)
- Reports include: task completion, test results, build/lint status, PR links, recommendations

### Scheduled Task: `nightly-otgc-build`
Runs nightly at 10:00 PM. Uses parallel sub-agents for:
1. Git pull + intelligent merge
2. Previous day recommendation review (from Notion)
3. Codebase analysis + 10 task generation (3 large, 3 medium, 4 small)
4. Parallel task execution via sub-agents
5. Test suite execution
6. PR creation + git push
7. Notion report logging with next-day recommendations

### Task Sizing Guidelines
- **Large (3):** Multi-file features, new API endpoints, component systems, test suites (30-60 min each)
- **Medium (3):** Single-file refactors, bug fixes with tests, documentation updates (15-30 min each)
- **Small (4):** Type fixes, linting, console.log cleanup, comment cleanup (5-15 min each)

## Code Conventions
- TypeScript strict mode
- Zod validation on all API inputs
- `getServerSession()` auth check on all protected routes
- No `any` types (target: 0, current: ~12)
- No `console.log` in production code (target: 0, current: ~30)
- Files should not exceed 600 lines
- Use `logging` via pino for diagnostic output

## Known Issues & Blockers
- `OPENAI_API_KEY` not set in Vercel production
- Sentry DSN missing in Vercel production
- Pusher env vars missing in production
- Email deliverability issues (Resend domain not verified)
- DEMO_MODE must be set to `true` to enable demo auth flow

## Key File Paths
- Prisma schema: `outthegroupchat-travel-app/prisma/schema.prisma`
- API routes: `outthegroupchat-travel-app/src/app/api/`
- Components: `outthegroupchat-travel-app/src/components/`
- Services: `outthegroupchat-travel-app/src/services/`
- Docs: `outthegroupchat-travel-app/docs/`
- Agent guides: `outthegroupchat-travel-app/docs/agents/`

## Repository
- **Main branch:** `main`
- **Remote:** `origin`
- PR target: `main`
