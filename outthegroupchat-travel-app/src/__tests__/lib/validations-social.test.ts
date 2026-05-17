/**
 * Unit tests for src/lib/validations/social.ts.
 *
 * Covers every exported Zod schema in the social-validations module:
 *   - CrewRequestSchema
 *   - CrewStatusUpdateSchema
 *   - MeetupCreateSchema
 *   - MeetupUpdateSchema
 *   - MeetupRsvpSchema
 *   - MeetupInviteSchema
 *   - CheckInCreateSchema
 *   - PollCreateSchema
 *   - PollResponseSchema
 *   - VenueSearchSchema
 *   - ProfileUpdateSchema
 *   - CrewLabelUpdateSchema
 *
 * For each schema we assert valid inputs, missing/invalid fields, boundary
 * lengths, enum membership, and default values.
 */

import { describe, it, expect } from 'vitest';
import {
  CrewRequestSchema,
  CrewStatusUpdateSchema,
  MeetupCreateSchema,
  MeetupUpdateSchema,
  MeetupRsvpSchema,
  MeetupInviteSchema,
  CheckInCreateSchema,
  PollCreateSchema,
  PollResponseSchema,
  VenueSearchSchema,
  ProfileUpdateSchema,
  CrewLabelUpdateSchema,
} from '@/lib/validations/social';

// Sample CUID (valid format) for tests
const CUID = 'ckqf8z4nq0000a1b2c3d4e5f6';
const CUID2 = 'ckqf8z4nq0000a1b2c3d4e5g7';
const FUTURE_ISO = '2030-01-01T12:00:00.000Z';
const FUTURE_ISO_2 = '2030-01-01T14:00:00.000Z';

describe('CrewRequestSchema', () => {
  it('accepts a valid CUID targetUserId', () => {
    const result = CrewRequestSchema.safeParse({ targetUserId: CUID });
    expect(result.success).toBe(true);
  });

  it('rejects when targetUserId is missing', () => {
    const result = CrewRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['targetUserId']);
    }
  });

  it('rejects a non-CUID string', () => {
    const result = CrewRequestSchema.safeParse({ targetUserId: 'not-a-cuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['targetUserId']);
    }
  });

  it('rejects a numeric targetUserId', () => {
    const result = CrewRequestSchema.safeParse({ targetUserId: 12345 });
    expect(result.success).toBe(false);
  });
});

describe('CrewStatusUpdateSchema', () => {
  it.each(['accept', 'decline', 'block'] as const)('accepts action=%s', (action) => {
    const result = CrewStatusUpdateSchema.safeParse({ action });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown action', () => {
    const result = CrewStatusUpdateSchema.safeParse({ action: 'archive' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['action']);
    }
  });

  it('rejects when action is missing', () => {
    const result = CrewStatusUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('MeetupCreateSchema', () => {
  it('accepts a minimal valid input and applies default visibility=CREW', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'Coffee meetup',
      scheduledAt: FUTURE_ISO,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe('CREW');
    }
  });

  it('accepts a full valid input', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'Drinks',
      description: 'Catch up after work',
      venueId: CUID,
      venueName: 'The Local',
      scheduledAt: FUTURE_ISO,
      endsAt: FUTURE_ISO_2,
      visibility: 'PUBLIC',
      capacity: 12,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title (min 1)', () => {
    const result = MeetupCreateSchema.safeParse({
      title: '',
      scheduledAt: FUTURE_ISO,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['title']);
    }
  });

  it('rejects title over 120 chars', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'x'.repeat(121),
      scheduledAt: FUTURE_ISO,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['title']);
    }
  });

  it('accepts title exactly 120 chars (boundary)', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'x'.repeat(120),
      scheduledAt: FUTURE_ISO,
    });
    expect(result.success).toBe(true);
  });

  it('rejects description over 500 chars', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'ok',
      description: 'x'.repeat(501),
      scheduledAt: FUTURE_ISO,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['description']);
    }
  });

  it('rejects non-datetime scheduledAt', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'ok',
      scheduledAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['scheduledAt']);
    }
  });

  it('rejects unknown visibility value', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'ok',
      scheduledAt: FUTURE_ISO,
      visibility: 'SECRET',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['visibility']);
    }
  });

  it('rejects capacity below min (2)', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'ok',
      scheduledAt: FUTURE_ISO,
      capacity: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['capacity']);
    }
  });

  it('rejects capacity above max (500)', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'ok',
      scheduledAt: FUTURE_ISO,
      capacity: 501,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer capacity', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'ok',
      scheduledAt: FUTURE_ISO,
      capacity: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects venueId that is not a CUID', () => {
    const result = MeetupCreateSchema.safeParse({
      title: 'ok',
      scheduledAt: FUTURE_ISO,
      venueId: 'plain-string',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['venueId']);
    }
  });
});

