'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Calendar, MapPin, Users, Eye, Mail, XCircle } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { RSVPButton } from '@/components/meetups/RSVPButton';
import AttendeeList from '@/components/meetups/AttendeeList';
import MeetupInviteModal from '@/components/meetups/MeetupInviteModal';
import { getPusherClient } from '@/lib/pusher';
import type { AttendeeResponse, AttendeeStatus, MeetupVisibility } from '@/types/meetup';

// Local types — inline shape matching what GET /api/meetups/[id] actually
// returns (raw Prisma meetup row + host, venue, attendees, invitesCount,
// myRsvpStatus). There is no `attendeeCount` field — use `attendees.length`.
interface UserMini { id: string; name: string | null; image: string | null; }
interface AttendeeMini {
  id: string; meetupId: string; userId: string; status: AttendeeStatus;
  checkedInAt: string | null; createdAt: string; updatedAt: string; user: UserMini;
}
interface VenueMini { id: string; name: string; address: string | null; city: string; }
interface MeetupDetailData {
  id: string; title: string; description: string | null;
  hostId: string; venueId: string | null; venueName: string | null;
  scheduledAt: string; endsAt: string | null;
  visibility: MeetupVisibility; capacity: number | null; cancelled: boolean;
  host: UserMini; venue: VenueMini | null; attendees: AttendeeMini[];
  invitesCount: number; myRsvpStatus: AttendeeStatus | null;
}
interface ApiResponse { success: boolean; data?: MeetupDetailData; error?: string; }

// Last Call palette — brief §3. Mirrors MeetupCard's VISIBILITY_LABELS so a meetup reads
// the same here as in the feed: Crew → tile; Public → sodium; Invite only → bourbon;
// Private → warm-black neutral.
const VISIBILITY_LABELS: Record<string, { label: string; classes: string }> = {
  PUBLIC: {
    label: 'Public',
    classes: 'bg-otg-sodium/15 text-otg-sodium ring-1 ring-inset ring-otg-sodium/30',
  },
  CREW: {
    label: 'Crew',
    classes: 'bg-otg-tile/15 text-otg-tile ring-1 ring-inset ring-otg-tile/30',
  },
  INVITE_ONLY: {
    label: 'Invite only',
    classes: 'bg-otg-bourbon/15 text-otg-bourbon ring-1 ring-inset ring-otg-bourbon/30',
  },
  PRIVATE: {
    label: 'Private',
    classes: 'bg-otg-bg-dark text-otg-text-dim ring-1 ring-inset ring-otg-border',
  },
};

const PUSHER_EVENTS = ['attendee:joined', 'attendee:left', 'meetup:updated', 'meetup:cancelled'] as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-otg-bg-dark">
      <Navigation />
      <div className="pt-20 pb-12">
        <div className="max-w-3xl mx-auto px-4 space-y-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Page component ──────────────────────────────────────────────────────────

