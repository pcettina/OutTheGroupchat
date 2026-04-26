/**
 * @module heatmap/aggregate
 * @description V1 Phase 4 — read-side aggregation for `GET /api/heatmap`.
 *
 * Two tiers share the same response shape:
 *   - Crew tier: viewer's accepted Crew partners. Per-relationship
 *     `CrewRelationshipSetting` (HIDDEN drops contributor) applies.
 *   - FoF tier (4b): users 1-hop via Crew with mutual-Crew >= threshold.
 *     Each cell carries an `anchorSummary` like "via Alex" derived from
 *     `pickAnchor` per R24.
 *
 * Both tiers enforce the R14 N>=3 anonymous floor — applied per-cell to the
 * ANONYMOUS bucket only. KNOWN / CREW_ANCHORED contributions surface
 * independently.
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
import { getFofSet, type FofEntry } from '@/lib/heatmap/fof-graph';
import { buildAnchorSummary, pickAnchor, type AnchorPick } from '@/lib/heatmap/anchor-select';

type PrismaLike = Pick<
  typeof defaultPrisma,
  'crew' | 'heatmapContribution' | 'crewRelationshipSetting' | 'intent' | 'checkIn' | 'venue' | 'user' | 'subCrewMember'
>;

export interface AggregateInput {
  viewerId: string;
  type: HeatmapType;
  tier: 'crew' | 'fof';
  cityArea?: string;
  topicId?: string;
  windowPreset?: WindowPreset;
  /** FoF only — minimum mutual-Crew count to include a FoF user (R5). */
  mutualThreshold?: number;
  /** FoF only — when set, R24 priority 1 (SubCrew-anchor) activates. */
  subCrewId?: string;
  prismaClient?: PrismaLike;
}

export interface AggregateOutput {
  cells: HeatmapCell[];
  venueMarkers: HeatmapVenueMarker[];
}

const ANONYMOUS_FLOOR = 3;

interface ContributionRow {
  id: string;
  userId: string;
  type: HeatmapContributionType;
  sourceId: string;
  cellLat: number;
  cellLng: number;
  cellPrecision: HeatmapGranularityMode;
  identityMode: HeatmapIdentityMode;
  socialScope: HeatmapSocialScope;
  windowPreset: WindowPreset | null;
  topicId: string | null;
}

interface CellBucket {
  lat: number;
  lng: number;
  knownLike: ContributionRow[];
  anonymous: ContributionRow[];
  anchorNames: string[];
}

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

function bucketContributions(
  contributions: ReadonlyArray<ContributionRow>,
  anchorByContributor?: Map<string, AnchorPick | null>,
): Map<string, CellBucket> {
  const groups = new Map<string, CellBucket>();
  for (const c of contributions) {
    const key = cellKey(c.cellLat, c.cellLng);
    let entry = groups.get(key);
    if (!entry) {
      entry = { lat: c.cellLat, lng: c.cellLng, knownLike: [], anonymous: [], anchorNames: [] };
      groups.set(key, entry);
    }
    if (c.identityMode === HeatmapIdentityMode.ANONYMOUS) {
      entry.anonymous.push(c);
    } else {
      entry.knownLike.push(c);
    }
    if (anchorByContributor) {
      const pick = anchorByContributor.get(c.userId);
      if (pick?.anchorName) entry.anchorNames.push(pick.anchorName);
    }
  }
  return groups;
}

function bucketsToCells(groups: Map<string, CellBucket>): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (const entry of Array.from(groups.values())) {
    const anonCount = entry.anonymous.length >= ANONYMOUS_FLOOR ? entry.anonymous.length : 0;
    const total = entry.knownLike.length + anonCount;
    if (total === 0) continue;
    const uniqueNames = Array.from(new Set(entry.anchorNames));
    const anchorSummary = buildAnchorSummary(uniqueNames);
    cells.push({
      lat: entry.lat,
      lng: entry.lng,
      count: total,
      ...(anchorSummary ? { anchorSummary } : {}),
    });
  }
  cells.sort((a, b) => b.count - a.count);
  return cells;
}

export async function aggregateContributions(
  input: AggregateInput,
): Promise<AggregateOutput> {
  const client = input.prismaClient ?? defaultPrisma;
  const contributionType =
    input.type === 'interest'
      ? HeatmapContributionType.INTEREST
      : HeatmapContributionType.PRESENCE;
  const now = new Date();

  if (input.tier === 'fof') {
    return aggregateFoF({ ...input, contributionType, client, now });
  }
  return aggregateCrew({ ...input, contributionType, client, now });
}

interface BranchInput extends AggregateInput {
  contributionType: HeatmapContributionType;
  client: PrismaLike;
  now: Date;
}

