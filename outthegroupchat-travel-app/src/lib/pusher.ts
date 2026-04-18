/**
 * @module pusher
 * @description Pusher integration utilities for real-time event broadcasting. Provides singleton
 * server-side and client-side Pusher instances, typed channel name factories, a constant map of
 * event type strings, and helper functions to broadcast events to trip or user channels.
 */
import Pusher from 'pusher';
import PusherClient from 'pusher-js';

// Server-side Pusher instance
let pusherServer: Pusher | null = null;

/**
 * @description Returns the singleton server-side Pusher instance, creating it on first call.
 * Reads PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, and PUSHER_CLUSTER from environment variables.
 * @returns {Pusher | null} The Pusher server instance, or null if any required env var is missing.
 */
export function getPusherServer() {
  if (!pusherServer) {
    if (
      !process.env.PUSHER_APP_ID ||
      !process.env.PUSHER_KEY ||
      !process.env.PUSHER_SECRET ||
      !process.env.PUSHER_CLUSTER
    ) {
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

/**
 * @description Returns the singleton client-side Pusher instance, creating it on first call.
 * Must be called in a browser context; returns null on the server or when env vars are absent.
 * @returns {PusherClient | null} The Pusher client instance, or null if not in a browser or env vars are missing.
 */
export function getPusherClient() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!pusherClient) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      return null;
    }

    pusherClient = new PusherClient(key, {
      cluster,
      forceTLS: true,
    });
  }
  return pusherClient;
}

/**
 * @description Channel name factory functions for Pusher subscriptions.
 * Provides consistent, typed channel name strings for trip, user, voting, and meetup channels.
 */
export const channels = {
  trip: (tripId: string) => `trip-${tripId}`,
  user: (userId: string) => `user-${userId}`,
  voting: (tripId: string) => `voting-${tripId}`,
  meetup: (meetupId: string) => `meetup-${meetupId}`,
} as const;

/**
 * @description Constant map of all Pusher event type strings used across the application.
 * Covers trip, survey, voting, and user notification events.
 */
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

  // Meetup events
  MEETUP_UPDATED: 'meetup:updated',
  MEETUP_CANCELLED: 'meetup:cancelled',
  ATTENDEE_JOINED: 'attendee:joined',
  ATTENDEE_LEFT: 'attendee:left',
} as const;

/**
 * @description Broadcasts a Pusher event to the channel associated with a specific trip.
 * Silently skips if the server instance is unavailable; broadcast failures are non-fatal.
 * @param {string} tripId - The ID of the trip whose channel should receive the event.
 * @param {string} event - The Pusher event name to trigger.
 * @param {unknown} data - The payload to send with the event.
 * @returns {Promise<void>}
 */
export async function broadcastToTrip(tripId: string, event: string, data: unknown) {
  const pusher = getPusherServer();
  if (!pusher) return;

  try {
    await pusher.trigger(channels.trip(tripId), event, data);
  } catch {
    // Broadcast failures are non-fatal
  }
}

/**
 * @description Broadcasts a Pusher event to the channel associated with a specific user.
 * Silently skips if the server instance is unavailable; broadcast failures are non-fatal.
 * @param {string} userId - The ID of the user whose channel should receive the event.
 * @param {string} event - The Pusher event name to trigger.
 * @param {unknown} data - The payload to send with the event.
 * @returns {Promise<void>}
 */
export async function broadcastToUser(userId: string, event: string, data: unknown) {
  const pusher = getPusherServer();
  if (!pusher) return;

  try {
    await pusher.trigger(channels.user(userId), event, data);
  } catch {
    // Broadcast failures are non-fatal
  }
}

/**
 * @description Broadcasts a Pusher event to the channel associated with a specific meetup.
 * Silently skips if the server instance is unavailable; broadcast failures are non-fatal.
 * @param {string} meetupId - The ID of the meetup whose channel should receive the event.
 * @param {string} event - The Pusher event name to trigger.
 * @param {unknown} data - The payload to send with the event.
 * @returns {Promise<void>}
 */
export async function broadcastToMeetup(meetupId: string, event: string, data: unknown) {
  const pusher = getPusherServer();
  if (!pusher) return;

  try {
    await pusher.trigger(channels.meetup(meetupId), event, data);
  } catch {
    // Broadcast failures are non-fatal
  }
}

