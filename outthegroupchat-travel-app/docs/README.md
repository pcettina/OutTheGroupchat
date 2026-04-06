# OutTheGroupchat Documentation

> **"A social network that not just showcases experiences, but helps you build them."**

Welcome to the OutTheGroupchat documentation hub. This directory contains all technical documentation, guides, and operational procedures for the platform.

*Last Updated: April 5, 2026*

---

## Documentation Structure

```
docs/
├── README.md               # ← You are here
├── CODEMAP.md              # Primary codebase navigation reference for AI agents
│
├── Operations
│   ├── LAUNCH_CHECKLIST.md    # Pre-launch requirements
│   ├── CURRENT_SPRINT.md      # Active sprint priorities
│   └── API_STATUS.md          # Endpoint status tracker
│
├── Technical
│   ├── IMPLEMENTATION_STACK.md  # Full tech stack reference
│   ├── SECURITY_AUDIT.md        # Security review & fixes
│   ├── TEST_CASES.md            # Testing documentation
│   └── VERCEL_ENV_SETUP.md      # Deployment configuration
│
├── Roadmap
│   ├── PRODUCTION_ROADMAP.md    # 4-week deployment plan
│   └── FUTURE_IMPLEMENTATION.md # Long-term feature roadmap
│
├── Agent Guides
│   └── agents/
│       ├── PLANNING_AGENT_GUIDE.md
│       ├── CODE_CHECKING_AGENT_GUIDE.md
│       ├── FRONTEND_AGENT_GUIDE.md
│       └── SOCIAL_ENGAGEMENT_AGENT_GUIDE.md
│
└── Archive
    └── archive/                  # Historical versions
        ├── LAUNCH_ROADMAP_v1_2024-12.md
        ├── IMPLEMENTATION_CLOSURE_v1_2024-12.md
        ├── IMPROVEMENT_RANKINGS_v1_2024-12.md
        ├── IMPROVEMENT_RANKINGS_v2_2024-12.md
        └── FUTURE_IMPLEMENTATION_v1_2024-12.md
```

---

## Quick Start

### For New Developers
1. Read [CODEMAP.md](./CODEMAP.md) - Primary codebase navigation and file reference (start here for any unfamiliar area)
2. Read [IMPLEMENTATION_STACK.md](./IMPLEMENTATION_STACK.md) - Understand the tech stack
3. Check [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) - See current priorities
4. Review [API_STATUS.md](./API_STATUS.md) - Know what's working

### For Deployment
1. Follow [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md) - Configure environment
2. Complete [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) - Verify all requirements
3. Reference [PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md) - Deployment plan

### For Planning
1. Read [PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md) - Near-term goals
2. Check [FUTURE_IMPLEMENTATION.md](./FUTURE_IMPLEMENTATION.md) - Long-term vision
3. Review agent guides for specific areas

---

## Key Documents

### [CODEMAP.md](./CODEMAP.md)
**Use when:** Navigating the codebase as an agent or developer, looking up file locations, or understanding module relationships

Contains:
- Full directory structure (~266 TypeScript/TSX files)
- API route inventory (48 routes, all with rate limiting)
- Component and page index
- Services, hooks, utilities reference
- Codebase health metrics

**Role:** Primary navigation reference for AI agents. Read this first when working on any non-trivial task.

---

### [Launch Checklist](./LAUNCH_CHECKLIST.md)
**Use when:** Preparing for deployment or checking launch readiness

Contains:
- Infrastructure checklist
- Security requirements
- Testing checklist
- Launch day procedures

**Current Status:** 78% Complete — Target 85% for Beta

---

### [Current Sprint](./CURRENT_SPRINT.md)
**Use when:** Starting daily work or checking immediate priorities

Contains:
- Active sprint goals and blockers
- Completed work log
- Nightly build task history

**Sprint Goal:** Beta launch readiness — test coverage, security hardening, rate limiting

---

### [API Status](./API_STATUS.md)
**Use when:** Working on frontend integration or debugging API issues

Contains:
- All 48 endpoint statuses
- Frontend connection state
- Known issues per endpoint
- Rate limiting coverage

**API Completion:** 86%+ implemented. All 48 routes have rate limiting as of April 2026.

---

### [Implementation Stack](./IMPLEMENTATION_STACK.md)
**Use when:** Onboarding or making architecture decisions

Contains:
- Complete tech stack reference
- Architecture diagrams
- Database schema overview
- File structure guide

**Current Tech Stack:**
- Frontend: Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion
- Backend: Next.js API Routes, Prisma ORM, PostgreSQL (Supabase)
- Auth: NextAuth.js with Prisma adapter
- Real-time: Pusher
- AI: Vercel AI SDK + OpenAI (gpt-4o-mini, streaming)
- Testing: Vitest + React Testing Library + Playwright (E2E)
- Monitoring: Sentry (infrastructure ready, DSN pending)
- Deploy: Vercel

---

### [Security Audit](./SECURITY_AUDIT.md)
**Use when:** Reviewing security or fixing vulnerabilities

Contains:
- Security issues log and resolution status
- Rate limiting implementation details
- Email exposure fixes
- Security checklist

**Security improvements since December 2024:**
- Rate limiting added to all 48 API routes (complete as of April 2026)
- Email fields stripped from public-facing responses (trips, members, invitations)
- Redis-backed rate limiter (`src/lib/rate-limit.ts`) using Upstash
- Auth-guarded routes use `getServerSession()` consistently
- Zod input validation on all API routes
- DOMPurify XSS sanitization in place

---

### [Test Cases](./TEST_CASES.md)
**Use when:** Writing or running tests

Contains:
- Unit test templates
- Integration test patterns
- E2E test scenarios
- Testing stack setup and mock patterns

