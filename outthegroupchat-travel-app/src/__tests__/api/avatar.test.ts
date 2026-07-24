/**
 * Unit tests for POST + DELETE /api/profile/avatar.
 *
 * Day 12 [M1] — avatar upload.
 *
 * Prisma (`user`), NextAuth, logger and sentry mocks come from
 * src/__tests__/setup.ts. `@/lib/rate-limit` is NOT mocked there, so it is
 * mocked here (before the route import) and re-armed in beforeEach — this
 * project runs with `clearMocks: true`, which wipes a factory-level
 * mockResolvedValue and would 500 every post-auth test.
 *
 * The route calls the REAL `@/lib/storage`, which is exercised through
 * `globalThis.fetch` (swapped per test and restored in afterEach) plus
 * `BLOB_READ_WRITE_TOKEN` via `vi.stubEnv`. No network, no real credential.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module-level mock for @/lib/rate-limit — declared before importing the route.
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Static imports — NEVER use dynamic await import in beforeEach.
import { POST, DELETE, dynamic } from '@/app/api/profile/avatar/route';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import { AVATAR_MAX_BYTES } from '@/lib/storage';

// ---------------------------------------------------------------------------
// Typed references to mocked delegates + helpers
// ---------------------------------------------------------------------------
const mockUser = prisma.user as unknown as {
  update: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockGetServerSession = vi.mocked(getServerSession);
const mockCaptureException = vi.mocked(captureException);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/profile/avatar';
const TOKEN = 'vercel_blob_rw_TESTTOKEN';
const UPLOADED_URL =
  'https://x.public.blob.vercel-storage.com/avatars/user-1-123.png';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 1750000000 };
const RL_HEADERS = {
  'X-RateLimit-Limit': '100',
  'X-RateLimit-Remaining': '0',
  'X-RateLimit-Reset': '1750000000',
};

/** Build a multipart POST request carrying `bytes` as the `file` field. */
const makeUpload = (
  bytes: Uint8Array,
  { name = 'avatar.png', type = 'image/png' } = {}
) => {
  const fd = new FormData();
  fd.append('file', new File([bytes.slice()], name, { type }));
  return new Request(BASE_URL, { method: 'POST', body: fd });
};

/** Build a multipart POST request from an already-assembled FormData. */
const makeForm = (fd: FormData) =>
  new Request(BASE_URL, { method: 'POST', body: fd });

/** Swap the global fetch used by @/lib/storage; restored in afterEach. */
const originalFetch = globalThis.fetch;

const stubFetch = (impl: ReturnType<typeof vi.fn>) => {
  globalThis.fetch = impl as unknown as typeof fetch;
  return impl;
};

const okBlobFetch = (url = UPLOADED_URL) =>
  stubFetch(
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url }),
    })
  );

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Re-arm permanent mocks wiped by clearMocks.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
  mockGetRateLimitHeaders.mockReturnValue(RL_HEADERS);
  mockGetServerSession.mockResolvedValue(sessionFor());

  // Deterministic default: storage is NOT configured unless a test says so.
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

