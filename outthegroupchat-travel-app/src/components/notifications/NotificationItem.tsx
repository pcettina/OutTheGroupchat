'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import {
  motion,
  useAnimationControls,
  useReducedMotion,
  type PanInfo,
} from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Clock,
  Info,
  Mail,
  MapPin,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { triggerHaptic } from '@/lib/motion';

// Matches Prisma `NotificationType` enum (prisma/schema.prisma). Uppercase values arrive
// verbatim from the API — don't re-case on the client.
export type NotificationType =
  | 'CREW_REQUEST'
  | 'CREW_ACCEPTED'
  | 'MEETUP_INVITED'
  | 'MEETUP_RSVP'
  | 'MEETUP_STARTING_SOON'
  | 'CHECK_IN_NEARBY'
  | 'CREW_CHECKED_IN_NEARBY'
  | 'SYSTEM';

interface NotificationItemProps {
  notification: {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
    actionUrl?: string;
    sender?: {
      id: string;
      name: string;
      image?: string;
    };
    metadata?: {
      meetupId?: string;
      meetupTitle?: string;
      checkInId?: string;
      venueName?: string;
    };
  };
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

// Last Call role-color mapping (brief §3) — kept coarse intentionally so a notification
// reads as a *kind* of event, not a specific one. Crew-scope → tile; Meetup → sodium;
// Check-in → bourbon; System → neutral.
type TypeConfig = {
  icon: LucideIcon;
  ringClass: string; // bg tint + text tint on the badge/avatar footer
};

const TYPE_CONFIG: Record<NotificationType, TypeConfig> = {
  CREW_REQUEST: {
    icon: UserPlus,
    ringClass: 'bg-otg-tile/15 text-otg-tile ring-1 ring-inset ring-otg-tile/30',
  },
  CREW_ACCEPTED: {
    icon: UserCheck,
    ringClass: 'bg-otg-tile/15 text-otg-tile ring-1 ring-inset ring-otg-tile/30',
  },
  MEETUP_INVITED: {
    icon: Mail,
    ringClass: 'bg-otg-sodium/15 text-otg-sodium ring-1 ring-inset ring-otg-sodium/30',
  },
  MEETUP_RSVP: {
    icon: Users,
    ringClass: 'bg-otg-sodium/15 text-otg-sodium ring-1 ring-inset ring-otg-sodium/30',
  },
  MEETUP_STARTING_SOON: {
    icon: Clock,
    ringClass: 'bg-otg-sodium/15 text-otg-sodium ring-1 ring-inset ring-otg-sodium/30',
  },
  CHECK_IN_NEARBY: {
    icon: MapPin,
    ringClass: 'bg-otg-bourbon/15 text-otg-bourbon ring-1 ring-inset ring-otg-bourbon/30',
  },
  CREW_CHECKED_IN_NEARBY: {
    icon: MapPin,
    ringClass: 'bg-otg-bourbon/15 text-otg-bourbon ring-1 ring-inset ring-otg-bourbon/30',
  },
  SYSTEM: {
    icon: Info,
    ringClass: 'bg-otg-bg-dark text-otg-text-dim ring-1 ring-inset ring-otg-border',
  },
};

const FALLBACK_CONFIG = TYPE_CONFIG.SYSTEM;

// Swipe-Dismiss with Detent — brief §6 signature micro-interaction #3.
// Card follows finger 1:1 (no drag constraints; momentum off). At 35% of the viewport
// width the detent fires once per gesture via `navigator.vibrate(6)` — the haptic
// teaches gesture threshold without a tutorial (Linear issue swipe + iOS Mail pattern).
// Past threshold: snap off-screen with a neutral spring, fade to 0, then delete.
// Below threshold: spring back to rest with a slight overshoot.
const DISMISS_THRESHOLD_PCT = 0.35;
const EXIT_SPRING = { type: 'spring', visualDuration: 0.22, bounce: 0 } as const;
const RETURN_SPRING = { type: 'spring', visualDuration: 0.22, bounce: 0.4 } as const;
const SSR_FALLBACK_WIDTH = 400;

export function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
}: NotificationItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const queryClient = useQueryClient();
  const config = TYPE_CONFIG[notification.type] ?? FALLBACK_CONFIG;
  const Icon = config.icon;

  const shouldReduceMotion = useReducedMotion();
  const controls = useAnimationControls();
  const thresholdCrossedRef = useRef(false);

  const markReadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      if (!response.ok) throw new Error('Failed to mark as read');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onMarkRead?.(notification.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete notification');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onDelete?.(notification.id);
    },
  });

  const handleClick = () => {
    // Drag + click disambiguation — Framer's drag gesture normally suppresses clicks
    // past its internal threshold, but when a drag is in flight we still guard here
    // so a gesture that hovered near the start point doesn't silently mark-as-read.
    if (isDragging) return;
    if (!notification.read) {
      markReadMutation.mutate();
    }
  };

  const getThreshold = () => {
    if (typeof window === 'undefined') return SSR_FALLBACK_WIDTH * DISMISS_THRESHOLD_PCT;
    return window.innerWidth * DISMISS_THRESHOLD_PCT;
  };

  const handleDrag = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const past = Math.abs(info.offset.x) >= getThreshold();
    if (past && !thresholdCrossedRef.current) {
      thresholdCrossedRef.current = true;
      triggerHaptic('swipe-dismiss');
    } else if (!past && thresholdCrossedRef.current) {
      // Allow the haptic to re-fire if the user drags past, back under, then past again.
      thresholdCrossedRef.current = false;
    }
  };

  const handleDragEnd = async (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const past = Math.abs(info.offset.x) >= getThreshold();

    if (past) {
      const direction = info.offset.x < 0 ? -1 : 1;
      const viewport =
        typeof window !== 'undefined' ? window.innerWidth : SSR_FALLBACK_WIDTH;
      // Snap off the edge, fade to 0, then fire the delete mutation. The card stays
      // off-screen during the network round-trip; when React Query invalidates the
      // list, AnimatePresence's exit runs on an invisible element (opacity already 0),
      // so there's no second visible animation.
      await controls.start({
        x: direction * viewport,
        opacity: 0,
        transition: EXIT_SPRING,
      });
      deleteMutation.mutate();
    } else {
      thresholdCrossedRef.current = false;
      await controls.start({
        x: 0,
        opacity: 1,
        transition: RETURN_SPRING,
      });
    }
    setIsDragging(false);
  };

  // Reduced-motion users skip the drag gesture entirely — they still have the delete
  // button in the hover-actions row. Haptics and motion are independently disabled by
  // users at the OS level (brief §6).
  const canSwipe = !shouldReduceMotion;

  const content = (
    <motion.div
      drag={canSwipe ? 'x' : false}
      dragMomentum={false}
      onDragStart={() => setIsDragging(true)}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      animate={controls}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={isDragging ? undefined : { scale: 1.005 }}
      onClick={handleClick}
      className={[
        'relative rounded-xl border transition-colors select-none',
        canSwipe ? 'touch-pan-y' : '',
        notification.read
          ? 'bg-otg-maraschino border-otg-border'
          : 'bg-otg-maraschino border-otg-sodium/40',
        canSwipe && isDragging ? 'cursor-grabbing' : 'cursor-pointer',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Unread indicator — sodium rail on the left edge */}
      {!notification.read && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-otg-sodium rounded-r-full" />
      )}

      <div className="p-4 flex items-start gap-3">
        {/* Sender avatar (if present) with a type badge; otherwise show the type icon at full size */}
        {notification.sender ? (
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-otg-bg-dark border border-otg-border flex items-center justify-center text-otg-text-bright font-semibold overflow-hidden">
              {notification.sender.image ? (
                <Image
                  src={notification.sender.image}
                  alt={notification.sender.name}
                  width={40}
                  height={40}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                notification.sender.name.charAt(0)
              )}
            </div>
            <span
              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${config.ringClass} flex items-center justify-center`}
              aria-hidden="true"
            >
              <Icon className="w-3 h-3" />
            </span>
          </div>
        ) : (
          <div
            className={`w-10 h-10 rounded-full ${config.ringClass} flex items-center justify-center`}
            aria-hidden="true"
          >
            <Icon className="w-5 h-5" />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-w-0">
          <p
            className={
              notification.read
                ? 'font-medium text-otg-text-dim'
                : 'font-semibold text-otg-text-bright'
            }
          >
            {notification.title}
          </p>
          <p className="text-sm text-otg-text-dim line-clamp-2 mt-0.5">
            {notification.message}
          </p>
          <p className="text-xs text-otg-text-dim/80 mt-1">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>

        {/* Hover actions */}
        <div
          className={`flex items-center gap-1 transition-opacity ${
            isHovered && !isDragging ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {!notification.read && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                markReadMutation.mutate();
              }}
              aria-label="Mark as read"
              className="p-1.5 text-otg-text-dim hover:text-otg-sodium hover:bg-otg-bg-dark/60 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteMutation.mutate();
            }}
            aria-label="Delete notification"
            className="p-1.5 text-otg-text-dim hover:text-otg-danger hover:bg-otg-bg-dark/60 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </motion.div>
  );

  if (notification.actionUrl) {
    return <Link href={notification.actionUrl}>{content}</Link>;
  }

  return content;
}

export default NotificationItem;
