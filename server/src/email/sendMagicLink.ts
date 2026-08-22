import { resend } from './resendClient';

// With no RESEND_API_KEY configured (see .env.example), links print to the console instead of
// being emailed — the whole auth flow is testable locally before an email account exists.
export async function sendMagicLinkEmail(email: string, link: string): Promise<void> {
  if (!resend) {
    console.log(`[dev email] Magic link for ${email}: ${link}`);
    return;
  }
  const { error } = await resend.emails.send({
    from: 'Chowka Bhara <onboarding@resend.dev>',
    to: email,
    subject: 'Your Chowka Bhara sign-in link',
    html: `<p>Click below to sign in:</p><p><a href="${link}">${link}</a></p><p>This link expires in 15 minutes.</p>`,
  });
  // The Resend SDK resolves with { error } instead of throwing on API-level failures (e.g. the
  // sandbox "verify a domain" restriction) — without this check, a failed send silently reports
  // success (202) to the caller.
  if (error) throw new Error(`Resend failed to send magic link: ${error.message}`);
}
