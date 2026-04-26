/**
 * Unit tests for src/lib/heatmap/contribution-writer.ts.
 *
 * Covers:
 *   - INTEREST builder: venueId path, cityArea fallback, both-set venue wins,
 *     HIDDEN granularity returns null, neither-set returns null.
 *   - PRESENCE builder: inline lat/lng path, venueId fallback, PRIVATE
 *     visibility skipped, no-coords returns null.
 *   - writePresenceContribution wrapper: end-to-end venue lookup + create.
 *   - checkInVisibilityToSocialScope mapping.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildInterestContributionData,
  buildPresenceContributionData,
  checkInVisibilityToSocialScope,
  writePresenceContribution,
} from '@/lib/heatmap/contribution-writer';
import { prisma } from '@/lib/prisma';

const mockVenue = prisma.venue as unknown as { findUnique: ReturnType<typeof vi.fn> };
const mockHeatmap = prisma.heatmapContribution as unknown as { create: ReturnType<typeof vi.fn> };

const baseIntent = {
  id: 'intent-1',
  venueId: null,
  cityArea: null,
  topicId: 'topic-1',
  windowPreset: 'EVENING' as const,
  expiresAt: new Date('2026-04-26T03:00:00Z'),
};

const baseCheckIn = {
  id: 'checkin-1',
  venueId: null,
  latitude: null,
  longitude: null,
  visibility: 'CREW' as const,
  activeUntil: new Date('2026-04-26T03:00:00Z'),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('checkInVisibilityToSocialScope', () => {
  it('PUBLIC → FULL_CREW', () => {
    expect(checkInVisibilityToSocialScope('PUBLIC')).toBe('FULL_CREW');
  });
  it('CREW → FULL_CREW', () => {
    expect(checkInVisibilityToSocialScope('CREW')).toBe('FULL_CREW');
  });
  it('PRIVATE → NOBODY', () => {
    expect(checkInVisibilityToSocialScope('PRIVATE')).toBe('NOBODY');
  });
});

describe('buildInterestContributionData', () => {
  it('uses venue lat/lng when venueId set and venueLatLng provided', () => {
    const data = buildInterestContributionData({
      userId: 'u1',
      intent: { ...baseIntent, venueId: 'v1', cityArea: 'east-village' },
      venueLatLng: { latitude: 40.72319, longitude: -73.98765 },
      socialScope: 'FULL_CREW',
      granularity: 'BLOCK',
      identityMode: 'KNOWN',
    });
    expect(data).not.toBeNull();
    // BLOCK rounds to 3dp
    expect(data!.cellLat).toBe(40.723);
    expect(data!.cellLng).toBe(-73.988);
    expect(data!.type).toBe('INTEREST');
    expect(data!.sourceId).toBe('intent-1');
    expect(data!.socialScope).toBe('FULL_CREW');
    expect(data!.identityMode).toBe('KNOWN');
  });

  it('falls back to neighborhood centroid when only cityArea is set', () => {
    const data = buildInterestContributionData({
      userId: 'u1',
      intent: { ...baseIntent, cityArea: 'east-village' },
      venueLatLng: null,
      socialScope: 'FULL_CREW',
      granularity: 'BLOCK',
      identityMode: 'KNOWN',
    });
    expect(data).not.toBeNull();
    // East Village centroid = 40.728, -73.984 → BLOCK keeps 3dp
    expect(data!.cellLat).toBe(40.728);
    expect(data!.cellLng).toBe(-73.984);
  });

  it('returns null when granularity is HIDDEN', () => {
    const data = buildInterestContributionData({
      userId: 'u1',
      intent: { ...baseIntent, cityArea: 'east-village' },
      venueLatLng: null,
      socialScope: 'FULL_CREW',
      granularity: 'HIDDEN',
      identityMode: 'KNOWN',
    });
    expect(data).toBeNull();
  });

  it('returns null when neither venue lat/lng nor cityArea resolves', () => {
    const data = buildInterestContributionData({
      userId: 'u1',
      intent: baseIntent,
      venueLatLng: null,
      socialScope: 'FULL_CREW',
      granularity: 'BLOCK',
      identityMode: 'KNOWN',
    });
    expect(data).toBeNull();
  });

  it('returns null when cityArea slug is unknown', () => {
    const data = buildInterestContributionData({
      userId: 'u1',
      intent: { ...baseIntent, cityArea: 'not-a-real-neighborhood' },
      venueLatLng: null,
      socialScope: 'FULL_CREW',
      granularity: 'BLOCK',
      identityMode: 'KNOWN',
    });
    expect(data).toBeNull();
  });

  it('venue lat/lng takes priority over cityArea when both are set', () => {
    const data = buildInterestContributionData({
      userId: 'u1',
      intent: { ...baseIntent, venueId: 'v1', cityArea: 'williamsburg' },
      venueLatLng: { latitude: 40.728, longitude: -73.984 }, // East Village coords
      socialScope: 'FULL_CREW',
      granularity: 'BLOCK',
      identityMode: 'KNOWN',
    });
    // Williamsburg centroid is 40.708, -73.957 — not used here
    expect(data!.cellLat).toBe(40.728);
    expect(data!.cellLng).toBe(-73.984);
  });

  it('persists topicId, windowPreset, expiresAt from the intent', () => {
    const data = buildInterestContributionData({
      userId: 'u1',
      intent: { ...baseIntent, cityArea: 'east-village' },
      venueLatLng: null,
      socialScope: 'SUBGROUP_ONLY',
      granularity: 'BLOCK',
      identityMode: 'ANONYMOUS',
    });
    expect(data!.topicId).toBe('topic-1');
    expect(data!.windowPreset).toBe('EVENING');
    expect(data!.expiresAt).toEqual(new Date('2026-04-26T03:00:00Z'));
    expect(data!.socialScope).toBe('SUBGROUP_ONLY');
    expect(data!.identityMode).toBe('ANONYMOUS');
  });
});

describe('buildPresenceContributionData', () => {
  it('uses inline lat/lng when present', () => {
    const data = buildPresenceContributionData({
      userId: 'u1',
      checkIn: { ...baseCheckIn, latitude: 40.72319, longitude: -73.98765 },
      venueLatLng: null,
    });
    expect(data!.cellLat).toBe(40.723);
    expect(data!.cellLng).toBe(-73.988);
    expect(data!.type).toBe('PRESENCE');
    expect(data!.identityMode).toBe('KNOWN');
    expect(data!.socialScope).toBe('FULL_CREW');
  });

  it('falls back to venue lat/lng when checkIn has venueId but no inline coords', () => {
    const data = buildPresenceContributionData({
      userId: 'u1',
      checkIn: { ...baseCheckIn, venueId: 'v1' },
      venueLatLng: { latitude: 40.728, longitude: -73.984 },
    });
    expect(data!.cellLat).toBe(40.728);
    expect(data!.cellLng).toBe(-73.984);
  });

  it('returns null when visibility is PRIVATE', () => {
    const data = buildPresenceContributionData({
      userId: 'u1',
      checkIn: { ...baseCheckIn, latitude: 40.72319, longitude: -73.98765, visibility: 'PRIVATE' },
      venueLatLng: null,
    });
    expect(data).toBeNull();
  });

  it('returns null when no resolvable coords', () => {
    const data = buildPresenceContributionData({
      userId: 'u1',
      checkIn: baseCheckIn,
      venueLatLng: null,
    });
    expect(data).toBeNull();
  });

  it('expiresAt mirrors checkIn.activeUntil', () => {
    const data = buildPresenceContributionData({
      userId: 'u1',
      checkIn: { ...baseCheckIn, latitude: 40.72319, longitude: -73.98765 },
      venueLatLng: null,
    });
    expect(data!.expiresAt).toEqual(new Date('2026-04-26T03:00:00Z'));
  });
});

describe('writePresenceContribution', () => {
  it('writes a contribution when inline coords are present (no venue lookup)', async () => {
    mockHeatmap.create.mockResolvedValueOnce({ id: 'hc-1' });

    const result = await writePresenceContribution({
      userId: 'u1',
      checkIn: { ...baseCheckIn, latitude: 40.72319, longitude: -73.98765 },
    });

    expect(result).toEqual({ id: 'hc-1' });
    expect(mockVenue.findUnique).not.toHaveBeenCalled();
    expect(mockHeatmap.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          type: 'PRESENCE',
          sourceId: 'checkin-1',
          cellLat: 40.723,
          cellLng: -73.988,
          socialScope: 'FULL_CREW',
        }),
        select: { id: true },
      }),
    );
  });

  it('looks up venue lat/lng when checkIn has venueId but no inline coords', async () => {
    mockVenue.findUnique.mockResolvedValueOnce({ latitude: 40.728, longitude: -73.984 });
    mockHeatmap.create.mockResolvedValueOnce({ id: 'hc-2' });

    const result = await writePresenceContribution({
      userId: 'u1',
      checkIn: { ...baseCheckIn, venueId: 'v1' },
    });

    expect(result).toEqual({ id: 'hc-2' });
    expect(mockVenue.findUnique).toHaveBeenCalledWith({
      where: { id: 'v1' },
      select: { latitude: true, longitude: true },
    });
  });

  it('returns null when no contribution data is buildable (no coords, no venueId)', async () => {
    const result = await writePresenceContribution({
      userId: 'u1',
      checkIn: baseCheckIn,
    });
    expect(result).toBeNull();
    expect(mockHeatmap.create).not.toHaveBeenCalled();
  });

  it('returns null when visibility is PRIVATE even with coords', async () => {
    const result = await writePresenceContribution({
      userId: 'u1',
      checkIn: { ...baseCheckIn, latitude: 40.72319, longitude: -73.98765, visibility: 'PRIVATE' },
    });
    expect(result).toBeNull();
    expect(mockHeatmap.create).not.toHaveBeenCalled();
  });
});
