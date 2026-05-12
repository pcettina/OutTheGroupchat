/**
 * @module heatmap/contribution-writer
 * @description V1 Phase 4 — write-side helpers for `HeatmapContribution`.
 *
 * Two contribution surfaces feed the heatmap (R13):
 *   - INTEREST: written at SubCrew commit time. Cell resolves from the Intent's
 *     `venueId` (Venue.lat/lng) or falls back to the `cityArea` neighborhood
 *     centroid. Privacy axes are picked at commit (R6 + 3-axis picker).
 *   - PRESENCE: written automatically when a `CheckIn` is created. Cell
 *     resolves from `CheckIn.latitude/longitude` or the joined `Venue` row.
 *     Privacy maps from `CheckIn.visibility` per the v1 R20 defaults — there
 *     is no privacy picker in the CheckIn flow.
 *
 * Both writers are no-ops (return `null`) if no resolvable lat/lng exists or
 * if the chosen granularity is `HIDDEN`. They never throw — call sites treat
 * a missing contribution as silent and continue.
 */

import {
  HeatmapContributionType,
  HeatmapGranularityMode,
  HeatmapIdentityMode,
  HeatmapSocialScope,
  type CheckInVisibility,
  type Prisma,
  type WindowPreset,
} from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma';
import { anonymizeCell } from '@/lib/subcrew/cell-anonymize';
import { getNeighborhoodCentroid } from '@/lib/intent/neighborhoods';

type PrismaLike = Pick<typeof defaultPrisma, 'heatmapContribution' | 'venue'>;

/**
 * Minimal Intent shape required to build an INTEREST contribution. Passed
 * by the SubCrew commit route after it has loaded the Intent row.
 */
export interface IntentForContribution {
  /** Source Intent id — copied into `HeatmapContribution.sourceId`. */
  id: string;
  /** Optional venue join — used to resolve cell lat/lng when present. */
  venueId: string | null;
  /** Optional neighborhood; falls back to its centroid when no venue. */
  cityArea: string | null;
  /** Topic carried into the contribution for read-side filtering. */
  topicId: string;
  /** Window preset carried into the contribution. */
  windowPreset: WindowPreset;
  /** Contribution `expiresAt` — typically Intent.expiresAt (R10 decay). */
  expiresAt: Date;
}

/**
 * Minimal CheckIn shape required to build a PRESENCE contribution. Passed
 * by `POST /api/checkins` after it has created the CheckIn row.
 */
export interface CheckInForContribution {
  /** Source CheckIn id — copied into `HeatmapContribution.sourceId`. */
  id: string;
  /** Optional venue join — preferred lat/lng source when set. */
  venueId: string | null;
  /** Inline latitude when no venue. */
  latitude: number | null;
  /** Inline longitude when no venue. */
  longitude: number | null;
  /** Drives the SocialScope mapping (R20 v1 defaults). */
  visibility: CheckInVisibility;
  /** Contribution `expiresAt` — typically CheckIn.activeUntil. */
  activeUntil: Date;
}

interface VenueLatLng {
  latitude: number | null;
  longitude: number | null;
}

interface ResolvedCell {
  cellLat: number;
  cellLng: number;
  cellPrecision: HeatmapGranularityMode;
}

function resolveLatLng(
  venueId: string | null,
  venueLatLng: VenueLatLng | null,
  cityArea: string | null,
  fallbackLat: number | null,
  fallbackLng: number | null,
): { lat: number; lng: number } | null {
  if (
    venueId &&
    venueLatLng &&
    venueLatLng.latitude !== null &&
    venueLatLng.longitude !== null
  ) {
    return { lat: venueLatLng.latitude, lng: venueLatLng.longitude };
  }
  if (fallbackLat !== null && fallbackLng !== null) {
    return { lat: fallbackLat, lng: fallbackLng };
  }
  if (cityArea) {
    return getNeighborhoodCentroid(cityArea);
  }
  return null;
}

function resolveCell(
  latLng: { lat: number; lng: number } | null,
  granularity: HeatmapGranularityMode,
): ResolvedCell | null {
  if (!latLng) return null;
  const cell = anonymizeCell(latLng.lat, latLng.lng, granularity);
  if (!cell) return null;
  return { cellLat: cell.cellLat, cellLng: cell.cellLng, cellPrecision: granularity };
}

/**
 * Map a `CheckIn.visibility` to the `HeatmapSocialScope` used at the
 * aggregation layer. PUBLIC and CREW both read as FULL_CREW because the
 * v1 heatmap has no public-stranger tier; PRIVATE blocks any contribution
 * from surfacing.
 *
 * @param visibility The CheckIn visibility chosen by the user.
 * @returns The matching `HeatmapSocialScope`. NOBODY suppresses the write.
 */
export function checkInVisibilityToSocialScope(
  visibility: CheckInVisibility,
): HeatmapSocialScope {
  switch (visibility) {
    case 'PUBLIC':
    case 'CREW':
      return HeatmapSocialScope.FULL_CREW;
    case 'PRIVATE':
      return HeatmapSocialScope.NOBODY;
    default:
      return HeatmapSocialScope.NOBODY;
  }
}

