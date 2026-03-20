import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { searchImages, isUnsplashConfigured } from '@/lib/api/unsplash';
import { z } from 'zod';

const ImageSearchQuerySchema = z.object({
  q: z.string().min(1, 'Query parameter "q" must be a non-empty string'),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(30).optional().default(12),
});

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isUnsplashConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Image search not configured' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(req.url);

    const parsed = ImageSearchQuerySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      perPage: searchParams.get('perPage') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { q: query, page, perPage } = parsed.data;

    const result = await searchImages(`${query.trim()} travel`, page, perPage, 'landscape');

    // Return simplified results to client
    const images = result.results.map((img) => ({
      id: img.id,
      url: img.urls.regular,
      smallUrl: img.urls.small,
      thumbUrl: img.urls.thumb,
      alt: img.alt_description || img.description || query,
      width: img.width,
      height: img.height,
      photographer: img.user.name,
      photographerUrl: img.user.links.html,
      unsplashUrl: img.links.html,
    }));

    return NextResponse.json({
      success: true,
      data: images,
      total: result.total,
      totalPages: result.total_pages,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to search images' },
      { status: 500 }
    );
  }
}
