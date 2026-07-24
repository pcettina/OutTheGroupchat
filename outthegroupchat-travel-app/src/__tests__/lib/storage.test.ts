/**
 * Unit tests for src/lib/storage.ts — the provider-agnostic avatar blob wrapper.
 *
 * Day 12 [M1] — avatar upload.
 *
 * No network and no real credential are involved:
 *  - `BLOB_READ_WRITE_TOKEN` is read INSIDE the functions (never at module
 *    scope), so `vi.stubEnv` works with no `vi.resetModules` / dynamic import.
 *  - `putAvatar` takes a `deps.fetchImpl` injection seam; every upload test
 *    passes a `vi.fn()`.
 *
 * The object key embeds `Date.now()`, so URL assertions match a PREFIX, never
 * an exact string.
 *
 * logger + sentry mocks come from src/__tests__/setup.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  ALLOWED_AVATAR_TYPES,
  isStorageConfigured,
  isAllowedAvatarType,
  sniffImageType,
  putAvatar,
} from '@/lib/storage';
import { captureException } from '@/lib/sentry';

const mockCaptureException = vi.mocked(captureException);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TOKEN = 'vercel_blob_rw_TESTTOKEN';
const BLOB_HOST = 'https://blob.vercel-storage.com';
const RETURNED_URL = 'https://x.public.blob.vercel-storage.com/avatars/u-1.png';

/** Valid PNG header + a little payload. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

/** Valid JPEG header (SOI + marker). */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** "RIFF" + 4 size bytes + "WEBP". */
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

/** GIF89a — a real image, but NOT an allowed avatar format. */
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

type FetchMock = ReturnType<typeof vi.fn>;

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const failResponse = (status: number) =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

/** A `fetchImpl` double that resolves the given response. */
const fetchReturning = (response: Response): FetchMock =>
  vi.fn().mockResolvedValue(response);

/** Narrow the recorded fetch args without using `any`. */
const firstCall = (mock: FetchMock): [string, RequestInit] =>
  mock.mock.calls[0] as unknown as [string, RequestInit];

const headersOf = (init: RequestInit): Record<string, string> =>
  init.headers as Record<string, string>;

/** `deps` argument for putAvatar, cast once so no test needs a local cast. */
const deps = (mock: FetchMock) => ({
  fetchImpl: mock as unknown as typeof fetch,
});

// ---------------------------------------------------------------------------
// Env lifecycle
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Deterministic default: storage is NOT configured unless a test says so.
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ===========================================================================
// Constants
// ===========================================================================
describe('storage constants', () => {
  it('caps avatars at 2 MB', () => {
    expect(AVATAR_MAX_BYTES).toBe(2097152);
    expect(AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it('allows exactly PNG, JPEG and WebP', () => {
    expect([...ALLOWED_AVATAR_TYPES]).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
    ]);
  });
});

// ===========================================================================
// isStorageConfigured
// ===========================================================================
describe('isStorageConfigured', () => {
  it('is false when BLOB_READ_WRITE_TOKEN is unset', () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', undefined);
    expect(isStorageConfigured()).toBe(false);
  });

  it('is false when the token is blank', () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expect(isStorageConfigured()).toBe(false);
  });

  it('is false when the token is whitespace only', () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '   \t  ');
    expect(isStorageConfigured()).toBe(false);
  });

  it('is true when a token is present', () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    expect(isStorageConfigured()).toBe(true);
  });

  it('re-reads the env on every call (not cached at module scope)', () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expect(isStorageConfigured()).toBe(false);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    expect(isStorageConfigured()).toBe(true);
  });
});

// ===========================================================================
// isAllowedAvatarType
// ===========================================================================
describe('isAllowedAvatarType', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (type) => {
    expect(isAllowedAvatarType(type)).toBe(true);
  });

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/plain', ''])(
    'rejects %s',
    (type) => {
      expect(isAllowedAvatarType(type)).toBe(false);
    }
  );

  it('is case sensitive (does not accept IMAGE/PNG)', () => {
    expect(isAllowedAvatarType('IMAGE/PNG')).toBe(false);
  });
});

