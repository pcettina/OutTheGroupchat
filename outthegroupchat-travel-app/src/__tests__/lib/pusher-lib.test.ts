/**
 * Unit tests for src/lib/pusher.ts
 *
 * Strategy
 * --------
 * pusher.ts creates module-level singletons (pusherServer, pusherClient).
 * To test initialisation under different env conditions each test that touches
 * singleton state must:
 *   1. Set process.env vars inline (before vi.resetModules)
 *   2. Call vi.resetModules() exactly once
 *   3. Dynamically import @/lib/pusher
 *
 * IMPORTANT: vi.resetModules() must be called inline in each test body, never
 * inside a shared helper function.  Calling it inside a helper causes the
 * hoisted vi.mock() factory registrations to be lost on subsequent calls,
 * making the real (unmocked) Pusher constructor load instead of the mock.
 *
 * Test groups:
 *  1. channels        — pure factory functions; static import, no reset needed.
 *  2. events          — constant string map; static import, no reset needed.
 *  3. getPusherServer — env-var-driven singleton (null / non-null paths).
 *  4. getPusherClient — always null in the Node test environment.
 *  5. broadcastToTrip — calls pusher.trigger() with correct args.
 *  6. broadcastToUser — calls pusher.trigger() with correct args.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted vi.mock declarations.  These factories are re-applied on each
// vi.resetModules() + dynamic import, provided the reset is called inline
// in the test body (not inside a helper).
// ---------------------------------------------------------------------------
const mockTrigger = vi.fn();

vi.mock('pusher', () => ({
  default: function MockPusherServer(this: Record<string, unknown>) {
    this.trigger = mockTrigger;
    this.authorizeChannel = vi.fn();
  },
}));

vi.mock('pusher-js', () => ({
  default: function MockPusherClient(
    this: Record<string, unknown>,
    key: string,
  ) {
    this._key = key;
  },
}));

// ---------------------------------------------------------------------------
// Static import — used only for pure-value tests (channels, events) that do
// not depend on singleton state or env vars.
// ---------------------------------------------------------------------------
import { channels, events } from '@/lib/pusher';

// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1. channels — channel name factory functions
// ===========================================================================
describe('channels', () => {
  it('channels.trip returns the correct format string', () => {
    expect(channels.trip('trip-001')).toBe('trip-trip-001');
  });

  it('channels.user returns the correct format string', () => {
    expect(channels.user('user-999')).toBe('user-user-999');
  });

  it('channels.voting returns the correct format string', () => {
    expect(channels.voting('trip-002')).toBe('voting-trip-002');
  });

  it('channels.trip interpolates an arbitrary ID without transformation', () => {
    expect(channels.trip('abc123')).toBe('trip-abc123');
  });

  it('channels.user interpolates an arbitrary ID without transformation', () => {
    expect(channels.user('xyz789')).toBe('user-xyz789');
  });
});

// ===========================================================================
// 2. events — constant event key map
// ===========================================================================
describe('events constants', () => {
  it('TRIP_UPDATED equals "trip:updated"', () => {
    expect(events.TRIP_UPDATED).toBe('trip:updated');
  });

  it('MEMBER_JOINED equals "member:joined"', () => {
    expect(events.MEMBER_JOINED).toBe('member:joined');
  });

  it('MEMBER_LEFT equals "member:left"', () => {
    expect(events.MEMBER_LEFT).toBe('member:left');
  });

  it('ACTIVITY_ADDED equals "activity:added"', () => {
    expect(events.ACTIVITY_ADDED).toBe('activity:added');
  });

  it('ACTIVITY_UPDATED equals "activity:updated"', () => {
    expect(events.ACTIVITY_UPDATED).toBe('activity:updated');
  });

  it('ITINERARY_UPDATED equals "itinerary:updated"', () => {
    expect(events.ITINERARY_UPDATED).toBe('itinerary:updated');
  });

  it('SURVEY_CREATED equals "survey:created"', () => {
    expect(events.SURVEY_CREATED).toBe('survey:created');
  });

  it('SURVEY_RESPONSE equals "survey:response"', () => {
    expect(events.SURVEY_RESPONSE).toBe('survey:response');
  });

  it('SURVEY_CLOSED equals "survey:closed"', () => {
    expect(events.SURVEY_CLOSED).toBe('survey:closed');
  });

  it('VOTE_CAST equals "vote:cast"', () => {
    expect(events.VOTE_CAST).toBe('vote:cast');
  });

  it('VOTING_CLOSED equals "voting:closed"', () => {
    expect(events.VOTING_CLOSED).toBe('voting:closed');
  });

  it('VOTING_RESULTS equals "voting:results"', () => {
    expect(events.VOTING_RESULTS).toBe('voting:results');
  });

  it('NOTIFICATION equals "notification"', () => {
    expect(events.NOTIFICATION).toBe('notification');
  });

  it('INVITATION equals "invitation"', () => {
    expect(events.INVITATION).toBe('invitation');
  });
});

// ===========================================================================
// 3. getPusherServer — singleton under different env conditions
//
// Each test sets env vars inline, calls vi.resetModules(), then imports fresh.
// ===========================================================================
describe('getPusherServer', () => {
  it('returns null when PUSHER_APP_ID is missing', async () => {
    delete process.env.PUSHER_APP_ID;
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    expect(mod.getPusherServer()).toBeNull();
  });

  it('returns null when PUSHER_KEY is missing', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    delete process.env.PUSHER_KEY;
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    expect(mod.getPusherServer()).toBeNull();
  });

  it('returns null when PUSHER_SECRET is missing', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    delete process.env.PUSHER_SECRET;
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    expect(mod.getPusherServer()).toBeNull();
  });

  it('returns null when PUSHER_CLUSTER is missing', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    delete process.env.PUSHER_CLUSTER;
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    expect(mod.getPusherServer()).toBeNull();
  });

  it('returns null when all server env vars are absent', async () => {
    delete process.env.PUSHER_APP_ID;
    delete process.env.PUSHER_KEY;
    delete process.env.PUSHER_SECRET;
    delete process.env.PUSHER_CLUSTER;
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    expect(mod.getPusherServer()).toBeNull();
  });

  it('returns a non-null instance when all server env vars are present', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    expect(mod.getPusherServer()).not.toBeNull();
  });

  it('returns the same singleton instance on successive calls', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    const first = mod.getPusherServer();
    const second = mod.getPusherServer();
    expect(first).toBe(second);
  });
});

// ===========================================================================
// 4. getPusherClient — always null in Node (no window object)
// ===========================================================================
describe('getPusherClient', () => {
  it('returns null in a Node environment where window is undefined', async () => {
    // vitest runs with environment: 'node' — typeof window === 'undefined'
    process.env.NEXT_PUBLIC_PUSHER_KEY = 'client-key';
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    expect(mod.getPusherClient()).toBeNull();
  });

  it('returns null when NEXT_PUBLIC_PUSHER_KEY is missing', async () => {
    delete process.env.NEXT_PUBLIC_PUSHER_KEY;
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    expect(mod.getPusherClient()).toBeNull();
  });

  it('returns null when NEXT_PUBLIC_PUSHER_CLUSTER is missing', async () => {
    process.env.NEXT_PUBLIC_PUSHER_KEY = 'client-key';
    delete process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    expect(mod.getPusherClient()).toBeNull();
  });
});

// ===========================================================================
// 5. broadcastToTrip
//
// Re-imports with all server env vars set so MockPusherServer is instantiated
// and mockTrigger is assigned.  The broadcast function then calls
// pusher.trigger() via the module's internal singleton reference.
// ===========================================================================
describe('broadcastToTrip', () => {
  it('calls pusher.trigger with the correct trip channel and event', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    mod.getPusherServer(); // initialise singleton

    mockTrigger.mockResolvedValueOnce(undefined);
    await mod.broadcastToTrip('trip-abc', 'trip:updated', { foo: 'bar' });

    expect(mockTrigger).toHaveBeenCalledWith(
      'trip-trip-abc',
      'trip:updated',
      { foo: 'bar' },
    );
  });

  it('calls pusher.trigger with the correct data payload', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    mod.getPusherServer();

    const payload = { memberId: 'u-1', action: 'join' };
    mockTrigger.mockResolvedValueOnce(undefined);
    await mod.broadcastToTrip('trip-xyz', 'member:joined', payload);

    expect(mockTrigger).toHaveBeenCalledWith(
      'trip-trip-xyz',
      'member:joined',
      payload,
    );
  });

  it('resolves silently (no throw) when the server instance is unavailable', async () => {
    delete process.env.PUSHER_APP_ID;
    delete process.env.PUSHER_KEY;
    delete process.env.PUSHER_SECRET;
    delete process.env.PUSHER_CLUSTER;
    vi.resetModules();
    const mod = await import('@/lib/pusher');

    await expect(
      mod.broadcastToTrip('trip-1', 'trip:updated', {}),
    ).resolves.toBeUndefined();
  });

  it('does not call trigger when the server instance is unavailable', async () => {
    delete process.env.PUSHER_APP_ID;
    delete process.env.PUSHER_KEY;
    delete process.env.PUSHER_SECRET;
    delete process.env.PUSHER_CLUSTER;
    vi.resetModules();
    const mod = await import('@/lib/pusher');

    await mod.broadcastToTrip('trip-no-server', 'trip:updated', {});

    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('resolves without throwing when pusher.trigger() rejects', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    mod.getPusherServer();

    mockTrigger.mockRejectedValueOnce(new Error('Pusher connection error'));

    await expect(
      mod.broadcastToTrip('trip-err', 'trip:updated', {}),
    ).resolves.toBeUndefined();
  });
});

// ===========================================================================
// 6. broadcastToUser
// ===========================================================================
describe('broadcastToUser', () => {
  it('calls pusher.trigger with the correct user channel and event', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    mod.getPusherServer();

    mockTrigger.mockResolvedValueOnce(undefined);
    await mod.broadcastToUser('user-123', 'notification', { message: 'hello' });

    expect(mockTrigger).toHaveBeenCalledWith(
      'user-user-123',
      'notification',
      { message: 'hello' },
    );
  });

  it('calls pusher.trigger with the correct data payload', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    mod.getPusherServer();

    const payload = { tripId: 'trip-99', invitedBy: 'alice' };
    mockTrigger.mockResolvedValueOnce(undefined);
    await mod.broadcastToUser('user-456', 'invitation', payload);

    expect(mockTrigger).toHaveBeenCalledWith(
      'user-user-456',
      'invitation',
      payload,
    );
  });

  it('resolves silently (no throw) when the server instance is unavailable', async () => {
    delete process.env.PUSHER_APP_ID;
    delete process.env.PUSHER_KEY;
    delete process.env.PUSHER_SECRET;
    delete process.env.PUSHER_CLUSTER;
    vi.resetModules();
    const mod = await import('@/lib/pusher');

    await expect(
      mod.broadcastToUser('user-1', 'notification', {}),
    ).resolves.toBeUndefined();
  });

  it('does not call trigger when the server instance is unavailable', async () => {
    delete process.env.PUSHER_APP_ID;
    delete process.env.PUSHER_KEY;
    delete process.env.PUSHER_SECRET;
    delete process.env.PUSHER_CLUSTER;
    vi.resetModules();
    const mod = await import('@/lib/pusher');

    await mod.broadcastToUser('user-no-server', 'notification', {});

    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('resolves without throwing when pusher.trigger() rejects', async () => {
    process.env.PUSHER_APP_ID = 'app-123';
    process.env.PUSHER_KEY = 'key-abc';
    process.env.PUSHER_SECRET = 'secret-xyz';
    process.env.PUSHER_CLUSTER = 'us2';
    vi.resetModules();
    const mod = await import('@/lib/pusher');
    mod.getPusherServer();

    mockTrigger.mockRejectedValueOnce(new Error('Pusher trigger failed'));

    await expect(
      mod.broadcastToUser('user-err', 'notification', {}),
    ).resolves.toBeUndefined();
  });
});
