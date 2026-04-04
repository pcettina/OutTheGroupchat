import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getPusherServer } from '@/lib/pusher';
import { logger } from '@/lib/logger';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const pusherAuthSchema = z.object({
  socket_id: z.string().min(1, 'socket_id is required'),
  channel_name: z.string().min(1, 'channel_name is required'),
});

// Pusher channel authentication endpoint
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const rateLimitResult = await checkRateLimit(apiRateLimiter, `pusher:auth:${ip}`);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pusher = getPusherServer();
    if (!pusher) {
      return NextResponse.json({ error: 'Pusher not configured' }, { status: 500 });
    }

    const formData = await req.formData();
    const parsed = pusherAuthSchema.safeParse({
      socket_id: formData.get('socket_id'),
      channel_name: formData.get('channel_name'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Missing required fields', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { socket_id: socketId, channel_name: channelName } = parsed.data;

    // Authorize access to the channel
    // For private channels, ensure user has access
    if (channelName.startsWith('private-')) {
      // Extract tripId or userId from channel name and verify access
      const parts = channelName.split('-');
      const type = parts[1];
      const id = parts[2];

      if (type === 'user' && id !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // For trip channels, you would verify membership here
      // if (type === 'trip') { ... }
    }

    const authResponse = pusher.authorizeChannel(socketId, channelName);

    return NextResponse.json(authResponse);
  } catch (error) {
    logger.error({ error }, '[PUSHER_AUTH] Authentication failed');
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
