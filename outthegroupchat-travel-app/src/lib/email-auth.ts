/**
 * @module email-auth
 * Auth email functions for OutTheGroupchat — social/meetup-centric tone.
 * Covers: welcome, email verification, password reset.
 * Imported by email.ts and re-exported so all callers can use '@/lib/email'.
 */
import { Resend } from 'resend';
import { logError, logSuccess } from '@/lib/logger';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const DEFAULT_FROM =
  process.env.EMAIL_FROM || 'OutTheGroupchat <noreply@outthegroupchat.com>';
const APP_URL = process.env.NEXTAUTH_URL || 'https://outthegroupchat.com';

// ---------------------------------------------------------------------------
// Shared layout helpers
// ---------------------------------------------------------------------------

function headerHtml(subtitle: string): string {
  return `
    <tr>
      <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">OutTheGroupchat</h1>
        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">${subtitle}</p>
      </td>
    </tr>`;
}

function simpleHeaderHtml(): string {
  return `
    <tr>
      <td style="padding: 30px 40px 20px; text-align: center; border-bottom: 1px solid #e5e7eb;">
        <h1 style="margin: 0; color: #10b981; font-size: 24px; font-weight: 700;">OutTheGroupchat</h1>
      </td>
    </tr>`;
}

function footerHtml(note: string): string {
  return `
    <tr>
      <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">${note}</p>
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">&copy; ${new Date().getFullYear()} OutTheGroupchat. All rights reserved.</p>
      </td>
    </tr>`;
}

function ctaButtonHtml(url: string, label: string): string {
  return `
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center">
          <a href="${url}" style="display: inline-block; padding: 14px 28px; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

function emailWrapper(rows: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          ${rows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// sendWelcomeEmail
// ---------------------------------------------------------------------------

/**
 * Send a welcome email to a newly signed-up user.
 * Focuses on Crew discovery and meeting up IRL.
 */
export async function sendWelcomeEmail(params: {
  to: string;
  name: string | null;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, name } = params;

  if (!resend) {
    return { success: false, error: 'Email service not configured' };
  }

  const crewUrl = `${APP_URL}/crew`;
  const greeting = name ? `Hey ${name}` : 'Hey';

  const html = emailWrapper(
    headerHtml('The social app that gets you off your phone') +
    `<tr><td style="padding: 40px;">
      <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 24px; font-weight: 600;">${greeting} — welcome to the group</h2>
      <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
        You're in. OutTheGroupchat is where your real-life social life lives — meetups, check-ins, and the people who actually show up.
      </p>
      <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Start by building your Crew — the people you grab food with, explore the city with, and get off the couch for.
      </p>
      ${ctaButtonHtml(crewUrl, 'Find Your Crew')}
    </td></tr>` +
    footerHtml('You signed up for OutTheGroupchat.')
  );

  const text = `${greeting} — welcome to OutTheGroupchat.\n\nYou're in. OutTheGroupchat is where your real-life social life lives — meetups, check-ins, and the people who actually show up.\n\nStart by building your Crew — the people you grab food with, explore the city with, and get off the couch for.\n\nFind your Crew: ${crewUrl}\n\n---\n© ${new Date().getFullYear()} OutTheGroupchat. All rights reserved.`;

  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: 'Welcome to OutTheGroupchat — your Crew is waiting',
      html,
      text,
    });

    if (error) {
      logError('EMAIL_WELCOME', error, { to });
      return { success: false, error: error.message };
    }

    logSuccess('EMAIL_WELCOME', 'Welcome email sent', { to, messageId: data?.id });
    return { success: true, messageId: data?.id };
  } catch (err) {
    logError('EMAIL_WELCOME', err, { to });
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
  }
}

// ---------------------------------------------------------------------------
// sendAuthVerificationEmail
// ---------------------------------------------------------------------------

/**
 * Send an email verification link to a newly signed-up user.
 * Functional parts (verification URL, 24-hour expiry) are preserved.
 */
export async function sendAuthVerificationEmail(params: {
  to: string;
  verifyUrl: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, verifyUrl } = params;

  if (!resend) {
    return { success: false, error: 'Email service not configured' };
  }

  const html = emailWrapper(
    simpleHeaderHtml() +
    `<tr><td style="padding: 40px;">
      <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px; font-weight: 600;">Verify your email</h2>
      <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
        You're almost there. Tap the button below to confirm your email and unlock everything — meetups, check-ins, your Crew.
      </p>
      <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">This link expires in 24 hours.</p>
      ${ctaButtonHtml(verifyUrl, 'Verify Email')}
    </td></tr>` +
    footerHtml("Didn't sign up? You can safely ignore this email.")
  );

  const text = `Verify your OutTheGroupchat email\n\nYou're almost there. Tap the link below to confirm your email and unlock everything — meetups, check-ins, your Crew.\n\nThis link expires in 24 hours.\n\nVerify here: ${verifyUrl}\n\n---\nDidn't sign up? You can safely ignore this email.\n© ${new Date().getFullYear()} OutTheGroupchat. All rights reserved.`;

  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: 'One quick thing — verify your OutTheGroupchat email',
      html,
      text,
    });

    if (error) {
      logError('EMAIL_VERIFY', error, { to });
      return { success: false, error: error.message };
    }

    logSuccess('EMAIL_VERIFY', 'Verification email sent', { to, messageId: data?.id });
    return { success: true, messageId: data?.id };
  } catch (err) {
    logError('EMAIL_VERIFY', err, { to });
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
  }
}

// ---------------------------------------------------------------------------
// sendPasswordResetEmail
// ---------------------------------------------------------------------------

/**
 * Send a password reset email.
 * Functional parts (reset URL, 1-hour expiry) are preserved.
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  name: string | null;
  resetUrl: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, name, resetUrl } = params;

  if (!resend) {
    return { success: false, error: 'Email service not configured' };
  }

  const greeting = name ? `Hey ${name}` : 'Hey';

  const html = emailWrapper(
    simpleHeaderHtml() +
    `<tr><td style="padding: 40px;">
      <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px; font-weight: 600;">Reset your password</h2>
      <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
        ${greeting} — someone (hopefully you) asked to reset the password on your OutTheGroupchat account.
      </p>
      <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Hit the button below to set a new one. This link expires in 1 hour.
      </p>
      ${ctaButtonHtml(resetUrl, 'Reset Password')}
      <p style="margin: 24px 0 0; color: #9ca3af; font-size: 13px; text-align: center;">Or copy this link: ${resetUrl}</p>
    </td></tr>` +
    footerHtml("Didn't request this? You can safely ignore this email.")
  );

  const text = `${greeting} — someone (hopefully you) asked to reset the password on your OutTheGroupchat account.\n\nHit the link below to set a new one. This link expires in 1 hour.\n\nReset your password: ${resetUrl}\n\n---\nDidn't request this? You can safely ignore this email.\n© ${new Date().getFullYear()} OutTheGroupchat. All rights reserved.`;

  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: 'Reset your OutTheGroupchat password',
      html,
      text,
    });

    if (error) {
      logError('EMAIL_PASSWORD_RESET', error, { to });
      return { success: false, error: error.message };
    }

    logSuccess('EMAIL_PASSWORD_RESET', 'Password reset email sent', { to, messageId: data?.id });
    return { success: true, messageId: data?.id };
  } catch (err) {
    logError('EMAIL_PASSWORD_RESET', err, { to });
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
  }
}
