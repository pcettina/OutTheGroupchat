/**
 * @module heatmap/aggregate
 * @description V1 Phase 4 — read-side aggregation for `GET /api/heatmap`.
 *
 * Resolves the viewer's accepted-Crew set, pulls live `HeatmapContribution`
 * rows for the requested type (INTEREST or PRESENCE), and groups them into
 * cell + venue-marker buckets. Enforces:
 *   - R4 viewer-side privacy via `CrewRelationshipSetting` (HIDDEN drops the
 *     contribution entirely).
 *   - R14 Anonymous N>=3 floor (per cell, applied to the ANONYMOUS bucket
 *     only — KNOWN / CREW_ANCHORED contributions surface independently).
 *   - SocialScope filter (FULL_CREW + SUBGROUP_ONLY allowed in 4a; the
 *     SUBGROUP_ONLY bucket will gain SubCrew-membership filtering in 4b).
 *
 * FoF tier (4b) plugs into the same surface area; for now `tier=fof` returns
 * an empty payload via the route validator before this function is called.
 */

import {
  HeatmapContributionType,
  HeatmapGranularityMode,
  HeatmapIdentityMode,
  HeatmapSocialScope,
  type WindowPreset,
} from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma';
import type { HeatmapCell, HeatmapType, HeatmapVenueMarker } from '@/types/heatmap';

type PrismaLike = Pick<
  typeof defaultPrisma,
  'crew' | 'heatmapContribution' | 'crewRelationshipSetting' | 'intent' | 'checkIn' | 'venue'
>;

export interface AggregateInput {
  viewerId: string;
  type: HeatmapType;
  /** Phase 4a only supports `crew`. Phase 4b adds `fof`. */
  tier: 'crew';
  cityArea?: string;
  topicId?: string;
  windowPreset?: WindowPreset;
  prismaClient?: PrismaLike;
}

export interface AggregateOutput {
  cells: HeatmapCell[];
  venueMarkers: HeatmapVenueMarker[];
}

const ANONYMOUS_FLOOR = 3;

function cellKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

async function getCrewPartnerIds(
  client: PrismaLike,
  viewerId: string,
): Promise<string[]> {
  const rows = await client.crew.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ userAId: viewerId }, { userBId: viewerId }],
    },
    select: { userAId: true, userBId: true },
  });
  return rows.map((r) => (r.userAId === viewerId ? r.userBId : r.userAId));
}

