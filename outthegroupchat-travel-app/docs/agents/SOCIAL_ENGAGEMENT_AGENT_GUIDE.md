# 🌐 Social Engagement Agent Guide

## Mission Statement
> "A social network that not just showcases experiences, but helps you build them."

**Your Role:** Design and implement social features that create meaningful connections, drive engagement, and make trip planning a shared experience.

---

## 🎯 Core Engagement Principles

### 1. Build Experiences Together
Not just sharing photos AFTER a trip - help groups plan, decide, and coordinate BEFORE and DURING.

### 2. Create FOMO, Then Fulfill It
Show amazing trips others are planning → Make it easy to start your own → Help you succeed.

### 3. Social Proof Everywhere
Every feature should answer: "Who else is doing this? What are they saying?"

### 4. Celebrate the Group
Individual travelers exist, but our POWER is in group dynamics.

---

## 📊 Current Social Features Status

### Implemented ✅
| Feature | Quality | Notes |
|---------|---------|-------|
| Follow System | ⭐⭐⭐ | Basic but functional |
| Activity Feed | ⭐⭐ | Needs media support |
| Notifications | ⭐⭐⭐ | In-app only |
| User Profiles | ⭐⭐ | Basic info only |
| Trip Sharing | ⭐⭐ | Public/private toggle |

### Missing ❌
| Feature | Priority | Impact |
|---------|----------|--------|
| Reactions/Likes | P0 | Critical engagement |
| Comments | P0 | Conversation starter |
| Rich Media | P0 | Content quality |
| Stories/Live Updates | P1 | Real-time engagement |
| @Mentions | P1 | User discovery |
| #Hashtags | P2 | Content discovery |
| Group Chat | P1 | Trip coordination |
| Achievements | P2 | Gamification |

---

## 🔥 Engagement Loops

### Primary Loop: Plan → Share → Inspire
```
┌─────────────────────────────────────────┐
│                                         │
│  User sees amazing trip in feed         │
│              ↓                          │
│  Gets inspired to plan similar trip     │
│              ↓                          │
│  Invites friends to join                │
│              ↓                          │
│  Group plans together (surveys, votes)  │
│              ↓                          │
│  Trip happens → Content created         │
│              ↓                          │
│  Shares to feed → Inspires others       │
│              ↓                          │
└──────────── (Loop continues) ───────────┘
```

### Secondary Loop: Engage → Connect → Collaborate
```
User likes/comments on trip
        ↓
Follows the trip creator
        ↓
Sees more of their content
        ↓
Gets invited to future trips
        ↓
Becomes active contributor
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
- Share activities to chat
- Quick polls
- AI assistant in chat

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
| DAU/MAU | TBD | 40% | Stories, notifications |
| Trips/User | TBD | 2+ | Better onboarding |
| Group Size Avg | TBD | 5+ | Easy invites |
| Content/Trip | TBD | 10+ | Media features |
| Engagement Rate | TBD | 10% | Reactions, comments |

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
□ AI content moderation (future)
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

*Make connections that turn strangers into travel companions.*

*Last Updated: 2026-04-03*

