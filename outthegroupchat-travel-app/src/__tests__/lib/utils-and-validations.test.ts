/**
 * Unit tests for:
 *  - src/lib/utils/costs.ts (pure cost-estimation helpers)
 *  - src/lib/validations/social.ts (Zod schemas for crews, meetups, check-ins, polls, venues, profile, crew label)
 *
 * Pure unit tests, no mocks required (no external deps invoked).
 */

import { describe, it, expect } from 'vitest';
import {
  calculateDailyCosts,
  calculateTripCost,
  suggestBudget,
  calculatePerPersonCost,
  estimateAccommodationCost,
} from '@/lib/utils/costs';
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

// A valid 25-char CUID for tests (cuid v1 format: c + 24 alphanumerics).
const CUID = 'ckpqjz1234567890abcdefghi';
const CUID2 = 'ckpqjz1234567890abcdefghj';

describe('lib/utils/costs', () => {
  describe('calculateDailyCosts', () => {
    it('returns the moderate tier breakdown by default', () => {
      const result = calculateDailyCosts();
      expect(result).toEqual({
        accommodation: 150,
        food: 60,
        activities: 50,
        transportation: 30,
        total: 290,
      });
    });

    it('returns the budget tier breakdown', () => {
      const result = calculateDailyCosts('budget');
      expect(result).toEqual({
        accommodation: 50,
        food: 30,
        activities: 20,
        transportation: 10,
        total: 110,
      });
    });

    it('returns the luxury tier breakdown', () => {
      const result = calculateDailyCosts('luxury');
      expect(result).toEqual({
        accommodation: 300,
        food: 100,
        activities: 100,
        transportation: 60,
        total: 560,
      });
    });

    it('total equals the sum of the four category costs for every tier', () => {
      for (const tier of ['budget', 'moderate', 'luxury'] as const) {
        const r = calculateDailyCosts(tier);
        expect(r.total).toBe(
          r.accommodation + r.food + r.activities + r.transportation,
        );
      }
    });
  });

  describe('calculateTripCost', () => {
    it('multiplies the daily moderate total by the number of days when no extras', () => {
      // 7 * 290 = 2030
      expect(calculateTripCost(7)).toBe(2030);
    });

    it('adds additional one-time costs on top of the daily total', () => {
      // 7 * 290 + 500 = 2530
      expect(calculateTripCost(7, 'moderate', 500)).toBe(2530);
    });

    it('honors the budget tier', () => {
      // 5 * 110 = 550
      expect(calculateTripCost(5, 'budget')).toBe(550);
    });

    it('honors the luxury tier with extras', () => {
      // 3 * 560 + 1200 = 2880
      expect(calculateTripCost(3, 'luxury', 1200)).toBe(2880);
    });

    it('returns just the additional costs when numberOfDays is 0', () => {
      expect(calculateTripCost(0, 'moderate', 250)).toBe(250);
    });

    it('returns 0 for zero days and zero extras', () => {
      expect(calculateTripCost(0)).toBe(0);
    });
  });

  describe('suggestBudget', () => {
    it('applies a 10% buffer by default and rounds up to the nearest dollar', () => {
      // base = 5 * 290 = 1450; *1.1 = 1595; ceil = 1595
      expect(suggestBudget(5)).toBe(1595);
    });

    it('honors a custom buffer fraction', () => {
      // base = 5 * 110 = 550; *1.15 = 632.5; ceil = 633
      expect(suggestBudget(5, 'budget', 0.15)).toBe(633);
    });

    it('returns ceil of the base cost when buffer is 0', () => {
      // base = 4 * 290 = 1160; *1.0 = 1160; ceil = 1160
      expect(suggestBudget(4, 'moderate', 0)).toBe(1160);
    });

    it('always returns an integer', () => {
      const v = suggestBudget(3, 'luxury', 0.07);
      expect(Number.isInteger(v)).toBe(true);
    });
  });

  describe('calculatePerPersonCost', () => {
    it('divides cost evenly and rounds up', () => {
      // ceil(1000 / 3) = 334
      expect(calculatePerPersonCost(1000, 3)).toBe(334);
    });

    it('returns the full amount when only one person', () => {
      expect(calculatePerPersonCost(900, 1)).toBe(900);
    });

    it('handles whole-number division without inflating', () => {
      expect(calculatePerPersonCost(1200, 4)).toBe(300);
    });

    it('throws when numberOfPeople is 0', () => {
      expect(() => calculatePerPersonCost(500, 0)).toThrow(
        'Number of people must be greater than 0',
      );
    });

    it('throws when numberOfPeople is negative', () => {
      expect(() => calculatePerPersonCost(500, -2)).toThrow(
        'Number of people must be greater than 0',
      );
    });
  });

  describe('estimateAccommodationCost', () => {
    it('multiplies tier nightly rate by nights and rooms', () => {
      // 300 * 3 * 2 = 1800
      expect(estimateAccommodationCost('luxury', 3, 2)).toBe(1800);
    });

    it('defaults to a single room when numberOfRooms is omitted', () => {
      // 150 * 4 * 1 = 600
      expect(estimateAccommodationCost('moderate', 4)).toBe(600);
    });

    it('returns 0 when zero nights', () => {
      expect(estimateAccommodationCost('budget', 0)).toBe(0);
    });

    it('honors the budget tier', () => {
      // 50 * 2 * 1 = 100
      expect(estimateAccommodationCost('budget', 2)).toBe(100);
    });
  });
});

