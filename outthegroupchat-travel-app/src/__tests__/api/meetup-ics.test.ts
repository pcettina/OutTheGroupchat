/**
 * Unit tests for GET /api/meetups/[id]/ics
 *
 * Route covered:
 *   GET /api/meetups/[id]/ics — downloadable RFC 5545 VCALENDAR for a meetup.
 *
 * Also directly exercises the exported ICS helpers (toIcsUtc, escapeIcsText,
 * foldLine).
 *
 * Global mocks (prisma, next-auth, sentry, logger) are applied in
 * src/__tests__/setup.ts. Rate-limit is mocked locally to prevent any real
 * Upstash calls (and to exercise the 429 path).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import {
  GET,
  toIcsUtc,
  escapeIcsText,
  foldLine,
} from '@/app/api/meetups/[id]/ics/route';
import { checkRateLimit } from '@/lib/rate-limit';

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const mockPrismaMeetup = prisma.meetup as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockPrismaCrew = prisma.crew as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
};
const mockPrismaMeetupInvite = prisma.meetupInvite as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const HOST_ID = 'user-host-001';
const OTHER_ID = 'user-other-002';
const MEETUP_ID = 'meetup-abc-123';

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

/** A meetup row as returned by prisma.meetup.findUnique with venue + host includes. */
const buildMeetup = (overrides: Record<string, unknown> = {}) => ({
  id: MEETUP_ID,
  hostId: HOST_ID,
  title: 'Test Meetup',
  description: 'A test meetup',
  venueName: null,
  scheduledAt: new Date('2027-01-01T18:00:00Z'),
  endsAt: new Date('2027-01-01T20:30:00Z'),
  visibility: 'PUBLIC',
  cancelled: false,
  host: { id: HOST_ID, name: 'Host User' },
  venue: null,
  ...overrides,
});

const makeReq = () =>
  new NextRequest(`http://localhost/api/meetups/${MEETUP_ID}/ics`, { method: 'GET' });
const params = { params: { id: MEETUP_ID } };

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm the permanent rate-limit pass-through mock after reset (known gotcha).
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
});

// ===========================================================================
// Exported helpers
// ===========================================================================
describe('ICS helpers', () => {
  it('toIcsUtc emits basic UTC format yyyyMMddTHHmmssZ', () => {
    expect(toIcsUtc(new Date('2027-01-01T18:00:00Z'))).toBe('20270101T180000Z');
    // Single-digit month/day/time components are zero-padded.
    expect(toIcsUtc(new Date('2027-03-05T04:07:09Z'))).toBe('20270305T040709Z');
  });

  it('escapeIcsText backslash-escapes comma, semicolon and backslash', () => {
    expect(escapeIcsText('Drinks, food; fun')).toBe('Drinks\\, food\\; fun');
    expect(escapeIcsText('a\\b')).toBe('a\\\\b');
  });

  it('escapeIcsText converts newlines to literal \\n', () => {
    expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2');
    expect(escapeIcsText('line1\r\nline2')).toBe('line1\\nline2');
  });

  it('foldLine leaves short lines untouched', () => {
    const short = 'SUMMARY:Hello';
    expect(foldLine(short)).toBe(short);
  });

  it('foldLine wraps lines longer than 75 octets with CRLF + space', () => {
    const long = 'SUMMARY:' + 'x'.repeat(120);
    const folded = foldLine(long);
    expect(folded).toContain('\r\n ');
    // Every physical line must be <= 75 octets.
    for (const physical of folded.split('\r\n')) {
      expect(Buffer.byteLength(physical, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});

// ===========================================================================
// GET /api/meetups/[id]/ics
// ===========================================================================
describe('GET /api/meetups/[id]/ics', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 429 when rate limit exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('returns 404 when meetup not found (non-host)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Meetup not found');
  });

  it('returns 200 for the host with correct headers and VCALENDAR body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetup());

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    const disposition = res.headers.get('Content-Disposition');
    expect(disposition).toContain('attachment');
    expect(disposition).toContain(`meetup-${MEETUP_ID}.ics`);

    const body = await res.text();
    expect(body.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(body.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(body).toContain('VERSION:2.0');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('END:VEVENT');
    expect(body).toContain(`UID:${MEETUP_ID}@outthegroupchat`);
    expect(body).toContain('DTSTART:20270101T180000Z');
    expect(body).toContain('DTEND:20270101T203000Z');
    expect(body).toContain('SUMMARY:Test Meetup');
    expect(body).toContain('STATUS:CONFIRMED');
  });

  it('emits STATUS:CANCELLED for a cancelled meetup (host can still fetch)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(
      buildMeetup({ cancelled: true })
    );

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('STATUS:CANCELLED');
  });

  it('falls back to scheduledAt + 2h for DTEND when endsAt is null', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetup({ endsAt: null }));

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('DTSTART:20270101T180000Z');
    // 18:00 + 2h = 20:00
    expect(body).toContain('DTEND:20270101T200000Z');
  });

  it('includes a GEO line only when venue latitude & longitude are both set', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(
      buildMeetup({
        venue: {
          name: 'Central Park',
          address: '5th Ave',
          latitude: 40.7829,
          longitude: -73.9654,
        },
      })
    );

    const res = await GET(makeReq(), params);
    const body = await res.text();
    expect(body).toContain('GEO:40.7829;-73.9654');
    expect(body).toContain('LOCATION:Central Park\\, 5th Ave');
  });

  it('omits the GEO line when venue coordinates are absent', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(
      buildMeetup({
        venue: { name: 'Central Park', address: null, latitude: null, longitude: null },
      })
    );

    const res = await GET(makeReq(), params);
    const body = await res.text();
    expect(body).not.toContain('GEO:');
  });

  it('backslash-escapes comma/semicolon in the SUMMARY title', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(
      buildMeetup({ title: 'Drinks, snacks; games' })
    );

    const res = await GET(makeReq(), params);
    const body = await res.text();
    expect(body).toContain('SUMMARY:Drinks\\, snacks\\; games');
  });

  it('returns 403 for a non-host on a PRIVATE meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(
      buildMeetup({ visibility: 'PRIVATE' })
    );

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 403 for a non-host on a CREW meetup with no accepted Crew record', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(
      buildMeetup({ visibility: 'CREW' })
    );
    mockPrismaCrew.findFirst.mockResolvedValueOnce(null);

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(403);
  });

  it('returns 200 for a non-host on a CREW meetup with an accepted Crew record', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(
      buildMeetup({ visibility: 'CREW' })
    );
    mockPrismaCrew.findFirst.mockResolvedValueOnce({
      id: 'crew-1',
      status: 'ACCEPTED',
    });

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
  });

  it('returns 404 for a non-host on a cancelled meetup (hidden before gate)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(
      buildMeetup({ cancelled: true, visibility: 'PUBLIC' })
    );

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-host on an INVITE_ONLY meetup with no invite', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(
      buildMeetup({ visibility: 'INVITE_ONLY' })
    );
    mockPrismaMeetupInvite.findUnique.mockResolvedValueOnce(null);

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(403);
  });
});