describe('MeetupUpdateSchema (partial of MeetupCreateSchema)', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = MeetupUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial input with only title', () => {
    const result = MeetupUpdateSchema.safeParse({ title: 'New title' });
    expect(result.success).toBe(true);
  });

  it('still rejects invalid types on partial fields', () => {
    const result = MeetupUpdateSchema.safeParse({ capacity: 1 });
    expect(result.success).toBe(false);
  });
});

describe('MeetupRsvpSchema', () => {
  it.each(['GOING', 'MAYBE', 'DECLINED'] as const)('accepts status=%s', (status) => {
    const result = MeetupRsvpSchema.safeParse({ status });
    expect(result.success).toBe(true);
  });

  it('rejects unknown status', () => {
    const result = MeetupRsvpSchema.safeParse({ status: 'YES' });
    expect(result.success).toBe(false);
  });

  it('rejects missing status', () => {
    const result = MeetupRsvpSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('MeetupInviteSchema', () => {
  it('accepts a single-user array', () => {
    const result = MeetupInviteSchema.safeParse({ userIds: [CUID] });
    expect(result.success).toBe(true);
  });

  it('accepts up to 50 user IDs', () => {
    const ids = Array.from({ length: 50 }, () => CUID);
    const result = MeetupInviteSchema.safeParse({ userIds: ids });
    expect(result.success).toBe(true);
  });

  it('rejects empty userIds array', () => {
    const result = MeetupInviteSchema.safeParse({ userIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['userIds']);
    }
  });

  it('rejects more than 50 user IDs', () => {
    const ids = Array.from({ length: 51 }, () => CUID);
    const result = MeetupInviteSchema.safeParse({ userIds: ids });
    expect(result.success).toBe(false);
  });

  it('rejects when any userId is not a CUID', () => {
    const result = MeetupInviteSchema.safeParse({ userIds: [CUID, 'bad-id'] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['userIds', 1]);
    }
  });
});

describe('CheckInCreateSchema', () => {
  it('accepts an empty object and applies default visibility=CREW', () => {
    const result = CheckInCreateSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe('CREW');
    }
  });

  it('accepts a full valid input', () => {
    const result = CheckInCreateSchema.safeParse({
      venueId: CUID,
      venueName: 'Cafe',
      note: 'hanging out',
      visibility: 'PUBLIC',
      latitude: 40.7,
      longitude: -74,
    });
    expect(result.success).toBe(true);
  });

  it('rejects note over 280 chars', () => {
    const result = CheckInCreateSchema.safeParse({ note: 'x'.repeat(281) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['note']);
    }
  });

  it('accepts note exactly 280 chars (boundary)', () => {
    const result = CheckInCreateSchema.safeParse({ note: 'x'.repeat(280) });
    expect(result.success).toBe(true);
  });

  it.each(['PUBLIC', 'CREW', 'PRIVATE'] as const)('accepts visibility=%s', (visibility) => {
    const result = CheckInCreateSchema.safeParse({ visibility });
    expect(result.success).toBe(true);
  });

  it('rejects unknown visibility', () => {
    const result = CheckInCreateSchema.safeParse({ visibility: 'CLOSE_CREW' });
    expect(result.success).toBe(false);
  });

  it('rejects non-number latitude', () => {
    const result = CheckInCreateSchema.safeParse({ latitude: '40.7' });
    expect(result.success).toBe(false);
  });
});

describe('PollCreateSchema', () => {
  const baseValid = {
    title: 'Where to eat?',
    type: 'VOTE' as const,
    options: [{ text: 'Pizza' }, { text: 'Tacos' }],
  };

  it('accepts a minimal valid poll', () => {
    const result = PollCreateSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
  });

  it.each(['SURVEY', 'VOTE', 'RSVP_POLL'] as const)('accepts type=%s', (type) => {
    const result = PollCreateSchema.safeParse({ ...baseValid, type });
    expect(result.success).toBe(true);
  });

  it('rejects fewer than 2 options', () => {
    const result = PollCreateSchema.safeParse({ ...baseValid, options: [{ text: 'Only one' }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['options']);
    }
  });

  it('rejects more than 10 options', () => {
    const options = Array.from({ length: 11 }, (_, i) => ({ text: `opt-${i}` }));
    const result = PollCreateSchema.safeParse({ ...baseValid, options });
    expect(result.success).toBe(false);
  });

  it('rejects empty option text', () => {
    const result = PollCreateSchema.safeParse({
      ...baseValid,
      options: [{ text: '' }, { text: 'Tacos' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects option text over 100 chars', () => {
    const result = PollCreateSchema.safeParse({
      ...baseValid,
      options: [{ text: 'x'.repeat(101) }, { text: 'Tacos' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects title over 200 chars', () => {
    const result = PollCreateSchema.safeParse({ ...baseValid, title: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('accepts optional meetupId as CUID', () => {
    const result = PollCreateSchema.safeParse({ ...baseValid, meetupId: CUID });
    expect(result.success).toBe(true);
  });

  it('rejects non-CUID meetupId', () => {
    const result = PollCreateSchema.safeParse({ ...baseValid, meetupId: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects malformed expiresAt', () => {
    const result = PollCreateSchema.safeParse({ ...baseValid, expiresAt: 'soon' });
    expect(result.success).toBe(false);
  });
});

describe('PollResponseSchema', () => {
  it('accepts one option', () => {
    const result = PollResponseSchema.safeParse({ optionIds: [CUID] });
    expect(result.success).toBe(true);
  });

  it('accepts multiple options', () => {
    const result = PollResponseSchema.safeParse({ optionIds: [CUID, CUID2] });
    expect(result.success).toBe(true);
  });

  it('rejects empty optionIds', () => {
    const result = PollResponseSchema.safeParse({ optionIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects non-CUID entries', () => {
    const result = PollResponseSchema.safeParse({ optionIds: ['not-a-cuid'] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['optionIds', 0]);
    }
  });
});

describe('VenueSearchSchema', () => {
  it('accepts minimal input and applies default radius=5', () => {
    const result = VenueSearchSchema.safeParse({ query: 'coffee' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.radius).toBe(5);
    }
  });

  it('accepts full input with category', () => {
    const result = VenueSearchSchema.safeParse({
      query: 'wine',
      city: 'NYC',
      latitude: 40.7,
      longitude: -74,
      radius: 10,
      category: 'BAR',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty query', () => {
    const result = VenueSearchSchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('rejects query over 100 chars', () => {
    const result = VenueSearchSchema.safeParse({ query: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects radius below 0.1', () => {
    const result = VenueSearchSchema.safeParse({ query: 'x', radius: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects radius above 50', () => {
    const result = VenueSearchSchema.safeParse({ query: 'x', radius: 50.1 });
    expect(result.success).toBe(false);
  });

  it.each(['BAR', 'COFFEE', 'RESTAURANT', 'PARK', 'GYM', 'COWORKING', 'OTHER'] as const)(
    'accepts category=%s',
    (category) => {
      const result = VenueSearchSchema.safeParse({ query: 'x', category });
      expect(result.success).toBe(true);
    },
  );

  it('rejects unknown category', () => {
    const result = VenueSearchSchema.safeParse({ query: 'x', category: 'CLUB' });
    expect(result.success).toBe(false);
  });
});

describe('ProfileUpdateSchema', () => {
  it('accepts an empty object (all optional)', () => {
    const result = ProfileUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a full valid input', () => {
    const result = ProfileUpdateSchema.safeParse({
      name: 'Pat',
      bio: 'hello there',
      city: 'NYC',
      image: 'https://example.com/avatar.png',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name (min 1)', () => {
    const result = ProfileUpdateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 100 chars', () => {
    const result = ProfileUpdateSchema.safeParse({ name: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects bio over 300 chars', () => {
    const result = ProfileUpdateSchema.safeParse({ bio: 'x'.repeat(301) });
    expect(result.success).toBe(false);
  });

  it('rejects city over 100 chars', () => {
    const result = ProfileUpdateSchema.safeParse({ city: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects non-URL image', () => {
    const result = ProfileUpdateSchema.safeParse({ image: 'not-a-url' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['image']);
    }
  });
});

describe('CrewLabelUpdateSchema', () => {
  it('accepts a valid alphanumeric label', () => {
    const result = CrewLabelUpdateSchema.safeParse({ label: 'Close Friends 1' });
    expect(result.success).toBe(true);
  });

  it('accepts null (label cleared)', () => {
    const result = CrewLabelUpdateSchema.safeParse({ label: null });
    expect(result.success).toBe(true);
  });

  it('rejects empty label string', () => {
    const result = CrewLabelUpdateSchema.safeParse({ label: '' });
    expect(result.success).toBe(false);
  });

  it('rejects label over 20 chars', () => {
    const result = CrewLabelUpdateSchema.safeParse({ label: 'x'.repeat(21) });
    expect(result.success).toBe(false);
  });

  it('accepts label exactly 20 chars (boundary)', () => {
    const result = CrewLabelUpdateSchema.safeParse({ label: 'x'.repeat(20) });
    expect(result.success).toBe(true);
  });

  it('rejects label with special characters', () => {
    const result = CrewLabelUpdateSchema.safeParse({ label: 'Friends!' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['label']);
    }
  });

  it('rejects missing label key', () => {
    const result = CrewLabelUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
