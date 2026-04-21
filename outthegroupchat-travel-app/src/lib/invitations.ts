import { prisma } from '@/lib/prisma';
import { sendInvitationEmail, isEmailConfigured } from '@/lib/email';
import { logger } from '@/lib/logger';

interface InvitationResult {
  email: string;
  status: string;
  message?: string;
  error?: string;
}

interface ProcessInvitationsParams {
  tripId: string;
  tripTitle: string;
  emails: string[];
  inviterId: string;
  inviterName: string;
  expirationHours?: number;
}

/**
 * Process member invitation emails for a trip.
 * Handles both registered users (creates TripInvitation) and
 * unregistered emails (creates PendingInvitation + sends email).
 */
export async function processInvitations({
  tripId,
  tripTitle,
  emails,
  inviterId,
  inviterName,
  expirationHours = 24,
}: ProcessInvitationsParams): Promise<{
  invitations: InvitationResult[];
  errors: InvitationResult[];
}> {
  const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
  const invitations: InvitationResult[] = [];
  const errors: InvitationResult[] = [];

  for (const email of emails) {
    try {
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        // Unregistered user — create or update PendingInvitation
        const existingPending = await prisma.pendingInvitation.findFirst({
          where: { email, tripId },
        });

        if (existingPending) {
          await prisma.pendingInvitation.update({
            where: { id: existingPending.id },
            data: { expiresAt },
          });
        } else {
          await prisma.pendingInvitation.create({
            data: {
              email,
              tripId,
              invitedBy: inviterId,
              expiresAt,
            },
          });
        }

        // Send invitation email
        if (isEmailConfigured()) {
          const emailResult = await sendInvitationEmail({
            to: email,
            tripTitle,
            inviterName,
            tripId,
            expiresAt,
          });

          if (emailResult.success) {
            invitations.push({
              email,
              status: 'email_sent',
              message: 'Invitation email sent successfully.',
            });
          } else {
            logger.warn({ email, tripId, error: emailResult.error }, 'Failed to send invitation email');
            invitations.push({
              email,
              status: 'email_failed',
              message: 'Pending invitation created but email failed to send.',
            });
          }
        } else {
          logger.warn({ email, tripId }, 'Email service not configured, invitation created without email');
          invitations.push({
            email,
            status: 'email_pending',
            message: 'User not registered. Email service not configured.',
          });
        }
        continue;
      }

      // Skip if already a member
      const existingMember = await prisma.tripMember.findFirst({
        where: { tripId, userId: user.id },
      });

      if (existingMember) {
        errors.push({ email, status: 'skipped', error: 'Already a member' });
        continue;
      }

      // Check for existing pending invitation for registered user
      const existingInvitation = await prisma.tripInvitation.findFirst({
        where: { tripId, userId: user.id, status: 'PENDING' },
      });

      if (existingInvitation) {
        await prisma.tripInvitation.update({
          where: { id: existingInvitation.id },
          data: { expiresAt },
        });
        invitations.push({
          email,
          status: 'updated',
          message: 'Existing invitation expiration updated.',
        });
      } else {
        const invitation = await prisma.tripInvitation.create({
          data: {
            tripId,
            userId: user.id,
            expiresAt,
            status: 'PENDING',
          },
        });

        // Create notification
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'SYSTEM',
            title: 'Trip Invitation',
            message: `You've been invited to join "${tripTitle}"!`,
            data: { tripId, invitationId: invitation.id },
          },
        });

        invitations.push({
          email,
          status: 'invited',
          message: 'Invitation created and notification sent.',
        });
      }
    } catch (err) {
      logger.error({ err, email, tripId }, 'Failed to process invitation');
      errors.push({ email, status: 'error', error: 'Failed to process invitation' });
    }
  }

  // Transition trip to INVITING if still in PLANNING
  await prisma.trip.update({
    where: { id: tripId, status: 'PLANNING' },
    data: { status: 'INVITING' },
  }).catch(() => {}); // Ignore if not in PLANNING

  return { invitations, errors };
}
