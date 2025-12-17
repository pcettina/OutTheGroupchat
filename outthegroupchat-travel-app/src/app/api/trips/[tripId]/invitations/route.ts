import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { sendInvitationEmail, isEmailConfigured } from '@/lib/email';
import { logger } from '@/lib/logger';

const inviteSchema = z.object({
  emails: z.array(z.string().email()),
  expirationHours: z.number().min(1).max(72).default(24),
});

export async function GET(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a member
    const isMember = await prisma.tripMember.findFirst({
      where: { tripId, userId: session.user.id },
    });

    if (!isMember) {
      return NextResponse.json(
        { success: false, error: 'Not a member of this trip' },
        { status: 403 }
      );
    }

    const invitations = await prisma.tripInvitation.findMany({
      where: { tripId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: invitations });
  } catch (error) {
    logger.error({ err: error, context: 'INVITATIONS_GET' }, 'Failed to fetch invitations');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is owner or admin
    const membership = await prisma.tripMember.findFirst({
      where: {
        tripId,
        userId: session.user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to invite members' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validationResult = inviteSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { emails, expirationHours } = validationResult.data;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    const invitations = [];
    const errors = [];

    for (const email of emails) {
      try {
        // Find the user - do NOT create placeholder users (security fix)
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          // User doesn't exist - create a pending invitation instead
          // This prevents database pollution and email spoofing attacks
          const existingPendingInvitation = await prisma.pendingInvitation.findFirst({
            where: { email, tripId },
          });

          if (existingPendingInvitation) {
            // Update expiration of existing pending invitation
            await prisma.pendingInvitation.update({
              where: { id: existingPendingInvitation.id },
              data: { expiresAt },
            });
          } else {
            // Create new pending invitation for non-existent user
            await prisma.pendingInvitation.create({
              data: {
                email,
                tripId,
                invitedBy: session.user.id,
                expiresAt,
              },
            });
          }
          
          // Get trip details for the email
          const trip = await prisma.trip.findUnique({
            where: { id: tripId },
            select: { title: true },
          });

          // Send email invitation if email service is configured
          if (isEmailConfigured()) {
            const emailResult = await sendInvitationEmail({
              to: email,
              tripTitle: trip?.title || 'a trip',
              inviterName: session.user.name || 'Someone',
              tripId,
              expiresAt,
            });

            if (emailResult.success) {
              invitations.push({ 
                email, 
                status: 'email_sent',
                message: 'Invitation email sent successfully.' 
              });
            } else {
              logger.warn({ email, tripId, error: emailResult.error }, 'Failed to send invitation email');
              invitations.push({ 
                email, 
                status: 'email_failed',
                message: 'Pending invitation created but email failed to send.' 
              });
            }
          } else {
            // Email service not configured - log warning
            logger.warn({ email, tripId }, 'Email service not configured, invitation created without email');
            invitations.push({ 
              email, 
              status: 'email_pending',
              message: 'User not registered. Email service not configured.' 
            });
          }
          continue;
        }

        // Check if already a member
        const existingMember = await prisma.tripMember.findFirst({
          where: { tripId, userId: user.id },
        });

        if (existingMember) {
          errors.push({ email, error: 'Already a member' });
          continue;
        }

        // Check for existing pending invitation for registered user
        const existingInvitation = await prisma.tripInvitation.findFirst({
          where: {
            tripId,
            userId: user.id,
            status: 'PENDING',
          },
        });

        if (existingInvitation) {
          // Update expiration
          const updated = await prisma.tripInvitation.update({
            where: { id: existingInvitation.id },
            data: { expiresAt },
            include: {
              user: {
                select: { id: true, name: true, email: true, image: true },
              },
            },
          });
          invitations.push(updated);
        } else {
          // Create new invitation for existing user
          const invitation = await prisma.tripInvitation.create({
            data: {
              tripId,
              userId: user.id,
              expiresAt,
              status: 'PENDING',
            },
            include: {
              user: {
                select: { id: true, name: true, email: true, image: true },
              },
            },
          });
          invitations.push(invitation);

          // Create notification for the user
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'TRIP_INVITATION',
              title: 'Trip Invitation',
              message: `You've been invited to join a trip!`,
              data: { tripId, invitationId: invitation.id },
            },
          });
        }
      } catch (err) {
        errors.push({ email, error: 'Failed to process invitation' });
      }
    }

    // Update trip status to INVITING if in PLANNING
    await prisma.trip.update({
      where: { id: tripId, status: 'PLANNING' },
      data: { status: 'INVITING' },
    }).catch(() => {}); // Ignore if not in PLANNING

    return NextResponse.json({
      success: true,
      data: { invitations, errors },
    });
  } catch (error) {
    logger.error({ err: error, context: 'INVITATIONS_POST' }, 'Failed to send invitations');
    return NextResponse.json(
      { success: false, error: 'Failed to send invitations' },
      { status: 500 }
    );
  }
}

