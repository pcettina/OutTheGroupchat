# 🎨 Frontend Development Agent Guide

## Mission Statement
> "A social network that not just showcases experiences, but helps you build them."

**Your Role:** Create beautiful, engaging interfaces that make sharing experiences and planning trips feel magical.

---

## 🎯 Design Philosophy

### 1. Social-First Interactions
Every screen should encourage connection:
- Show who else is involved
- Make sharing obvious and delightful
- Celebrate group achievements
- Show activity and engagement

### 2. Experience-Building Focus
Make planning feel like an experience itself:
- Progressive disclosure (not overwhelming)
- AI assistance should feel conversational
- Gamify the planning process
- Celebrate milestones

### 3. Mobile-First, Always
60%+ of social usage is mobile:
- Touch-friendly targets (44px min)
- Swipe gestures where appropriate
- Optimized for thumb zones
- Fast loading on slow connections

---

## 🛠️ Tech Stack

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
TanStack Query (server state)
React Context (UI state)
URL State (filters, pagination)

// Components (to add)
Radix UI (accessible primitives)
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

## 🧩 Component Patterns

### Card Component
```tsx
// Social-aware card with engagement metrics
interface TripCardProps {
  trip: Trip;
  showEngagement?: boolean;
  onShare?: () => void;
}

export function TripCard({ trip, showEngagement = true, onShare }: TripCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="group relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
    >
      {/* Cover Image */}
      <div className="aspect-[16/9] relative">
        <Image src={trip.coverImage} alt={trip.title} fill className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Status Badge */}
        <StatusBadge status={trip.status} className="absolute top-3 left-3" />
        
        {/* Share Button */}
        <button
          onClick={onShare}
          className="absolute top-3 right-3 p-2 rounded-full bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ShareIcon className="w-4 h-4 text-white" />
        </button>
      </div>
      
      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-slate-900">{trip.title}</h3>
        <p className="text-sm text-slate-500">{trip.destination.city}, {trip.destination.country}</p>
        
        {/* Engagement */}
        {showEngagement && (
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <UsersIcon className="w-4 h-4" />
              {trip.memberCount}
            </span>
            <span className="flex items-center gap-1">
              <HeartIcon className="w-4 h-4" />
              {trip.likeCount}
            </span>
            <span className="flex items-center gap-1">
              <ChatIcon className="w-4 h-4" />
              {trip.commentCount}
            </span>
          </div>
        )}
        
        {/* Avatar Stack */}
        <AvatarStack users={trip.members} max={4} className="mt-3" />
      </div>
    </motion.div>
  );
}
```

### Feed Item Component
```tsx
// Dynamic feed item based on type
export function FeedItem({ item }: { item: FeedItemType }) {
  const renderContent = () => {
    switch (item.type) {
      case 'trip_created':
        return <TripCreatedCard trip={item.trip} />;
      case 'activity_added':
        return <ActivityCard activity={item.activity} />;
      case 'member_joined':
        return <MemberJoinedCard member={item.user} trip={item.trip} />;
      case 'review_posted':
        return <ReviewCard review={item.review} />;
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

### AI Chat Component Pattern
```tsx
// Floating AI assistant with context awareness
export function AIAssistant({ context }: { context?: TripContext }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg"
      >
        <SparklesIcon className="w-6 h-6" />
      </motion.button>
      
      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 w-96 h-[32rem] bg-white rounded-2xl shadow-2xl flex flex-col"
          >
            {/* Chat implementation */}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

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
// app/trips/page.tsx
async function TripsPage() {
  const trips = await prisma.trip.findMany({
    where: { isPublic: true },
    take: 20
  });
  
  return <TripGrid trips={trips} />;
}
```

### Client Components (Interactivity)
```tsx
'use client';

function InteractiveTrip({ tripId }: { tripId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetch(`/api/trips/${tripId}`).then(r => r.json())
  });
  
  // ... interactive UI
}
```

### Optimistic Updates
```tsx
const likeMutation = useMutation({
  mutationFn: (tripId: string) => fetch(`/api/trips/${tripId}/like`, { method: 'POST' }),
  onMutate: async (tripId) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries(['trip', tripId]);
    
    // Snapshot previous value
    const previous = queryClient.getQueryData(['trip', tripId]);
    
    // Optimistically update
    queryClient.setQueryData(['trip', tripId], (old: Trip) => ({
      ...old,
      likeCount: old.likeCount + 1,
      isLiked: true
    }));
    
    return { previous };
  },
  onError: (err, tripId, context) => {
    // Rollback on error
    queryClient.setQueryData(['trip', tripId], context?.previous);
  }
});
```

---

## ✅ Accessibility Requirements

### ARIA Patterns
```tsx
// Modal
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Create Trip</h2>
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

## 🎯 Priority UI Features

### Sprint 1
- [ ] Rich feed with media
- [ ] Reaction/like system
- [ ] Share cards with previews
- [ ] Improved AI chat UI

### Sprint 2
- [ ] Profile redesign
- [ ] Trip detail page overhaul
- [ ] Voting UI improvements
- [ ] Notification center

### Sprint 3
- [ ] Discovery/explore page
- [ ] Search with filters
- [ ] Settings pages
- [ ] Onboarding flow

---

*Make every interaction feel like the start of an adventure.*

*Last Updated: December 2024*

