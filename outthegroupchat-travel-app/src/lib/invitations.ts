import { prisma } from '@/lib/prisma';
import { sendInvitationEmail, isEmailConfigured } from '@/lib/email';
import { logger } from '@/lib/logger';

/**
 * Result descriptor for a single invitation attempt.
 *
 * @property email - The email address that was processed.
 * @property status - A short machine-readable status code describing the outcome
 *   (e.g. `'invited'`, `'updated'`, `'email_sent'`, `'email_failed'`,
 *   `'email_pending'`, `'skipped'`, `'error'`).
 * @property message - Optional human-readable success description.
 * @property error - Optional human-readable error description present when the
 *   invitation could not be fully processed.
 */
interface InvitationResult {
  email: string;
  status: string;
  message?: string;
  error?: string;
}

/**
 * Input parameters for {@link processInvitations}.
 *
 * @property tripId - Database ID of the trip to invite recipients to.
 * @property tripTitle - Human-readable trip title used in notification messages
 *   and invitation emails.
 * @property emails - List of email addresses to invite.
 * @property inviterId - Database ID of the user sending the invitations.
 * @property inviterName - Display name of the inviting user, shown in emails.
 * @property expirationHours - How many hours until the invitation expires.
 *   Defaults to `24`.
 */
interface ProcessInvitationsParams {
  tripId: string;
  tripTitle: string;
  emails: string[];
  inviterId: string;
  inviterName: string;
  expirationHours?: number;
}

/**
 * Process trip member invitations for a list of email addresses.
 *
 * For each email this function:
 * - **Registered user** — creates (or refreshes the expiry of) a
 *   `TripInvitation` record and fires an in-app `TRIP_INVITATION`
 *   notification. Does nothing if the user is already a member.
 * - **Unregistered email** — creates (or refreshes) a `PendingInvitation`
 *   record and, if the email service is configured, sends an invitation email
 *   via {@link sendInvitationEmail}.
 *
 * After processing all addresses the trip's status is transitioned from
 * `PLANNING` to `INVITING` (silently ignored if the trip is already in a
 * later state).
 *
 * @param params - See {@link ProcessInvitationsParams}.
 * @param params.tripId - Database ID of the destination trip.
 * @param params.tripTitle - Human-readable title shown in notifications/emails.
 * @param params.emails - Email addresses to invite.
 * @param params.inviterId - ID of the user issuing the invitations.
 * @param params.inviterName - Display name of the inviting user.
 * @param params.expirationHours - Hours until invitations expire (default 24).
 *
 * @returns An object with two arrays:
 *   - `invitations` — successfully processed entries (status `'invited'`,
 *     `'updated'`, `'email_sent'`, `'email_failed'`, or `'email_pending'`).
 *   - `errors` — entries that could not be processed (status `'skipped'` for
 *     existing members or `'error'` for unexpected failures).
 *
 * @throws Does not throw; per-email errors are captured in the `errors` array.
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
            type: 'TRIP_INVITATION',
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
