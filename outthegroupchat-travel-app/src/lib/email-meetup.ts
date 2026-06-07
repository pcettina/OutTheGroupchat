/**
 * @module lib/email-meetup
 *
 * Transactional meetup email senders extracted from `lib/email.ts`. Each
 * function wraps a Resend send call with graceful-degradation semantics:
 * if Resend is not configured (no `RESEND_API_KEY`) or the network call
 * fails, the error is logged via `logError` but never thrown — meetup API
 * routes must not 500 just because email delivery is unavailable.
 *
 * All functions share the same notification-email layout (HTML + plain
 * text fallback) and a meetup-detail URL pattern of `${APP_URL}/meetups/${id}`.
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
// Meetup Email Functions
// =============================================================================

/**
 * Sends a meetup invite email to the specified recipient.
 * Gracefully degrades — logs but does not throw on failure.
 * @param to - Recipient email address
 * @param inviteeName - Recipient's display name
 * @param hostName - Name of the meetup host
 * @param meetupTitle - Title of the meetup
 * @param meetupDate - Formatted date string of the meetup
 * @param meetupVenueName - Name of the venue where the meetup will be held
 * @param meetupId - Unique identifier for the meetup (used to build the URL)
 * @returns Promise that resolves when the attempt completes (never rejects)
 */
export async function sendMeetupInviteEmail(params: {
  to: string;
  inviteeName: string;
  hostName: string;
  meetupTitle: string;
  meetupDate: string;
  meetupVenueName: string;
  meetupId: string;
}): Promise<void> {
  const { to, inviteeName, hostName, meetupTitle, meetupDate, meetupVenueName, meetupId } = params;
  if (!resend) {
    logError('EMAIL_MEETUP_INVITE', new Error('Email service not configured'), { to, meetupId });
    return;
  }
  const meetupUrl = `${APP_URL}/meetups/${meetupId}`;
  const details = `When: ${meetupDate}\nWhere: ${meetupVenueName}`;
  const detailsHtml = `<strong>When:</strong> ${meetupDate}<br><strong>Where:</strong> ${meetupVenueName}`;
  try {
    const { error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: `${hostName} invited you to ${meetupTitle}`,
      html: generateNotificationEmailHtml({
        title: `You're invited to ${meetupTitle}`,
        message: `Hi ${inviteeName} — ${hostName} has invited you to a meetup.<br><br>${detailsHtml}`,
        actionUrl: meetupUrl,
        actionText: 'View Meetup',
      }),
      text: generateNotificationEmailText({
        title: `You're invited to ${meetupTitle}`,
        message: `Hi ${inviteeName} — ${hostName} has invited you to a meetup.\n\n${details}`,
        actionUrl: meetupUrl,
        actionText: 'View Meetup',
      }),
    });
    if (error) logError('EMAIL_MEETUP_INVITE', error, { to, meetupId });
  } catch (err) {
    logError('EMAIL_MEETUP_INVITE', err, { to, meetupId });
  }
}

/**
 * Sends an RSVP confirmation email to the attendee after they respond to a meetup.
 * Gracefully degrades — logs but does not throw on failure.
 * @param to - Recipient email address
 * @param attendeeName - Recipient's display name
 * @param meetupTitle - Title of the meetup
 * @param meetupDate - Formatted date string of the meetup
 * @param meetupVenueName - Name of the venue where the meetup will be held
 * @param status - The RSVP status the attendee selected ('GOING' | 'MAYBE' | 'DECLINED')
 * @param meetupId - Unique identifier for the meetup (used to build the URL)
 * @returns Promise that resolves when the attempt completes (never rejects)
 */
