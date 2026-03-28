import { prisma } from '@/lib/prisma';
import { sendInvitationEmail, isEmailConfigured } from '@/lib/email';
import { logger } from '@/lib/logger';

/**
 * Outcome record for a single email address processed during invitation handling.
 *
 * Each element in the arrays returned by {@link processInvitations} conforms to
 * this shape so callers can surface per-address feedback to the user.
 */
interface InvitationResult {
  /** The email address this result relates to. */
  email: string;
  /**
   * Short status token describing what happened, e.g. `"invited"`,
   * `"email_sent"`, `"email_failed"`, `"email_pending"`, `"updated"`,
   * `"skipped"`, or `"error"`.
   */
  status: string;
  /** Human-readable success message when the operation completed (fully or partially). */
  message?: string;
  /** Human-readable error description when the operation failed or was skipped. */
  error?: string;
}

/**
 * Input parameters for {@link processInvitations}.
 */
interface ProcessInvitationsParams {
  /** Database ID of the trip to which users are being invited. */
  tripId: string;
  /** Human-readable trip title used in notification messages and emails. */
  tripTitle: string;
  /** List of email addresses to invite. */
  emails: string[];
  /** User ID of the person sending the invitations. */
  inviterId: string;
  /** Display name of the inviter, shown in invitation emails. */
  inviterName: string;
  /**
   * How many hours until the invitation expires.
   * @defaultValue 24
   */
  expirationHours?: number;
}

/**
 * Process member invitation emails for a trip.
 *
 * Iterates over the supplied email addresses and applies the correct invitation
 * strategy for each:
 *
 * - **Registered user** — creates (or refreshes) a `TripInvitation` record and
 *   emits a `TRIP_INVITATION` in-app notification.  Skipped silently if the user
 *   is already a member.
 * - **Unregistered email** — creates (or refreshes) a `PendingInvitation` record
 *   and, when the email service is configured, sends an invitation email via
 *   {@link sendInvitationEmail}.
 *
 * After processing all addresses the trip's status is transitioned from
 * `PLANNING` → `INVITING` (no-op if it is already in another state).
 *
 * @param params - See {@link ProcessInvitationsParams}.
 * @param params.tripId - Database ID of the trip.
 * @param params.tripTitle - Human-readable trip title for notifications/emails.
 * @param params.emails - Array of email addresses to invite.
 * @param params.inviterId - User ID of the person issuing the invitations.
 * @param params.inviterName - Display name of the inviter shown in email copy.
 * @param params.expirationHours - Hours until each invitation expires (default 24).
 *
 * @returns A promise that resolves to:
 *   - `invitations` — results for addresses that were successfully processed
 *     (status `"invited"`, `"updated"`, `"email_sent"`, `"email_failed"`, or
 *     `"email_pending"`).
 *   - `errors` — results for addresses that were skipped or failed (status
 *     `"skipped"` or `"error"`).
 *
 * @throws Never — per-address errors are caught and appended to the `errors`
 *   array; the trip-status update failure is silently ignored.
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
