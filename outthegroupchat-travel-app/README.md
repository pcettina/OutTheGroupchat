# OutTheGroupchat

**The social media app that wants to get you off your phone.**

OutTheGroupchat is a meetup-centric social network built around one idea: the best social media makes you put your phone down. Build your Crew, broadcast when you're out, find a meetup, and show up. No feeds to doom-scroll — just real people in real places.

---

## Core User Journey

```
Sign up → Build your Crew → Check in or post a meetup → Show up IRL
```

1. **Sign up** — Create an account with email or use demo mode.
2. **Build your Crew** — Send Crew requests to people you actually want to see. Crew is mutual and bidirectional: both sides opt in, like real friendship.
3. **Check in or post a meetup** — Broadcast that you're out right now, or organize something in advance and invite your Crew.
4. **Show up IRL** — See who else checked in nearby, RSVP to the meetup, and go.

---

## Features

### Crew System
Crew is a mutual, bidirectional social graph — not a one-sided follow. Sending a Crew request requires the other person to accept. Once connected, you both see each other's check-ins (subject to privacy settings), meetup invites, and activity. Crew replaces the asymmetric follow model with something closer to a contact book.

- Send, accept, and decline Crew requests
- Crew-only visibility tier for check-ins and meetups
- AI-generated icebreakers when a new Crew connection is made
- Crew list on your public profile

### Meetups
Create and discover in-person events. Meetups have a venue (powered by Google Places), a time, and an invite list drawn from your Crew.

- Create meetups with title, description, venue, and scheduled time
- Invite Crew members directly from the creation flow
- RSVP with a single tap (Going / Not Going / Maybe)
- Real-time RSVP count updates via Pusher — everyone sees the headcount live
- "Join me" shortcut: check in and immediately pre-fill a meetup at the same venue
- Email notifications for invites and RSVP confirmations (Resend)
- Meetup Starting Soon reminder cron (15-minute warning email)
- AI-powered meetup suggestions based on your Crew and location

### Check-ins ("Who's Out Tonight?")
Broadcast your live presence with an `activeUntil` window so your Crew knows you're out right now — not three hours ago.

- Check in with optional message and venue
- `activeUntil` window: 30 minutes to 12 hours (default 6h), auto-expires
- Privacy controls per check-in: **PUBLIC** (anyone), **CREW** (accepted Crew only), **PRIVATE** (only you)
- Live feed: "Who's Out Tonight?" shows all active Crew check-ins
- Pusher city-channel broadcast: nearby Crew members get a real-time notification when you check in
- Bulk `CREW_CHECKED_IN_NEARBY` notifications dispatched to accepted Crew on check-in

### Social Feed
A focused feed scoped to what actually matters: Meetups, Check-ins, and Crew activity.

- Three feed tabs: **Meetups** | **Check-ins** | **Crews**
- Activity limited to your Crew's public/crew-visibility posts
- Engagement: likes and comments on feed items
- No algorithmic ranking — chronological, reverse order

### Real-time (Pusher)
Live updates throughout the app with no polling.

- RSVP count updates on MeetupDetail page
- Check-in broadcasts to city-scoped Pusher channels
- Crew-joined events trigger icebreaker generation
- Notifications pushed in real-time

### AI Features (OpenAI)
- Meetup suggestion engine based on Crew and location context
- Icebreaker generation for new Crew connections
- Conversational AI chat endpoint (`/api/ai/chat`)

### Notifications
Focused notification types for the social graph:

