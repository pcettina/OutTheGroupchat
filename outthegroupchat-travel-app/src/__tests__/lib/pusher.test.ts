/**
 * Unit tests for src/lib/pusher.ts
 *
 * Strategy
 * --------
 * - Mock the 'pusher' npm package so no real network connections are made.
 * - Mock 'pusher-js' for the client-side path (getPusherClient returns null
 *   in Node.js test environment because `window` is undefined).
 * - The module uses module-level singletons (pusherServer, pusherClient).
 *   Tests that need fresh singleton state use vi.resetModules() + vi.doMock()
 *   + dynamic re-import so each test gets a clean module instance.
 * - Tests that only test pure helpers (channels, events) use the static import.
 * - All async mocks use mockResolvedValueOnce() to prevent state leakage.
 * - vi.clearAllMocks() runs in beforeEach to reset call counts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Static-import-only tests (channels, events, getPusherClient in node env)
// use the top-level static import. Tests that need singleton isolation use
// vi.resetModules() + dynamic import inside the test body.
// ---------------------------------------------------------------------------
import {
  channels,
  events,
  getPusherClient,
} from '@/lib/pusher';

// ---------------------------------------------------------------------------
// Helpers shared across tests
// ---------------------------------------------------------------------------
const PUSHER_ENV = {
  PUSHER_APP_ID: 'test-app-id',
  PUSHER_KEY: 'test-key',
  PUSHER_SECRET: 'test-secret',
  PUSHER_CLUSTER: 'us2',
  NEXT_PUBLIC_PUSHER_KEY: 'test-public-key',
  NEXT_PUBLIC_PUSHER_CLUSTER: 'us2',
};

function setEnv(overrides: Record<string, string | undefined> = {}) {
  // First apply the full base env
  Object.assign(process.env, PUSHER_ENV);
  // Then apply overrides: undefined means delete the key
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEnv() {
  for (const key of Object.keys(PUSHER_ENV)) {
    delete process.env[key];
  }
}

/**
 * Build a fresh pusher module with its own mocked Pusher constructor.
 * Returns both the module exports and the mock trigger/constructor so
 * callers can assert on them.
 *
 * Must be called AFTER vi.resetModules() to guarantee the singleton is null.
 */
async function freshPusherModule() {
  const mockTrigger = vi.fn();
  const mockAuthorizeChannel = vi.fn();
  const MockPusherClass = vi.fn().mockImplementation(function () {
    return { trigger: mockTrigger, authorizeChannel: mockAuthorizeChannel };
  });
  const MockPusherClientClass = vi.fn().mockImplementation(function () {
    return { subscribe: vi.fn(), unsubscribe: vi.fn() };
  });

  vi.doMock('pusher', () => ({ default: MockPusherClass }));
  vi.doMock('pusher-js', () => ({ default: MockPusherClientClass }));

  const mod = await import('@/lib/pusher');
  return { mod, MockPusherClass, mockTrigger, mockAuthorizeChannel };
}

// ---------------------------------------------------------------------------
// beforeEach / afterEach
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  clearEnv();
});

// ===========================================================================
// channels — channel name factory functions
// ===========================================================================
describe('channels', () => {
  it('channels.trip returns the correct channel name', () => {
    expect(channels.trip('abc123')).toBe('trip-abc123');
  });

  it('channels.user returns the correct channel name', () => {
    expect(channels.user('user99')).toBe('user-user99');
  });

  it('channels.voting returns the correct channel name', () => {
    expect(channels.voting('trip-xyz')).toBe('voting-trip-xyz');
  });

  it('all three channel types produce distinct names for the same id', () => {
    const id = 'same-id';
    expect(channels.trip(id)).not.toBe(channels.user(id));
    expect(channels.trip(id)).not.toBe(channels.voting(id));
    expect(channels.user(id)).not.toBe(channels.voting(id));
  });

  it('channels.trip embeds the tripId verbatim', () => {
    const tripId = 'clh7nz5vr0000mg0hb9gkfxe0';
    expect(channels.trip(tripId)).toContain(tripId);
  });
});

