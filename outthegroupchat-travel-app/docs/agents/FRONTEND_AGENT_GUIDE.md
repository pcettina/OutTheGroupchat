# 🎨 Frontend Development Agent Guide

## Mission Statement
> "The social media app that wants to get you off your phone."

**Your Role:** Create interfaces that get users *out* of the app and into real meetups — surfacing Crew, signaling Intent, joining SubCrews, and showing up at a Venue.

---

## 🎯 Design Philosophy

### 1. Intent → Meetup Loop, Visualized
Every screen should help the user move along the loop:
- Signal Intent (one-tap from Topic catalog)
- See your Crew light up on the heatmap
- Auto-form SubCrew when ≥2 Crew share a Topic
- Coordinate → confirm Venue → check-in IRL

### 2. Off-Phone, On-Time
The app exists to end the session. Surface the action that gets the user out the door (RSVP, venue map, check-in) before anything else. Avoid endless feeds, infinite scroll, or doomscrolly affordances.

### 3. Mobile-First, Always
60%+ of usage is mobile:
- Touch-friendly targets (44px min)
- Swipe gestures where appropriate
- Optimized for thumb zones
- Fast loading on slow connections
- The heatmap (`src/components/heatmap/`) is the only "rich" surface — keep everything else tight

---

## 🛠️ Tech Stack (current 2026-05-19)

```typescript
// Core
Next.js 14 App Router
React 18 (Server + Client Components)
TypeScript (strict mode)

// Styling
TailwindCSS 3.4
Framer Motion (animations)
CSS Variables (theming)

// State
TanStack Query (server state, where used)
React Context (UI state)
URL State (filters, pagination)

// Real-time
Pusher (Crew accept, Intent broadcast, SubCrew formation, Meetup RSVP, check-in)

// Maps / heatmap
maplibre-gl + OpenFreeMap tiles (free, no API key)
Used by `src/components/heatmap/HeatmapMap.tsx` for Crew / FoF tiers,
contribution-driven, z=15 venue markers, anchor priorities 1/3/4

// Upgrades on the radar (see docs/UPGRADE_PLAN.md)
// next 14→16, react 18→19, prisma 5→7 — not yet executed
```

---

## 🎨 Design System

### Color Palette
```css
:root {
  /* Primary - Emerald/Teal (Travel, Growth) */
  --primary-50: #ecfdf5;
  --primary-500: #10b981;
  --primary-600: #059669;
  --primary-700: #047857;
  
  /* Secondary - Slate (Professional, Calm) */
  --secondary-50: #f8fafc;
  --secondary-500: #64748b;
  --secondary-900: #0f172a;
  
  /* Accent - Amber (Energy, Excitement) */
  --accent-400: #fbbf24;
  --accent-500: #f59e0b;
  
  /* Semantic */
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;
}
```

### Typography
```css
/* Headings: Space Grotesk or similar geometric sans */
--font-heading: 'Space Grotesk', system-ui, sans-serif;

/* Body: Inter for readability */
--font-body: 'Inter', system-ui, sans-serif;

/* Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */
--text-4xl: 2.25rem;   /* 36px */
```

### Spacing System
```css
/* Use Tailwind's default scale: 4, 8, 12, 16, 24, 32, 48, 64 */
```

### Border Radius
```css
--radius-sm: 0.375rem;  /* 6px - buttons, inputs */
--radius-md: 0.5rem;    /* 8px - cards */
--radius-lg: 0.75rem;   /* 12px - modals */
--radius-xl: 1rem;      /* 16px - large cards */
--radius-full: 9999px;  /* pills, avatars */
```

---

## 📂 Component Directory Map (V1)

```
src/components/
├── heatmap/         HeatmapMap, HeatmapView, MutualThresholdSlider (maplibre-gl)
├── intents/         IntentChip, IntentCreateForm, IntentList, IntentPromptCard
├── subcrews/        EmergingSubCrewCard, ImInButton, SubCrewCard,
│                    SubCrewCoordinationPanel, RecommendationsList
├── meetups/         MeetupCard, MeetupList, CreateMeetupModal, RSVPButton, VenuePicker
├── checkins/        CheckInButton, LiveActivityCard, NearbyCrewList
├── privacy/         PrivacyPickerModal (location visibility opt-in)
├── feed/            RichFeedItem (+ extracted FeedItemHeader / Actions / LegacyCards / Types)
├── notifications/   Notification surface (V1 NotificationType pruned)
├── profile/         Profile surface incl. ProfileCheckinsSection
├── auth/            Sign-in / sign-up / verify / reset
├── discover/        People-first discovery (search, nearby)
├── onboarding/      First-run flow
├── inspiration/     (legacy, scoped down)
├── search/          Search UI
├── settings/        Account + privacy settings
├── social/          Cross-cutting social bits (avatar stacks etc.)
├── ui/              Reusable primitives
├── accessibility/   A11y helpers
├── Navigation.tsx   App nav (Heatmap, Intents, SubCrews, Meetups, Check-ins, Profile)
└── _archive/        Trip-planning UI parked here (do NOT import from prod)
```

