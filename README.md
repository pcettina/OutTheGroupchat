# OutTheGroupchat

**The social media app that wants to get you off your phone.**

A meetup-centric social network built around an "intent-to-group" loop: users signal intent on a topic, and once two or more Crew members signal the same Topic, the app auto-forms a SubCrew, helps them coordinate, surfaces venue recommendations, and (with opt-in) shows live location visibility via a heatmap.

## Where the app lives

The Next.js application lives in [`outthegroupchat-travel-app/`](outthegroupchat-travel-app/). See its README for setup, scripts, and developer details.

## Tech Stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS, Framer Motion
- **Database:** PostgreSQL via Neon (Vercel Marketplace), Prisma ORM
- **Auth:** NextAuth.js with Prisma adapter
- **Real-time:** Pusher
- **Maps:** maplibre-gl + OpenFreeMap tiles
- **Deploy:** Vercel

## Status

- V1 intent-to-group loop is live on `main`.
- V1 Phases 0-4b shipped (Crew + SubCrew formation + venue recs + heatmap Crew tier + FoF tier).
- Pivot Phase 8 (launch-readiness) in progress.
- Trip-planning code archived to `src/_archive/` and is no longer part of the product.
- AI surface fully removed 2026-04-23 (no OpenAI/Anthropic dependencies, no `/api/ai/*` routes).

## Documentation

- Product vision: [`outthegroupchat-travel-app/docs/PRODUCT_VISION.md`](outthegroupchat-travel-app/docs/PRODUCT_VISION.md)
- V1 implementation plan: [`outthegroupchat-travel-app/docs/V1_IMPLEMENTATION_PLAN.md`](outthegroupchat-travel-app/docs/V1_IMPLEMENTATION_PLAN.md)
- Codebase map: [`outthegroupchat-travel-app/docs/CODEMAP.md`](outthegroupchat-travel-app/docs/CODEMAP.md)
- Full docs directory: [`outthegroupchat-travel-app/docs/`](outthegroupchat-travel-app/docs/)

---

*Last Updated: 2026-05-16*