// ===========================================================================
// events — constant map
// ===========================================================================
describe('events', () => {
  it('trip events have correct string values', () => {
    expect(events.TRIP_UPDATED).toBe('trip:updated');
    expect(events.MEMBER_JOINED).toBe('member:joined');
    expect(events.MEMBER_LEFT).toBe('member:left');
    expect(events.ACTIVITY_ADDED).toBe('activity:added');
    expect(events.ACTIVITY_UPDATED).toBe('activity:updated');
    expect(events.ITINERARY_UPDATED).toBe('itinerary:updated');
  });

  it('survey events have correct string values', () => {
    expect(events.SURVEY_CREATED).toBe('survey:created');
    expect(events.SURVEY_RESPONSE).toBe('survey:response');
    expect(events.SURVEY_CLOSED).toBe('survey:closed');
  });

  it('voting events have correct string values', () => {
    expect(events.VOTE_CAST).toBe('vote:cast');
    expect(events.VOTING_CLOSED).toBe('voting:closed');
    expect(events.VOTING_RESULTS).toBe('voting:results');
  });

  it('user events have correct string values', () => {
    expect(events.NOTIFICATION).toBe('notification');
    expect(events.INVITATION).toBe('invitation');
  });

  it('events object has exactly 14 keys', () => {
    expect(Object.keys(events)).toHaveLength(14);
  });
});

// ===========================================================================
// getPusherClient — always returns null in Node.js test environment
// ===========================================================================
describe('getPusherClient', () => {
  it('returns null because window is not defined in Node.js test environment', () => {
    expect(typeof window).toBe('undefined');
    const result = getPusherClient();
    expect(result).toBeNull();
  });
});

// ===========================================================================
// getPusherServer — initialization and singleton behaviour
// ===========================================================================
describe('getPusherServer', () => {
  it('returns null when all Pusher env vars are missing', async () => {
    clearEnv();
    vi.resetModules();
    const { mod } = await freshPusherModule();
    expect(mod.getPusherServer()).toBeNull();
  });

  it('returns null when PUSHER_APP_ID is missing', async () => {
    setEnv({ PUSHER_APP_ID: undefined });
    vi.resetModules();
    const { mod } = await freshPusherModule();
    expect(mod.getPusherServer()).toBeNull();
  });

  it('returns null when PUSHER_KEY is missing', async () => {
    setEnv({ PUSHER_KEY: undefined });
    vi.resetModules();
    const { mod } = await freshPusherModule();
    expect(mod.getPusherServer()).toBeNull();
  });

  it('returns null when PUSHER_SECRET is missing', async () => {
    setEnv({ PUSHER_SECRET: undefined });
    vi.resetModules();
    const { mod } = await freshPusherModule();
    expect(mod.getPusherServer()).toBeNull();
  });

  it('returns null when PUSHER_CLUSTER is missing', async () => {
    setEnv({ PUSHER_CLUSTER: undefined });
    vi.resetModules();
    const { mod } = await freshPusherModule();
    expect(mod.getPusherServer()).toBeNull();
  });

  it('creates a Pusher instance with correct config when all env vars are set', async () => {
    setEnv();
    vi.resetModules();
    const { mod, MockPusherClass } = await freshPusherModule();

    const instance = mod.getPusherServer();
    expect(instance).not.toBeNull();
    expect(MockPusherClass).toHaveBeenCalledOnce();
    expect(MockPusherClass).toHaveBeenCalledWith({
      appId: 'test-app-id',
      key: 'test-key',
      secret: 'test-secret',
      cluster: 'us2',
      useTLS: true,
    });
  });

  it('passes useTLS: true in the server config', async () => {
    setEnv();
    vi.resetModules();
    const { mod, MockPusherClass } = await freshPusherModule();

    mod.getPusherServer();
    const callArg = MockPusherClass.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.useTLS).toBe(true);
  });

  it('returns the same singleton instance on repeated calls', async () => {
    setEnv();
    vi.resetModules();
    const { mod, MockPusherClass } = await freshPusherModule();

    const first = mod.getPusherServer();
    const second = mod.getPusherServer();
    expect(first).toBe(second);
    // Constructor must be called only once
    expect(MockPusherClass).toHaveBeenCalledOnce();
  });

  it('returns a non-null object with a trigger method', async () => {
    setEnv();
    vi.resetModules();
    const { mod } = await freshPusherModule();

    const instance = mod.getPusherServer();
    expect(instance).not.toBeNull();
    expect(typeof (instance as unknown as Record<string, unknown>).trigger).toBe('function');
  });
});