---

## 🧩 Component Patterns

### Card Component
```tsx
// Crew-aware SubCrew card with momentum metrics
interface SubCrewCardProps {
  subCrew: SubCrewSummary;
  showMomentum?: boolean;
  onJoin?: () => void;
}

export function SubCrewCard({ subCrew, showMomentum = true, onJoin }: SubCrewCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="group relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{subCrew.topic.label}</h3>
          <TopicEmoji topic={subCrew.topic} />
        </div>
        <p className="text-sm text-slate-500">
          {subCrew.memberCount} Crew · {subCrew.cityLabel}
        </p>

        {showMomentum && (
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <UsersIcon className="w-4 h-4" />
              {subCrew.imInCount} I'm in
            </span>
            <span className="flex items-center gap-1">
              <ClockIcon className="w-4 h-4" />
              {formatRelativeTime(subCrew.formedAt)}
            </span>
          </div>
        )}

        <AvatarStack users={subCrew.members} max={4} className="mt-3" />

        <button
          onClick={onJoin}
          className="mt-4 w-full rounded-full bg-emerald-600 text-white py-2 text-sm font-medium"
        >
          I'm in
        </button>
      </div>
    </motion.div>
  );
}
```

### Feed Item Component
```tsx
// Dynamic feed item based on V1 surface (Intent / SubCrew / Meetup / Check-in)
// Canonical implementation lives in src/components/feed/RichFeedItem.tsx
export function FeedItem({ item }: { item: FeedItemType }) {
  const renderContent = () => {
    switch (item.type) {
      case 'INTENT_SIGNALED':
        return <IntentSignaledCard intent={item.intent} />;
      case 'SUBCREW_FORMED':
        return <SubCrewFormedCard subCrew={item.subCrew} />;
      case 'MEETUP_CREATED':
        return <MeetupCreatedCard meetup={item.meetup} />;
      case 'CREW_CHECKED_IN_NEARBY':
        return <CheckinNearbyCard checkin={item.checkin} />;
      default:
        return null;
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-slate-200 overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <Avatar user={item.user} size="md" />
        <div className="flex-1">
          <p className="text-sm">
            <Link href={`/profile/${item.user.id}`} className="font-semibold hover:underline">
              {item.user.name}
            </Link>
            {' '}{getFeedActionText(item.type)}
          </p>
          <time className="text-xs text-slate-500">
            {formatRelativeTime(item.timestamp)}
          </time>
        </div>
        <DropdownMenu>
          <DropdownMenuItem>Share</DropdownMenuItem>
          <DropdownMenuItem>Save</DropdownMenuItem>
          <DropdownMenuItem>Report</DropdownMenuItem>
        </DropdownMenu>
      </div>
      
      {/* Content */}
      {renderContent()}
      
      {/* Engagement Bar */}
      <EngagementBar
        likes={item.likeCount}
        comments={item.commentCount}
        shares={item.shareCount}
        onLike={() => {}}
        onComment={() => {}}
        onShare={() => {}}
      />
    </motion.article>
  );
}
```

### Intent Signal Pattern
```tsx
// One-tap "I want to do X tonight/this weekend" — the V1 primary action.
// Hits POST /api/intents. SubCrew auto-formation runs server-side when
// ≥2 Crew members share the same Topic.
export function IntentChip({ topic, onSignaled }: { topic: Topic; onSignaled?: () => void }) {
  const [pending, setPending] = useState(false);

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const res = await fetch('/api/intents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topicId: topic.id })
          });
          if (res.ok) onSignaled?.();
        } finally {
          setPending(false);
        }
      }}
      className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
    >
      {topic.emoji} {topic.label}
    </motion.button>
  );
}
```