describe('lib/validations/social', () => {
  describe('CrewRequestSchema', () => {
    it('accepts a valid CUID targetUserId', () => {
      const r = CrewRequestSchema.safeParse({ targetUserId: CUID });
      expect(r.success).toBe(true);
    });

    it('rejects a non-CUID targetUserId', () => {
      const r = CrewRequestSchema.safeParse({ targetUserId: 'not-a-cuid' });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0].path).toEqual(['targetUserId']);
      }
    });

    it('rejects a missing targetUserId', () => {
      const r = CrewRequestSchema.safeParse({});
      expect(r.success).toBe(false);
    });
  });

  describe('CrewStatusUpdateSchema', () => {
    it.each(['accept', 'decline', 'block'] as const)(
      'accepts action="%s"',
      (action) => {
        const r = CrewStatusUpdateSchema.safeParse({ action });
        expect(r.success).toBe(true);
      },
    );

    it('rejects unknown action values', () => {
      const r = CrewStatusUpdateSchema.safeParse({ action: 'ignore' });
      expect(r.success).toBe(false);
    });
  });

  describe('MeetupCreateSchema', () => {
    const baseValid = {
      title: 'Drinks at the bar',
      scheduledAt: '2026-12-31T20:00:00.000Z',
    };

    it('accepts the minimum-required payload and applies the CREW visibility default', () => {
      const r = MeetupCreateSchema.safeParse(baseValid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.visibility).toBe('CREW');
      }
    });

    it('accepts a full valid payload', () => {
      const r = MeetupCreateSchema.safeParse({
        ...baseValid,
        description: 'Casual hangout',
        venueId: CUID,
        venueName: 'The Spot',
        endsAt: '2026-12-31T23:00:00.000Z',
        visibility: 'PUBLIC',
        capacity: 12,
      });
      expect(r.success).toBe(true);
    });

    it('rejects an empty title', () => {
      const r = MeetupCreateSchema.safeParse({ ...baseValid, title: '' });
      expect(r.success).toBe(false);
    });

    it('rejects a title longer than 120 chars', () => {
      const r = MeetupCreateSchema.safeParse({
        ...baseValid,
        title: 'x'.repeat(121),
      });
      expect(r.success).toBe(false);
    });

    it('rejects a non-ISO scheduledAt', () => {
      const r = MeetupCreateSchema.safeParse({
        ...baseValid,
        scheduledAt: 'not-a-date',
      });
      expect(r.success).toBe(false);
    });

    it('rejects capacity below 2', () => {
      const r = MeetupCreateSchema.safeParse({ ...baseValid, capacity: 1 });
      expect(r.success).toBe(false);
    });

    it('rejects capacity above 500', () => {
      const r = MeetupCreateSchema.safeParse({ ...baseValid, capacity: 501 });
      expect(r.success).toBe(false);
    });

    it('rejects non-integer capacity', () => {
      const r = MeetupCreateSchema.safeParse({ ...baseValid, capacity: 5.5 });
      expect(r.success).toBe(false);
    });
  });

  describe('MeetupUpdateSchema', () => {
    it('accepts an empty object (all fields optional via .partial())', () => {
      const r = MeetupUpdateSchema.safeParse({});
      expect(r.success).toBe(true);
    });

    it('accepts a single-field update', () => {
      const r = MeetupUpdateSchema.safeParse({ title: 'New title' });
      expect(r.success).toBe(true);
    });

    it('still validates field constraints when provided', () => {
      const r = MeetupUpdateSchema.safeParse({ title: '' });
      expect(r.success).toBe(false);
    });
  });

  describe('MeetupRsvpSchema', () => {
    it.each(['GOING', 'MAYBE', 'DECLINED'] as const)(
      'accepts status="%s"',
      (status) => {
        const r = MeetupRsvpSchema.safeParse({ status });
        expect(r.success).toBe(true);
      },
    );

    it('rejects unknown status values', () => {
      const r = MeetupRsvpSchema.safeParse({ status: 'YES' });
      expect(r.success).toBe(false);
    });
  });

  describe('MeetupInviteSchema', () => {
    it('accepts a valid array of CUIDs', () => {
      const r = MeetupInviteSchema.safeParse({ userIds: [CUID, CUID2] });
      expect(r.success).toBe(true);
    });

    it('rejects an empty array', () => {
      const r = MeetupInviteSchema.safeParse({ userIds: [] });
      expect(r.success).toBe(false);
    });

    it('rejects more than 50 ids', () => {
      const r = MeetupInviteSchema.safeParse({
        userIds: Array.from({ length: 51 }, () => CUID),
      });
      expect(r.success).toBe(false);
    });

    it('rejects non-CUID entries', () => {
      const r = MeetupInviteSchema.safeParse({ userIds: ['nope'] });
      expect(r.success).toBe(false);
    });
  });

  describe('CheckInCreateSchema', () => {
    it('accepts an empty payload and applies the CREW visibility default', () => {
      const r = CheckInCreateSchema.safeParse({});
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.visibility).toBe('CREW');
      }
    });

    it('accepts a fully populated payload', () => {
      const r = CheckInCreateSchema.safeParse({
        venueId: CUID,
        venueName: 'Coffee Spot',
        note: 'Stopping by for an hour',
        visibility: 'PUBLIC',
        latitude: 40.7128,
        longitude: -74.006,
      });
      expect(r.success).toBe(true);
    });

    it('rejects a note over 280 chars', () => {
      const r = CheckInCreateSchema.safeParse({ note: 'x'.repeat(281) });
      expect(r.success).toBe(false);
    });

    it('rejects an unknown visibility value', () => {
      const r = CheckInCreateSchema.safeParse({ visibility: 'FRIENDS' });
      expect(r.success).toBe(false);
    });
  });

  describe('PollCreateSchema', () => {
    const baseValid = {
      title: 'Where should we go?',
      type: 'VOTE' as const,
      options: [{ text: 'Bar A' }, { text: 'Bar B' }],
    };

    it('accepts a valid 2-option poll', () => {
      const r = PollCreateSchema.safeParse(baseValid);
      expect(r.success).toBe(true);
    });

    it('rejects fewer than 2 options', () => {
      const r = PollCreateSchema.safeParse({
        ...baseValid,
        options: [{ text: 'Only one' }],
      });
      expect(r.success).toBe(false);
    });

    it('rejects more than 10 options', () => {
      const r = PollCreateSchema.safeParse({
        ...baseValid,
        options: Array.from({ length: 11 }, (_, i) => ({ text: `Opt ${i}` })),
      });
      expect(r.success).toBe(false);
    });

    it('rejects an empty option text', () => {
      const r = PollCreateSchema.safeParse({
        ...baseValid,
        options: [{ text: 'A' }, { text: '' }],
      });
      expect(r.success).toBe(false);
    });

    it('rejects an unknown poll type', () => {
      const r = PollCreateSchema.safeParse({ ...baseValid, type: 'OTHER' });
      expect(r.success).toBe(false);
    });
  });

  describe('PollResponseSchema', () => {
    it('accepts a single optionId', () => {
      const r = PollResponseSchema.safeParse({ optionIds: [CUID] });
      expect(r.success).toBe(true);
    });

    it('rejects an empty optionIds array', () => {
      const r = PollResponseSchema.safeParse({ optionIds: [] });
      expect(r.success).toBe(false);
    });

    it('rejects non-CUID option ids', () => {
      const r = PollResponseSchema.safeParse({ optionIds: ['xyz'] });
      expect(r.success).toBe(false);
    });
  });

  describe('VenueSearchSchema', () => {
    it('accepts a minimum-required query and applies a 5km radius default', () => {
      const r = VenueSearchSchema.safeParse({ query: 'tacos' });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.radius).toBe(5);
      }
    });

    it('rejects an empty query', () => {
      const r = VenueSearchSchema.safeParse({ query: '' });
      expect(r.success).toBe(false);
    });

    it('rejects a radius below 0.1', () => {
      const r = VenueSearchSchema.safeParse({ query: 'a', radius: 0 });
      expect(r.success).toBe(false);
    });

    it('rejects a radius above 50', () => {
      const r = VenueSearchSchema.safeParse({ query: 'a', radius: 51 });
      expect(r.success).toBe(false);
    });

    it('rejects an unknown category', () => {
      const r = VenueSearchSchema.safeParse({
        query: 'a',
        category: 'CLUB',
      });
      expect(r.success).toBe(false);
    });

    it('accepts every defined category', () => {
      for (const category of [
        'BAR',
        'COFFEE',
        'RESTAURANT',
        'PARK',
        'GYM',
        'COWORKING',
        'OTHER',
      ] as const) {
        const r = VenueSearchSchema.safeParse({ query: 'x', category });
        expect(r.success).toBe(true);
      }
    });
  });

  describe('ProfileUpdateSchema', () => {
    it('accepts an empty object (all fields optional)', () => {
      const r = ProfileUpdateSchema.safeParse({});
      expect(r.success).toBe(true);
    });

    it('accepts a fully populated valid profile', () => {
      const r = ProfileUpdateSchema.safeParse({
        name: 'Pat',
        bio: 'Hello',
        city: 'NYC',
        image: 'https://example.com/avatar.png',
      });
      expect(r.success).toBe(true);
    });

    it('rejects an empty name string', () => {
      const r = ProfileUpdateSchema.safeParse({ name: '' });
      expect(r.success).toBe(false);
    });

    it('rejects a bio over 300 chars', () => {
      const r = ProfileUpdateSchema.safeParse({ bio: 'x'.repeat(301) });
      expect(r.success).toBe(false);
    });

    it('rejects a non-URL image value', () => {
      const r = ProfileUpdateSchema.safeParse({ image: 'not-a-url' });
      expect(r.success).toBe(false);
    });
  });

  describe('CrewLabelUpdateSchema', () => {
    it('accepts a valid alphanumeric label', () => {
      const r = CrewLabelUpdateSchema.safeParse({ label: 'Inner 5' });
      expect(r.success).toBe(true);
    });

    it('accepts null (clearing the label)', () => {
      const r = CrewLabelUpdateSchema.safeParse({ label: null });
      expect(r.success).toBe(true);
    });

    it('rejects an empty string', () => {
      const r = CrewLabelUpdateSchema.safeParse({ label: '' });
      expect(r.success).toBe(false);
    });

    it('rejects a label longer than 20 chars', () => {
      const r = CrewLabelUpdateSchema.safeParse({ label: 'x'.repeat(21) });
      expect(r.success).toBe(false);
    });

    it('rejects a label with disallowed characters', () => {
      const r = CrewLabelUpdateSchema.safeParse({ label: 'best-friends!' });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0].message).toMatch(
          /Letters, numbers, and spaces only/,
        );
      }
    });
  });
});