// ===========================================================================
// broadcastToTrip
// ===========================================================================
describe('broadcastToTrip', () => {
  it('calls pusher.trigger with the correct trip channel and event', async () => {
    setEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    mockTrigger.mockResolvedValueOnce({ status: 200 });
    await mod.broadcastToTrip('trip-123', events.TRIP_UPDATED, { updated: true });

    expect(mockTrigger).toHaveBeenCalledOnce();
    expect(mockTrigger).toHaveBeenCalledWith('trip-trip-123', 'trip:updated', { updated: true });
  });

  it('uses channels.trip() naming convention for the channel', async () => {
    setEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    mockTrigger.mockResolvedValueOnce({ status: 200 });
    const tripId = 'my-trip-id';
    await mod.broadcastToTrip(tripId, 'test-event', {});

    const calledChannel = mockTrigger.mock.calls[0][0] as string;
    expect(calledChannel).toBe(mod.channels.trip(tripId));
  });

  it('passes arbitrary payload data through to trigger', async () => {
    setEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    mockTrigger.mockResolvedValueOnce({ status: 200 });
    const payload = { userId: 'u1', action: 'joined', timestamp: 12345 };
    await mod.broadcastToTrip('trip-xyz', events.MEMBER_JOINED, payload);

    expect(mockTrigger).toHaveBeenCalledWith('trip-trip-xyz', 'member:joined', payload);
  });

  it('does not throw when Pusher server is unavailable (env vars missing)', async () => {
    clearEnv();
    vi.resetModules();
    const { mod } = await freshPusherModule();

    await expect(
      mod.broadcastToTrip('trip-123', events.TRIP_UPDATED, {})
    ).resolves.toBeUndefined();
  });

  it('swallows errors when pusher.trigger rejects', async () => {
    setEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    mockTrigger.mockRejectedValueOnce(new Error('Pusher network error'));

    // broadcastToTrip must NOT propagate the error
    await expect(
      mod.broadcastToTrip('trip-abc', events.ACTIVITY_ADDED, { id: 1 })
    ).resolves.toBeUndefined();
  });

  it('does not call trigger when env vars are missing', async () => {
    clearEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    await mod.broadcastToTrip('trip-123', events.TRIP_UPDATED, {});
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// broadcastToUser
// ===========================================================================
describe('broadcastToUser', () => {
  it('calls pusher.trigger with the correct user channel and event', async () => {
    setEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    mockTrigger.mockResolvedValueOnce({ status: 200 });
    await mod.broadcastToUser('user-456', events.NOTIFICATION, { message: 'hello' });

    expect(mockTrigger).toHaveBeenCalledOnce();
    expect(mockTrigger).toHaveBeenCalledWith('user-user-456', 'notification', { message: 'hello' });
  });

  it('uses channels.user() naming convention for the channel', async () => {
    setEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    mockTrigger.mockResolvedValueOnce({ status: 200 });
    const userId = 'my-user-id';
    await mod.broadcastToUser(userId, 'custom-event', { key: 'val' });

    const calledChannel = mockTrigger.mock.calls[0][0] as string;
    expect(calledChannel).toBe(mod.channels.user(userId));
  });

  it('passes invitation payload data through to trigger', async () => {
    setEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    mockTrigger.mockResolvedValueOnce({ status: 200 });
    const payload = { tripId: 'trip-1', invitedBy: 'u-host', role: 'member' };
    await mod.broadcastToUser('u-guest', events.INVITATION, payload);

    expect(mockTrigger).toHaveBeenCalledWith('user-u-guest', 'invitation', payload);
  });

  it('does not throw when Pusher server is unavailable (env vars missing)', async () => {
    clearEnv();
    vi.resetModules();
    const { mod } = await freshPusherModule();

    await expect(
      mod.broadcastToUser('user-789', events.NOTIFICATION, {})
    ).resolves.toBeUndefined();
  });

  it('swallows errors when pusher.trigger rejects for user broadcast', async () => {
    setEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    mockTrigger.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(
      mod.broadcastToUser('user-abc', events.INVITATION, { tripId: 't1' })
    ).resolves.toBeUndefined();
  });

  it('does not call trigger when env vars are missing', async () => {
    clearEnv();
    vi.resetModules();
    const { mod, mockTrigger } = await freshPusherModule();

    await mod.broadcastToUser('user-123', events.NOTIFICATION, {});
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});