export async function sendMeetupRSVPConfirmationEmail(params: {
  to: string;
  attendeeName: string;
  meetupTitle: string;
  meetupDate: string;
  meetupVenueName: string;
  status: 'GOING' | 'MAYBE' | 'DECLINED';
  meetupId: string;
}): Promise<void> {
  const { to, attendeeName, meetupTitle, meetupDate, meetupVenueName, status, meetupId } = params;
  if (!resend) {
    logError('EMAIL_MEETUP_RSVP', new Error('Email service not configured'), { to, meetupId });
    return;
  }
  const meetupUrl = `${APP_URL}/meetups/${meetupId}`;
  const statusLabel = status === 'GOING' ? 'Going' : status === 'MAYBE' ? 'Maybe' : 'Declined';
  const statusNote =
    status === 'GOING'
      ? `You're confirmed as attending.`
      : status === 'MAYBE'
        ? `You've indicated you might attend.`
        : `You've declined this meetup.`;
  const details = `When: ${meetupDate}\nWhere: ${meetupVenueName}`;
  const detailsHtml = `<strong>When:</strong> ${meetupDate}<br><strong>Where:</strong> ${meetupVenueName}`;
  try {
    const { error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: `Your RSVP for ${meetupTitle}`,
      html: generateNotificationEmailHtml({
        title: `RSVP confirmed: ${meetupTitle}`,
        message: `Hi ${attendeeName} — your RSVP status is <strong>${statusLabel}</strong>. ${statusNote}<br><br>${detailsHtml}`,
        actionUrl: meetupUrl,
        actionText: 'View Meetup',
      }),
      text: generateNotificationEmailText({
        title: `RSVP confirmed: ${meetupTitle}`,
        message: `Hi ${attendeeName} — your RSVP status is ${statusLabel}. ${statusNote}\n\n${details}`,
        actionUrl: meetupUrl,
        actionText: 'View Meetup',
      }),
    });
    if (error) logError('EMAIL_MEETUP_RSVP', error, { to, meetupId, status });
  } catch (err) {
    logError('EMAIL_MEETUP_RSVP', err, { to, meetupId, status });
  }
}

/**
 * Sends a "starting soon" reminder email to a meetup attendee.
 * Gracefully degrades — logs but does not throw on failure.
 * @param to - Recipient email address
 * @param attendeeName - Recipient's display name
 * @param hostName - Name of the meetup host
 * @param meetupTitle - Title of the meetup
 * @param meetupDate - Formatted date string of the meetup
 * @param meetupVenueName - Name of the venue where the meetup will be held
 * @param minutesUntil - How many minutes until the meetup starts (used in subject line)
 * @param meetupId - Unique identifier for the meetup (used to build the URL)
 * @returns Promise that resolves when the attempt completes (never rejects)
 */
export async function sendMeetupStartingSoonEmail(params: {
  to: string;
  attendeeName: string;
  hostName: string;
  meetupTitle: string;
  meetupDate: string;
  meetupVenueName: string;
  minutesUntil: number;
  meetupId: string;
}): Promise<void> {
  const { to, attendeeName, hostName, meetupTitle, meetupDate, meetupVenueName, minutesUntil, meetupId } = params;
  if (!resend) {
    logError('EMAIL_MEETUP_STARTING_SOON', new Error('Email service not configured'), { to, meetupId });
    return;
  }
  const meetupUrl = `${APP_URL}/meetups/${meetupId}`;
  const details = `When: ${meetupDate}\nWhere: ${meetupVenueName}`;
  const detailsHtml = `<strong>When:</strong> ${meetupDate}<br><strong>Where:</strong> ${meetupVenueName}`;
  try {
    const { error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: `${meetupTitle} is starting in ~${minutesUntil} minutes`,
      html: generateNotificationEmailHtml({
        title: `Starting soon: ${meetupTitle}`,
        message: `Hi ${attendeeName} — heads up, ${hostName}'s meetup is kicking off in ~${minutesUntil} minutes.<br><br>${detailsHtml}`,
        actionUrl: meetupUrl,
        actionText: 'View Meetup',
      }),
      text: generateNotificationEmailText({
        title: `Starting soon: ${meetupTitle}`,
        message: `Hi ${attendeeName} — heads up, ${hostName}'s meetup is kicking off in ~${minutesUntil} minutes.\n\n${details}`,
        actionUrl: meetupUrl,
        actionText: 'View Meetup',
      }),
    });
    if (error) logError('EMAIL_MEETUP_STARTING_SOON', error, { to, meetupId });
  } catch (err) {
    logError('EMAIL_MEETUP_STARTING_SOON', err, { to, meetupId });
  }
}
