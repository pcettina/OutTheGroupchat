# 📡 API & Integration Status

> **Last updated: 2026-03-22**
>
> **Last Audit:** March 2026
> **Overall Status:** 82% Complete
> **Target:** 100% for Beta Launch

---

## 📊 Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Working - Production Ready |
| 🔶 | Partial - Needs Fixes |
| ⚠️ | Broken - Critical Issues |
| ⏳ | Not Started |
| 🔒 | Blocked - Waiting on Dependencies |

---

## 🔐 Authentication APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/auth/[...nextauth]` | ALL | ✅ | ✅ | NextAuth handler |
| `/api/auth/signup` | POST | ✅ | ✅ | Zod validation added 2026-03-18; email verification sending added 2026-03-21 |
| `/api/auth/demo` | POST | ✅ | ✅ | Demo credentials in env vars ✅ 2026-03-10; DEMO_MODE env guard added 2026-03-22 (requires DEMO_MODE=true to activate) |
| `/api/auth/demo` | GET | ✅ | ✅ | Returns demo account info (hides password in prod); requires DEMO_MODE=true env var ✅ 2026-03-22 |
| `/api/auth/reset-password` | POST | ✅ | ✅ | Request reset token; email-safe 200 response ✅ 2026-03-12; UI page added 2026-03-14 |
| `/api/auth/reset-password` | PATCH | ✅ | ✅ | Confirm reset with token + new password ✅ 2026-03-12; UI confirm page added 2026-03-14 |
| `/api/auth/verify-email` | GET | ✅ | ✅ | Email token verification ✅ 2026-03-19; signup now sends verification email ✅ 2026-03-21 |

### Auth Issues to Fix
- [x] Add password reset endpoint ✅ 2026-03-12
- [x] Add email verification endpoint ✅ 2026-03-19 (GET /api/auth/verify-email)
- [x] Wire email verification sending on signup ✅ 2026-03-21

---

## 📋 Trip APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/trips` | GET | ✅ | 🔶 | Lists user's trips |
| `/api/trips` | POST | ✅ | 🔶 | Creates new trip |
| `/api/trips/[tripId]` | GET | ✅ | 🔶 | Get trip details |
| `/api/trips/[tripId]` | PATCH | ✅ | ⏳ | Update trip |
| `/api/trips/[tripId]` | DELETE | ✅ | ⏳ | Delete trip |

### Trip Member APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/trips/[tripId]/members` | GET | ✅ | 🔶 | List members |
| `/api/trips/[tripId]/members` | POST | ✅ | ⏳ | Add member — POST handler implemented 2026-03-20 |
| `/api/trips/[tripId]/invitations` | GET | ✅ | 🔶 | List invitations |
| `/api/trips/[tripId]/invitations` | POST | ✅ | ✅ | **Email service configured** ✅ Dec 17 |

### Trip Activity APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/trips/[tripId]/activities` | GET | ✅ | 🔶 | List activities |
| `/api/trips/[tripId]/activities` | POST | ✅ | 🔶 | Add activity |
| `/api/trips/[tripId]/itinerary` | GET | ✅ | 🔶 | Get itinerary |
| `/api/trips/[tripId]/itinerary` | PUT | ✅ | ⏳ | Update itinerary |
| `/api/activities/[activityId]` | GET | ✅ | ⏳ | Get activity detail with comments, ratings, avg score; public activities accessible without auth |
| `/api/activities/[activityId]` | POST | ✅ | ⏳ | Save/unsave activity (toggle); auth required |
| `/api/activities/[activityId]` | PUT | ✅ | ⏳ | Add comment (`action: 'comment'`) or rating (`action: 'rate'`) to activity; auth required |

### Trip Planning APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/trips/[tripId]/survey` | GET | ✅ | 🔶 | Get survey |
| `/api/trips/[tripId]/survey` | POST | ✅ | 🔶 | Create/respond to survey |
| `/api/trips/[tripId]/voting` | GET | ✅ | 🔶 | Get voting session |
| `/api/trips/[tripId]/voting` | POST | ✅ | 🔶 | Create/cast vote |
| `/api/trips/[tripId]/recommendations` | GET | ✅ | ⏳ | AI recommendations |
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

## 📰 Feed APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/feed` | GET | ✅ | ✅ | Main feed; Zod validation added 2026-03-21 |
| `/api/feed/comments` | GET | ✅ | ✅ | **Trip support added** ✅ Dec 17 |
| `/api/feed/comments` | POST | ✅ | ✅ | **Trip support added** ✅ Dec 17 |
| `/api/feed/engagement` | POST | ✅ | ✅ | **Trip support added** ✅ Dec 17 |
| `/api/feed/share` | POST | ✅ | ⏳ | Implemented with Zod validation + notification ✅ 2026-03-16 |

