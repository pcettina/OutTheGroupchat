# OutTheGroupchat Documentation

> **"The social media app that wants to get you off your phone."**

OutTheGroupchat is a full-stack Next.js meetup-centric social network. The product
loop: a user signals intent (a topic + time window), and when two or more Crew
members land on the same topic in an overlapping window, a sub-crew auto-forms,
coordinates a time, and gets venue recommendations — turning a group chat into a
real-world meetup. (The app began as a group trip-planning tool; that surface has
been archived — see `archive/trip-planning/`.)

This directory is the documentation hub for the platform: product vision,
operational status, technical references, launch/infra planning, and agent guides.

---

## Tech Stack (at a glance)

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Next.js API Routes, Prisma ORM, PostgreSQL (Neon)
- **Auth:** NextAuth.js with Prisma adapter · **Real-time:** Pusher · **Deploy:** Vercel
- **Mobile:** Expo / React Native iOS app (`outthegroupchat-mobile/`)

Current metrics: 1805 tests across 90 test files · 61 live API routes · 428 TS/TSX files.

---

## Product & Planning

| Document | Description |
|----------|-------------|
| [PRODUCT_VISION.md](./PRODUCT_VISION.md) | North-star v1 spec — the intent → sub-crew → coordinate → venue loop, privacy model, and locked founder resolutions. |
| [V1_IMPLEMENTATION_PLAN.md](./V1_IMPLEMENTATION_PLAN.md) | Phased shippable work translating the product vision into engineering tasks. |
| [V1_API_ROUTES.md](./V1_API_ROUTES.md) | Reference for the v1 API route surface. |
| [REFACTOR_PLAN.md](./REFACTOR_PLAN.md) | Trip-planning → social pivot refactor plan and phase tracking. |
| [FUTURE_IMPLEMENTATION.md](./FUTURE_IMPLEMENTATION.md) | Longer-term feature roadmap. |
| [PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md) | Deployment timeline and production milestones. |

## Operations & Status

| Document | Description |
|----------|-------------|
| [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) | Active sprint priorities and task breakdown. |
| [API_STATUS.md](./API_STATUS.md) | Per-endpoint status tracker (frontend wiring, known issues). |
| [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) | Pre-launch readiness checklist. |
| [OPS_LAUNCH_CHECKLIST.md](./OPS_LAUNCH_CHECKLIST.md) | Remaining ops/dashboard launch blockers (keys in Vercel, no code changes). |
| [CODEMAP.md](./CODEMAP.md) | Full codebase reference map for agents and onboarding. |

## Technical Reference

| Document | Description |
|----------|-------------|
| [IMPLEMENTATION_STACK.md](./IMPLEMENTATION_STACK.md) | Full tech stack reference and architecture overview. |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) | Security review, findings, and remediation tracking. |
| [SENTRY_COVERAGE_AUDIT.md](./SENTRY_COVERAGE_AUDIT.md) | Per-route Sentry error-monitoring coverage audit. |
| [TEST_CASES.md](./TEST_CASES.md) | Testing patterns, templates, and stack setup. |
| [UPGRADE_PLAN.md](./UPGRADE_PLAN.md) | Major package version upgrade plan (Next/React/Prisma) with breaking changes. |

## Infrastructure & Deployment

| Document | Description |
|----------|-------------|
| [PRODUCTION_INFRASTRUCTURE_PLAN.md](./PRODUCTION_INFRASTRUCTURE_PLAN.md) | End-to-end plan for a real, observable, recoverable production environment. |
| [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md) | Vercel environment variable configuration guide. |
| [N8N_SETUP_SUMMARY.md](./N8N_SETUP_SUMMARY.md) | n8n integration quick-reference summary. |
| [N8N_DEPLOYMENT_CHECKLIST.md](./N8N_DEPLOYMENT_CHECKLIST.md) | n8n integration deployment checklist. |
| [N8N_BETA_NEWSLETTER_INTEGRATION.md](./N8N_BETA_NEWSLETTER_INTEGRATION.md) | n8n beta-signup and newsletter integration guide. |

## Mobile (iOS)

| Document | Description |
|----------|-------------|
| [iOS_IMPLEMENTATION_PLAN.md](./iOS_IMPLEMENTATION_PLAN.md) | Plan for getting OutTheGroupchat into the Apple App Store. |
| [MOBILE_BUILD_ONESHOT.md](./MOBILE_BUILD_ONESHOT.md) | Self-contained Expo (SDK 54) iOS build guide. |
| [LAUNCH_RESEARCH_PORTFOLIO.md](./LAUNCH_RESEARCH_PORTFOLIO.md) | Phased launch portfolio synthesized from a multi-stream research swarm. |

## Design

| Document | Description |
|----------|-------------|
| [design/README.md](./design/README.md) | Design workflows index. |
| [design/DESIGN_BRIEF.md](./design/DESIGN_BRIEF.md) | Product design brief. |
| [design/DESIGN_LOG.md](./design/DESIGN_LOG.md) | Running design-decision log. |
| [STYLE_IMPLEMENTATION_PLAN.md](./STYLE_IMPLEMENTATION_PLAN.md) | Project-wide "Last Call" palette/typography/interaction sweep. |

## Agent Guides (`agents/`)

Specialized guides for AI development agents working in this repo:

| Guide | Purpose |
|-------|---------|
| [Planning Agent](./agents/PLANNING_AGENT_GUIDE.md) | Architecture and feature planning. |
| [Code Checking Agent](./agents/CODE_CHECKING_AGENT_GUIDE.md) | Code review and security patterns. |
| [Frontend Agent](./agents/FRONTEND_AGENT_GUIDE.md) | UI/UX and component patterns. |
| [Social Engagement Agent](./agents/SOCIAL_ENGAGEMENT_AGENT_GUIDE.md) | Social features and engagement. |

## Nightly Build Reports (`nightly-reports/`)

Dated reports from the nightly automated build pipeline (task completion, test
results, build/lint status, PR links). See [`nightly-reports/`](./nightly-reports/)
for the full set; the most recent is
[`nightly-reports/2026-06-07.md`](./nightly-reports/2026-06-07.md).

## Archive (`archive/`)

Historical and superseded documentation:

- [`archive/trip-planning/`](./archive/trip-planning/) — frozen snapshots of the
  trip-planning docs taken at the moment of the social pivot (API status, launch
  checklist, roadmap, sprint, future implementation, upgrade plan).
- `archive/*_v1_2024-12.md` — original 2024 launch roadmap, implementation closure,
  improvement rankings, and future-implementation drafts.

---

## Conventions

When adding or updating a doc: use a descriptive filename, include a status/last-updated
line at the top, add it to the relevant section of this index, and link related documents.
For a major rewrite, archive the prior version under `archive/`.

---

*Last Updated: 2026-06-07*