| Type | When triggered |
|------|---------------|
| `CREW_REQUEST_RECEIVED` | Someone sends you a Crew request |
| `CREW_REQUEST_ACCEPTED` | Your Crew request is accepted |
| `CREW_CHECKED_IN_NEARBY` | A Crew member checks in |
| `MEETUP_INVITE` | You're invited to a meetup |
| `MEETUP_RSVP` | Someone RSVPs to your meetup |
| `MEETUP_STARTING_SOON` | 15-minute reminder for a meetup you're attending |
| `POST_LIKED` | Someone likes your post |
| `POST_COMMENTED` | Someone comments on your post |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL via Neon, managed with Prisma ORM |
| Auth | NextAuth.js with Prisma adapter |
| Real-time | Pusher |
| AI | Vercel AI SDK + OpenAI |
| Email | Resend |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| State / Data | TanStack Query |
| Testing | Vitest + Playwright |
| Error tracking | Sentry |
| Deployment | Vercel |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router pages + API routes
│   ├── api/               # 52 active API routes
│   │   ├── meetups/       # Meetup CRUD, RSVP, invite
│   │   ├── crew/          # Crew requests (send, accept, decline)
│   │   ├── checkins/      # Check-in create, feed, detail, delete
│   │   ├── feed/          # Social feed (meetups/check-ins/crews tabs)
│   │   ├── users/         # Profiles, privacy settings
│   │   ├── notifications/ # Notification list + mark-read
│   │   ├── search/        # Global search
│   │   ├── venues/        # Google Places venue search
│   │   ├── ai/            # AI chat, meetup suggestions, icebreakers
│   │   └── cron/          # Scheduled jobs (meetup reminders)
│   ├── meetups/           # Meetup pages
│   ├── checkins/          # Check-in pages ("Who's Out Tonight?")
│   ├── crew/              # Crew pages
│   ├── feed/              # Social feed
│   └── profile/           # Public and private profile pages
├── _archive/              # Archived trip-planning code (Phase 1)
├── components/
│   ├── meetups/           # MeetupCard, CreateMeetupModal, RSVPButton, VenuePicker
│   ├── checkins/          # CheckInButton, LiveActivityCard, NearbyCrewList
│   ├── crew/              # CrewButton, CrewCard, CrewList
│   ├── ui/                # Base UI primitives
│   └── social/            # Feed, NotificationItem
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities: prisma, pusher, sentry, email, rate-limit
├── services/              # Business logic (events, survey)
└── types/                 # Shared TypeScript types
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)
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

---

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Production build (includes prisma generate)
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:generate  # Regenerate Prisma client
npm run db:push      # Push schema to database (dev)
npm run db:migrate   # Create a new migration
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed demo users and sample data
```

---

## Environment Variables

See `.env.example` for all required variables. Key services:

| Service | Required | Purpose |
|---------|----------|---------|
| PostgreSQL / Neon | Yes | Database |
| NextAuth.js | Yes | Authentication |
| OpenAI | Yes | AI features (suggestions, icebreakers, chat) |
| Pusher | Recommended | Real-time check-in and RSVP updates |
| Resend | Recommended | Transactional email (invites, reminders) |
| Google Places | Optional | Venue search for meetups |
| Sentry DSN | Optional | Error monitoring |

---

## API Reference

### Crew
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/crew` | List your Crew connections |
| `POST` | `/api/crew` | Send a Crew request |
| `PATCH` | `/api/crew/[id]` | Accept or decline a request |
| `DELETE` | `/api/crew/[id]` | Remove a Crew connection |

### Meetups
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/meetups` | List meetups visible to you |
| `POST` | `/api/meetups` | Create a meetup |
| `GET` | `/api/meetups/[id]` | Meetup detail |
| `PATCH` | `/api/meetups/[id]` | Update a meetup (owner only) |
| `DELETE` | `/api/meetups/[id]` | Delete a meetup (owner only) |
| `POST` | `/api/meetups/[id]/rsvp` | RSVP (going / not going / maybe) |
| `POST` | `/api/meetups/[id]/invite` | Invite Crew members |
| `GET` | `/api/venues/search` | Search Google Places for venues |

### Check-ins
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/checkins` | Your active check-ins |
| `POST` | `/api/checkins` | Broadcast a new check-in |
| `GET` | `/api/checkins/feed` | Active Crew check-in feed |
| `GET` | `/api/checkins/[id]` | Check-in detail (visibility-gated) |
| `DELETE` | `/api/checkins/[id]` | Delete a check-in |

