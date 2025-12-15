# 🗺️ Planning Agent Guide

## Mission Statement
> "A social network that not just showcases experiences, but helps you build them."

**Your Role:** Architect features that balance social engagement with practical trip planning utility.

---

## 🎯 Core Planning Principles

### 1. Social-First Architecture
Every feature should answer: **"How does this help users share or collaborate?"**

```
✅ GOOD: "Users can share their itinerary with friends for feedback"
❌ BAD: "Users can create an itinerary" (no social element)
```

### 2. Experience Building Focus
Prioritize features that CREATE experiences, not just document them.

```
✅ GOOD: "AI suggests activities based on group preferences"
❌ BAD: "Users can manually add activities" (passive)
```

### 3. Group Dynamics
Always consider multi-user scenarios:
- How do decisions get made?
- What happens with disagreements?
- How is consensus built?

---

## 📐 Feature Planning Template

Use this for every new feature:

```markdown
## Feature: [Name]

### Social Value
- How does this enable sharing?
- How does this foster connection?
- What content does this generate for the feed?

### Experience Building Value
- Does this help plan better trips?
- Does AI enhance this feature?
- What decisions does this help make?

### User Stories
1. As a [role], I want to [action] so that [outcome]

### Technical Requirements
- Database changes needed
- API endpoints required
- Real-time requirements
- AI integration points

### Success Metrics
- Engagement: [metric]
- Completion: [metric]
- Sharing: [metric]

### Dependencies
- Must have: [features]
- Nice to have: [features]

### Risks & Mitigations
- Risk: [description]
- Mitigation: [strategy]
```

---

## 🏗️ Architecture Decisions

### Current Tech Stack (Respect These)
- **Frontend:** Next.js 14 App Router
- **Database:** PostgreSQL + Prisma
- **Auth:** NextAuth.js
- **AI:** Vercel AI SDK (OpenAI primary)
- **Real-time:** Pusher (configured, not fully integrated)
- **Styling:** TailwindCSS + Framer Motion

### Recommended Additions for Social Scale
1. **Redis** - Caching, rate limiting, sessions
2. **CDN** - Cloudinary/Uploadcare for media
3. **Search** - Algolia or Elasticsearch
4. **Analytics** - Mixpanel or Amplitude
5. **Monitoring** - Sentry + Vercel Analytics

---

## 📊 Data Models to Understand

### Core Social Graph
```
User ─┬─ follows ──→ User
      ├─ owns ──→ Trip ─┬─ has ──→ Activity
      ├─ memberOf ──→ Trip    ├─ has ──→ Survey
      └─ saves ──→ Activity   └─ has ──→ Vote
```

### Content Creation Flow
```
User creates Trip
  ↓
Invites Friends (TripMember)
  ↓
AI generates Survey
  ↓
Members respond (SurveyResponse)
  ↓
AI analyzes → Suggests Activities
  ↓
Group votes (VotingSession)
  ↓
AI generates Itinerary
  ↓
Trip happens → Content shared (Feed)
```

---

## 🎯 Planning Priorities (Next 90 Days)

### Phase 1: Social Foundation (Weeks 1-4)
**Goal:** Make sharing feel natural and rewarding

| Feature | Purpose | Estimate |
|---------|---------|----------|
| Media Uploads | Rich content for feed | 5 days |
| Reactions System | Engagement mechanics | 3 days |
| Share Cards | Beautiful link previews | 3 days |
| User Mentions | @user tagging | 4 days |

### Phase 2: Experience Building (Weeks 5-8)
**Goal:** AI-powered collaborative planning

| Feature | Purpose | Estimate |
|---------|---------|----------|
| Group AI Chat | Multi-user + AI sessions | 8 days |
| Smart Suggestions | Context-aware AI | 5 days |
| Conflict Resolution | Handle disagreements | 4 days |
| Budget Optimizer | AI cost analysis | 5 days |

### Phase 3: Growth Mechanics (Weeks 9-12)
**Goal:** Viral loops and retention

| Feature | Purpose | Estimate |
|---------|---------|----------|
| Trip Templates | Shareable trip blueprints | 5 days |
| Achievements | Gamification layer | 4 days |
| Recommendations | Friend suggestions | 4 days |
| Trending | Discovery algorithm | 5 days |

---

## ⚠️ Anti-Patterns to Avoid

### 1. Feature Creep Without Social
Don't add features that don't connect to social graph.

### 2. Solo-First Design
Every feature should work BETTER with groups, not just work alone.

### 3. Passive Content
Avoid "read-only" features. Everything should invite action.

### 4. Complex Onboarding
New users should create or join a trip within 2 minutes.

### 5. Hidden Social Actions
Make sharing, inviting, and connecting obvious and easy.

---

## 📋 Planning Checklist

Before any feature is approved:

- [ ] Connects to social graph (follows, shares, comments)
- [ ] Generates feed-worthy content
- [ ] Works better with AI assistance
- [ ] Has clear group dynamics
- [ ] Includes real-time elements
- [ ] Mobile-friendly by design
- [ ] Has measurable success metrics
- [ ] Doesn't duplicate existing functionality
- [ ] Scales to 100K+ users
- [ ] Respects privacy/security principles

---

## 🔮 Long-Term Vision

### Year 1: Community
- 10K active users
- 50K trips created
- Strong social engagement

### Year 2: Platform
- Creator tools
- API for partners
- Booking integrations

### Year 3: Ecosystem
- Travel brand partnerships
- User-generated content marketplace
- International expansion

---

## 📞 Communication Protocol

### Feature Requests
1. Create issue with template above
2. Tag with `planning`
3. Assign priority label
4. Link to this guide

### Architecture Decisions
1. Create ADR (Architecture Decision Record)
2. Document alternatives considered
3. Get team review before implementation

### Sprint Planning
1. Review this guide at sprint start
2. Ensure all features align with mission
3. Balance technical debt with features

---

*Remember: We're not building a trip planner. We're building a social network for experiences.*

*Last Updated: December 2024*

