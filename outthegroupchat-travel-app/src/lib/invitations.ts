/**
 * @module lib/invitations
 *
 * Trip invitation processing helper. Centralises the dual-path invitation
 * flow used by trip member endpoints:
 *
 *  - Registered users → create a `TripInvitation` row + in-app notification
 *    (or extend the existing PENDING invitation's expiry).
 *  - Unregistered emails → create / update a `PendingInvitation` row and
 *    send an email via Resend so they can accept after sign-up.
 *
 * As a side effect, a trip in `PLANNING` status is transitioned to
 * `INVITING` once at least one invitation has been processed. The function
 * never throws on a per-email error — failures are collected in the
 * `errors` array so the caller can return a partial-success response.
 */
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
 * Process a batch of member invitation emails for a trip.
 *
 * For each email: if the address belongs to a registered user, a
 * `TripInvitation` (+ notification) is created — or the existing PENDING
 * invitation's expiry is refreshed. Otherwise a `PendingInvitation` is
 * upserted and an invitation email is dispatched (best-effort). Existing
 * trip members are reported as `skipped` errors. After processing, the
 * trip is moved from `PLANNING` to `INVITING` if it was still in PLANNING.
 *
 * @param params - Invitation batch parameters
 * @param params.tripId - Trip the invitations are scoped to
 * @param params.tripTitle - Human-readable trip title used in emails / notifications
 * @param params.emails - Email addresses to invite (registered or not)
 * @param params.inviterId - User ID of the inviter (stored on PendingInvitation.invitedBy)
 * @param params.inviterName - Inviter's display name used in invitation email copy
 * @param params.expirationHours - Invitation lifetime in hours (default 24)
 * @returns Partition of per-email outcomes: `invitations` for successful / queued
 *   sends and `errors` for skipped (already-member) or failed entries. Never rejects.
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
