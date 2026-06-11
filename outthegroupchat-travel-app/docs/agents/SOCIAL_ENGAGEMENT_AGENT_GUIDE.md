# 🌐 Social Engagement Agent Guide

## Mission Statement
> "The social media app that wants to get you off your phone."

**Your Role:** Design social features that drive *real-world* connection — getting Crews to actually meet up, not racking up screen time.

> **Domain context & reality check:** OutTheGroupchat is a meetup-centric social network. The product pivoted away from trip-planning (archived to `src/_archive/`) and the AI surface was fully removed (PR #65) — ignore any "AI in chat / AI moderation" suggestions below. The schema snippets in this guide are **historical design proposals**, not the shipped schema. What actually exists today: a meetup-centric feed with comments/likes, in-app **notifications** with three triggers (DAILY_PROMPT, PER_MEMBER_INTENT, GROUP_FORMATION), **Crew** relationships, **Check-ins** ("Who's Out Tonight?") as the live-update surface, **Meetups** + RSVP as the coordination surface, and the opt-in location **Heatmap**. Treat the engagement principles below as durable, but map any "to build" feature onto the current meetup domain (Crew / Meetup / CheckIn / Topic / Intent), and skip anything that contradicts the pivot.

---

## 🎯 Core Engagement Principles

### 1. Get People in the Room
The win condition is an in-person meetup, not a like. Every feature should shorten intent → meet.

### 2. Create FOMO, Then Fulfill It
Show "your Crew is out tonight" / "3 people want the same thing" → make it one tap to join → help the meetup actually happen.

### 3. Social Proof Everywhere
Every feature should answer: "Who in my Crew is doing this right now?"

### 4. Celebrate the Group
Solo check-ins exist, but our POWER is when a SubCrew forms and a Meetup lands.

---

## 📊 Current Social Features Status

### Implemented ✅
| Feature | Quality | Notes |
|---------|---------|-------|
| Crew system | ⭐⭐⭐ | Request/accept, crewLabel, relationship settings |
| Meetups + RSVP | ⭐⭐⭐ | Create/detail/invite, AttendeeStatus, Pusher real-time |
| Check-ins | ⭐⭐⭐ | "Who's Out Tonight?", visibility PUBLIC/CREW/PRIVATE |
| Location Heatmap | ⭐⭐⭐ | Crew + FoF tiers (maplibre + OpenFreeMap) |
| Notifications | ⭐⭐⭐ | In-app; DAILY_PROMPT / PER_MEMBER_INTENT / GROUP_FORMATION triggers |
| Feed (likes/comments) | ⭐⭐ | Meetup-centric; rich-item layer removed |
| Follow (legacy) | ⭐ | `@deprecated` — Crew is the canonical relationship |

### Missing / Next ❌
| Feature | Priority | Impact |
|---------|----------|--------|
| Rich media in feed/check-ins | P1 | Content quality |
| @Mentions | P2 | Crew discovery |
| Recurring meetups | P2 | Retention via standing plans |
| Achievements | P3 | Gamification (post-launch) |

> Reactions, comments, notifications, and group coordination already ship via the feed + Meetup + Crew surfaces — they are no longer "missing." Do not re-propose them as net-new.

---

## 🔥 Engagement Loops

### Primary Loop: Intent → Group → Meet → Repeat
```
┌─────────────────────────────────────────┐
│                                         │
│  User signals Intent on a Topic         │
│              ↓                          │
│  ≥2 Crew share it → SubCrew forms        │
│              ↓                          │
│  Group picks venue + time (Meetup)      │
│              ↓                          │
│  Crew RSVP + check in IRL                │
│              ↓                          │
│  Meetup happens → trust + habit grow     │
│              ↓                          │
│  More likely to signal next time        │
│              ↓                          │
└──────────── (Loop continues) ───────────┘
```

### Secondary Loop: Check in → Notice → Join
```
User posts a check-in ("Who's Out Tonight?")
        ↓
Crew sees it (CREW_CHECKED_IN_NEARBY notification)
        ↓
Someone taps "Join me"
        ↓
An impromptu meetup forms
        ↓
Both more likely to check in again
```

---

## 🎮 Engagement Features to Build

### 1. Reaction System
**Priority:** P0 - CRITICAL
**Impact:** 5x engagement increase

```typescript
// Schema addition
model Reaction {
  id        String   @id @default(cuid())
  userId    String
  targetId  String   // Trip, Activity, or Comment
  targetType ReactionTarget
  type      ReactionType
  createdAt DateTime @default(now())
  
  user User @relation(fields: [userId], references: [id])
  
  @@unique([userId, targetId, targetType])
}

enum ReactionTarget {
  TRIP
  ACTIVITY
  COMMENT
  FEED_ITEM
}

enum ReactionType {
  LIKE      // ❤️ Default
  LOVE      // 😍 Trip looks amazing
  FIRE      // 🔥 This is hot
  JEALOUS   // 😭 Take me with you
  PLANNING  // 📝 Adding to my list
}
```

**UI Considerations:**
- Quick tap = Like
- Long press = Reaction picker
- Show reaction counts with breakdown
- Animate reactions

---

### 2. Comments System
**Priority:** P0 - CRITICAL
**Impact:** 3x session duration

```typescript
// Schema addition
model Comment {
  id        String   @id @default(cuid())
  userId    String
  targetId  String
  targetType CommentTarget
  content   String
  parentId  String?  // For threaded replies
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  user     User      @relation(fields: [userId], references: [id])
  parent   Comment?  @relation("CommentReplies", fields: [parentId], references: [id])
  replies  Comment[] @relation("CommentReplies")
  reactions Reaction[]
  
  @@index([targetId, targetType])
}

enum CommentTarget {
  TRIP
  ACTIVITY
  FEED_ITEM
}
```

**Features:**
- Threaded replies (1 level deep)
- @mentions with autocomplete
- Emoji picker
- Rich link previews
- Edit/delete (time-limited)
- Report inappropriate

---

### 3. Rich Media System
**Priority:** P0 - CRITICAL
**Impact:** 10x engagement on posts with images

```typescript
// Schema addition
model Media {
  id        String    @id @default(cuid())
  userId    String
  tripId    String?
  activityId String?
  type      MediaType
  url       String    // CDN URL
  thumbnail String?   // For videos
  caption   String?
  location  Json?     // {lat, lng, placeName}
  takenAt   DateTime?
  createdAt DateTime  @default(now())
  
  user     User     @relation(fields: [userId], references: [id])
  trip     Trip?    @relation(fields: [tripId], references: [id])
  activity Activity? @relation(fields: [activityId], references: [id])
  tags     MediaTag[]
}

enum MediaType {
  PHOTO
  VIDEO
  GALLERY
}

model MediaTag {
  id      String @id @default(cuid())
  mediaId String
  userId  String // Tagged user
  x       Float  // Position 0-1
  y       Float
  
  media Media @relation(fields: [mediaId], references: [id])
  user  User  @relation(fields: [userId], references: [id])
}
```

**Features:**
- Image upload with compression
- Multi-image galleries
- Short video clips (30s max)
- Location tagging
- User tagging
- Filters (optional)

---

### 4. Stories/Live Updates
**Priority:** P1 - HIGH
**Impact:** 40% DAU increase

```typescript
// Schema addition
model Story {
  id        String    @id @default(cuid())
  userId    String
  tripId    String?   // Optional trip context
  mediaUrl  String
  type      StoryType
  text      String?
  location  Json?
  expiresAt DateTime  // 24 hours from creation
  createdAt DateTime  @default(now())
  
  user  User   @relation(fields: [userId], references: [id])
  trip  Trip?  @relation(fields: [tripId], references: [id])
  views StoryView[]
}

enum StoryType {
  PHOTO
  VIDEO
  TEXT
  POLL
  COUNTDOWN
}

model StoryView {
  id        String   @id @default(cuid())
  storyId   String
  userId    String
  viewedAt  DateTime @default(now())
  
  story Story @relation(fields: [storyId], references: [id])
  user  User  @relation(fields: [userId], references: [id])
  
  @@unique([storyId, userId])
}
```

**Features:**
- 24-hour ephemeral content
- Trip-linked stories
- View tracking
- Polls and countdowns
- Highlight collections

---

### 5. Group Chat
**Priority:** P1 - HIGH
**Impact:** Essential for coordination

```typescript
// Schema addition
model ChatMessage {
  id        String   @id @default(cuid())
  tripId    String
  userId    String
  content   String
  type      MessageType
  metadata  Json?    // For special message types
  createdAt DateTime @default(now())
  
  trip Trip @relation(fields: [tripId], references: [id])
  user User @relation(fields: [userId], references: [id])
  reactions Reaction[]
}

enum MessageType {
  TEXT
  IMAGE
  ACTIVITY  // Shared activity
  POLL      // Quick vote
  LOCATION  // Live location share
  SYSTEM    // Join/leave notifications
}
```

**Features:**
- Real-time via Pusher
- Read receipts
- Reply to messages
- Share a meetup / venue to chat
- Quick polls (Poll / PollResponse models exist)
- Live location share (opt-in)

---

### 6. Achievements & Gamification
**Priority:** P2 - MEDIUM
**Impact:** 25% retention increase

```typescript
// Schema addition
model Achievement {
  id          String @id @default(cuid())
  key         String @unique
  name        String
  description String
  icon        String
  category    AchievementCategory
  tier        Int    // 1-3
  requirement Json   // {type: 'trips_completed', count: 5}
}

model UserAchievement {
  id            String   @id @default(cuid())
  userId        String
  achievementId String
  progress      Int
  unlockedAt    DateTime?
  createdAt     DateTime @default(now())
  
  user        User        @relation(fields: [userId], references: [id])
  achievement Achievement @relation(fields: [achievementId], references: [id])
  
  @@unique([userId, achievementId])
}

enum AchievementCategory {
  PLANNING    // Trip planning milestones
  EXPLORING   // Destinations visited
  SOCIAL      // Followers, engagement
  CREATOR     // Content creation
  ORGANIZER   // Group coordination
}
```

**Achievement Ideas:**
```
🌱 First Timer - Complete your first trip
🌍 Globetrotter - Visit 10 countries
👥 Social Butterfly - 100 followers
🎯 Planner Pro - Perfect survey completion
🔥 Trendsetter - Trip gets 100 saves
🤝 Party Starter - Organize 5 group trips
📸 Storyteller - 50 trip photos shared
💬 Contributor - 100 helpful comments
```

---

## 📈 Engagement Metrics to Track

### Core Metrics
| Metric | Current | Target | How to Improve |
|--------|---------|--------|----------------|
| DAU/MAU | TBD | 40% | Daily prompt, check-in notifications |
| Meetups/User/month | TBD | 2+ | Faster intent→group→meet loop |
| Crew size avg | TBD | 5+ | Easy Crew requests, FoF discovery |
| Intent→Meetup conversion | TBD | 25%+ | Surface formation moments, venue recs |
| Check-in → "Join me" rate | TBD | 10%+ | Timely Crew notifications |

### Social Health Metrics
```
Follow Ratio = Followers / Following (ideal: 0.8-1.2)
Reciprocity = Mutual Follows / Total Follows (ideal: >30%)
Engagement = (Likes + Comments + Shares) / Impressions (ideal: >5%)
Viral Coefficient = Invites Sent × Accept Rate (ideal: >1.0)
```

---

## 🚀 Implementation Roadmap

### Phase 1: Engagement Foundation (Weeks 1-2)
```
Week 1:
□ Reaction system (backend + frontend)
□ Comment system (basic)
□ Media upload infrastructure

Week 2:
□ Rich media in feed
□ @mentions implementation
□ Enhanced notifications
```

### Phase 2: Real-Time Social (Weeks 3-4)
```
Week 3:
□ Group chat implementation
□ Pusher full integration
□ Typing indicators

Week 4:
□ Stories MVP
□ Live trip updates
□ Online presence
```

### Phase 3: Growth Mechanics (Weeks 5-6)
```
Week 5:
□ Achievement system
□ Trending algorithm
□ Personalized feed

Week 6:
□ Share cards
□ Viral loops
□ Referral system
```

---

## 🎯 Social Feature Design Principles

### 1. Visibility Creates Value
```
User action → Visible to network → Social validation → More action
```

### 2. Friction Where Needed
```
Easy: Like, follow, view
Medium: Comment, share, create
Hard: Report, block, delete account
```

### 3. Defaults Matter
```
New trip → Suggest inviting friends
New activity → Suggest sharing
Milestone → Auto-celebrate
```

### 4. FOMO Factory
```
Show: "Sarah and 4 others are planning a trip to Bali"
Show: "This trip has been saved 47 times"
Show: "Trending in your area"
```

---

## 🔒 Safety & Moderation

### Content Policies
- No hate speech or harassment
- No spam or self-promotion
- No adult content
- No misleading information
- No illegal activities

### Moderation Tools Needed
```
□ Report system with categories
□ Block user functionality
□ Mute notifications from user
□ Hide content from feed
□ Admin dashboard for review
□ Keyword/heuristic content filtering (no AI moderation — AI removed PR #65)
```

### Trust & Safety Features
```
□ Private profile option
□ Approve followers option
□ Trip visibility controls
□ Comment filtering
□ DM restrictions
```

---

## 📋 Social Feature Checklist

Before launching any social feature:

- [ ] Works on mobile
- [ ] Real-time updates (if applicable)
- [ ] Proper notifications
- [ ] Privacy controls
- [ ] Report mechanism
- [ ] Rate limiting
- [ ] Accessible
- [ ] Engaging animations
- [ ] Clear empty states
- [ ] Error handling
- [ ] Analytics events
- [ ] A/B testable

---

*Make connections that turn group chats into people actually showing up.*

*Last Updated: 2026-06-11*

