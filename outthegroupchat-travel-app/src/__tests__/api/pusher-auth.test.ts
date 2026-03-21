/**
 * Unit tests for the Pusher Auth API route handler.
 *
 * Route:
 *   POST /api/pusher/auth  — authenticate a client for a Pusher channel
 *
 * Strategy
 * --------
 * - next-auth, @/lib/auth, and @/lib/logger are mocked globally in setup.ts.
 * - @/lib/pusher is mocked here to control the getPusherServer() return value
 *   without needing real Pusher credentials or env vars.
 * - The route reads formData (not JSON), so requests are built with FormData.
 * - All tests use mockResolvedValueOnce / mockReturnValueOnce to avoid state leakage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';

// ---------------------------------------------------------------------------
// Mock @/lib/pusher so getPusherServer() is fully controlled per-test.
// ---------------------------------------------------------------------------
const mockAuthorizeChannel = vi.fn();
const mockPusherInstance = { authorizeChannel: mockAuthorizeChannel };

vi.mock('@/lib/pusher', () => ({
  getPusherServer: vi.fn(),
}));

import { getPusherServer } from '@/lib/pusher';
import { POST } from '@/app/api/pusher/auth/route';

// ---------------------------------------------------------------------------
// Typed references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGetPusherServer = vi.mocked(getPusherServer);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// Use a user ID without dashes so it survives channel_name.split('-') intact.
// The route does: parts = channelName.split('-'); id = parts[2]
// For channel 'private-user-userXYZ123', parts = ['private','user','userXYZ123']
// → parts[2] === MOCK_USER_ID ✓
const MOCK_USER_ID = 'userXYZ123';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Pusher Tester',
    email: 'pusher@example.com',
  },
  expires: '2099-01-01',
};

const MOCK_AUTH_RESPONSE = {
  auth: 'app-key:signature-abc123',
};

/**
 * Build a POST Request with FormData body containing socket_id and channel_name.
 * Pass null for a field to omit it (simulating missing fields).
 */
function makeFormDataRequest(
  socketId: string | null,
  channelName: string | null
): Request {
  const formData = new FormData();
  if (socketId !== null) formData.set('socket_id', socketId);
  if (channelName !== null) formData.set('channel_name', channelName);

  return new Request('http://localhost:3000/api/pusher/auth', {
    method: 'POST',
    body: formData,
  });
}

/** Parse JSON from a NextResponse-compatible Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to prevent state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// POST /api/pusher/auth
// ===========================================================================
describe('POST /api/pusher/auth', () => {
  // -------------------------------------------------------------------------
  // Authentication guard
  // -------------------------------------------------------------------------
  describe('authentication', () => {
    it('returns 401 when session is null', async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const req = makeFormDataRequest('123.456', 'public-channel');
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
      expect(mockGetPusherServer).not.toHaveBeenCalled();
    });

    it('returns 401 when session has no user id', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { name: 'No ID User', email: 'noid@example.com' },
        expires: '2099-01-01',
      } as never);

      const req = makeFormDataRequest('123.456', 'public-channel');
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  // -------------------------------------------------------------------------
  // Pusher not configured
  // -------------------------------------------------------------------------
  describe('Pusher server configuration', () => {
    it('returns 500 when getPusherServer returns null (env vars missing)', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(null);

      const req = makeFormDataRequest('123.456', 'public-channel');
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(500);
      expect(body.error).toBe('Pusher not configured');
    });
  });

  // -------------------------------------------------------------------------
  // Zod validation (missing / empty fields)
  // -------------------------------------------------------------------------
  describe('input validation', () => {
    it('returns 400 when socket_id is missing from formData', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest(null, 'public-channel');
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Missing required fields');
      expect(body.details).toBeDefined();
      expect(mockAuthorizeChannel).not.toHaveBeenCalled();
    });

    it('returns 400 when channel_name is missing from formData', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest('123.456', null);
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Missing required fields');
      expect(body.details).toBeDefined();
      expect(mockAuthorizeChannel).not.toHaveBeenCalled();
    });

    it('returns 400 when both socket_id and channel_name are missing', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest(null, null);
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Missing required fields');
    });

    it('returns 400 when socket_id is an empty string', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest('', 'public-channel');
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Missing required fields');
    });
  });

  // -------------------------------------------------------------------------
  // Happy path — public channel
  // -------------------------------------------------------------------------
  describe('successful authentication', () => {
    it('returns 200 with pusher auth token for a public channel', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );
      mockAuthorizeChannel.mockReturnValueOnce(MOCK_AUTH_RESPONSE);

      const req = makeFormDataRequest('123.456', 'public-trip-abc');
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.auth).toBe(MOCK_AUTH_RESPONSE.auth);
      expect(mockAuthorizeChannel).toHaveBeenCalledOnce();
      expect(mockAuthorizeChannel).toHaveBeenCalledWith('123.456', 'public-trip-abc');
    });

    it('calls authorizeChannel with the correct socketId and channelName', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );
      mockAuthorizeChannel.mockReturnValueOnce(MOCK_AUTH_RESPONSE);

      const req = makeFormDataRequest('999.111', 'my-channel');
      await POST(req);

      expect(mockAuthorizeChannel).toHaveBeenCalledWith('999.111', 'my-channel');
    });
  });

  // -------------------------------------------------------------------------
  // Private channel — user ownership check
  // -------------------------------------------------------------------------
  describe('private channel authorization', () => {
    it('returns 200 when private-user channel matches the session user id', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );
      mockAuthorizeChannel.mockReturnValueOnce(MOCK_AUTH_RESPONSE);

      const channelName = `private-user-${MOCK_USER_ID}`;
      const req = makeFormDataRequest('123.456', channelName);
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.auth).toBe(MOCK_AUTH_RESPONSE.auth);
      expect(mockAuthorizeChannel).toHaveBeenCalledWith('123.456', channelName);
    });

    it('returns 403 when private-user channel belongs to a different user', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const channelName = 'private-user-other-user-id-999';
      const req = makeFormDataRequest('123.456', channelName);
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(403);
      expect(body.error).toBe('Forbidden');
      expect(mockAuthorizeChannel).not.toHaveBeenCalled();
    });

    it('returns 200 for a private-trip channel (no ownership check)', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );
      mockAuthorizeChannel.mockReturnValueOnce(MOCK_AUTH_RESPONSE);

      const channelName = 'private-trip-trip-xyz-123';
      const req = makeFormDataRequest('123.456', channelName);
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.auth).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling — authorizeChannel throws
  // -------------------------------------------------------------------------
  describe('error handling', () => {
    it('returns 500 when authorizeChannel throws an error', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      // Create a fresh throwing mock inline to avoid any clearAllMocks queue issues.
      const throwingAuthorizeChannel = vi.fn().mockImplementationOnce(() => {
        throw new Error('Pusher signing error');
      });
      const throwingPusherInstance = { authorizeChannel: throwingAuthorizeChannel };
      mockGetPusherServer.mockReturnValueOnce(
        throwingPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest('123.456', 'public-channel');
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(500);
      expect(body.error).toBe('Authentication failed');
    });

    it('returns 500 when getServerSession throws unexpectedly', async () => {
      mockGetServerSession.mockRejectedValueOnce(new Error('Auth provider error'));

      const req = makeFormDataRequest('123.456', 'public-channel');
      const res = await POST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(500);
      expect(body.error).toBe('Authentication failed');
    });
  });
});
