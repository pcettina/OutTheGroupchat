# Trip Planning Documentation Archive

> Snapshotted 2026-04-16 during Phase 1 archival (see `docs/REFACTOR_PLAN.md`).

This directory contains frozen snapshots of trip-planning-related documentation
extracted from the live docs at the moment of the social pivot. These are
reference materials, not living documents — they capture the state of the
trip-planning feature surface just before it was archived.

## Background

OutTheGroupchat is pivoting from a group trip-planning app to a social
travel platform. The existing trip-domain code (trips, activities, surveys,
voting, itineraries) has been moved into `src/_archive/` directories and the
corresponding Prisma models marked `@deprecated`. They are retained for
potential future reactivation rather than deleted outright.

Because the live docs (`docs/API_STATUS.md`, `docs/LAUNCH_CHECKLIST.md`,
`docs/PRODUCTION_ROADMAP.md`) will be updated to remove trip-specific
content during the same refactor pass, this archive preserves the
trip-era record.

## Files

| File | Source | Content |
|------|--------|---------|
| `API_STATUS-trips.md` | `docs/API_STATUS.md` | Trip-related API routes (trips, members, activities, survey, voting, invitations, itinerary, flights, suggestions) |
| `LAUNCH_CHECKLIST-trips.md` | `docs/LAUNCH_CHECKLIST.md` | Trip Management, Group Coordination, and Activities launch-readiness sections |
| `PRODUCTION_ROADMAP-trips.md` | `docs/PRODUCTION_ROADMAP.md` | Trip-related priorities and completed trip-era milestones |

## Related References

- `src/_archive/README.md` — explains the archived code layout
- `docs/REFACTOR_PLAN.md` — Phase 1 archival plan
- Prisma schema (`prisma/schema.prisma`) — trip-domain models carry the
  `/// @deprecated Archived 2026-04-16 ...` triple-slash comment

## Do Not Edit

These snapshots are frozen. If you need to update trip-related docs, first
decide whether the trip feature is being reactivated (at which point update
the live docs) or remains archived (at which point leave these snapshots as
historical record).
