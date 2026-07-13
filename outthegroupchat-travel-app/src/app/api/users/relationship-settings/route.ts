import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { HeatmapGranularityMode, HeatmapIdentityMode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ============================================
// CONSTANTS
// ============================================

/** Fields returned for the resolved Crew partner on each accepted edge. */
const userPreviewSelect = {
  id: true,
  name: true,
  image: true,
  city: true,
  crewLabel: true,
} as const;

/** Per-relationship privacy defaults when no stored row exists. */
const DEFAULT_GRANULARITY_MODE: HeatmapGranularityMode = HeatmapGranularityMode.BLOCK;
const DEFAULT_IDENTITY_MODE: HeatmapIdentityMode = HeatmapIdentityMode.KNOWN;

// ============================================
// SCHEMA DEFINITIONS
// ============================================

const updateRelationshipSettingSchema = z.object({
  targetId: z.string().min(1),
  granularityMode: z.nativeEnum(HeatmapGranularityMode),
  identityMode: z.nativeEnum(HeatmapIdentityMode),
});

// ============================================
// TYPES
// ============================================

interface RelationshipSettingEntry {
  targetId: string;
  name: string | null;
  image: string | null;
  crewLabel: string | null;
  granularityMode: HeatmapGranularityMode;
  identityMode: HeatmapIdentityMode;
}

interface CrewPartnerPreview {
  id: string;
  name: string | null;
  image: string | null;
  city: string | null;
  crewLabel: string | null;
}

// ============================================
// HELPERS
// ============================================

/**
 * Loads the caller's accepted Crew partners, resolving each undirected edge to
 * the other member. De-duplicates by partner id.
 */
async function loadAcceptedCrewPartners(uid: string): Promise<CrewPartnerPreview[]> {
  const edges = await prisma.crew.findMany({
    where: { status: 'ACCEPTED', OR: [{ userAId: uid }, { userBId: uid }] },
    include: { userA: { select: userPreviewSelect }, userB: { select: userPreviewSelect } },
  });

  const byId = new Map<string, CrewPartnerPreview>();
  for (const edge of edges) {
    const partner = edge.userAId === uid ? edge.userB : edge.userA;
    if (partner && !byId.has(partner.id)) {
      byId.set(partner.id, partner);
    }
  }
  return Array.from(byId.values());
}

/** True if targetId is an accepted Crew member of the caller. */
async function isAcceptedCrewMember(uid: string, targetId: string): Promise<boolean> {
  const edge = await prisma.crew.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { userAId: uid, userBId: targetId },
        { userAId: targetId, userBId: uid },
      ],
    },
    select: { id: true },
  });
  return edge !== null;
}

// ============================================
// GET /api/users/relationship-settings
// ============================================

/**
 * GET /api/users/relationship-settings
 * Returns one entry per accepted Crew member, left-joined against the caller's
 * stored per-relationship privacy rows. Members without a stored row fall back
 * to the BLOCK / KNOWN defaults.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const uid = session.user.id;

    const rl = await checkRateLimit(apiRateLimiter, `rel-settings-get:${uid}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const [partners, storedRows] = await Promise.all([
      loadAcceptedCrewPartners(uid),
      prisma.crewRelationshipSetting.findMany({ where: { viewerId: uid } }),
    ]);

    const byTarget = new Map<
      string,
      { granularityMode: HeatmapGranularityMode; identityMode: HeatmapIdentityMode }
    >();
    for (const row of storedRows) {
      byTarget.set(row.targetId, {
        granularityMode: row.granularityMode,
        identityMode: row.identityMode,
      });
    }

    const settings: RelationshipSettingEntry[] = partners.map((partner) => {
      const stored = byTarget.get(partner.id);
      return {
        targetId: partner.id,
        name: partner.name,
        image: partner.image,
        crewLabel: partner.crewLabel,
        granularityMode: stored?.granularityMode ?? DEFAULT_GRANULARITY_MODE,
        identityMode: stored?.identityMode ?? DEFAULT_IDENTITY_MODE,
      };
    });

    // Stable ordering: by name asc, nulls last, then targetId as a tiebreaker.
    settings.sort((a, b) => {
      if (a.name === null && b.name === null) return a.targetId.localeCompare(b.targetId);
      if (a.name === null) return 1;
      if (b.name === null) return -1;
      const byName = a.name.localeCompare(b.name);
      return byName !== 0 ? byName : a.targetId.localeCompare(b.targetId);
    });

    apiLogger.info(
      { uid, count: settings.length },
      '[REL_SETTINGS_GET] Listed relationship settings'
    );

    return NextResponse.json({ success: true, data: { settings } });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[REL_SETTINGS_GET] Failed to list relationship settings');
    return NextResponse.json(
      { success: false, error: 'Failed to list relationship settings' },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH /api/users/relationship-settings
// ============================================

/**
 * PATCH /api/users/relationship-settings
 * Upserts the caller's per-relationship privacy setting for a single target,
 * keyed on the (viewerId, targetId) unique constraint. The target must be an
 * accepted Crew member of the caller.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const uid = session.user.id;

    const rl = await checkRateLimit(apiRateLimiter, `rel-settings-patch:${uid}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = updateRelationshipSettingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { targetId, granularityMode, identityMode } = parsed.data;

    if (targetId === uid) {
      return NextResponse.json(
        { success: false, error: 'Cannot set relationship settings for yourself' },
        { status: 400 }
      );
    }

    const inCrew = await isAcceptedCrewMember(uid, targetId);
    if (!inCrew) {
      return NextResponse.json(
        { success: false, error: 'Not in your Crew' },
        { status: 403 }
      );
    }

    const row = await prisma.crewRelationshipSetting.upsert({
      where: { viewerId_targetId: { viewerId: uid, targetId } },
      create: { viewerId: uid, targetId, granularityMode, identityMode },
      update: { granularityMode, identityMode },
    });

    apiLogger.info(
      { uid, targetId, granularityMode: row.granularityMode, identityMode: row.identityMode },
      '[REL_SETTINGS_PATCH] Upserted relationship setting'
    );

    return NextResponse.json({
      success: true,
      data: {
        setting: {
          targetId: row.targetId,
          granularityMode: row.granularityMode,
          identityMode: row.identityMode,
        },
      },
    });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[REL_SETTINGS_PATCH] Failed to update relationship setting');
    return NextResponse.json(
      { success: false, error: 'Failed to update relationship settings' },
      { status: 500 }
    );
  }
}
