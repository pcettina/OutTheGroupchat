import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { getFofSet } from '@/lib/heatmap/fof-graph';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const DEFAULT_LIMIT = 20;

interface SuggestionItem {
  id: string;
  name: string | null;
  image: string | null;
  city: string | null;
  mutualCount: number;
}

/**
 * GET /api/crew/suggestions
 *
 * "People you may know" — friend-of-friend (FoF) Crew suggestions for the
 * authenticated viewer, ranked by mutual-Crew count (desc).
 *
 * Source: {@link getFofSet}, which already excludes the viewer and their
 * existing accepted Crew, and returns entries pre-sorted by `mutualCount`. This
 * route additionally filters out:
 *   - users the viewer has blocked or been blocked by (fof-graph does not),
 *   - users with a PENDING Crew edge to the viewer (already-requested), so we
 *     never re-suggest someone the viewer is mid-request with.
 *
 * Query params:
 *   - `limit` (optional): 1–50, defaults to 20.
 *
 * @returns `{ success: true, data: { items: SuggestionItem[] } }`
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `crew-suggestions:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const parsed = querySchema.safeParse({
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const viewerId = session.user.id;
    const limit = parsed.data.limit ?? DEFAULT_LIMIT;

    // Pre-sorted by mutualCount desc; already excludes viewer + accepted Crew.
    const fof = await getFofSet({ viewerId });

    // fof-graph does NOT exclude blocked users — filter them inline.
    const blocks = await prisma.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const hiddenIds = new Set(
      (blocks ?? [])
        .flatMap((b) => [b.blockerId, b.blockedId])
        .filter((id) => id !== viewerId)
    );

    // Exclude anyone with a PENDING Crew edge to the viewer (already requested).
    const pendingEdges = await prisma.crew.findMany({
      where: {
        status: 'PENDING',
        OR: [{ userAId: viewerId }, { userBId: viewerId }],
      },
      select: { userAId: true, userBId: true },
    });
    for (const edge of pendingEdges) {
      hiddenIds.add(edge.userAId === viewerId ? edge.userBId : edge.userAId);
    }

    // Preserve the mutualCount ordering from getFofSet.
    const ranked = fof.filter((e) => !hiddenIds.has(e.userId)).slice(0, limit);

    if (ranked.length === 0) {
      return NextResponse.json({ success: true, data: { items: [] } });
    }

    const ids = ranked.map((e) => e.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, image: true, city: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const items: SuggestionItem[] = ranked
      .map((e) => {
        const u = userById.get(e.userId);
        if (!u) return null;
        return {
          id: u.id,
          name: u.name,
          image: u.image,
          city: u.city,
          mutualCount: e.mutualCount,
        };
      })
      .filter((item): item is SuggestionItem => item !== null);

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CREW_SUGGESTIONS_GET] Failed to load Crew suggestions');
    return NextResponse.json(
      { success: false, error: 'Failed to load Crew suggestions' },
      { status: 500 }
    );
  }
}
