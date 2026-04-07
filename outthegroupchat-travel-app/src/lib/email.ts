import { Resend } from 'resend';
import { logError, logSuccess } from '@/lib/logger';

// Initialize Resend client
const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Default sender - use your verified domain in production
const DEFAULT_FROM = process.env.EMAIL_FROM || 'OutTheGroupchat <noreply@outthegroupchat.com>';

// App URL for links in emails
const APP_URL = process.env.NEXTAUTH_URL || 'https://outthegroupchat.com';

/**
 * Check if the email service (Resend) is configured and ready to send mail.
 *
 * @returns `true` when a Resend API key is present and the client has been
 *   initialised; `false` otherwise. Callers should gate email-sending code
 *   behind this check to avoid runtime errors when the key is absent.
 */
export function isEmailConfigured(): boolean {
  return !!resend;
}

/**
 * Send a trip invitation email to a user who has not yet registered.
 *
 * Generates a sign-up URL that deep-links the recipient into the specified
 * trip after account creation. Both an HTML and a plain-text version of the
 * email are sent to maximise deliverability.
 *
 * @param params - Invitation parameters.
 * @param params.to - Recipient email address. Must be a valid RFC-5322 address.
 * @param params.tripTitle - Human-readable title of the trip being shared.
 * @param params.inviterName - Display name of the user sending the invitation.
 * @param params.tripId - Database ID of the trip; used to build the redirect URL.
 * @param params.expiresAt - Optional expiry date shown in the email body.
 *
 * @returns A result object:
 *   - `success: true` with a `messageId` string on successful delivery.
 *   - `success: false` with an `error` description on failure.
 *
 * @throws Does not throw; all errors are caught and returned as `{ success: false }`.
 */
export async function sendInvitationEmail(params: {
  to: string;
  tripTitle: string;
  inviterName: string;
  tripId: string;
  expiresAt?: Date;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, tripTitle, inviterName, tripId, expiresAt } = params;

  if (!resend) {
    logError('EMAIL_SEND', new Error('Resend API key not configured'));
    return { 
      success: false, 
      error: 'Email service not configured. Set RESEND_API_KEY environment variable.' 
    };
  }

  const signupUrl = `${APP_URL}/auth/signup?redirect=/trips/${tripId}&invitation=true`;
  const expiryText = expiresAt 
    ? `This invitation expires on ${expiresAt.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}.`
    : '';

  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      logError('EMAIL_SEND', new Error('Invalid email format'), { to, tripId });
      return { success: false, error: 'Invalid email address format' };
    }

    // Log email attempt without exposing any API key material
    logSuccess('EMAIL_SEND', 'Attempting to send invitation email', {
      to,
      tripId,
      from: DEFAULT_FROM,
      configured: true,
    });

    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: `${inviterName} invited you to join "${tripTitle}" on OutTheGroupchat`,
      html: generateInvitationEmailHtml({
        tripTitle,
        inviterName,
        signupUrl,
        expiryText,
      }),
      text: generateInvitationEmailText({
        tripTitle,
        inviterName,
        signupUrl,
        expiryText,
      }),
    });

    if (error) {
      logError('EMAIL_SEND', error, { 
        to, 
        tripId, 
        errorMessage: error.message,
        errorName: error.name,
        errorDetails: JSON.stringify(error)
      });
      return { success: false, error: error.message || 'Failed to send email' };
    }

    // Validate that we got a message ID
    if (!data?.id) {
      logError('EMAIL_SEND', new Error('No message ID returned from Resend'), { 
        to, 
        tripId,
        responseData: JSON.stringify(data)
      });
      return { success: false, error: 'Email service returned no message ID' };
    }

    logSuccess('EMAIL_SEND', 'Invitation email sent successfully', { 
      to, 
      tripId, 
      messageId: data.id,
      from: DEFAULT_FROM
    });
    
    return { success: true, messageId: data.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logError('EMAIL_SEND', error, { 
      to, 
      tripId,
      errorMessage,
      errorStack,
      from: DEFAULT_FROM
    });
    return { 
      success: false, 
      error: errorMessage
    };
  }
}

/**
 * Send a generic notification email to an existing user.
 *
 * Renders a branded HTML email (with a plain-text fallback) containing a
 * title, body message, and an optional call-to-action button. Suitable for
 * any transactional notification that does not require a dedicated template.
 *
 * @param params - Notification parameters.
 * @param params.to - Recipient email address.
 * @param params.subject - Email subject line shown in the inbox.
 * @param params.title - Heading displayed at the top of the email body.
 * @param params.message - Main body text of the notification.
 * @param params.actionUrl - Optional URL for the call-to-action button.
 *   When omitted, no button is rendered.
 * @param params.actionText - Label text for the call-to-action button.
 *   Ignored when `actionUrl` is absent.
 *
 * @returns A result object:
 *   - `success: true` with a `messageId` string on successful delivery.
 *   - `success: false` with an `error` description on failure.
 *
 * @throws Does not throw; all errors are caught and returned as `{ success: false }`.
 */
export async function sendNotificationEmail(params: {
  to: string;
  subject: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, subject, title, message, actionUrl, actionText } = params;

  if (!resend) {
    return { 
      success: false, 
      error: 'Email service not configured' 
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject,
      html: generateNotificationEmailHtml({ title, message, actionUrl, actionText }),
      text: generateNotificationEmailText({ title, message, actionUrl, actionText }),
    });

    if (error) {
      logError('EMAIL_NOTIFICATION', error, { to });
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    logError('EMAIL_NOTIFICATION', error, { to });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}

// =============================================================================
// Email HTML Templates
// =============================================================================

function generateInvitationEmailHtml(params: {
  tripTitle: string;
  inviterName: string;
  signupUrl: string;
  expiryText: string;
}): string {
  const { tripTitle, inviterName, signupUrl, expiryText } = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trip Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                ✈️ OutTheGroupchat
              </h1>
              <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">
                Group Travel, Made Easy
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 24px; font-weight: 600;">
                You're Invited! 🎉
              </h2>
              
              <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                <strong>${inviterName}</strong> has invited you to join their trip:
              </p>
              
              <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 0 0 20px; border-radius: 0 8px 8px 0;">
                <h3 style="margin: 0; color: #065f46; font-size: 20px; font-weight: 600;">
                  "${tripTitle}"
                </h3>
              </div>
              
              <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Join OutTheGroupchat to help plan the trip, vote on activities, and make memories together!
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${signupUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              ${expiryText ? `
              <p style="margin: 30px 0 0; color: #9ca3af; font-size: 14px; text-align: center;">
                ${expiryText}
              </p>
              ` : ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} OutTheGroupchat. All rights reserved.
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

function generateInvitationEmailText(params: {
  tripTitle: string;
  inviterName: string;
  signupUrl: string;
  expiryText: string;
}): string {
  const { tripTitle, inviterName, signupUrl, expiryText } = params;

  return `
You're Invited to OutTheGroupchat!

${inviterName} has invited you to join their trip: "${tripTitle}"

Join OutTheGroupchat to help plan the trip, vote on activities, and make memories together!

Accept your invitation here:
${signupUrl}

${expiryText}

---
If you didn't expect this invitation, you can safely ignore this email.

© ${new Date().getFullYear()} OutTheGroupchat. All rights reserved.
  `.trim();
}

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
                ✈️ OutTheGroupchat
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
                © ${new Date().getFullYear()} OutTheGroupchat. All rights reserved.
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