/**
 * Build the row payload for an INTEREST contribution. Returns `null` when no
 * cell can be resolved (no venue lat/lng AND no cityArea centroid) or when
 * the chosen granularity is HIDDEN.
 *
 * Synchronous so it can be appended to an existing `prisma.$transaction`
 * array by the caller (see the SubCrew commit route).
 *
 * @param opts.userId Contributor user id.
 * @param opts.intent The source Intent row (already loaded by the caller).
 * @param opts.venueLatLng Venue lat/lng when Intent has a venueId, else null.
 * @param opts.socialScope SocialScope picked at commit (R6).
 * @param opts.granularity Cell precision picked at commit (3-axis picker).
 * @param opts.identityMode Identity mode picked at commit (KNOWN/ANONYMOUS).
 * @returns `Prisma.HeatmapContributionUncheckedCreateInput` ready to insert,
 *   or `null` to skip the write.
 */
export function buildInterestContributionData(opts: {
  userId: string;
  intent: IntentForContribution;
  venueLatLng: VenueLatLng | null;
  socialScope: HeatmapSocialScope;
  granularity: HeatmapGranularityMode;
  identityMode: HeatmapIdentityMode;
}): Prisma.HeatmapContributionUncheckedCreateInput | null {
  const { userId, intent, venueLatLng, socialScope, granularity, identityMode } = opts;
  if (granularity === HeatmapGranularityMode.HIDDEN) return null;

  const latLng = resolveLatLng(intent.venueId, venueLatLng, intent.cityArea, null, null);
  const cell = resolveCell(latLng, granularity);
  if (!cell) return null;

  return {
    userId,
    type: HeatmapContributionType.INTEREST,
    sourceId: intent.id,
    cellLat: cell.cellLat,
    cellLng: cell.cellLng,
    cellPrecision: cell.cellPrecision,
    topicId: intent.topicId,
    windowPreset: intent.windowPreset,
    socialScope,
    identityMode,
    expiresAt: intent.expiresAt,
  };
}

/**
 * Build the row payload for a PRESENCE contribution. Returns `null` when no
 * cell can be resolved or when visibility maps to NOBODY (the contribution
 * still surfaces to nobody — skipping the write keeps the table tidy).
 *
 * Always uses `HeatmapGranularityMode.BLOCK` since v1 CheckIns have no
 * granularity picker (R20).
 *
 * @param opts.userId Contributor user id.
 * @param opts.checkIn The source CheckIn row (already created).
 * @param opts.venueLatLng Venue lat/lng when CheckIn has a venueId, else null.
 * @returns `Prisma.HeatmapContributionUncheckedCreateInput` ready to insert,
 *   or `null` to skip the write.
 */
export function buildPresenceContributionData(opts: {
  userId: string;
  checkIn: CheckInForContribution;
  venueLatLng: VenueLatLng | null;
}): Prisma.HeatmapContributionUncheckedCreateInput | null {
  const { userId, checkIn, venueLatLng } = opts;
  const socialScope = checkInVisibilityToSocialScope(checkIn.visibility);
  if (socialScope === HeatmapSocialScope.NOBODY) return null;

  const latLng = resolveLatLng(
    checkIn.venueId,
    venueLatLng,
    null,
    checkIn.latitude,
    checkIn.longitude,
  );
  const cell = resolveCell(latLng, HeatmapGranularityMode.BLOCK);
  if (!cell) return null;

  return {
    userId,
    type: HeatmapContributionType.PRESENCE,
    sourceId: checkIn.id,
    cellLat: cell.cellLat,
    cellLng: cell.cellLng,
    cellPrecision: cell.cellPrecision,
    topicId: null,
    windowPreset: null,
    socialScope,
    identityMode: HeatmapIdentityMode.KNOWN,
    expiresAt: checkIn.activeUntil,
  };
}

/**
 * Write a PRESENCE contribution for a freshly-created CheckIn. Convenience
 * wrapper used by `POST /api/checkins` — does the Venue lat/lng lookup if the
 * CheckIn carries a `venueId` and no inline coords. Returns `null` when no
 * contribution is written; never throws.
 *
 * @param opts.userId Contributor user id.
 * @param opts.checkIn The freshly-created CheckIn row.
 * @param opts.prismaClient Test-injectable Prisma client.
 * @returns `{ id }` of the created HeatmapContribution row, or `null` when
 *   the contribution was skipped (no resolvable cell or NOBODY scope).
 */
export async function writePresenceContribution(opts: {
  userId: string;
  checkIn: CheckInForContribution;
  prismaClient?: PrismaLike;
}): Promise<{ id: string } | null> {
  const { userId, checkIn } = opts;
  const client = opts.prismaClient ?? defaultPrisma;

  let venueLatLng: VenueLatLng | null = null;
  if (checkIn.venueId && (checkIn.latitude === null || checkIn.longitude === null)) {
    const venue = await client.venue.findUnique({
      where: { id: checkIn.venueId },
      select: { latitude: true, longitude: true },
    });
    if (venue) {
      venueLatLng = { latitude: venue.latitude, longitude: venue.longitude };
    }
  }

  const data = buildPresenceContributionData({ userId, checkIn, venueLatLng });
  if (!data) return null;

  const created = await client.heatmapContribution.create({
    data,
    select: { id: true },
  });
  return created;
}