### Feed Issues to Fix
```
COMPLETED ✅ Dec 17:
1. [x] Add TripComment model to schema
2. [x] Update comments API for itemType: 'trip'
3. [x] Add TripLike model to schema
4. [x] Update engagement API for trip items
5. [x] Implement share/repost API ✅ 2026-03-16
```

---

## 🔔 Notification APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/notifications` | GET | ✅ | ✅ | **Data structure verified** ✅ Dec 17; Zod pagination params improved 2026-03-22 |
| `/api/notifications` | PATCH | ✅ | ✅ | Mark as read |
| `/api/notifications/[id]` | PATCH | ✅ | ✅ | Mark individual notification read; Zod validation added 2026-03-13 |

### Notification Issues to Fix
```
VERIFIED ✅ Dec 17:
Frontend correctly accesses: data?.data?.notifications
No fix needed - code was already correct
```

---

## 🔍 Discovery & Search APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/discover` | GET | ✅ | ⏳ | Search events/places/restaurants/attractions/nightlife by city + date range; type param filters results |
| `/api/discover` | POST | ✅ | ⏳ | Search flights via EventsService (origin, destination, departureDate, returnDate, adults); Zod validation added 2026-03-21 |
| `/api/discover/search` | GET | 🔶 | 🔶 | Fallback mode active |
| `/api/discover/recommendations` | GET | ✅ | 🔶 | Working |
| `/api/discover/import` | POST | 🔶 | ⏳ | OpenTripMap import |
| `/api/search` | GET | ✅ | 🔶 | Email removed from select projection (privacy fix) ✅ 2026-03-20 |
| `/api/geocoding` | GET | ✅ | 🔶 | Geocoding for destination search via Nominatim; Zod validation added 2026-03-21 |
| `/api/inspiration` | GET | ✅ | 🔶 | Auth guard added 2026-03-08; Zod coerce.number on query params + POST body schema added 2026-03-22 |
| `/api/images/search` | GET | ✅ | 🔶 | Image search via Unsplash API; requires UNSPLASH_ACCESS_KEY |

### Search Issues to Fix
```
COMPLETED ✅ 2026-03-20:
Email removed from select projection in /api/search/route.ts
```

---

## 🤖 AI APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/ai/chat` | POST | ✅ | ✅ | **OpenAI connected** ✅ Dec 17 |
| `/api/ai/recommend` | POST | ✅ | ⏳ | Personalized activity recommendations using user saved/rated history; AI + DB hybrid results |
| `/api/ai/recommend` | GET | ✅ | ⏳ | Trip-scoped recommendations by `?tripId=`; aggregates group member preferences to suggest activities |
| `/api/ai/generate-itinerary` | POST | 🔶 | ⏳ | Needs real AI |
| `/api/ai/suggest-activities` | POST | 🔶 | ⏳ | Needs real AI |
| `/api/ai/search` | GET/POST | 🔶 | ⏳ | Semantic search |

### AI Issues to Fix
```
COMPLETED ✅ Dec 17:
1. [x] Connect to OpenAI/Claude API
2. [x] Enable streaming responses
3. [x] Add proper rate limiting (Upstash Redis)
4. [x] Add trip context to prompts
```

---

## 👤 User/Profile APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/profile` | GET | ✅ | 🔶 | Get current user |
| `/api/profile` | PUT | ✅ | 🔶 | Update profile; Zod validation added 2026-03-13 |
| `/api/users/[userId]` | GET | ✅ | ⏳ | Get user profile |
| `/api/users/[userId]/follow` | POST | ✅ | ⏳ | Follow/unfollow implemented in /api/users/[userId] POST ✅ |

---

## 🔌 Real-Time APIs (Pusher)

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/pusher/auth` | POST | 🔒 | 🔒 | **Needs env vars** |

### Pusher Issues to Fix
```
BLOCKED - Need Environment Variables:
- PUSHER_APP_ID
- PUSHER_KEY
- PUSHER_SECRET
- PUSHER_CLUSTER
- NEXT_PUBLIC_PUSHER_KEY
- NEXT_PUBLIC_PUSHER_CLUSTER
```

---

## ⚙️ System APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/cron` | GET | ✅ | N/A | Background jobs; CRON_SECRET validation hardened 2026-03-22 |
| `/api/health` | GET | ✅ | N/A | DB connectivity check, env info, 503 on degraded ✅ 2026-03-10 |
| `/api/users/me` | GET | ✅ | 🔶 | Get current authenticated user |
| `/api/users/me` | PATCH | ✅ | 🔶 | Update current user profile + preferences |

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

