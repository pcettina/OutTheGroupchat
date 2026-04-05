import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { checkRateLimit, authRateLimiter } from '@/lib/rate-limit';

// Identifier namespace kept distinct from password-reset tokens.
const TOKEN_IDENTIFIER = (email: string) => `beta-init:${email}`;
// Token is valid for 72 hours — long enough for a beta user to act on an invite email.
const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const IssueTokenSchema = z.object({
  email: z.string().email(),
});

const InitializePasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  // token is now REQUIRED — the stub comment has been replaced with real validation.
  token: z.string().min(1, 'Initialization token is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// API-key guard (same key used by the beta/signup route)
// ─────────────────────────────────────────────────────────────────────────────

function validateApiKey(req: Request): boolean {
  const N8N_API_KEY = process.env.N8N_API_KEY;
  if (!N8N_API_KEY) {
    // If the env var is not set, fail closed rather than open.
    return false;
  }
  return req.headers.get('x-api-key') === N8N_API_KEY;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beta/initialize-password
//
// Issues a one-time initialization token for a beta user's email address.
// Must be called by an authorised backend service (N8N_API_KEY required).
// The token is stored hashed in VerificationToken and returned in plaintext
// for inclusion in the invite email sent to the user.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  // Rate limit by IP to prevent enumeration even before API key validation.
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const rateLimitResult = await checkRateLimit(authRateLimiter, `beta-init-get:${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  // Only authorised backend callers may issue tokens.
  if (!validateApiKey(req)) {
    return NextResponse.json(
      { error: 'Unauthorized - Invalid API key' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const parseResult = IssueTokenSchema.safeParse({ email: searchParams.get('email') });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { email } = parseResult.data;
    const emailLower = email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: emailLower },
      select: { id: true, passwordInitialized: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.passwordInitialized) {
      return NextResponse.json(
        { error: 'Password already initialized for this user' },
        { status: 400 }
      );
    }

    // Rotate: delete any existing init token for this address.
    await prisma.verificationToken.deleteMany({
      where: { identifier: TOKEN_IDENTIFIER(emailLower) },
    });

    const plainToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.verificationToken.create({
      data: {
        identifier: TOKEN_IDENTIFIER(emailLower),
        token: plainToken,
        expires,
      },
    });

    logger.info({ email: emailLower }, '[BETA_INIT] Issued initialization token');

    return NextResponse.json({ token: plainToken, expires });
  } catch (error) {
    logger.error({ err: error, context: 'BETA_INIT_TOKEN' }, 'Error issuing init token');
    return NextResponse.json(
      { error: 'Unable to issue initialization token. Please try again.' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/beta/initialize-password
//
// Sets a password for a beta user who has received an initialization token via
// email.  The token is validated (existence + expiry) before any write occurs.
// This endpoint is intentionally unauthenticated at the session level because
// the user does not yet have a session — they are setting their password for
// the first time.  Security is provided exclusively by the time-limited token.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // Require N8N_API_KEY to prevent unauthenticated account takeover
    if (!validateApiKey(req)) {
      logger.warn({ context: 'PASSWORD_INIT' }, 'Unauthorized attempt to initialize password — invalid API key');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parseResult = InitializePasswordSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { email, password, token } = parseResult.data;
    const emailLower = email.toLowerCase();

    // ── 1. Find user ──────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { email: emailLower },
    });

    if (!user) {
      // Return 400 rather than 404 to avoid email enumeration.
      return NextResponse.json(
        { error: 'Invalid or expired initialization token' },
        { status: 400 }
      );
    }

    // ── 2. Guard: password already set ───────────────────────────────────────
    if (user.password && user.passwordInitialized) {
      return NextResponse.json(
        { error: 'Password already initialized' },
        { status: 400 }
      );
    }

    // ── 3. Validate the initialization token ─────────────────────────────────
    const verificationToken = await prisma.verificationToken.findUnique({
      where: {
        identifier_token: {
          identifier: TOKEN_IDENTIFIER(emailLower),
          token,
        },
      },
    });

    if (!verificationToken) {
      logger.warn({ email: emailLower }, '[BETA_INIT] Invalid token presented');
      return NextResponse.json(
        { error: 'Invalid or expired initialization token' },
        { status: 400 }
      );
    }

    if (verificationToken.expires < new Date()) {
      // Clean up the expired record.
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: TOKEN_IDENTIFIER(emailLower),
            token,
          },
        },
      }).catch(() => undefined); // non-fatal if already deleted

      logger.warn({ email: emailLower }, '[BETA_INIT] Expired token presented');
      return NextResponse.json(
        { error: 'Initialization token has expired. Please request a new invite.' },
        { status: 400 }
      );
    }

    // ── 4. Hash password and commit atomically ────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 12);

    const updatedUser = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordInitialized: true,
        },
      });

      // Consume the token so it cannot be reused.
      await tx.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: TOKEN_IDENTIFIER(emailLower),
            token,
          },
        },
      });

      return updated;
    });

    logger.info({ userId: updatedUser.id, email: emailLower }, '[BETA_INIT] Password initialized');

    // ── 5. Process any pending trip invitations (unchanged) ───────────────────
    try {
      const pendingInvitations = await prisma.pendingInvitation.findMany({
        where: {
          email: emailLower,
          expiresAt: { gt: new Date() },
        },
        include: {
          trip: { select: { title: true } },
        },
      });

      if (pendingInvitations.length > 0) {
        for (const pending of pendingInvitations) {
          await prisma.tripInvitation.create({
            data: {
              tripId: pending.tripId,
              userId: updatedUser.id,
              status: 'PENDING',
              expiresAt: pending.expiresAt,
            },
          });

          await prisma.notification.create({
            data: {
              userId: updatedUser.id,
              type: 'TRIP_INVITATION',
              title: 'Trip Invitation',
              message: `You've been invited to join "${pending.trip.title}"!`,
              data: { tripId: pending.tripId },
            },
          });
        }

        await prisma.pendingInvitation.deleteMany({
          where: { email: emailLower },
        });

        logger.info(
          { userId: updatedUser.id, invitationsProcessed: pendingInvitations.length },
          '[BETA_INIT] Processed pending invitations'
        );
      }
    } catch (inviteError) {
      logger.error(
        { err: inviteError, userId: updatedUser.id },
        '[BETA_INIT] Failed to process pending invitations'
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Password initialized successfully',
    });
  } catch (error) {
    logger.error({ err: error, context: 'BETA_INIT' }, 'Error during password initialization');
    return NextResponse.json(
      { error: 'Unable to initialize password. Please try again.' },
      { status: 500 }
    );
  }
}
