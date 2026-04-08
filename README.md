# OutTheGroupchat

A Next.js 14 web app for group travel planning with AI-powered recommendations and real-time collaboration.

## Tech Stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS, Framer Motion
- **Database:** PostgreSQL (Supabase) via Prisma ORM
- **Auth:** NextAuth.js
- **Real-time:** Pusher
- **AI:** Vercel AI SDK + OpenAI
- **Deploy:** Vercel

## Getting Started

```bash
cd outthegroupchat-travel-app
npm install
cp .env.example .env.local   # fill in required values
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Common Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # ESLint
npm run db:push    # Push Prisma schema to database
npm run db:studio  # Open Prisma Studio
```

## Status

- **Tests:** 1234+ passing across 59 test files
- **Last Updated:** April 7, 2026

## Docs

See [`outthegroupchat-travel-app/docs/`](outthegroupchat-travel-app/docs/) for architecture, API status, sprint tracking, and agent guides.