**Test Suite Status (April 2026):**
- 1370+ Vitest tests passing across 64 test files
- 0 failing tests
- Vitest + React Testing Library for unit/integration tests
- Playwright E2E smoke tests (chromium install required in CI)
- Key mock patterns documented: rate-limit, Prisma, NextAuth, AI client

---

### [Production Roadmap](./PRODUCTION_ROADMAP.md)
**Use when:** Planning sprints or understanding deployment timeline

Contains:
- Week-by-week plan
- Feature requirements
- Infrastructure setup
- Cost estimates

---

### [Future Implementation](./FUTURE_IMPLEMENTATION.md)
**Use when:** Planning future features or understanding product vision

Contains:
- 6-phase roadmap
- Feature prioritization
- Technical debt tracking
- AI system improvements

---

## Agent Guides

Specialized guides for AI development agents:

| Guide | Purpose |
|-------|---------|
| [Planning Agent](./agents/PLANNING_AGENT_GUIDE.md) | Architecture & feature planning |
| [Code Checking Agent](./agents/CODE_CHECKING_AGENT_GUIDE.md) | Code review & security patterns |
| [Frontend Agent](./agents/FRONTEND_AGENT_GUIDE.md) | UI/UX & component patterns |
| [Social Engagement Agent](./agents/SOCIAL_ENGAGEMENT_AGENT_GUIDE.md) | Social features & engagement |

---

## Current Status Overview

| Area | Status | Notes | Document |
|------|--------|-------|----------|
| Infrastructure | Ready | Vercel + Supabase configured | [Launch Checklist](./LAUNCH_CHECKLIST.md) |
| Authentication | Working | NextAuth + email verification + password reset | [API Status](./API_STATUS.md) |
| API Routes | 48 implemented | All with rate limiting | [API Status](./API_STATUS.md) |
| Rate Limiting | Complete | 48/48 routes covered (Redis/Upstash) | [Security Audit](./SECURITY_AUDIT.md) |
| Security | Improved | Email exposure fixed, Zod validation throughout | [Security Audit](./SECURITY_AUDIT.md) |
| Test Coverage | Strong | 1370+ tests, 64 test files, 0 failures | [Test Cases](./TEST_CASES.md) |
| Monitoring | Partial | Sentry infra ready, DSN not set in Vercel | [Launch Checklist](./LAUNCH_CHECKLIST.md) |
| Code Quality | Clean | 0 `any` types, 0 `console.*`, 0 files >600 lines | [Codemap](./CODEMAP.md) |
| Privacy/Terms | Available | `/privacy` and `/terms` pages implemented | [API Status](./API_STATUS.md) |

---

## Codebase Health (April 2026)

| Metric | Value |
|--------|-------|
| TypeScript files | ~266 |
| Lines of code | ~33,500 |
| API routes | 48 |
| Test files | 64 |
| Tests passing | 1370+ |
| `any` types | 0 |
| `console.*` statements | 0 |
| Files >600 lines (prod) | 0 |
| Rate-limited routes | 48/48 |
| Pages | ~16 |
| Components | ~92 |

---

## Known Blockers

| Blocker | Severity | Notes |
|---------|----------|-------|
| `OPENAI_API_KEY` missing in Vercel | High | AI features work locally only |
| Sentry DSN missing in Vercel | Medium | `src/lib/sentry.ts` is ready; needs env var |
| Pusher env vars missing in production | Medium | Real-time collaboration disabled in prod |
| Playwright browsers not installed in CI | Medium | Run `npx playwright install chromium` |
| Resend domain not verified | Low | Email goes to spam |
| Amadeus/Ticketmaster/Places API keys | Low | Suggestions + flights routes require external keys |

---

## External Links

| Resource | URL |
|----------|-----|
| Production App | https://outthegroupchat-travel-app.vercel.app |
| Vercel Dashboard | https://vercel.com/patrick-cettinas-projects/outthegroupchat-travel-app |
| Supabase | *(from env vars)* |
| Upstash Console | https://console.upstash.com |

---

## Document Maintenance

| Document | Update Frequency | Owner |
|----------|-----------------|-------|
| CODEMAP.md | Each nightly build | Nightly agent (Wave 3) |
| CURRENT_SPRINT.md | Daily / each nightly build | Dev Team |
| API_STATUS.md | Per API change | Dev Team |
| LAUNCH_CHECKLIST.md | Weekly | Lead Dev |
| SECURITY_AUDIT.md | Monthly | Security |
| PRODUCTION_ROADMAP.md | Bi-weekly | Product |
| FUTURE_IMPLEMENTATION.md | Quarterly | Product |

---

## Archive

The `archive/` folder contains previous versions of documents for historical reference:

- `LAUNCH_ROADMAP_v1_2024-12.md` - Original launch roadmap (superseded by PRODUCTION_ROADMAP)
- `IMPLEMENTATION_CLOSURE_v1_2024-12.md` - Bug tracking snapshot (superseded by CURRENT_SPRINT)
- `IMPROVEMENT_RANKINGS_v1_2024-12.md` - Original priority rankings
- `IMPROVEMENT_RANKINGS_v2_2024-12.md` - Updated priority rankings (consolidated into CURRENT_SPRINT)
- `FUTURE_IMPLEMENTATION_v1_2024-12.md` - Original future roadmap

---

## Best Practices

### When Adding Documentation
1. Use clear, descriptive filenames
2. Include last updated date
3. Add to this README index
4. Link related documents

### When Updating Documentation
1. Update the "Last Updated" date
2. Note significant changes
3. Archive old versions if major rewrite

### Document Format
- Use Markdown
- Include status indicators
- Add code examples where helpful
- Keep tables for quick reference

---

*Built with care for travelers who believe the journey is better together.*

*Last Updated: April 5, 2026*
