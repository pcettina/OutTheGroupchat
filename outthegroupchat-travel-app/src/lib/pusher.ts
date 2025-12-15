import Pusher from 'pusher';
import PusherClient from 'pusher-js';

// Server-side Pusher instance
let pusherServer: Pusher | null = null;

export function getPusherServer() {
  if (!pusherServer) {
    if (
      !process.env.PUSHER_APP_ID ||
      !process.env.PUSHER_KEY ||
      !process.env.PUSHER_SECRET ||
      !process.env.PUSHER_CLUSTER
    ) {
      console.warn('Pusher environment variables not configured');
      return null;
    }

    pusherServer = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER,
      useTLS: true,
    });
  }
  return pusherServer;
}

// Client-side Pusher instance
let pusherClient: PusherClient | null = null;

export function getPusherClient() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!pusherClient) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      console.warn('Pusher client environment variables not configured');
      return null;
    }

    pusherClient = new PusherClient(key, {
      cluster,
      forceTLS: true,
    });
  }
  return pusherClient;
}

// Channel names
export const channels = {
  trip: (tripId: string) => `trip-${tripId}`,
  user: (userId: string) => `user-${userId}`,
  voting: (tripId: string) => `voting-${tripId}`,
} as const;

// Event types
export const events = {
  // Trip events
  TRIP_UPDATED: 'trip:updated',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  ACTIVITY_ADDED: 'activity:added',
  ACTIVITY_UPDATED: 'activity:updated',
  ITINERARY_UPDATED: 'itinerary:updated',
  
  // Survey events
  SURVEY_CREATED: 'survey:created',
  SURVEY_RESPONSE: 'survey:response',
  SURVEY_CLOSED: 'survey:closed',
  
  // Voting events
  VOTE_CAST: 'vote:cast',
  VOTING_CLOSED: 'voting:closed',
  VOTING_RESULTS: 'voting:results',
  
  // User events
  NOTIFICATION: 'notification',
  INVITATION: 'invitation',
} as const;

// Helper to broadcast to trip members
export async function broadcastToTrip(tripId: string, event: string, data: unknown) {
  const pusher = getPusherServer();
  if (!pusher) return;

  try {
    await pusher.trigger(channels.trip(tripId), event, data);
  } catch (error) {
    console.error('Failed to broadcast to trip:', error);
  }
}

// Helper to broadcast to a specific user
export async function broadcastToUser(userId: string, event: string, data: unknown) {
  const pusher = getPusherServer();
  if (!pusher) return;

  try {
    await pusher.trigger(channels.user(userId), event, data);
  } catch (error) {
    console.error('Failed to broadcast to user:', error);
  }
}