// ===========================================================================
// Route module shape
// ===========================================================================
describe('/api/profile/avatar module', () => {
  it('opts out of static rendering', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});

// ===========================================================================
// POST /api/profile/avatar
// ===========================================================================
describe('POST /api/profile/avatar', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makeUpload(PNG_BYTES));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 429 with rate-limit headers when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await POST(makeUpload(PNG_BYTES));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Rate limit exceeded' });
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(res.headers.get('X-RateLimit-Reset')).toBe('1750000000');
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('rate limits per user id', async () => {
    okBlobFetch();
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    mockUser.update.mockResolvedValueOnce({ id: 'user-1', image: UPLOADED_URL });

    await POST(makeUpload(PNG_BYTES));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(null, 'avatar:user-1');
  });

  it('returns 400 (not 500) when the body is not multipart/form-data', async () => {
    const req = new Request(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'nope' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Expected a multipart/form-data body',
    });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 400 when the "file" field is missing', async () => {
    const fd = new FormData();
    fd.append('notfile', 'x');

    const res = await POST(makeForm(fd));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing "file" upload field' });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 400 when "file" is sent as a plain string', async () => {
    const fd = new FormData();
    fd.append('file', 'just-a-string');

    const res = await POST(makeForm(fd));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing "file" upload field' });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty file', async () => {
    const res = await POST(makeUpload(new Uint8Array([])));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Uploaded file is empty' });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 413 when the file exceeds AVATAR_MAX_BYTES', async () => {
    const tooBig = new Uint8Array(AVATAR_MAX_BYTES + 1);
    tooBig.set(PNG_BYTES, 0);

    const res = await POST(makeUpload(tooBig));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: 'Image is too large',
      maxBytes: AVATAR_MAX_BYTES,
    });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the size limit', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    okBlobFetch();
    mockUser.update.mockResolvedValueOnce({ id: 'user-1', image: UPLOADED_URL });

    const atLimit = new Uint8Array(AVATAR_MAX_BYTES);
    atLimit.set(PNG_BYTES, 0);

    const res = await POST(makeUpload(atLimit));

    expect(res.status).toBe(200);
  });

  it('returns 400 for bytes that are not a supported image', async () => {
    const res = await POST(
      makeUpload(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]))
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Unsupported image type. Use PNG, JPEG, or WebP.',
    });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('rejects GIF bytes even when the client declares image/png (magic bytes win)', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    const fetchMock = okBlobFetch();

    const res = await POST(
      makeUpload(GIF_BYTES, { name: 'lie.png', type: 'image/png' })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Unsupported image type. Use PNG, JPEG, or WebP.',
    });
    // Nothing was uploaded and nothing was persisted.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 503 STORAGE_NOT_CONFIGURED when the storage env is missing', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', undefined);
    const fetchMock = stubFetch(vi.fn());

    // Acceptance criterion: a graceful "configure storage" path, not a crash.
    const res = await POST(makeUpload(PNG_BYTES));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: 'Avatar storage is not configured',
      code: 'STORAGE_NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockUser.update).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('returns 503 for a blank storage token rather than attempting an upload', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '   ');

    const res = await POST(makeUpload(PNG_BYTES));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('STORAGE_NOT_CONFIGURED');
  });

  it('returns 502 STORAGE_UPLOAD_FAILED when the blob API rejects the upload', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    stubFetch(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      })
    );

    const res = await POST(makeUpload(PNG_BYTES));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Failed to upload avatar',
      code: 'STORAGE_UPLOAD_FAILED',
    });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 502 when the upload throws (network failure)', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    stubFetch(vi.fn().mockRejectedValue(new Error('network down')));

    const res = await POST(makeUpload(PNG_BYTES));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('STORAGE_UPLOAD_FAILED');
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 200 with the new image URL and persists it', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    okBlobFetch();
    mockUser.update.mockResolvedValueOnce({ id: 'user-1', image: UPLOADED_URL });

    const res = await POST(makeUpload(PNG_BYTES));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ image: UPLOADED_URL });

    expect(mockUser.update).toHaveBeenCalledTimes(1);
    const updateArg = mockUser.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'user-1' });
    expect(updateArg?.data).toEqual({ image: UPLOADED_URL });
  });

  it('forwards the sniffed content type to the blob API, not the declared one', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    const fetchMock = okBlobFetch();
    mockUser.update.mockResolvedValueOnce({ id: 'user-1', image: UPLOADED_URL });

    // Client lies: JPEG bytes labelled image/webp.
    const res = await POST(
      makeUpload(JPEG_BYTES, { name: 'a.webp', type: 'image/webp' })
    );

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-content-type']).toBe('image/jpeg');
    expect(url.endsWith('.jpg')).toBe(true);
  });

  it('accepts a WebP upload', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    const fetchMock = okBlobFetch();
    mockUser.update.mockResolvedValueOnce({ id: 'user-1', image: UPLOADED_URL });

    const res = await POST(
      makeUpload(WEBP_BYTES, { name: 'a.webp', type: 'image/webp' })
    );

    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-content-type']).toBe(
      'image/webp'
    );
  });

  it('returns 500 and reports to Sentry when the prisma update throws', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    okBlobFetch();
    mockUser.update.mockRejectedValueOnce(new Error('db down'));

    const res = await POST(makeUpload(PNG_BYTES));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// DELETE /api/profile/avatar
// ===========================================================================
describe('DELETE /api/profile/avatar', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('clears the avatar and returns image: null', async () => {
    mockUser.update.mockResolvedValueOnce({ id: 'user-1', image: null });

    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ image: null });

    const updateArg = mockUser.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'user-1' });
    expect(updateArg?.data).toEqual({ image: null });
  });

  it('is idempotent — clearing an already-empty avatar still returns 200', async () => {
    mockUser.update.mockResolvedValueOnce({ id: 'user-1', image: null });
    const first = await DELETE();
    expect(first.status).toBe(200);

    mockUser.update.mockResolvedValueOnce({ id: 'user-1', image: null });
    const second = await DELETE();
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ image: null });
    expect(mockUser.update).toHaveBeenCalledTimes(2);
  });

  it('is not rate limited (no checkRateLimit call)', async () => {
    mockUser.update.mockResolvedValueOnce({ id: 'user-1', image: null });

    await DELETE();

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('returns 500 and reports to Sentry when the prisma update throws', async () => {
    mockUser.update.mockRejectedValueOnce(new Error('db down'));

    const res = await DELETE();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
