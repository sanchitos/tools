import { env, isProd } from '../config/env.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';

/**
 * Transactional email via the Resend REST API. No new npm dependency — Node 24
 * ships `fetch`, and one POST is the entire surface we need.
 *
 * We send the confirmation email OURSELVES rather than letting Supabase do it:
 * `db.auth.admin.generateLink()` creates the user and hands back the token
 * *without* sending anything, so the template lives in this repo and the only
 * mail config is the two env vars below — no Supabase dashboard SMTP setup.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send a message. Returns false when email is not configured, which is a
 * supported *local* state: the caller logs what it would have sent so the
 * signup loop is testable before a Resend domain exists. In production an
 * unconfigured mailer is a misconfiguration, not a mode, so it throws.
 */
export async function sendEmail({ to, subject, html }: EmailMessage): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (isProd) throw AppError.Internal('Email is not configured');
    logger.warn({ to, subject }, 'email not sent — RESEND_API_KEY/EMAIL_FROM unset');
    return false;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    logger.error({ to, status: res.status, detail }, 'Resend rejected the message');
    throw AppError.Internal('Could not send the confirmation email');
  }
  return true;
}

/** Drill Navy / Safety Orange, inline-styled — email clients ignore <style>. */
function confirmationHtml(link: string, fullName: string | null): string {
  const greeting = fullName ? `Hi ${escapeHtml(fullName)},` : 'Hi,';
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1b1f24">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">
    <tr><td style="background:#0f2942;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px">TOOLS JAMAICA</td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 12px;font-size:16px">${greeting}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5">Confirm your email address to finish setting up your Tools Jamaica account.</p>
      <p style="margin:0 0 24px">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#f47b20;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:4px">Confirm my email</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b6570">Or paste this link into your browser:</p>
      <p style="margin:0 0 20px;font-size:13px;word-break:break-all"><a href="${escapeHtml(link)}" style="color:#0f2942">${escapeHtml(link)}</a></p>
      <p style="margin:0;font-size:13px;color:#5b6570">If you didn't create this account you can ignore this email.</p>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send the signup confirmation. When email isn't configured the link is logged
 * at info level instead — that line IS the local dev flow (paste it in the
 * browser), so it is deliberately not buried inside the HTML blob.
 */
export async function sendConfirmationEmail(
  to: string,
  link: string,
  fullName: string | null = null,
): Promise<void> {
  const delivered = await sendEmail({
    to,
    subject: 'Confirm your Tools Jamaica account',
    html: confirmationHtml(link, fullName),
  });
  if (!delivered) logger.info({ to, link }, 'confirmation link (email not configured)');
}
