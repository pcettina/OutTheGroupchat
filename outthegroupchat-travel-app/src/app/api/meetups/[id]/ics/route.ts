import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

type RouteParams = { params: { id: string } };

/**
 * Format a Date as an iCalendar UTC timestamp in basic format: yyyyMMddTHHmmssZ.
 * Always emits UTC ("Z" suffix) regardless of the host's local timezone.
 */
export function toIcsUtc(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}` +
    'T' +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}` +
    'Z'
  );
}

/**
 * Escape a string for use in an iCalendar TEXT value per RFC 5545 §3.3.11.
 * Backslash, semicolon and comma are backslash-escaped; newlines become "\n".
 */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n');
}

/**
 * Fold a content line to a maximum of 75 octets per RFC 5545 §3.1.
 * Continuation lines are prefixed with a single space. Folding is octet-aware
 * (UTF-8), never splitting a multi-byte character across a fold boundary.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) {
    return line;
  }

  const chunks: string[] = [];
  let start = 0;
  // First line allows 75 octets; continuation lines allow 74 (1 octet is the
  // leading space that marks the fold).
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off so we never cut in the middle of a UTF-8 continuation byte
    // (0x80-0xBF are continuation bytes).
    if (end < bytes.length) {
      while (end > start && (bytes[end] & 0xc0) === 0x80) {
        end--;
      }
    }
    chunks.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }

  return chunks.join('\r\n ');
}

/**
 * GET /api/meetups/[id]/ics
 * Return a downloadable RFC 5545 VCALENDAR file for a single meetup.
 * Access mirrors the GET /api/meetups/[id] visibility gate:
 *   - Host always (including cancelled).
 *   - PUBLIC: every authenticated user.
 *   - CREW: caller must have an ACCEPTED Crew record with the host.
 *   - INVITE_ONLY: caller must have a MeetupInvite row for this meetup.
 *   - PRIVATE: host only.
 * Cancelled meetups are hidden from non-hosts (404). The exported VEVENT carries
 * STATUS:CANCELLED when the meetup is cancelled, else STATUS:CONFIRMED.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `meetup-ics:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const { id } = params;
    const userId = session.user.id;

    const meetup = await prisma.meetup.findUnique({
      where: { id },
      include: {
        venue: true,
        host: { select: { id: true, name: true } },
      },
    });

    if (!meetup) {
      return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
    }

    const isHost = meetup.hostId === userId;

    // Cancelled meetups are hidden from everyone except the host.
    if (meetup.cancelled && !isHost) {
      return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
    }

    // Visibility gate for non-hosts (mirrors the GET /api/meetups/[id] handler).
    if (!isHost) {
      if (meetup.visibility === 'PRIVATE') {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }

      if (meetup.visibility === 'CREW') {
        const crewRecord = await prisma.crew.findFirst({
          where: {
            status: 'ACCEPTED',
            OR: [
              { userAId: userId, userBId: meetup.hostId },
              { userAId: meetup.hostId, userBId: userId },
            ],
          },
        });
        if (!crewRecord) {
          return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
      }

      if (meetup.visibility === 'INVITE_ONLY') {
        const invite = await prisma.meetupInvite.findUnique({
          where: { meetupId_userId: { meetupId: id, userId } },
        });
        if (!invite) {
          return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    // Resolve start/end. Fall back to a 2-hour block when endsAt is null.
    const dtStart = meetup.scheduledAt;
    const dtEnd =
      meetup.endsAt ?? new Date(meetup.scheduledAt.getTime() + 2 * 60 * 60 * 1000);

    // Compose LOCATION from venue name/override and address when present.
    const locationName = meetup.venueName ?? meetup.venue?.name ?? '';
    const locationParts = [locationName, meetup.venue?.address ?? '']
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const location = locationParts.join(', ');

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OutTheGroupchat//Meetup//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${meetup.id}@outthegroupchat`,
      `DTSTAMP:${toIcsUtc(new Date())}`,
      `DTSTART:${toIcsUtc(dtStart)}`,
      `DTEND:${toIcsUtc(dtEnd)}`,
      foldLine(`SUMMARY:${escapeIcsText(meetup.title)}`),
      foldLine(`DESCRIPTION:${escapeIcsText(meetup.description ?? '')}`),
    ];

    if (location.length > 0) {
      lines.push(foldLine(`LOCATION:${escapeIcsText(location)}`));
    }

    if (meetup.venue?.latitude != null && meetup.venue?.longitude != null) {
      lines.push(`GEO:${meetup.venue.latitude};${meetup.venue.longitude}`);
    }

    lines.push(`STATUS:${meetup.cancelled ? 'CANCELLED' : 'CONFIRMED'}`);
    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');

    const ics = lines.join('\r\n');

    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="meetup-${meetup.id}.ics"`,
      },
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[MEETUP_ICS] Failed to generate calendar');
    return NextResponse.json({ error: 'Failed to generate calendar' }, { status: 500 });
  }
}
