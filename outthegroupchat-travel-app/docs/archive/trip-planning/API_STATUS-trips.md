# API Status — Trip Planning Snapshot

> Snapshotted 2026-04-16 during Phase 1 archival.
> Source: outthegroupchat-travel-app/docs/API_STATUS.md (as of main commit after PR #40).
> This is a frozen record. The live docs will be updated to remove trip-specific content by Wave 2 agent G.

---

## 📋 Trip APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/trips` | GET | ✅ | 🔶 | Lists user's trips; **Sentry added 2026-04-16** |
| `/api/trips` | POST | ✅ | 🔶 | Creates new trip; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]` | GET | ✅ | 🔶 | Get trip details; email stripped from unauthenticated public responses (security hardened 2026-03-25); **Sentry added 2026-04-16** |
| `/api/trips/[tripId]` | PATCH | ✅ | ⏳ | Update trip; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]` | DELETE | ✅ | ⏳ | Delete trip; **Sentry added 2026-04-16** |

### Trip Member APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/trips/[tripId]/members` | GET | ✅ | 🔶 | List members; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/members` | POST | ✅ | ⏳ | Add member — POST handler implemented 2026-03-20; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/invitations` | GET | ✅ | 🔶 | List invitations; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/invitations` | POST | ✅ | ✅ | **Email service configured** ✅ Dec 17; **Sentry added 2026-04-16** |

### Trip Activity APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/trips/[tripId]/activities` | GET | ✅ | 🔶 | List activities; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/activities` | POST | ✅ | 🔶 | Add activity; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/itinerary` | GET | ✅ | 🔶 | Get itinerary — complete ✅ 2026-03-23; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/itinerary` | POST | ✅ | ⏳ | Create itinerary day — complete ✅ 2026-03-23; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/itinerary` | PUT | ✅ | ⏳ | Update itinerary (atomic $transaction) — complete ✅ 2026-03-23; **Sentry added 2026-04-16** |
| `/api/activities/[activityId]` | GET | ✅ | ⏳ | Get activity detail with comments, ratings, avg score; public activities accessible without auth |
| `/api/activities/[activityId]` | POST | ✅ | ⏳ | Save/unsave activity (toggle); auth required |
| `/api/activities/[activityId]` | PUT | ✅ | ⏳ | Add comment (`action: 'comment'`) or rating (`action: 'rate'`) to activity; auth required |

### Trip Planning APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/trips/[tripId]/survey` | GET | ✅ | 🔶 | Get survey; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/survey` | POST | ✅ | 🔶 | Create/respond to survey; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/voting` | GET | ✅ | 🔶 | Get voting session; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/voting` | POST | ✅ | 🔶 | Create/cast vote; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/recommendations` | GET | ✅ | ⏳ | AI recommendations; **Sentry added 2026-04-16** |
| `/api/trips/[tripId]/flights` | GET | ✅ | ⏳ | Search flights for trip dates using user's profile city as origin; uses Amadeus API |
| `/api/trips/[tripId]/suggestions` | GET | ✅ | ⏳ | Fetch events (Ticketmaster), attractions, and restaurants for trip destination; includes daily cost estimate |

### Invitation Management APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/invitations` | GET | ✅ | ⏳ | List all invitations for current user; auto-marks expired PENDING invitations |
| `/api/invitations/[invitationId]` | GET | ✅ | ⏳ | Get invitation details including trip + members; auth + ownership check |
| `/api/invitations/[invitationId]` | POST | ✅ | ⏳ | Accept or decline invitation (`action: 'accept'|'decline'`); on accept adds user as TripMember and notifies owner |
| `/api/trips/[tripId]/suggestions` | GET | 🔶 | ⏳ | Activity suggestions via Ticketmaster + Places APIs; requires ext API keys |
| `/api/trips/[tripId]/flights` | GET | 🔶 | ⏳ | Flight search via Amadeus-style integration; requires AMADEUS_API_KEY |

---

## 🎯 Activity & Invitation APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/activities/[activityId]` | GET | ✅ | 🔶 | Get activity detail, ratings, comments |
| `/api/activities/[activityId]` | POST | ✅ | 🔶 | Save/unsave activity (toggle) |
| `/api/activities/[activityId]` | PUT | ✅ | 🔶 | Add comment or rating to activity |
| `/api/invitations` | GET | ✅ | 🔶 | List user's pending trip invitations |
| `/api/invitations/[invitationId]` | GET | ✅ | 🔶 | Get invitation detail |
| `/api/invitations/[invitationId]` | POST | ✅ | 🔶 | Respond to invitation (accept/decline) |

---

## Completion Summary (Trip-related rows from the full table)

From the April 2026 API Completion Summary:

| Category | Total | Working | Partial | Broken | Not Started |
|----------|-------|---------|---------|--------|-------------|
| Trips | 21 | 21 | 0 | 0 | 0 |
| Invitations | 3 | 3 | 0 | 0 | 0 |

From the earlier (pre-2026-03-23) table:

| Category | Total | Working | Partial | Broken | Not Started |
|----------|-------|---------|---------|--------|-------------|
| Trips | 17 | 13 | 2 | 1 | 1 |

---

## Database Migrations Related to Trip Social Engagement

> Note: `TripComment`, `TripLike`, and `Follow` remain in the live schema
> post-pivot (the feed infrastructure reuses them). Only the core
> trip-domain models (Trip, TripMember, TripInvitation, PendingInvitation,
> TripSurvey, SurveyResponse, VotingSession, Vote, Activity, SavedActivity,
> ActivityComment, ActivityRating, ItineraryDay, ItineraryItem,
> ExternalActivity, DestinationCache) are marked `@deprecated`.

```prisma
// Add to prisma/schema.prisma

model TripComment {
  id        String   @id @default(cuid())
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  text      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tripId])
  @@index([userId])
}

model TripLike {
  id        String   @id @default(cuid())
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([userId, tripId])
  @@index([tripId])
}

model Follow {
  id          String   @id @default(cuid())
  followerId  String
  follower    User     @relation("Followers", fields: [followerId], references: [id], onDelete: Cascade)
  followingId String
  following   User     @relation("Following", fields: [followingId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())

  @@unique([followerId, followingId])
  @@index([followerId])
  @@index([followingId])
}
```