export async function aggregateContributions(
  input: AggregateInput,
): Promise<AggregateOutput> {
  const client = input.prismaClient ?? defaultPrisma;
  const contributionType =
    input.type === 'interest'
      ? HeatmapContributionType.INTEREST
      : HeatmapContributionType.PRESENCE;

  const crewIds = await getCrewPartnerIds(client, input.viewerId);
  if (crewIds.length === 0) {
    return { cells: [], venueMarkers: [] };
  }

  const now = new Date();
  const contributions = await client.heatmapContribution.findMany({
    where: {
      userId: { in: crewIds },
      type: contributionType,
      expiresAt: { gt: now },
      socialScope: {
        in: [HeatmapSocialScope.FULL_CREW, HeatmapSocialScope.SUBGROUP_ONLY],
      },
      ...(input.topicId ? { topicId: input.topicId } : {}),
      ...(input.windowPreset ? { windowPreset: input.windowPreset } : {}),
    },
    select: {
      id: true,
      userId: true,
      type: true,
      sourceId: true,
      cellLat: true,
      cellLng: true,
      cellPrecision: true,
      identityMode: true,
      socialScope: true,
      windowPreset: true,
      topicId: true,
    },
  });

  if (contributions.length === 0) {
    return { cells: [], venueMarkers: [] };
  }

  // R4 — apply per-relationship CrewRelationshipSetting overrides.
  // HIDDEN drops the contributor entirely from this viewer's heatmap.
  const settings = await client.crewRelationshipSetting.findMany({
    where: { viewerId: input.viewerId, targetId: { in: crewIds } },
    select: { targetId: true, granularityMode: true },
  });
  const hiddenTargetIds = new Set(
    settings
      .filter((s) => s.granularityMode === HeatmapGranularityMode.HIDDEN)
      .map((s) => s.targetId),
  );

  const visible = contributions.filter((c) => !hiddenTargetIds.has(c.userId));

  // Group by cell. Phase 4 surfaces just the cell-level counts; the cityArea
  // input acts as a top-level filter applied via Intent/CheckIn join below
  // (cheap because most queries are city-scoped already).
  const cellGroups = new Map<
    string,
    {
      lat: number;
      lng: number;
      knownLike: typeof contributions;
      anonymous: typeof contributions;
    }
  >();
  for (const c of visible) {
    const key = cellKey(c.cellLat, c.cellLng);
    let entry = cellGroups.get(key);
    if (!entry) {
      entry = { lat: c.cellLat, lng: c.cellLng, knownLike: [], anonymous: [] };
      cellGroups.set(key, entry);
    }
    if (c.identityMode === HeatmapIdentityMode.ANONYMOUS) {
      entry.anonymous.push(c);
    } else {
      entry.knownLike.push(c);
    }
  }

  const cells: HeatmapCell[] = [];
  for (const entry of Array.from(cellGroups.values())) {
    // R14 — Anonymous N>=3 floor. The anonymous bucket only contributes if it
    // meets the threshold on its own (a single anonymous user mixed with
    // KNOWN contributors is still identifying because the viewer can deduce
    // who the unattributed signal is).
    const anonCount = entry.anonymous.length >= ANONYMOUS_FLOOR ? entry.anonymous.length : 0;
    const total = entry.knownLike.length + anonCount;
    if (total === 0) continue;
    cells.push({ lat: entry.lat, lng: entry.lng, count: total });
  }
  cells.sort((a, b) => b.count - a.count);

  const venueMarkers = await deriveVenueMarkers(client, contributionType, visible, input.cityArea);

  return { cells, venueMarkers };
}

async function deriveVenueMarkers(
  client: PrismaLike,
  type: HeatmapContributionType,
  contributions: ReadonlyArray<{ id: string; sourceId: string; userId: string }>,
  cityAreaFilter: string | undefined,
): Promise<HeatmapVenueMarker[]> {
  if (contributions.length === 0) return [];
  const sourceIds = contributions.map((c) => c.sourceId);

  const sourceVenueMap = new Map<string, string>();

  if (type === HeatmapContributionType.INTEREST) {
    const intents = await client.intent.findMany({
      where: {
        id: { in: sourceIds },
        venueId: { not: null },
        ...(cityAreaFilter ? { cityArea: cityAreaFilter } : {}),
      },
      select: { id: true, venueId: true },
    });
    for (const i of intents) {
      if (i.venueId) sourceVenueMap.set(i.id, i.venueId);
    }
  } else {
    const checkIns = await client.checkIn.findMany({
      where: { id: { in: sourceIds }, venueId: { not: null } },
      select: { id: true, venueId: true },
    });
    for (const c of checkIns) {
      if (c.venueId) sourceVenueMap.set(c.id, c.venueId);
    }
  }

  if (sourceVenueMap.size === 0) return [];

  // Tally counts per venueId.
  const venueCounts = new Map<string, number>();
  for (const c of contributions) {
    const venueId = sourceVenueMap.get(c.sourceId);
    if (!venueId) continue;
    venueCounts.set(venueId, (venueCounts.get(venueId) ?? 0) + 1);
  }
  if (venueCounts.size === 0) return [];

  const venues = await client.venue.findMany({
    where: { id: { in: Array.from(venueCounts.keys()) } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  const markers: HeatmapVenueMarker[] = [];
  for (const v of venues) {
    if (v.latitude === null || v.longitude === null) continue;
    const count = venueCounts.get(v.id) ?? 0;
    if (count === 0) continue;
    markers.push({ venueId: v.id, lat: v.latitude, lng: v.longitude, count, venueName: v.name });
  }
  markers.sort((a, b) => b.count - a.count);
  return markers;
}
