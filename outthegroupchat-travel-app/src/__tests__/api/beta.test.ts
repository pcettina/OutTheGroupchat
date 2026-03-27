/**
 * Unit tests for the Beta API route handlers.
 *
 * Routes:
 *   POST /api/beta/signup           — create or update beta user (API-key protected)
 *   GET  /api/beta/status           — check beta user status by email
 *   POST /api/newsletter/subscribe  — subscribe user to newsletter (API-key protected)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, logger) are mocked in setup.ts.
 * - Handlers are called directly with minimal Request objects.
 * - API-key routes read process.env.N8N_API_KEY per-request (not module-level).
 *   We use vi.stubEnv to control the value during tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

import { POST as betaSignupPOST } from '@/app/api/beta/signup/route';
import { GET as betaStatusGET } from '@/app/api/beta/status/route';
import { POST as newsletterSubscribePOST } from '@/app/api/newsletter/subscribe/route';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma
// ---------------------------------------------------------------------------
const mockPrismaUser = vi.mocked(prisma.user);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_API_KEY = 'test-nightly-api-key';

function makeSignupRequest(body: unknown, apiKey?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey !== undefined) headers['x-api-key'] = apiKey;
  return new Request('http://localhost:3000/api/beta/signup', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function makeStatusRequest(email?: string): NextRequest {
  const url = email
    ? `http://localhost:3000/api/beta/status?email=${encodeURIComponent(email)}`
    : 'http://localhost:3000/api/beta/status';
  return new NextRequest(url, { method: 'GET' });
}

function makeNewsletterRequest(body: unknown, apiKey?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey !== undefined) headers['x-api-key'] = apiKey;
  return new Request('http://localhost:3000/api/newsletter/subscribe', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// POST /api/beta/signup
// ---------------------------------------------------------------------------
describe('POST /api/beta/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('N8N_API_KEY', VALID_API_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when API key is missing', async () => {
    const req = makeSignupRequest({ email: 'user@example.com' });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Unauthorized/i);
  });

  it('returns 401 when API key is wrong', async () => {
    const req = makeSignupRequest({ email: 'user@example.com' }, 'wrong-key');
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid email', async () => {
    const req = makeSignupRequest({ email: 'not-an-email' }, VALID_API_KEY);
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 for missing email', async () => {
    const req = makeSignupRequest({}, VALID_API_KEY);
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(400);
  });

  it('creates new beta user and returns 201', async () => {
    const now = new Date();
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    mockPrismaUser.create.mockResolvedValueOnce({
      id: 'user-1',
      email: 'new@example.com',
      name: 'New User',
      betaSignupDate: now,
      passwordInitialized: false,
      password: null,
    } as never);

    const req = makeSignupRequest({ email: 'new@example.com', name: 'New User' }, VALID_API_KEY);
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.email).toBe('new@example.com');
    expect(body.user.passwordInitialized).toBe(false);
  });

  it('updates existing user if betaSignupDate not set', async () => {
    const existingUser = {
      id: 'user-2',
      email: 'existing@example.com',
      name: null,
      betaSignupDate: null,
      password: null,
      passwordInitialized: false,
    };
    const updatedUser = { ...existingUser, betaSignupDate: new Date() };
    mockPrismaUser.findUnique.mockResolvedValueOnce(existingUser as never);
    mockPrismaUser.update.mockResolvedValueOnce(updatedUser as never);

    const req = makeSignupRequest({ email: 'existing@example.com' }, VALID_API_KEY);
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaUser.update).toHaveBeenCalledOnce();
  });

  it('returns existing user if betaSignupDate already set', async () => {
    const existingUser = {
      id: 'user-3',
      email: 'already@example.com',
      name: 'Already',
      betaSignupDate: new Date(),
      password: null,
      passwordInitialized: false,
    };
    mockPrismaUser.findUnique.mockResolvedValueOnce(existingUser as never);

    const req = makeSignupRequest({ email: 'already@example.com' }, VALID_API_KEY);
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaUser.update).not.toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('DB connection failed'));
    const req = makeSignupRequest({ email: 'test@example.com' }, VALID_API_KEY);
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(500);
  });

  it('handles unique constraint error gracefully', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    mockPrismaUser.create.mockRejectedValueOnce(new Error('Unique constraint failed'));
    const req = makeSignupRequest({ email: 'test@example.com' }, VALID_API_KEY);
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/beta/status
// ---------------------------------------------------------------------------
describe('GET /api/beta/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when email is missing', async () => {
    const req = makeStatusRequest();
    const res = await betaStatusGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it('returns 400 for invalid email format', async () => {
    const req = makeStatusRequest('not-an-email');
    const res = await betaStatusGET(req);
    expect(res.status).toBe(400);
  });

  it('returns exists: false for unknown email', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeStatusRequest('unknown@example.com');
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
  });

  it('returns user status fields when user exists', async () => {
    const now = new Date();
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'known@example.com',
      betaSignupDate: now,
      passwordInitialized: true,
      newsletterSubscribed: false,
      newsletterSubscribedAt: null,
    } as never);

    const req = makeStatusRequest('known@example.com');
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(true);
    expect(body.passwordInitialized).toBe(true);
  });

  it('normalizes email to lowercase', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeStatusRequest('UPPER@EXAMPLE.COM');
    await betaStatusGET(req);
    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'upper@example.com' } })
    );
  });

  it('returns 500 on database error', async () => {
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('DB error'));
    const req = makeStatusRequest('test@example.com');
    const res = await betaStatusGET(req);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/newsletter/subscribe
// ---------------------------------------------------------------------------
const MOCK_NEWSLETTER_SESSION = { user: { id: 'user-1', email: 'user@example.com', name: 'Test User' }, expires: '9999-01-01' };
const mockGetServerSession = vi.mocked(getServerSession);

describe('POST /api/newsletter/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('N8N_API_KEY', VALID_API_KEY);
    // newsletter/subscribe now requires auth — provide session by default for success paths
    mockGetServerSession.mockResolvedValue(MOCK_NEWSLETTER_SESSION as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 without valid API key', async () => {
    const req = makeNewsletterRequest({ email: 'user@example.com' });
    const res = await newsletterSubscribePOST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const req = makeNewsletterRequest({ email: 'user@example.com' }, VALID_API_KEY);
    const res = await newsletterSubscribePOST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid email', async () => {
    const req = makeNewsletterRequest({ email: 'bad' }, VALID_API_KEY);
    const res = await newsletterSubscribePOST(req);
    expect(res.status).toBe(400);
  });

  it('subscribes new user and creates user record', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    mockPrismaUser.create.mockResolvedValueOnce({
      id: 'new-user',
      email: 'subscriber@example.com',
      newsletterSubscribed: true,
      newsletterSubscribedAt: new Date(),
    } as never);

    const req = makeNewsletterRequest({ email: 'subscriber@example.com', name: 'Sub' }, VALID_API_KEY);
    const res = await newsletterSubscribePOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.subscribed).toBe(true);
    expect(mockPrismaUser.create).toHaveBeenCalledOnce();
  });

  it('subscribes existing user by updating their record', async () => {
    const existing = {
      id: 'existing-user',
      email: 'existing@example.com',
      name: 'Existing',
      newsletterSubscribed: false,
    };
    mockPrismaUser.findUnique.mockResolvedValueOnce(existing as never);
    mockPrismaUser.update.mockResolvedValueOnce({
      ...existing,
      newsletterSubscribed: true,
      newsletterSubscribedAt: new Date(),
    } as never);

    const req = makeNewsletterRequest({ email: 'existing@example.com' }, VALID_API_KEY);
    const res = await newsletterSubscribePOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaUser.update).toHaveBeenCalledOnce();
  });

  it('returns 500 on database error', async () => {
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('DB error'));
    const req = makeNewsletterRequest({ email: 'test@example.com' }, VALID_API_KEY);
    const res = await newsletterSubscribePOST(req);
    expect(res.status).toBe(500);
  });
});
