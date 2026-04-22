/**
 * @module email-crew
 * Transactional email helpers for Crew lifecycle events: connection requests and acceptances.
 * All functions degrade gracefully — they log on failure and never throw.
 */
import { Resend } from 'resend';
import { logError } from '@/lib/logger';

// Initialize Resend client (mirrors email.ts initialization)
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const DEFAULT_FROM = process.env.EMAIL_FROM || 'OutTheGroupchat <noreply@outthegroupchat.com>';
const APP_URL = process.env.NEXTAUTH_URL || 'https://outthegroupchat.com';

// ---------------------------------------------------------------------------
// Internal HTML/text helpers (duplicated here to keep this module self-contained)
// ---------------------------------------------------------------------------

function generateNotificationEmailHtml(params: {
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}): string {
  const { title, message, actionUrl, actionText } = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px 20px; text-align: center; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; color: #10b981; font-size: 24px; font-weight: 700;">
                OutTheGroupchat
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 22px; font-weight: 600;">
                ${title}
              </h2>

              <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                ${message}
              </p>

              ${actionUrl && actionText ? `
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${actionUrl}" style="display: inline-block; padding: 14px 28px; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      ${actionText}
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                &copy; ${new Date().getFullYear()} OutTheGroupchat. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateNotificationEmailText(params: {
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}): string {
  const { title, message, actionUrl, actionText } = params;

  return `
${title}

${message}

${actionUrl ? `${actionText || 'View'}: ${actionUrl}` : ''}

---
© ${new Date().getFullYear()} OutTheGroupchat. All rights reserved.
  `.trim();
}

// =============================================================================
// Crew Email Functions
// =============================================================================

/**
 * Send a Crew request email to the recipient.
 * The body honors the sender's own `crewLabel` for phrasing
 * ("Squad request from Alex") when provided; falls back to "Crew" otherwise.
 * @param to - Recipient email address
 * @param recipientName - Display name of the recipient (null if unavailable)
 * @param senderName - Display name of the user sending the Crew request
 * @param senderCrewLabel - Custom Crew label from the sender's profile (null to use default)
 * @param crewId - Unique identifier for the Crew record (used for logging context)
 * @returns Promise resolving to a success/error result object
 */
export async function sendCrewRequestEmail(params: {
  to: string;
  recipientName: string | null;
  senderName: string;
  senderCrewLabel: string | null;
  crewId: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, recipientName, senderName, senderCrewLabel, crewId } = params;

  if (!resend) {
    return { success: false, error: 'Email service not configured' };
  }

  const label = senderCrewLabel && senderCrewLabel.trim().length > 0 ? senderCrewLabel : 'Crew';
  const actionUrl = `${APP_URL}/crew/requests`;
  const subject = `${senderName} wants to add you to their ${label}`;
  const title = `New ${label} request`;
  const message = `${senderName} wants to add you to their ${label} on OutTheGroupchat. Open your requests to accept or decline.`;

  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject,
      html: generateNotificationEmailHtml({
        title,
        message: recipientName ? `Hi ${recipientName} — ${message}` : message,
        actionUrl,
        actionText: 'View request',
      }),
      text: generateNotificationEmailText({
        title,
        message,
        actionUrl,
        actionText: 'View request',
      }),
    });

    if (error) {
      logError('EMAIL_CREW_REQUEST', error, { to, crewId });
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    logError('EMAIL_CREW_REQUEST', err, { to, crewId });
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email',
    };
  }
}

/**
 * Send a Crew-accepted email to the original requester.
 * Uses the acceptor's `crewLabel` when phrasing ("Alex joined your Crew").
 * @param to - Recipient email address (the user who sent the original Crew request)
 * @param requesterName - Display name of the original requester (null if unavailable)
 * @param accepterName - Display name of the user who accepted the request
 * @param accepterCrewLabel - Custom Crew label from the accepter's profile (null to use default)
 * @param crewId - Unique identifier for the Crew record (used for logging context)
 * @returns Promise resolving to a success/error result object
 */
export async function sendCrewAcceptedEmail(params: {
  to: string;
  requesterName: string | null;
  accepterName: string;
  accepterCrewLabel: string | null;
  crewId: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, requesterName, accepterName, accepterCrewLabel, crewId } = params;

  if (!resend) {
    return { success: false, error: 'Email service not configured' };
  }

  const label = accepterCrewLabel && accepterCrewLabel.trim().length > 0 ? accepterCrewLabel : 'Crew';
  const actionUrl = `${APP_URL}/crew`;
  const subject = `${accepterName} accepted your ${label} request`;
  const title = `You're in the ${label}`;
  const message = `${accepterName} accepted your request. You're now part of each other's ${label} on OutTheGroupchat.`;

  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject,
      html: generateNotificationEmailHtml({
        title,
        message: requesterName ? `Hi ${requesterName} — ${message}` : message,
        actionUrl,
        actionText: 'View your Crew',
      }),
      text: generateNotificationEmailText({
        title,
        message,
        actionUrl,
        actionText: 'View your Crew',
      }),
    });

    if (error) {
      logError('EMAIL_CREW_ACCEPTED', error, { to, crewId });
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    logError('EMAIL_CREW_ACCEPTED', err, { to, crewId });
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email',
    };
  }
}