// ===========================================================================
// sniffImageType — pure magic-byte detection
// ===========================================================================
describe('sniffImageType', () => {
  it('detects PNG', () => {
    expect(sniffImageType(PNG_BYTES)).toBe('image/png');
  });

  it('detects JPEG', () => {
    expect(sniffImageType(JPEG_BYTES)).toBe('image/jpeg');
  });

  it('detects a bare 3-byte JPEG signature', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
  });

  it('detects WebP (RIFF + size + WEBP at offset 8)', () => {
    expect(sniffImageType(WEBP_BYTES)).toBe('image/webp');
  });

  it('returns null for empty input', () => {
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });

  it('returns null for a truncated PNG signature', () => {
    expect(sniffImageType(PNG_BYTES.slice(0, 7))).toBeNull();
  });

  it('returns null for a truncated JPEG signature', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it('returns null for GIF (a real image, but not an allowed type)', () => {
    expect(sniffImageType(GIF_BYTES)).toBeNull();
  });

  it('returns null for a RIFF container that is not WEBP (e.g. WAVE)', () => {
    const wave = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffImageType(wave)).toBeNull();
  });

  it('returns null for a RIFF header truncated before the WEBP tag', () => {
    expect(sniffImageType(WEBP_BYTES.slice(0, 10))).toBeNull();
  });

  it('returns null for arbitrary non-image bytes', () => {
    expect(sniffImageType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it('does not mutate its input', () => {
    const input = new Uint8Array(PNG_BYTES);
    sniffImageType(input);
    expect(Array.from(input)).toEqual(Array.from(PNG_BYTES));
  });
});

// ===========================================================================
// putAvatar
// ===========================================================================
describe('putAvatar', () => {
  it('returns not_configured (and never calls fetch) with no token', async () => {
    const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

    const result = await putAvatar('user-1', PNG_BYTES, 'image/png', deps(fetchImpl));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_configured');
      expect(result.message).toBe('Avatar storage is not configured');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only token as not_configured', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '   ');
    const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

    const result = await putAvatar('user-1', PNG_BYTES, 'image/png', deps(fetchImpl));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe('with storage configured', () => {
    beforeEach(() => {
      vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    });

    it('uploads and returns the public URL', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      const result = await putAvatar(
        'user-1',
        PNG_BYTES,
        'image/png',
        deps(fetchImpl)
      );

      expect(result).toEqual({ ok: true, url: RETURNED_URL });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('PUTs to a versioned, authorized blob key derived from the user id', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      await putAvatar('user-1', PNG_BYTES, 'image/png', deps(fetchImpl));

      const [url, init] = firstCall(fetchImpl);
      // Key embeds Date.now() -> prefix match only.
      expect(url.startsWith(`${BLOB_HOST}/avatars/user-1-`)).toBe(true);
      expect(url.endsWith('.png')).toBe(true);

      expect(init.method).toBe('PUT');

      const headers = headersOf(init);
      expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(headers['x-api-version']).toBe('7');
      expect(headers['x-content-type']).toBe('image/png');
      expect(headers['x-add-random-suffix']).toBe('1');
    });

    it('trims the token before building the authorization header', async () => {
      vi.stubEnv('BLOB_READ_WRITE_TOKEN', `  ${TOKEN}  `);
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      await putAvatar('user-1', PNG_BYTES, 'image/png', deps(fetchImpl));

      const [, init] = firstCall(fetchImpl);
      expect(headersOf(init).authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('sends the image bytes as the request body', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      await putAvatar('user-1', PNG_BYTES, 'image/png', deps(fetchImpl));

      const [, init] = firstCall(fetchImpl);
      const body = init.body as Blob;
      expect(body).toBeInstanceOf(Blob);
      expect(body.size).toBe(PNG_BYTES.length);
      expect(body.type).toBe('image/png');
    });

    it('uses the .jpg extension for image/jpeg', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      await putAvatar('user-1', JPEG_BYTES, 'image/jpeg', deps(fetchImpl));

      const [url, init] = firstCall(fetchImpl);
      expect(url.endsWith('.jpg')).toBe(true);
      expect(headersOf(init)['x-content-type']).toBe('image/jpeg');
    });

    it('uses the .webp extension for image/webp', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      await putAvatar('user-1', WEBP_BYTES, 'image/webp', deps(fetchImpl));

      const [url] = firstCall(fetchImpl);
      expect(url.endsWith('.webp')).toBe(true);
    });

    it('sanitizes unsafe characters out of the user id key segment', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      await putAvatar('../evil user@1', PNG_BYTES, 'image/png', deps(fetchImpl));

      const [url] = firstCall(fetchImpl);
      expect(url.startsWith(`${BLOB_HOST}/avatars/eviluser1-`)).toBe(true);
      expect(url).not.toContain('..');
      expect(url).not.toContain('@');
    });

    it('falls back to "user" when the id sanitizes to an empty string', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      await putAvatar('!!!', PNG_BYTES, 'image/png', deps(fetchImpl));

      const [url] = firstCall(fetchImpl);
      expect(url.startsWith(`${BLOB_HOST}/avatars/user-`)).toBe(true);
    });

    it('rejects a content type outside the allowlist without calling fetch', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      const result = await putAvatar(
        'user-1',
        GIF_BYTES,
        'image/gif',
        deps(fetchImpl)
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('upload_failed');
        expect(result.message).toContain('image/gif');
      }
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('returns upload_failed on a non-OK response', async () => {
      const fetchImpl = fetchReturning(failResponse(403));

      const result = await putAvatar(
        'user-1',
        PNG_BYTES,
        'image/png',
        deps(fetchImpl)
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('upload_failed');
        expect(result.message).toBe('Upload failed with status 403');
      }
    });

    it('returns upload_failed when the response body has no url', async () => {
      const fetchImpl = fetchReturning(okResponse({}));

      const result = await putAvatar(
        'user-1',
        PNG_BYTES,
        'image/png',
        deps(fetchImpl)
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('upload_failed');
        expect(result.message).toBe('Upload succeeded but no URL was returned');
      }
    });

    it('returns upload_failed when the returned url is an empty string', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: '' }));

      const result = await putAvatar(
        'user-1',
        PNG_BYTES,
        'image/png',
        deps(fetchImpl)
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('upload_failed');
    });

    it('returns upload_failed when the returned url is not a string', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: 42 }));

      const result = await putAvatar(
        'user-1',
        PNG_BYTES,
        'image/png',
        deps(fetchImpl)
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('upload_failed');
    });

    it('returns upload_failed and reports to Sentry when fetch throws', async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

      const result = await putAvatar(
        'user-1',
        PNG_BYTES,
        'image/png',
        deps(fetchImpl)
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('upload_failed');
        expect(result.message).toBe('Upload failed');
      }
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });

    it('returns upload_failed when response.json() rejects', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      });

      const result = await putAvatar(
        'user-1',
        PNG_BYTES,
        'image/png',
        deps(fetchImpl)
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('upload_failed');
    });

    it('never throws — every failure mode resolves to a StorageResult', async () => {
      const throwing = vi.fn().mockRejectedValue(new Error('boom'));

      await expect(
        putAvatar('user-1', PNG_BYTES, 'image/png', deps(throwing))
      ).resolves.toMatchObject({ ok: false });

      await expect(
        putAvatar('user-1', GIF_BYTES, 'image/gif', deps(throwing))
      ).resolves.toMatchObject({ ok: false, reason: 'upload_failed' });
    });

    it('produces a distinct key per upload (random-suffix header + timestamp)', async () => {
      const fetchImpl = fetchReturning(okResponse({ url: RETURNED_URL }));

      await putAvatar('user-1', PNG_BYTES, 'image/png', deps(fetchImpl));
      await putAvatar('user-1', PNG_BYTES, 'image/png', deps(fetchImpl));

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const [, init] = firstCall(fetchImpl);
      // Server-side de-duplication is delegated to the random-suffix header.
      expect(headersOf(init)['x-add-random-suffix']).toBe('1');
    });
  });
});
