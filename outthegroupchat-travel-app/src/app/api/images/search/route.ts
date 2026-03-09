import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { searchImages, isUnsplashConfigured } from '@/lib/api/unsplash';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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
    const query = searchParams.get('q');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('perPage') || '12', 10), 30);

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

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