export default function MeetupDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [meetup, setMeetup] = useState<MeetupDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetchMeetup = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErrorStatus(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/meetups/${id}`);
      const body = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!res.ok || !body?.success || !body.data) {
        setErrorStatus(res.status);
        setErrorMessage(body?.error ?? 'Failed to load meetup');
        setMeetup(null);
        return;
      }
      setMeetup(body.data);
    } catch (err) {
      setErrorStatus(0);
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
      setMeetup(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial load + reload when id changes
  useEffect(() => {
    void fetchMeetup();
  }, [fetchMeetup]);

  // Pusher subscription — refetch on any relevant event
  useEffect(() => {
    if (!id) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const channelName = `meetup-${id}`;
    const channel = pusher.subscribe(channelName);

    const handler = () => {
      void fetchMeetup();
    };

    PUSHER_EVENTS.forEach((evt) => channel.bind(evt, handler));

    return () => {
      PUSHER_EVENTS.forEach((evt) => channel.unbind(evt, handler));
      pusher.unsubscribe(channelName);
    };
  }, [id, fetchMeetup]);

  const handleCancel = useCallback(async () => {
    if (!id) return;
    if (!window.confirm('Cancel this meetup? Attendees will be notified.')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/meetups/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Couldn\u2019t cancel. Try again.');
      }
      router.push('/meetups');
    } catch (err) {
      setCancelling(false);
      window.alert(err instanceof Error ? err.message : 'Couldn\u2019t cancel. Try again.');
    }
  }, [id, router]);

  // ── Loading / session-loading skeleton ─────────────────────────────────────
  if (sessionStatus === 'loading' || (loading && !meetup && !errorStatus)) {
    return (
      <Shell>
        <div className="rounded-2xl border border-otg-border bg-otg-maraschino p-6 animate-pulse">
          <div className="h-7 w-2/3 bg-otg-bg-dark/60 rounded mb-3" />
          <div className="h-4 w-full bg-otg-bg-dark/60 rounded mb-2" />
          <div className="h-4 w-1/2 bg-otg-bg-dark/60 rounded mb-6" />
          <div className="space-y-2">
            <div className="h-4 w-1/3 bg-otg-bg-dark/60 rounded" />
            <div className="h-4 w-1/4 bg-otg-bg-dark/60 rounded" />
            <div className="h-4 w-1/3 bg-otg-bg-dark/60 rounded" />
          </div>
        </div>
      </Shell>
    );
  }

  // ── Error states ───────────────────────────────────────────────────────────
  if (errorStatus === 401) {
    return (
      <Shell>
        <div className="rounded-2xl border border-otg-border bg-otg-maraschino p-10 text-center">
          <p className="text-otg-text-bright mb-4">
            Sign in to see this meetup.
          </p>
          <Link
            href="/auth/signin"
            className="inline-flex items-center rounded-full bg-otg-sodium hover:bg-otg-sodium-400 active:bg-otg-brick text-otg-bg-dark px-4 py-2 text-sm font-medium transition-colors"
          >
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  if (errorStatus === 404) {
    return (
      <Shell>
        <div className="rounded-2xl border border-otg-border bg-otg-maraschino p-10 text-center">
          <p className="text-otg-text-bright mb-4">Meetup not found.</p>
          <Link
            href="/meetups"
            className="inline-flex items-center rounded-full bg-otg-sodium hover:bg-otg-sodium-400 active:bg-otg-brick text-otg-bg-dark px-4 py-2 text-sm font-medium transition-colors"
          >
            Back to meetups
          </Link>
        </div>
      </Shell>
    );
  }

  if (errorStatus !== null || !meetup) {
    return (
      <Shell>
        <div className="rounded-2xl border border-otg-danger/30 bg-otg-danger/10 text-otg-text-bright p-6 text-center">
          <p className="mb-4">{errorMessage ?? 'That didn\u2019t go through. Try again.'}</p>
          <button
            type="button"
            onClick={() => void fetchMeetup()}
            className="inline-flex items-center rounded-full bg-otg-danger hover:bg-otg-danger/80 text-otg-text-bright px-4 py-2 text-sm font-medium transition-colors"
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  // ── Loaded meetup ──────────────────────────────────────────────────────────
  const isHost = !!session?.user?.id && session.user.id === meetup.hostId;
  const vis = VISIBILITY_LABELS[meetup.visibility] ?? {
    label: meetup.visibility,
    classes: 'bg-otg-bg-dark text-otg-text-dim ring-1 ring-inset ring-otg-border',
  };
  const venueLabel = meetup.venueName ?? meetup.venue?.name ?? null;
  const attendeeCount = meetup.attendees.length;

  // The route returns user shape {id, name, image} — AttendeeList expects
  // UserPreview which also has `city`. Map to the richer shape with city=null.
  const attendeesForList: AttendeeResponse[] = meetup.attendees.map((a) => ({
    id: a.id,
    meetupId: a.meetupId,
    userId: a.userId,
    status: a.status,
    checkedInAt: a.checkedInAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    user: {
      id: a.user.id,
      name: a.user.name,
      image: a.user.image,
      city: null,
    },
  }));

  return (
    <Shell>
      {meetup.cancelled && (
        <div
          role="alert"
          className="rounded-2xl border border-otg-danger/30 bg-otg-danger/10 text-otg-text-bright p-4 flex items-center gap-3"
        >
          <XCircle className="w-5 h-5 shrink-0 text-otg-danger" aria-hidden="true" />
          <div>
            <p className="font-semibold">This meetup is cancelled.</p>
            <p className="text-sm text-otg-text-dim">No new RSVPs.</p>
          </div>
        </div>
      )}

      {/* Header card */}
      <div className="rounded-2xl border border-otg-border bg-otg-maraschino p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold text-otg-text-bright leading-snug">
              {meetup.title}
            </h1>
            {meetup.description && (
              <p className="text-otg-text-dim mt-2 whitespace-pre-wrap">
                {meetup.description}
              </p>
            )}
          </div>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${vis.classes}`}
          >
            {vis.label}
          </span>
        </div>

        <dl className="space-y-2 text-sm text-otg-text-dim">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 shrink-0 text-otg-text-dim" aria-hidden="true" />
            <span>
              {formatDateTime(meetup.scheduledAt)}
              {meetup.endsAt && <>{' \u2013 '}{formatDateTime(meetup.endsAt)}</>}
            </span>
          </div>
          {venueLabel && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0 text-otg-text-dim" aria-hidden="true" />
              <span className="truncate">{venueLabel}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 shrink-0 text-otg-text-dim" aria-hidden="true" />
            <span>
              {attendeeCount} {attendeeCount === 1 ? 'attendee' : 'attendees'}
              {meetup.capacity !== null && ` / ${meetup.capacity} capacity`}
            </span>
          </div>
        </dl>

        {/* Host strip */}
        <div className="mt-5 pt-4 border-t border-otg-border flex items-center gap-2">
          <div className="w-7 h-7 rounded-full overflow-hidden bg-otg-bg-dark border border-otg-border flex items-center justify-center shrink-0">
            {meetup.host.image ? (
              <Image
                src={meetup.host.image}
                alt={meetup.host.name ?? 'Host'}
                width={28}
                height={28}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs font-semibold text-otg-text-dim">
                {meetup.host.name?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </div>
          <span className="text-xs text-otg-text-dim truncate">
            Hosted by{' '}
            <span className="font-medium text-otg-text-bright">
              {meetup.host.name ?? 'Anonymous'}
            </span>
          </span>
          <Eye
            className="w-3.5 h-3.5 shrink-0 text-otg-text-dim/60 ml-auto"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Action buttons */}
      {!isHost && !meetup.cancelled && (
        <div className="rounded-2xl border border-otg-border bg-otg-maraschino p-5">
          <h2 className="text-sm font-semibold text-otg-text-bright mb-3">Your RSVP</h2>
          <RSVPButton meetupId={meetup.id} currentStatus={meetup.myRsvpStatus} />
        </div>
      )}

      {isHost && !meetup.cancelled && (
        <div className="rounded-2xl border border-otg-border bg-otg-maraschino p-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-otg-sodium hover:bg-otg-sodium-400 active:bg-otg-brick text-otg-bg-dark px-4 py-2 text-sm font-medium transition-colors"
          >
            <Mail className="w-4 h-4" aria-hidden="true" />
            Invite Crew
          </button>
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={cancelling}
            className="inline-flex items-center gap-2 rounded-full bg-otg-danger hover:bg-otg-danger/80 text-otg-text-bright px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <XCircle className="w-4 h-4" aria-hidden="true" />
            {cancelling ? 'Cancelling\u2026' : 'Cancel meetup'}
          </button>
          <span className="ml-auto text-xs text-otg-text-dim">
            {meetup.invitesCount} {meetup.invitesCount === 1 ? 'invite' : 'invites'} sent
          </span>
        </div>
      )}

      {/* Attendees */}
      <div className="rounded-2xl border border-otg-border bg-otg-maraschino p-5">
        <h2 className="text-sm font-semibold text-otg-text-bright mb-4">Attendees</h2>
        <AttendeeList attendees={attendeesForList} hostId={meetup.hostId} />
      </div>

      {isHost && (
        <MeetupInviteModal
          meetupId={meetup.id}
          isOpen={inviteOpen}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </Shell>
  );
}
