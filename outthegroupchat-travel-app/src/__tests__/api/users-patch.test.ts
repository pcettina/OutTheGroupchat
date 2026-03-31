/**
 * Unit tests for the PATCH method on /api/users/[userId]/route.ts
 *
 * Route:
 *  - PATCH /api/users/[userId] — update own user profile (owner only)
 *
 * Coverage goals:
 *  - Auth: 401 when not authenticated
 *  - Auth: 401 when session exists but has no user id
 *  - Auth: 403 when authenticated user tries to update another user's profile
 *  - Validation: 400 for invalid body fields (wrong types)
 *  - Validation: 400 for name that is empty string (min(1) violation)
 *  - Validation: 400 for name exceeding 100 chars
 *  - Validation: 400 for bio exceeding 500 chars
 *  - Validation: 400 for city exceeding 100 chars
 *  - Validation: 400 for image that is not a valid URL
 *  - Validation: 400 for completely invalid JSON types (number/boolean)
 *  - Happy path: 200 updating all fields
 *  - Happy path: 200 updating only name
 *  - Happy path: 200 updating only bio
 *  - Happy path: 200 updating only city
 *  - Happy path: 200 updating only image (valid URL)
 *  - Happy path: 200 with an empty body (no fields changed — all optional)
 *  - Partial updates: only updating some fields leaves others untouched
 *  - Response shape: data contains id, name, image, bio, city; NOT email
 *  - Response shape: success: true on 200
 *  - Edge cases: bio as empty string (max(500) allows it)
 *  - Edge cases: city as empty string (max(100) allows it)
 *  - Edge cases: name at exact max length (100 chars)
 *  - Edge cases: bio at exact max length (500 chars)
 *  - Edge cases: city at exact max length (100 chars)
 *  - Database error: 500 when prisma.user.update throws
 *  - Database error: response shape on 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import * as usersRoute from '@/app/api/users/[userId]/route';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
    },
  };
});

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  logError: vi.fn(),
  logSuccess: vi.fn(),
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  authLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const OTHER_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';

function makePatchRequest(userId: string, body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const OWNER_SESSION = {
  user: { id: USER_ID, name: 'Owner User', email: 'owner@example.com' },
};

const OTHER_SESSION = {
  user: { id: OTHER_USER_ID, name: 'Other User', email: 'other@example.com' },
};

// Updated user fixture returned by prisma.user.update
const UPDATED_USER = {
  id: USER_ID,
  name: 'Updated Name',
  image: 'https://example.com/avatar.png',
  bio: 'Updated bio',
  city: 'New York',
};

// ---------------------------------------------------------------------------
// PATCH /api/users/[userId] — update own profile
// ---------------------------------------------------------------------------
describe('PATCH /api/users/[userId] — update user profile', () => {
  const PATCH = usersRoute.PATCH;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Authentication guard
  // -------------------------------------------------------------------------
  describe('authentication', () => {
    it('returns 401 when no session exists', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'Test' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('returns 401 when session exists but user id is missing', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { name: 'No ID', email: 'noid@example.com' },
      } as unknown as Awaited<ReturnType<typeof getServerSession>>);

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'Test' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(401);
    });

    it('does not call prisma when unauthenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      await PATCH(makePatchRequest(USER_ID, { name: 'Test' }), {
        params: { userId: USER_ID },
      });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Authorization guard (owner only)
  // -------------------------------------------------------------------------
  describe('authorization', () => {
    it('returns 403 when authenticated user tries to update another user', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'Hijacked Name' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/forbidden/i);
    });

    it('does not call prisma when requester is not the owner', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);

      await PATCH(makePatchRequest(USER_ID, { name: 'Hijacked Name' }), {
        params: { userId: USER_ID },
      });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows the owner to update their own profile', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        UPDATED_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'Updated Name' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Zod validation — invalid fields
  // -------------------------------------------------------------------------
  describe('validation — invalid fields', () => {
    it('returns 400 when name is an empty string (min(1) violation)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);

      const res = await PATCH(makePatchRequest(USER_ID, { name: '' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Validation failed');
    });

    it('returns 400 when name exceeds 100 characters', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      const longName = 'a'.repeat(101);

      const res = await PATCH(makePatchRequest(USER_ID, { name: longName }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 400 when bio exceeds 500 characters', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      const longBio = 'b'.repeat(501);

      const res = await PATCH(makePatchRequest(USER_ID, { bio: longBio }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 400 when city exceeds 100 characters', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      const longCity = 'c'.repeat(101);

      const res = await PATCH(makePatchRequest(USER_ID, { city: longCity }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 400 when image is not a valid URL', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);

      const res = await PATCH(makePatchRequest(USER_ID, { image: 'not-a-url' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Validation failed');
    });

    it('returns 400 when name is a number instead of string', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);

      const res = await PATCH(makePatchRequest(USER_ID, { name: 42 }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 400 when bio is a boolean instead of string', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);

      const res = await PATCH(makePatchRequest(USER_ID, { bio: true }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('400 response includes a details field with flattened Zod errors', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);

      const res = await PATCH(makePatchRequest(USER_ID, { name: '' }), {
        params: { userId: USER_ID },
      });

      const json = await res.json();
      expect(json).toHaveProperty('details');
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('returns 200 with success: true when all fields are updated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        UPDATED_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(
        makePatchRequest(USER_ID, {
          name: 'Updated Name',
          bio: 'Updated bio',
          city: 'New York',
          image: 'https://example.com/avatar.png',
        }),
        { params: { userId: USER_ID } }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('returns the updated user data in data field', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        UPDATED_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(
        makePatchRequest(USER_ID, { name: 'Updated Name' }),
        { params: { userId: USER_ID } }
      );

      const json = await res.json();
      expect(json.data).toBeDefined();
      expect(json.data.id).toBe(USER_ID);
      expect(json.data.name).toBe('Updated Name');
    });

    it('returns 200 when updating only the name field', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...UPDATED_USER,
        name: 'Just Name',
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'Just Name' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Just Name');
    });

    it('returns 200 when updating only the bio field', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...UPDATED_USER,
        bio: 'New bio only',
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(makePatchRequest(USER_ID, { bio: 'New bio only' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.bio).toBe('New bio only');
    });

    it('returns 200 when updating only the city field', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...UPDATED_USER,
        city: 'Chicago',
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(makePatchRequest(USER_ID, { city: 'Chicago' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.city).toBe('Chicago');
    });

    it('returns 200 when updating only the image field with a valid URL', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...UPDATED_USER,
        image: 'https://cdn.example.com/new-avatar.jpg',
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(
        makePatchRequest(USER_ID, { image: 'https://cdn.example.com/new-avatar.jpg' }),
        { params: { userId: USER_ID } }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.image).toBe('https://cdn.example.com/new-avatar.jpg');
    });

    it('returns 200 with an empty body — all fields are optional', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        UPDATED_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(makePatchRequest(USER_ID, {}), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('calls prisma.user.update with the correct userId in where clause', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        UPDATED_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      await PATCH(makePatchRequest(USER_ID, { name: 'Test' }), {
        params: { userId: USER_ID },
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
        })
      );
    });

    it('calls prisma.user.update with only the provided fields in data', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        UPDATED_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      await PATCH(makePatchRequest(USER_ID, { name: 'Only Name' }), {
        params: { userId: USER_ID },
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Only Name' }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('accepts an empty string for bio (max(500) allows empty)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...UPDATED_USER,
        bio: '',
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(makePatchRequest(USER_ID, { bio: '' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
    });

    it('accepts an empty string for city (max(100) allows empty)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...UPDATED_USER,
        city: '',
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(makePatchRequest(USER_ID, { city: '' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
    });

    it('accepts a name at exactly 100 characters (boundary value)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      const name100 = 'a'.repeat(100);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...UPDATED_USER,
        name: name100,
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(makePatchRequest(USER_ID, { name: name100 }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
    });

    it('accepts a bio at exactly 500 characters (boundary value)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      const bio500 = 'b'.repeat(500);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...UPDATED_USER,
        bio: bio500,
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(makePatchRequest(USER_ID, { bio: bio500 }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
    });

    it('accepts a city at exactly 100 characters (boundary value)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      const city100 = 'c'.repeat(100);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...UPDATED_USER,
        city: city100,
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(makePatchRequest(USER_ID, { city: city100 }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Response shape
  // -------------------------------------------------------------------------
  describe('response shape', () => {
    it('200 response includes success: true and data object', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        UPDATED_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'Shape Test' }), {
        params: { userId: USER_ID },
      });

      const json = await res.json();
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('data');
    });

    it('data object contains id, name, image, bio, and city fields', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        UPDATED_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(
        makePatchRequest(USER_ID, { name: 'Shape Test', bio: 'bio', city: 'City' }),
        { params: { userId: USER_ID } }
      );

      const json = await res.json();
      expect(json.data).toHaveProperty('id');
      expect(json.data).toHaveProperty('name');
      expect(json.data).toHaveProperty('image');
      expect(json.data).toHaveProperty('bio');
      expect(json.data).toHaveProperty('city');
    });

    it('data object does NOT include the email field', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      // Route uses select: { email: false }, so Prisma won't return it
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        UPDATED_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'No Email' }), {
        params: { userId: USER_ID },
      });

      const json = await res.json();
      expect(json.data).not.toHaveProperty('email');
    });
  });

  // -------------------------------------------------------------------------
  // Database error paths
  // -------------------------------------------------------------------------
  describe('database errors', () => {
    it('returns 500 when prisma.user.update throws a database error', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('DB connection lost'));

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'Test' }), {
        params: { userId: USER_ID },
      });

      expect(res.status).toBe(500);
    });

    it('500 response includes success: false', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('Unexpected DB error'));

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'Test' }), {
        params: { userId: USER_ID },
      });

      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('500 response includes an error string', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
      vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('Prisma error'));

      const res = await PATCH(makePatchRequest(USER_ID, { name: 'Test' }), {
        params: { userId: USER_ID },
      });

      const json = await res.json();
      expect(json.error).toBeDefined();
      expect(typeof json.error).toBe('string');
    });
  });
});