> **AI removed (2026-04-23, PR #65):** Do NOT propose AI chat / itinerary / recommendation components. There is no `src/components/ai`, no `/api/ai/*`, no `@ai-sdk/*`. Reintroducing requires explicit founder sign-off.

---

## 📱 Responsive Patterns

### Breakpoints
```typescript
const breakpoints = {
  sm: '640px',   // Mobile landscape
  md: '768px',   // Tablet
  lg: '1024px',  // Desktop
  xl: '1280px',  // Large desktop
  '2xl': '1536px' // Extra large
};
```

### Layout Patterns
```tsx
// Grid that adapts from 1 to 4 columns
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>

// Mobile navigation (bottom) vs Desktop (side/top)
<nav className="fixed bottom-0 left-0 right-0 md:relative md:top-0">
  {/* Navigation items */}
</nav>
```

---

## ⚡ Animation Guidelines

### Entrance Animations
```tsx
// Stagger children
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

<motion.div variants={container} initial="hidden" animate="show">
  {items.map(i => <motion.div key={i.id} variants={item} />)}
</motion.div>
```

### Micro-interactions
```tsx
// Button hover/tap
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ duration: 0.15 }}
/>

// Like animation
<motion.button
  whileTap={{ scale: 1.3 }}
  animate={isLiked ? { scale: [1, 1.3, 1] } : {}}
>
  <HeartIcon className={isLiked ? 'text-red-500 fill-current' : 'text-slate-400'} />
</motion.button>
```

### Loading States
```tsx
// Skeleton loading
<div className="animate-pulse">
  <div className="bg-slate-200 h-4 w-3/4 rounded" />
  <div className="bg-slate-200 h-4 w-1/2 rounded mt-2" />
</div>

// Spinner
<motion.div
  animate={{ rotate: 360 }}
  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
  className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full"
/>
```

---

## 🔄 Data Fetching Patterns

### Server Components (Default)
```tsx
// app/subcrews/page.tsx
async function SubCrewsPage() {
  const session = await getServerSession(authOptions);
  const subCrews = await prisma.subCrew.findMany({
    where: { members: { some: { userId: session!.user.id } } },
    include: { topic: true, members: { include: { user: true } } },
    take: 20
  });

  return <SubCrewGrid subCrews={subCrews} />;
}
```

### Client Components (Interactivity)
```tsx
'use client';

function ImInButton({ subCrewId }: { subCrewId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['subcrew', subCrewId],
    queryFn: () => fetch(`/api/subcrews/${subCrewId}`).then(r => r.json())
  });

  // ... I'm in / coordination UI
}
```

### Optimistic Updates
```tsx
const rsvpMutation = useMutation({
  mutationFn: (meetupId: string) =>
    fetch(`/api/meetups/${meetupId}/rsvp`, { method: 'POST', body: JSON.stringify({ status: 'YES' }) }),
  onMutate: async (meetupId) => {
    await queryClient.cancelQueries(['meetup', meetupId]);
    const previous = queryClient.getQueryData(['meetup', meetupId]);
    queryClient.setQueryData(['meetup', meetupId], (old: Meetup) => ({
      ...old,
      attendeeCount: old.attendeeCount + 1,
      myRsvp: 'YES'
    }));
    return { previous };
  },
  onError: (err, meetupId, context) => {
    queryClient.setQueryData(['meetup', meetupId], context?.previous);
  }
});
```

---

## ✅ Accessibility Requirements

### ARIA Patterns
```tsx
// Modal
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Create Meetup</h2>
</div>

// Live regions for updates
<div aria-live="polite" aria-atomic="true">
  {notification && <p>{notification.message}</p>}
</div>

// Button states
<button 
  aria-pressed={isActive}
  aria-disabled={isLoading}
  disabled={isLoading}
/>
```

### Focus Management
```tsx
// Focus trap in modals
import { FocusTrap } from '@headlessui/react';

// Focus on open
useEffect(() => {
  if (isOpen) {
    inputRef.current?.focus();
  }
}, [isOpen]);

// Skip links
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

---

## 📋 Component Checklist

Before submitting any component:

- [ ] Works without JavaScript (progressive enhancement)
- [ ] Keyboard navigable
- [ ] Screen reader friendly
- [ ] Touch targets 44x44px minimum
- [ ] Loading state implemented
- [ ] Error state implemented
- [ ] Empty state implemented
- [ ] Responsive on all breakpoints
- [ ] Animations respect prefers-reduced-motion
- [ ] Dark mode compatible (if applicable)
- [ ] TypeScript types complete
- [ ] Storybook story created (future)

---

## 🎯 Priority UI Work (Phase 8 launch readiness, 2026-05-19)

### In flight
- [ ] RichFeedItem final size reduction (717→199 trajectory, now ~199 on nightly branch)
- [ ] Heatmap polish — Crew tier (R22) + FoF tier; venue markers at z=15; anchor priority 1/3/4 wired (priority 2 deferred)
- [ ] PrivacyPickerModal — location visibility opt-in across check-in / heatmap entry points

### Next
- [ ] SubCrew coordination panel — clearer "who's in, when, where" state
- [ ] Meetup detail page — RSVP-first hierarchy, venue map embed
- [ ] Onboarding — get user to first Crew + first Intent inside 90 seconds

### Out of scope (do not propose)
- AI chat / suggestions UI (removed PR #65)
- Trip planner / itinerary / wizard UI (archived to `src/components/_archive/`)
- Stories, reactions beyond like, gamification badges — explicitly cut from V1

---

*Make every interaction the shortest path out of the app.*

*Last Updated: 2026-05-19*

