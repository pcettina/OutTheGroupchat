import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPusherServer } from '@/lib/pusher';

// Pusher channel authentication endpoint
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pusher = getPusherServer();
    if (!pusher) {
      return NextResponse.json({ error: 'Pusher not configured' }, { status: 500 });
    }

    const formData = await req.formData();
    const socketId = formData.get('socket_id') as string;
    const channelName = formData.get('channel_name') as string;

    if (!socketId || !channelName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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
    console.error('[PUSHER_AUTH]', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