## 🚀 Beta & Newsletter APIs

| Endpoint | Method | Status | Frontend Connected | Notes |
|----------|--------|--------|-------------------|-------|
| `/api/beta/signup` | POST | ✅ | ✅ | Beta waitlist signup |
| `/api/beta/status` | GET | ✅ | ✅ | Check beta access status; IP rate limiting added 2026-03-21; response narrowed to {exists, passwordInitialized} only (data minimization) ✅ 2026-03-22 |
| `/api/beta/initialize-password` | POST | ✅ | ✅ | Beta user password init — now protected with N8N_API_KEY auth ✅ 2026-03-19 (was unauthenticated — account takeover vulnerability fixed) |
| `/api/newsletter/subscribe` | POST | ✅ | ✅ | Newsletter subscription |

---

## 📊 API Completion Summary

| Category | Total | Working | Partial | Broken | Not Started |
|----------|-------|---------|---------|--------|-------------|
| Auth | 6 | 6 | 0 | 0 | 0 |
| Trips | 20 | 18 | 0 | 1 | 1 |
| Invitations | 3 | 3 | 0 | 0 | 0 |
| Feed | 5 | 4 | 0 | 0 | 1 |
| Notifications | 3 | 3 | 0 | 0 | 0 |
| Discovery | 6 | 3 | 2 | 1 | 0 |
| AI | 6 | 2 | 4 | 0 | 0 |
| User | 4 | 2 | 0 | 0 | 2 |
| Real-time | 1 | 0 | 0 | 0 | 1 |
| System | 3 | 2 | 0 | 0 | 1 |
| **TOTAL** | **57** | **43** | **6** | **1** | **5** |

**API Completion Rate: 75% fully working** ✅ (updated after documenting 12 previously undocumented endpoints)
| Trips | 17 | 13 | 2 | 1 | 1 |
| Feed | 5 | 5 | 0 | 0 | 0 |
| Notifications | 3 | 3 | 0 | 0 | 0 |
| Discovery | 4 | 2 | 2 | 0 | 0 |
| AI | 4 | 0 | 4 | 0 | 0 |
| User | 5 | 3 | 0 | 0 | 2 |
| Real-time | 1 | 0 | 0 | 0 | 1 |
| System | 3 | 2 | 0 | 0 | 1 |
| **TOTAL** | **47** | **33** | **8** | **0** | **4** |

**API Completion Rate: 70% fully working** (search email fix: ⚠️ → ✅; members POST handler implemented 2026-03-20)

---

## 🔧 Priority Fix Order

### Critical (Block Launch)
1. **Feed Comments** - ✅ COMPLETE Dec 17
2. **Feed Engagement** - ✅ COMPLETE Dec 17
3. **Notifications** - ✅ VERIFIED Dec 17
4. **Invitations** - ✅ COMPLETE Dec 17

### High (Should Fix)
5. **Search** - ✅ Email removed from select projection 2026-03-20
6. **AI Chat** - ✅ COMPLETE Dec 17
7. **Pusher Auth** - Add env vars

### Medium (Nice to Have)
8. **Health Check** - ✅ COMPLETE 2026-03-10
9. **Follow System** - Implement
10. **Share/Repost** - Implement

---

## 📝 Database Migrations Needed

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

---

## 🔗 Environment Variables Required

```env
# Already Set (Verify)
DATABASE_URL=
DIRECT_URL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Need to Add
ANTHROPIC_API_KEY=      # Alternative AI (optional)
PUSHER_APP_ID=          # Real-time
PUSHER_KEY=             # Real-time
PUSHER_SECRET=          # Real-time
PUSHER_CLUSTER=         # Real-time
NEXT_PUBLIC_PUSHER_KEY= # Real-time (client)
NEXT_PUBLIC_PUSHER_CLUSTER= # Real-time (client)

# Already Set ✅ Dec 17
OPENAI_API_KEY=         # For AI features ✅
RESEND_API_KEY=         # Email service ✅
EMAIL_FROM=             # Email sender (onboarding@resend.dev) ✅
```

---

*Review and update after each API change.*

*Last Updated: 2026-03-22 - /api/beta/status response narrowed to {exists, passwordInitialized} (data minimization); /api/auth/demo DEMO_MODE env guard added; Zod improved on /api/inspiration and /api/notifications; CRON_SECRET validation hardened on /api/cron; 84 new tests across 7 new test files (Wave 1); TSC fixes in trips-tripid-invitations.test.ts and trips-tripid-recommendations.test.ts; tests total ~661 (37 test files)*
