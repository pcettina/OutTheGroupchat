/**
 * Provider-agnostic blob storage wrapper (avatars).
 *
 * Design constraints
 * ------------------
 * - **Zero dependencies.** No storage SDK is installed in this project, so the
 *   Vercel Blob REST API is called with plain `fetch`. Swapping providers means
 *   replacing `putAvatar`'s body, not touching any caller.
 * - **Never throws.** Every failure is returned as a discriminated
 *   `StorageResult`. The route layer maps `reason` to an HTTP status; a missing
 *   storage env must produce a graceful "configure storage" path, not a crash.
 * - **Env is read inside functions**, never at module scope, so tests can use
 *   `vi.stubEnv` without `vi.resetModules`.
 * - **Magic-byte sniffing is the real security control.** A client-supplied
 *   `Content-Type` header is attacker-controlled and is never trusted.
 */

import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum accepted avatar payload size, in bytes (2 MB). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Image MIME types accepted for avatars. */
export const ALLOWED_AVATAR_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

/** The union of MIME types in {@link ALLOWED_AVATAR_TYPES}. */
export type AvatarContentType = (typeof ALLOWED_AVATAR_TYPES)[number];

/** File extension used in the stored object key, per content type. */
const EXTENSION_BY_TYPE: Record<AvatarContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Vercel Blob REST endpoint. Public, versioned via the `x-api-version` header. */
const BLOB_API_BASE = 'https://blob.vercel-storage.com';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type StorageResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: 'not_configured' | 'upload_failed';
      message: string;
    };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * True only when the blob storage credential is present in the environment.
 *
 * Read lazily (not cached at module scope) so that a deploy which adds the env
 * var does not require a code change, and so tests can stub it per-case.
 */
export function isStorageConfigured(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return !!token;
}

/** Narrowing guard for the accepted avatar MIME types. */
export function isAllowedAvatarType(value: string): value is AvatarContentType {
  return (ALLOWED_AVATAR_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Magic-byte sniffing
// ---------------------------------------------------------------------------

/** Compare `bytes[offset..]` against a byte signature. */
function matchesSignature(
  bytes: Uint8Array,
  offset: number,
  signature: readonly number[]
): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const; // "RIFF"
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const; // "WEBP"

/**
 * Detect the image format from the file's leading bytes.
 *
 * Pure — no I/O, no env, no allocation beyond the comparison. This is the
 * authoritative type check for uploads: the multipart `Content-Type` is
 * supplied by the client and can claim anything.
 *
 * @returns the detected MIME type, or `null` when the bytes are not a
 *          supported image (including for truncated/empty input).
 */
export function sniffImageType(bytes: Uint8Array): AvatarContentType | null {
  if (matchesSignature(bytes, 0, PNG_SIGNATURE)) return 'image/png';
  if (matchesSignature(bytes, 0, JPEG_SIGNATURE)) return 'image/jpeg';
  // WEBP is a RIFF container: "RIFF" <4-byte size> "WEBP".
  if (
    matchesSignature(bytes, 0, RIFF_SIGNATURE) &&
    matchesSignature(bytes, 8, WEBP_SIGNATURE)
  ) {
    return 'image/webp';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/** Strip characters that must not appear in an object key path segment. */
function sanitizeKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '') || 'user';
}

/**
 * Upload an avatar and return its public URL.
 *
 * Never throws. When storage is not configured the caller receives
 * `{ ok: false, reason: 'not_configured' }` and is expected to surface a
 * "configure storage" path (HTTP 503) rather than a 500.
 *
 * @param userId      owner of the avatar; used to build the object key
 * @param bytes       raw image bytes (already size- and magic-byte-validated)
 * @param contentType MIME type, which MUST come from {@link sniffImageType}
 * @param deps        injection seam — pass `fetchImpl` in tests so no network
 *                    call or real credential is required
 */
export async function putAvatar(
  userId: string,
  bytes: Uint8Array,
  contentType: string,
  deps?: { fetchImpl?: typeof fetch }
): Promise<StorageResult> {
  if (!isStorageConfigured()) {
    logger.warn('[STORAGE] BLOB_READ_WRITE_TOKEN is not set; avatar upload skipped');
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Avatar storage is not configured',
    };
  }

  if (!isAllowedAvatarType(contentType)) {
    return {
      ok: false,
      reason: 'upload_failed',
      message: `Unsupported content type: ${contentType}`,
    };
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN!.trim();
  const extension = EXTENSION_BY_TYPE[contentType];
  const key = `avatars/${sanitizeKeySegment(userId)}-${Date.now()}.${extension}`;
  const doFetch = deps?.fetchImpl ?? fetch;

  try {
    const response = await doFetch(`${BLOB_API_BASE}/${key}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'x-api-version': '7',
        'x-content-type': contentType,
        'x-add-random-suffix': '1',
      },
      // `BodyInit`/`BlobPart` are typed against `ArrayBufferView<ArrayBuffer>`,
      // which the widest `Uint8Array` (`Uint8Array<ArrayBufferLike>`, i.e.
      // possibly SharedArrayBuffer-backed) does not satisfy. `.slice()` returns
      // an `ArrayBuffer`-backed copy, keeping the public parameter type
      // ergonomic for callers. Same bytes.
      body: new Blob([bytes.slice()], { type: contentType }),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, key },
        '[STORAGE] Blob upload returned a non-OK response'
      );
      return {
        ok: false,
        reason: 'upload_failed',
        message: `Upload failed with status ${response.status}`,
      };
    }

    const payload = (await response.json()) as { url?: unknown };
    if (typeof payload?.url !== 'string' || payload.url.length === 0) {
      logger.error({ key }, '[STORAGE] Blob upload response did not include a url');
      return {
        ok: false,
        reason: 'upload_failed',
        message: 'Upload succeeded but no URL was returned',
      };
    }

    return { ok: true, url: payload.url };
  } catch (error) {
    captureException(error);
    logger.error({ error, key }, '[STORAGE] Blob upload threw');
    return {
      ok: false,
      reason: 'upload_failed',
      message: 'Upload failed',
    };
  }
}