async function aggregateCrew(input: BranchInput): Promise<AggregateOutput> {
  const crewIds = await getCrewPartnerIds(input.client, input.viewerId);
  if (crewIds.length === 0) return { cells: [], venueMarkers: [] };

  const contributions = await fetchContributions(input.client, {
    userIds: crewIds,
    type: input.contributionType,
    now: input.now,
    topicId: input.topicId,
    windowPreset: input.windowPreset,
    socialScopes: [HeatmapSocialScope.FULL_CREW, HeatmapSocialScope.SUBGROUP_ONLY],
  });
  if (contributions.length === 0) return { cells: [], venueMarkers: [] };

  const settings = await input.client.crewRelationshipSetting.findMany({
    where: { viewerId: input.viewerId, targetId: { in: crewIds } },
    select: { targetId: true, granularityMode: true },
  });
  const hiddenTargetIds = new Set(
    settings
      .filter((s) => s.granularityMode === HeatmapGranularityMode.HIDDEN)
      .map((s) => s.targetId),
  );
  const visible = contributions.filter((c) => !hiddenTargetIds.has(c.userId));

  const cells = bucketsToCells(bucketContributions(visible));
  const venueMarkers = await deriveVenueMarkers(
    input.client,
    input.contributionType,
    visible,
    input.cityArea,
  );

  return { cells, venueMarkers };
}

async function aggregateFoF(input: BranchInput): Promise<AggregateOutput> {
  const fofSet: FofEntry[] = await getFofSet({
    viewerId: input.viewerId,
    mutualThreshold: input.mutualThreshold ?? 1,
    prismaClient: input.client,
  });
  if (fofSet.length === 0) return { cells: [], venueMarkers: [] };

  const fofUserIds = fofSet.map((f) => f.userId);
  const allAnchorIds = Array.from(new Set(fofSet.flatMap((f) => f.anchorIds)));

  // Pre-fetch the data pickAnchor needs for each FoF user.
  const [anchorUsers, crewEdges, subCrewMembers] = await Promise.all([
    input.client.user.findMany({
      where: { id: { in: allAnchorIds } },
      select: { id: true, name: true },
    }),
    input.client.crew.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userAId: input.viewerId, userBId: { in: allAnchorIds } },
          { userBId: input.viewerId, userAId: { in: allAnchorIds } },
        ],
      },
      select: { userAId: true, userBId: true, createdAt: true },
    }),
    input.subCrewId
      ? input.client.subCrewMember.findMany({
          where: { subCrewId: input.subCrewId },
          select: { userId: true },
        })
      : Promise.resolve([] as Array<{ userId: string }>),
  ]);

  const nameById = new Map<string, string | null>(
    anchorUsers.map((u) => [u.id, u.name]),
  );
  const createdAtByAnchor = new Map<string, Date>();
  for (const e of crewEdges) {
    const anchorId = e.userAId === input.viewerId ? e.userBId : e.userAId;
    createdAtByAnchor.set(anchorId, e.createdAt);
  }
  const subCrewMemberIdSet = new Set(subCrewMembers.map((m) => m.userId));

  const anchorByFofUser = new Map<string, AnchorPick | null>();
  for (const f of fofSet) {
    const subCrewAnchors = new Set(f.anchorIds.filter((a) => subCrewMemberIdSet.has(a)));
    const pick = pickAnchor({
      anchorIds: f.anchorIds,
      subCrewMemberAnchorIds: subCrewAnchors,
      crewEdgeCreatedByAnchor: createdAtByAnchor,
      anchorNameById: nameById,
    });
    anchorByFofUser.set(f.userId, pick);
  }

  // FoF excludes SUBGROUP_ONLY (the viewer isn't in the FoF user's SubCrew
  // by definition). FULL_CREW is the only relevant scope.
  const contributions = await fetchContributions(input.client, {
    userIds: fofUserIds,
    type: input.contributionType,
    now: input.now,
    topicId: input.topicId,
    windowPreset: input.windowPreset,
    socialScopes: [HeatmapSocialScope.FULL_CREW],
  });
  if (contributions.length === 0) return { cells: [], venueMarkers: [] };

  const cells = bucketsToCells(bucketContributions(contributions, anchorByFofUser));
  const venueMarkers = await deriveVenueMarkers(
    input.client,
    input.contributionType,
    contributions,
    input.cityArea,
  );

  return { cells, venueMarkers };
}

async function fetchContributions(
  client: PrismaLike,
  opts: {
    userIds: string[];
    type: HeatmapContributionType;
    now: Date;
    topicId?: string;
    windowPreset?: WindowPreset;
    socialScopes: HeatmapSocialScope[];
  },
): Promise<ContributionRow[]> {
  const rows = await client.heatmapContribution.findMany({
    where: {
      userId: { in: opts.userIds },
      type: opts.type,
      expiresAt: { gt: opts.now },
      socialScope: { in: opts.socialScopes },
      ...(opts.topicId ? { topicId: opts.topicId } : {}),
      ...(opts.windowPreset ? { windowPreset: opts.windowPreset } : {}),
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
  return rows;
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
