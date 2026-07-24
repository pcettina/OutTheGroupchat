/**
 * Avatar upload endpoint.
 *
 * POST   /api/profile/avatar  — multipart upload; sets `User.image`
 * DELETE /api/profile/avatar  — clears `User.image`
 *
 * Validation note: this route accepts `multipart/form-data`, not JSON, so the
 * project's "Zod on all API inputs" convention is satisfied imperatively —
 * Zod cannot meaningfully parse a `File` entry. The checks below (presence,
 * size, magic bytes) are the equivalent gate, and magic-byte sniffing is
 * strictly stronger than validating the client-declared content type.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import {
  checkRateLimit,
  authRateLimiter,
  getRateLimitHeaders,
} from '@/lib/rate-limit';
import { AVATAR_MAX_BYTES, putAvatar, sniffImageType } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(authRateLimiter, `avatar:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    // A non-multipart body makes formData() throw; treat that as a bad request
    // rather than letting it fall through to the 500 handler.
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Expected a multipart/form-data body' },
        { status: 400 }
      );
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'Missing "file" upload field' },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
    }

    if (file.size > AVATAR_MAX_BYTES) {
      return NextResponse.json(
        {
          error: 'Image is too large',
          maxBytes: AVATAR_MAX_BYTES,
        },
        { status: 413 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Magic bytes are authoritative. A declared content-type that disagrees
    // (or is absent) is rejected here.
    const detectedType = sniffImageType(bytes);
    if (!detectedType) {
      return NextResponse.json(
        { error: 'Unsupported image type. Use PNG, JPEG, or WebP.' },
        { status: 400 }
      );
    }

    const result = await putAvatar(session.user.id, bytes, detectedType);

    if (!result.ok) {
      if (result.reason === 'not_configured') {
        // Graceful "configure storage" path — an unset env is an operator
        // problem, not a server fault, and must not surface as a crash/500.
        return NextResponse.json(
          {
            error: 'Avatar storage is not configured',
            code: 'STORAGE_NOT_CONFIGURED',
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to upload avatar', code: 'STORAGE_UPLOAD_FAILED' },
        { status: 502 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { image: result.url },
      select: { id: true, image: true },
    });

    logger.info(
      { userId: session.user.id, contentType: detectedType, bytes: file.size },
      '[PROFILE_AVATAR_POST] Avatar updated'
    );

    return NextResponse.json({ image: updated.image });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[PROFILE_AVATAR_POST] Internal error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { image: null },
      select: { id: true, image: true },
    });

    logger.info(
      { userId: session.user.id },
      '[PROFILE_AVATAR_DELETE] Avatar cleared'
    );

    return NextResponse.json({ image: updated.image });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[PROFILE_AVATAR_DELETE] Internal error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