### Social
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/feed` | Social feed (meetups, check-ins, crews) |
| `GET` | `/api/notifications` | Your notifications |
| `PATCH` | `/api/notifications/[id]` | Mark notification read |
| `GET` | `/api/search` | Global search |
| `GET` | `/api/users/[userId]` | Public profile |
| `GET/PATCH` | `/api/users/privacy` | Privacy settings |

---

## Demo Accounts

Run `npm run db:seed` to create demo accounts, or enable `DEMO_MODE=true` and hit `/api/auth/demo`.

| Email | Password |
|-------|----------|
| alex@demo.com | demo123 |
| jordan@demo.com | demo123 |
| taylor@demo.com | demo123 |

---

## Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Set environment variables in the Vercel dashboard
3. Deploy

The project includes:
- `vercel.json` with cron job configuration for meetup reminders
- Optimized function durations for AI routes
- Automatic builds on push to `main`
- Branch-per-PR Neon database workflow (schema diff on every PR)

### Manual Deployment

```bash
npm run build
npx prisma migrate deploy
npm start
```

---

## Codebase Metrics (2026-04-22)

| Metric | Value |
|--------|-------|
| Tests passing | 1,048 |
| Test files | 56 |
| Active API routes | 52 |
| TypeScript source files | 328 |
| `any` types | 0 |
| `console.log` in production code | 0 |
| Build | PASS |
| Lint | 0 warnings |
| TSC | 0 errors |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request against `main`

---

## Recent Updates

- **2026-04-22 — Phase 6 complete (PR #55):** NotificationType enum pruned (9 trip types removed, 8 social types kept). Feed tabs rescoped to Meetups / Check-ins / Crews. `src/types/index.ts` trimmed from 450 to 264 lines (19 dead trip types removed). `email-crew.ts` extracted from `email.ts`. Follow model marked `@deprecated`. 1,048 tests passing.
- **2026-04-21 — Phase 5 complete (PR #54):** CheckInButton duration picker, "Join me" pre-fill wiring (LiveActivityCard → CreateMeetupModal), profile check-ins section, NearbyCrewList Pusher city subscription, Privacy Settings page and nav link.
- **2026-04-20 — Phase 5 session 2 (PR #53):** Privacy settings (`GET/PATCH /api/users/privacy`), Pusher city broadcast on check-in, `/api/checkins/[id]` visibility gate, `/checkins/[id]` detail page, feed visibility filter. 994 tests passing.
- **2026-04-19 — Phase 5 session 1 (PR #52):** Check-ins system launched — `POST/GET /api/checkins`, `/api/checkins/feed`, `DELETE /api/checkins/[id]`. CheckInButton, LiveActivityCard, NearbyCrewList components. "Who's Out Tonight?" page. Pusher `CREW_CHECKED_IN_NEARBY` notifications bulk-dispatched on check-in.
- **2026-04-18 — Phase 4 complete (PR #48, #49, #51):** Full meetups system — create, list, detail, RSVP, invite, real-time attendance via Pusher. MeetupDetail page. `MEETUP_STARTING_SOON` cron (15-min email warning). Google Places venue search. Email dispatch for invites and RSVP confirmations.
- **2026-04-17 — Phase 3 complete (PR #46, #47):** Crew API (6 routes), DB CHECK constraint, CrewButton component, `/profile/[userId]` page, Playwright smoke test. Legacy asymmetric follow removed from POST handler.
- **2026-04-16 — Phase 1 & 2 complete:** Trip-planning surface archived to `src/_archive/`. Schema migrated: Crew model, `crewLabel`, `activeUntil`. Neon branch-per-PR workflow activated.

---

## License

MIT License — see LICENSE file for details.

---

Built by the OutTheGroupchat Team
