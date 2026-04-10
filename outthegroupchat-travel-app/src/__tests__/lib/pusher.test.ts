/**
 * Unit tests for src/lib/pusher.ts
 *
 * Strategy
 * --------
 * pusher.ts holds module-level singletons (pusherServer, pusherClient) that
 * are initialised lazily on first call.  To test different env var
 * configurations we use vi.resetModules() + dynamic import inside each test
 * so that the singleton starts as null for every scenario.
 *
 * The 'pusher' and 'pusher-js' packages are mocked via vi.mock() factories
 * that use regular functions (not arrow functions) so that `new Pusher(...)`
 * works correctly inside the module under test.
 *
 * Pure exports (channels, events) are imported statically — they hold no
 * state and the mock does not affect them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared spy for the trigger method — reconfigured per test with mockResolvedValueOnce.
// Declared at module scope so the vi.mock() factory can close over it.
// ---------------------------------------------------------------------------
const mockTrigger = vi.fn();

// ---------------------------------------------------------------------------
// Module-level mock: 'pusher' (server SDK).
// IMPORTANT: The factory must return a proper constructor function (not an
// arrow function) so that `new Pusher(...)` inside pusher.ts succeeds.
// ---------------------------------------------------------------------------
vi.mock('pusher', () => {
  // We capture the outer mockTrigger in a closure and expose it through a
  // real constructor function so 'new Pusher(...)' works.
  // eslint-disable-next-line prefer-arrow-callback
  function MockPusher() {
    // @ts-expect-error — this is a mock constructor
    this.trigger = mockTrigger;
  }
  return { default: vi.fn().mockImplementation(function(this: unknown, ...args: unknown[]) {
    // Record constructor args on MockPusher so we can assert on them.
    return new (MockPusher as unknown as new () => { trigger: typeof mockTrigger })();
  }), _MockPusher: MockPusher };
});

// ---------------------------------------------------------------------------
// Module-level mock: 'pusher-js' (client SDK).
// Also uses a proper function constructor.
// ---------------------------------------------------------------------------
vi.mock('pusher-js', () => {
  function MockPusherClient() {
    // @ts-expect-error — mock constructor
    this.subscribe = vi.fn();
    // @ts-expect-error — mock constructor
    this.unsubscribe = vi.fn();
    // @ts-expect-error — mock constructor
    this.disconnect = vi.fn();
  }
  return { default: vi.fn().mockImplementation(function(this: unknown) {
    return new (MockPusherClient as unknown as new () => unknown)();
  }) };
});

// ---------------------------------------------------------------------------
// Static imports for pure exports (channels, events).
// ---------------------------------------------------------------------------
import { channels, events } from '@/lib/pusher';

// Typed reference to the mocked Pusher constructor for call-arg assertions.
import MockedPusherModule from 'pusher';
const MockPusherCtor = vi.mocked(MockedPusherModule as unknown as new (...args: unknown[]) => { trigger: typeof mockTrigger });

import MockedPusherClientModule from 'pusher-js';
const MockPusherClientCtor = vi.mocked(MockedPusherClientModule as unknown as new (...args: unknown[]) => unknown);

// ---------------------------------------------------------------------------
// Shared env var helpers
// ---------------------------------------------------------------------------
const SERVER_ENV: Record<string, string> = {
  PUSHER_APP_ID: 'test-app-id',
  PUSHER_KEY: 'test-key',
  PUSHER_SECRET: 'test-secret',
  PUSHER_CLUSTER: 'us2',
};

function setServerEnv() {
  for (const [k, v] of Object.entries(SERVER_ENV)) {
    process.env[k] = v;
  }
}

function clearServerEnv() {
  for (const key of Object.keys(SERVER_ENV)) {
    delete process.env[key];
  }
}

// ===========================================================================
// channels — pure channel name factory functions
// ===========================================================================
describe('channels', () => {
  it('trip() returns the correct channel string', () => {
    expect(channels.trip('abc-123')).toBe('trip-abc-123');
  });

  it('user() returns the correct channel string', () => {
    expect(channels.user('user-456')).toBe('user-user-456');
  });

  it('voting() returns the correct channel string', () => {
    expect(channels.voting('trip-789')).toBe('voting-trip-789');
  });

  it('each factory produces unique strings for different IDs', () => {
    expect(channels.trip('A')).not.toBe(channels.trip('B'));
    expect(channels.user('A')).not.toBe(channels.user('B'));
    expect(channels.voting('A')).not.toBe(channels.voting('B'));
  });
});

// ===========================================================================
// events — constant event name map
// ===========================================================================
describe('events', () => {
  it('TRIP_UPDATED equals "trip:updated"', () => {
    expect(events.TRIP_UPDATED).toBe('trip:updated');
  });

  it('MEMBER_JOINED equals "member:joined"', () => {
    expect(events.MEMBER_JOINED).toBe('member:joined');
  });

  it('VOTE_CAST equals "vote:cast"', () => {
    expect(events.VOTE_CAST).toBe('vote:cast');
  });

  it('NOTIFICATION equals "notification"', () => {
    expect(events.NOTIFICATION).toBe('notification');
  });

  it('INVITATION equals "invitation"', () => {
    expect(events.INVITATION).toBe('invitation');
  });

  it('exports all expected event keys', () => {
    const keys = Object.keys(events);
    expect(keys).toContain('TRIP_UPDATED');
    expect(keys).toContain('MEMBER_JOINED');
    expect(keys).toContain('MEMBER_LEFT');
    expect(keys).toContain('SURVEY_CREATED');
    expect(keys).toContain('VOTE_CAST');
    expect(keys).toContain('VOTING_CLOSED');
    expect(keys).toContain('NOTIFICATION');
    expect(keys).toContain('INVITATION');
  });
});

// ===========================================================================
// getPusherServer — singleton server-side instance
// ===========================================================================
describe('getPusherServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearServerEnv();
  });

  afterEach(() => {
    clearServerEnv();
  });

  it('returns null when PUSHER env vars are missing', async () => {
    vi.resetModules();
    // No env vars set — module loads fresh with no vars, must return null.
    const { getPusherServer: fresh } = await import('@/lib/pusher');
    expect(fresh()).toBeNull();
  });

  it('constructs Pusher with correct env var values when all vars are present', async () => {
    vi.resetModules();
    setServerEnv();
    MockPusherCtor.mockClear();

    const { getPusherServer: fresh } = await import('@/lib/pusher');
    const instance = fresh();

    expect(instance).not.toBeNull();
    expect(MockPusherCtor).toHaveBeenCalledOnce();
    const callArg = MockPusherCtor.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.appId).toBe(SERVER_ENV.PUSHER_APP_ID);
    expect(callArg.key).toBe(SERVER_ENV.PUSHER_KEY);
    expect(callArg.secret).toBe(SERVER_ENV.PUSHER_SECRET);
    expect(callArg.cluster).toBe(SERVER_ENV.PUSHER_CLUSTER);
    expect(callArg.useTLS).toBe(true);
  });

  it('returns the same instance on repeated calls (singleton behaviour)', async () => {
    vi.resetModules();
    setServerEnv();
    MockPusherCtor.mockClear();

    const { getPusherServer: fresh } = await import('@/lib/pusher');
    const first = fresh();
    const second = fresh();

    expect(first).toBe(second);
    expect(MockPusherCtor).toHaveBeenCalledOnce();
  });

  it('returns null when only some PUSHER env vars are present', async () => {
    vi.resetModules();
    process.env.PUSHER_APP_ID = 'only-app-id';
    // KEY, SECRET, CLUSTER intentionally absent

    const { getPusherServer: fresh } = await import('@/lib/pusher');
    expect(fresh()).toBeNull();

    delete process.env.PUSHER_APP_ID;
  });
});

// ===========================================================================
// getPusherClient — singleton client-side instance
// ===========================================================================
describe('getPusherClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_PUSHER_KEY;
    delete process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_PUSHER_KEY;
    delete process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  });

  it('returns null when window is undefined (server-side / Node env)', async () => {
    vi.resetModules();
    expect(typeof window).toBe('undefined');

    const { getPusherClient: fresh } = await import('@/lib/pusher');
    expect(fresh()).toBeNull();
  });

  it('does not instantiate PusherClient when running in Node environment', async () => {
    vi.resetModules();
    MockPusherClientCtor.mockClear();

    const { getPusherClient: fresh } = await import('@/lib/pusher');
    fresh();

    expect(MockPusherClientCtor).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// broadcastToTrip — fires trigger on the trip channel
// ===========================================================================
describe('broadcastToTrip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearServerEnv();
  });

  afterEach(() => {
    clearServerEnv();
  });

  it('calls pusher.trigger with the trip channel name and event data', async () => {
    vi.resetModules();
    setServerEnv();
    mockTrigger.mockResolvedValueOnce(undefined);

    const { broadcastToTrip: fresh } = await import('@/lib/pusher');
    await fresh('trip-abc', 'trip:updated', { status: 'updated' });

    expect(mockTrigger).toHaveBeenCalledOnce();
    expect(mockTrigger).toHaveBeenCalledWith('trip-trip-abc', 'trip:updated', { status: 'updated' });
  });

  it('resolves without throwing when pusher server is unavailable (no env vars)', async () => {
    vi.resetModules();
    // No env vars — getPusherServer returns null, broadcast is a no-op

    const { broadcastToTrip: fresh } = await import('@/lib/pusher');
    await expect(fresh('trip-xyz', 'trip:updated', {})).resolves.toBeUndefined();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('swallows trigger errors and resolves (non-fatal by design)', async () => {
    vi.resetModules();
    setServerEnv();
    mockTrigger.mockRejectedValueOnce(new Error('Pusher network error'));

    const { broadcastToTrip: fresh } = await import('@/lib/pusher');
    await expect(fresh('trip-abc', 'trip:updated', {})).resolves.toBeUndefined();
  });

  it('uses channels.trip() format for the channel name', async () => {
    vi.resetModules();
    setServerEnv();
    mockTrigger.mockResolvedValueOnce(undefined);

    const { broadcastToTrip: fresh } = await import('@/lib/pusher');
    await fresh('my-trip-id', events.MEMBER_JOINED, { userId: 'u1' });

    const [channelArg] = mockTrigger.mock.calls[0] as [string, string, unknown];
    expect(channelArg).toBe('trip-my-trip-id');
  });
});

// ===========================================================================
// broadcastToUser — fires trigger on the user channel
// ===========================================================================
describe('broadcastToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearServerEnv();
  });

  afterEach(() => {
    clearServerEnv();
  });

  it('calls pusher.trigger with the user channel name and event data', async () => {
    vi.resetModules();
    setServerEnv();
    mockTrigger.mockResolvedValueOnce(undefined);

    const { broadcastToUser: fresh } = await import('@/lib/pusher');
    const payload = { message: 'You have a new invitation' };
    await fresh('user-001', 'invitation', payload);

    expect(mockTrigger).toHaveBeenCalledOnce();
    expect(mockTrigger).toHaveBeenCalledWith('user-user-001', 'invitation', payload);
  });

  it('resolves without throwing when pusher server is unavailable (no env vars)', async () => {
    vi.resetModules();

    const { broadcastToUser: fresh } = await import('@/lib/pusher');
    await expect(fresh('user-999', 'notification', {})).resolves.toBeUndefined();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('swallows trigger errors and resolves (non-fatal by design)', async () => {
    vi.resetModules();
    setServerEnv();
    mockTrigger.mockRejectedValueOnce(new Error('Connection refused'));

    const { broadcastToUser: fresh } = await import('@/lib/pusher');
    await expect(fresh('user-001', 'notification', {})).resolves.toBeUndefined();
  });

  it('uses channels.user() format for the channel name', async () => {
    vi.resetModules();
    setServerEnv();
    mockTrigger.mockResolvedValueOnce(undefined);

    const { broadcastToUser: fresh } = await import('@/lib/pusher');
    await fresh('abc-user', events.NOTIFICATION, { text: 'hello' });

    const [channelArg] = mockTrigger.mock.calls[0] as [string, string, unknown];
    expect(channelArg).toBe('user-abc-user');
  });
});
